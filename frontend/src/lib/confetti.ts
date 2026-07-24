import confetti from "canvas-confetti";

const BRAND_COLORS = ["#a855f7", "#ec4899", "#8b5cf6", "#f472b6"];

function burst(options: confetti.Options) {
  confetti({
    particleCount: 40,
    spread: 55,
    startVelocity: 30,
    gravity: 1.1,
    ticks: 150,
    colors: BRAND_COLORS,
    disableForReducedMotion: true,
    ...options,
  });
}

export function celebrateHabitCreated() {
  burst({ origin: { x: 0.5, y: 0.4 }, particleCount: 30 });
}

export function celebrateAuthSuccess() {
  burst({ origin: { x: 0.5, y: 0.35 }, particleCount: 35, spread: 60 });
}

export function celebrateHabitCompleted(originX: number, originY: number) {
  burst({ origin: { x: originX, y: originY }, particleCount: 24, spread: 40 });
}

export function celebrateMilestone() {
  burst({ origin: { x: 0.5, y: 0.3 }, particleCount: 70, spread: 80, startVelocity: 40 });
}

export function celebrateWeeklyGoal() {
  burst({ origin: { x: 0.3, y: 0.3 }, particleCount: 40 });
  setTimeout(() => burst({ origin: { x: 0.7, y: 0.3 }, particleCount: 40 }), 150);
}
