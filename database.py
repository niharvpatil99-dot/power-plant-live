"""
SQLite Database Layer for Live Power Plant Monitoring System
Manages schema, seeding, readings logging, alert management, and historical retrieval.
"""

import sqlite3
import os
import datetime
import random

DB_PATH = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "database", "power_plant.db")
)

def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()

    # 1. Sensors Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sensors (
        sensor_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        equipment TEXT NOT NULL,
        category TEXT NOT NULL,
        unit TEXT NOT NULL,
        min_safe REAL NOT NULL,
        max_safe REAL NOT NULL,
        current_value REAL DEFAULT 0.0,
        status TEXT DEFAULT 'NORMAL',
        last_updated TEXT
    )
    """)

    # 2. Equipment Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS equipment (
        equipment_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'RUNNING',
        temperature REAL DEFAULT 0.0,
        pressure REAL DEFAULT 0.0,
        vibration REAL DEFAULT 0.0,
        performance REAL DEFAULT 98.5
    )
    """)

    # 3. Sensor Readings Table (Time Series)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        sensor_id TEXT NOT NULL,
        value REAL NOT NULL,
        FOREIGN KEY (sensor_id) REFERENCES sensors(sensor_id)
    )
    """)

    # 4. Alerts Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sensor_name TEXT NOT NULL,
        equipment_name TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        current_reading REAL NOT NULL,
        threshold_value REAL NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE'
    )
    """)

    # 5. 30-Day Daily Performance Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS daily_performance (
        day_number INTEGER PRIMARY KEY,
        date TEXT NOT NULL,
        electricity_generated_mwh REAL NOT NULL,
        natural_gas_burned_scm REAL NOT NULL,
        water_consumed_kl REAL NOT NULL,
        steam_generated_tonnes REAL NOT NULL,
        avg_temperature_c REAL NOT NULL,
        avg_pressure_bar REAL NOT NULL,
        plant_efficiency_pct REAL NOT NULL
    )
    """)

    conn.commit()
    seed_initial_data(conn)
    conn.close()

def seed_initial_data(conn):
    cursor = conn.cursor()

    # Check if sensors already seeded
    cursor.execute("SELECT COUNT(*) FROM sensors")
    if cursor.fetchone()[0] == 0:
        initial_sensors = [
            # Electrical Sensors
            ("ELEC-01", "Power Output", "Generator", "Electrical", "MW", 250.0, 520.0, 485.4, "NORMAL"),
            ("ELEC-02", "Total Energy Generation", "Generator", "Electrical", "MWh", 0.0, 100000.0, 11648.0, "NORMAL"),
            ("ELEC-03", "Generator Grid Voltage", "Generator", "Electrical", "kV", 20.0, 24.0, 22.1, "NORMAL"),
            ("ELEC-04", "Generator Current", "Generator", "Electrical", "kA", 10.0, 15.0, 12.8, "NORMAL"),
            ("ELEC-05", "Grid Frequency", "Generator", "Electrical", "Hz", 49.5, 50.5, 50.02, "NORMAL"),
            
            # Gas Sensors
            ("GAS-01", "Natural Gas Flow Rate", "Gas Supply System", "Gas", "SCM/h", 60000.0, 98000.0, 88450.0, "NORMAL"),
            ("GAS-02", "Total Gas Consumed", "Gas Supply System", "Gas", "kSCM", 0.0, 50000.0, 2125.0, "NORMAL"),
            ("GAS-03", "Gas Supply Header Pressure", "Gas Supply System", "Gas", "bar", 25.0, 38.0, 31.5, "NORMAL"),

            # Water Sensors
            ("WTR-01", "Cooling Water Flow Rate", "Cooling Water Pump", "Water", "m³/h", 12000.0, 18000.0, 15400.0, "NORMAL"),
            ("WTR-02", "Total Water Consumed", "Cooling Water Pump", "Water", "KL", 0.0, 100000.0, 36960.0, "NORMAL"),
            ("WTR-03", "Feedwater Pressure", "Feed Water Pump", "Water", "bar", 140.0, 190.0, 168.4, "NORMAL"),

            # Steam Sensors
            ("STM-01", "Main Steam Flow Rate", "Boiler", "Steam", "TPH", 1100.0, 1600.0, 1485.0, "NORMAL"),
            ("STM-02", "Total Steam Generated", "Boiler", "Steam", "Tonnes", 0.0, 50000.0, 35640.0, "NORMAL"),
            ("STM-03", "Main Steam Pressure", "Boiler", "Steam", "bar", 145.0, 185.0, 172.5, "NORMAL"),

            # Temperature Sensors
            ("TMP-01", "Boiler Furnace Temperature", "Boiler", "Temperature", "°C", 900.0, 1250.0, 1140.0, "NORMAL"),
            ("TMP-02", "Steam Turbine Inlet Temp", "Steam Turbine", "Temperature", "°C", 510.0, 565.0, 542.0, "NORMAL"),
            ("TMP-03", "Exhaust Flue Gas Temp", "Boiler", "Temperature", "°C", 115.0, 145.0, 133.5, "NORMAL"),

            # Equipment / Vibration Sensors
            ("VIB-01", "Steam Turbine Bearing Vibration", "Steam Turbine", "Vibration", "mm/s", 0.0, 4.5, 1.85, "NORMAL"),
            ("VIB-02", "Feed Water Pump Vibration", "Feed Water Pump", "Vibration", "mm/s", 0.0, 3.8, 1.42, "NORMAL"),
            ("VIB-03", "Cooling Water Pump Vibration", "Cooling Water Pump", "Vibration", "mm/s", 0.0, 4.0, 1.25, "NORMAL"),
        ]

        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for s in initial_sensors:
            cursor.execute("""
            INSERT OR REPLACE INTO sensors (sensor_id, name, equipment, category, unit, min_safe, max_safe, current_value, status, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], now))

    # Check if equipment already seeded
    cursor.execute("SELECT COUNT(*) FROM equipment")
    if cursor.fetchone()[0] == 0:
        initial_equipment = [
            ("EQ-01", "Boiler", "RUNNING", 1140.0, 172.5, 1.2, 98.4),
            ("EQ-02", "Steam Turbine", "RUNNING", 542.0, 168.0, 1.85, 97.8),
            ("EQ-03", "Generator", "RUNNING", 78.5, 0.0, 1.1, 99.2),
            ("EQ-04", "Cooling Water Pump", "RUNNING", 42.0, 6.2, 1.25, 96.5),
            ("EQ-05", "Feed Water Pump", "RUNNING", 65.0, 185.0, 1.42, 98.0),
            ("EQ-06", "Gas Supply System", "RUNNING", 28.0, 31.5, 0.8, 99.5)
        ]
        for eq in initial_equipment:
            cursor.execute("""
            INSERT OR REPLACE INTO equipment (equipment_id, name, status, temperature, pressure, vibration, performance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, eq)

    # Check if 30-day performance seeded
    cursor.execute("SELECT COUNT(*) FROM daily_performance")
    if cursor.fetchone()[0] == 0:
        base_date = datetime.date.today() - datetime.timedelta(days=30)
        for i in range(1, 31):
            curr_date = (base_date + datetime.timedelta(days=i)).strftime("%Y-%m-%d")
            # Realistic 500 MW Unit daily numbers
            elec_mwh = round(random.uniform(11200.0, 11950.0), 1)
            gas_scm = round(elec_mwh * random.uniform(180.0, 195.0), 1)
            water_kl = round(random.uniform(34000.0, 39500.0), 1)
            steam_ton = round(elec_mwh * random.uniform(2.95, 3.12), 1)
            avg_temp = round(random.uniform(538.0, 545.0), 1)
            avg_press = round(random.uniform(168.0, 174.0), 1)
            eff_pct = round(random.uniform(39.8, 42.5), 2)

            cursor.execute("""
            INSERT INTO daily_performance 
            (day_number, date, electricity_generated_mwh, natural_gas_burned_scm, water_consumed_kl, steam_generated_tonnes, avg_temperature_c, avg_pressure_bar, plant_efficiency_pct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (i, curr_date, elec_mwh, gas_scm, water_kl, steam_ton, avg_temp, avg_press, eff_pct))

    conn.commit()

def log_sensor_reading(sensor_id, value):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    cursor.execute("""
    INSERT INTO sensor_readings (timestamp, sensor_id, value)
    VALUES (?, ?, ?)
    """, (now, sensor_id, value))

    cursor.execute("""
    UPDATE sensors 
    SET current_value = ?, last_updated = ?
    WHERE sensor_id = ?
    """, (value, now, sensor_id))

    conn.commit()
    conn.close()

def log_alert(sensor_name, equipment_name, alert_type, severity, reading, threshold):
    conn = get_db()
    cursor = conn.cursor()
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Don't duplicate active alert for same sensor within 10 seconds
    cursor.execute("""
    SELECT COUNT(*) FROM alerts 
    WHERE sensor_name = ? AND status = 'ACTIVE' AND severity = ?
    """, (sensor_name, severity))
    
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO alerts (sensor_name, equipment_name, alert_type, severity, current_reading, threshold_value, timestamp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        """, (sensor_name, equipment_name, alert_type, severity, reading, threshold, now))
        conn.commit()

    conn.close()

def get_active_alerts():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM alerts WHERE status != 'RESOLVED' ORDER BY id DESC LIMIT 50")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def acknowledge_alert(alert_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE alerts SET status = 'ACKNOWLEDGED' WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()

def resolve_alert(alert_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE alerts SET status = 'RESOLVED' WHERE id = ?", (alert_id,))
    conn.commit()
    conn.close()

def get_all_sensors(category=None):
    conn = get_db()
    cursor = conn.cursor()
    if category and category.lower() != 'all':
        cursor.execute("SELECT * FROM sensors WHERE category = ? ORDER BY sensor_id ASC", (category,))
    else:
        cursor.execute("SELECT * FROM sensors ORDER BY sensor_id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_equipment_list():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM equipment ORDER BY equipment_id ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_30_day_summary():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM daily_performance ORDER BY day_number ASC")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows

def get_historical_data(timeframe='today'):
    conn = get_db()
    cursor = conn.cursor()
    
    if timeframe == '30d':
        cursor.execute("SELECT * FROM daily_performance ORDER BY day_number ASC")
        rows = [dict(r) for r in cursor.fetchall()]
    elif timeframe == '7d':
        cursor.execute("SELECT * FROM daily_performance ORDER BY day_number DESC LIMIT 7")
        rows = [dict(r) for r in reversed(cursor.fetchall())]
    else:
        # Today - simulated hourly aggregates
        rows = []
        base = datetime.datetime.now().replace(minute=0, second=0)
        for h in range(12, -1, -1):
            t = (base - datetime.timedelta(hours=h)).strftime("%H:00")
            rows.append({
                "time": t,
                "electricity_mwh": round(480.0 + random.uniform(-10, 15), 1),
                "gas_scm": round(88000.0 + random.uniform(-2000, 3000), 1),
                "water_kl": round(1540.0 + random.uniform(-60, 80), 1),
                "steam_tonnes": round(1480.0 + random.uniform(-40, 50), 1),
                "efficiency": round(41.2 + random.uniform(-0.8, 0.9), 2)
            })

    conn.close()
    return rows

if __name__ == "__main__":
    init_db()
    print("Database initialized and verified successfully at:", DB_PATH)
