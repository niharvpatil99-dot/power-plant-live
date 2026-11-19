"""
Anomaly Detection Engine for 500 MW Power Plant
Performs continuous rule-based limit checking, rate-of-change analysis, and logs alerts.
Architecture is modular for future Machine Learning (Autoencoders / Isolation Forest).
"""

from database import log_alert

class AnomalyDetector:
    def __init__(self):
        # Predefined rule thresholds
        self.rules = {
            "ELEC-01": {"min": 350.0, "max": 515.0, "warn_low": 400.0, "warn_high": 505.0, "name": "Power Output", "eq": "Generator"},
            "ELEC-05": {"min": 49.2, "max": 50.8, "warn_low": 49.6, "warn_high": 50.4, "name": "Grid Frequency", "eq": "Generator"},
            "GAS-01": {"min": 50000.0, "max": 96000.0, "warn_low": 60000.0, "warn_high": 94000.0, "name": "Natural Gas Flow", "eq": "Gas Supply System"},
            "GAS-03": {"min": 25.0, "max": 38.0, "warn_low": 28.0, "warn_high": 36.0, "name": "Gas Pressure", "eq": "Gas Supply System"},
            "STM-03": {"min": 145.0, "max": 185.0, "warn_low": 150.0, "warn_high": 180.0, "name": "Main Steam Pressure", "eq": "Boiler"},
            "TMP-01": {"min": 950.0, "max": 1250.0, "warn_low": 1000.0, "warn_high": 1200.0, "name": "Boiler Furnace Temp", "eq": "Boiler"},
            "TMP-02": {"min": 515.0, "max": 565.0, "warn_low": 525.0, "warn_high": 555.0, "name": "Turbine Inlet Temp", "eq": "Steam Turbine"},
            "VIB-01": {"min": 0.0, "max": 4.5, "warn_low": 0.0, "warn_high": 3.2, "name": "Turbine Vibration", "eq": "Steam Turbine"},
            "VIB-02": {"min": 0.0, "max": 3.8, "warn_low": 0.0, "warn_high": 2.8, "name": "Feed Pump Vibration", "eq": "Feed Water Pump"},
        }
        self.last_readings = {}

    def inspect(self, sensor_id, current_value):
        """
        Inspects incoming sensor reading against threshold and rate-of-change rules.
        Returns: (severity, alert_message) or None
        """
        rule = self.rules.get(sensor_id)
        if not rule:
            return None

        alert = None

        # 1. Critical High Check
        if current_value > rule["max"]:
            alert = {
                "sensor_name": rule["name"],
                "equipment_name": rule["eq"],
                "alert_type": "OVER_LIMIT",
                "severity": "CRITICAL",
                "reading": current_value,
                "threshold": rule["max"]
            }
        # 2. Critical Low Check
        elif current_value < rule["min"]:
            alert = {
                "sensor_name": rule["name"],
                "equipment_name": rule["eq"],
                "alert_type": "UNDER_LIMIT",
                "severity": "CRITICAL",
                "reading": current_value,
                "threshold": rule["min"]
            }
        # 3. Warning High Check
        elif current_value > rule.get("warn_high", 999999):
            alert = {
                "sensor_name": rule["name"],
                "equipment_name": rule["eq"],
                "alert_type": "HIGH_WARNING",
                "severity": "WARNING",
                "reading": current_value,
                "threshold": rule["warn_high"]
            }
        # 4. Warning Low Check
        elif current_value < rule.get("warn_low", -999999):
            alert = {
                "sensor_name": rule["name"],
                "equipment_name": rule["eq"],
                "alert_type": "LOW_WARNING",
                "severity": "WARNING",
                "reading": current_value,
                "threshold": rule["warn_low"]
            }

        # 5. Rate-of-Change Check (e.g. sudden drop in MW)
        prev = self.last_readings.get(sensor_id)
        if prev is not None and sensor_id == "ELEC-01":
            drop = prev - current_value
            if drop > 35.0: # Sudden drop of > 35 MW in 2 seconds
                alert = {
                    "sensor_name": rule["name"],
                    "equipment_name": rule["eq"],
                    "alert_type": "SUDDEN_GENERATION_DROP",
                    "severity": "CRITICAL",
                    "reading": current_value,
                    "threshold": prev
                }

        self.last_readings[sensor_id] = current_value

        if alert:
            log_alert(
                sensor_name=alert["sensor_name"],
                equipment_name=alert["equipment_name"],
                alert_type=alert["alert_type"],
                severity=alert["severity"],
                reading=round(alert["reading"], 2),
                threshold=round(alert["threshold"], 2)
            )

        return alert

detector = AnomalyDetector()
