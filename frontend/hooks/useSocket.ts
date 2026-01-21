"use client";

import { useEffect, useCallback } from "react";
import { useDispatch } from "react-redux";
import { getSocket, connectSocket, disconnectSocket } from "@/lib/socket";
import { setRoom, addParticipant, removeParticipant, setRoomStatus, setConnected } from "@/store/slices/roomSlice";
import { 
  setGameStatus, 
  setCurrentSong, 
  updateCurrentTime, 
  updateScores, 
  updatePitch,
  setQuizQuestions,
  nextQuestion,
  revealAnswer,
} from "@/store/slices/gameSlice";

export function useSocket(roomCode: string | null) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!roomCode) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const socket = connectSocket(token);

    socket.on("connect", () => {
      dispatch(setConnected(true));
      socket.emit("room:join", { code: roomCode });
    });

    socket.on("disconnect", () => {
      dispatch(setConnected(false));
    });

    socket.on("room:joined", (data) => {
      dispatch(setRoom(data.room));
    });

    socket.on("room:participant:joined", (participant) => {
      dispatch(addParticipant(participant));
    });

    socket.on("room:participant:left", (participantId) => {
      dispatch(removeParticipant(participantId));
    });

    socket.on("game:started", (data) => {
      dispatch(setGameStatus("playing"));
      dispatch(setCurrentSong(data.song));
    });

    socket.on("game:paused", () => {
      dispatch(setGameStatus("paused"));
    });

    socket.on("game:resumed", () => {
      dispatch(setGameStatus("playing"));
    });

    socket.on("game:finished", () => {
      dispatch(setGameStatus("finished"));
    });

    socket.on("game:timeUpdate", (time) => {
      dispatch(updateCurrentTime(time));
    });

    socket.on("game:scoresUpdate", (scores) => {
      dispatch(updateScores(scores));
    });

    socket.on("game:pitchUpdate", (data) => {
      dispatch(updatePitch(data));
    });

    socket.on("quiz:questions", (questions) => {
      dispatch(setQuizQuestions(questions));
    });

    socket.on("quiz:nextQuestion", () => {
      dispatch(nextQuestion());
    });

    socket.on("quiz:answerRevealed", (results) => {
      dispatch(revealAnswer(results));
    });

    return () => {
      socket.emit("room:leave", { code: roomCode });
      disconnectSocket();
    };
  }, [roomCode, dispatch]);

  const emitEvent = useCallback((event: string, data?: unknown) => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit(event, data);
    }
  }, []);

  return { emitEvent };
}
