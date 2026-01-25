"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, UserPlus, LogOut, X, Loader2, Camera, Mail, Calendar, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface UserData {
  id: string;
  name: string;
  email: string;
  profileImage?: string;
  createdAt?: string;
}

export default function Header() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [nickname, setNickname] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const userData = JSON.parse(stored);
        setUser(userData);
        setNickname(userData.name);
        if (userData.profileImage) {
            setAvatarPreview(userData.profileImage);
        }
      } catch {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      }
    }
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowProfileModal(false);
    };
    if (showProfileModal) {
      window.addEventListener("keydown", handleEsc);
      if (user) {
        setNickname(user.name);
        setAvatarPreview(user.profileImage || null);
      }
    }
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showProfileModal, user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !nickname.trim()) return;
    setSaving(true);
    
    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ name: nickname.trim(), profileImage: avatarPreview })
        });

        if (response.ok) {
            const updatedUser = { ...user, name: nickname.trim(), profileImage: avatarPreview || undefined };
            localStorage.setItem("user", JSON.stringify(updatedUser));
            setUser(updatedUser);
            
            setTimeout(() => {
                setSaving(false);
                setShowProfileModal(false);
            }, 500);
        } else {
             if (response.status === 404) {
                 const updatedUser = { ...user, name: nickname.trim(), profileImage: avatarPreview || undefined };
                 localStorage.setItem("user", JSON.stringify(updatedUser));
                 setUser(updatedUser);
                 setTimeout(() => {
                    setSaving(false);
                    setShowProfileModal(false);
                }, 500);
             } else {
                 setSaving(false);
             }
        }
    } catch (error) {
        setSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    router.push("/");
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown";
    try {
        return new Date(dateString).toLocaleDateString('ko-KR', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    } catch {
        return dateString;
    }
  };

  if (!mounted) {
    return (
      <header className="fixed top-0 right-0 z-50 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-24 h-10 rounded-full bg-white/10 animate-pulse" />
        </div>
      </header>
    );
  }

  return (
    <header className="fixed top-0 right-0 z-50 p-6 md:p-8">
      <div className="flex items-center gap-3">
        {user ? (
          <>
            <motion.button
              onClick={() => setShowProfileModal(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all cursor-pointer overflow-hidden"
            >
              {user.profileImage ? (
                  <div className="w-5 h-5 rounded-full overflow-hidden relative">
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={user.profileImage} alt={user.name} className="w-full h-full object-cover" />
                  </div>
              ) : (
                <User className="w-4 h-4" />
              )}
              <span className="text-sm font-medium max-w-[100px] truncate">{user.name}</span>
            </motion.button>
            <motion.button
              onClick={handleLogout}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 backdrop-blur-md border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium hidden md:block">로그아웃</span>
            </motion.button>
          </>
        ) : (
          <>
            <Link href="/login">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-all"
              >
                <User className="w-4 h-4" />
                <span className="text-sm font-medium hidden md:block">로그인</span>
              </motion.div>
            </Link>
            <Link href="/signup">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-black hover:bg-gray-200 transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span className="text-sm font-medium hidden md:block">회원가입</span>
              </motion.div>
            </Link>
          </>
        )}
      </div>
      
      <AnimatePresence>
        {showProfileModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setShowProfileModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="w-full max-w-md bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 border border-white/10 rounded-3xl p-8 shadow-2xl shadow-purple-500/10 relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

              <button 
                onClick={() => setShowProfileModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative z-10 flex flex-col items-center">
                <div className="relative mb-8 group">
                  <div 
                    className="w-28 h-28 rounded-full p-1 bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/20 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden relative">
                      {avatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 text-zinc-700" />
                      )}
                      
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <Camera className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  </div>
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-1 right-1 p-2 rounded-full bg-white text-black shadow-lg hover:scale-110 transition-transform"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                <div className="w-full space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">닉네임</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <User className="w-5 h-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            placeholder="닉네임"
                            className="w-full pl-12 pr-4 py-3.5 bg-black/20 border border-white/10 rounded-2xl focus:outline-none focus:border-purple-500/50 focus:bg-black/40 text-white transition-all placeholder:text-gray-600"
                        />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">이메일</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Mail className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/5 rounded-2xl text-gray-400 cursor-not-allowed">
                            {user?.email || "email@example.com"}
                        </div>
                    </div>
                  </div>

                  {user?.createdAt && (
                    <div className="flex items-center justify-center gap-2 pt-2 pb-2">
                        <Calendar className="w-4 h-4 text-gray-600" />
                        <span className="text-xs text-gray-500 font-medium">
                            가입일: {formatDate(user.createdAt)}
                        </span>
                    </div>
                  )}

                  <div className="pt-4">
                      <motion.button
                          onClick={handleUpdateProfile}
                          disabled={saving || !nickname.trim()}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="w-full py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all"
                      >
                          {saving ? (
                          <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              저장 중...
                          </>
                          ) : (
                          <>
                              <Check className="w-5 h-5" />
                              프로필 저장
                          </>
                          )}
                      </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
