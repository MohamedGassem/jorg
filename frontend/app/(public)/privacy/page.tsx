import type { Metadata } from "next";
import Link from "next/link";
import { JorgWordmark } from "@/components/ui/JorgWordmark";

export const metadata: Metadata = {
  title: "Confidentialité & RGPD - Jorg",
  description:
    "Comment Jorg traite vos données personnelles : responsable de traitement, droits RGPD, cookies et traçabilité.",
};

const PROCESSING_FACTS = [
  { label: "Responsable", value: "Mohamed Gassem" },
  { label: "Contact", value: "contact@mohamed-gassem.fr" },
  { label: "Base légale", value: "Consentement + intérêt légitime" },
  {
    label: "Durée de conservation",
    value: "Jusqu'à la suppression de votre compte",
  },
];

const RIGHTS = [
  {
    title: "Droit d'accès et de portabilité",
    detail:
      "Exportez l'intégralité de vos données au format structuré (JSON) depuis Compte & données.",
  },
  {
    title: "Droit de rectification",
    detail:
      "Corrigez vos informations à tout moment depuis votre dossier : vous restez la source de vérité.",
  },
  {
    title: "Droit à l'effacement",
    detail:
      "Supprimez définitivement votre compte et toutes vos données. Les accès tiers sont révoqués dans la foulée.",
  },
  {
    title: "Droit d'opposition et de limitation",
    detail:
      "Écrivez-nous à contact@mohamed-gassem.fr pour vous opposer à un traitement ou en demander la limitation. Nous répondons sous un mois maximum.",
  },
];

export default function PrivacyPage() {
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
        <p className="j-overline">Conformité · Règlement (UE) 2016/679</p>
        <h1 className="mt-3 font-heading text-[27px] font-semibold leading-tight">
          Confidentialité &amp; RGPD
        </h1>
        <p className="mt-2 text-[15px] text-ink-2">
          Jorg est construit autour d&apos;un principe simple : vos données vous
          appartiennent. Rien n&apos;est partagé sans votre accord, et chaque
          accès accordé, révoqué ou dossier généré est journalisé.
        </p>

        <section className="mt-8 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">
            Responsable du traitement
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PROCESSING_FACTS.map((fact) => (
              <div key={fact.label}>
                <p className="j-overline text-[10px]">{fact.label}</p>
                <p className="mt-1 text-[13.5px] font-medium">{fact.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">
            Hébergement, sous-traitants &amp; transferts
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Jorg est hébergé par Railway (États-Unis). Vos données peuvent donc
            être transférées hors de l&apos;Union européenne ; ce transfert est
            encadré par des garanties appropriées (clauses contractuelles
            types). Si vous vous connectez via Google ou LinkedIn, ces
            fournisseurs n&apos;interviennent que pour l&apos;authentification.
            Lorsqu&apos;une organisation utilise la templatisation assistée, le
            modèle de document importé peut être transmis à Anthropic
            (sous-traitant IA, États-Unis), qui ne s&apos;entraîne pas sur les
            données transmises via son API. Aucune donnée n&apos;est revendue ni
            partagée à des fins publicitaires.
          </p>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">Vos droits</h2>
          <p className="mt-0.5 text-[13px] text-ink-2">
            Tous vos droits s&apos;exercent directement depuis votre espace,
            sans formulaire ni délai.
          </p>
          <div className="mt-2 flex flex-col">
            {RIGHTS.map((right, i) => (
              <div
                key={right.title}
                className={
                  i < RIGHTS.length - 1
                    ? "border-b border-line py-[13px]"
                    : "py-[13px]"
                }
              >
                <p className="text-sm font-medium">{right.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-ink-3">
                  {right.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">Cookies &amp; traceurs</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Jorg n&apos;utilise que des cookies strictement nécessaires au
            fonctionnement de la plateforme : session, préférences et thème.
            Aucun traceur publicitaire, aucune revente de données.
          </p>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <h2 className="text-[15px] font-semibold">Traçabilité des accès</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Chaque organisation qui consulte un profil le fait avec
            l&apos;accord explicite du candidat. Les consultations sont
            enregistrées et visibles par le candidat, les accès sont révocables
            à tout moment, et l&apos;historique des accès révoqués reste
            consultable : on n&apos;efface jamais une trace.
          </p>
        </section>

        <p className="j-meta mt-6">
          Produit en alpha privée : cette page évoluera avec le service.
        </p>
      </main>
    </div>
  );
}
