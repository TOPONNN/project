"use client";

import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Trophy, Users, Check, X } from "lucide-react";
import type { RootState } from "@/store";
import { selectAnswer } from "@/store/slices/gameSlice";
import { useSocket } from "@/hooks/useSocket";

const COLORS = [
  { bg: "bg-red-500", hover: "hover:bg-red-600", icon: "🔴" },
  { bg: "bg-blue-500", hover: "hover:bg-blue-600", icon: "🔵" },
  { bg: "bg-yellow-500", hover: "hover:bg-yellow-600", icon: "🟡" },
  { bg: "bg-green-500", hover: "hover:bg-green-600", icon: "🟢" },
];

export default function LyricsQuizGame() {
  const dispatch = useDispatch();
  const { quizQuestions, currentQuestionIndex, selectedAnswer, isAnswerRevealed, roundResults, myScore, scores } = 
    useSelector((state: RootState) => state.game);
  const { code } = useSelector((state: RootState) => state.room);
  const { emitEvent } = useSocket(code);
  
  const [timeLeft, setTimeLeft] = useState(20);
  const [showResults, setShowResults] = useState(false);

  const currentQuestion = quizQuestions[currentQuestionIndex];

  useEffect(() => {
    if (!currentQuestion || isAnswerRevealed) return;

    setTimeLeft(currentQuestion.timeLimit || 20);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentQuestion, currentQuestionIndex, isAnswerRevealed]);

  useEffect(() => {
    if (isAnswerRevealed) {
      setShowResults(true);
      const timeout = setTimeout(() => {
        setShowResults(false);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [isAnswerRevealed]);

  const handleSelectAnswer = (index: number) => {
    if (selectedAnswer !== null || isAnswerRevealed) return;
    dispatch(selectAnswer(index));
    emitEvent("quiz:answer", { questionIndex: currentQuestionIndex, answerIndex: index });
  };

  if (!currentQuestion) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <Trophy className="w-24 h-24 text-[#FFD700] mx-auto mb-6" />
          <h2 className="text-4xl font-bold mb-4">게임 종료!</h2>
          <div className="space-y-4">
            {scores.slice(0, 5).map((player, i) => (
              <motion.div
                key={player.odId}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.1 }}
                className={`flex items-center gap-4 p-4 rounded-xl ${
                  i === 0 ? "bg-[#FFD700]/20" : "bg-white/10"
                }`}
              >
                <span className="text-2xl font-bold w-8">#{i + 1}</span>
                <span className="flex-1 text-lg">{player.odName}</span>
                <span className="text-2xl font-bold text-[#FFD700]">{player.score}점</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 bg-black/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FF6B6B]/20">
            <Trophy className="w-5 h-5 text-[#FF6B6B]" />
            <span className="text-xl font-bold text-[#FF6B6B]">{myScore}점</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
            <Users className="w-4 h-4" />
            <span className="text-sm">{scores.length}명</span>
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
                      ? `${COLORS[index].bg} ring-4 ring-white`
                      : `${COLORS[index].bg} ${COLORS[index].hover}`
                  } disabled:cursor-not-allowed`}
                >
                  <span className="absolute top-3 left-3 text-2xl">{COLORS[index].icon}</span>
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
        {showResults && roundResults.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 p-6 bg-black/90 backdrop-blur-xl"
          >
            <div className="max-w-4xl mx-auto">
              <h3 className="text-xl font-bold mb-4 text-center">라운드 결과</h3>
              <div className="flex justify-center gap-4 flex-wrap">
                {roundResults.map((result) => (
                  <div
                    key={result.odId}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                      result.isCorrect ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {result.isCorrect ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    <span>{result.odName}</span>
                    <span className="font-bold">+{result.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
