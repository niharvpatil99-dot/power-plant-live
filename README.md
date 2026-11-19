# ⚡ Live Power Plant Performance Analysis & Monitoring System
> **500 MW Combined Cycle & Thermal Power Plant Live SCADA Monitoring System**  
> Built with **React.js, Python Flask, Flask-SocketIO, SQLite, Recharts / Chart.js, and Modern Industrial CSS**.

---

## 🌐 Public Deployment on Render

This project is fully configured and production-ready for deployment on **Render** (as well as Railway, Fly.io, or Heroku) with zero frontend/backend separation needed.

### Prerequisites
1. A free account on [GitHub](https://github.com/).
2. A free account on [Render](https://render.com/).

---

### Step 1: Push Code to GitHub

Open a terminal (PowerShell, Command Prompt, or Git Bash) in your project root:

```bash
cd "C:\Users\DELL\.gemini\antigravity\scratch\power_plant_live_system"

# 1. Initialize Git repository
git init

# 2. Add all files
git add .

# 3. Commit your files
git commit -m "Production release: Live Power Plant SCADA Monitoring System"

# 4. Create a new repository on GitHub (named e.g. power-plant-monitoring)
# Then link and push your repository:
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/power-plant-monitoring.git
git push -u origin main
```

---

### Step 2: Deploy on Render

#### Option A: 1-Click Blueprint (Recommended)
1. Go to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** in the top right corner and select **Blueprint**.
3. Connect your GitHub repository.
4. Render will automatically detect [`render.yaml`](file:///C:/Users/DELL/.gemini/antigravity/scratch/power_plant_live_system/render.yaml) and configure the build command, start command, health checks, and environment variables automatically.
5. Click **Apply**.

#### Option B: Manual Web Service Setup
1. On your Render Dashboard, click **New +** > **Web Service**.
2. Connect your GitHub repository.
3. Configure the following settings:
   - **Name**: `live-power-plant-monitoring` (or your preferred name)
   - **Region**: Choose the closest region (e.g., Oregon, Frankfurt, Singapore)
   - **Branch**: `main`
   - **Root Directory**: Leave blank (defaults to root `.`)
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT backend.app:app`
   - **Instance Type**: `Free`
4. Expand **Advanced** and set:
   - **Health Check Path**: `/api/health`
5. Under **Environment Variables**, add:
   - `PYTHON_VERSION`: `3.11.9`
   - `SECRET_KEY`: *(click Generate or enter a random secure string)*
   - `SOCKETIO_ASYNC_MODE`: `eventlet`
6. Click **Create Web Service**.

Render will build the application, install dependencies, initialize the SQLite database, launch the Gunicorn eventlet worker with live physics simulation, and provide a public URL like:
👉 `https://live-power-plant-monitoring.onrender.com`

---

## 💻 How to Run Locally

### 1-Click Method (Desktop Shortcut):
Go to your **Desktop** and double-click:
`Launch_Live_Power_Plant_System.bat`

### Terminal Method:
```bash
cd "C:\Users\DELL\.gemini\antigravity\scratch\power_plant_live_system\backend"
python app.py
```
Then navigate to `http://localhost:5000` in Google Chrome or any browser.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, Tailwind CSS, Modern SCADA Dark CSS | Responsive industrial UI, component hierarchy, real-time views |
| **Backend** | Python 3, Flask, Flask-SocketIO | REST API routing, request validation, static file delivery |
| **Real-time Telemetry** | Flask-SocketIO & Socket.IO Client | Real-time bi-directional WebSocket streaming every 2.0s |
| **Production WSGI** | Gunicorn with Eventlet | High-concurrency async WebSocket server for Linux cloud hosting |
| **Charting Engine** | Chart.js & Recharts | Time-series stream charts, daily bar charts, trend analysis |
| **Database** | SQLite3 (`power_plant.db`) | Sensors catalog, equipment state, alert logs, 30-day historical records |
| **Simulation Engine** | Multi-threaded Physics Engine | Continuous 500 MW thermodynamic simulation, automated thermal interlocks |
| **Hardware Gateway** | MQTT-Ready Architecture | Ingests external telemetry from ESP32, Arduino, or Modbus PLC |

---

## 📊 Application Pages & Features

1. **📊 Live Dashboard**: 6 real-time KPI cards (Electricity, Gas, Water, Steam, MW Output, Efficiency), 4 live streaming charts (latest 40 points), quick sensor readings table, and live alert ticker.
2. **🏭 Plant Overview**: 500 MW nameplate capacity, live dispatched load percentage, operating states, and equipment fleet status.
3. **📡 Sensor Monitoring**: Comprehensive sensor catalog with category filters (Electrical, Gas, Water, Steam, Temperature, Vibration), real-time search, normal ranges, and dynamic status badges.
4. **⚙️ Equipment Status**:
   - **12 Boiler Burners Matrix**: Individual flame telemetry, automated high-temperature cut-off (>1,220°C trip, <1,080°C reignition), and manual toggle controls.
   - **6 Rotating Subsystems**: Boiler, Steam Turbine, Generator, Cooling Water Pump, Feed Water Pump, and Gas Supply System with automatic safety trip interlocks.
5. **⚠️ Alerts & Anomalies**: Real-time alarm detection, severity filtering (Critical, Warning, Normal), threshold violations, and interactive Acknowledge / Resolve controls.
6. **📈 Historical Analysis**: Timeframe filtering (Today, 7 Days, 30 Days, Custom Range), average metrics, and thermodynamic conversion efficiency trends.
7. **📅 30-Day Performance**: Daily electricity generation, natural gas consumption, steam vs. water consumed, and correlation charts.

---

## 🔌 Connecting Physical Hardware (IoT / ESP32 / MQTT)

The backend includes a plug-and-play ingestion interface:
Microcontrollers (ESP32, Arduino, Raspberry Pi, Modbus PLC) can stream readings directly via HTTP POST:

```http
POST /api/mqtt/ingest
Content-Type: application/json

{
    "sensor_id": "ELEC-01",
    "value": 487.5,
    "unit": "MW",
    "timestamp": "2026-11-19 22:00:00"
}
```
The telemetry stream updates the SQLite database and broadcasts live to all connected web clients in real time.

---

## 📁 Project Directory Structure

```
power_plant_live_system/
├── backend/
│   ├── app.py                 # Flask server, WebSocket emitter, REST API endpoints
│   ├── database.py            # SQLite schema, queries, data persistence
│   ├── simulator.py           # 500 MW thermodynamics sensor simulation engine
│   ├── anomaly_detector.py    # Rule-based threshold & anomaly detection system
│   └── mqtt_gateway.py        # MQTT & external IoT sensor interface
├── frontend/
│   ├── index.html             # Master React application entry & HTML shell
│   ├── css/
│   │   └── styles.css         # Modern industrial SCADA dark styling
│   └── js/
│       └── App.js             # React Root Component with 7 Pages & Router
├── database/
│   └── power_plant.db         # SQLite persistent database file
├── Procfile                   # Cloud process execution command (Render / Heroku)
├── render.yaml                # Render Infrastructure as Code Blueprint
├── requirements.txt           # Production Python dependencies
├── .env.example               # Environment variable templates
├── .gitignore                 # Version control exclusions
├── run_system.bat             # 1-click Windows local launcher
└── README.md                  # Complete documentation
```
