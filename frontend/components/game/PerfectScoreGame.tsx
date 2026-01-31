"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, Volume2, Mic, MicOff, RotateCcw, SkipForward, AlertCircle } from "lucide-react";
import type { RootState } from "@/store";
import { updateCurrentTime, setGameStatus } from "@/store/slices/gameSlice";

interface LyricsWord {
  startTime: number;
  endTime: number;
  text: string;
  pitch?: number;
  note?: string;
  midi?: number;
  voiced?: number;
}

interface LyricsLine {
  startTime: number;
  endTime: number;
  text: string;
  words?: LyricsWord[];
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_LABELS = ["C", "D", "E", "F", "G", "A", "B"];
const VISIBLE_WINDOW = 8;
const HIT_LINE_RATIO = 0.18;
const USER_TRAIL_SECONDS = 10;

export default function PerfectScoreGame() {
  const dispatch = useDispatch();
  const { currentSong, status, songQueue } = useSelector((state: RootState) => state.game);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timeAnimationRef = useRef<number | null>(null);
  const pitchAnimationRef = useRef<number | null>(null);
  const drawAnimationRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const scoredWordsRef = useRef<Set<string>>(new Set());
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const userPitchTrailRef = useRef<{ time: number; midi: number }[]>([]);
  const latestPitchRef = useRef<{ frequency: number; time: number }>({ frequency: 0, time: 0 });
  const lastPitchUpdateRef = useRef(0);
  const isMicOnRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [localTime, setLocalTime] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [scorePopups, setScorePopups] = useState<{ id: number; type: string; points: number }[]>([]);
  const [volume, setVolume] = useState(1);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [duration, setDuration] = useState(0);

  const lyrics: LyricsLine[] = currentSong?.lyrics || [];
  const audioUrl = currentSong?.instrumentalUrl || currentSong?.audioUrl;
  const progress = duration ? (localTime / duration) * 100 : 0;

  isMicOnRef.current = isMicOn;

  const words = useMemo(() => {
    if (!lyrics.length) return [] as Array<LyricsWord & { lineIndex: number; wordIndex: number }>;
    const list: Array<LyricsWord & { lineIndex: number; wordIndex: number }> = [];
    lyrics.forEach((line, lineIndex) => {
      line.words?.forEach((word, wordIndex) => {
        if (typeof word.midi === "number") {
          list.push({ ...word, lineIndex, wordIndex });
        }
      });
    });
    return list;
  }, [lyrics]);

  const midiRange = useMemo(() => {
    if (words.length === 0) return { min: 45, max: 75 };
    let min = 127;
    let max = 0;
    words.forEach((word) => {
      if (typeof word.midi === "number") {
        min = Math.min(min, word.midi);
        max = Math.max(max, word.midi);
      }
    });
    return { min: Math.max(30, min - 3), max: Math.min(96, max + 3) };
  }, [words]);

  const findCurrentLyricIndex = useCallback((time: number): number => {
    if (lyrics.length === 0) return -1;
    if (time < lyrics[0].startTime) return 0;

    for (let i = 0; i < lyrics.length; i++) {
      const line = lyrics[i];
      const nextLine = lyrics[i + 1];

      if (time >= line.startTime && time <= line.endTime) {
        return i;
      }

      if (time > line.endTime) {
        if (nextLine && time < nextLine.startTime) {
          const gapDuration = nextLine.startTime - line.endTime;
          if (time <= line.endTime + 0.5) return i;
          if (gapDuration <= 3.0) return i + 1;
          return -1;
        }
        if (!nextLine) {
          if (time <= line.endTime + 2.0) return i;
          return -1;
        }
      }
    }

    return -1;
  }, [lyrics]);

  const currentLine = currentLyricIndex >= 0 ? lyrics[currentLyricIndex] : null;
  const nextLine = useMemo(() => {
    if (currentLyricIndex >= 0) {
      return lyrics[currentLyricIndex + 1] || null;
    }
    return lyrics.find(line => line.startTime > localTime) || null;
  }, [currentLyricIndex, lyrics, localTime]);

  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    audio.volume = volume;

    const handleEnded = () => {
      setIsPlaying(false);
      dispatch(setGameStatus("finished"));
    };

    const handleCanPlay = () => setAudioLoaded(true);

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [dispatch, volume]);

  useEffect(() => {
    if (status === "playing" && audioRef.current && !isPlaying && audioLoaded) {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  }, [status, audioLoaded, isPlaying]);

  useEffect(() => {
    if (!isPlaying || !audioRef.current) {
      if (timeAnimationRef.current) {
        cancelAnimationFrame(timeAnimationRef.current);
        timeAnimationRef.current = null;
      }
      return;
    }

    const updateTime = () => {
      if (!audioRef.current || !isPlaying) return;
      const time = audioRef.current.currentTime;
      if (Math.abs(time - lastTimeRef.current) > 0.016) {
        if (Math.floor(time * 10) !== Math.floor(lastTimeRef.current * 10)) {
          dispatch(updateCurrentTime(time));
        }
        lastTimeRef.current = time;
        setLocalTime(time);

        const newIndex = findCurrentLyricIndex(time);
        if (newIndex !== currentLyricIndex) {
          setCurrentLyricIndex(newIndex);
        }

        if (newIndex >= 0 && lyrics[newIndex]?.words?.length) {
          const wordIndex = lyrics[newIndex].words!.findIndex(
            word => time >= word.startTime && time <= word.endTime
          );
          if (wordIndex >= 0) {
            const wordKey = `${newIndex}-${wordIndex}`;
            if (!scoredWordsRef.current.has(wordKey)) {
              scoredWordsRef.current.add(wordKey);
              const word = lyrics[newIndex].words![wordIndex];
              const targetMidi = word.midi;
              if (typeof targetMidi === "number") {
                const targetFreq = 440 * Math.pow(2, (targetMidi - 69) / 12);
                const userFreq = latestPitchRef.current.frequency;
                const hasUserPitch = userFreq > 0;
                const cents = hasUserPitch ? 1200 * Math.log2(userFreq / targetFreq) : 999;
                const absCents = Math.abs(cents);
                const type = absCents < 10 ? "PERFECT" : absCents < 25 ? "GREAT" : absCents < 50 ? "GOOD" : "MISS";
                const basePoints = type === "PERFECT" ? 100 : type === "GREAT" ? 75 : type === "GOOD" ? 50 : 0;
                if (basePoints > 0 && isMicOnRef.current) {
                  const mult = Math.min(2, 1 + comboRef.current * 0.1);
                  const points = Math.round(basePoints * mult);
                  comboRef.current += 1;
                  scoreRef.current += points;
                  setScore(scoreRef.current);
                  setCombo(comboRef.current);
                  setScorePopups(prev => [...prev.slice(-3), { id: Date.now(), type, points }]);
                } else {
                  comboRef.current = 0;
                  setCombo(0);
                  setScorePopups(prev => [...prev.slice(-3), { id: Date.now(), type: "MISS", points: 0 }]);
                }
              }
            }
          }
        }
      }
      timeAnimationRef.current = requestAnimationFrame(updateTime);
    };

    timeAnimationRef.current = requestAnimationFrame(updateTime);
    return () => {
      if (timeAnimationRef.current) {
        cancelAnimationFrame(timeAnimationRef.current);
        timeAnimationRef.current = null;
      }
    };
  }, [currentLyricIndex, dispatch, findCurrentLyricIndex, isPlaying, lyrics]);

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
      setIsMicOn(false);
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (pitchAnimationRef.current) {
      cancelAnimationFrame(pitchAnimationRef.current);
    }
    setIsMicOn(false);
  }, []);

  useEffect(() => {
    if (!isMicOn || !analyserRef.current || !audioContextRef.current) return;

    const detectPitch = () => {
      if (!analyserRef.current || !audioContextRef.current) return;
      const bufferLength = analyserRef.current.fftSize;
      const buffer = new Float32Array(bufferLength);
      analyserRef.current.getFloatTimeDomainData(buffer);
      const frequency = autoCorrelate(buffer, audioContextRef.current.sampleRate);
      const now = audioRef.current?.currentTime ?? localTime;

      if (frequency > 0) {
        latestPitchRef.current = { frequency, time: now };
        const midi = 69 + 12 * Math.log2(frequency / 440);
        userPitchTrailRef.current.push({ time: now, midi });
        if (now - lastPitchUpdateRef.current > 0.08) {
          lastPitchUpdateRef.current = now;
        }
      }

      userPitchTrailRef.current = userPitchTrailRef.current.filter(p => now - p.time <= USER_TRAIL_SECONDS);
      pitchAnimationRef.current = requestAnimationFrame(detectPitch);
    };

    detectPitch();
    return () => {
      if (pitchAnimationRef.current) {
        cancelAnimationFrame(pitchAnimationRef.current);
      }
    };
  }, [isMicOn, localTime]);

  const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
    let size = buffer.length;
    let rms = 0;
    for (let i = 0; i < size; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return -1;

    let r1 = 0;
    let r2 = size - 1;
    const threshold = 0.2;

    for (let i = 0; i < size / 2; i++) {
      if (Math.abs(buffer[i]) < threshold) {
        r1 = i;
        break;
      }
    }

    for (let i = 1; i < size / 2; i++) {
      if (Math.abs(buffer[size - i]) < threshold) {
        r2 = size - i;
        break;
      }
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

    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < size; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    return sampleRate / maxpos;
  };

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !audioLoaded) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
      if (isMicOn && !analyserRef.current) {
        startMicrophone();
      }
    }
    setIsPlaying(!isPlaying);
  }, [audioLoaded, isPlaying, isMicOn, startMicrophone]);

  const handleRestart = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setLocalTime(0);
    setCurrentLyricIndex(-1);
    setScore(0);
    setCombo(0);
    scoreRef.current = 0;
    comboRef.current = 0;
    scoredWordsRef.current.clear();
    userPitchTrailRef.current = [];
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    audioRef.current.currentTime = newTime;
    setLocalTime(newTime);
  }, [duration]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      ctx.fillStyle = "rgba(6, 8, 20, 0.6)";
      ctx.fillRect(0, 0, width, height);

      const leftPadding = 54;
      const topPadding = 24;
      const bottomPadding = 24;
      const staffHeight = height - topPadding - bottomPadding;
      const hitLineX = Math.max(width * HIT_LINE_RATIO, leftPadding + 16);
      const pixelsPerSecond = width / VISIBLE_WINDOW;
      const leftWindow = VISIBLE_WINDOW * HIT_LINE_RATIO;
      const rightWindow = VISIBLE_WINDOW - leftWindow;
      const now = audioRef.current?.currentTime ?? localTime;
      const startTime = now - leftWindow;
      const endTime = now + rightWindow;

      const midiToY = (midi: number) => {
        const range = Math.max(1, midiRange.max - midiRange.min);
        return topPadding + ((midiRange.max - midi) / range) * staffHeight;
      };

      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let midi = midiRange.min; midi <= midiRange.max; midi += 1) {
        const y = midiToY(midi);
        ctx.beginPath();
        ctx.moveTo(leftPadding, y);
        ctx.lineTo(width, y);
        ctx.stroke();

        const note = NOTE_NAMES[((midi % 12) + 12) % 12];
        if (NOTE_LABELS.includes(note)) {
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.font = "12px 'Noto Sans KR', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(note, 22, y);
        }
      }

      ctx.strokeStyle = "rgba(255,215,0,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hitLineX, 0);
      ctx.lineTo(hitLineX, height);
      ctx.stroke();

      ctx.fillStyle = "rgba(255,255,255,0.25)";
      words.forEach((word) => {
        if (typeof word.midi !== "number") return;
        if (word.endTime < startTime || word.startTime > endTime) return;
        const xStart = hitLineX + (word.startTime - now) * pixelsPerSecond;
        const xEnd = hitLineX + (word.endTime - now) * pixelsPerSecond;
        const barWidth = Math.max(2, xEnd - xStart);
        const y = midiToY(word.midi);
        ctx.fillRect(xStart, y - 6, barWidth, 12);
      });

      const trail = userPitchTrailRef.current;
      if (trail.length > 1) {
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "rgba(255,215,0,0.5)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        trail.forEach((point, index) => {
          const x = hitLineX + (point.time - now) * pixelsPerSecond;
          const y = midiToY(point.midi);
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      drawAnimationRef.current = requestAnimationFrame(draw);
    };

    drawAnimationRef.current = requestAnimationFrame(draw);
    return () => {
      if (drawAnimationRef.current) {
        cancelAnimationFrame(drawAnimationRef.current);
        drawAnimationRef.current = null;
      }
    };
  }, [localTime, midiRange.max, midiRange.min, words]);

  useEffect(() => {
    if (!isMicOn) {
      stopMicrophone();
      return;
    }
    if (!analyserRef.current) {
      startMicrophone();
    }
  }, [isMicOn, startMicrophone, stopMicrophone]);

  useEffect(() => {
    return () => {
      if (timeAnimationRef.current) cancelAnimationFrame(timeAnimationRef.current);
      if (pitchAnimationRef.current) cancelAnimationFrame(pitchAnimationRef.current);
      if (drawAnimationRef.current) cancelAnimationFrame(drawAnimationRef.current);
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(track => track.stop());
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  if (!currentSong) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-16 h-16 text-gray-500 mb-4" />
        <p className="text-gray-400">노래 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-[#0a0e27] via-[#0d1117] to-black text-white overflow-hidden">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin="anonymous"
        />
      )}

      <div className="absolute top-0 left-0 right-0 z-20 px-4 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">TJ 퍼펙트 스코어</p>
            <h1 className="text-xl sm:text-2xl font-bold">{currentSong.title}</h1>
            <p className="text-sm text-white/50">{currentSong.artist}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl sm:text-4xl font-black text-[#FFD700] tabular-nums">
              {score.toLocaleString()}
            </div>
            <div className="text-lg font-bold text-[#A855F7]">콤보 {combo}</div>
          </div>
        </div>

        <div className="mt-4 h-2 w-full bg-white/10 rounded-full overflow-hidden" onClick={handleSeek}>
          <motion.div
            className="h-full bg-gradient-to-r from-[#FFD700] via-[#A855F7] to-[#38BDF8]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="absolute inset-x-0 top-[12%] bottom-[18%] px-2 sm:px-6">
        <div className="relative w-full h-full">
          <canvas ref={canvasRef} className="w-full h-full rounded-2xl border border-white/10 bg-black/40" />
        </div>
      </div>

      <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
        <AnimatePresence>
          {scorePopups.map(popup => (
            <motion.div
              key={popup.id}
              initial={{ opacity: 1, y: 0, scale: 1 }}
              animate={{ opacity: 0, y: -60, scale: 1.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className={`text-4xl font-black drop-shadow-[0_6px_20px_rgba(0,0,0,0.6)] ${
                popup.type === "PERFECT"
                  ? "text-[#FFD700]"
                  : popup.type === "GREAT"
                  ? "text-green-400"
                  : popup.type === "GOOD"
                  ? "text-blue-400"
                  : "text-red-400"
              }`}
            >
              {popup.type}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-[16%] left-0 right-0 z-20 px-4 sm:px-10">
        <div className="flex flex-col gap-3">
          <div className="text-2xl sm:text-3xl md:text-4xl font-black text-white text-center" style={{ WebkitTextStroke: "2px rgba(0,0,0,0.9)", paintOrder: "stroke fill" }}>
            {currentLine?.text || ""}
          </div>
          <div className="text-lg sm:text-2xl font-bold text-white/50 text-center" style={{ WebkitTextStroke: "1px rgba(0,0,0,0.8)", paintOrder: "stroke fill" }}>
            {nextLine?.text || ""}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-30 px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-white/60 font-mono w-10 text-right">{formatTime(localTime)}</span>
            <div
              className="flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer group hover:h-2 transition-all"
              onClick={handleSeek}
            >
              <div className="h-full bg-[#FFD700] rounded-full" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-xs text-white/60 font-mono w-10">{formatTime(duration)}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-white/60" />
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
                  className="w-24 accent-[#FFD700]"
                />
              </div>

              <button
                onClick={() => setIsMicOn(!isMicOn)}
                className={`p-2 rounded-full transition-all ${
                  isMicOn ? "bg-[#FFD700]/20 text-[#FFD700]" : "bg-white/10 text-white/60"
                }`}
              >
                {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex items-center gap-5">
              <button
                onClick={handleRestart}
                className="p-2 text-white/70 hover:text-white transition-colors"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                onClick={togglePlay}
                disabled={!audioLoaded}
                className="w-12 h-12 rounded-full bg-[#FFD700] text-black flex items-center justify-center shadow-xl disabled:opacity-50"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
              </button>
              <button
                onClick={() => window.dispatchEvent(new Event("kero:skipForward"))}
                className="p-2 text-white/70 hover:text-white transition-colors"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-white/50 font-mono hidden sm:block">
              {songQueue.length}곡 대기 중
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {status === "finished" && score > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/60"
          >
            <div className="bg-black/70 border border-white/10 rounded-3xl px-10 py-8 text-center shadow-2xl">
              <p className="text-white/60 tracking-widest text-sm">최종 점수</p>
              <p className="text-4xl sm:text-5xl font-black text-[#FFD700] mt-2 tabular-nums">{score.toLocaleString()}</p>
              <p className="text-[#A855F7] font-bold mt-3">최고 콤보 {combo}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const formatTime = (time: number) => {
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};
