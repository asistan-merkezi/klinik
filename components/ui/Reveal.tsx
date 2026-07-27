// components/ui/Reveal.tsx
"use client";

import { motion, useReducedMotion } from "framer-motion";

type RevealProps = {
  children: React.ReactNode;
  /** Kademeli giriş için gecikme (sn) */
  delay?: number;
  className?: string;
};

/**
 * Tek client sınırı: bölümler server component kalır, yalnızca
 * giriş animasyonu bu sarmalayıcıya taşınır.
 */
export default function Reveal({ children, delay = 0, className }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.45, ease: "easeOut", delay }}
    >
      {children}
    </motion.div>
  );
}
