import Redis from "ioredis";
import { Server } from "socket.io";

interface GameSyncMessage {
  type: "time_sync" | "score_update" | "pitch_update" | "game_state" | "participant_action";
  roomCode: string;
  data: unknown;
  timestamp: number;
}

interface RoomStateMessage {
  type: "participant_joined" | "participant_left" | "room_status_changed";
  roomCode: string;
  data: unknown;
  timestamp: number;
}

type PubSubMessage = GameSyncMessage | RoomStateMessage;

export class RedisPubSubService {
  private publisher: Redis;
  private subscriber: Redis;
  private io: Server | null = null;

  private readonly GAME_CHANNEL = "kero:game:events";
  private readonly ROOM_CHANNEL = "kero:room:events";

  constructor() {
    const redisConfig = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      maxRetriesPerRequest: 3,
    };

    this.publisher = new Redis(redisConfig);
    this.subscriber = new Redis(redisConfig);

    this.setupSubscriber();
  }

  setSocketServer(io: Server): void {
    this.io = io;
  }

  private setupSubscriber(): void {
    this.subscriber.subscribe(this.GAME_CHANNEL, this.ROOM_CHANNEL);

    this.subscriber.on("message", (channel: string, message: string) => {
      try {
        const parsed: PubSubMessage = JSON.parse(message);
        this.handleMessage(channel, parsed);
      } catch (error) {
        console.error("Failed to parse Redis message:", error);
      }
    });
  }

  private handleMessage(channel: string, message: PubSubMessage): void {
    if (!this.io) return;

    const { roomCode, type, data } = message;

    switch (type) {
      case "time_sync":
        this.io.to(roomCode).emit("game:timeUpdate", data);
        break;

      case "score_update":
        this.io.to(roomCode).emit("game:scoresUpdate", data);
        break;

      case "pitch_update":
        this.io.to(roomCode).emit("game:pitchUpdate", data);
        break;

      case "game_state":
        const stateData = data as { status: string };
        if (stateData.status === "playing") {
          this.io.to(roomCode).emit("game:started", data);
        } else if (stateData.status === "paused") {
          this.io.to(roomCode).emit("game:paused");
        } else if (stateData.status === "finished") {
          this.io.to(roomCode).emit("game:finished");
        }
        break;

      case "participant_joined":
        this.io.to(roomCode).emit("room:participant:joined", data);
        break;

      case "participant_left":
        this.io.to(roomCode).emit("room:participant:left", data);
        break;

      case "room_status_changed":
        this.io.to(roomCode).emit("room:status:changed", data);
        break;
    }
  }

  async publishTimeSync(roomCode: string, currentTime: number): Promise<void> {
    const message: GameSyncMessage = {
      type: "time_sync",
      roomCode,
      data: currentTime,
      timestamp: Date.now(),
    };
    await this.publisher.publish(this.GAME_CHANNEL, JSON.stringify(message));
  }

  async publishScoreUpdate(roomCode: string, scores: unknown): Promise<void> {
    const message: GameSyncMessage = {
      type: "score_update",
      roomCode,
      data: scores,
      timestamp: Date.now(),
    };
    await this.publisher.publish(this.GAME_CHANNEL, JSON.stringify(message));
  }

  async publishPitchUpdate(roomCode: string, pitchData: unknown): Promise<void> {
    const message: GameSyncMessage = {
      type: "pitch_update",
      roomCode,
      data: pitchData,
      timestamp: Date.now(),
    };
    await this.publisher.publish(this.GAME_CHANNEL, JSON.stringify(message));
  }

  async publishGameState(roomCode: string, state: { status: string; song?: unknown }): Promise<void> {
    const message: GameSyncMessage = {
      type: "game_state",
      roomCode,
      data: state,
      timestamp: Date.now(),
    };
    await this.publisher.publish(this.GAME_CHANNEL, JSON.stringify(message));
  }

  async publishParticipantJoined(roomCode: string, participant: unknown): Promise<void> {
    const message: RoomStateMessage = {
      type: "participant_joined",
      roomCode,
      data: participant,
      timestamp: Date.now(),
    };
    await this.publisher.publish(this.ROOM_CHANNEL, JSON.stringify(message));
  }

  async publishParticipantLeft(roomCode: string, participantId: string | number): Promise<void> {
    const message: RoomStateMessage = {
      type: "participant_left",
      roomCode,
      data: participantId,
      timestamp: Date.now(),
    };
    await this.publisher.publish(this.ROOM_CHANNEL, JSON.stringify(message));
  }

  async setRoomState(roomCode: string, state: unknown): Promise<void> {
    await this.publisher.set(`room:${roomCode}:state`, JSON.stringify(state), "EX", 86400);
  }

  async getRoomState(roomCode: string): Promise<unknown | null> {
    const state = await this.publisher.get(`room:${roomCode}:state`);
    return state ? JSON.parse(state) : null;
  }

  async setGameState(roomCode: string, state: unknown): Promise<void> {
    await this.publisher.set(`game:${roomCode}:state`, JSON.stringify(state), "EX", 3600);
  }

  async getGameState(roomCode: string): Promise<unknown | null> {
    const state = await this.publisher.get(`game:${roomCode}:state`);
    return state ? JSON.parse(state) : null;
  }

  async cleanup(): Promise<void> {
    await this.subscriber.unsubscribe();
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}

export const redisPubSub = new RedisPubSubService();
