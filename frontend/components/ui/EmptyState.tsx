import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  message: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  message,
  description,
  icon: Icon,
  className,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-5 py-6 text-left",
        className,
      )}
    >
      {Icon && (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft">
          <Icon className="size-4 text-primary" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
