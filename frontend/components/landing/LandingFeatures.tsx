// frontend/components/landing/LandingFeatures.tsx
const FEATURES = [
  {
    title: "Profil structuré",
    description:
      "Expériences, compétences, formations. Tout au même endroit, maintenu par le candidat lui-même.",
  },
  {
    title: "Accès contrôlé",
    description:
      "Le candidat décide qui peut consulter son profil. Les accès sont révocables à tout moment.",
  },
  {
    title: "Génération IA",
    description:
      "Transformez un profil en dossier client-ready en 30 secondes, adapté au poste et au format voulu.",
  },
] as const;

export function LandingFeatures() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <h3 className="mb-2 font-semibold text-foreground">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
