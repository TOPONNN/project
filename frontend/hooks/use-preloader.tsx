"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import gsap from "gsap";

interface PreloaderContextType {
  isLoading: boolean;
  loadingPercent: number;
  bypassLoading: () => void;
}

const PreloaderContext = createContext<PreloaderContextType | undefined>(undefined);

export const usePreloader = () => {
  const context = useContext(PreloaderContext);
  if (!context) {
    throw new Error("usePreloader must be used within a PreloaderProvider");
  }
  return context;
};

export const PreloaderProvider = ({ children }: { children: React.ReactNode }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPercent, setLoadingPercent] = useState(0);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [splineReady, setSplineReady] = useState(false);
  const loadingTween = useRef<gsap.core.Tween | null>(null);
  const percentRef = useRef({ value: 0 });

  useEffect(() => {
    loadingTween.current = gsap.to(percentRef.current, {
      value: 100,
      duration: 2.5,
      ease: "slow(0.7,0.7,false)",
      onUpdate: () => {
        setLoadingPercent(Math.round(percentRef.current.value));
      },
      onComplete: () => {
        setAnimationComplete(true);
      },
    });

    return () => {
      loadingTween.current?.kill();
    };
  }, []);

  // Only dismiss when BOTH animation complete AND Spline loaded
  useEffect(() => {
    if (animationComplete && splineReady) {
      setIsLoading(false);
    }
  }, [animationComplete, splineReady]);

  const bypassLoading = () => {
    setSplineReady(true);
  };

  return (
    <PreloaderContext.Provider value={{ isLoading, loadingPercent, bypassLoading }}>
      {children}
    </PreloaderContext.Provider>
  );
};
