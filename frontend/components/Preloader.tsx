"use client";

import React, { useEffect, useState } from "react";
import { usePreloader } from "@/hooks/use-preloader";
import { motion, AnimatePresence } from "framer-motion";
import { useLenis } from "lenis/react";

const slideUp = {
  initial: { top: 0 },
  exit: {
    top: "-100dvh",
    transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.2 },
  },
};

const opacity = {
  initial: { opacity: 0 },
  enter: { opacity: 0.75, transition: { duration: 1, delay: 0.2 } },
};

export default function Preloader() {
  const { isLoading, loadingPercent } = usePreloader();
  const lenis = useLenis();
  const [dimension, setDimension] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setDimension({ width: window.innerWidth, height: window.innerHeight });
  }, []);

  useEffect(() => {
    if (isLoading) {
      lenis?.stop();
    } else {
      lenis?.start();
    }
  }, [isLoading, lenis]);

  const initialPath = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height + 300} 0 ${dimension.height} L0 0`;
  const targetPath = `M0 0 L${dimension.width} 0 L${dimension.width} ${dimension.height} Q${dimension.width / 2} ${dimension.height} 0 ${dimension.height} L0 0`;

  const curve = {
    initial: {
      d: initialPath,
      transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] },
    },
    exit: {
      d: targetPath,
      transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.3 },
    },
  };

  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          variants={slideUp}
          initial="initial"
          exit="exit"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#020817]"
        >
          {dimension.width > 0 && (
            <>
              <motion.div
                variants={opacity}
                initial="initial"
                animate="enter"
                className="relative z-10 flex flex-col items-center justify-center text-white"
              >
                <span className="mb-4 text-sm font-medium tracking-[0.2em] text-gray-400">
                  KERO
                </span>
                <h1 className="text-6xl font-bold md:text-8xl tabular-nums">
                  {loadingPercent}%
                </h1>
              </motion.div>
              <svg className="absolute top-0 w-full" style={{ height: "calc(100% + 300px)" }}>
                <motion.path
                  variants={curve}
                  initial="initial"
                  exit="exit"
                  fill="#020817"
                />
              </svg>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
