import Link from "next/link";

export function AppLegalFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-[var(--shell)] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-7 py-5 text-xs text-ink-3">
        <span>© {new Date().getFullYear()} Jorg</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            href="/mentions-legales"
            className="transition-colors hover:text-foreground"
          >
            Mentions légales
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Confidentialité &amp; RGPD
          </Link>
        </div>
      </div>
    </footer>
  );
}
