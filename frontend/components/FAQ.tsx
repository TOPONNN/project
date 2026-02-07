"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import SectionWrapper from "@/components/animations/SectionWrapper";
import RevealAnimation from "@/components/animations/RevealAnimation";

const FAQS = [
  { q: "어떤 기술스택을 사용했나요?", a: "프론트엔드는 Next.js 15 + React 19 + Redux Toolkit, 백엔드는 Express.js + LiveKit + Redis + RabbitMQ + MySQL, AI는 Mel-band Roformer, WhisperX + SOFA, FCPE를 Flask + Celery GPU 워커로 처리합니다. 인프라는 Docker Compose + Jenkins CI/CD + Nginx + AWS EC2/S3 + ELK Stack으로 구성됩니다." },
  { q: "프로젝트 개발기간은?", a: "2026.01.12 ~ 2026.02.09, 약 4주간의 기획, 디자인, 개발 과정을 거쳐 완성되었습니다." },
  { q: "AI 기능은 무엇인가요?", a: "Mel-band Roformer로 보컬/MR 고품질 분리, WhisperX + SOFA로 음절 단위 가사 자동 싱크, FCPE로 실시간 음정 분석 및 점수 계산을 제공합니다." },
  { q: "퀴즈 모드는 어떻게 동작하나요?", a: "TJ 노래방 인기 차트에서 곡을 가져와 가사 빈칸, 제목 맞추기, 가수 맞추기, 초성 퀴즈, 가사 순서, O/X 퀴즈 총 6종류를 생성합니다. yt-dlp로 오디오를 스트리밍하며 Kahoot 스타일로 실시간 대결합니다." },
  { q: "일본곡도 지원하나요?", a: "네, TJ 노래방 J-POP 차트를 연동하여 일본곡 퀴즈와 일반 노래방을 지원합니다. 일본어 가사 위에 한국어 발음이 자동 표시되고, 아티스트명도 한국어로 번역됩니다." },
  { q: "동시 접속 인원은 몇 명인가요?", a: "한 방에 최대 8명까지 동시 접속하여 화상으로 소통하며 함께 노래할 수 있습니다." },
  { q: "지원하는 브라우저는?", a: "Chrome, Firefox, Safari, Edge 등 WebRTC를 지원하는 모든 최신 브라우저에서 사용 가능합니다. 모바일 브라우저에서도 반응형으로 동작합니다." },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <SectionWrapper id="faq" className="w-full py-16 sm:py-24 md:py-32 px-6 md:px-20">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <RevealAnimation>
            <h2 className="font-display text-4xl text-center md:text-7xl font-bold text-white">FAQ</h2>
          </RevealAnimation>
          <RevealAnimation delay={0.2}>
            <p className="font-display mx-auto mt-4 max-w-3xl text-base text-center text-white/50">자주 묻는 질문들</p>
          </RevealAnimation>
        </div>
        <div className="flex flex-col divide-y divide-white/10">
          {FAQS.map((faq, i) => (
            <RevealAnimation key={i} delay={i * 0.08} className="py-6">
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-center justify-between py-4 text-left"
              >
                <span className="text-base sm:text-lg md:text-xl font-medium text-white">{faq.q}</span>
                <motion.div
                  animate={{ rotate: openIndex === i ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Plus className="h-6 w-6 text-white/50" />
                </motion.div>
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="pb-4 text-gray-400">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </RevealAnimation>
          ))}
        </div>
      </div>
    </SectionWrapper>
  );
}
