"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, SkipForward, Volume2, VolumeX, Mic, MicOff, Video, CameraOff, RotateCcw, AlertCircle, Music2 } from "lucide-react";
import type { RootState } from "@/store";
import { updateCurrentTime, setGameStatus } from "@/store/slices/gameSlice";

interface LyricsWord {
  startTime: number;
  endTime: number;
  text: string;
  energy?: number;
  pitch?: number;    // Average frequency in Hz (e.g., 440.0)
  note?: string;     // Musical note name (e.g., "A4", "C#5")
  midi?: number;     // MIDI note number (e.g., 69)
  voiced?: number;   // Voice activity confidence 0.0-1.0
}

interface LyricsLine {
  startTime: number;
  endTime: number;
  text: string;
  words?: LyricsWord[];
}

// 노래방 싱크 설정 상수
const SYNC_CONFIG = {
  WORD_LEAD_TIME: 0.08,        // 단어 하이라이트가 미리 시작하는 시간 (초)
  NEXT_LINE_PREVIEW: 0.5,      // 다음 가사 미리보기 시간 (초)
  LINE_HOLD_AFTER_END: 0.5,    // 가사가 끝난 후 유지 시간 (초)
};

type GamePhase = 'intro' | 'countdown' | 'singing';

export default function NormalModeGame() {
  const dispatch = useDispatch();
  const { currentSong, status, songQueue } = useSelector((state: RootState) => state.game);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [localTime, setLocalTime] = useState(0);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const [volume, setVolume] = useState(1.0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number>(0);

  const lyrics: LyricsLine[] = currentSong?.lyrics || [];
  const audioUrl = currentSong?.instrumentalUrl || currentSong?.audioUrl;
  const videoId = currentSong?.videoId;

  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  const duration = audioDuration || currentSong?.duration || 0;

  // Derived Game Phase Logic
  const { gamePhase, countdownNumber } = useMemo(() => {
    if (!currentSong || lyrics.length === 0) {
      return { gamePhase: 'intro' as GamePhase, countdownNumber: 3 };
    }
    
    const firstLyricTime = lyrics[0].startTime;
    
    // Intro: From time 0 until 3 seconds before lyrics[0].startTime
    if (localTime < firstLyricTime - 3) {
      return { gamePhase: 'intro' as GamePhase, countdownNumber: 3 };
    }
    
    // Countdown: From 3 seconds before lyrics[0].startTime until lyrics[0].startTime
    if (localTime < firstLyricTime) {
      const count = Math.ceil(firstLyricTime - localTime);
      return { gamePhase: 'countdown' as GamePhase, countdownNumber: count > 0 ? count : 1 };
    }
    
    // Singing: From lyrics[0].startTime onwards
    return { gamePhase: 'singing' as GamePhase, countdownNumber: 0 };
  }, [localTime, lyrics, currentSong]);

  const findCurrentLyricIndex = useCallback((time: number): number => {
    if (lyrics.length === 0) return -1;
    
    // 첫 번째 가사 시작 전: 첫 번째 가사를 미리 보여줌 (인덱스 0 반환)
    if (time < lyrics[0].startTime) return 0;
    
    for (let i = 0; i < lyrics.length; i++) {
      const line = lyrics[i];
      const nextLine = lyrics[i + 1];
      
      // 현재 라인 범위 내
      if (time >= line.startTime && time <= line.endTime) {
        return i;
      }
      
      // 현재 라인 끝났지만 다음 라인 시작 전 (갭 구간)
      if (time > line.endTime) {
        // 다음 라인이 있는 경우
        if (nextLine && time < nextLine.startTime) {
           const gapDuration = nextLine.startTime - line.endTime;
           
           // 라인이 끝나고 잠시 유지 (LINE_HOLD_AFTER_END)
           if (time <= line.endTime + SYNC_CONFIG.LINE_HOLD_AFTER_END) {
             return i;
           }
           
           // 짧은 갭 (3초 이하): 다음 가사를 미리 보여줌 (Preview)
           if (gapDuration <= 3.0) {
             return i + 1;
           }
           
           // 긴 갭 (> 3초, 간주 등): 점 3개 애니메이션 표시
           return -1;
        }
        
        // 마지막 라인인 경우
        if (!nextLine) {
          // 끝난 후 2초까지만 마지막 라인 표시
          if (time <= line.endTime + 2.0) {
            return i;
          }
          return -1;
        }
      }
    }
    
    return -1;
  }, [lyrics]);

  useEffect(() => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    audio.volume = volume;

    const handleEnded = () => {
      setIsPlaying(false);
      dispatch(setGameStatus("finished"));
    };

    const handleCanPlay = () => {
      setAudioLoaded(true);
      setAudioError(null);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const handleError = () => {
      setAudioError("오디오를 불러올 수 없습니다. 다시 시도해주세요.");
      setAudioLoaded(false);
    };

    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [dispatch, volume]);

  // 고성능 시간 업데이트 루프
  useEffect(() => {
    if (!isPlaying || !audioRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const updateTime = () => {
      if (!audioRef.current || !isPlaying) return;
      
      const time = audioRef.current.currentTime;
      
      // 시간이 변했을 때만 업데이트 (성능 최적화)
      if (Math.abs(time - lastTimeRef.current) > 0.016) { // ~60fps
        lastTimeRef.current = time;
        setLocalTime(time);
        
        // 가사 인덱스 업데이트
        const newIndex = findCurrentLyricIndex(time);
        if (newIndex !== currentLyricIndex) {
          setCurrentLyricIndex(newIndex);
        }
        
        // Redux 업데이트는 덜 자주 (성능)
        if (Math.floor(time * 10) !== Math.floor(lastTimeRef.current * 10)) {
          dispatch(updateCurrentTime(time));
        }
      }

      animationFrameRef.current = requestAnimationFrame(updateTime);
    };

    animationFrameRef.current = requestAnimationFrame(updateTime);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, findCurrentLyricIndex, currentLyricIndex, dispatch]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (status === "playing" && audioRef.current && !isPlaying && audioLoaded) {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  }, [status, audioLoaded]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !audioLoaded) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying, audioLoaded]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    audioRef.current.currentTime = newTime;
    setLocalTime(newTime);
  }, [duration]);

  const handleRestart = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setLocalTime(0);
    setCurrentLyricIndex(-1);
    // Phase will auto-update via derived state
  }, []);

  const handleMicToggle = () => {
    window.dispatchEvent(new Event("kero:toggleMic"));
    setIsMicOn(!isMicOn);
  };

  const handleCameraToggle = () => {
    window.dispatchEvent(new Event("kero:toggleCamera"));
    setIsCamOn(!isCamOn);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = duration ? (localTime / duration) * 100 : 0;

  // 단어별 하이라이트 진행률 계산 (MFA 타이밍 기반)
  const getWordProgressInLine = useCallback((line: LyricsLine, wordIndex: number): number => {
    if (!line.words || line.words.length === 0) return 0;
    
    const word = line.words[wordIndex];
    const wordStart = word.startTime - SYNC_CONFIG.WORD_LEAD_TIME;
    const wordEnd = word.endTime;
    const wordDuration = wordEnd - wordStart;
    
    if (wordDuration <= 0) return localTime >= wordStart ? 100 : 0;
    if (localTime < wordStart) return 0;
    if (localTime >= wordEnd) return 100;
    
    const linearProgress = ((localTime - wordStart) / wordDuration) * 100;
    
    // Energy-based easing: words with higher energy fill faster at the start
    const energy = word.energy ?? 0.5;
    const exponent = 1 / (0.8 + energy * 0.4);
    const easedProgress = Math.pow(linearProgress / 100, exponent) * 100;
    
    return Math.min(100, Math.max(0, easedProgress));
  }, [localTime]);

  // 라인 전체 진행률 (단어가 없을 때 사용)
  const getLineProgress = useCallback((line: LyricsLine): number => {
    const adjustedStart = line.startTime;
    
    if (localTime < adjustedStart) return 0;
    if (localTime >= line.endTime) return 100;
    
    return ((localTime - adjustedStart) / (line.endTime - adjustedStart)) * 100;
  }, [localTime]);

  const youtubeEmbedUrl = useMemo(() => {
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&loop=1&playlist=${videoId}&modestbranding=1&enablejsapi=1`;
  }, [videoId]);

  // Interlude Logic
  const interludeData = useMemo(() => {
    if (currentLyricIndex !== -1) return null;
    if (lyrics.length === 0) return null;
    if (gamePhase !== 'singing') return null;

    const nextLineIndex = lyrics.findIndex(l => l.startTime > localTime);
    if (nextLineIndex === -1) return null;

    const nextLine = lyrics[nextLineIndex];
    const prevLine = lyrics[nextLineIndex - 1];
    
    if (!prevLine) return null; 

    const gap = nextLine.startTime - prevLine.endTime;
    if (gap > 5) {
      const timeToNext = nextLine.startTime - localTime;
      return { isInterlude: true, timeToNext };
    }
    return null;
  }, [currentLyricIndex, lyrics, localTime, gamePhase]);

  const currentLine = currentLyricIndex >= 0 ? lyrics[currentLyricIndex] : undefined;
  
  const nextLine = useMemo(() => {
    if (currentLyricIndex >= 0) {
      return lyrics[currentLyricIndex + 1] || null;
    }
    // During rest/interlude
    return lyrics.find(line => line.startTime > localTime) || null;
  }, [currentLyricIndex, lyrics, localTime]);


  if (!currentSong) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <AlertCircle className="w-16 h-16 text-gray-500 mb-4" />
        <p className="text-gray-400">노래 정보를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden select-none font-sans">
        {/* Audio Element */}
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            muted={isMuted}
            crossOrigin="anonymous"
          />
        )}

        {/* Background (YouTube or Gradient) */}
        <div className="absolute inset-0 z-0 bg-black">
          {youtubeEmbedUrl ? (
            <div className="relative w-full h-full">
                <iframe
                src={youtubeEmbedUrl}
                className="absolute top-1/2 left-1/2 w-[150%] h-[150%] -translate-x-1/2 -translate-y-1/2 object-cover opacity-40 pointer-events-none"
                allow="autoplay; encrypted-media"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-900">
              <Music2 className="w-32 h-32 text-white/10" />
            </div>
          )}
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="absolute inset-0 z-10 flex flex-col">
            
            {/* Top Bar (Song Info - Hidden during Intro) */}
             <div className={`w-full p-6 flex justify-between items-start transition-all duration-500 ${gamePhase === 'singing' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
                 <div className="flex flex-col">
                     <h2 className="text-4xl font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-tight">
                         {currentSong.title}
                     </h2>
                     <p className="text-xl text-white/80 font-medium mt-1">
                         {currentSong.artist}
                     </p>
                 </div>
                 {/* Reserved for score or other indicators */}
             </div>

            {/* CENTER STAGE */}
            <div className="flex-1 flex flex-col items-center justify-center relative">
                <AnimatePresence mode="wait">
                    
                    {/* PHASE: INTRO */}
                    {gamePhase === 'intro' && (
                        <motion.div 
                            key="intro"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                            transition={{ duration: 0.8 }}
                            className="text-center flex flex-col items-center"
                        >
                             <div className="mb-6 text-cyan-400 text-xl font-bold tracking-[0.5em] border-b border-cyan-400/50 pb-2">
                                TJ 노래방
                             </div>
                             <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] max-w-4xl leading-tight">
                                {currentSong.title}
                             </h1>
                             <p className="text-2xl text-white/70 font-medium">
                                {currentSong.artist}
                             </p>
                             
                             {songQueue.length > 0 && (
                                <div className="mt-12 bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20">
                                    <span className="text-white/90 text-lg">
                                    다음 예약곡 <span className="text-cyan-400 font-bold ml-2">{songQueue.length}</span> 곡
                                    </span>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* PHASE: COUNTDOWN */}
                    {gamePhase === 'countdown' && (
                        <motion.div
                            key="countdown"
                            className="flex flex-col items-center justify-center"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <AnimatePresence mode="popLayout">
                                <motion.div
                                    key={countdownNumber}
                                    initial={{ opacity: 0, scale: 1.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.5 }}
                                    transition={{ duration: 0.4 }}
                                    className="text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.6)]"
                                >
                                    {countdownNumber}
                                </motion.div>
                            </AnimatePresence>
                            <p className="text-xl text-white/60 mt-8 font-medium tracking-wider animate-pulse">
                                ♪ 노래가 곧 시작됩니다
                            </p>
                        </motion.div>
                    )}

                    {/* PHASE: SINGING (Interlude Logic Included) */}
                    {gamePhase === 'singing' && interludeData?.isInterlude && (
                         <motion.div
                            key="interlude"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                         >
                            <div className="text-3xl text-white/60 font-medium mb-8 tracking-[0.5em] drop-shadow-lg bg-black/30 px-8 py-2 rounded-full border border-white/10">
                                ♪ ─ 간 주 ─ ♪
                            </div>
                            
                            {/* Interlude Countdown (if < 3s left) */}
                            {interludeData.timeToNext <= 3.0 && (
                                 <motion.div
                                    key={`count-${Math.ceil(interludeData.timeToNext)}`}
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="text-7xl font-black text-cyan-400 my-4"
                                 >
                                     {Math.ceil(interludeData.timeToNext)}
                                 </motion.div>
                            )}
                         </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* LYRICS AREA (Fixed Bottom Position) */}
            <div className="w-full px-4 pb-8 flex flex-col items-center justify-end min-h-[300px] bg-gradient-to-t from-black via-black/60 to-transparent pt-20">
                 {/* Main Line */}
                 <div className="mb-6 w-full max-w-6xl text-center min-h-[80px] flex items-center justify-center">
                    <AnimatePresence mode="wait">
                         {gamePhase === 'singing' && currentLine ? (
                             <motion.div
                                key={`line-${currentLyricIndex}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.2 }}
                                className="flex flex-wrap justify-center gap-x-4 gap-y-2 leading-tight"
                             >
                                 {currentLine.words && currentLine.words.length > 0 ? (
                                    currentLine.words.map((word, i) => {
                                      const p = getWordProgressInLine(currentLine, i);
                                      return (
                                        <span 
                                          key={`${currentLyricIndex}-${i}`} 
                                          className="relative text-5xl md:text-6xl lg:text-7xl font-black tracking-tight"
                                        >
                                          <span className="text-white/30">{word.text}</span>
                                          <span 
                                            className="absolute left-0 top-0 text-cyan-400 overflow-hidden whitespace-nowrap"
                                            style={{ width: `${p}%` }}
                                          >
                                            {word.text}
                                          </span>
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="relative text-5xl md:text-6xl lg:text-7xl font-black tracking-tight">
                                      <span className="text-white/30">{currentLine.text}</span>
                                      <span 
                                        className="absolute left-0 top-0 text-cyan-400 overflow-hidden whitespace-nowrap"
                                        style={{ width: `${getLineProgress(currentLine)}%` }}
                                      >
                                        {currentLine.text}
                                      </span>
                                    </span>
                                  )}
                             </motion.div>
                         ) : null}
                    </AnimatePresence>
                 </div>

                 {/* Next Line Preview */}
                 <div className="h-12 w-full max-w-4xl flex items-center justify-center mb-8">
                    <AnimatePresence mode="wait">
                        {gamePhase === 'singing' && nextLine && (
                            <motion.p 
                                key={`next-${nextLine.startTime}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 0.5 }}
                                exit={{ opacity: 0 }}
                                className="text-2xl md:text-3xl text-white font-semibold tracking-wide line-clamp-1 drop-shadow-md"
                            >
                                {nextLine.text}
                            </motion.p>
                        )}
                    </AnimatePresence>
                 </div>

                 {/* CONTROLS & PROGRESS */}
                 <div className="w-full max-w-6xl flex flex-col gap-2">
                     {/* Minimal Progress Bar */}
                     <div 
                        className="w-full h-1 bg-white/20 rounded-full cursor-pointer overflow-hidden group hover:h-2 transition-all"
                        onClick={handleSeek}
                     >
                        <div 
                            className="h-full bg-cyan-400 relative"
                            style={{ width: `${progress}%` }}
                        />
                     </div>

                     {/* Control Bar */}
                     <div className="flex items-center justify-between px-2 mt-2">
                        
                        {/* Left: Toggles */}
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsMuted(!isMuted)} className="text-white/70 hover:text-white transition-colors">
                                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                            </button>
                             <button
                                onClick={handleMicToggle}
                                className={`transition-all ${isMicOn ? "text-white/70 hover:text-white" : "text-red-500"}`}
                             >
                                {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                             </button>
                             <button
                                onClick={handleCameraToggle}
                                className={`transition-all ${isCamOn ? "text-white/70 hover:text-white" : "text-red-500"}`}
                             >
                                {isCamOn ? <Video className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                             </button>
                        </div>

                        {/* Center: Play/Pause */}
                        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
                            <button onClick={handleRestart} className="text-white/50 hover:text-white transition-colors">
                                <RotateCcw className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={togglePlay}
                                className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all text-white"
                            >
                                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                            </button>
                             <button className="text-white/50 hover:text-white transition-colors">
                                <SkipForward className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Right: Time */}
                        <div className="text-sm font-mono text-white/50">
                            {formatTime(localTime)} / {formatTime(duration)}
                        </div>

                     </div>
                 </div>
            </div>

            {/* Error Toast */}
            {audioError && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 p-4 bg-red-500/90 text-white rounded-xl shadow-xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5" />
                <span>{audioError}</span>
                </div>
            )}
        </div>
    </div>
  );
}
