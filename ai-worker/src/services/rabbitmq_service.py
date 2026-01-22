import json
import time
import pika
from typing import Callable, Dict, Any
from src.config import RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASS, QUEUE_NAMES


class RabbitMQService:
    MAX_RETRIES = 10
    INITIAL_RETRY_DELAY_SECONDS = 2

    def __init__(self):
        self.connection = None
        self.channel = None
        self._connect_with_retry()

    def _connect_with_retry(self):
        retry_delay = self.INITIAL_RETRY_DELAY_SECONDS
        
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                self._connect()
                print(f"Successfully connected to RabbitMQ on attempt {attempt}")
                return
            except pika.exceptions.AMQPConnectionError as e:
                if attempt == self.MAX_RETRIES:
                    print(f"Failed to connect to RabbitMQ after {self.MAX_RETRIES} attempts")
                    raise
                print(f"RabbitMQ connection attempt {attempt} failed: {e}")
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 60)

    def _connect(self):
        credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
        parameters = pika.ConnectionParameters(
            host=RABBITMQ_HOST,
            port=RABBITMQ_PORT,
            credentials=credentials,
            heartbeat=600,
            blocked_connection_timeout=300,
        )
        self.connection = pika.BlockingConnection(parameters)
        self.channel = self.connection.channel()

        for queue_name in QUEUE_NAMES.values():
            self.channel.queue_declare(queue=queue_name, durable=True)

    def publish(self, queue: str, message: Dict[str, Any]):
        if not self.channel or self.channel.is_closed:
            self._connect()

        self.channel.basic_publish(
            exchange="",
            routing_key=queue,
            body=json.dumps(message),
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type="application/json",
            ),
        )

    def consume(self, queue: str, callback: Callable[[Dict[str, Any]], None]):
        if not self.channel or self.channel.is_closed:
            self._connect()

        def on_message(ch, method, properties, body):
            try:
                message = json.loads(body)
                callback(message)
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception as e:
                print(f"Error processing message: {e}")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        self.channel.basic_qos(prefetch_count=1)
        self.channel.basic_consume(queue=queue, on_message_callback=on_message)
        print(f"Waiting for messages on {queue}...")
        self.channel.start_consuming()

    def close(self):
        if self.connection and not self.connection.is_closed:
            self.connection.close()


rabbitmq_service = RabbitMQService()
