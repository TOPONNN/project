import amqp from "amqplib";
import dotenv from "dotenv";

dotenv.config();

let channel: amqp.Channel | null = null;

export const QUEUES = {
  AUDIO_PROCESSING: "kero.audio.process",
  LYRICS_EXTRACTION: "kero.lyrics.extract",
  PITCH_ANALYSIS: "kero.pitch.analyze",
};

export async function connectRabbitMQ(): Promise<amqp.Channel> {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || "amqp://localhost:5672");
    channel = await connection.createChannel();

    for (const queue of Object.values(QUEUES)) {
      await channel.assertQueue(queue, { durable: true });
    }

    console.log("RabbitMQ connected");
    return channel;
  } catch (error) {
    console.error("RabbitMQ connection error:", error);
    throw error;
  }
}

export function getChannel(): amqp.Channel {
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }
  return channel;
}

export async function publishMessage(queue: string, message: object): Promise<void> {
  const ch = getChannel();
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}
