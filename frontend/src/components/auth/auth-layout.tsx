"use client";

import { motion, useReducedMotion } from "framer-motion";

import { AuthHero } from "@/components/auth/auth-hero";

function FloatingOrbs() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-24 -left-24 size-72 rounded-full bg-violet-400/30 blur-3xl dark:bg-violet-600/20"
        animate={reduceMotion ? undefined : { y: [0, 20, 0], x: [0, 15, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-1/3 -right-16 size-80 rounded-full bg-pink-400/25 blur-3xl dark:bg-pink-600/20"
        animate={reduceMotion ? undefined : { y: [0, -25, 0], x: [0, -10, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-1/4 size-64 rounded-full bg-indigo-400/20 blur-3xl dark:bg-indigo-600/20"
        animate={reduceMotion ? undefined : { y: [0, 15, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-gradient relative min-h-screen overflow-hidden">
      <FloatingOrbs />
      <div className="relative mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-8 px-4 py-12 lg:grid-cols-2 lg:gap-12 lg:px-8">
        <AuthHero />
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mx-auto w-full max-w-sm"
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}
