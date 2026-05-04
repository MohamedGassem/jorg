import { Badge } from "@/components/ui/badge";

type Variant = "default" | "secondary" | "destructive" | "outline";

interface StatusBadgeProps {
  status: string;
  labels: Record<string, string>;
  variants: Record<string, Variant>;
  fallbackLabel?: string;
  fallbackVariant?: Variant;
}

export function StatusBadge({
  status,
  labels,
  variants,
  fallbackLabel = status,
  fallbackVariant = "secondary",
}: StatusBadgeProps) {
  return (
    <Badge variant={variants[status] ?? fallbackVariant}>
      {labels[status] ?? fallbackLabel}
    </Badge>
  );
}
