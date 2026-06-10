import { cn } from "@/lib/utils";

/* Taxonomie des statuts du design handoff : une couleur = une signification.
   positive = état sain · warn = attention requise · accent = nouveauté ·
   muted = inactif (reste visible, traçabilité) */
export type StatusTone = "positive" | "warn" | "accent" | "muted";

const TONES: Record<StatusTone, string> = {
  positive:
    "border-positive-border bg-positive-soft text-positive [&>i]:bg-positive",
  warn: "border-warn-border bg-warn-soft text-warn [&>i]:bg-warn",
  accent: "border-accent-line bg-accent-soft text-primary [&>i]:bg-primary",
  muted: "border-line-2 bg-paper-2 text-ink-2 [&>i]:bg-ink-4",
};

interface StatusPillProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}

export function StatusPill({ tone, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[5px] border px-2 font-mono text-[11.5px] font-medium tracking-[0.02em]",
        TONES[tone],
        className,
      )}
    >
      <i className="size-1.5 rounded-full" aria-hidden />
      {children}
    </span>
  );
}
