import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface QuickActionCardProps {
  icon: LucideIcon;
  label: string;
  description: string;
  href: string;
  badge?: number;
}

export function QuickActionCard({
  icon: Icon,
  label,
  description,
  href,
  badge,
}: QuickActionCardProps) {
  return (
    <Link
      href={href}
      className="relative cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
    >
      {badge !== undefined && badge > 0 && (
        <div className="absolute right-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-warning text-xs font-bold text-warning-foreground">
          {badge}
        </div>
      )}
      <Icon className="h-5 w-5 text-foreground" />
      <p className="mt-2 font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </Link>
  );
}
