"use client";

import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Music, Target, MessageSquareText, ArrowLeft, Plus, Users, 
  Search, Loader2, DoorOpen, Lock, Globe, RefreshCw, Trash2
} from "lucide-react";

const modeConfig = {
  normal: { title: "일반 모드", icon: Music, color: "#C0C0C0" },
  perfect_score: { title: "퍼펙트 스코어", icon: Target, color: "#FFD700" },
  lyrics_quiz: { title: "가사 맞추기", icon: MessageSquareText, color: "#FF6B6B" },
};

interface Room {
  id: string;
  code: string;
  name: string;
  gameMode: "normal" | "perfect_score" | "lyrics_quiz";
  status: string;
  hostId: string;
  isPrivate: boolean;
  maxParticipants: number;
  participants: { id: string; nickname: string; isHost: boolean }[];
}

function LobbyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") as "normal" | "perfect_score" | "lyrics_quiz" | null;
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedMode, setSelectedMode] = useState<"normal" | "perfect_score" | "lyrics_quiz">(mode || "normal");
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    setIsLoggedIn(!!token);
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserId(user.id);
        setNickname(user.name || "");
      } catch {}
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [mode]);

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const url = mode ? `/api/rooms?gameMode=${mode}` : "/api/rooms";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setRooms(data.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch rooms:", e);
    } finally {
      setLoading(false);
    }
  };

  const createRoom = async () => {
    if (!isLoggedIn) {
      router.push("/login?redirect=/lobby");
      return;
    }

    if (!roomName.trim()) {
      alert("방 이름을 입력해주세요.");
      return;
    }

    if (!nickname.trim()) {
      alert("닉네임을 입력해주세요.");
      return;
    }

    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        user.name = nickname.trim();
        localStorage.setItem("user", JSON.stringify(user));
      } catch {}
    }

    setCreating(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: roomName,
          gameMode: mode || "normal",
          hostId: userId,
          maxParticipants: 8,
          isPrivate,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.message || "방 생성에 실패했습니다.");
        setCreating(false);
        return;
      }

      router.push(`/room/${data.data.code}`);
    } catch {
      alert("서버 연결에 실패했습니다.");
      setCreating(false);
    }
  };

  const joinRoom = async (code?: string) => {
    const roomCode = code || joinCode.trim().toUpperCase();
    if (!roomCode) {
      alert("방 코드를 입력해주세요.");
      return;
    }

    if (!isLoggedIn) {
      router.push(`/login?redirect=/room/${roomCode}`);
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`/api/rooms/${roomCode}`);
      const data = await res.json();

      if (!data.success) {
        alert("방을 찾을 수 없습니다.");
        setJoining(false);
        return;
      }

      router.push(`/room/${roomCode}`);
    } catch {
      alert("서버 연결에 실패했습니다.");
      setJoining(false);
    }
  };

  const deleteRoom = async (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    if (!userId) {
      alert("로그인이 필요합니다.");
      return;
    }
    if (!confirm("정말 이 방을 삭제하시겠습니까?")) return;

    try {
      const res = await fetch(`/api/rooms/${code}?userId=${userId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        }
      });

      const data = await res.json();
      if (data.success) {
        fetchRooms();
      } else {
        alert(data.message || "방 삭제에 실패했습니다.");
      }
    } catch {
      alert("서버 연결에 실패했습니다.");
    }
  };

  const config = mode ? modeConfig[mode] : null;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: config?.color || "#C0C0C0" }}
        />
      </div>

      <header className="relative z-10 flex items-center justify-between p-6 md:p-8">
        <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span>홈으로</span>
        </Link>
        <div className="flex items-center gap-3">
          {config && <config.icon className="w-6 h-6" style={{ color: config.color }} />}
          <span className="text-xl font-bold">KERO</span>
        </div>
        <button
          onClick={fetchRooms}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm">새로고침</span>
        </button>
      </header>

      <main className="relative z-10 px-6 md:px-12 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              {config ? (
                <><span style={{ color: config.color }}>{config.title}</span> 로비</>
              ) : (
                "노래방 로비"
              )}
            </h1>
            <p className="text-gray-400">방을 만들거나 참여하세요</p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <motion.button
              onClick={() => setShowCreateModal(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-black"
              style={{ backgroundColor: config?.color || "#C0C0C0" }}
            >
              <Plus className="w-5 h-5" />
              방 만들기
            </motion.button>
            <motion.button
              onClick={() => setShowJoinModal(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20"
            >
              <DoorOpen className="w-5 h-5" />
              코드로 입장
            </motion.button>
          </div>

          {!mode && (
            <div className="flex justify-center gap-2 mb-8">
              <Link href="/lobby" className={`px-4 py-2 rounded-lg transition-colors ${!mode ? "bg-white/20" : "bg-white/5 hover:bg-white/10"}`}>
                전체
              </Link>
              {Object.entries(modeConfig).map(([key, cfg]) => (
                <Link 
                  key={key}
                  href={`/lobby?mode=${key}`}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-2"
                >
                  <cfg.icon className="w-4 h-4" style={{ color: cfg.color }} />
                  <span className="text-sm">{cfg.title}</span>
                </Link>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-2">아직 열린 방이 없습니다</p>
              <p className="text-gray-500 text-sm">첫 번째 방을 만들어보세요!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rooms.map((room) => {
                const roomConfig = modeConfig[room.gameMode];
                const Icon = roomConfig.icon;
                return (
                  <motion.div
                    key={room.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.02 }}
                    className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-colors cursor-pointer"
                    onClick={() => joinRoom(room.code)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${roomConfig.color}20` }}
                        >
                          <Icon className="w-6 h-6" style={{ color: roomConfig.color }} />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg">{room.name}</h3>
                          <p className="text-sm text-gray-400">{roomConfig.title}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {room.isPrivate ? (
                          <Lock className="w-5 h-5 text-gray-500" />
                        ) : (
                          <Globe className="w-5 h-5 text-green-500" />
                        )}
                        {room.hostId === userId && (
                          <button
                            onClick={(e) => deleteRoom(e, room.code)}
                            className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Users className="w-4 h-4" />
                        <span>{room.participants?.length || 0} / {room.maxParticipants}</span>
                      </div>
                      <span className="text-xs font-mono text-gray-500">{room.code}</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold mb-6">방 만들기</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">닉네임</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="닉네임을 입력하세요"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-white/40"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2">방 이름</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="방 이름을 입력하세요"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-white/40"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      isPrivate ? "bg-yellow-500" : "bg-white/20"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      isPrivate ? "translate-x-6" : "translate-x-0.5"
                    }`} />
                  </button>
                  <span className="text-sm text-gray-400">비공개 방</span>
                </div>

                <button
                  onClick={createRoom}
                  disabled={creating}
                  className="w-full py-3 rounded-xl font-bold text-black bg-white disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      생성 중...
                    </>
                  ) : (
                    "방 만들기"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showJoinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowJoinModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold mb-6">코드로 입장</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">방 코드</label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="6자리 코드 입력"
                    maxLength={6}
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-white/40 text-center text-2xl font-mono tracking-widest"
                  />
                </div>

                <button
                  onClick={() => joinRoom()}
                  disabled={joining || joinCode.length < 6}
                  className="w-full py-3 rounded-xl font-bold text-black bg-white disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {joining ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      입장 중...
                    </>
                  ) : (
                    "입장하기"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LobbyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    }>
      <LobbyContent />
    </Suspense>
  );
}
