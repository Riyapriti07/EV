"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "success" | "danger" | "muted";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]";

  const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
    default:
      "border-slate-600/80 bg-slate-900/80 text-slate-100",
    outline:
      "border-slate-600/80 bg-transparent text-slate-300",
    success:
      "border-accent-emerald/70 bg-accent-emerald/10 text-accent-emerald",
    danger:
      "border-accent-crimson/70 bg-accent-crimson/10 text-accent-crimson",
    muted:
      "border-slate-700/80 bg-slate-900/80 text-slate-400"
  };

  return (
    <span
      className={cn(base, variants[variant], className)}
      {...props}
    />
  );
}

