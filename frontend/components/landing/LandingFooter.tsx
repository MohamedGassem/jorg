// frontend/components/landing/LandingFooter.tsx
import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/login", label: "Se connecter" },
  { href: "/register", label: "Créer un compte" },
  { href: "/privacy", label: "Confidentialité & RGPD" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <p className="j-meta">© {new Date().getFullYear()} Jorg</p>
        <div className="flex flex-wrap justify-center gap-6">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-ink-3 transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
