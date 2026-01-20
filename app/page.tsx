import HeroSection from "@/components/HeroSection";
import TeamMarquee from "@/components/TeamMarquee";
import SpecsTable from "@/components/SpecsTable";
import HighlightCTA from "@/components/HighlightCTA";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-[#C0C0C0] selection:text-black">
      <HeroSection />
      <TeamMarquee />
      <SpecsTable />
      <HighlightCTA />
      <FAQ />
      <Footer />
    </main>
  );
}
