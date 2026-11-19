"""
Realistic Sensor Data Simulator for 500 MW Power Plant
Supports:
- 12 Individual Burner Controls (ON / OFF / AUTO Stage Regulation)
- Automated Thermal Governor: Extinguishes burners when furnace temp > 1220°C
- Re-ignites burners when temp drops < 1080°C
- Subsystems Auto/Manual Safety Tripping (Turbine, Pumps, Generator)
"""

import time
import random
import threading
from database import log_sensor_reading, log_alert
from anomaly_detector import detector

class PowerPlantSimulator:
    def __init__(self):
        self.running = True
        self.mode = "NORMAL" # NORMAL, SIMULATE_WARNING, SIMULATE_CRITICAL, SIMULATE_FAULT, SIMULATE_DISCONNECT
        self.update_interval = 2.0 # seconds
        self.lock = threading.Lock()

        # Cumulative counters
        self.total_energy_mwh = 11676.5
        self.total_gas_kscm = 2128.4
        self.total_water_kl = 37840.0
        self.total_steam_tonnes = 35730.0

        # Latest readings buffer (for live charts - holds last 40 readings)
        self.time_series_buffer = []

        # --- 12 BURNERS INITIALIZATION ---
        self.burners_auto_mode = True # Default AUTO
        self.burners = [
            {
                "id": i,
                "name": f"Burner #{i}",
                "elevation": "Elevation A" if i <= 4 else ("Elevation B" if i <= 8 else "Elevation C"),
                "corner": f"Corner {((i-1)%4)+1}",
                "status": "ON",
                "flame_pct": 100,
                "temp_c": 1140.0,
                "gas_flow_scm": 7370.0
            }
            for i in range(1, 13)
        ]

        # --- EQUIPMENT AUTO / MANUAL CONTROLS ---
        self.equipment_controls = {
            "EQ-01": {"name": "Boiler", "status": "RUNNING", "mode": "AUTO", "trip_limit_temp": 1250.0, "auto_tripped": False},
            "EQ-02": {"name": "Steam Turbine", "status": "RUNNING", "mode": "AUTO", "trip_limit_temp": 560.0, "trip_limit_vib": 4.2, "auto_tripped": False},
            "EQ-03": {"name": "Generator", "status": "RUNNING", "mode": "AUTO", "trip_limit_temp": 95.0, "auto_tripped": False},
            "EQ-04": {"name": "Cooling Water Pump", "status": "RUNNING", "mode": "AUTO", "trip_limit_temp": 50.0, "trip_limit_vib": 3.8, "auto_tripped": False},
            "EQ-05": {"name": "Feed Water Pump", "status": "RUNNING", "mode": "AUTO", "trip_limit_temp": 75.0, "trip_limit_vib": 3.5, "auto_tripped": False},
            "EQ-06": {"name": "Gas Supply System", "status": "RUNNING", "mode": "AUTO", "trip_limit_pressure": 36.0, "auto_tripped": False}
        }

        # Pre-populate 30 initial chart points
        base_time = time.time() - 60
        for i in range(30):
            t_str = time.strftime("%H:%M:%S", time.localtime(base_time + i * 2))
            pw = round(485.0 + random.uniform(-4.0, 4.0), 1)
            gf = round(pw * 182.5 + random.uniform(-400, 400), 1)
            sf = round(pw * 3.06 + random.uniform(-10, 10), 1)
            wf = round(15400.0 + (pw - 485) * 12.0 + random.uniform(-80, 80), 1)
            bt = round(1140.0 + random.uniform(-5.0, 5.0), 1)
            sp = round(172.5 + random.uniform(-1.0, 1.0), 1)
            ef = round(41.2 + random.uniform(-0.5, 0.5), 2)
            self.time_series_buffer.append({
                "time": t_str,
                "power_mw": pw,
                "gas_flow": gf,
                "steam_flow": sf,
                "water_flow": wf,
                "boiler_temp": bt,
                "steam_press": sp,
                "efficiency": ef
            })

        # Current snapshot
        self.current_state = {
            "timestamp": time.strftime("%H:%M:%S"),
            "plant_mode": "SCADA ONLINE",
            "capacity_mw": 500.0,
            "burners_auto_mode": True,
            "active_burners_count": 12,
            "burners": self.burners,
            "equipment_controls": self.equipment_controls,
            "kpis": {
                "power_output_mw": {"current": 485.4, "previous": 484.2, "change_pct": 0.25, "status": "NORMAL"},
                "total_electricity_mwh": {"current": 11676.5, "previous": 11674.2, "change_pct": 0.02, "status": "NORMAL"},
                "natural_gas_consumed_scm": {"current": 88450.0, "previous": 88200.0, "change_pct": 0.28, "status": "NORMAL"},
                "water_consumed_kl": {"current": 37840.0, "previous": 37820.0, "change_pct": 0.05, "status": "NORMAL"},
                "steam_generated_tonnes": {"current": 35730.0, "previous": 35710.0, "change_pct": 0.06, "status": "NORMAL"},
                "plant_efficiency_pct": {"current": 41.25, "previous": 41.10, "change_pct": 0.36, "status": "NORMAL"}
            },
            "sensors": {},
            "equipment_status": {
                "Boiler": "RUNNING",
                "Steam Turbine": "RUNNING",
                "Generator": "RUNNING",
                "Cooling Water Pump": "RUNNING",
                "Feed Water Pump": "RUNNING",
                "Gas Supply System": "RUNNING"
            }
        }

    def set_burner_status(self, burner_id, status):
        """Manual toggle for a single burner (ON/OFF)"""
        with self.lock:
            for b in self.burners:
                if b["id"] == burner_id:
                    b["status"] = status
                    b["flame_pct"] = 100 if status == "ON" else 0
                    break

    def set_burners_auto_mode(self, is_auto):
        with self.lock:
            self.burners_auto_mode = is_auto
            self.current_state["burners_auto_mode"] = is_auto

    def set_equipment_control(self, eq_id, status=None, mode=None):
        with self.lock:
            if eq_id in self.equipment_controls:
                if status is not None:
                    self.equipment_controls[eq_id]["status"] = status
                    name = self.equipment_controls[eq_id]["name"]
                    self.current_state["equipment_status"][name] = status
                if mode is not None:
                    self.equipment_controls[eq_id]["mode"] = mode

    def start(self):
        self.running = True

    def stop(self):
        self.running = False

    def reset(self):
        with self.lock:
            self.mode = "NORMAL"
            self.running = True
            self.burners_auto_mode = True
            for b in self.burners:
                b["status"] = "ON"
                b["flame_pct"] = 100
            for eq_id, ctrl in self.equipment_controls.items():
                ctrl["status"] = "RUNNING"
                ctrl["mode"] = "AUTO"
                ctrl["auto_tripped"] = False
                name = ctrl["name"]
                self.current_state["equipment_status"][name] = "RUNNING"

    def set_mode(self, mode):
        with self.lock:
            self.mode = mode
            self.running = True
            if mode == "NORMAL":
                self.reset()

    def _loop(self):
        """Infinite loop that NEVER crashes"""
        while True:
            try:
                if self.running and self.mode != "SIMULATE_DISCONNECT":
                    self._generate_step()
            except Exception as e:
                print("Simulator step exception caught:", e)
            time.sleep(self.update_interval)

    def _generate_step(self):
        with self.lock:
            now_str = time.strftime("%H:%M:%S")

            # 1. Evaluate Active Burners
            active_burners_count = sum(1 for b in self.burners if b["status"] == "ON")
            burner_ratio = active_burners_count / 12.0

            # 2. Physics: Boiler furnace temp depends directly on how many burners are ON!
            if self.mode == "SIMULATE_CRITICAL":
                boiler_temp = round(1265.0 + random.uniform(5.0, 15.0), 1)
            elif self.mode == "SIMULATE_WARNING":
                boiler_temp = round(1215.0 + random.uniform(2.0, 8.0), 1)
            else:
                # Normal thermal model: 12 burners = ~1140°C, 8 burners = ~980°C, 0 burners = ~250°C
                base_temp = 250.0 + (burner_ratio * 890.0)
                boiler_temp = round(base_temp + random.uniform(-5.0, 5.0), 1)

            # --- AUTO TEMPERATURE PROTECTION FOR BURNERS ---
            if self.burners_auto_mode:
                # If boiler furnace gets too hot (> 1220°C), AUTOMATICALLY shut off upper tier burners (9, 10, 11, 12)!
                if boiler_temp > 1220.0 and active_burners_count > 6:
                    # Stage-wise automatic shutdown
                    for b in reversed(self.burners):
                        if b["status"] == "ON" and b["id"] >= 9:
                            b["status"] = "OFF"
                            b["flame_pct"] = 0
                    log_alert(
                        sensor_name="Boiler Thermal Governor",
                        equipment_name="Boiler Burners",
                        alert_type="AUTO_HEAT_SHUTOFF",
                        severity="WARNING",
                        reading=boiler_temp,
                        threshold=1220.0
                    )
                # If temperature cools down below safe re-ignition threshold (< 1080°C), AUTOMATICALLY re-light burners!
                elif boiler_temp < 1080.0 and active_burners_count < 12 and self.mode == "NORMAL":
                    for b in self.burners:
                        b["status"] = "ON"
                        b["flame_pct"] = 100

            # Re-update active burners after auto-governor
            active_burners_count = sum(1 for b in self.burners if b["status"] == "ON")
            burner_ratio = active_burners_count / 12.0

            # Update burner individual temperatures & gas flow
            for b in self.burners:
                if b["status"] == "ON":
                    b["temp_c"] = round(boiler_temp + random.uniform(-10, 10), 1)
                    b["gas_flow_scm"] = round((88450.0 / max(1, active_burners_count)) + random.uniform(-50, 50), 1)
                else:
                    b["temp_c"] = round(max(30.0, b["temp_c"] * 0.95), 1)
                    b["gas_flow_scm"] = 0.0

            # 3. Base power output in MW (Tied to active burners and turbine status)
            turbine_running = self.equipment_controls["EQ-02"]["status"] == "RUNNING"
            boiler_running = self.equipment_controls["EQ-01"]["status"] == "RUNNING"

            if not turbine_running or not boiler_running or active_burners_count == 0:
                power_mw = round(max(0.0, random.uniform(0.0, 15.0)), 1)
            else:
                max_dispatch = 485.0 * burner_ratio
                power_mw = round(max_dispatch + random.uniform(-4.5, 4.5), 1)

            # 4. Equipment parameters (Turbine, Pumps, Gas, Generator)
            turbine_vib = round(1.85 + random.uniform(-0.15, 0.15), 2)
            turbine_temp = round(542.0 + (power_mw - 485) * 0.05 + random.uniform(-1.2, 1.2), 1)
            feed_pump_vib = round(1.42 + random.uniform(-0.08, 0.08), 2)
            cw_pump_vib = round(1.25 + random.uniform(-0.05, 0.05), 2)
            gas_press = round(31.5 + random.uniform(-0.4, 0.4), 1)
            gas_flow_scm = round(power_mw * 182.5 + random.uniform(-500, 500), 1) if active_burners_count > 0 else 0.0
            steam_flow_tph = round(power_mw * 3.06 + random.uniform(-12, 12), 1)
            water_flow_m3h = round(15400.0 + (power_mw - 485) * 12.0 + random.uniform(-80, 80), 1)
            steam_press = round(172.5 + (burner_ratio - 1.0) * 20.0 + random.uniform(-1.2, 1.2), 1)

            # --- AUTO SAFETY TRIPPING FOR ROTATING EQUIPMENT ---
            for eq_id, ctrl in self.equipment_controls.items():
                if ctrl["mode"] == "AUTO":
                    # Turbine auto-protection
                    if eq_id == "EQ-02":
                        if turbine_vib > ctrl.get("trip_limit_vib", 4.2) or turbine_temp > ctrl.get("trip_limit_temp", 560.0):
                            ctrl["status"] = "STOPPED"
                            ctrl["auto_tripped"] = True
                            self.current_state["equipment_status"]["Steam Turbine"] = "STOPPED"
                            log_alert("Steam Turbine Protection", "Steam Turbine", "AUTO_SAFETY_TRIP", "CRITICAL", turbine_vib, 4.2)
                        elif ctrl["auto_tripped"] and turbine_vib < 3.0 and turbine_temp < 545.0:
                            ctrl["status"] = "RUNNING"
                            ctrl["auto_tripped"] = False
                            self.current_state["equipment_status"]["Steam Turbine"] = "RUNNING"

                    # Feed pump auto-protection
                    elif eq_id == "EQ-05":
                        if feed_pump_vib > ctrl.get("trip_limit_vib", 3.5):
                            ctrl["status"] = "STOPPED"
                            ctrl["auto_tripped"] = True
                            self.current_state["equipment_status"]["Feed Water Pump"] = "STOPPED"
                        elif ctrl["auto_tripped"] and feed_pump_vib < 2.5:
                            ctrl["status"] = "RUNNING"
                            ctrl["auto_tripped"] = False
                            self.current_state["equipment_status"]["Feed Water Pump"] = "RUNNING"

            # Cumulative increments based on 2.0s slice
            hrs_slice = self.update_interval / 3600.0
            self.total_energy_mwh = round(self.total_energy_mwh + power_mw * hrs_slice, 2)
            self.total_gas_kscm = round(self.total_gas_kscm + (gas_flow_scm * hrs_slice) / 1000.0, 2)
            self.total_water_kl = round(self.total_water_kl + water_flow_m3h * hrs_slice, 1)
            self.total_steam_tonnes = round(self.total_steam_tonnes + steam_flow_tph * hrs_slice, 1)

            # Thermodynamic Efficiency (%) ~ 40.8% - 42.2%
            if gas_flow_scm > 1000 and power_mw > 50:
                efficiency = round(41.2 + ((power_mw - 485.0) * 0.04) + random.uniform(-0.25, 0.25), 2)
                efficiency = max(32.0, min(efficiency, 43.8))
            else:
                efficiency = 0.0

            # Update KPI card values & percentage changes
            prev_kpis = self.current_state["kpis"]

            def calc_pct(curr, prev):
                if prev == 0: return 0.0
                return round(((curr - prev) / prev) * 100.0, 2)

            new_kpis = {
                "power_output_mw": {
                    "current": power_mw,
                    "previous": prev_kpis["power_output_mw"]["current"],
                    "change_pct": calc_pct(power_mw, prev_kpis["power_output_mw"]["current"]),
                    "status": "CRITICAL" if power_mw < 350 else ("WARNING" if power_mw < 440 else "NORMAL")
                },
                "total_electricity_mwh": {
                    "current": self.total_energy_mwh,
                    "previous": prev_kpis["total_electricity_mwh"]["current"],
                    "change_pct": calc_pct(self.total_energy_mwh, prev_kpis["total_electricity_mwh"]["current"]),
                    "status": "NORMAL"
                },
                "natural_gas_consumed_scm": {
                    "current": gas_flow_scm,
                    "previous": prev_kpis["natural_gas_consumed_scm"]["current"],
                    "change_pct": calc_pct(gas_flow_scm, prev_kpis["natural_gas_consumed_scm"]["current"]),
                    "status": "WARNING" if gas_flow_scm > 95000 else "NORMAL"
                },
                "water_consumed_kl": {
                    "current": self.total_water_kl,
                    "previous": prev_kpis["water_consumed_kl"]["current"],
                    "change_pct": calc_pct(self.total_water_kl, prev_kpis["water_consumed_kl"]["current"]),
                    "status": "NORMAL"
                },
                "steam_generated_tonnes": {
                    "current": self.total_steam_tonnes,
                    "previous": prev_kpis["steam_generated_tonnes"]["current"],
                    "change_pct": calc_pct(self.total_steam_tonnes, prev_kpis["steam_generated_tonnes"]["current"]),
                    "status": "NORMAL"
                },
                "plant_efficiency_pct": {
                    "current": efficiency,
                    "previous": prev_kpis["plant_efficiency_pct"]["current"],
                    "change_pct": calc_pct(efficiency, prev_kpis["plant_efficiency_pct"]["current"]),
                    "status": "WARNING" if efficiency < 38.0 else "NORMAL"
                }
            }

            # Update Equipment Status & Temp/Pressure
            for eq_id, ctrl in self.equipment_controls.items():
                name = ctrl["name"]
                self.current_state["equipment_status"][name] = ctrl["status"]

            # Store in state
            self.current_state["timestamp"] = now_str
            self.current_state["kpis"] = new_kpis
            self.current_state["burners"] = list(self.burners)
            self.current_state["active_burners_count"] = active_burners_count
            self.current_state["burners_auto_mode"] = self.burners_auto_mode
            self.current_state["equipment_controls"] = dict(self.equipment_controls)

            # Append to time-series buffer (max 40 points)
            point = {
                "time": now_str,
                "power_mw": power_mw,
                "gas_flow": gas_flow_scm,
                "steam_flow": steam_flow_tph,
                "water_flow": water_flow_m3h,
                "boiler_temp": boiler_temp,
                "steam_press": steam_press,
                "efficiency": efficiency
            }
            self.time_series_buffer.append(point)
            if len(self.time_series_buffer) > 40:
                self.time_series_buffer.pop(0)

    def get_snapshot(self):
        with self.lock:
            return {
                "state": self.current_state,
                "time_series": list(self.time_series_buffer),
                "mode": self.mode,
                "burners": list(self.burners),
                "burners_auto_mode": self.burners_auto_mode,
                "equipment_controls": dict(self.equipment_controls)
            }

simulator = PowerPlantSimulator()
sim_thread = threading.Thread(target=simulator._loop, daemon=True)
sim_thread.start()
