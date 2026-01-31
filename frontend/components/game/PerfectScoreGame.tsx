"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { AnimatePresence, motion } from "framer-motion";
import { Play, Pause, Volume2, Mic, MicOff, RotateCcw, SkipForward, AlertCircle, Music } from "lucide-react";
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

const VISIBLE_WINDOW = 8;
const HIT_LINE_RATIO = 0.18;
const USER_TRAIL_SECONDS = 3;
const MIDI_MIN = 36;
const MIDI_MAX = 95;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export default function PerfectScoreGame() {
  const dispatch = useDispatch();
  const { currentSong, status, songQueue } = useSelector((state: RootState) => state.game);

  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  
  const lastTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const isMicOnRef = useRef(false);
  const userPitchTrailRef = useRef<{ time: number; midi: number }[]>([]);
  const scoredResultsRef = useRef<Map<string, string>>(new Map());
  const latestPitchRef = useRef<{ frequency: number; time: number }>({ frequency: 0, time: 0 });
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [localTime, setLocalTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [volume, setVolume] = useState(1);
  const [scorePopups, setScorePopups] = useState<{ id: number; type: string; points: number }[]>([]);

  const lyrics: LyricsLine[] = currentSong?.lyrics || [];
  const audioUrl = currentSong?.instrumentalUrl || currentSong?.audioUrl;

  isMicOnRef.current = isMicOn;

  const flatWords = useMemo(() => {
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
      if (isMicOn && !audioContextRef.current) {
        startMicrophone();
      }
    }
  }, [status, audioLoaded, isPlaying, isMicOn]);

  const startMicrophone = useCallback(async () => {
    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (mediaStreamRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      
      setIsMicOn(true);
    } catch (error) {
      console.error("Microphone access denied:", error);
      setIsMicOn(false);
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setIsMicOn(false);
  }, []);

  const toggleMic = () => {
    if (isMicOn) stopMicrophone();
    else startMicrophone();
  };

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

  const findCurrentLyricIndex = useCallback((time: number): number => {
    if (lyrics.length === 0) return -1;
    if (time < lyrics[0].startTime) return 0;
    
    for (let i = 0; i < lyrics.length; i++) {
      const line = lyrics[i];
      const nextLine = lyrics[i + 1];
      
      if (time >= line.startTime && time <= line.endTime) return i;
      
      if (time > line.endTime) {
        if (!nextLine) {
          return time <= line.endTime + 2.0 ? i : -1;
        }
        const gap = nextLine.startTime - line.endTime;
        if (time <= line.endTime + 0.5) return i;
        if (gap <= 3.0) return i + 1;
        return -1;
      }
    }
    return -1;
  }, [lyrics]);

  const loop = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) {
       rafRef.current = requestAnimationFrame(loop);
       return;
    }

    const audio = audioRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let currentTime = localTime;
    if (isPlaying && audio) {
        currentTime = audio.currentTime;
        if (Math.abs(currentTime - lastTimeRef.current) > 0.05) {
            lastTimeRef.current = currentTime;
            setLocalTime(currentTime);
            dispatch(updateCurrentTime(currentTime));
            
            const idx = findCurrentLyricIndex(currentTime);
            if (idx !== currentLyricIndex) {
                setCurrentLyricIndex(idx);
            }
        }
    }

    if (isMicOnRef.current && analyserRef.current && audioContextRef.current) {
        const buffer = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buffer);
        const frequency = autoCorrelate(buffer, audioContextRef.current.sampleRate);
        
        if (frequency > 0) {
            latestPitchRef.current = { frequency, time: currentTime };
            const rawMidi = 69 + 12 * Math.log2(frequency / 440);
            const quantizedMidi = Math.round(rawMidi);
            
            userPitchTrailRef.current.push({ time: currentTime, midi: quantizedMidi });
        }
        
        const trailStart = currentTime - USER_TRAIL_SECONDS;
        if (userPitchTrailRef.current.length > 0 && userPitchTrailRef.current[0].time < trailStart) {
             userPitchTrailRef.current = userPitchTrailRef.current.filter(p => p.time >= trailStart);
        }
    }

    if (isPlaying) {
        flatWords.forEach(word => {
            const wordKey = `${word.lineIndex}-${word.wordIndex}`;
            if (currentTime >= word.startTime && currentTime <= word.endTime) {
                if (!scoredResultsRef.current.has(wordKey)) {
                   const targetMidi = word.midi!;
                   const userFreq = latestPitchRef.current.frequency;
                   
                   if (userFreq > 0) {
                        const targetFreq = 440 * Math.pow(2, (targetMidi - 69) / 12);
                        const cents = 1200 * Math.log2(userFreq / targetFreq);
                        const absCents = Math.abs(cents);
                        
                        let type = "";
                        if (absCents < 10) type = "PERFECT";
                        else if (absCents < 25) type = "GREAT";
                        else if (absCents < 50) type = "GOOD";
                        
                        if (type) {
                            scoredResultsRef.current.set(wordKey, type);
                            
                            const basePoints = type === "PERFECT" ? 100 : type === "GREAT" ? 75 : 50;
                            const multiplier = Math.min(2, 1 + comboRef.current * 0.1);
                            const points = Math.round(basePoints * multiplier);
                            
                            comboRef.current += 1;
                            scoreRef.current += points;
                            
                            setScore(scoreRef.current);
                            setCombo(comboRef.current);
                            setScorePopups(prev => [...prev.slice(-4), { id: Date.now(), type, points }]);
                        }
                   }
                }
            } else if (currentTime > word.endTime) {
                if (!scoredResultsRef.current.has(wordKey)) {
                     scoredResultsRef.current.set(wordKey, "MISS");
                     comboRef.current = 0;
                     setCombo(0);
                }
            }
        });
    }

    const parent = containerRef.current;
    if (parent) {
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
        }
    }
    
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, width, height);
    
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#0a0e27");
    bgGrad.addColorStop(1, "#000519");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const topPadding = 20;
    const bottomPadding = 20;
    const staffHeight = height - topPadding - bottomPadding;
    const labelAreaWidth = 54;
    const hitLineX = Math.max(width * HIT_LINE_RATIO, labelAreaWidth + 10);
    const pixelsPerSecond = width / VISIBLE_WINDOW;
    
    const leftWindow = VISIBLE_WINDOW * HIT_LINE_RATIO;
    const rightWindow = VISIBLE_WINDOW - leftWindow;
    const startTime = currentTime - leftWindow;
    const endTime = currentTime + rightWindow;

    const midiToY = (midi: number) => {
        const range = MIDI_MAX - MIDI_MIN;
        return topPadding + ((MIDI_MAX - midi) / range) * staffHeight;
    };

    const beatInterval = 1.0;
    const firstBeat = Math.ceil(startTime / beatInterval) * beatInterval;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.beginPath();
    for (let t = firstBeat; t < endTime; t += beatInterval) {
        const x = hitLineX + (t - currentTime) * pixelsPerSecond;
        ctx.moveTo(x, topPadding);
        ctx.lineTo(x, height - bottomPadding);
    }
    ctx.stroke();

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const fontLabel = "bold 11px 'Noto Sans KR', sans-serif";
    const fontSubLabel = "9px 'Noto Sans KR', sans-serif";

    for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        const y = midiToY(m);
        const noteIdx = m % 12;
        const isC = noteIdx === 0;
        const isNatural = [0, 2, 4, 5, 7, 9, 11].includes(noteIdx);
        
        ctx.beginPath();
        if (isC) {
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.moveTo(labelAreaWidth, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.font = fontLabel;
            const octave = Math.floor(m / 12) - 1;
            ctx.fillText(`C${octave}`, labelAreaWidth - 6, y);
        } else if (isNatural) {
            ctx.lineWidth = 0.8;
            ctx.strokeStyle = "rgba(255,255,255,0.10)";
            ctx.moveTo(labelAreaWidth, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            
            ctx.fillStyle = "rgba(255,255,255,0.45)";
            ctx.font = fontSubLabel;
            const noteName = NOTE_NAMES[noteIdx];
            const octave = Math.floor(m / 12) - 1;
            ctx.fillText(`${noteName}${octave}`, labelAreaWidth - 6, y);
        } else {
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = "rgba(255,255,255,0.04)";
            ctx.setLineDash([2, 4]);
            ctx.moveTo(labelAreaWidth, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    ctx.save();
    ctx.shadowColor = "rgba(0, 229, 255, 0.5)";
    ctx.shadowBlur = 15;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hitLineX, 0);
    ctx.lineTo(hitLineX, height);
    ctx.stroke();
    ctx.restore();

    const drawPill = (x: number, y: number, w: number, h: number) => {
        const r = h / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r, y + h);
        ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
    };

    flatWords.forEach(word => {
        if (word.endTime < startTime || word.startTime > endTime) return;

        const xStart = hitLineX + (word.startTime - currentTime) * pixelsPerSecond;
        const xEnd = hitLineX + (word.endTime - currentTime) * pixelsPerSecond;
        const w = Math.max(10, xEnd - xStart);
        const yCenter = midiToY(word.midi!);
        const h = 10;
        const yTop = yCenter - h / 2;

        const wordKey = `${word.lineIndex}-${word.wordIndex}`;
        const result = scoredResultsRef.current.get(wordKey);
        const isPast = word.endTime < currentTime;
        const isActive = currentTime >= word.startTime && currentTime <= word.endTime;

        let fillStyle: string | CanvasGradient;
        let glowColor = "rgba(0,0,0,0)";
        let shadowBlur = 0;

        const createGrad = (c1: string, c2: string) => {
            const g = ctx.createLinearGradient(0, yTop, 0, yTop + h);
            g.addColorStop(0, c1);
            g.addColorStop(1, c2);
            return g;
        };

        if (result === "PERFECT" || result === "GREAT") {
            fillStyle = createGrad("rgba(255, 215, 0, 0.9)", "rgba(255, 160, 0, 0.9)");
            glowColor = "rgba(255, 215, 0, 0.6)";
            shadowBlur = 12;
        } else if (result === "GOOD") {
            fillStyle = createGrad("rgba(100, 180, 255, 0.8)", "rgba(50, 130, 255, 0.8)");
        } else if (result === "MISS" || (isPast && !result)) {
            fillStyle = "rgba(100, 100, 100, 0.3)";
        } else if (isActive) {
            fillStyle = createGrad("rgba(0, 255, 255, 0.9)", "rgba(0, 229, 255, 0.9)");
            glowColor = "rgba(0, 229, 255, 0.9)";
            shadowBlur = 15;
        } else {
            fillStyle = "rgba(0, 200, 255, 0.5)";
        }

        ctx.save();
        if (shadowBlur > 0) {
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = shadowBlur;
        }
        ctx.fillStyle = fillStyle;
        drawPill(xStart, yTop, w, h);
        ctx.fill();

        if (isActive) {
            ctx.strokeStyle = "white";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    });

    const trail = userPitchTrailRef.current;
    if (trail.length > 1) {
        ctx.save();
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = 3;
        ctx.shadowColor = "rgba(0, 229, 255, 0.6)";
        ctx.shadowBlur = 12;
        ctx.lineJoin = "miter";
        ctx.beginPath();
        
        let started = false;
        
        for (let i = 0; i < trail.length; i++) {
            const point = trail[i];
            const x = hitLineX + (point.time - currentTime) * pixelsPerSecond;
            const y = midiToY(point.midi);
            
            if (x < 0) continue;

            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                const prev = trail[i - 1];
                const prevY = midiToY(prev.midi);
                
                if (point.time - prev.time > 0.3 || Math.abs(point.midi - prev.midi) > 12) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, prevY);
                    ctx.lineTo(x, y);
                }
            }
        }
        ctx.stroke();

        const last = trail[trail.length - 1];
        if (last && Math.abs(last.time - currentTime) < 0.1) {
            const headX = hitLineX + (last.time - currentTime) * pixelsPerSecond;
            const headY = midiToY(last.midi);
            
            ctx.fillStyle = "#FFF";
            ctx.shadowBlur = 10;
            ctx.shadowColor = "white";
            ctx.beginPath();
            ctx.arc(headX, headY, 4, 0, Math.PI * 2);
            ctx.fill();
            
            if (Math.abs(headX - hitLineX) < 10) {
                ctx.fillStyle = "#00E5FF";
                ctx.beginPath();
                ctx.arc(headX, headY, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
    
    rafRef.current = requestAnimationFrame(loop);
  }, [isPlaying, localTime, lyrics, flatWords, currentLyricIndex, dispatch, findCurrentLyricIndex]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [loop]);

  useEffect(() => {
    return () => {
       stopMicrophone();
       if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stopMicrophone]);

  const handleRestart = () => {
    if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setLocalTime(0);
        setCurrentLyricIndex(-1);
        setScore(0);
        setCombo(0);
        scoreRef.current = 0;
        comboRef.current = 0;
        scoredResultsRef.current.clear();
        userPitchTrailRef.current = [];
        setScorePopups([]);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    audioRef.current.currentTime = newTime;
    setLocalTime(newTime);
  };

  const togglePlay = () => {
    if (!audioRef.current || !audioLoaded) return;
    if (isPlaying) {
        audioRef.current.pause();
    } else {
        audioRef.current.play().catch(console.error);
        if (isMicOn && !analyserRef.current) startMicrophone();
    }
    setIsPlaying(!isPlaying);
  };

  const currentLine = currentLyricIndex >= 0 ? lyrics[currentLyricIndex] : null;
  const nextLine = useMemo(() => {
     if (currentLyricIndex >= 0) return lyrics[currentLyricIndex + 1];
     return lyrics.find(l => l.startTime > localTime);
  }, [currentLyricIndex, lyrics, localTime]);

  const progress = duration ? (localTime / duration) * 100 : 0;
  const formatTime = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

  if (!currentSong) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white">
         <AlertCircle className="w-16 h-16 text-gray-500 mb-4" />
         <p className="text-gray-400">노래 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#0a0e27] text-white overflow-hidden select-none font-sans">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin="anonymous"
        />
      )}

      <div className="shrink-0 px-4 pt-4 pb-2 z-20 flex flex-col gap-2 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-start justify-between gap-4">
           <div className="flex flex-col items-start">
              <p className="text-sm text-[#00E5FF] font-black italic tracking-wider drop-shadow-[0_0_8px_rgba(0,229,255,0.8)]">
                PERFECT SCORE
              </p>
              <div className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-none" 
                   style={{ textShadow: "0 0 20px rgba(0,229,255,0.5)" }}>
                {score.toLocaleString()}
              </div>
           </div>

           <div className="hidden sm:flex flex-col items-center text-center pt-1">
              <h1 className="text-lg font-bold text-white/90 truncate max-w-[300px]">{currentSong.title}</h1>
              <p className="text-xs text-white/50">{currentSong.artist}</p>
           </div>

           <div className="flex flex-col items-end">
              <div className="text-4xl sm:text-5xl font-black text-[#FFD700] tracking-tighter leading-none"
                   style={{ textShadow: "0 0 20px rgba(255,215,0,0.5)" }}>
                {combo}
              </div>
              <p className="text-sm text-[#FFD700] font-bold tracking-widest uppercase">COMBO</p>
           </div>
        </div>

        <div 
            className="h-2 w-full bg-white/10 rounded-full overflow-hidden cursor-pointer relative group mt-2"
            onClick={handleSeek}
        >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-[#FFD700] via-[#A855F7] to-[#00E5FF] origin-left"
                 style={{ transform: `scaleX(${progress / 100})` }} />
            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative min-h-0 w-full z-10">
         <canvas ref={canvasRef} className="block w-full h-full" />
         
         <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
            <AnimatePresence>
                {scorePopups.map(popup => (
                    <motion.div
                        key={popup.id}
                        initial={{ opacity: 0, y: 20, scale: 0.5 }}
                        animate={{ opacity: 1, y: -80, scale: 1.2 }}
                        exit={{ opacity: 0, scale: 1.5 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`absolute text-4xl font-black italic drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)] ${
                            popup.type === "PERFECT" ? "text-[#FFD700]" :
                            popup.type === "GREAT" ? "text-[#4ade80]" :
                            popup.type === "GOOD" ? "text-[#60a5fa]" : "text-gray-400"
                        }`}
                        style={{
                            textShadow: popup.type === "PERFECT" ? "0 0 20px #FFD700" : "none"
                        }}
                    >
                        {popup.type}
                    </motion.div>
                ))}
            </AnimatePresence>
         </div>
      </div>

      <div className="shrink-0 px-4 py-4 min-h-[140px] flex flex-col justify-center items-center bg-gradient-to-t from-black via-[#0d1117] to-transparent z-20">
         <div className="flex flex-col gap-2 items-center text-center w-full max-w-5xl">
            <div className="flex flex-wrap justify-center gap-x-[0.3em] text-2xl sm:text-3xl md:text-4xl font-black leading-tight">
               {currentLine ? (
                  currentLine.words && currentLine.words.length > 0 ? (
                      currentLine.words.map((word, idx) => {
                          const wDur = word.endTime - word.startTime;
                          const wProg = wDur > 0 
                             ? Math.max(0, Math.min(1, (localTime - word.startTime) / wDur))
                             : (localTime >= word.endTime ? 1 : 0);
                          
                          return (
                              <span key={idx} className="relative inline-block">
                                  <span className="text-white/20" style={{ WebkitTextStroke: "1px black" }}>
                                    {word.text}
                                  </span>
                                  <span className="absolute left-0 top-0 text-[#00E5FF] overflow-hidden whitespace-nowrap"
                                        style={{ 
                                            width: `${wProg * 100}%`,
                                            textShadow: "0 0 15px rgba(0,229,255,0.8)",
                                            filter: "drop-shadow(0 0 2px rgba(0,0,0,0.5))"
                                        }}>
                                     {word.text}
                                  </span>
                              </span>
                          );
                      })
                  ) : (
                      <span className="text-[#00E5FF]">{currentLine.text}</span>
                  )
               ) : (
                   <span className="text-white/20">...</span>
               )}
            </div>

            <div className="text-lg sm:text-xl font-medium text-white/40 mt-1 h-[1.5em] overflow-hidden">
                {nextLine?.text || ""}
            </div>
         </div>
      </div>

      <div className="shrink-0 bg-black/80 backdrop-blur-md border-t border-white/10 px-4 py-3 sm:px-6">
         <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="text-xs font-mono text-gray-400 w-24">
                   {formatTime(localTime)} / {formatTime(duration)}
                </div>
                
                <div className="hidden sm:flex items-center gap-2 group">
                   <button onClick={() => setVolume(v => v === 0 ? 1 : 0)} className="text-gray-400 hover:text-white">
                      <Volume2 className="w-5 h-5" />
                   </button>
                   <input 
                      type="range" min="0" max="1" step="0.05" 
                      value={volume} onChange={e => setVolume(parseFloat(e.target.value))}
                      className="w-20 accent-[#00E5FF] h-1" 
                   />
                </div>
                
                <button 
                   onClick={toggleMic}
                   className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                       isMicOn 
                       ? "bg-[#FFD700]/20 border-[#FFD700] text-[#FFD700]" 
                       : "bg-white/5 border-white/10 text-gray-400"
                   }`}
                >
                   {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                   <span className="text-xs font-bold hidden sm:inline">MIC</span>
                </button>
            </div>

            <div className="flex items-center gap-6">
               <button onClick={handleRestart} className="p-2 text-gray-400 hover:text-white transition-transform hover:-rotate-90">
                  <RotateCcw className="w-5 h-5" />
               </button>
               
               <button 
                  onClick={togglePlay}
                  disabled={!audioLoaded}
                  className="w-12 h-12 rounded-full bg-[#FFD700] text-black flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,215,0,0.4)] disabled:opacity-50 disabled:shadow-none"
               >
                  {isPlaying ? <Pause className="w-6 h-6 fill-black" /> : <Play className="w-6 h-6 fill-black ml-1" />}
               </button>

               <button 
                  onClick={() => window.dispatchEvent(new Event("kero:skipForward"))}
                  className="p-2 text-gray-400 hover:text-white transition-transform hover:translate-x-1"
               >
                  <SkipForward className="w-5 h-5" />
               </button>
            </div>

            <div className="flex items-center justify-end w-24">
               <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-gray-300">
                  <Music className="w-3 h-3" />
                  <span>{songQueue.length}</span>
               </div>
            </div>
         </div>
      </div>

      <AnimatePresence>
        {status === "finished" && score > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          >
            <motion.div 
               initial={{ scale: 0.9, y: 20 }}
               animate={{ scale: 1, y: 0 }}
               className="bg-[#1a1f35] border border-white/10 rounded-3xl p-10 text-center shadow-2xl relative overflow-hidden max-w-sm w-full mx-4"
            >
               <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#00E5FF] via-[#FFD700] to-[#A855F7]" />
               
               <p className="text-white/60 tracking-[0.2em] text-sm font-bold uppercase mb-6">Final Result</p>
               
               <div className="mb-8">
                  <span className="text-6xl font-black text-[#FFD700] drop-shadow-[0_0_15px_rgba(255,215,0,0.4)]">
                     {score.toLocaleString()}
                  </span>
               </div>
               
               <div className="flex justify-center gap-8 mb-8">
                  <div className="flex flex-col">
                     <span className="text-2xl font-bold text-white">{combo}</span>
                     <span className="text-xs text-white/40 uppercase tracking-wider">Max Combo</span>
                  </div>
                  <div className="w-px bg-white/10" />
                  <div className="flex flex-col">
                     <span className="text-2xl font-bold text-white">
                        {Math.round((score / (flatWords.length * 100)) * 100) || 0}%
                     </span>
                     <span className="text-xs text-white/40 uppercase tracking-wider">Accuracy</span>
                  </div>
               </div>
               
               <button 
                 onClick={() => window.dispatchEvent(new Event("kero:skipForward"))}
                 className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
               >
                 Next Song
               </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
