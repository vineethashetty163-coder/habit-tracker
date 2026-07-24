"use client";

import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

export function AuthError({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
      role="alert"
    >
      <AlertCircle className="size-4 shrink-0" />
      {message}
    </motion.div>
  );
}
