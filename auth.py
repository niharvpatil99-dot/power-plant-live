"""
Employee Authentication and Excel Management Layer
For Live Power Plant Performance Analysis & Monitoring System
- Connects to employees.xlsx
- Auto-reloads on file modification
- Secure hashing with werkzeug.security
- Role-based permissions (Admin, Operator, Viewer)
- In-memory session management with token expiry
"""

import os
import time
import secrets
import threading
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from werkzeug.security import generate_password_hash, check_password_hash

# Locate employees.xlsx across possible locations (flat root or nested backend)
def find_excel_path():
    env_p = os.environ.get("EMPLOYEES_EXCEL_PATH")
    if env_p and os.path.exists(env_p):
        return env_p
    
    curr = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(curr, "employees.xlsx"),
        os.path.join(os.path.dirname(curr), "employees.xlsx"),
        os.path.join(curr, "database", "employees.xlsx"),
        os.path.join(os.path.dirname(curr), "database", "employees.xlsx"),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    
    # Default to project root or current folder
    target = os.path.join(os.path.dirname(curr), "employees.xlsx")
    if not os.path.exists(os.path.dirname(target)):
        target = os.path.join(curr, "employees.xlsx")
    return target

EXCEL_PATH = find_excel_path()
_cache_lock = threading.RLock()
_employees_cache = {}
_last_mtime = 0.0
_sessions = {}  # token -> session_data

def init_excel_if_missing():
    """Generates initial employees.xlsx if it does not already exist"""
    global EXCEL_PATH
    if os.path.exists(EXCEL_PATH):
        return
    
    os.makedirs(os.path.dirname(EXCEL_PATH), exist_ok=True)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Employees"

    # Styling
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")
    align_left = Alignment(horizontal="left", vertical="center")

    headers = ["Employee ID", "Employee Name", "Password", "Role", "Status"]
    ws.append(headers)

    # Style header row
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center
        cell.border = Border(bottom=Side(style="medium", color="38BDF8"))
    ws.row_dimensions[1].height = 28

    # Initial authorized personnel with hashed passwords
    initial_users = [
        ("EMP-1001", "Vikram Malhotra", generate_password_hash("Admin@500MW"), "Admin", "Active"),
        ("EMP-2002", "Sanjay Verma", generate_password_hash("Operator@500MW"), "Operator", "Active"),
        ("EMP-3003", "Ananya Sharma", generate_password_hash("Viewer@500MW"), "Viewer", "Active"),
        ("EMP-4004", "Rajesh Gupta", generate_password_hash("Operator@500MW"), "Operator", "Active"),
        ("EMP-9999", "Former Employee (Terminated)", generate_password_hash("Inactive@500MW"), "Operator", "Inactive"),
    ]

    for row_idx, user in enumerate(initial_users, start=2):
        ws.append(list(user))
        ws.row_dimensions[row_idx].height = 22
        for col_idx in range(1, 6):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.alignment = align_left if col_idx <= 2 else align_center
            if user[4] == "Active" and col_idx == 5:
                cell.font = Font(color="10B981", bold=True)
            elif user[4] == "Inactive" and col_idx == 5:
                cell.font = Font(color="EF4444", bold=True)

    # Column widths
    ws.column_dimensions["A"].width = 18
    ws.column_dimensions["B"].width = 30
    ws.column_dimensions["C"].width = 50
    ws.column_dimensions["D"].width = 16
    ws.column_dimensions["E"].width = 16

    wb.save(EXCEL_PATH)
    print(f"Generated authorized personnel spreadsheet at: {EXCEL_PATH}")

def load_employees_from_excel(force=False):
    """
    Reads employees.xlsx and updates in-memory cache.
    Automatically detects if the file was modified on disk.
    """
    global _employees_cache, _last_mtime, EXCEL_PATH
    init_excel_if_missing()

    if not os.path.exists(EXCEL_PATH):
        return {}

    current_mtime = os.path.getmtime(EXCEL_PATH)
    if not force and current_mtime == _last_mtime and _employees_cache:
        return _employees_cache

    with _cache_lock:
        # Re-check inside lock
        if not force and current_mtime == _last_mtime and _employees_cache:
            return _employees_cache

        try:
            wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
            ws = wb.active
            records = {}

            # Read rows skipping header
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or not row[0]:
                    continue
                emp_id = str(row[0]).strip().upper()
                name = str(row[1]).strip() if len(row) > 1 and row[1] else "Authorized Employee"
                pwd = str(row[2]).strip() if len(row) > 2 and row[2] else ""
                role = str(row[3]).strip().title() if len(row) > 3 and row[3] else "Viewer"
                status = str(row[4]).strip().title() if len(row) > 4 and row[4] else "Active"

                if role not in ["Admin", "Operator", "Viewer"]:
                    role = "Viewer"
                if status not in ["Active", "Inactive"]:
                    status = "Active"

                records[emp_id] = {
                    "employee_id": emp_id,
                    "name": name,
                    "password_hash": pwd,
                    "role": role,
                    "status": status
                }

            _employees_cache = records
            _last_mtime = current_mtime
            print(f"Loaded {len(records)} employee records from {os.path.basename(EXCEL_PATH)} (mtime: {time.ctime(current_mtime)})")
        except Exception as e:
            print(f"Error reading {EXCEL_PATH}: {e}")
            if not _employees_cache:
                _employees_cache = {}

        return _employees_cache

def authenticate_employee(emp_id, plain_password):
    """
    Authenticates employee against live Excel data.
    Returns (success, result_dict_or_error_message)
    """
    if not emp_id or not plain_password:
        return False, "Employee ID and Password are required."

    emp_id = str(emp_id).strip().upper()
    employees = load_employees_from_excel()

    if emp_id not in employees:
        return False, "Access Denied: Invalid Employee ID or credentials."

    emp = employees[emp_id]

    # Check Active/Inactive status
    if emp["status"].lower() != "active":
        return False, "Access Denied: Your employee account has been marked INACTIVE. Contact Plant Administrator."

    stored_pwd = emp["password_hash"]
    password_valid = False

    # Check hashed or fallback plain text (if admin manually typed plain text in Excel)
    if stored_pwd.startswith("scrypt:") or stored_pwd.startswith("pbkdf2:"):
        try:
            password_valid = check_password_hash(stored_pwd, plain_password)
        except Exception:
            password_valid = False
    else:
        # Plain text in Excel - constant time comparison
        password_valid = secrets.compare_digest(stored_pwd, plain_password)
        # If plain text matched, auto-hash and save back for security!
        if password_valid:
            try:
                save_or_update_employee(emp_id, emp["name"], plain_password, emp["role"], emp["status"])
            except Exception as e:
                print("Could not auto-hash plain password in Excel:", e)

    if not password_valid:
        return False, "Access Denied: Incorrect Password. Please verify your credentials."

    # Generate secure 24-byte session token
    token = secrets.token_hex(24)
    session_data = {
        "token": token,
        "employee_id": emp["employee_id"],
        "name": emp["name"],
        "role": emp["role"],
        "status": emp["status"],
        "created_at": time.time(),
        "expires_at": time.time() + (24 * 3600)  # 24 hours valid
    }

    with _cache_lock:
        _sessions[token] = session_data

    return True, session_data

def get_session(token):
    """Validates session token and returns session dict or None"""
    if not token:
        return None
    with _cache_lock:
        sess = _sessions.get(token)
        if not sess:
            return None
        # Check expiry
        if time.time() > sess["expires_at"]:
            del _sessions[token]
            return None
        return sess

def destroy_session(token):
    """Logs out by removing session token"""
    if not token:
        return
    with _cache_lock:
        if token in _sessions:
            del _sessions[token]

def get_all_employees_sanitized():
    """Returns list of employees with passwords removed for Admin Directory view"""
    employees = load_employees_from_excel()
    sanitized = []
    for emp_id, data in employees.items():
        sanitized.append({
            "employee_id": data["employee_id"],
            "name": data["name"],
            "role": data["role"],
            "status": data["status"],
            "is_active": data["status"] == "Active"
        })
    # Sort with Admin first, then Operator, then Viewer
    role_order = {"Admin": 0, "Operator": 1, "Viewer": 2}
    sanitized.sort(key=lambda x: (role_order.get(x["role"], 3), x["employee_id"]))
    return sanitized

def save_or_update_employee(emp_id, name, plain_password, role, status):
    """
    Adds or updates an employee in employees.xlsx with hashed password.
    Returns (success, message)
    """
    global EXCEL_PATH
    emp_id = str(emp_id).strip().upper()
    name = str(name).strip()
    role = str(role).strip().title()
    status = str(status).strip().title()

    if not emp_id or not name:
        return False, "Employee ID and Name cannot be empty."

    if role not in ["Admin", "Operator", "Viewer"]:
        role = "Operator"
    if status not in ["Active", "Inactive"]:
        status = "Active"

    init_excel_if_missing()

    with _cache_lock:
        try:
            wb = openpyxl.load_workbook(EXCEL_PATH)
            ws = wb.active

            row_found = None
            for row in range(2, ws.max_row + 1):
                cell_id = ws.cell(row=row, column=1).value
                if cell_id and str(cell_id).strip().upper() == emp_id:
                    row_found = row
                    break

            # Hash new password if provided, or retain existing hash
            if plain_password and plain_password.strip():
                pwd_hash = generate_password_hash(plain_password.strip())
            elif row_found:
                pwd_hash = ws.cell(row=row_found, column=3).value
            else:
                return False, "Password is required for newly added employee."

            target_row = row_found if row_found else (ws.max_row + 1)

            ws.cell(row=target_row, column=1, value=emp_id)
            ws.cell(row=target_row, column=2, value=name)
            ws.cell(row=target_row, column=3, value=pwd_hash)
            ws.cell(row=target_row, column=4, value=role)
            ws.cell(row=target_row, column=5, value=status)

            # Styling
            ws.row_dimensions[target_row].height = 22
            align_left = Alignment(horizontal="left", vertical="center")
            align_center = Alignment(horizontal="center", vertical="center")
            ws.cell(row=target_row, column=1).alignment = align_center
            ws.cell(row=target_row, column=2).alignment = align_left
            ws.cell(row=target_row, column=3).alignment = align_left
            ws.cell(row=target_row, column=4).alignment = align_center
            status_cell = ws.cell(row=target_row, column=5)
            status_cell.alignment = align_center
            status_cell.font = Font(color="10B981" if status == "Active" else "EF4444", bold=True)

            wb.save(EXCEL_PATH)
            # Force cache reload
            load_employees_from_excel(force=True)
            action = "Updated" if row_found else "Added"
            return True, f"Successfully {action} employee {emp_id} ({name}) in employees.xlsx."
        except Exception as e:
            return False, f"Failed to write to {EXCEL_PATH}: {str(e)}"

# Pre-load on import
init_excel_if_missing()
load_employees_from_excel()
