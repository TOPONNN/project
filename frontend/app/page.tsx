"use client";

import HeroSection from "@/components/HeroSection";
import TeamMarquee from "@/components/TeamMarquee";
import SpecsTable from "@/components/SpecsTable";
import HighlightCTA from "@/components/HighlightCTA";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import KeyboardShowcase from "@/components/3d/KeyboardShowcase";
import SmoothScroll from "@/components/animations/SmoothScroll";

export default function Home() {
  return (
    <SmoothScroll>
      <main className="min-h-screen bg-black text-white selection:bg-[#C0C0C0] selection:text-black">
        <Header />
        <HeroSection />
        <TeamMarquee />
        <KeyboardShowcase />
        <SpecsTable />
        <HighlightCTA />
        <FAQ />
        <Footer />
      </main>
    </SmoothScroll>
  );
}
// Auto-deploy test: Tue Jan 20 23:51:02 KST 2026
// Build: 1768920767
// v1768920823
