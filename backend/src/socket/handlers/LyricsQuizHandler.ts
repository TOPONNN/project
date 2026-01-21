import { Server, Socket } from "socket.io";
import { songService } from "../../services/SongService";
import { roomService } from "../../services/RoomService";
import { RoomStatus, LyricsQuizQuestion } from "../../entities";
import { redis } from "../../config/redis";

interface QuizState {
  currentQuestionIndex: number;
  questions: LyricsQuizQuestion[];
  answers: Map<number, { participantId: number; answer: string; time: number }[]>;
}

export class LyricsQuizHandler {
  private quizStates: Map<string, QuizState> = new Map();

  constructor(private io: Server) {}

  registerEvents(socket: Socket): void {
    socket.on("quiz:submit-answer", async (data: { roomCode: string; answer: string; questionIndex: number }) => {
      const state = this.quizStates.get(data.roomCode);
      if (!state || data.questionIndex !== state.currentQuestionIndex) return;

      const question = state.questions[data.questionIndex];
      const isCorrect = data.answer === question.correctAnswer;
      const answerTime = Date.now();

      const answers = state.answers.get(data.questionIndex) || [];
      const existingAnswer = answers.find((a) => a.participantId === socket.data.participantId);
      if (existingAnswer) return;

      answers.push({
        participantId: socket.data.participantId,
        answer: data.answer,
        time: answerTime,
      });
      state.answers.set(data.questionIndex, answers);

      let points = 0;
      if (isCorrect) {
        const answerOrder = answers.filter((a) => a.answer === question.correctAnswer).length;
        points = Math.max(question.points - (answerOrder - 1) * 100, 500);
        await roomService.updateParticipantScore(socket.data.participantId, points);
      }

      socket.emit("quiz:answer-result", {
        isCorrect,
        points,
        correctAnswer: question.correctAnswer,
      });

      this.io.to(data.roomCode).emit("quiz:participant-answered", {
        participantId: socket.data.participantId,
        nickname: socket.data.nickname,
        isCorrect,
        points,
      });
    });
  }

  async startGame(roomCode: string, songId: string): Promise<void> {
    const songData = await songService.getSongWithQuiz(songId);
    if (!songData || songData.questions.length === 0) {
      this.io.to(roomCode).emit("error", { message: "퀴즈 문제가 없습니다." });
      return;
    }

    const { song, questions } = songData;

    await roomService.updateRoomStatus(roomCode, RoomStatus.PLAYING);

    const state: QuizState = {
      currentQuestionIndex: -1,
      questions: questions.slice(0, 10),
      answers: new Map(),
    };
    this.quizStates.set(roomCode, state);

    this.io.to(roomCode).emit("game:started", {
      song: {
        id: song.id,
        title: song.title,
        artist: song.artist,
      },
    });

    this.io.to(roomCode).emit("quiz:questions", state.questions.map((q, idx) => ({
      index: idx,
      questionText: q.questionText,
      timeLimit: q.timeLimit,
      points: q.points,
    })));

    await this.delay(3000);
    await this.nextQuestion(roomCode);
  }

  private async nextQuestion(roomCode: string): Promise<void> {
    const state = this.quizStates.get(roomCode);
    if (!state) return;

    state.currentQuestionIndex++;

    if (state.currentQuestionIndex >= state.questions.length) {
      await this.endGame(roomCode);
      return;
    }

    const question = state.questions[state.currentQuestionIndex];
    const options = this.shuffleArray([question.correctAnswer, ...question.wrongAnswers]);

    this.io.to(roomCode).emit("quiz:nextQuestion");
    this.io.to(roomCode).emit("quiz:question", {
      questionIndex: state.currentQuestionIndex,
      totalQuestions: state.questions.length,
      questionText: question.questionText,
      options,
      timeLimit: question.timeLimit,
      points: question.points,
      audioStartTime: question.startTime,
      audioEndTime: question.endTime,
    });

    await this.delay(question.timeLimit * 1000 + 2000);

    this.io.to(roomCode).emit("quiz:answerRevealed", {
      questionIndex: state.currentQuestionIndex,
      correctAnswer: question.correctAnswer,
    });

    await this.delay(3000);
    await this.nextQuestion(roomCode);
  }

  private async endGame(roomCode: string): Promise<void> {
    const room = await roomService.getRoomByCode(roomCode);
    if (!room) return;

    const results = room.participants
      .map((p) => ({
        participantId: p.id,
        nickname: p.nickname,
        score: p.score,
      }))
      .sort((a, b) => b.score - a.score);

    this.io.to(roomCode).emit("game:finished");
    this.io.to(roomCode).emit("game:scoresUpdate", results);

    this.quizStates.delete(roomCode);
    await roomService.updateRoomStatus(roomCode, RoomStatus.WAITING);
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
