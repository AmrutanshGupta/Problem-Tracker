import AnimatedButton from "./AnimatedButton";

export default function Hero() {
  return (
    <section className="relative z-10 flex flex-col items-center justify-center pt-32 pb-20 px-4 text-center max-w-4xl mx-auto">
      <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
        Track Every Problem.<br/>
        Forget Nothing.
      </h1>
      
      <p className="text-lg md:text-xl text-[#a1a1aa] mb-10 leading-relaxed max-w-2xl mx-auto">
        An offline-first Chrome extension that bookmarks, times, and schedules your competitive programming practice across <span className="font-mono text-[0.9em] text-[#f4f4f5]">LeetCode</span>, <span className="font-mono text-[0.9em] text-[#f4f4f5]">Codeforces</span>, <span className="font-mono text-[0.9em] text-[#f4f4f5]">CSES</span>, and <span className="font-mono text-[0.9em] text-[#f4f4f5]">AtCoder</span> — so patterns stick instead of slipping away.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <AnimatedButton href="https://github.com/AmrutanshGupta/Problem-Tracker" variant="primary">
          Get it on GitHub 
          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
        </AnimatedButton>
        <AnimatedButton href="https://github.com/AmrutanshGupta/Problem-Tracker#readme" variant="secondary">
          Read the Docs
        </AnimatedButton>
      </div>
    </section>
  );
}
