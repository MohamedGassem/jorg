// frontend/components/landing/LandingBridge.tsx
export function LandingBridge() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-5xl grid-cols-1 sm:grid-cols-2">
        <div className="border-b border-line px-8 py-12 sm:border-b-0 sm:border-r">
          <p className="j-overline mb-3">Pour les candidats</p>
          <p className="text-base text-foreground">
            Remplissez votre profil une fois : expériences, compétences,
            réalisations. Vous accordez l&apos;accès ESN par ESN, vous
            choisissez ce qui sort (identité anonymisée, TJM masqué, clients
            cités ou non) et vous révoquez quand vous voulez.
          </p>
        </div>
        <div className="px-8 py-12">
          <p className="j-overline mb-3">Pour les recruteurs</p>
          <p className="text-base text-foreground">
            À partir d&apos;un profil autorisé, générez un dossier de
            compétences adapté au poste en 30 secondes. Fini la re-saisie et le
            copier-coller entre CV, profils et templates Word.
          </p>
        </div>
      </div>
    </section>
  );
}
