import { cn } from "@/lib/utils";

/* Brandmark "J" du design handoff (.j-brandmark) : carré arrondi, fond encre
   en clair / accent en sombre, lettre en IBM Plex Serif. */
export function Brandmark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.57) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-[7px] bg-ink font-heading font-semibold text-bg-app dark:bg-primary dark:text-accent-ink",
        className,
      )}
    >
      J
    </span>
  );
}
