// Initial State
let customers = [];
let currentFilter = 'all';
let searchQuery = '';
let selectedCustomerId = null;

// DOM Elements
const dashTotalPending = document.getElementById('dashTotalPending');
const dashTotalCollected = document.getElementById('dashTotalCollected');
const dashTotalCustomers = document.getElementById('dashTotalCustomers');
const dashMonthlyEarning = document.getElementById('dashMonthlyEarning');
const customerList = document.getElementById('customerList');

// Modals
const addCustomerModal = document.getElementById('addCustomerModal');
const updateOrderModal = document.getElementById('updateOrderModal');
const earningsModal = document.getElementById('earningsModal');
const customersModal = document.getElementById('customersModal');

// Forms & Inputs (Add Customer)
const addCustomerForm = document.getElementById('addCustomerForm');
const dressItemsContainer = document.getElementById('dressItemsContainer');
const addDressItemBtn = document.getElementById('addDressItemBtn');
const totalAmountInput = document.getElementById('totalAmount');
const paidAmountInput = document.getElementById('paidAmount');
const pendingAmountInput = document.getElementById('pendingAmount');

// Forms & Inputs (Update Order)
const updateDressItemsContainer = document.getElementById('updateDressItemsContainer');
const updateAddDressItemBtn = document.getElementById('updateAddDressItemBtn');

// Initialize App
async function init() {
    setupEventListeners();
    await fetchData();
    
    // Add one empty dress item by default if form is empty
    if(dressItemsContainer.children.length === 0) {
        addDressItem(dressItemsContainer);
    }
}

// Data Management
async function fetchData() {
    try {
        const dashRes = await fetch('/api/dashboard');
        const dashStats = await dashRes.json();
        renderDashboard(dashStats);

        const custRes = await fetch('/api/customers');
        customers = await custRes.json();
        renderCustomerList();
    } catch (err) {
        console.error("Failed to fetch data. Is the backend running?", err);
        if (customers.length === 0) {
            customerList.innerHTML = `<div class="empty-state"><h3>Cannot connect to database</h3><p>Please ensure python app.py is running.</p></div>`;
        }
    }
}

// Rendering
function renderDashboard(stats) {
    if (!stats) return;
    dashTotalPending.textContent = `₹${stats.totalPending}`;
    dashTotalCollected.textContent = `₹${stats.totalCollected}`;
    dashTotalCustomers.textContent = stats.totalCustomers;
    if (dashMonthlyEarning) {
        dashMonthlyEarning.textContent = `₹${stats.monthlyEarning}`;
    }
}

function renderCustomerList() {
    customerList.innerHTML = '';

    // Apply Filter & Search
    let filtered = customers.filter(c => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = c.name.toLowerCase().includes(query) || (c.phone && c.phone.includes(query));
        
        let matchesFilter = true;
        if (currentFilter === 'pending') {
            matchesFilter = c.pendingAmount > 0;
        } else if (currentFilter === 'paid') {
            matchesFilter = c.pendingAmount === 0;
        }

        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        customerList.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-users-three"></i>
                <h3>No customers found</h3>
                <p>Add a new entry or adjust your filters.</p>
            </div>
        `;
        return;
    }

    filtered.forEach(c => {
        const isPending = c.pendingAmount > 0;
        const isHighPending = c.pendingAmount >= 1000;
        const dateStr = new Date(c.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        
        let dressPreview = c.dressItems.map(d => `${d.name}`).join(', ');
        if(dressPreview.length > 30) dressPreview = dressPreview.substring(0, 30) + '...';

        const card = document.createElement('div');
        card.className = `customer-card ${isHighPending ? 'high-pending' : ''}`;
        card.style.cursor = 'pointer';
        card.onclick = () => openCustomerDetailsModal(c.id);
        card.innerHTML = `
            <div class="card-header">
                <div>
                    <h3 class="cust-name">${c.name}</h3>
                    ${c.phone ? `<p class="cust-phone"><i class="ph ph-phone"></i> ${c.phone}</p>` : ''}
                </div>
                <span class="badge ${isPending ? 'badge-pending' : 'badge-paid'}">${isPending ? 'Pending' : 'Paid'}</span>
            </div>
            
            <div class="card-body">
                <div class="amt-block">
                    <span class="amt-label">Total Amount</span>
                    <span class="amt-val">₹${c.totalAmount}</span>
                </div>
                <div class="amt-block">
                    <span class="amt-label">Pending</span>
                    <span class="amt-val ${isPending ? 'pending' : 'paid'}">₹${c.pendingAmount}</span>
                </div>
                ${dressPreview ? `<div class="dress-list-preview"><i class="ph ph-scissors"></i> ${dressPreview}</div>` : ''}
            </div>
            
            <div class="card-footer">
                <span class="date-text">${dateStr}</span>
                <div class="card-actions">
                    ${c.phone ? `<button class="btn btn-icon btn-whatsapp" onclick="event.stopPropagation(); openWhatsApp('${c.phone}', '${c.name}', ${c.pendingAmount})" title="Send Reminder"><i class="ph ph-whatsapp-logo"></i></button>` : ''}
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); openUpdateModal(${c.id})">Update</button>
                    <button class="btn btn-icon btn-text text-danger" onclick="event.stopPropagation(); deleteCustomer(${c.id})" title="Delete"><i class="ph ph-trash"></i></button>
                </div>
            </div>
        `;
        customerList.appendChild(card);
    });
}

// Dynamic Forms Logic
function addDressItem(container) {
    const row = document.createElement('div');
    row.className = 'dress-item-row';
    row.innerHTML = `
        <input type="text" placeholder="Item name (e.g. Shirt)" class="dress-name" required>
        <input type="number" placeholder="Price" class="dress-price" min="0" required oninput="calculateFormTotals()">
        <button type="button" class="remove-item-btn" onclick="this.parentElement.remove(); calculateFormTotals();"><i class="ph ph-trash"></i></button>
    `;
    container.appendChild(row);
}

function calculateFormTotals() {
    let total = 0;
    const priceInputs = dressItemsContainer.querySelectorAll('.dress-price');
    priceInputs.forEach(input => {
        total += Number(input.value) || 0;
    });

    totalAmountInput.value = total;
    
    let paid = Number(paidAmountInput.value) || 0;
    
    if (paid > total) {
        paid = total;
        paidAmountInput.value = paid;
    }

    pendingAmountInput.value = total - paid;
}

// Form Submission
async function handleAddCustomer(e) {
    e.preventDefault();
    
    const name = document.getElementById('custName').value;
    const phone = document.getElementById('custPhone').value;
    
    const dressItems = [];
    const itemRows = dressItemsContainer.querySelectorAll('.dress-item-row');
    itemRows.forEach(row => {
        const itemName = row.querySelector('.dress-name').value;
        const itemPrice = Number(row.querySelector('.dress-price').value) || 0;
        if(itemName) {
            dressItems.push({ name: itemName, price: itemPrice });
        }
    });

    const totalAmount = Number(totalAmountInput.value) || 0;
    const paidAmount = Number(paidAmountInput.value) || 0;

    const payload = {
        name,
        phone,
        dressItems,
        totalAmount,
        paidAmount
    };

    try {
        const res = await fetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            closeModal('addCustomerModal');
            addCustomerForm.reset();
            dressItemsContainer.innerHTML = '';
            addDressItem(dressItemsContainer);
            calculateFormTotals();
            await fetchData();
        } else {
            alert("Failed to save entry.");
        }
    } catch (err) {
        console.error(err);
        alert("Error saving data. Is backend running?");
    }
}

// Update Order Logic
function openUpdateModal(id) {
    selectedCustomerId = id;
    const customer = customers.find(c => c.id === id);
    if(!customer) return;

    document.getElementById('updateCustName').textContent = customer.name;
    document.getElementById('updateCurrentPending').textContent = customer.pendingAmount;
    document.getElementById('newPaymentAmount').value = '0';
    document.getElementById('newPaymentAmount').max = customer.pendingAmount;
    
    updateDressItemsContainer.innerHTML = '';

    openModal('updateOrderModal');
}

async function handleUpdateOrder() {
    const amountToAdd = Number(document.getElementById('newPaymentAmount').value) || 0;
    
    const dressItems = [];
    let itemsTotal = 0;
    const itemRows = updateDressItemsContainer.querySelectorAll('.dress-item-row');
    itemRows.forEach(row => {
        const itemName = row.querySelector('.dress-name').value;
        const itemPrice = Number(row.querySelector('.dress-price').value) || 0;
        if(itemName) {
            dressItems.push({ name: itemName, price: itemPrice });
            itemsTotal += itemPrice;
        }
    });

    if (amountToAdd === 0 && dressItems.length === 0) {
        alert("Please add a new item or a payment amount.");
        return;
    }

    try {
        const res = await fetch(`/api/customers/${selectedCustomerId}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                amount: amountToAdd,
                dressItems: dressItems,
                itemsTotal: itemsTotal
            })
        });

        if (res.ok) {
            closeModal('updateOrderModal');
            await fetchData();
        } else {
            const err = await res.json();
            alert("Failed to update: " + err.error);
        }
    } catch (err) {
        console.error(err);
        alert("Error updating order.");
    }
}

// View Modals Logic
async function openEarningsModal() {
    openModal('earningsModal');
    const list = document.getElementById('earningsList');
    list.innerHTML = '<li>Loading...</li>';
    
    try {
        const res = await fetch('/api/earnings/history');
        const history = await res.json();
        
        list.innerHTML = '';
        if(Object.keys(history).length === 0) {
            list.innerHTML = '<li>No earnings recorded yet.</li>';
        } else {
            for(const [month, amount] of Object.entries(history)) {
                list.innerHTML += `
                    <li style="display: flex; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border);">
                        <strong>${month}</strong>
                        <span class="text-success" style="font-weight: 600;">₹${amount}</span>
                    </li>
                `;
            }
        }
    } catch(err) {
        list.innerHTML = '<li>Error loading data.</li>';
    }
}

function openCustomersModal() {
    openModal('customersModal');
    const tbody = document.getElementById('customersTableBody');
    tbody.innerHTML = '';
    
    if(customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 1rem;">No customers found</td></tr>';
        return;
    }

    customers.forEach(c => {
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--border); cursor: pointer;" onclick="closeModal('customersModal'); openCustomerDetailsModal(${c.id});">
                <td style="padding: 0.5rem; font-weight: 500;">${c.name}</td>
                <td style="padding: 0.5rem; color: var(--text-muted);">${c.phone || '-'}</td>
                <td style="padding: 0.5rem; color: var(--success);">₹${c.paidAmount}</td>
                <td style="padding: 0.5rem; color: var(--danger);">₹${c.pendingAmount}</td>
            </tr>
        `;
    });
}

function openCustomerDetailsModal(id) {
    const customer = customers.find(c => c.id === id);
    if(!customer) return;

    document.getElementById('detailCustName').textContent = customer.name;
    document.getElementById('detailCustPhone').textContent = customer.phone ? `📞 ${customer.phone}` : 'No phone number';
    document.getElementById('detailTotalAmount').textContent = `₹${customer.totalAmount}`;
    document.getElementById('detailPaidAmount').textContent = `₹${customer.paidAmount}`;
    document.getElementById('detailPendingAmount').textContent = `₹${customer.pendingAmount}`;

    const dressList = document.getElementById('detailDressItems');
    dressList.innerHTML = '';
    if(customer.dressItems && customer.dressItems.length > 0) {
        customer.dressItems.forEach(item => {
            dressList.innerHTML += `
                <li style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                    <span>${item.name}</span>
                    <span style="font-weight: 500;">₹${item.price}</span>
                </li>
            `;
        });
    } else {
        dressList.innerHTML = '<li class="text-muted">No items recorded.</li>';
    }

    const payList = document.getElementById('detailPayments');
    payList.innerHTML = '';
    if(customer.payments && customer.payments.length > 0) {
        customer.payments.forEach(p => {
            const dateStr = new Date(p.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
            payList.innerHTML += `
                <li style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                    <span class="text-sm text-muted">${dateStr}</span>
                    <span class="text-success" style="font-weight: 500;">+ ₹${p.amount}</span>
                </li>
            `;
        });
    } else {
        payList.innerHTML = '<li class="text-muted">No payments recorded.</li>';
    }

    openModal('customerDetailsModal');
}

// Utilities
window.deleteCustomer = async function(id) {
    if(confirm('Are you sure you want to delete this entry?')) {
        try {
            const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
            if(res.ok) {
                await fetchData();
            } else {
                alert("Failed to delete.");
            }
        } catch (err) {
            console.error(err);
        }
    }
}

window.openWhatsApp = function(phone, name, pending) {
    const formattedPhone = phone.replace(/[^0-9]/g, '');
    let msg = `Hello ${name}, this is a gentle reminder regarding your pending payment of ₹${pending} at the Tailor Shop. Thank you!`;
    const encodedMsg = encodeURIComponent(msg);
    window.open(`https://wa.me/91${formattedPhone}?text=${encodedMsg}`, '_blank');
}

function exportToCSV() {
    if(customers.length === 0) {
        alert("No data to export");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Name,Phone,Items,Total Amount,Paid Amount,Pending Amount\n";

    customers.forEach(c => {
        const dateStr = new Date(c.date).toLocaleDateString('en-IN');
        const itemsStr = c.dressItems.map(d => `${d.name}`).join(' | ');
        const row = `"${dateStr}","${c.name}","${c.phone}","${itemsStr}",${c.totalAmount},${c.paidAmount},${c.pendingAmount}`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `TailorPay_Export_${new Date().toLocaleDateString('en-IN')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Modal Helpers
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Event Listeners Setup
function setupEventListeners() {
    // Top Action Buttons
    document.getElementById('openAddModalBtn').addEventListener('click', () => openModal('addCustomerModal'));
    document.getElementById('exportBtn').addEventListener('click', exportToCSV);

    // Dashboard Cards
    document.getElementById('monthlyEarningCard')?.addEventListener('click', openEarningsModal);
    document.getElementById('totalCustomersCard')?.addEventListener('click', openCustomersModal);

    // Close Modals
    document.getElementById('closeAddModalBtn').addEventListener('click', () => closeModal('addCustomerModal'));
    document.getElementById('cancelAddBtn').addEventListener('click', (e) => { e.preventDefault(); closeModal('addCustomerModal'); });
    
    document.getElementById('closeUpdateModalBtn').addEventListener('click', () => closeModal('updateOrderModal'));
    document.getElementById('cancelUpdateBtn').addEventListener('click', () => closeModal('updateOrderModal'));

    document.getElementById('closeEarningsModalBtn').addEventListener('click', () => closeModal('earningsModal'));
    document.getElementById('closeCustomersModalBtn').addEventListener('click', () => closeModal('customersModal'));
    document.getElementById('closeCustomerDetailsModalBtn').addEventListener('click', () => closeModal('customerDetailsModal'));

    // Forms
    addDressItemBtn.addEventListener('click', () => addDressItem(dressItemsContainer));
    paidAmountInput.addEventListener('input', calculateFormTotals);
    document.getElementById('saveCustomerBtn').addEventListener('click', (e) => {
        if(addCustomerForm.checkValidity()) {
            handleAddCustomer(e);
        } else {
            addCustomerForm.reportValidity();
        }
    });

    // Update Modal
    updateAddDressItemBtn.addEventListener('click', () => addDressItem(updateDressItemsContainer));
    document.getElementById('saveUpdateBtn').addEventListener('click', handleUpdateOrder);
    document.getElementById('markFullPaidBtn').addEventListener('click', () => {
        const customer = customers.find(c => c.id === selectedCustomerId);
        
        let itemsTotal = 0;
        const priceInputs = updateDressItemsContainer.querySelectorAll('.dress-price');
        priceInputs.forEach(input => {
            itemsTotal += Number(input.value) || 0;
        });

        if(customer) {
            document.getElementById('newPaymentAmount').value = customer.pendingAmount + itemsTotal;
        }
    });

    // Filters & Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderCustomerList();
    });

    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.getAttribute('data-filter');
            renderCustomerList();
        });
    });
}

// Run App
init();
