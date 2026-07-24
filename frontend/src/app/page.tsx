"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(token ? "/dashboard" : "/login");
  }, [isLoading, token, router]);

  return null;
}
