import { cn } from "@/lib/utils";

/* Marque Jorg du design handoff : brandmark "J" 30×30 (carré arrondi,
   fond encre — accent en mode sombre) + wordmark en IBM Plex Serif. */
export function JorgWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-[11px]", className)}>
      <span
        className="grid size-[30px] place-items-center rounded-[7px] bg-ink font-heading text-[17px] font-semibold text-bg-app dark:bg-primary dark:text-accent-ink"
        aria-hidden
      >
        J
      </span>
      <span className="font-heading text-[19px] font-semibold tracking-tight text-foreground">
        Jorg
      </span>
    </span>
  );
}
