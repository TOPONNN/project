"use client";

import { useState, useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipForward, Volume2, VolumeX, Mic, MicOff } from "lucide-react";
import type { RootState } from "@/store";

interface LyricsLine {
  time: number;
  text: string;
}

export default function NormalModeGame() {
  const { currentSong, status, currentTime } = useSelector((state: RootState) => state.game);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);

  const lyrics: LyricsLine[] = currentSong?.lyrics || [];

  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const handleTimeUpdate = () => {
      setLocalTime(audio.currentTime);
      
      const index = lyrics.findIndex((line, i) => {
        const nextLine = lyrics[i + 1];
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

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <div className="relative h-[300px] overflow-hidden rounded-2xl bg-gradient-to-b from-white/5 to-transparent">
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {lyrics.map((line, index) => {
                  const isActive = index === currentLyricIndex;
                  const isPast = index < currentLyricIndex;
                  const distance = Math.abs(index - currentLyricIndex);
                  
                  if (distance > 3) return null;

                  return (
                    <motion.p
                      key={index}
                      initial={{ opacity: 0, y: 50 }}
                      animate={{
                        opacity: isActive ? 1 : isPast ? 0.3 : 0.5,
                        y: (index - currentLyricIndex) * 60,
                        scale: isActive ? 1.2 : 1,
                      }}
                      exit={{ opacity: 0, y: -50 }}
                      transition={{ duration: 0.3 }}
                      className={`absolute text-center text-2xl font-bold transition-colors ${
                        isActive ? "text-[#C0C0C0]" : "text-white/50"
                      }`}
                    >
                      {line.text}
                    </motion.p>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-white/5 backdrop-blur-xl border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm text-gray-400 w-12">{formatTime(localTime)}</span>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#C0C0C0] to-white"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-gray-400 w-12">{formatTime(currentSong?.duration || 0)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <button
                onClick={() => setIsMicOn(!isMicOn)}
                className={`p-3 rounded-full transition-colors ${
                  isMicOn ? "bg-green-500/20 text-green-400" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
            </div>

            <div className="flex items-center gap-4">
              <motion.button
                onClick={togglePlay}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-4 rounded-full bg-[#C0C0C0] text-black"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
              </motion.button>
              <button className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="w-[88px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
