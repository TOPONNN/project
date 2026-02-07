import { Server, Socket } from "socket.io";
import { songService } from "../../services/SongService";
import { roomService } from "../../services/RoomService";
import { RoomStatus } from "../../entities";
import { redis } from "../../config/redis";

interface PitchData {
  time: number;
  frequency: number;
  confidence: number;
}

export class PerfectScoreHandler {
  constructor(private io: Server) {}

  registerEvents(socket: Socket): void {
    socket.on("perfect:pitch-data", async (data: { roomCode: string; pitchData: PitchData }) => {
      const scoreKey = `score:${data.roomCode}:${socket.data.participantId}`;

      const currentData = await redis.get(scoreKey);
      const scores: PitchData[] = currentData ? JSON.parse(currentData) : [];
      scores.push(data.pitchData);
      await redis.set(scoreKey, JSON.stringify(scores), "EX", 3600);

      const score = this.calculateScore(data.pitchData);

      socket.to(data.roomCode).emit("perfect:participant-score", {
        participantId: socket.data.participantId,
        nickname: socket.data.nickname,
        pitchData: data.pitchData,
        currentScore: score,
      });

      this.io.to(data.roomCode).emit("game:pitchUpdate", {
        participantId: socket.data.participantId,
        pitch: data.pitchData,
        score,
      });
    });

    socket.on("perfect:end-song", async (data: { roomCode: string }) => {
      await this.calculateFinalScores(data.roomCode);
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
        duration: song.duration,
        lyrics: song.lyrics,
      };
    }

    await roomService.updateRoomStatus(roomCode, RoomStatus.PLAYING);

    const participants = await this.getParticipants(roomCode);
    for (const p of participants) {
      await redis.del(`score:${roomCode}:${p.id}`);
    }

    this.io.to(roomCode).emit("game:started", {
      song: broadcastSongData,
      queueItemId,
    });
  }

  private calculateScore(pitchData: PitchData): number {
    if (pitchData.confidence < 0.5) return 0;

    const baseScore = Math.round(pitchData.confidence * 100);
    return Math.min(100, baseScore);
  }

  private async calculateFinalScores(roomCode: string): Promise<void> {
    const room = await roomService.getRoomByCode(roomCode);
    if (!room) return;

    const results: Array<{ participantId: number; nickname: string; totalScore: number; accuracy: number }> = [];

    for (const participant of room.participants) {
      const scoreKey = `score:${roomCode}:${participant.id}`;
      const data = await redis.get(scoreKey);
      const pitchDataArray: PitchData[] = data ? JSON.parse(data) : [];

      let totalScore = 0;
      let validPitches = 0;

      for (const pd of pitchDataArray) {
        if (pd.confidence > 0.5) {
          totalScore += this.calculateScore(pd);
          validPitches++;
        }
      }

      const accuracy = validPitches > 0 ? totalScore / validPitches : 0;

      await roomService.updateParticipantScore(participant.id, Math.round(accuracy));

      results.push({
        participantId: participant.id,
        nickname: participant.nickname,
        totalScore: Math.round(accuracy),
        accuracy: Math.round(accuracy),
      });
    }

    results.sort((a, b) => b.totalScore - a.totalScore);

    this.io.to(roomCode).emit("game:finished");
    this.io.to(roomCode).emit("game:scoresUpdate", results);

    await roomService.updateRoomStatus(roomCode, RoomStatus.WAITING);
  }

  private async getParticipants(roomCode: string): Promise<Array<{ id: number }>> {
    const room = await roomService.getRoomByCode(roomCode);
    return room?.participants || [];
  }
}
