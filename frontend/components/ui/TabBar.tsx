import { cn } from "@/lib/utils";

interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface TabBarProps<K extends string> {
  tabs: Tab<K>[];
  activeTab: K;
  onChange: (key: K) => void;
  className?: string;
}

export function TabBar<K extends string>({
  tabs,
  activeTab,
  onChange,
  className,
}: TabBarProps<K>) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {tabs.map((t) => {
        const active = activeTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border px-[15px] text-[13.5px] transition-colors",
              active
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
