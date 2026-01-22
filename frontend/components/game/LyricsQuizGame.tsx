"use client";

import { useState, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Trophy, Users, Check, X, AlertCircle } from "lucide-react";
import type { RootState } from "@/store";
import { selectAnswer, nextQuestion, revealAnswer, setGameStatus } from "@/store/slices/gameSlice";
import { useSocket } from "@/hooks/useSocket";

const COLORS = [
  { bg: "bg-red-500", hover: "hover:bg-red-600", icon: "🔴" },
  { bg: "bg-blue-500", hover: "hover:bg-blue-600", icon: "🔵" },
  { bg: "bg-yellow-500", hover: "hover:bg-yellow-600", icon: "🟡" },
  { bg: "bg-green-500", hover: "hover:bg-green-600", icon: "🟢" },
];

export default function LyricsQuizGame() {
  const dispatch = useDispatch();
  const { quizQuestions, currentQuestionIndex, selectedAnswer, isAnswerRevealed, roundResults, myScore, scores, currentSong } = 
    useSelector((state: RootState) => state.game);
  const { code, participants } = useSelector((state: RootState) => state.room);
  const { emitEvent } = useSocket(code);
  
  const [timeLeft, setTimeLeft] = useState(20);
  const [showResults, setShowResults] = useState(false);
  const [localScore, setLocalScore] = useState(0);

  const currentQuestion = quizQuestions[currentQuestionIndex];

  useEffect(() => {
    if (!currentQuestion || isAnswerRevealed) return;

    setTimeLeft(currentQuestion.timeLimit || 20);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestion, currentQuestionIndex, isAnswerRevealed]);

  const handleTimeUp = useCallback(() => {
    if (selectedAnswer === null && !isAnswerRevealed) {
      dispatch(revealAnswer([{
        odId: "local",
        odName: "나",
        isCorrect: false,
        points: 0,
      }]));
      
      setTimeout(() => {
        if (currentQuestionIndex < quizQuestions.length - 1) {
          dispatch(nextQuestion());
        } else {
          dispatch(setGameStatus("finished"));
        }
      }, 3000);
    }
  }, [selectedAnswer, isAnswerRevealed, currentQuestionIndex, quizQuestions.length, dispatch]);

  useEffect(() => {
    if (isAnswerRevealed) {
      setShowResults(true);
      const timeout = setTimeout(() => {
        setShowResults(false);
        if (currentQuestionIndex < quizQuestions.length - 1) {
          dispatch(nextQuestion());
        } else {
          dispatch(setGameStatus("finished"));
        }
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isAnswerRevealed, currentQuestionIndex, quizQuestions.length, dispatch]);

  const handleSelectAnswer = (index: number) => {
    if (selectedAnswer !== null || isAnswerRevealed) return;
    dispatch(selectAnswer(index));
    
    const isCorrect = index === currentQuestion.correctIndex;
    const points = isCorrect ? Math.round(1000 * (timeLeft / (currentQuestion.timeLimit || 20))) : 0;
    
    if (isCorrect) {
      setLocalScore(prev => prev + points);
    }
    
    emitEvent("quiz:answer", { 
      questionIndex: currentQuestionIndex, 
      answerIndex: index,
      timeLeft,
    });
    
    setTimeout(() => {
      dispatch(revealAnswer([{
        odId: "local",
        odName: "나",
        isCorrect,
        points,
      }]));
    }, 500);
  };

  if (!currentQuestion) {
    const sortedParticipants = [...participants].sort((a, b) => {
      const scoreA = scores.find(s => s.odId === a.id)?.score || 0;
      const scoreB = scores.find(s => s.odId === b.id)?.score || 0;
      return scoreB - scoreA;
    });

    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center max-w-2xl w-full"
        >
          <Trophy className="w-24 h-24 text-[#FFD700] mx-auto mb-6" />
          <h2 className="text-4xl font-bold mb-2">게임 종료!</h2>
          {currentSong && (
            <p className="text-gray-400 mb-6">{currentSong.title} - {currentSong.artist}</p>
          )}
          
          <div className="bg-white/5 rounded-2xl p-6 mb-6">
            <p className="text-lg text-gray-400 mb-2">내 점수</p>
            <p className="text-5xl font-bold text-[#FFD700]">{localScore.toLocaleString()}점</p>
          </div>
          
          <div className="space-y-3">
            {sortedParticipants.length > 0 ? sortedParticipants.slice(0, 5).map((player, i) => {
              const playerScore = scores.find(s => s.odId === player.id)?.score || localScore;
              return (
                <motion.div
                  key={player.id}
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className={`flex items-center gap-4 p-4 rounded-xl ${
                    i === 0 ? "bg-[#FFD700]/20" : "bg-white/10"
                  }`}
                >
                  <span className="text-2xl font-bold w-8">#{i + 1}</span>
                  <span className="flex-1 text-lg">{player.nickname}</span>
                  <span className="text-2xl font-bold text-[#FFD700]">{playerScore.toLocaleString()}점</span>
                </motion.div>
              );
            }) : (
              <motion.div
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="flex items-center gap-4 p-4 rounded-xl bg-[#FFD700]/20"
              >
                <span className="text-2xl font-bold w-8">#1</span>
                <span className="flex-1 text-lg">나</span>
                <span className="text-2xl font-bold text-[#FFD700]">{localScore.toLocaleString()}점</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (quizQuestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-16 h-16 text-gray-500 mb-4" />
        <p className="text-gray-400">퀴즈 문제를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 bg-black/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF6B6B]/20">
            <Trophy className="w-5 h-5 text-[#FF6B6B]" />
            <span className="text-xl font-bold text-[#FF6B6B]">{localScore.toLocaleString()}점</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
            <Users className="w-4 h-4" />
            <span className="text-sm">{participants.length || 1}명</span>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10">
          <span className="text-sm text-gray-400">
            {currentQuestionIndex + 1} / {quizQuestions.length}
          </span>
        </div>

        <motion.div
          className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            timeLeft <= 5 ? "bg-red-500/20" : "bg-white/10"
          }`}
          animate={timeLeft <= 5 ? { scale: [1, 1.1, 1] } : {}}
          transition={{ repeat: Infinity, duration: 0.5 }}
        >
          <Clock className={`w-5 h-5 ${timeLeft <= 5 ? "text-red-400" : ""}`} />
          <span className={`text-xl font-bold ${timeLeft <= 5 ? "text-red-400" : ""}`}>
            {timeLeft}
          </span>
        </motion.div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <motion.div
          key={currentQuestionIndex}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-4xl"
        >
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 mb-8">
            <p className="text-3xl font-bold text-center leading-relaxed">
              {currentQuestion.lyrics.split("___").map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && (
                    <span className="inline-block mx-2 px-4 py-1 rounded-lg bg-[#FF6B6B]/30 text-[#FF6B6B]">
                      ?
                    </span>
                  )}
                </span>
              ))}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrect = isAnswerRevealed && index === currentQuestion.correctIndex;
              const isWrong = isAnswerRevealed && isSelected && index !== currentQuestion.correctIndex;

              return (
                <motion.button
                  key={index}
                  onClick={() => handleSelectAnswer(index)}
                  disabled={selectedAnswer !== null || isAnswerRevealed}
                  whileHover={selectedAnswer === null ? { scale: 1.02 } : {}}
                  whileTap={selectedAnswer === null ? { scale: 0.98 } : {}}
                  className={`relative p-6 rounded-2xl text-xl font-bold text-white transition-all ${
                    isCorrect
                      ? "bg-green-500 ring-4 ring-green-300"
                      : isWrong
                      ? "bg-red-500/50"
                      : isSelected
                      ? `${COLORS[index % 4].bg} ring-4 ring-white`
                      : `${COLORS[index % 4].bg} ${COLORS[index % 4].hover}`
                  } disabled:cursor-not-allowed`}
                >
                  <span className="absolute top-3 left-3 text-2xl">{COLORS[index % 4].icon}</span>
                  {option}
                  {isCorrect && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 right-3"
                    >
                      <Check className="w-8 h-8 text-white" />
                    </motion.div>
                  )}
                  {isWrong && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 right-3"
                    >
                      <X className="w-8 h-8 text-white" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 p-6 bg-black/90 backdrop-blur-xl"
          >
            <div className="max-w-4xl mx-auto text-center">
              {selectedAnswer === currentQuestion.correctIndex ? (
                <div className="text-green-400">
                  <Check className="w-12 h-12 mx-auto mb-2" />
                  <h3 className="text-2xl font-bold">정답!</h3>
                  <p className="text-lg">+{Math.round(1000 * (timeLeft / (currentQuestion.timeLimit || 20)))}점</p>
                </div>
              ) : (
                <div className="text-red-400">
                  <X className="w-12 h-12 mx-auto mb-2" />
                  <h3 className="text-2xl font-bold">오답</h3>
                  <p className="text-lg">정답: {currentQuestion.options[currentQuestion.correctIndex]}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
