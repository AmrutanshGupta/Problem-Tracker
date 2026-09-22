import AuroraBackground from "@/components/AuroraBackground";
import Hero from "@/components/Hero";
import FeatureGrid from "@/components/FeatureGrid";

export default function Home() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      <AuroraBackground />
      
      <div className="relative pt-32 pb-20">
        <div className="flex justify-center mb-6 relative z-10">
          <div className="font-mono-accent text-[11px] uppercase tracking-wider px-3 py-1 rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[#a1a1aa] backdrop-blur-md">
            v2.0 — Now Available
          </div>
        </div>
        
        <Hero />
      </div>

      <FeatureGrid />

      <footer className="border-t border-[rgba(255,255,255,0.08)] py-12 text-center text-[#a1a1aa] text-sm mt-20 relative z-10">
        <p>© 2026 Problem Tracker. Open source and built for developers.</p>
      </footer>
    </main>
  );
}
