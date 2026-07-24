"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthError } from "@/components/auth/auth-error";
import { AuthLayout } from "@/components/auth/auth-layout";
import { FloatingLabelInput } from "@/components/auth/floating-label-input";
import { WelcomeTransition } from "@/components/auth/welcome-transition";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";
import { celebrateAuthSuccess } from "@/lib/confetti";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      celebrateAuthSuccess();
      setShowWelcome(true);
      setTimeout(() => router.push("/dashboard"), 700);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
      setIsSubmitting(false);
    }
  }

  if (showWelcome) {
    return (
      <WelcomeTransition
        title={`Welcome back${email ? `, ${email.split("@")[0]}` : ""}! 👋`}
        subtitle="Good to see you again."
      />
    );
  }

  return (
    <AuthLayout>
      <div className="rounded-3xl border border-white/40 bg-card/70 p-8 shadow-xl backdrop-blur-xl dark:border-white/10">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Log in to keep your streak alive.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FloatingLabelInput
            label="Email"
            type="email"
            icon={Mail}
            value={email}
            onChange={setEmail}
            required
            autoComplete="email"
          />
          <FloatingLabelInput
            label="Password"
            type="password"
            icon={Lock}
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
          />

          <AnimatePresence>
            {error && <AuthError message={error} />}
          </AnimatePresence>

          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-12 w-full rounded-xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-600 text-base font-semibold text-white shadow-lg shadow-violet-500/25 transition-shadow hover:shadow-xl hover:shadow-violet-500/30"
            >
              {isSubmitting ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                "Log in"
              )}
            </Button>
          </motion.div>

          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 transition hover:underline"
            >
              Create account
            </Link>
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}
