"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Music, Target, MessageSquareText, ArrowLeft, Users, Copy, Check, Loader2 } from "lucide-react";

interface Room {
  id: string;
  code: string;
  name: string;
  gameMode: "normal" | "perfect_score" | "lyrics_quiz";
  status: string;
  maxParticipants: number;
  hostId: string;
}

const modeConfig = {
  normal: {
    title: "일반 모드",
    icon: Music,
    color: "#C0C0C0",
  },
  perfect_score: {
    title: "퍼펙트 스코어",
    icon: Target,
    color: "#FFD700",
  },
  lyrics_quiz: {
    title: "가사 맞추기",
    icon: MessageSquareText,
    color: "#FF6B6B",
  },
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  
  const [room, setRoom] = useState<Room | null>(null);
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
        
        setRoom(data.data);
        setLoading(false);
      } catch {
        setError("서버 연결에 실패했습니다.");
        setLoading(false);
      }
    };

    fetchRoom();
  }, [code]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
              <span>0 / {room.maxParticipants}</span>
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
            <h2 className="text-xl font-bold mb-4">대기 중...</h2>
            <p className="text-gray-400 mb-6">
              친구들에게 방 코드를 공유하세요!
              <br />
              코드: <span className="font-mono font-bold text-white">{code}</span>
            </p>
            
            <div className="flex flex-col gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 rounded-xl font-bold text-lg text-black"
                style={{ backgroundColor: config.color }}
              >
                게임 시작 (준비 중)
              </motion.button>
              
              <button
                onClick={() => router.push("/")}
                className="w-full py-4 rounded-xl font-bold text-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                방 나가기
              </button>
            </div>
          </div>

          <p className="text-sm text-gray-500">
            * 실시간 멀티플레이어 기능은 개발 중입니다
          </p>
        </motion.div>
      </main>
    </div>
  );
}
