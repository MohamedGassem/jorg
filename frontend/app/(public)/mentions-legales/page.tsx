import type { Metadata } from "next";
import Link from "next/link";
import { JorgWordmark } from "@/components/ui/JorgWordmark";

export const metadata: Metadata = {
  title: "Mentions légales - Jorg",
  description:
    "Mentions légales de Jorg : éditeur du site, contact, hébergeur et responsabilité.",
};

const EDITOR_FACTS = [
  { label: "Éditeur", value: "Mohamed Gassem" },
  { label: "Statut", value: "Projet personnel (particulier)" },
  { label: "Contact", value: "contact@mohamed-gassem.fr" },
  { label: "Directeur de publication", value: "Mohamed Gassem" },
];

const HOST_FACTS = [
  { label: "Hébergeur", value: "Railway Corporation" },
  {
    label: "Adresse",
    value:
      "548 Market St Suite 68956, San Francisco, California 94104, États-Unis",
  },
  { label: "Contact", value: "team@railway.com · (415) 707-7675" },
  { label: "Site", value: "railway.com" },
];

export default function LegalNoticePage() {
  return (
    <div className="min-h-dvh bg-background">
      <nav className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/">
            <JorgWordmark />
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-ink-3 hover:text-primary"
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <p className="j-overline">Informations légales · LCEN art. 6</p>
        <h1 className="mt-3 font-heading text-[27px] font-semibold leading-tight">
          Mentions légales
        </h1>
        <p className="mt-2 text-[15px] text-ink-2">
          Jorg est un projet personnel, non rattaché à une société. Les
          informations ci-dessous identifient l&apos;éditeur du site et son
          hébergeur, conformément à la loi pour la confiance dans
          l&apos;économie numérique.
        </p>

        <section className="mt-8 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">Éditeur du site</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {EDITOR_FACTS.map((fact) => (
              <div key={fact.label}>
                <p className="j-overline text-[10px]">{fact.label}</p>
                <p className="mt-1 text-[13.5px] font-medium">{fact.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">Hébergement</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {HOST_FACTS.map((fact) => (
              <div key={fact.label}>
                <p className="j-overline text-[10px]">{fact.label}</p>
                <p className="mt-1 text-[13.5px] font-medium">{fact.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">
            Propriété intellectuelle
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            La marque Jorg, le code source, la charte graphique et les contenus
            de la plateforme sont la propriété de l&apos;éditeur, sauf mention
            contraire. Toute reproduction ou réutilisation sans autorisation est
            interdite. Les données saisies par les utilisateurs restent leur
            propriété.
          </p>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">Responsabilité</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Jorg est proposé en l&apos;état, dans le cadre d&apos;un projet
            personnel en cours de développement. L&apos;éditeur s&apos;efforce
            d&apos;assurer la disponibilité et l&apos;exactitude du service sans
            pouvoir le garantir, et ne saurait être tenu responsable des
            interruptions ou des dommages résultant de son utilisation.
          </p>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">Données personnelles</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Le traitement de vos données personnelles est détaillé dans notre{" "}
            <Link
              href="/privacy"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              politique de confidentialité
            </Link>
            .
          </p>
        </section>

        <p className="j-meta mt-6">
          Projet en alpha privée : ces mentions évolueront avec le service.
        </p>
      </main>
    </div>
  );
}
