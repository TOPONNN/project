import amqp from "amqplib";
import dotenv from "dotenv";

dotenv.config();

let channel: amqp.Channel | null = null;
let isConnecting = false;

export const QUEUES = {
  AUDIO_PROCESSING: "kero.audio.process",
  LYRICS_EXTRACTION: "kero.lyrics.extract",
  PITCH_ANALYSIS: "kero.pitch.analyze",
};

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function connectRabbitMQ(retries = 5, delay = 3000): Promise<amqp.Channel> {
  if (isConnecting) {
    while (isConnecting) await sleep(500);
    if (channel) return channel;
  }
  
  isConnecting = true;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
      channel = await connection.createChannel();

      for (const queue of Object.values(QUEUES)) {
        await channel.assertQueue(queue, { durable: true });
      }

      connection.on("close", () => {
        console.log("RabbitMQ connection closed, will reconnect on next use");
        channel = null;
      });

      console.log("RabbitMQ connected");
      isConnecting = false;
      return channel;
    } catch (error) {
      console.error(`RabbitMQ connection attempt ${attempt}/${retries} failed:`, error);
      if (attempt < retries) {
        await sleep(delay);
      }
    }
  }
  
  isConnecting = false;
  throw new Error("Failed to connect to RabbitMQ after multiple attempts");
}

export async function ensureChannel(): Promise<amqp.Channel> {
  if (!channel) {
    await connectRabbitMQ();
  }
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }
  return channel;
}

export async function publishMessage(queue: string, message: object): Promise<void> {
  const ch = await ensureChannel();
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}
