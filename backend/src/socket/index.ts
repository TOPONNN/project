import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { NormalModeHandler } from "./handlers/NormalModeHandler";
import { PerfectScoreHandler } from "./handlers/PerfectScoreHandler";
import { LyricsQuizHandler } from "./handlers/LyricsQuizHandler";
import { roomService } from "../services/RoomService";

export function initializeSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  });

  const normalModeHandler = new NormalModeHandler(io);
  const perfectScoreHandler = new PerfectScoreHandler(io);
  const lyricsQuizHandler = new LyricsQuizHandler(io);

  io.on("connection", (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on("join-room", async (data: { roomCode: string; nickname: string; userId?: string }) => {
      try {
        const room = await roomService.getRoomByCode(data.roomCode);
        if (!room) {
          socket.emit("error", { message: "방을 찾을 수 없습니다." });
          return;
        }

        const participant = await roomService.joinRoom(
          data.roomCode,
          data.nickname,
          data.userId,
          socket.id
        );

        socket.join(data.roomCode);
        socket.data.roomCode = data.roomCode;
        socket.data.participantId = participant.id;
        socket.data.nickname = data.nickname;
        socket.data.gameMode = room.gameMode;

        io.to(data.roomCode).emit("participant-joined", {
          participant: {
            id: participant.id,
            nickname: participant.nickname,
            isHost: participant.isHost,
            score: participant.score,
          },
        });

        socket.emit("room-joined", { room, participant });
      } catch (error: any) {
        socket.emit("error", { message: error.message });
      }
    });

    socket.on("leave-room", async () => {
      const { roomCode, participantId } = socket.data;
      if (roomCode && participantId) {
        await roomService.leaveRoom(roomCode, participantId);
        socket.leave(roomCode);
        io.to(roomCode).emit("participant-left", { participantId });
      }
    });

    socket.on("start-game", async (data: { roomCode: string; songId: string }) => {
      const room = await roomService.getRoomByCode(data.roomCode);
      if (!room) return;

      switch (room.gameMode) {
        case "normal":
          await normalModeHandler.startGame(data.roomCode, data.songId);
          break;
        case "perfect_score":
          await perfectScoreHandler.startGame(data.roomCode, data.songId);
          break;
        case "lyrics_quiz":
          await lyricsQuizHandler.startGame(data.roomCode, data.songId);
          break;
      }
    });

    normalModeHandler.registerEvents(socket);
    perfectScoreHandler.registerEvents(socket);
    lyricsQuizHandler.registerEvents(socket);

    socket.on("disconnect", async () => {
      const { roomCode, participantId } = socket.data;
      if (roomCode && participantId) {
        await roomService.leaveRoom(roomCode, participantId);
        io.to(roomCode).emit("participant-left", { participantId });
      }
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
