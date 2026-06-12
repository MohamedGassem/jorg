import { cn } from "@/lib/utils";

interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
  disabled?: boolean;
  disabledHint?: string;
}

interface TabBarProps<K extends string> {
  tabs: Tab<K>[];
  activeTab: K;
  onChange: (key: K) => void;
  className?: string;
  /** "pill" = onglets de section (cartes), "underline" = sous-onglets soulignés */
  variant?: "pill" | "underline";
}

export function TabBar<K extends string>({
  tabs,
  activeTab,
  onChange,
  className,
  variant = "pill",
}: TabBarProps<K>) {
  if (variant === "underline") {
    return (
      <div className={cn("flex gap-1 border-b border-line", className)}>
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              disabled={t.disabled}
              title={t.disabled ? t.disabledHint : undefined}
              onClick={() => {
                if (!t.disabled) onChange(t.key);
              }}
              className={cn(
                "-mb-px whitespace-nowrap border-b-[2.5px] px-4 pb-3 pt-2.5 text-sm transition-colors",
                t.disabled
                  ? "cursor-not-allowed border-transparent font-medium text-ink-4 opacity-60"
                  : active
                    ? "border-primary font-semibold text-ink"
                    : "border-transparent font-medium text-ink-3 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tabs.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            disabled={t.disabled}
            title={t.disabled ? t.disabledHint : undefined}
            onClick={() => {
              if (!t.disabled) onChange(t.key);
            }}
            className={cn(
              "flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-[15px] text-[13.5px] transition-colors",
              t.disabled
                ? "cursor-not-allowed border-transparent font-medium text-ink-4 opacity-60"
                : active
                  ? "border-line-2 bg-surface font-semibold text-ink shadow-sm"
                  : "border-transparent font-medium text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 font-mono text-[11px] font-medium",
                  active
                    ? "border-accent-line bg-accent-soft text-primary"
                    : "border-line-2 text-ink-4",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
