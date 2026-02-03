"use client";

import React, { useEffect } from "react";
import { usePreloader } from "@/hooks/use-preloader";
import { motion, AnimatePresence } from "framer-motion";
import { useLenis } from "lenis/react";

export default function Preloader() {
  const { isLoading, loadingPercent } = usePreloader();
  const lenis = useLenis();

  useEffect(() => {
    if (isLoading) {
      lenis?.stop();
    } else {
      lenis?.start();
    }
  }, [isLoading, lenis]);

  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ 
            opacity: 0, 
            y: -100,
            transition: { duration: 0.6, ease: [0.76, 0, 0.24, 1] } 
          }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#020817] text-white"
        >
          <div className="flex flex-col items-center justify-center">
            <span className="mb-4 text-sm font-medium tracking-[0.2em] text-gray-400">
              KERO
            </span>
            <h1 className="text-6xl font-bold md:text-8xl tabular-nums">
              {loadingPercent}%
            </h1>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
