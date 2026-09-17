"use client";

import { motion } from 'framer-motion';

export default function Home() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-blue-500/30">
      
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center pt-32 pb-20 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-neutral-950 to-neutral-950 -z-10" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            v2 Now Available
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-white to-neutral-400 bg-clip-text text-transparent">
            Master Competitive Programming. <br />
            <span className="text-blue-500">Intelligently.</span>
          </h1>
          <p className="text-lg md:text-xl text-neutral-400 mb-10 leading-relaxed max-w-2xl mx-auto">
            Bookmark, time, and track your problems across LeetCode, Codeforces, CSES, and AtCoder with our offline-first Chrome Extension.
          </p>

          <motion.a 
            href="https://github.com/AmrutanshGupta/Problem-Tracker" 
            target="_blank"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-medium shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-colors"
          >
            Get it on GitHub
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
          </motion.a>
        </motion.div>
      </section>

      {/* Feature Grid */}
      <section className="py-24 px-4 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-6">
          
          <FeatureCard 
            title="Offline-First Architecture"
            desc="Keep solving even when the Wi-Fi drops. Background service workers queue your telemetry and sync automatically when you're back online."
            icon="🔌"
            delay={0.1}
          />
          <FeatureCard 
            title="Spaced Repetition (SM-2)"
            desc="Never forget a pattern again. Our intelligent review queue schedules problems right before you're about to forget them."
            icon="🧠"
            delay={0.2}
          />
          <FeatureCard 
            title="Code Snapshots"
            desc="Save your exact code state at the moment you solve a problem. Perfect for reviewing past approaches and measuring growth."
            icon="📸"
            delay={0.3}
          />
          <FeatureCard 
            title="Secure & Isolated"
            desc="Enterprise-grade JWT authorization guarantees strict multi-tenant data isolation. Your solves are yours alone."
            icon="🔒"
            delay={0.4}
          />

        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-800 py-12 text-center text-neutral-500 mt-20">
        <p>© 2026 Problem Tracker. Open source and built for developers.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc, icon, delay }: { title: string, desc: string, icon: string, delay: number }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, delay }}
      className="p-8 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900 transition-colors group relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-3 text-neutral-200">{title}</h3>
      <p className="text-neutral-400 leading-relaxed">{desc}</p>
    </motion.div>
  );
}
