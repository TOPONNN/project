"use client";

import React from "react";
import { ReactLenis } from "lenis/react";

interface SmoothScrollProps {
  children: React.ReactNode;
}

export default function SmoothScroll({ children }: SmoothScrollProps) {
  return (
    <ReactLenis
      root
      options={{
        duration: 2,
        prevent: (node) => {
          // Modal이 열려있을 때 스크롤 방지
          return node.classList.contains("modal-open");
        },
      }}
    >
      {children}
    </ReactLenis>
  );
}
