"use client";

import { motion } from "framer-motion";
import {
  BookOpen,
  Coffee,
  Dumbbell,
  Heart,
  Moon,
  Pencil,
  Sparkles,
  Sun,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HabitFormDialog } from "@/components/habits/habit-form-dialog";
import { celebrateHabitCompleted, celebrateMilestone } from "@/lib/confetti";
import { Habit } from "@/lib/api";
import { crossedMilestone, getStreakBadge } from "@/lib/streak-badge";

const AVATAR_STYLES: { icon: LucideIcon; className: string }[] = [
  { icon: Sparkles, className: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300" },
  { icon: BookOpen, className: "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" },
  { icon: Heart, className: "bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-300" },
  { icon: Dumbbell, className: "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300" },
  { icon: Moon, className: "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300" },
  { icon: Sun, className: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300" },
  { icon: Coffee, className: "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300" },
  { icon: Target, className: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950 dark:text-fuchsia-300" },
];

type HabitCardProps = {
  habit: Habit;
  onToggleComplete: (id: number) => Promise<Habit | undefined>;
  onUpdate: (id: number, values: { name: string; description: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

export function HabitCard({
  habit,
  onToggleComplete,
  onUpdate,
  onDelete,
}: HabitCardProps) {
  const [isToggling, setIsToggling] = useState(false);
  const avatar = AVATAR_STYLES[habit.id % AVATAR_STYLES.length];
  const Icon = avatar.icon;
  const badge = getStreakBadge(habit.current_streak);

  async function handleToggle(event: React.MouseEvent<HTMLButtonElement>) {
    const previousStreak = habit.current_streak;
    const originX = event.clientX / window.innerWidth;
    const originY = event.clientY / window.innerHeight;

    setIsToggling(true);
    try {
      const updated = await onToggleComplete(habit.id);
      if (updated && updated.current_streak > previousStreak) {
        if (crossedMilestone(previousStreak, updated.current_streak)) {
          celebrateMilestone();
        } else {
          celebrateHabitCompleted(originX, originY);
        }
      }
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
      whileHover={{ y: -2 }}
    >
      <Card className="border shadow-sm transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${avatar.className}`}
              >
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {habit.name}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.emoji}{" "}
                    {habit.current_streak > 0
                      ? `${habit.current_streak} day${habit.current_streak === 1 ? "" : "s"}`
                      : "No streak yet"}
                  </span>
                </div>
                {habit.description && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {habit.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <motion.div whileTap={{ scale: 0.94 }}>
                <Button
                  size="sm"
                  variant={habit.current_streak > 0 ? "default" : "outline"}
                  onClick={handleToggle}
                  disabled={isToggling}
                >
                  {isToggling ? "..." : "Mark today"}
                </Button>
              </motion.div>

              <HabitFormDialog
                trigger={
                  <Button size="icon" variant="ghost" aria-label="Edit habit">
                    <Pencil className="size-4" />
                  </Button>
                }
                title="Edit habit"
                description="Update the name or description."
                submitLabel="Save changes"
                initialValues={{ name: habit.name, description: habit.description ?? "" }}
                onSubmit={(values) => onUpdate(habit.id, values)}
              />

              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button size="icon" variant="ghost" aria-label="Delete habit">
                      <Trash2 className="size-4" />
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete &quot;{habit.name}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this habit and its full completion
                      history. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(habit.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Progress
              value={(habit.week_completed_count / habit.week_goal) * 100}
              className="flex-1"
              aria-label={`${habit.week_completed_count} of ${habit.week_goal} days completed this week`}
            />
            <span className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums">
              {habit.week_completed_count}/{habit.week_goal} this week
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
