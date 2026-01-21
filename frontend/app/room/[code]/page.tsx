"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import { motion } from "framer-motion";
import Link from "next/link";
import { Music, Target, MessageSquareText, ArrowLeft, Users, Copy, Check, Loader2, Play } from "lucide-react";
import type { RootState } from "@/store";
import { setRoom, addParticipant } from "@/store/slices/roomSlice";
import { setGameMode, setGameStatus, setCurrentSong, setQuizQuestions } from "@/store/slices/gameSlice";
import { useSocket } from "@/hooks/useSocket";
import NormalModeGame from "@/components/game/NormalModeGame";
import PerfectScoreGame from "@/components/game/PerfectScoreGame";
import LyricsQuizGame from "@/components/game/LyricsQuizGame";

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

const DEMO_SONG = {
  id: "demo-1",
  title: "데모 노래",
  artist: "KERO",
  duration: 180,
  audioUrl: "/demo-song.mp3",
  instrumentalUrl: "/demo-instrumental.mp3",
  lyrics: [
    { time: 0, text: "🎤 KERO 카라오케에 오신 것을 환영합니다" },
    { time: 5, text: "이제 노래를 시작해볼까요?" },
    { time: 10, text: "마이크를 켜고 준비하세요" },
    { time: 15, text: "음악이 시작됩니다..." },
    { time: 20, text: "♪ ♪ ♪" },
  ],
};

const DEMO_QUIZ = [
  {
    id: "q1",
    lyrics: "눈이 부시게 _____ 날",
    options: ["아름다운", "화려한", "빛나는", "찬란한"],
    correctIndex: 0,
    timeLimit: 15,
  },
  {
    id: "q2", 
    lyrics: "그대 내게 _____ 줄까요",
    options: ["사랑을", "행복을", "웃음을", "손을"],
    correctIndex: 3,
    timeLimit: 15,
  },
  {
    id: "q3",
    lyrics: "하늘을 _____ 새처럼",
    options: ["나는", "달리는", "걷는", "춤추는"],
    correctIndex: 0,
    timeLimit: 15,
  },
];

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const code = params.code as string;
  
  const { status: gameStatus } = useSelector((state: RootState) => state.game);
  const { participants, gameMode } = useSelector((state: RootState) => state.room);
  const { emitEvent } = useSocket(code);

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

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startGame = () => {
    dispatch(setGameStatus("playing"));
    
    if (room?.gameMode === "lyrics_quiz") {
      dispatch(setQuizQuestions(DEMO_QUIZ));
    } else {
      dispatch(setCurrentSong(DEMO_SONG));
    }
    
    emitEvent("game:start", { roomCode: code });
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

  if (gameStatus === "playing") {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <header className="flex items-center justify-between p-4 bg-black/50 backdrop-blur-xl border-b border-white/10">
          <button
            onClick={() => dispatch(setGameStatus("waiting"))}
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>나가기</span>
          </button>
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5" style={{ color: config.color }} />
            <span className="font-bold">{room.name}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10">
            <Users className="w-4 h-4" />
            <span className="text-sm">{participants.length}</span>
          </div>
        </header>

        <main className="flex-1">
          <GameComponent />
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
      </header>

      <main className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl w-full"
        >
          <div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
            style={{ backgroundColor: `${config.color}20`, color: config.color }}
          >
            <Icon className="w-5 h-5" />
            <span className="text-sm font-medium">{config.title}</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4">{room.name}</h1>

          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10">
              <Users className="w-5 h-5" />
              <span>{participants.length} / {room.maxParticipants}</span>
            </div>
            <button
              onClick={copyCode}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
              <span className="font-mono font-bold">{code}</span>
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 mb-8">
            <h2 className="text-xl font-bold mb-4">참가자 대기 중...</h2>
            
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

            <p className="text-gray-400 mb-6">
              친구들에게 방 코드를 공유하세요!
              <br />
              코드: <span className="font-mono font-bold text-white">{code}</span>
            </p>
            
            <div className="flex flex-col gap-3">
              <motion.button
                onClick={startGame}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 rounded-xl font-bold text-lg text-black flex items-center justify-center gap-2"
                style={{ backgroundColor: config.color }}
              >
                <Play className="w-5 h-5" />
                게임 시작
              </motion.button>
              
              <button
                onClick={() => router.push("/")}
                className="w-full py-4 rounded-xl font-bold text-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                방 나가기
              </button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
