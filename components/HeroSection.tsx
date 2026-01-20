"use client";

import { useRef, useState } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ChevronDown, Mic, Users, PartyPopper } from "lucide-react";

const modes = [
  {
    id: "01",
    title: "SOLO",
    subtitle: "나만의 무대",
    description: "혼자서 편하게 노래하고 녹음하세요. AI 점수 시스템으로 실력을 향상시키세요.",
    icon: Mic,
    accent: "#C0C0C0",
  },
  {
    id: "02", 
    title: "DUO",
    subtitle: "둘이서 함께",
    description: "친구와 1:1로 듀엣을 즐기세요. 실시간 음성으로 마치 옆에 있는 듯한 경험.",
    icon: Users,
    accent: "#FFD700",
  },
  {
    id: "03",
    title: "PARTY",
    subtitle: "다같이 신나게",
    description: "최대 8명까지 함께하는 파티 모드. 점수 경쟁과 실시간 채팅을 즐기세요.",
    icon: PartyPopper,
    accent: "#FF6B6B",
  },
];

export default function HeroSection() {
  const [activeMode, setActiveMode] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);

  const currentMode = modes[activeMode];
  const Icon = currentMode.icon;

  return (
    <section ref={containerRef} className="relative h-screen w-full overflow-hidden bg-black">
      <motion.div style={{ y, scale, opacity }} className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        >
          <source src="/hero-video.webm" type="video/webm" />
          <source src="/hero-video.mp4" type="video/mp4" />
        </video>
        <motion.div 
          className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent"
          animate={{ 
            background: `linear-gradient(to right, rgba(0,0,0,0.8), ${currentMode.accent}10, transparent)` 
          }}
          transition={{ duration: 0.5 }}
        />
      </motion.div>

      <div className="relative z-10 flex h-full w-full flex-col justify-between p-8 md:p-20">
        <div className="flex flex-col gap-6 mt-20">
          <div className="flex items-end gap-6">
            <motion.h1 
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              className="text-8xl font-bold tracking-tighter text-white md:text-[10rem]"
            >
              KERO
            </motion.h1>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeMode}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="hidden md:flex items-center gap-3 mb-6"
              >
                <Icon className="w-8 h-8" style={{ color: currentMode.accent }} />
                <span 
                  className="text-3xl font-bold tracking-wider"
                  style={{ color: currentMode.accent }}
                >
                  {currentMode.title}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
          
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeMode}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <p className="text-xl font-medium tracking-wide text-gray-300 md:text-2xl">
                {currentMode.subtitle}
              </p>
              <p className="max-w-md text-gray-400">
                {currentMode.description}
              </p>
            </motion.div>
          </AnimatePresence>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="flex gap-4 mt-8"
          >
            <motion.button 
              className="rounded-full border px-8 py-3 text-sm font-medium text-white transition-all hover:text-black"
              style={{ borderColor: `${currentMode.accent}50` }}
              whileHover={{ 
                backgroundColor: currentMode.accent,
                scale: 1.05 
              }}
              whileTap={{ scale: 0.95 }}
            >
              지금 참여하기
            </motion.button>
            <motion.button 
              className="rounded-full px-8 py-3 text-sm font-medium text-black transition-all"
              style={{ backgroundColor: currentMode.accent }}
              whileHover={{ 
                backgroundColor: "#fff",
                scale: 1.05 
              }}
              whileTap={{ scale: 0.95 }}
            >
              기능 둘러보기
            </motion.button>
          </motion.div>
        </div>

        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden flex-col gap-8 md:flex">
          <div className="flex flex-col gap-4 text-right">
            {modes.map((mode, i) => (
              <motion.button
                key={mode.id}
                onClick={() => setActiveMode(i)}
                className={`cursor-pointer text-xl font-bold transition-all duration-300 ${
                  i === activeMode 
                    ? "scale-125" 
                    : "text-white/30 hover:text-white/60"
                }`}
                style={{ color: i === activeMode ? mode.accent : undefined }}
                whileHover={{ scale: i === activeMode ? 1.25 : 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                {mode.id}
              </motion.button>
            ))}
          </div>
          <motion.div 
            className="h-24 w-[2px] self-end mr-3 rounded-full"
            style={{ backgroundColor: `${currentMode.accent}40` }}
            layoutId="mode-indicator"
          />
        </div>

        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="self-center flex flex-col items-center gap-2 text-white/50"
        >
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <ChevronDown className="h-5 w-5" />
        </motion.div>
      </div>
    </section>
  );
}
