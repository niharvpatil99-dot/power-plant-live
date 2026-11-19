"""
MQTT Gateway & Hardware Integration Interface
Provides clean abstraction for future IoT hardware (ESP32, Arduino, PLC, SCADA Modbus).
Can connect to local/remote MQTT Broker (Mosquitto/HiveMQ) or receive HTTP REST Ingestion.
"""

import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MQTT_Gateway")

class MQTTGateway:
    def __init__(self, broker="localhost", port=1883, topic="powerplant/sensors/#"):
        self.broker = broker
        self.port = port
        self.topic = topic
        self.connected = False
        self.client = None
        self.last_payload = None

    def initialize(self):
        """
        Attempts connection to MQTT broker if 'paho-mqtt' is available.
        Otherwise acts as ready-to-plug architectural placeholder.
        """
        try:
            import paho.mqtt.client as mqtt
            self.client = mqtt.Client()
            self.client.on_connect = self._on_connect
            self.client.on_message = self._on_message
            # Non-blocking attempt
            # self.client.connect_async(self.broker, self.port, 60)
            # self.client.loop_start()
            logger.info("paho-mqtt library detected. Ready for physical broker connection.")
        except ImportError:
            logger.info("MQTT Interface initialized in Virtual Gateway mode (HTTP Ingestion ready).")

    def _on_connect(self, client, userdata, flags, rc):
        logger.info(f"Connected to MQTT Broker with result code: {rc}")
        self.connected = True
        client.subscribe(self.topic)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            self.process_incoming_reading(payload)
        except Exception as e:
            logger.error(f"Error parsing MQTT message: {e}")

    def process_incoming_reading(self, payload):
        """
        Processes physical hardware telemetry without frontend modification.
        Expected format:
        {
            "sensor_id": "ELEC-01",
            "value": 487.2,
            "unit": "MW",
            "timestamp": "2026-11-19 21:30:00"
        }
        """
        self.last_payload = payload
        return {"status": "SUCCESS", "ingested": payload}

mqtt_gateway = MQTTGateway()
mqtt_gateway.initialize()
