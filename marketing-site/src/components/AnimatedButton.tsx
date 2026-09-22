"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

export default function AnimatedButton({ 
  href, 
  variant = "primary", 
  children 
}: { 
  href: string; 
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  const isPrimary = variant === "primary";
  
  return (
    <motion.a
      href={href}
      whileHover={isPrimary ? { scale: 1.04, boxShadow: "0 0 24px var(--accent-glow)" } : { scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      className={`
        inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-medium transition-colors
        ${isPrimary 
          ? "bg-[#f4f4f5] text-[#09090b]" 
          : "bg-transparent text-[#f4f4f5] border border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.03)]"}
      `}
    >
      {children}
    </motion.a>
  );
}
