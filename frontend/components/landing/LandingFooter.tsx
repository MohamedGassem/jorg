// frontend/components/landing/LandingFooter.tsx
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Jorg
        </p>
        <div className="flex gap-6">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Se connecter
          </Link>
          <Link
            href="/register"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Créer un compte
          </Link>
        </div>
      </div>
    </footer>
  );
}
