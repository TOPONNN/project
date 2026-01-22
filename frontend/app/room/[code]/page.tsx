"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { 
  Music, Target, MessageSquareText, ArrowLeft, Users, Copy, Check, 
  Loader2, Play, Search, Youtube, X, Disc3, AlertCircle
} from "lucide-react";
import type { RootState } from "@/store";
import { setRoom, addParticipant } from "@/store/slices/roomSlice";
import { setGameMode, setGameStatus, setCurrentSong, setQuizQuestions } from "@/store/slices/gameSlice";
import { useSocket } from "@/hooks/useSocket";
import NormalModeGame from "@/components/game/NormalModeGame";
import PerfectScoreGame from "@/components/game/PerfectScoreGame";
import LyricsQuizGame from "@/components/game/LyricsQuizGame";
import KaraokeSongSearch from "@/components/KaraokeSongSearch";
import dynamic from "next/dynamic";

// VideoRoom은 클라이언트 사이드에서만 로드 (LiveKit은 SSR 지원 안함)
const VideoRoom = dynamic(() => import("@/components/VideoRoom"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-black/50 rounded-xl flex items-center justify-center">
      <span className="text-white/60 text-sm">카메라 로딩 중...</span>
    </div>
  ),
});

const modeConfig = {
  normal: {
    title: "일반 모드",
    icon: Music,
    color: "#C0C0C0",
    Component: NormalModeGame,
  },
  perfect_score: {
    title: "퍼펙트 스코어",
    icon: Target,
    color: "#FFD700",
    Component: PerfectScoreGame,
  },
  lyrics_quiz: {
    title: "가사 맞추기",
    icon: MessageSquareText,
    color: "#FF6B6B",
    Component: LyricsQuizGame,
  },
};

type RoomStep = "waiting" | "song_search" | "processing" | "ready" | "playing";

interface TJSong {
  number: string;
  title: string;
  artist: string;
}

interface YouTubeResult {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

interface SelectedSong {
  id: string;
  title: string;
  artist: string;
  source: "tj" | "youtube";
  videoId?: string;
  tjNumber?: string;
}

interface ProcessingStatus {
  status: "pending" | "processing" | "completed" | "failed";
  message: string;
  progress?: number;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const code = params.code as string;
  
  const { status: gameStatus, currentSong } = useSelector((state: RootState) => state.game);
  const { participants } = useSelector((state: RootState) => state.room);
  const { emitEvent } = useSocket(code);
  
  const [userName, setUserName] = useState<string>("Guest");
  const [visitorId, setVisitorId] = useState<string>("");

  const [room, setRoomData] = useState<{
    id: string;
    code: string;
    name: string;
    gameMode: "normal" | "perfect_score" | "lyrics_quiz";
    status: string;
    maxParticipants: number;
    hostId: string;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<RoomStep>("waiting");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"tj" | "youtube">("tj");
  const [searching, setSearching] = useState(false);
  const [tjResults, setTjResults] = useState<TJSong[]>([]);
  const [youtubeResults, setYoutubeResults] = useState<YouTubeResult[]>([]);
  
  const [selectedSong, setSelectedSong] = useState<SelectedSong | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/rooms/${code}`);
        const data = await res.json();
        
        if (!data.success) {
          setError(data.message || "방을 찾을 수 없습니다.");
          setLoading(false);
          return;
        }
        
        setRoomData(data.data);
        dispatch(setRoom({
          id: data.data.id,
          code: data.data.code,
          name: data.data.name,
          gameMode: data.data.gameMode,
          status: data.data.status,
          maxParticipants: data.data.maxParticipants,
          hostId: data.data.hostId,
        }));
        dispatch(setGameMode(data.data.gameMode));

        const user = localStorage.getItem("user");
        if (user) {
          const userData = JSON.parse(user);
          dispatch(addParticipant({
            id: userData.id,
            nickname: userData.name,
            isHost: data.data.hostId === userData.id,
            isReady: true,
          }));
        }

        setLoading(false);
      } catch {
        setError("서버 연결에 실패했습니다.");
        setLoading(false);
      }
    };

    fetchRoom();
  }, [code, dispatch]);

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) {
      const userData = JSON.parse(user);
      setUserName(userData.name || "Guest");
      setVisitorId(userData.id || "");
    }
  }, []);

  const searchSongs = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    setSearching(true);
    try {
      if (searchType === "tj") {
        const res = await fetch(`/api/search/tj?q=${encodeURIComponent(searchQuery)}&type=title`);
        const data = await res.json();
        if (data.success) {
          setTjResults(data.data.songs || []);
        }
      } else {
        const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(searchQuery + " official audio")}`);
        const data = await res.json();
        if (data.success) {
          setYoutubeResults(data.data || []);
        }
      }
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchType]);

  const selectTJSong = async (song: TJSong) => {
    setSelectedSong({
      id: "",
      title: song.title,
      artist: song.artist,
      source: "tj",
      tjNumber: song.number,
    });
    
    setSearching(true);
    try {
      const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(`${song.title} ${song.artist} official audio`)}`);
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        const video = data.data[0];
        await startProcessing(video.videoId, song.title, song.artist);
      } else {
        setProcessingError("YouTube에서 해당 노래를 찾을 수 없습니다.");
        setSelectedSong(null);
      }
    } catch (e) {
      setProcessingError("노래 검색 중 오류가 발생했습니다.");
      setSelectedSong(null);
    } finally {
      setSearching(false);
    }
  };

  const selectYouTubeSong = async (video: YouTubeResult) => {
    const titleParts = video.title.split("-");
    const artist = titleParts.length > 1 ? titleParts[0].trim() : video.channel;
    const title = titleParts.length > 1 ? titleParts.slice(1).join("-").trim() : video.title;
    
    setSelectedSong({
      id: "",
      title,
      artist,
      source: "youtube",
      videoId: video.videoId,
    });
    
    await startProcessing(video.videoId, title, artist);
  };

  const startProcessing = async (videoId: string, title: string, artist: string) => {
    setStep("processing");
    setProcessingStatus({ status: "pending", message: "노래 다운로드 중..." });
    setProcessingError(null);
    
    try {
      const res = await fetch("/api/search/youtube/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, title, artist }),
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || "노래 처리 요청 실패");
      }
      
      const songId = data.data.id;
      setSelectedSong(prev => prev ? { ...prev, id: songId } : null);
      
      pollProcessingStatus(songId);
    } catch (e: any) {
      setProcessingError(e.message || "처리 시작 중 오류가 발생했습니다.");
      setStep("song_search");
    }
  };

  const pollProcessingStatus = useCallback(async (songId: string) => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/songs/${songId}/status`);
        const data = await res.json();
        
        if (!data.success) return;
        
        const status = data.data;
        setProcessingStatus({
          status: status.status,
          message: status.message,
        });
        
        if (status.status === "completed") {
          const songRes = await fetch(`/api/songs/${songId}`);
          const songData = await songRes.json();
          
          if (songData.success) {
            const song = songData.data;
            dispatch(setCurrentSong({
              id: song.id,
              title: song.title,
              artist: song.artist,
              duration: song.duration || 180,
              audioUrl: song.originalUrl,
              instrumentalUrl: song.instrumentalUrl,
              vocalUrl: song.vocalsUrl,
              lyrics: song.lyrics?.map((l: any) => ({
                startTime: l.startTime,
                endTime: l.endTime,
                text: l.text,
              })) || [],
            }));
            
            if (room?.gameMode === "lyrics_quiz") {
              const quizRes = await fetch(`/api/songs/${songId}/quiz`);
              const quizData = await quizRes.json();
              if (quizData.success && quizData.data.questions) {
                dispatch(setQuizQuestions(quizData.data.questions.map((q: any) => ({
                  id: q.id,
                  lyrics: q.questionText,
                  options: [q.correctAnswer, ...q.wrongAnswers].sort(() => Math.random() - 0.5),
                  correctIndex: 0,
                  timeLimit: q.timeLimit,
                }))));
              }
            }
            
            setStep("ready");
          }
        } else if (status.status === "failed") {
          setProcessingError("노래 처리에 실패했습니다. 다른 노래를 선택해주세요.");
          setStep("song_search");
        } else {
          setTimeout(() => checkStatus(), 3000);
        }
      } catch (e) {
        console.error("Status check error:", e);
        setTimeout(() => checkStatus(), 5000);
      }
    };
    
    checkStatus();
  }, [dispatch, room?.gameMode]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startGame = () => {
    dispatch(setGameStatus("playing"));
    setStep("playing");
    emitEvent("game:start", { roomCode: code, songId: selectedSong?.id });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <h1 className="text-2xl font-bold mb-4">😢 {error || "방을 찾을 수 없습니다"}</h1>
        <Link href="/" className="text-gray-400 hover:text-white">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const config = modeConfig[room.gameMode];
  const Icon = config.icon;
  const GameComponent = config.Component;

  if (gameStatus === "playing" || step === "playing") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <header className="flex items-center justify-between p-4 bg-black/50 backdrop-blur-xl border-b border-white/10">
          <button
            onClick={() => {
              dispatch(setGameStatus("waiting"));
              setStep("ready");
            }}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>나가기</span>
          </button>
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5" style={{ color: config.color }} />
            <span className="font-bold">{currentSong?.title || room.name}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
            <Users className="w-4 h-4" />
            <span className="text-sm">{participants.length}</span>
          </div>
        </header>

        <main className="flex-1 flex">
          <div className="flex-1">
            <GameComponent />
          </div>
          <div className="w-80 h-full border-l border-white/10 bg-black/30">
            <div className="p-3 border-b border-white/10">
              <h3 className="text-sm font-medium text-white/80">참가자 화면</h3>
            </div>
            <div className="h-[calc(100%-48px)]">
              <VideoRoom
                roomCode={code}
                participantName={userName}
                participantId={visitorId}
              />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: config.color }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between p-6 md:p-8">
        <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span>나가기</span>
        </Link>
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6" style={{ color: config.color }} />
          <span className="text-xl font-bold">KERO</span>
        </div>
        <button
          onClick={copyCode}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          <span className="font-mono font-bold text-sm">{code}</span>
        </button>
      </header>

      <main className="relative z-10 flex flex-col items-center px-6 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-4xl w-full"
        >
          <div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4"
            style={{ backgroundColor: `${config.color}20`, color: config.color }}
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm font-medium">{config.title}</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-2">{room.name}</h1>
          
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm">
              <Users className="w-4 h-4" />
              <span>{participants.length} / {room.maxParticipants}</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {step === "waiting" && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <h2 className="text-xl font-bold mb-4">🎤 노래를 선택하세요</h2>
                <p className="text-gray-400 mb-6">TJ 노래방 또는 YouTube에서 원하는 노래를 검색하세요</p>
                
                <motion.button
                  onClick={() => setStep("song_search")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 rounded-xl font-bold text-lg text-black flex items-center justify-center gap-2"
                  style={{ backgroundColor: config.color }}
                >
                  <Search className="w-5 h-5" />
                  노래 검색하기
                </motion.button>
              </motion.div>
            )}

            {step === "song_search" && (
              <motion.div
                key="song_search"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">🎤 노래 선택</h2>
                  <button 
                    onClick={() => setStep("waiting")}
                    className="p-2 rounded-full hover:bg-white/10"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {processingError && (
                  <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
                    <AlertCircle className="w-5 h-5" />
                    <span>{processingError}</span>
                  </div>
                )}

                <KaraokeSongSearch
                  onSelect={selectTJSong}
                  isLoading={searching}
                  accentColor={config.color}
                />
              </motion.div>
            )}

            {step === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <div className="flex flex-col items-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Disc3 className="w-16 h-16 mb-4" style={{ color: config.color }} />
                  </motion.div>
                  
                  <h2 className="text-xl font-bold mb-2">🎵 노래 처리 중...</h2>
                  
                  {selectedSong && (
                    <p className="text-gray-400 mb-4">
                      {selectedSong.title} - {selectedSong.artist}
                    </p>
                  )}
                  
                  <div className="w-full max-w-md">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-400">{processingStatus?.message || "준비 중..."}</span>
                      <span className="text-gray-500">{processingStatus?.status}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: config.color }}
                        initial={{ width: "0%" }}
                        animate={{ 
                          width: processingStatus?.status === "completed" ? "100%" : 
                                 processingStatus?.status === "processing" ? "60%" : "20%"
                        }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-4">
                    AI가 보컬 분리, 가사 추출, 음정 분석을 진행하고 있습니다
                  </p>
                </div>
              </motion.div>
            )}

            {step === "ready" && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-8"
              >
                <div className="flex items-center gap-4 mb-6 p-4 bg-white/5 rounded-xl">
                  <div 
                    className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${config.color}20` }}
                  >
                    🎵
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-xl font-bold">{currentSong?.title || selectedSong?.title}</h3>
                    <p className="text-gray-400">{currentSong?.artist || selectedSong?.artist}</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSong(null);
                      setStep("song_search");
                    }}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm"
                  >
                    다른 노래
                  </button>
                </div>

                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  {participants.map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full ${
                        p.isHost ? "bg-yellow-500/20 text-yellow-400" : "bg-white/10"
                      }`}
                    >
                      <span>{p.nickname}</span>
                      {p.isHost && <span className="text-xs">👑</span>}
                    </div>
                  ))}
                </div>

                <motion.button
                  onClick={startGame}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 rounded-xl font-bold text-lg text-black flex items-center justify-center gap-2"
                  style={{ backgroundColor: config.color }}
                >
                  <Play className="w-5 h-5" />
                  게임 시작!
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
}
