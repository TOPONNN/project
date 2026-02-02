"use client";

import { motion, useAnimation, useInView } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode, useEffect, useRef } from "react";

// 1. BlurIn - 블러에서 선명하게 나타남
export const BlurIn = ({ children, className, delay = 0, duration = 1 }: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}) => {
  return (
    <motion.div
      initial={{ filter: "blur(10px)", opacity: 0 }}
      whileInView={{ filter: "blur(0px)", opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// 2. BoxReveal - 슬라이딩 박스가 지나가며 콘텐츠 공개
export const BoxReveal = ({ children, width = "fit-content", boxColor, duration = 0.5, delay = 0 }: {
  children: ReactNode;
  width?: "fit-content" | "100%";
  boxColor?: string;
  duration?: number;
  delay?: number;
}) => {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      slideControls.start("visible");
      mainControls.start("visible");
    }
  }, [isInView, mainControls, slideControls]);

  return (
    <div ref={ref} style={{ position: "relative", width, overflow: "hidden" }}>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 75 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration, delay }}
      >
        {children}
      </motion.div>
      <motion.div
        variants={{
          hidden: { left: 0 },
          visible: { left: "100%" },
        }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration, ease: "easeIn", delay }}
        style={{
          position: "absolute",
          top: 4, bottom: 4, left: 0, right: 0,
          zIndex: 20,
          background: boxColor || "transparent",
        }}
      />
    </div>
  );
};

// 3. RevealAnimation - 기본 fade-up 애니메이션
export default function RevealAnimation({ children, delay = 0, duration = 0.5, className, as = "div" }: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  as?: string;
}) {
  const Component = motion[as as keyof typeof motion] as any;
  return (
    <Component
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration, delay }}
      className={className}
    >
      {children}
    </Component>
  );
}
