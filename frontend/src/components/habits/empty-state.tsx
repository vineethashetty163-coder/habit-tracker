"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-accent">
        <Sparkles className="size-6 text-accent-foreground" />
      </div>
      <div>
        <p className="font-medium">Let&apos;s build some amazing habits 🚀</p>
        <p className="text-sm text-muted-foreground">
          Every small step today leads to a better tomorrow. Create your first
          habit above.
        </p>
      </div>
    </motion.div>
  );
}
