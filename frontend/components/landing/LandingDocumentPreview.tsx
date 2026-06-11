import { ShieldCheck } from "lucide-react";
import { Brandmark } from "@/components/ui/Brandmark";

/* Aperçu statique d'un dossier généré (feuille A4 du design handoff).
   Contenu fictif — sert de preuve visuelle sur la landing. */

const SKILLS = ["Python", "Spark", "Airflow", "AWS", "dbt"];

export function LandingDocumentPreview() {
  return (
    <div
      aria-hidden
      className="relative mx-auto flex aspect-[210/297] w-full max-w-[400px] flex-col rounded-lg border border-line bg-surface p-7 text-left shadow-md sm:p-9"
    >
      {/* En-tête du dossier */}
      <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="font-heading text-[21px] font-semibold leading-tight">
            Camille Moreau
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Candidature — Data engineer senior
          </p>
        </div>
        <Brandmark size={24} className="rounded-[5px]" />
      </div>

      {/* Profil */}
      <div className="mt-4">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-primary">
          Profil
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-2">
          Sept ans d&apos;expérience en plateformes data, de l&apos;ingestion à
          l&apos;industrialisation. Spécialiste des pipelines fiables et
          documentés.
        </p>
      </div>

      {/* Compétences clés */}
      <div className="mt-4">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-primary">
          Compétences clés
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {SKILLS.map((skill) => (
            <span
              key={skill}
              className="inline-flex h-[18px] items-center rounded border border-accent-line bg-accent-soft-2 px-1.5 font-mono text-[9px] font-medium text-primary"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Expérience pertinente */}
      <div className="mt-4">
        <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.14em] text-primary">
          Expérience pertinente
        </p>
        <p className="mt-1.5 text-[11px] font-semibold">
          Nexa Conseil — Lead data engineer
        </p>
        <p className="font-mono text-[9px] text-ink-4">
          2022 → aujourd&apos;hui
        </p>
        <div className="mt-1.5 border-l-[3px] border-primary bg-accent-soft-2 py-1.5 pl-2.5 pr-2 text-[10.5px] leading-snug text-ink-2">
          Migration de 40 pipelines vers une plateforme unifiée, −35 % de temps
          de traitement.
        </div>
      </div>

      {/* Pied de page ancré */}
      <div className="mt-auto flex items-center justify-between border-t border-line pt-3">
        <span className="font-mono text-[9px] text-ink-4">
          Réf. JRG-2026-0312
        </span>
        <span className="flex items-center gap-1 font-mono text-[9px] text-positive">
          <ShieldCheck className="size-3" strokeWidth={1.6} />
          Données vérifiées
        </span>
        <span className="font-mono text-[9px] text-ink-4">Page 1 / 2</span>
      </div>
    </div>
  );
}
