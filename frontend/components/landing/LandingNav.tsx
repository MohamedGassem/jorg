// frontend/components/landing/LandingNav.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JorgWordmark } from "@/components/ui/JorgWordmark";

export function LandingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <JorgWordmark />
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Se connecter
            </Button>
          </Link>
          <Link href="/register?role=recruiter">
            <Button size="sm">Demander un accès recruteur</Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
