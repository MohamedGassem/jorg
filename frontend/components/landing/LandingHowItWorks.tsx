// frontend/components/landing/LandingHowItWorks.tsx

const STEPS = [
  {
    title: "Le candidat structure son dossier",
    detail:
      "Expériences, compétences, réalisations : une seule source, maintenue à jour par son propriétaire.",
  },
  {
    title: "Il accorde l'accès",
    detail:
      "Rien n'est partagé sans son accord. Chaque accès est journalisé et révocable à tout moment.",
  },
  {
    title: "Le recruteur génère",
    detail:
      "Un dossier client-ready en quelques secondes, adapté au poste et au format voulu.",
  },
];

export function LandingHowItWorks() {
  return (
    <section className="border-t border-line bg-paper-2">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="text-center">
          <p className="j-overline">Comment ça marche</p>
          <h2 className="mt-3 font-heading text-2xl font-semibold sm:text-3xl">
            Un modèle fondé sur le consentement
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-lg border border-line bg-surface px-5 py-4"
            >
              <p className="j-overline text-[10px]">Étape {i + 1}</p>
              <p className="mt-1.5 text-sm font-semibold">{step.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                {step.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
