import Link from "next/link";

export function AuthLegalFooter() {
  return (
    <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-3">
      <span>© {new Date().getFullYear()} Jorg</span>
      <Link
        href="/mentions-legales"
        className="transition-colors hover:text-foreground"
      >
        Mentions légales
      </Link>
      <Link href="/privacy" className="transition-colors hover:text-foreground">
        Confidentialité &amp; RGPD
      </Link>
    </footer>
  );
}
