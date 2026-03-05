"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium tracking-wide ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-emerald focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white",
        ghost:
          "bg-transparent text-slate-200 hover:bg-slate-800/80 border border-slate-700/60",
        outline:
          "border border-slate-600/70 bg-slate-900/60 text-slate-100 hover:bg-slate-800/80",
        subtle:
          "bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 border border-slate-700/60"
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5",
        lg: "h-10 px-4",
        icon: "h-8 w-8"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

