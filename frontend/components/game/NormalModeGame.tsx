"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipForward, Volume2, VolumeX, Mic, MicOff, RotateCcw } from "lucide-react";
import type { RootState } from "@/store";
import { updateCurrentTime } from "@/store/slices/gameSlice";

interface LyricsLine {
  startTime: number;
  endTime: number;
  text: string;
}

export default function NormalModeGame() {
  const dispatch = useDispatch();
  const { currentSong, status } = useSelector((state: RootState) => state.game);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [volume, setVolume] = useState(0.8);

  const lyrics: LyricsLine[] = currentSong?.lyrics || [];

  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    audio.volume = volume;

    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setLocalTime(time);
      dispatch(updateCurrentTime(time));

      const index = lyrics.findIndex((line, i) => {
        const nextLine = lyrics[i + 1];
        return time >= line.startTime && (nextLine ? time < nextLine.startTime : time <= line.endTime);
      });
      setCurrentLyricIndex(index);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [lyrics, dispatch, volume]);

  useEffect(() => {
    if (status === "playing" && audioRef.current && !isPlaying) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [status]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !currentSong?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * currentSong.duration;
    audioRef.current.currentTime = newTime;
    setLocalTime(newTime);
  }, [currentSong?.duration]);

  const handleRestart = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setLocalTime(0);
    setCurrentLyricIndex(-1);
  }, []);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = currentSong?.duration ? (localTime / currentSong.duration) * 100 : 0;

  const getLyricProgress = (line: LyricsLine) => {
    if (localTime < line.startTime) return 0;
    if (localTime > line.endTime) return 100;
    return ((localTime - line.startTime) / (line.endTime - line.startTime)) * 100;
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-black via-gray-900 to-black">
      {currentSong?.instrumentalUrl && (
        <audio
          ref={audioRef}
          src={currentSong.instrumentalUrl}
          muted={isMuted}
        />
      )}

      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#C0C0C0]/5 via-transparent to-transparent" />
        
        <div className="text-center mb-8 z-10">
          <h2 className="text-2xl font-bold text-white mb-2">{currentSong?.title || "노래 제목"}</h2>
          <p className="text-gray-400">{currentSong?.artist || "아티스트"}</p>
        </div>

        <div className="w-full max-w-4xl z-10">
          <div className="relative h-[350px] overflow-hidden rounded-3xl bg-black/50 backdrop-blur-xl border border-white/10">
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
              <AnimatePresence mode="popLayout">
                {lyrics.map((line, index) => {
                  const isActive = index === currentLyricIndex;
                  const isPast = index < currentLyricIndex;
                  const isFuture = index > currentLyricIndex;
                  const distance = index - currentLyricIndex;

                  if (Math.abs(distance) > 3) return null;

                  return (
                    <motion.div
                      key={`${index}-${line.text}`}
                      initial={{ opacity: 0, y: 80, scale: 0.8 }}
                      animate={{
                        opacity: isActive ? 1 : isPast ? 0.3 : 0.5,
                        y: distance * 70,
                        scale: isActive ? 1.15 : 1,
                        filter: isActive ? "blur(0px)" : "blur(1px)",
                      }}
                      exit={{ opacity: 0, y: -80, scale: 0.8 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="absolute text-center w-full px-4"
                    >
                      {isActive ? (
                        <div className="relative inline-block">
                          <span className="text-3xl font-bold text-white/30">{line.text}</span>
                          <motion.span
                            className="absolute inset-0 text-3xl font-bold text-[#C0C0C0] overflow-hidden whitespace-nowrap"
                            style={{ clipPath: `inset(0 ${100 - getLyricProgress(line)}% 0 0)` }}
                          >
                            {line.text}
                          </motion.span>
                        </div>
                      ) : (
                        <span className={`text-2xl font-medium ${isPast ? "text-gray-600" : "text-gray-400"}`}>
                          {line.text}
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {lyrics.length === 0 && (
                <p className="text-gray-500 text-xl">가사를 불러오는 중...</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-gradient-to-t from-black via-black/95 to-transparent">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm text-gray-400 w-12 text-right font-mono">{formatTime(localTime)}</span>
            <div
              className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden cursor-pointer group"
              onClick={handleSeek}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-[#C0C0C0] to-white relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            </div>
            <span className="text-sm text-gray-400 w-12 font-mono">{formatTime(currentSong?.duration || 0)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => {
                  const newVolume = parseFloat(e.target.value);
                  setVolume(newVolume);
                  if (audioRef.current) audioRef.current.volume = newVolume;
                }}
                className="w-24 accent-[#C0C0C0]"
              />
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
              <button
                onClick={handleRestart}
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <motion.button
                onClick={togglePlay}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-5 rounded-full bg-gradient-to-r from-[#C0C0C0] to-white text-black shadow-lg shadow-white/20"
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
              </motion.button>
              <button className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="w-[140px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
