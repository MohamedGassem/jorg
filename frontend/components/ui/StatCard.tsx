import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  color?:
    | "primary"
    | "warning"
    | "success"
    | "danger"
    | "neutral"
    | "amber"
    | "emerald";
}

const COLOR_MAP: Record<NonNullable<StatCardProps["color"]>, string> = {
  primary: "text-primary",
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
  neutral: "text-foreground",
  amber: "text-warning",
  emerald: "text-success",
};

export function StatCard({
  label,
  value,
  subtitle,
  color = "neutral",
}: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </p>
      <p className={cn("mt-1 text-3xl font-bold", COLOR_MAP[color])}>{value}</p>
      {subtitle && (
        <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
