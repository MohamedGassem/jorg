import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const BASE =
  "inline-flex h-[22px] items-center gap-1 rounded-[5px] border px-2 font-mono text-[11px] font-medium transition-colors";

// `active` is only meaningful for the clickable filter variant, so the type
// only accepts it alongside `onClick`.
type SkillChipProps =
  | { label: string; onClick: () => void; active?: boolean; onRemove?: never }
  | { label: string; onRemove: () => void; onClick?: never; active?: never }
  | { label: string; onClick?: never; onRemove?: never; active?: never };

export function SkillChip(props: SkillChipProps) {
  const { label, onClick, onRemove } = props;
  if (onClick) {
    const active = props.active;
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
