// frontend/components/landing/LandingBridge.tsx
export function LandingBridge() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-5xl grid-cols-1 sm:grid-cols-2">
        <div className="border-b border-line px-8 py-12 sm:border-b-0 sm:border-r">
          <p className="j-overline mb-3">Pour les candidats</p>
          <p className="text-base text-foreground">
            Maintenez un seul profil structuré. Contrôlez précisément qui peut y
            accéder, pendant combien de temps — et voyez chaque consultation.
          </p>
        </div>
        <div className="px-8 py-12">
          <p className="j-overline mb-3">Pour les recruteurs</p>
          <p className="text-base text-foreground">
            Générez des dossiers candidats sur mesure en quelques secondes,
            depuis des profils autorisés. Fini le copier-coller entre outils.
          </p>
        </div>
      </div>
    </section>
  );
}
