// frontend/components/landing/LandingBridge.tsx
export function LandingBridge() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto grid max-w-5xl grid-cols-1 sm:grid-cols-2">
        <div className="border-b border-border px-8 py-12 sm:border-b-0 sm:border-r">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
            Pour les candidats
          </p>
          <p className="text-base text-foreground">
            Maintenez un seul profil structuré. Contrôlez précisément qui peut y
            accéder et pendant combien de temps.
          </p>
        </div>
        <div className="px-8 py-12">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
            Pour les recruteurs
          </p>
          <p className="text-base text-foreground">
            Générez des dossiers candidats sur mesure en quelques secondes. Fini
            le copier-coller entre outils.
          </p>
        </div>
      </div>
    </section>
  );
}
