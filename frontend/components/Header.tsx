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

        const updatedUser = { ...user, name: nickname.trim(), profileImage: avatarPreview || undefined };
        
        if (response.ok) {
            const data = await response.json();
            if (data.data) {
                updatedUser.createdAt = data.data.createdAt;
                if (data.data.profileImage) {
                    updatedUser.profileImage = data.data.profileImage;
                }
            }
        }
        
        localStorage.setItem("user", JSON.stringify(updatedUser));
        setUser(updatedUser);
        
        setTimeout(() => {
            setSaving(false);
            setShowProfileModal(false);
        }, 400);
    } catch {
        const updatedUser = { ...user, name: nickname.trim(), profileImage: avatarPreview || undefined };
        localStorage.setItem("user", JSON.stringify(updatedUser));
        setUser(updatedUser);
        
        setTimeout(() => {
            setSaving(false);
            setShowProfileModal(false);
        }, 400);
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
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowProfileModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center">
                <div className="relative mb-6 group">
                  <div 
                    className="w-24 h-24 rounded-full border-2 border-white/20 cursor-pointer overflow-hidden bg-zinc-800"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {avatarPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-10 h-10 text-zinc-600" />
                      </div>
                    )}
                    
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
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
                    className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-zinc-700 border border-zinc-600 text-white hover:bg-zinc-600 transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="w-full space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 ml-1">닉네임</label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder="닉네임을 입력하세요"
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:border-white/30 text-white transition-colors placeholder:text-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1.5 ml-1">이메일</label>
                    <div className="flex items-center gap-3 px-4 py-3 bg-zinc-800/50 border border-zinc-800 rounded-xl text-zinc-500">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm">{user?.email}</span>
                    </div>
                  </div>

                  {user?.createdAt && (
                    <div className="flex items-center justify-center gap-2 py-2 text-zinc-500">
                      <Calendar className="w-3.5 h-3.5" />
                      <span className="text-xs">{formatDate(user.createdAt)} 가입</span>
                    </div>
                  )}

                  <button
                    onClick={handleUpdateProfile}
                    disabled={saving || !nickname.trim()}
                    className="w-full py-3 mt-2 rounded-xl font-medium text-black bg-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:bg-gray-100 transition-colors"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        저장 중...
                      </>
                    ) : (
                      "저장"
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
