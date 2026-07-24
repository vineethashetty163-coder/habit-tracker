"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Flame, ListChecks, Plus, Target, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/habits/dashboard-skeleton";
import { EmptyState } from "@/components/habits/empty-state";
import { HabitCard } from "@/components/habits/habit-card";
import { HabitFormDialog } from "@/components/habits/habit-form-dialog";
import { StatCard } from "@/components/habits/stat-card";
import { WeeklyProgress } from "@/components/habits/weekly-progress";
import { RequireAuth } from "@/components/require-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/contexts/AuthContext";
import { api, ApiError, Habit, WeeklyStats } from "@/lib/api";
import { celebrateHabitCreated, celebrateWeeklyGoal } from "@/lib/confetti";

const WEEKLY_GOAL_THRESHOLD = 0.7;

function DashboardContent() {
  const { user, token, logout } = useAuth();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [stats, setStats] = useState<WeeklyStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasCelebratedGoalRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [habitsData, statsData] = await Promise.all([
      api.listHabits(token),
      api.weeklyStats(token),
    ]);
    setHabits(habitsData);
    setStats(statsData);
  }, [token]);

  useEffect(() => {
    setIsLoading(true);
    refresh()
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Failed to load")
      )
      .finally(() => setIsLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!stats) return;
    if (stats.completion_rate >= WEEKLY_GOAL_THRESHOLD) {
      if (!hasCelebratedGoalRef.current) {
        celebrateWeeklyGoal();
        hasCelebratedGoalRef.current = true;
      }
    } else {
      hasCelebratedGoalRef.current = false;
    }
  }, [stats]);

  async function withRefresh<T>(action: () => Promise<T>): Promise<T | undefined> {
    setError(null);
    try {
      const result = await action();
      await refresh();
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      return undefined;
    }
  }

  const bestStreak = habits.reduce((max, h) => Math.max(max, h.current_streak), 0);

  return (
    <div className="page-gradient min-h-screen">
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-4xl font-bold tracking-tight sm:text-5xl">
              ✨ Habit Tracker
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Welcome back, {user?.email} 👋
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

        {isLoading ? (
          <DashboardSkeleton />
        ) : (
          <div className="space-y-8">
            {stats && (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <StatCard
                    icon={TrendingUp}
                    value={String(stats.total_completions)}
                    label="Completions"
                    sublabel="This week"
                    colorClassName="bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-300"
                    delay={0}
                  />
                  <StatCard
                    icon={Target}
                    value={`${Math.round(stats.completion_rate * 100)}%`}
                    label="Completion rate"
                    sublabel="You've got this"
                    colorClassName="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
                    delay={0.05}
                  />
                  <StatCard
                    icon={ListChecks}
                    value={String(habits.length)}
                    label="Active habits"
                    sublabel="Keep tracking"
                    colorClassName="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
                    delay={0.1}
                  />
                  <StatCard
                    icon={Flame}
                    value={String(bestStreak)}
                    label="Best streak"
                    sublabel="Days in a row"
                    colorClassName="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300"
                    delay={0.15}
                  />
                </div>

                <WeeklyProgress stats={stats} />
              </>
            )}

            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Your habits
              </h2>
              <HabitFormDialog
                trigger={
                  <Button size="sm">
                    <Plus className="size-4" />
                    New habit
                  </Button>
                }
                title="New habit"
                description="What do you want to track?"
                submitLabel="Create habit"
                onSubmit={async (values) => {
                  const result = await withRefresh(() =>
                    api.createHabit(token!, values.name, values.description)
                  );
                  if (result) celebrateHabitCreated();
                }}
              />
            </div>

            {habits.length === 0 ? (
              <EmptyState />
            ) : (
              <motion.div layout className="space-y-3">
                <AnimatePresence initial={false}>
                  {habits.map((habit) => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      onToggleComplete={(id) =>
                        withRefresh(() => api.toggleComplete(token!, id))
                      }
                      onUpdate={(id, values) =>
                        withRefresh(() => api.updateHabit(token!, id, values)).then(
                          () => undefined
                        )
                      }
                      onDelete={(id) =>
                        withRefresh(() => api.deleteHabit(token!, id)).then(
                          () => undefined
                        )
                      }
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            <div className="rounded-2xl bg-gradient-to-r from-violet-500 to-pink-500 p-6 text-center text-white shadow-md">
              <p className="text-lg font-semibold">
                Small habits, big changes! 🌈
              </p>
              <p className="text-sm text-white/90">
                You&apos;re showing up for yourself. That&apos;s what matters most.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
