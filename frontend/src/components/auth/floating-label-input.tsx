"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useId, useState } from "react";

type FloatingLabelInputProps = {
  label: string;
  type?: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
};

export function FloatingLabelInput({
  label,
  type = "text",
  icon: Icon,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
}: FloatingLabelInputProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const isActive = focused || value.length > 0;

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <input
        id={id}
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="w-full rounded-xl border border-input bg-background/70 py-3.5 pr-3.5 pl-11 text-[15px] outline-none transition-all duration-200 focus:border-primary focus:ring-4 focus:ring-primary/20"
      />
      <motion.label
        htmlFor={id}
        initial={false}
        animate={
          isActive
            ? { y: -21, scale: 0.82, x: -4 }
            : { y: 0, scale: 1, x: 0 }
        }
        transition={{ duration: 0.15 }}
        className="pointer-events-none absolute left-10 top-1/2 origin-left -translate-y-1/2 rounded bg-background px-1 text-sm text-muted-foreground"
      >
        {label}
      </motion.label>
    </div>
  );
}
