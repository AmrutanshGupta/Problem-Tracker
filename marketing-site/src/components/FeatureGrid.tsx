"use client";

import { motion } from "framer-motion";

const features = [
  {
    icon: "🔌",
    title: "Offline-First Architecture",
    desc: "Solve anywhere, sync everywhere. A background service worker queues every action locally and syncs automatically the moment you're back online — no lost sessions, no re-tracking from scratch."
  },
  {
    icon: "🧠",
    title: "Spaced Repetition (SM-2)",
    desc: "Review right before you forget. An adaptive scheduler resurfaces bookmarked problems at the interval your memory actually needs, not a fixed one-size-fits-all reminder."
  },
  {
    icon: "📸",
    title: "Code Snapshots",
    desc: "Keep a paper trail of your thinking. Save the exact code behind any bookmarked problem and watch your approach evolve attempt over attempt."
  },
  {
    icon: "🔒",
    title: "Secure & Isolated",
    desc: "Built like production, not a student project. JWT-backed auth and object-level authorization keep every user's data strictly isolated — the same pattern real SaaS backends run on."
  }
];

export default function FeatureGrid() {
  return (
    <section className="relative z-10 py-24 px-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="glass-card p-8 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="text-3xl mb-4">{feature.icon}</div>
            <h3 className="text-xl font-semibold mb-3 text-[#f4f4f5]">{feature.title}</h3>
            <p className="text-[#a1a1aa] leading-relaxed text-sm md:text-base">
              {feature.desc}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
