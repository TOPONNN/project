import { Server, Socket } from "socket.io";
import { songService } from "../../services/SongService";
import { roomService } from "../../services/RoomService";
import { RoomStatus } from "../../entities";

export class NormalModeHandler {
  constructor(private io: Server) {}

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
      this.io.to(roomCode).emit("game:timeUpdate", data.currentTime);
    });

    socket.on("normal:end-song", async (data: { roomCode: string }) => {
      const roomCode = data.roomCode || socket.data.roomCode;
      this.io.to(roomCode).emit("normal:song-ended");
      this.io.to(roomCode).emit("game:finished");
    });
  }

  async startGame(roomCode: string, songId: string): Promise<void> {
    const song = await songService.getSongById(songId);
    if (!song) return;

    await roomService.updateRoomStatus(roomCode, RoomStatus.PLAYING);

    this.io.to(roomCode).emit("game:started", {
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        instrumentalUrl: song.instrumentalUrl,
        vocalsUrl: song.vocalsUrl,
        duration: song.duration,
        lyrics: song.lyrics,
      },
    });
  }
}
