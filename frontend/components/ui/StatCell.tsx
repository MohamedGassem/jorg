import type { LucideIcon } from "lucide-react";

/* Tuile de statistique de la "stat strip" (dashboards). */
export function StatCell({
  icon: Icon,
  label,
  value,
  foot,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  foot: string;
}) {
  return (
    <div className="flex flex-col gap-2 bg-surface px-5 py-[18px]">
      <div className="flex items-center justify-between">
        <span className="j-overline tracking-[0.1em]">{label}</span>
        <span className="grid size-[30px] place-items-center rounded-[7px] border border-line bg-paper-2 text-ink-3">
          <Icon className="size-[15px]" strokeWidth={1.6} />
        </span>
      </div>
      <div className="font-mono text-[28px] font-medium leading-none tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-[12.5px] text-ink-3">{foot}</div>
    </div>
  );
}
