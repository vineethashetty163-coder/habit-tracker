"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api, User } from "@/lib/api";

const TOKEN_STORAGE_KEY = "habit_tracker_token";

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    api
      .me(storedToken)
      .then((fetchedUser) => {
        setToken(storedToken);
        setUser(fetchedUser);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const applyToken = useCallback(async (newToken: string) => {
    const fetchedUser = await api.me(newToken);
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(fetchedUser);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await api.login(email, password);
      await applyToken(access_token);
    },
    [applyToken]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await api.register(email, password);
      await applyToken(access_token);
    },
    [applyToken]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
