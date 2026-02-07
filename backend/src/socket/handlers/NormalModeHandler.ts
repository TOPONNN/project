import { Server, Socket } from "socket.io";
import { songService } from "../../services/SongService";
import { roomService } from "../../services/RoomService";
import { RoomStatus } from "../../entities";

interface ActiveGameState {
  song: Record<string, unknown>;
  status: "playing" | "paused";
  startedAt: number;
  queueItemId?: string;
}

interface ActiveGameStateTracker {
  setActiveGameState?: (roomCode: string, state: ActiveGameState) => void;
  clearActiveGameState?: (roomCode: string) => void;
  updateGameTime?: (roomCode: string, currentTime: number) => void;
}

export class NormalModeHandler {
  constructor(
    private io: Server,
    private activeGameStateTracker: ActiveGameStateTracker = {}
  ) {}

  registerEvents(socket: Socket): void {
    socket.on("normal:ready", (data: { roomCode: string }) => {
      this.io.to(data.roomCode).emit("normal:player-ready", {
        participantId: socket.data.participantId,
        nickname: socket.data.nickname,
      });
    });

    socket.on("normal:play", (data: { roomCode: string; currentTime: number }) => {
      const roomCode = data.roomCode || socket.data.roomCode;
      socket.to(roomCode).emit("normal:sync-play", {
        currentTime: data.currentTime,
        participantId: socket.data.participantId,
      });
      this.activeGameStateTracker.updateGameTime?.(roomCode, data.currentTime);
      this.io.to(roomCode).emit("game:timeUpdate", data.currentTime);
    });

    socket.on("normal:pause", (data: { roomCode: string; currentTime: number }) => {
      const roomCode = data.roomCode || socket.data.roomCode;
      socket.to(roomCode).emit("normal:sync-pause", {
        currentTime: data.currentTime,
        participantId: socket.data.participantId,
      });
    });

    socket.on("normal:seek", (data: { roomCode: string; currentTime: number }) => {
      const roomCode = data.roomCode || socket.data.roomCode;
      socket.to(roomCode).emit("normal:sync-seek", {
        currentTime: data.currentTime,
        participantId: socket.data.participantId,
      });
      this.activeGameStateTracker.updateGameTime?.(roomCode, data.currentTime);
      this.io.to(roomCode).emit("game:timeUpdate", data.currentTime);
    });

    socket.on("normal:end-song", async (data: { roomCode: string }) => {
      const roomCode = data.roomCode || socket.data.roomCode;
      this.activeGameStateTracker.clearActiveGameState?.(roomCode);
      this.io.to(roomCode).emit("normal:song-ended");
      this.io.to(roomCode).emit("game:finished");
    });
  }

  async startGame(roomCode: string, songId: string, songData?: Record<string, unknown>, queueItemId?: string): Promise<void> {
    let broadcastSongData = songData;
    if (!broadcastSongData) {
      const song = await songService.getSongById(songId);
      if (!song) return;

      broadcastSongData = {
        id: song.id,
        title: song.title,
        artist: song.artist,
        instrumentalUrl: song.instrumentalUrl,
        vocalsUrl: song.vocalsUrl,
        duration: song.duration,
        lyrics: song.lyrics,
      };
    }

    await roomService.updateRoomStatus(roomCode, RoomStatus.PLAYING);

    this.activeGameStateTracker.setActiveGameState?.(roomCode, {
      song: broadcastSongData,
      status: "playing",
      startedAt: Date.now(),
      queueItemId,
    });

    console.log("[game:started] Broadcasting to room:", roomCode);
    this.io.to(roomCode).emit("game:started", {
      song: broadcastSongData,
      queueItemId,
    });
    console.log("[game:started] Broadcast complete");
  }
}
