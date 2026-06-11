import { cn } from "@/lib/utils";
import { Brandmark } from "@/components/ui/Brandmark";

/* Marque Jorg du design handoff : brandmark "J" + wordmark IBM Plex Serif. */
export function JorgWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-[11px]", className)}>
      <Brandmark />
      <span className="font-heading text-[19px] font-semibold tracking-tight text-foreground">
        Jorg
      </span>
    </span>
  );
}
