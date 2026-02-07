"use client";

import { Github } from "lucide-react";
import RevealAnimation from "@/components/animations/RevealAnimation";

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/10 py-10 px-6 md:px-20">
      <RevealAnimation className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-white">KERO</h2>
          <span className="text-sm text-gray-500">© 2026 KERO. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://github.com/TOPONNN" className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2">
            <Github className="h-4 w-4" />
            GitHub
          </a>
          <span className="text-xs text-gray-600">Built with passion by Team KERO</span>
        </div>
      </RevealAnimation>
    </footer>
  );
}
