"use client";

import SectionWrapper from "@/components/animations/SectionWrapper";
import { BlurIn } from "@/components/animations/RevealAnimation";
import RevealAnimation from "@/components/animations/RevealAnimation";

export default function HighlightCTA() {
  return (
    <SectionWrapper
      id="cta"
      className="flex flex-col md:flex-row min-h-screen md:h-screen w-full"
    >
      <div className="flex flex-1 flex-col justify-center p-6 sm:p-12 md:p-24">
        <BlurIn>
          <h2 className="text-4xl md:text-7xl font-bold leading-tight text-white">
            THE <span className="text-[#C0C0C0]">REAL-TIME</span>
            <br /> KARAOKE
          </h2>
        </BlurIn>
        <RevealAnimation delay={0.3}>
          <p className="mt-8 max-w-lg text-base sm:text-lg text-gray-400 leading-relaxed">
            친구들과 함께 실시간으로 노래하고,
            <br />화상으로 소통하세요.
            <br /><br />
            지연 없는 WebRTC + LiveKit 기술로
            <br />마치 같은 공간에 있는 듯한 경험을 제공합니다.
          </p>
        </RevealAnimation>
      </div>
      <div className="relative hidden md:flex md:flex-1 bg-black/40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#0A0A0A]" />
      </div>
    </SectionWrapper>
  );
}
