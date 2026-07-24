"use client";

import { motion } from "framer-motion";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WeeklyStats } from "@/lib/api";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeeklyProgress({ stats }: { stats: WeeklyStats }) {
  return (
    <Card className="border bg-card shadow-sm">
      <CardHeader>
        <CardTitle>This week</CardTitle>
        <CardDescription>
          {stats.start_date} to {stats.end_date}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between gap-2 sm:gap-4">
          {stats.daily_completions.map((day, index) => {
            const dayOfWeek = new Date(`${day.date}T00:00:00`).getDay();
            const completed = day.completed_count > 0;
            return (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-2"
                title={`${day.date}: ${day.completed_count} completion${
                  day.completed_count === 1 ? "" : "s"
                }`}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {DAY_LABELS[dayOfWeek]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(`${day.date}T00:00:00`).getDate()}
                </span>
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25, delay: index * 0.05 }}
                  className={`flex size-9 items-center justify-center rounded-full border-2 sm:size-10 ${
                    completed
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/30 bg-transparent"
                  }`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" /> Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-muted-foreground/30" />{" "}
            Pending
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
