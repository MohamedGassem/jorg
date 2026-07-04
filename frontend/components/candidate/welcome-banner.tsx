"use client";

// Shown once on "Mon profil" right after the onboarding tunnel (choice screen
// exits with ?welcome=1). Dismissible; purely client side.

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PartyPopper, X } from "lucide-react";

export function WelcomeBanner() {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || searchParams.get("welcome") !== "1") return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3">
      <PartyPopper
        className="mt-0.5 size-5 shrink-0 text-primary"
        strokeWidth={1.6}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Bienvenue sur votre profil
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Il vit ici : complétez-le, corrigez ce qui a été importé et ajoutez ce
          qui manque quand vous voulez.
        </p>
      </div>
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
