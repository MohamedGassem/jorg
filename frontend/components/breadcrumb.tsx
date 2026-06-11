import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface Props {
  items: BreadcrumbItem[];
  /** Contenu optionnel aligné à droite (ex. note de traçabilité). */
  trailing?: React.ReactNode;
}

/* Fil d'ariane "page de niveau 2" du design handoff : ← [Section] / [Objet].
   Ligne bordée alignée sur la colonne de contenu — aucune dépendance au
   padding du layout (évite tout désalignement aux grandes largeurs). */
export function Breadcrumb({ items, trailing }: Props) {
  return (
    <nav
      aria-label="Fil d'ariane"
      className="flex h-11 items-center justify-between gap-3 border-b border-line"
    >
      <div className="flex min-w-0 items-center gap-2">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <span key={i} className="flex min-w-0 items-center gap-2">
              {i > 0 && (
                <span className="j-meta shrink-0" aria-hidden>
                  /
                </span>
              )}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-1 whitespace-nowrap text-[13.5px] font-medium text-ink-3 transition-colors hover:text-primary"
                >
                  {i === 0 && (
                    <ChevronLeft className="size-3.5" strokeWidth={1.6} />
                  )}
                  {item.label}
                </Link>
              ) : (
                <span className="truncate text-[13.5px] font-semibold">
                  {item.label}
                </span>
              )}
            </span>
          );
        })}
      </div>
      {trailing && <div className="hidden shrink-0 md:block">{trailing}</div>}
    </nav>
  );
}
