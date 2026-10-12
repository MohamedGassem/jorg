// frontend/components/landing/LandingFeatures.tsx
import {
  FileText,
  FolderOpen,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: FileText,
    title: "Profil structuré",
    description:
      "Expériences, compétences et réalisations au même endroit. Une seule source à maintenir, qui alimente tous les dossiers.",
  },
  {
    icon: ShieldCheck,
    title: "Accès cadré par le candidat",
    description:
      "Le candidat accorde l'accès et en fixe le cadre : anonymisation, TJM masqué, clients masqués, expériences exclues. Il voit chaque dossier généré à partir de son profil et peut révoquer à tout moment.",
  },
  {
    icon: FolderOpen,
    title: "Dossiers sur mesure",
    description:
      "Un profil autorisé devient un dossier prêt à envoyer en 30 secondes, au format attendu par le client.",
  },
];

export function LandingFeatures() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="text-center">
        <p className="j-overline">Conçu pour la confiance</p>
        <h2 className="mt-3 font-heading text-2xl font-semibold sm:text-3xl">
          Un profil structuré, des accès maîtrisés, des dossiers prêts pour le
          client
        </h2>
      </div>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-lg border border-line bg-surface p-6 shadow-sm"
          >
            <span className="grid size-9 place-items-center rounded-lg border border-accent-line bg-accent-soft text-primary">
              <f.icon className="size-[18px]" strokeWidth={1.6} />
            </span>
            <h3 className="mt-4 font-heading text-base font-semibold text-foreground">
              {f.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-3">
              {f.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
