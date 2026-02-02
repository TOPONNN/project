"use client";

import { ReactLenis } from "@/lib/lenis";
import HeroSection from "@/components/HeroSection";
import TeamMarquee from "@/components/TeamMarquee";
import SpecsTable from "@/components/SpecsTable";
import HighlightCTA from "@/components/HighlightCTA";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import AnimatedBackground from "@/components/3d/AnimatedBackground";
import TechStackSection from "@/components/3d/TechStackSection";

export default function Home() {
  return (
    <ReactLenis root options={{ duration: 2 }}>
      <AnimatedBackground />
      <main className="min-h-screen bg-transparent text-white selection:bg-[#C0C0C0] selection:text-black">
        <Header />
        <HeroSection />
        <TeamMarquee />
        <TechStackSection />
        <SpecsTable />
        <HighlightCTA />
        <FAQ />
        <Footer />
      </main>
    </ReactLenis>
  );
}
// Auto-deploy test: Tue Jan 20 23:51:02 KST 2026
// Build: 1768920767
// v1768920823
