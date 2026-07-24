export type StreakBadge = {
  emoji: string;
  label: string;
  className: string;
};

const TIERS: (StreakBadge & { minStreak: number })[] = [
  {
    minStreak: 365,
    emoji: "💎",
    label: "Legendary",
    className: "bg-gradient-to-r from-violet-500 to-pink-500 text-white",
  },
  {
    minStreak: 90,
    emoji: "🥇",
    label: "Gold",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  },
  {
    minStreak: 30,
    emoji: "🥈",
    label: "Silver",
    className: "bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200",
  },
  {
    minStreak: 14,
    emoji: "🥉",
    label: "Bronze",
    className: "bg-orange-200 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200",
  },
  {
    minStreak: 7,
    emoji: "🔥",
    label: "7 Day",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
  {
    minStreak: 0,
    emoji: "🌱",
    label: "New",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
];

export function getStreakBadge(streak: number): StreakBadge {
  const tier = TIERS.find((t) => streak >= t.minStreak) ?? TIERS[TIERS.length - 1];
  return { emoji: tier.emoji, label: tier.label, className: tier.className };
}

export function crossedMilestone(previousStreak: number, newStreak: number): boolean {
  const previousTier = TIERS.find((t) => previousStreak >= t.minStreak) ?? TIERS[TIERS.length - 1];
  const newTier = TIERS.find((t) => newStreak >= t.minStreak) ?? TIERS[TIERS.length - 1];
  return newTier.minStreak > previousTier.minStreak;
}
