"use client";

import { cn } from "@/lib/utils";

/* Toggle 42×24 du design handoff (role="switch"). */
interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: ToggleProps) {
  function toggle() {
    if (!disabled) onChange?.(!checked);
  }

  return (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle();
        }
      }}
      className={cn(
        "relative inline-block h-6 w-[42px] shrink-0 rounded-xl transition-colors",
        checked ? "bg-primary" : "bg-line-strong",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] size-[18px] rounded-full bg-white transition-[left]",
          checked ? "left-[21px]" : "left-[3px]",
        )}
      />
    </span>
  );
}
