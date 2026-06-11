import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE =
  "inline-flex h-[22px] items-center gap-1 rounded-[5px] border px-2 font-mono text-[11px] font-medium transition-colors";

export function SkillChip({
  label,
  active,
  onClick,
  onRemove,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          BASE,
          active
            ? "border-primary bg-accent-soft text-primary"
            : "border-accent-line bg-accent-soft-2 text-primary hover:border-primary",
        )}
      >
        {label}
      </button>
    );
  }

  if (onRemove) {
    return (
      <span
        className={cn(BASE, "border-accent-line bg-accent-soft-2 text-primary")}
      >
        {label}
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-3 hover:text-primary"
          aria-label={`Retirer ${label}`}
        >
          <X className="size-3" strokeWidth={2} />
        </button>
      </span>
    );
  }

  return (
    <span
      className={cn(BASE, "border-accent-line bg-accent-soft-2 text-primary")}
    >
      {label}
    </span>
  );
}
