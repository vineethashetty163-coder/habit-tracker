"use client";

import { motion } from "framer-motion";

export function WelcomeTransition({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="page-gradient fixed inset-0 z-50 flex items-center justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="mx-4 rounded-3xl border bg-card/90 px-10 py-8 text-center shadow-xl backdrop-blur-md"
      >
        <p className="text-2xl font-bold">{title}</p>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </motion.div>
    </motion.div>
  );
}
