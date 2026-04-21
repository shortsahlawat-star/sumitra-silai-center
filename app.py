from flask import Flask, request, jsonify, send_from_directory, session
import sqlite3
import json
import os
from datetime import datetime
from functools import wraps

app = Flask(__name__, static_folder='.')
app.secret_key = 'tailor_app_secret_key_123'

# Default Admin Credentials
ADMIN_USERNAME = 'admin'
ADMIN_PASSWORD = 'admin678'

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function

DB_FILE = 'tailor.sqlite3'

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE COLLATE NOCASE,
            phone TEXT,
            items TEXT,
            payments TEXT,
            total_amount REAL,
            paid_amount REAL,
            pending_amount REAL,
            date_updated TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session['logged_in'] = True
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "Invalid username or password"}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('logged_in', None)
    return jsonify({"success": True})

@app.route('/api/check_auth', methods=['GET'])
def check_auth():
    if session.get('logged_in'):
        return jsonify({"logged_in": True})
    return jsonify({"logged_in": False})

@app.route('/api/customers', methods=['GET'])
@login_required
def get_customers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM customers ORDER BY date_updated DESC").fetchall()
    customers = []
    for r in rows:
        customers.append({
            'id': r['id'],
            'name': r['name'],
            'phone': r['phone'],
            'dressItems': json.loads(r['items']),
            'payments': json.loads(r['payments']),
            'totalAmount': r['total_amount'],
            'paidAmount': r['paid_amount'],
            'pendingAmount': r['pending_amount'],
            'date': r['date_updated']
        })
    conn.close()
    return jsonify(customers)

@app.route('/api/customers', methods=['POST'])
@login_required
def add_customer():
    data = request.json
    name = data.get('name').strip()
    phone = data.get('phone', '')
    new_items = data.get('dressItems', [])
    new_total = float(data.get('totalAmount', 0))
    new_paid = float(data.get('paidAmount', 0))
    date_now = datetime.now().isoformat()

    conn = get_db()
    existing = conn.execute("SELECT * FROM customers WHERE name = ? COLLATE NOCASE", (name,)).fetchone()

    if existing:
        # Update existing customer
        items = json.loads(existing['items'])
        items.extend(new_items)
        
        payments = json.loads(existing['payments'])
        if new_paid > 0:
            payments.append({'amount': new_paid, 'date': date_now})
            
        total_amount = existing['total_amount'] + new_total
        paid_amount = existing['paid_amount'] + new_paid
        pending_amount = total_amount - paid_amount

        conn.execute('''
            UPDATE customers SET 
                phone = ?, 
                items = ?, 
                payments = ?, 
                total_amount = ?, 
                paid_amount = ?, 
                pending_amount = ?, 
                date_updated = ?
            WHERE id = ?
        ''', (phone if phone else existing['phone'], json.dumps(items), json.dumps(payments), 
              total_amount, paid_amount, pending_amount, date_now, existing['id']))
    else:
        # Create new customer
        payments = []
        if new_paid > 0:
            payments.append({'amount': new_paid, 'date': date_now})
            
        pending_amount = new_total - new_paid
        conn.execute('''
            INSERT INTO customers (name, phone, items, payments, total_amount, paid_amount, pending_amount, date_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (name, phone, json.dumps(new_items), json.dumps(payments), new_total, new_paid, pending_amount, date_now))

    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/customers/<int:cust_id>/update', methods=['POST'])
@login_required
def update_customer_entry(cust_id):
    data = request.json
    amount_to_add = float(data.get('amount', 0))
    new_items = data.get('dressItems', [])
    new_items_total = float(data.get('itemsTotal', 0))
    date_now = datetime.now().isoformat()

    if amount_to_add < 0 or new_items_total < 0:
        return jsonify({"error": "Invalid amounts"}), 400

    conn = get_db()
    customer = conn.execute("SELECT * FROM customers WHERE id = ?", (cust_id,)).fetchone()
    if not customer:
        conn.close()
        return jsonify({"error": "Customer not found"}), 404

    # Update Payments
    payments = json.loads(customer['payments'])
    if amount_to_add > 0:
        payments.append({'amount': amount_to_add, 'date': date_now})
    
    # Update Items
    items = json.loads(customer['items'])
    if new_items:
        items.extend(new_items)
        
    total_amount = customer['total_amount'] + new_items_total
    paid_amount = customer['paid_amount'] + amount_to_add
    pending_amount = total_amount - paid_amount

    conn.execute('''
        UPDATE customers SET 
            items = ?,
            payments = ?, 
            total_amount = ?,
            paid_amount = ?, 
            pending_amount = ?, 
            date_updated = ?
        WHERE id = ?
    ''', (json.dumps(items), json.dumps(payments), total_amount, paid_amount, pending_amount, date_now, cust_id))
    
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/customers/<int:cust_id>', methods=['DELETE'])
@login_required
def delete_customer(cust_id):
    conn = get_db()
    conn.execute("DELETE FROM customers WHERE id = ?", (cust_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/earnings/history', methods=['GET'])
@login_required
def earnings_history():
    conn = get_db()
    customers = conn.execute("SELECT payments FROM customers").fetchall()
    conn.close()
    
    history = {}
    for c in customers:
        payments = json.loads(c['payments'])
        for p in payments:
            month = p['date'][:7] # YYYY-MM
            history[month] = history.get(month, 0) + p['amount']
            
    # Sort by descending month
    sorted_history = dict(sorted(history.items(), key=lambda item: item[0], reverse=True))
    return jsonify(sorted_history)

@app.route('/api/dashboard', methods=['GET'])
@login_required
def dashboard_stats():
    conn = get_db()
    customers = conn.execute("SELECT * FROM customers").fetchall()
    
    total_pending = sum(c['pending_amount'] for c in customers)
    total_collected = sum(c['paid_amount'] for c in customers)
    total_customers = len(customers)
    
    # Calculate monthly earning
    current_month = datetime.now().strftime('%Y-%m')
    monthly_earning = 0
    
    for c in customers:
        payments = json.loads(c['payments'])
        for p in payments:
            if p['date'].startswith(current_month):
                monthly_earning += p['amount']

    conn.close()
    return jsonify({
        "totalPending": total_pending,
        "totalCollected": total_collected,
        "totalCustomers": total_customers,
        "monthlyEarning": monthly_earning
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)
