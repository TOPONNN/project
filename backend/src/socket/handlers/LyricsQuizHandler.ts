import { Server, Socket } from "socket.io";
import { songService } from "../../services/SongService";
import { roomService } from "../../services/RoomService";
import { RoomStatus, LyricsQuizQuestion, QuizType } from "../../entities";

interface QuizState {
  currentQuestionIndex: number;
  questions: LyricsQuizQuestion[];
  answers: Map<number, { participantId: number; answer: any; time: number }[]>;
  streaks: Map<number, number>;
  scores: Map<number, number>;
}

export class LyricsQuizHandler {
  private quizStates: Map<string, QuizState> = new Map();

  constructor(private io: Server) {}

  registerEvents(socket: Socket): void {
    socket.on("quiz:submit-answer", async (data: { roomCode: string; answer: any; questionIndex: number; timeLeft?: number }) => {
      const state = this.quizStates.get(data.roomCode);
      if (!state || data.questionIndex !== state.currentQuestionIndex) return;

      const question = state.questions[data.questionIndex];
      const isCorrect = this.validateAnswer(question, data.answer);

      const answers = state.answers.get(data.questionIndex) || [];
      const existingAnswer = answers.find((a) => a.participantId === socket.data.participantId);
      if (existingAnswer) return;

      answers.push({
        participantId: socket.data.participantId,
        answer: data.answer,
        time: Date.now(),
      });
      state.answers.set(data.questionIndex, answers);

      const currentStreak = state.streaks.get(socket.data.participantId) || 0;
      const newStreak = isCorrect ? currentStreak + 1 : 0;
      state.streaks.set(socket.data.participantId, newStreak);

      let points = 0;
      if (isCorrect) {
        const timeLeft = data.timeLeft || 0;
        points = this.calculatePoints(question, timeLeft, newStreak);
        const currentScore = state.scores.get(socket.data.participantId) || 0;
        state.scores.set(socket.data.participantId, currentScore + points);
        await roomService.updateParticipantScore(socket.data.participantId, points);
      }

      socket.emit("quiz:answer-result", {
        isCorrect,
        points,
        correctAnswer: question.correctAnswer,
        streak: newStreak,
      });

      this.io.to(data.roomCode).emit("quiz:participant-answered", {
        participantId: socket.data.participantId,
        nickname: socket.data.nickname,
        isCorrect,
        points,
        streak: newStreak,
      });
    });
  }

  async startGame(roomCode: string, songId: string): Promise<void> {
    const allSongs = await songService.getSongPool();
    const songIds = [songId, ...allSongs.filter(s => s.id !== songId).map(s => s.id)];

    const questions = await songService.generateMixedQuiz(songIds, 10);

    if (questions.length === 0) {
      const songData = await songService.getSongWithQuiz(songId);
      if (!songData || songData.questions.length === 0) {
        this.io.to(roomCode).emit("error", { message: "퀴즈 문제가 없습니다." });
        return;
      }
      questions.push(...songData.questions.slice(0, 10));
    }

    const song = await songService.getSongById(songId);
    await roomService.updateRoomStatus(roomCode, RoomStatus.PLAYING);

    const state: QuizState = {
      currentQuestionIndex: -1,
      questions,
      answers: new Map(),
      streaks: new Map(),
      scores: new Map(),
    };
    this.quizStates.set(roomCode, state);

    this.io.to(roomCode).emit("game:started", {
      song: song ? {
        id: song.id,
        title: song.title,
        artist: song.artist,
      } : { id: songId, title: "", artist: "" },
    });

    this.io.to(roomCode).emit("quiz:questions", state.questions.map((q, idx) => ({
      index: idx,
      type: q.type,
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

    let options: string[] | undefined;
    if (question.type === QuizType.LYRICS_FILL || question.type === QuizType.TITLE_GUESS || question.type === QuizType.ARTIST_GUESS) {
      options = this.shuffleArray([question.correctAnswer, ...question.wrongAnswers]);
    }

    this.io.to(roomCode).emit("quiz:nextQuestion");
    this.io.to(roomCode).emit("quiz:question", {
      questionIndex: state.currentQuestionIndex,
      totalQuestions: state.questions.length,
      type: question.type,
      questionText: question.questionText,
      options,
      timeLimit: question.timeLimit,
      points: question.points,
      metadata: question.metadata,
      ...(question.type === QuizType.LYRICS_ORDER && {
        lines: this.shuffleArray(question.wrongAnswers.map((text, idx) => ({ idx, text }))),
      }),
    });

    await this.delay(question.timeLimit * 1000 + 2000);

    this.io.to(roomCode).emit("quiz:answerRevealed", {
      questionIndex: state.currentQuestionIndex,
      correctAnswer: question.correctAnswer,
      type: question.type,
    });

    const leaderboard = Array.from(state.scores.entries())
      .map(([participantId, score]) => ({ participantId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    this.io.to(roomCode).emit("quiz:leaderboard", { leaderboard });

    await this.delay(3000);
    await this.nextQuestion(roomCode);
  }

  private async endGame(roomCode: string): Promise<void> {
    const room = await roomService.getRoomByCode(roomCode);
    if (!room) return;

    const state = this.quizStates.get(roomCode);
    const results = room.participants
      .map((p: any) => ({
        participantId: p.id,
        nickname: p.nickname,
        score: state?.scores.get(p.id) || p.score || 0,
        streak: state?.streaks.get(p.id) || 0,
      }))
      .sort((a: any, b: any) => b.score - a.score);

    this.io.to(roomCode).emit("game:finished");
    this.io.to(roomCode).emit("game:scoresUpdate", results);

    this.quizStates.delete(roomCode);
    await roomService.updateRoomStatus(roomCode, RoomStatus.WAITING);
  }

  private validateAnswer(question: LyricsQuizQuestion, answer: any): boolean {
    switch (question.type) {
      case QuizType.LYRICS_FILL:
      case QuizType.TITLE_GUESS:
      case QuizType.ARTIST_GUESS:
        return answer === question.correctAnswer;
      case QuizType.LYRICS_ORDER:
        try {
          const correctOrder = JSON.parse(question.correctAnswer);
          return JSON.stringify(answer) === JSON.stringify(correctOrder);
        } catch {
          return false;
        }
      case QuizType.INITIAL_GUESS: {
        const normalize = (s: string) => s.replace(/\s/g, '').toLowerCase();
        return normalize(String(answer)) === normalize(question.correctAnswer);
      }
      case QuizType.TRUE_FALSE:
        return String(answer) === question.correctAnswer;
      default:
        return false;
    }
  }

  private calculatePoints(question: LyricsQuizQuestion, timeLeft: number, streak: number): number {
    const speedBonus = Math.round(1000 * (timeLeft / question.timeLimit));
    let multiplier = 1.0;
    if (streak >= 5) multiplier = 1.5;
    else if (streak >= 4) multiplier = 1.3;
    else if (streak >= 3) multiplier = 1.2;
    else if (streak >= 2) multiplier = 1.1;
    return Math.round(speedBonus * multiplier);
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
