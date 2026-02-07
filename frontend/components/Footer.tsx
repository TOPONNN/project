"use client";

import RevealAnimation from "@/components/animations/RevealAnimation";

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/10 py-10 px-6 md:px-20">
      <RevealAnimation className="flex flex-col items-center gap-3">
        <h2 className="text-2xl font-bold text-white">KERO</h2>
        <span className="text-sm text-gray-500">© 2026 KERO. All rights reserved.</span>
      </RevealAnimation>
    </footer>
  );
}
