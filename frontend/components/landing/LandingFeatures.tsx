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
      "Expériences, compétences et réalisations rangées au même endroit, prêtes à alimenter des dossiers propres.",
  },
  {
    icon: ShieldCheck,
    title: "Accès contrôlé et tracé",
    description:
      "Le candidat décide qui consulte son profil. Chaque consultation lui est visible, chaque accès est révocable, et l'historique n'est jamais effacé.",
  },
  {
    icon: FolderOpen,
    title: "Dossiers sur mesure",
    description:
      "Transformez un profil autorisé en dossier client-ready en trente secondes, adapté au poste et au format voulu.",
  },
];

export function LandingFeatures() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="text-center">
        <p className="j-overline">Conçu pour la confiance</p>
        <h2 className="mt-3 font-heading text-2xl font-semibold sm:text-3xl">
          Un outil métier qui produit des dossiers propres et traçables
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
