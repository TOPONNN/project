"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Mic, MicOff, Trophy, Zap, Star, Volume2 } from "lucide-react";
import type { RootState } from "@/store";
import { updateCurrentTime, updateScores, updatePitch } from "@/store/slices/gameSlice";

interface LyricsLine {
  startTime: number;
  endTime: number;
  text: string;
}

interface PitchPoint {
  time: number;
  frequency: number;
  note: string;
  midi: number;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default function PerfectScoreGame() {
  const dispatch = useDispatch();
  const { currentSong, status, scores } = useSelector((state: RootState) => state.game);
  const { participants } = useSelector((state: RootState) => state.room);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [localTime, setLocalTime] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [currentScore, setCurrentScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [userPitch, setUserPitch] = useState<number>(0);
  const [targetPitch, setTargetPitch] = useState<number>(0);
  const [accuracy, setAccuracy] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [scorePopups, setScorePopups] = useState<{ id: number; score: number; type: string }[]>([]);

  const lyrics: LyricsLine[] = currentSong?.lyrics || [];
  const pitchData: PitchPoint[] = currentSong?.pitchData || [];

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

      const currentTarget = pitchData.find(p => Math.abs(p.time - time) < 0.05);
      if (currentTarget) {
        setTargetPitch(currentTarget.frequency);
      }
    };

    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [lyrics, pitchData, dispatch, volume]);

  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);

      setIsMicOn(true);
    } catch (error) {
      console.error("Microphone access denied:", error);
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    cancelAnimationFrame(animationRef.current);
    setIsMicOn(false);
  }, []);

  useEffect(() => {
    if (!isMicOn || !analyserRef.current) return;

    const detectPitch = () => {
      if (!analyserRef.current || !audioContextRef.current) return;

      const bufferLength = analyserRef.current.fftSize;
      const buffer = new Float32Array(bufferLength);
      analyserRef.current.getFloatTimeDomainData(buffer);

      const frequency = autoCorrelate(buffer, audioContextRef.current.sampleRate);

      if (frequency > 0) {
        setUserPitch(frequency);
        evaluatePitch(frequency);
      }

      animationRef.current = requestAnimationFrame(detectPitch);
    };

    detectPitch();
    return () => cancelAnimationFrame(animationRef.current);
  }, [isMicOn, targetPitch]);

  const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
    let size = buffer.length;
    let rms = 0;

    for (let i = 0; i < size; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return -1;

    let r1 = 0, r2 = size - 1;
    const threshold = 0.2;

    for (let i = 0; i < size / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) { r1 = i; break; }
    }
    for (let i = 1; i < size / 2; i++) {
      if (Math.abs(buffer[size - i]) < threshold) { r2 = size - i; break; }
    }

    buffer = buffer.slice(r1, r2);
    size = buffer.length;

    const c = new Array(size).fill(0);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size - i; j++) {
        c[i] += buffer[j] * buffer[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;

    let maxval = -1, maxpos = -1;
    for (let i = d; i < size; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    return sampleRate / maxpos;
  };

  const evaluatePitch = useCallback((userFreq: number) => {
    if (targetPitch <= 0) return;

    const cents = 1200 * Math.log2(userFreq / targetPitch);
    const absCents = Math.abs(cents);
    const acc = Math.max(0, 100 - absCents);
    setAccuracy(acc);

    if (absCents < 50) {
      const points = Math.round(acc);
      setCurrentScore(prev => prev + points);
      setCombo(prev => {
        const newCombo = prev + 1;
        setMaxCombo(max => Math.max(max, newCombo));
        return newCombo;
      });

      const type = absCents < 10 ? "PERFECT" : absCents < 25 ? "GREAT" : "GOOD";
      setScorePopups(prev => [...prev.slice(-5), { id: Date.now(), score: points, type }]);
    } else {
      setCombo(0);
    }

    dispatch(updatePitch({ frequency: userFreq, accuracy: acc }));
  }, [targetPitch, dispatch]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
      if (!isMicOn) startMicrophone();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, isMicOn, startMicrophone]);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const frequencyToNote = (freq: number): string => {
    if (freq <= 0) return "-";
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    const noteIndex = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    return `${NOTES[noteIndex]}${octave}`;
  };

  const progress = currentSong?.duration ? (localTime / currentSong.duration) * 100 : 0;
  const pitchColor = accuracy > 80 ? "#22c55e" : accuracy > 50 ? "#eab308" : "#ef4444";

  const getGrade = (score: number) => {
    if (score >= 95000) return { grade: "S+", color: "text-yellow-300" };
    if (score >= 90000) return { grade: "S", color: "text-yellow-400" };
    if (score >= 80000) return { grade: "A", color: "text-green-400" };
    if (score >= 70000) return { grade: "B", color: "text-blue-400" };
    if (score >= 60000) return { grade: "C", color: "text-purple-400" };
    return { grade: "D", color: "text-gray-400" };
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-purple-900/30 via-black to-black">
      {currentSong?.instrumentalUrl && (
        <audio ref={audioRef} src={currentSong.instrumentalUrl} />
      )}

      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30">
            <Trophy className="w-6 h-6 text-yellow-400" />
            <span className="text-3xl font-bold text-yellow-400">{currentScore.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
            <Zap className="w-5 h-5 text-purple-400" />
            <span className="text-xl font-bold text-purple-400">{combo}x</span>
            {combo >= 10 && <span className="text-xs text-purple-300">MAX: {maxCombo}</span>}
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold text-white">{currentSong?.title || "노래 제목"}</h2>
          <p className="text-sm text-gray-400">{currentSong?.artist || "아티스트"}</p>
        </div>

        <div className="flex items-center gap-3">
          {participants.slice(0, 4).map((p, i) => {
            const playerScoreData = scores.find(s => s.odId === p.id);
            const playerScore = playerScoreData?.score || 0;
            const { grade, color } = getGrade(playerScore);
            return (
              <div key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${i === 0 ? "bg-yellow-500/20 border border-yellow-500/30" : "bg-white/5"}`}>
                <span className={`text-lg font-bold ${i === 0 ? "text-yellow-400" : "text-gray-500"}`}>#{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-white">{p.nickname}</p>
                  <p className="text-xs text-gray-400">{playerScore.toLocaleString()}</p>
                </div>
                <span className={`text-lg font-bold ${color}`}>{grade}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-24 bg-gradient-to-b from-white/5 to-transparent flex flex-col items-center py-4 border-r border-white/10">
          <p className="text-xs text-gray-500 mb-2">음정</p>
          {NOTES.slice().reverse().map((note, i) => {
            const isTarget = targetPitch > 0 && frequencyToNote(targetPitch).startsWith(note);
            const isUser = userPitch > 0 && frequencyToNote(userPitch).startsWith(note);
            return (
              <div
                key={note}
                className={`w-full h-7 flex items-center justify-center text-xs font-mono transition-all ${
                  isTarget ? "bg-yellow-500/40 text-yellow-300 font-bold" :
                  isUser ? "bg-green-500/30 text-green-400" : "text-white/20"
                }`}
              >
                {note}
              </div>
            );
          })}
        </div>

        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          <div className="absolute left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-500/50 via-yellow-500 to-yellow-500/50" />

          {userPitch > 0 && (
            <motion.div
              className="absolute left-4 w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: pitchColor,
                top: `${Math.max(5, Math.min(95, 50 - (12 * Math.log2(userPitch / (targetPitch || 440))) * 3))}%`,
                boxShadow: `0 0 20px ${pitchColor}`,
              }}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 0.15, repeat: Infinity }}
            >
              <Mic className="w-5 h-5 text-white" />
            </motion.div>
          )}

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <AnimatePresence>
              {scorePopups.map(popup => (
                <motion.div
                  key={popup.id}
                  initial={{ opacity: 1, y: 0, scale: 1 }}
                  animate={{ opacity: 0, y: -60, scale: 1.5 }}
                  exit={{ opacity: 0 }}
                  className={`absolute text-3xl font-black ${
                    popup.type === "PERFECT" ? "text-yellow-400" :
                    popup.type === "GREAT" ? "text-green-400" : "text-blue-400"
                  }`}
                  style={{ top: "40%" }}
                >
                  {popup.type}! +{popup.score}
                </motion.div>
              ))}
            </AnimatePresence>

            <div className="bg-black/60 backdrop-blur-xl rounded-3xl p-8 border border-white/10">
              <AnimatePresence mode="wait">
                {currentLyricIndex >= 0 && lyrics[currentLyricIndex] && (
                  <motion.p
                    key={currentLyricIndex}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="text-4xl font-bold text-center"
                    style={{ color: pitchColor }}
                  >
                    {lyrics[currentLyricIndex].text}
                  </motion.p>
                )}
              </AnimatePresence>

              {lyrics[currentLyricIndex + 1] && (
                <p className="text-xl text-gray-500 text-center mt-4">
                  {lyrics[currentLyricIndex + 1].text}
                </p>
              )}
            </div>

            <div className="mt-8 flex items-center gap-6">
              <div className="text-center">
                <p className="text-sm text-gray-500">내 음정</p>
                <p className="text-2xl font-bold text-green-400">{frequencyToNote(userPitch)}</p>
              </div>
              <div className="w-px h-12 bg-white/20" />
              <div className="text-center">
                <p className="text-sm text-gray-500">목표 음정</p>
                <p className="text-2xl font-bold text-yellow-400">{frequencyToNote(targetPitch)}</p>
              </div>
              <div className="w-px h-12 bg-white/20" />
              <div className="text-center">
                <p className="text-sm text-gray-500">정확도</p>
                <p className="text-2xl font-bold" style={{ color: pitchColor }}>{accuracy.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-black/50 border-t border-white/10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-3">
            <span className="text-sm text-gray-400 w-12 text-right font-mono">{formatTime(localTime)}</span>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-gray-400 w-12 font-mono">{formatTime(currentSong?.duration || 0)}</span>
          </div>

          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-gray-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (audioRef.current) audioRef.current.volume = v;
                }}
                className="w-20 accent-purple-500"
              />
            </div>

            <button
              onClick={() => isMicOn ? stopMicrophone() : startMicrophone()}
              className={`p-3 rounded-full transition-all ${
                isMicOn
                  ? "bg-green-500/20 text-green-400 border border-green-500/50 shadow-lg shadow-green-500/20"
                  : "bg-white/10 text-gray-400 hover:bg-white/20"
              }`}
            >
              {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            <motion.button
              onClick={togglePlay}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="p-5 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-yellow-500 text-white shadow-xl"
            >
              {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
            </motion.button>

            <div className="w-[100px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
