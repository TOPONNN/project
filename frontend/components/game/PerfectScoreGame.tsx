"use client";

import { useState, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Mic, Trophy, Zap } from "lucide-react";
import type { RootState } from "@/store";

const PITCH_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default function PerfectScoreGame() {
  const { currentSong, currentPitch, targetPitch, myScore, myCombo, scores } = useSelector(
    (state: RootState) => state.game
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);

  const lyrics = currentSong?.lyrics || [];

  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const handleTimeUpdate = () => {
      setLocalTime(audio.currentTime);
      const index = lyrics.findIndex((line: { time: number }, i: number) => {
        const nextLine = lyrics[i + 1] as { time: number } | undefined;
        return audio.currentTime >= line.time && (!nextLine || audio.currentTime < nextLine.time);
      });
      setCurrentLyricIndex(index);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [lyrics]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const pitchDifference = Math.abs(currentPitch - targetPitch);
  const accuracy = Math.max(0, 100 - pitchDifference * 10);
  const pitchColor = accuracy > 80 ? "#22c55e" : accuracy > 50 ? "#eab308" : "#ef4444";

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = currentSong?.duration ? (localTime / currentSong.duration) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      {currentSong?.audioUrl && (
        <audio ref={audioRef} src={currentSong.instrumentalUrl || currentSong.audioUrl} />
      )}

      <div className="flex items-center justify-between p-4 bg-black/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#FFD700]/20">
            <Trophy className="w-5 h-5 text-[#FFD700]" />
            <span className="text-2xl font-bold text-[#FFD700]">{myScore}</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/20">
            <Zap className="w-5 h-5 text-orange-400" />
            <span className="text-lg font-bold text-orange-400">x{myCombo}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {scores.slice(0, 3).map((player, i) => (
            <div key={player.odId} className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
              <span className="text-xs text-gray-400">#{i + 1}</span>
              <span className="text-sm font-medium">{player.odName}</span>
              <span className="text-sm font-bold text-[#FFD700]">{player.score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex">
        <div className="w-20 bg-white/5 flex flex-col items-center py-4 gap-1">
          {PITCH_NOTES.slice().reverse().map((note, i) => (
            <div
              key={note}
              className={`w-full h-6 flex items-center justify-center text-xs font-mono ${
                i === Math.round(targetPitch) % 12 ? "bg-[#FFD700]/30 text-[#FFD700]" : "text-white/30"
              }`}
            >
              {note}
            </div>
          ))}
        </div>

        <div className="flex-1 relative overflow-hidden">
          <div className="absolute left-20 top-0 bottom-0 w-1 bg-white/20" />
          
          <motion.div
            className="absolute left-16 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ 
              backgroundColor: pitchColor,
              top: `${50 - (currentPitch - targetPitch) * 5}%`,
            }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.2 }}
          >
            <Mic className="w-4 h-4 text-white" />
          </motion.div>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              {currentLyricIndex >= 0 && lyrics[currentLyricIndex] && (
                <motion.p
                  key={currentLyricIndex}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="text-3xl font-bold text-center px-8"
                  style={{ color: pitchColor }}
                >
                  {(lyrics[currentLyricIndex] as { text: string }).text}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/50">
              <span className="text-sm text-gray-400">정확도</span>
              <span className="text-2xl font-bold" style={{ color: pitchColor }}>
                {accuracy.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white/5 border-t border-white/10">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <motion.button
            onClick={togglePlay}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="p-3 rounded-full bg-[#FFD700] text-black"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </motion.button>
          
          <span className="text-sm text-gray-400 w-12">{formatTime(localTime)}</span>
          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#FFD700] to-yellow-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-sm text-gray-400 w-12">{formatTime(currentSong?.duration || 0)}</span>
        </div>
      </div>
    </div>
  );
}
