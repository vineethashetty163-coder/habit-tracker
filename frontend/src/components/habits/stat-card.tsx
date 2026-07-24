"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  icon: LucideIcon;
  value: string;
  label: string;
  sublabel: string;
  colorClassName: string;
  delay?: number;
};

export function StatCard({
  icon: Icon,
  value,
  label,
  sublabel,
  colorClassName,
  delay = 0,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      whileHover={{ y: -2 }}
      className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        className={`mb-4 flex size-10 items-center justify-center rounded-xl ${colorClassName}`}
      >
        <Icon className="size-5" />
      </div>
      <p className="text-4xl font-extrabold tracking-tighter sm:text-5xl">
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium text-foreground/80">{label}</p>
      <p className="text-xs text-muted-foreground">{sublabel}</p>
    </motion.div>
  );
}
