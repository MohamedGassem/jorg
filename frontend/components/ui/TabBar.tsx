import { cn } from "@/lib/utils";

interface Tab<K extends string> {
  key: K;
  label: string;
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
    <div className={cn("flex gap-1 border-b", className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "border-b-2 px-4 py-3 text-sm font-medium transition-colors",
            activeTab === t.key
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
