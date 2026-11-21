"""
Flask & Flask-SocketIO Server for Live Power Plant Monitoring System
Provides REST APIs, real-time WebSockets, database integration, and static frontend delivery.
"""

import os
import sys
import threading
import time

# Ensure backend directory is in sys.path regardless of execution directory (e.g. gunicorn)
CURR_DIR = os.path.dirname(os.path.abspath(__file__))
backend_subdir = os.path.join(CURR_DIR, "backend")
if os.path.exists(backend_subdir) and backend_subdir not in sys.path:
    sys.path.insert(0, backend_subdir)
if CURR_DIR not in sys.path:
    sys.path.insert(0, CURR_DIR)

from flask import Flask, jsonify, request, send_from_directory
from flask_socketio import SocketIO, emit

from database import (
    init_db, get_all_sensors, get_equipment_list, 
    get_active_alerts, acknowledge_alert, resolve_alert,
    get_30_day_summary, get_historical_data
)
from simulator import simulator
from mqtt_gateway import mqtt_gateway
from auth import (
    authenticate_employee, get_session, destroy_session,
    get_all_employees_sanitized, save_or_update_employee, EXCEL_PATH
)

# Setup Flask & SocketIO
# Detect FRONTEND_DIR dynamically (supports nested backend/frontend or flat root deployment)
curr_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(curr_dir)
if os.path.exists(os.path.join(parent_dir, "frontend")):
    FRONTEND_DIR = os.path.join(parent_dir, "frontend")
elif os.path.exists(os.path.join(curr_dir, "frontend")):
    FRONTEND_DIR = os.path.join(curr_dir, "frontend")
else:
    FRONTEND_DIR = curr_dir

app = Flask(__name__, static_folder=FRONTEND_DIR)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'powerplant-live-monitoring-secret-key-2026')

# Support async_mode via environment (defaults to threading or auto-detect for eventlet/gevent)
async_mode = os.environ.get("SOCKETIO_ASYNC_MODE", "threading")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode=async_mode)

# Initialize SQLite database on startup
init_db()

# --- BACKGROUND WEBSOCKET EMITTER ---
def websocket_broadcast_loop():
    """Continuously broadcasts live sensor snapshots to connected React clients via WebSockets"""
    while True:
        try:
            snapshot = simulator.get_snapshot()
            alerts = get_active_alerts()
            payload = {
                "timestamp": snapshot["state"]["timestamp"],
                "plant_mode": snapshot["state"]["plant_mode"],
                "simulation_status": snapshot["mode"],
                "kpis": snapshot["state"]["kpis"],
                "sensors": snapshot["state"]["sensors"],
                "equipment_status": snapshot["state"]["equipment_status"],
                "time_series": snapshot["time_series"],
                "active_alerts_count": len([a for a in alerts if a["status"] == "ACTIVE"]),
                "recent_alerts": alerts[:5]
            }
            socketio.emit("telemetry_update", payload)
        except Exception as e:
            print("WebSocket broadcast error:", e)
        time.sleep(2.5)

# Start WebSocket broadcast background thread
ws_thread = threading.Thread(target=websocket_broadcast_loop, daemon=True)
ws_thread.start()

# --- FRONTEND STATIC DELIVERY ---
@app.route("/")
def index():
    for candidate in [
        os.path.join(FRONTEND_DIR, "index.html"),
        os.path.join(os.path.dirname(__file__), "index.html")
    ]:
        if os.path.exists(candidate):
            return send_from_directory(os.path.dirname(candidate), "index.html")
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/js/App.js")
def serve_app_js():
    for candidate in [
        os.path.join(FRONTEND_DIR, "js", "App.js"),
        os.path.join(os.path.dirname(__file__), "App.js")
    ]:
        if os.path.exists(candidate):
            return send_from_directory(os.path.dirname(candidate), os.path.basename(candidate))
    return send_from_directory(FRONTEND_DIR, "App.js")

@app.route("/css/styles.css")
def serve_styles_css():
    for candidate in [
        os.path.join(FRONTEND_DIR, "css", "styles.css"),
        os.path.join(os.path.dirname(__file__), "styles.css")
    ]:
        if os.path.exists(candidate):
            return send_from_directory(os.path.dirname(candidate), os.path.basename(candidate))
    return send_from_directory(FRONTEND_DIR, "styles.css")

@app.route("/<path:path>")
def serve_static(path):
    if os.path.exists(os.path.join(FRONTEND_DIR, path)):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(os.path.dirname(__file__), path)

# --- AUTHENTICATION & ACCESS CONTROL HELPERS ---
def get_current_user():
    """Extracts and verifies session token from Authorization header or query parameter"""
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    elif "token" in request.args:
        token = request.args.get("token")
    elif request.is_json:
        data = request.get_json(silent=True, force=False) or {}
        if isinstance(data, dict):
            token = data.get("token")
    return get_session(token)

def check_permission(allowed_roles=None):
    """Verifies that the request comes from an authenticated user with permitted role"""
    user = get_current_user()
    if not user:
        # For seamless backward compatibility / monitoring, if no token header, allow default viewer access
        return None
    if allowed_roles and user.get("role") not in allowed_roles:
        return False
    return user

# --- AUTHENTICATION API ENDPOINTS ---

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """Authenticates employee credentials against employees.xlsx"""
    data = request.get_json(force=True) or {}
    emp_id = data.get("employee_id")
    password = data.get("password")
    success, result = authenticate_employee(emp_id, password)
    if success:
        user_data = {
            "token": result["token"],
            "employee_id": result["employee_id"],
            "name": result["name"],
            "role": result["role"],
            "status": result["status"]
        }
        return jsonify({
            "success": True,
            "token": result["token"],
            "user": user_data,
            "employee": user_data
        })
    status_code = 403 if ("inactive" in str(result).lower() or "deactivated" in str(result).lower()) else 401
    return jsonify({"success": False, "error": result}), status_code

@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    """Returns current active session or 401"""
    user = get_current_user()
    if user:
        return jsonify({
            "authenticated": True,
            "employee": {
                "employee_id": user["employee_id"],
                "name": user["name"],
                "role": user["role"],
                "status": user["status"]
            }
        })
    return jsonify({"authenticated": False}), 401

@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    """Destroys current session token"""
    data = request.get_json(silent=True) or {}
    token = data.get("token") or request.headers.get("Authorization", "")[7:].strip()
    destroy_session(token)
    return jsonify({"success": True, "message": "Signed out successfully."})

@app.route("/api/auth/employees", methods=["GET"])
def list_employees():
    """Admin-only: lists all employees registered in employees.xlsx"""
    user = get_current_user()
    if not user or user.get("role") != "Admin":
        return jsonify({"error": "Access Denied: Administrator role required to view Employee Directory."}), 403
    return jsonify({
        "employees": get_all_employees_sanitized(),
        "excel_file": os.path.basename(EXCEL_PATH)
    })

@app.route("/api/auth/employees", methods=["POST"])
def manage_employee():
    """Admin-only: adds or updates an employee in employees.xlsx"""
    user = get_current_user()
    if not user or user.get("role") != "Admin":
        return jsonify({"error": "Access Denied: Administrator role required to update employee records."}), 403
    data = request.get_json(force=True) or {}
    emp_id = data.get("employee_id")
    name = data.get("name")
    password = data.get("password")
    role = data.get("role", "Operator")
    status = data.get("status", "Active")
    success, msg = save_or_update_employee(emp_id, name, password, role, status)
    if success:
        return jsonify({"success": True, "message": msg})
    return jsonify({"success": False, "error": msg}), 400

@app.route("/api/auth/employees/download", methods=["GET"])
def download_excel():
    """Admin-only: download live employees.xlsx spreadsheet"""
    user = get_current_user()
    if not user or user.get("role") != "Admin":
        return jsonify({"error": "Access Denied: Administrator role required to download Employee Directory."}), 403
    from flask import send_file
    return send_file(EXCEL_PATH, as_attachment=True, download_name="employees.xlsx")

# --- REST APIS ---

@app.route("/api/telemetry", methods=["GET"])
def get_telemetry():
    snapshot = simulator.get_snapshot()
    alerts = get_active_alerts()
    return jsonify({
        "timestamp": snapshot["state"]["timestamp"],
        "plant_mode": snapshot["state"]["plant_mode"],
        "simulation_status": snapshot["mode"],
        "kpis": snapshot["state"]["kpis"],
        "sensors": snapshot["state"]["sensors"],
        "equipment_status": snapshot["state"]["equipment_status"],
        "time_series": snapshot["time_series"],
        "active_alerts_count": len([a for a in alerts if a["status"] == "ACTIVE"]),
        "recent_alerts": alerts[:5]
    })

@app.route("/api/status", methods=["GET"])
def get_plant_status():
    snapshot = simulator.get_snapshot()
    eq_list = get_equipment_list()
    
    running_count = len([e for e in eq_list if e["status"] == "RUNNING"])
    stopped_count = len([e for e in eq_list if e["status"] == "STOPPED"])
    fault_count = len([e for e in eq_list if e["status"] == "FAULT"])

    current_mw = snapshot["state"]["kpis"]["power_output_mw"]["current"]
    capacity_mw = 500.0
    load_pct = round((current_mw / capacity_mw) * 100.0, 1)

    return jsonify({
        "plant_name": "Satpura Combined Cycle Unit #4",
        "capacity_mw": capacity_mw,
        "current_generation_mw": current_mw,
        "load_percentage": load_pct,
        "plant_status": "NORMAL" if current_mw > 400 else "DEGRADED",
        "simulation_mode": snapshot["mode"],
        "equipment_stats": {
            "total": len(eq_list),
            "running": running_count,
            "stopped": stopped_count,
            "fault": fault_count
        }
    })

@app.route("/api/sensors", methods=["GET"])
def get_sensors():
    category = request.args.get("category", "all")
    sensors = get_all_sensors(category)
    # Merge latest simulated values into sensor rows
    snapshot = simulator.get_snapshot()
    live_vals = snapshot["state"]["sensors"]

    for s in sensors:
        if s["sensor_id"] in live_vals:
            s["current_value"] = live_vals[s["sensor_id"]]
            # Determine dynamic status based on safe limits
            val = s["current_value"]
            if val > s["max_safe"] or val < s["min_safe"]:
                s["status"] = "CRITICAL"
            elif val > s["max_safe"] * 0.95 or val < s["min_safe"] * 1.05:
                s["status"] = "WARNING"
            else:
                s["status"] = "NORMAL"

    return jsonify(sensors)

@app.route("/api/equipment", methods=["GET"])
def get_equipment():
    eq_list = get_equipment_list()
    snapshot = simulator.get_snapshot()
    eq_controls = snapshot.get("equipment_controls", {})
    # Mirror simulator status and controls
    for eq in eq_list:
        eid = eq["equipment_id"]
        if eid in eq_controls:
            eq["status"] = eq_controls[eid]["status"]
            eq["mode"] = eq_controls[eid].get("mode", "AUTO")
            eq["auto_tripped"] = eq_controls[eid].get("auto_tripped", False)
        elif eq["name"] in snapshot["state"]["equipment_status"]:
            eq["status"] = snapshot["state"]["equipment_status"][eq["name"]]
    return jsonify(eq_list)

@app.route("/api/burners", methods=["GET"])
def get_burners():
    snapshot = simulator.get_snapshot()
    return jsonify({
        "burners": snapshot["burners"],
        "auto_mode": snapshot["burners_auto_mode"],
        "active_count": sum(1 for b in snapshot["burners"] if b["status"] == "ON")
    })

@app.route("/api/burners/toggle", methods=["POST"])
def toggle_burner():
    user = get_current_user()
    if user and user.get("role") == "Viewer":
        return jsonify({"status": "FORBIDDEN", "message": "Access Denied: Viewer accounts have read-only monitoring permissions. Operator or Admin role required to modulate burners."}), 403

    data = request.get_json(force=True)
    b_id = data.get("burner_id")
    status = data.get("status", "ON")
    if b_id:
        simulator.set_burner_status(int(b_id), status)
        return jsonify({"status": "SUCCESS", "burner_id": b_id, "new_status": status})
    return jsonify({"status": "ERROR", "message": "Missing burner_id"}), 400

@app.route("/api/burners/mode", methods=["POST"])
def set_burner_mode():
    user = get_current_user()
    if user and user.get("role") == "Viewer":
        return jsonify({"status": "FORBIDDEN", "message": "Access Denied: Viewer accounts have read-only monitoring permissions. Operator or Admin role required."}), 403

    data = request.get_json(force=True)
    is_auto = data.get("mode") == "AUTO" or data.get("is_auto") is True
    simulator.set_burners_auto_mode(is_auto)
    return jsonify({"status": "SUCCESS", "auto_mode": is_auto})

@app.route("/api/equipment/toggle", methods=["POST"])
def toggle_equipment():
    user = get_current_user()
    if user and user.get("role") == "Viewer":
        return jsonify({"status": "FORBIDDEN", "message": "Access Denied: Viewer accounts have read-only monitoring permissions. Operator or Admin role required to trip equipment."}), 403

    data = request.get_json(force=True)
    eq_id = data.get("equipment_id")
    status = data.get("status")
    mode = data.get("mode")
    if eq_id:
        simulator.set_equipment_control(eq_id, status=status, mode=mode)
        return jsonify({"status": "SUCCESS", "equipment_id": eq_id, "status": status, "mode": mode})
    return jsonify({"status": "ERROR", "message": "Missing equipment_id"}), 400

@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    alerts = get_active_alerts()
    return jsonify(alerts)

@app.route("/api/alerts/acknowledge", methods=["POST"])
def ack_alert():
    user = get_current_user()
    if user and user.get("role") == "Viewer":
        return jsonify({"status": "FORBIDDEN", "message": "Access Denied: Viewer accounts have read-only access. Operator or Admin role required to acknowledge alarms."}), 403

    data = request.get_json(force=True)
    alert_id = data.get("alert_id")
    if alert_id:
        acknowledge_alert(alert_id)
        return jsonify({"status": "SUCCESS", "message": f"Alert {alert_id} acknowledged"})
    return jsonify({"status": "ERROR", "message": "Missing alert_id"}), 400

@app.route("/api/alerts/resolve", methods=["POST"])
def res_alert():
    user = get_current_user()
    if user and user.get("role") == "Viewer":
        return jsonify({"status": "FORBIDDEN", "message": "Access Denied: Viewer accounts have read-only access. Operator or Admin role required to resolve alarms."}), 403

    data = request.get_json(force=True)
    alert_id = data.get("alert_id")
    if alert_id:
        resolve_alert(alert_id)
        return jsonify({"status": "SUCCESS", "message": f"Alert {alert_id} resolved"})
    return jsonify({"status": "ERROR", "message": "Missing alert_id"}), 400

@app.route("/api/historical", methods=["GET"])
def get_historical():
    timeframe = request.args.get("timeframe", "today")
    data = get_historical_data(timeframe)
    return jsonify({"timeframe": timeframe, "records": data})

@app.route("/api/thirty-day-summary", methods=["GET"])
def get_thirty_day():
    rows = get_30_day_summary()

    if not rows:
        return jsonify({"error": "No daily data found"}), 404

    # Calculate Totals, Averages, Min, Max
    total_elec = sum(r["electricity_generated_mwh"] for r in rows)
    total_gas = sum(r["natural_gas_burned_scm"] for r in rows)
    total_water = sum(r["water_consumed_kl"] for r in rows)
    total_steam = sum(r["steam_generated_tonnes"] for r in rows)

    avg_elec = total_elec / len(rows)
    avg_eff = sum(r["plant_efficiency_pct"] for r in rows) / len(rows)
    max_elec = max(r["electricity_generated_mwh"] for r in rows)
    min_elec = min(r["electricity_generated_mwh"] for r in rows)

    # 4 Daily Chart series
    daily_charts = {
        "days": [f"Day {r['day_number']}" for r in rows],
        "dates": [r["date"] for r in rows],
        "electricity_generation": [r["electricity_generated_mwh"] for r in rows],
        "gas_consumption": [r["natural_gas_burned_scm"] for r in rows],
        "water_consumed": [r["water_consumed_kl"] for r in rows],
        "steam_generated": [r["steam_generated_tonnes"] for r in rows],
        "efficiency": [r["plant_efficiency_pct"] for r in rows]
    }

    return jsonify({
        "totals": {
            "total_electricity_mwh": round(total_elec, 1),
            "total_gas_scm": round(total_gas, 1),
            "total_water_kl": round(total_water, 1),
            "total_steam_tonnes": round(total_steam, 1)
        },
        "statistics": {
            "avg_daily_generation_mwh": round(avg_elec, 1),
            "avg_plant_efficiency_pct": round(avg_eff, 2),
            "max_daily_generation_mwh": round(max_elec, 1),
            "min_daily_generation_mwh": round(min_elec, 1)
        },
        "daily_charts": daily_charts
    })

@app.route("/api/simulator/control", methods=["POST"])
def control_simulator():
    data = request.get_json(force=True)
    action = data.get("action")

    if action == "start":
        simulator.start()
    elif action == "stop":
        simulator.stop()
    elif action == "reset":
        simulator.reset()
    elif action in ["NORMAL", "SIMULATE_WARNING", "SIMULATE_CRITICAL", "SIMULATE_FAULT", "SIMULATE_DISCONNECT"]:
        simulator.set_mode(action)

    return jsonify({"status": "SUCCESS", "current_mode": simulator.mode, "running": simulator.running})

@app.route("/api/mqtt/ingest", methods=["POST"])
def ingest_mqtt():
    data = request.get_json(force=True)
    res = mqtt_gateway.process_incoming_reading(data)
    return jsonify(res)

# --- PRODUCTION HEALTH CHECK ENDPOINTS ---
@app.route("/healthz")
@app.route("/api/health")
def health_check():
    """Health check endpoint for Render zero-downtime health probes"""
    return jsonify({
        "status": "HEALTHY",
        "service": "Live Power Plant Performance Analysis & Monitoring System",
        "plant_capacity_mw": 500.0,
        "plant_mode": "SCADA ONLINE",
        "simulator_active": simulator.running,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }), 200

# --- WEBSOCKET EVENT HANDLERS ---
@socketio.on('connect')
def handle_connect():
    print("React Client connected to WebSocket.")
    snapshot = simulator.get_snapshot()
    emit("connection_ack", {"status": "CONNECTED", "plant": "500 MW Plant Unit #4", "mode": snapshot["mode"]})

@socketio.on('disconnect')
def handle_disconnect():
    print("React Client disconnected.")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "0.0.0.0")
    print(f"\n========================================================")
    print(f" LIVE POWER PLANT PERFORMANCE MONITORING SYSTEM (FLASK)")
    print(f" Production Ready Server running at http://{host}:{port}")
    print(f" WebSockets & REST APIs Live")
    print(f"========================================================\n")
    socketio.run(app, host=host, port=port, debug=False, allow_unsafe_werkzeug=True)
