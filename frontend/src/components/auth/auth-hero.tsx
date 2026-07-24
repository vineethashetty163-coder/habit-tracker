"use client";

import { motion } from "framer-motion";

const FEATURES = [
  {
    emoji: "🔥",
    title: "Track Streaks",
    description: "Stay consistent and build momentum.",
  },
  {
    emoji: "📊",
    title: "Visual Progress",
    description: "Watch your weekly progress grow.",
  },
  {
    emoji: "🎉",
    title: "Celebrate Wins",
    description: "Earn achievements and celebrate milestones.",
  },
];

export function AuthHero() {
  return (
    <div className="hidden lg:block">
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 bg-clip-text text-4xl font-bold leading-tight tracking-tight text-transparent xl:text-5xl"
      >
        Build Better Habits.
        <br />
        One Day at a Time.
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="mt-4 max-w-md text-lg text-muted-foreground"
      >
        Small daily actions create lifelong change.
      </motion.p>

      <div className="mt-10 space-y-4">
        {FEATURES.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.2 + index * 0.1 }}
            className="flex max-w-md items-start gap-3 rounded-2xl border border-white/40 bg-white/40 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"
          >
            <span className="text-2xl">{feature.emoji}</span>
            <div>
              <p className="font-semibold">{feature.title}</p>
              <p className="text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
