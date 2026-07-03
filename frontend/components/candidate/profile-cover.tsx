// Couverture "Mon profil" — masthead éditorial qui remplace l'ancien hero et
// la carte d'identité (plan refonte-ui-mon-dossier.md, tranche 3 + décision 9).
// Le nom, l'intitulé et le résumé appartiennent au consultant (serif) ; les
// conditions au registre (mono) ; l'unique action pleine violette est
// "Générer un dossier", entrée vers les deux chemins standard / adaptée.
"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import {
  AVAILABILITY_LABELS,
  CONTRACT_TYPE_LABELS,
  frDate,
  labelFor,
  relativeDate,
} from "@/lib/labels";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { DossierGenerationDialog } from "@/components/dossier-generation-dialog";
import { DossierAdaptedEditor } from "@/components/dossier-adapted-editor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CandidateProfile, Experience, Skill } from "@/types/api";

export function ProfileCover({
  profile,
  onEdit,
}: {
  profile: CandidateProfile;
  onEdit: () => void;
}) {
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [adaptedOpen, setAdaptedOpen] = useState(false);
  const [adaptedPool, setAdaptedPool] = useState<{
    experiences: Experience[];
    skills: Skill[];
  } | null>(null);
  const [adaptedError, setAdaptedError] = useState<string | null>(null);

  async function openAdaptedEditor() {
    setAdaptedError(null);
    setChoiceOpen(false);
    if (adaptedPool) {
      setAdaptedOpen(true);
      return;
    }
    try {
      const [experiences, skills] = await Promise.all([
        api.get<Experience[]>("/candidates/me/experiences"),
        api.get<Skill[]>("/candidates/me/skills"),
      ]);
      setAdaptedPool({ experiences, skills });
      setAdaptedOpen(true);
    } catch (err) {
      setAdaptedError(
        extractErrorMessage(err, "Impossible de charger vos données"),
      );
    }
  }

  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";
  const availabilityLabel =
    profile.availability_status === "available_from" &&
    profile.availability_date
      ? `Disponible le ${frDate(profile.availability_date)}`
      : labelFor(AVAILABILITY_LABELS, profile.availability_status);
  const meta = [
    availabilityLabel,
    labelFor(CONTRACT_TYPE_LABELS, profile.contract_type),
    profile.daily_rate ? `TJM ${profile.daily_rate} €` : null,
    profile.annual_salary
      ? `${profile.annual_salary.toLocaleString("fr-FR")} €/an`
      : null,
    profile.location,
    profile.years_of_experience ? `${profile.years_of_experience} ans` : null,
  ].filter(Boolean);

  return (
    <section className="group/cover border-b border-line pb-7">
      <div className="flex items-start justify-between gap-4">
        <p className="j-overline">
          Mon profil
          {profile.updated_at
            ? ` · mis à jour ${relativeDate(profile.updated_at)}`
            : ""}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Modifier l'identité"
          title="Modifier l'identité"
          className="-mt-1 shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover/cover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="size-3.5" strokeWidth={1.6} />
        </Button>
      </div>

      <h1 className="mt-3 font-heading text-[30px] font-semibold leading-[1.1]">
        {fullName}
      </h1>
      <p className="mt-1.5 font-heading text-[18px] font-medium text-ink-2">
        {[profile.title, profile.location].filter(Boolean).join(" · ") ||
          "Titre et localisation à compléter"}
      </p>

      {meta.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] text-ink-2">
          {meta.map((item, i) => (
            <span key={i} className="flex items-center gap-3">
              {i > 0 && <span className="text-ink-4">·</span>}
              {item}
            </span>
          ))}
        </div>
      )}

      {profile.summary && (
        <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-ink">
          {profile.summary}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={() => setChoiceOpen(true)}>Générer un dossier</Button>
        <Link
          href="/candidate/profile/read"
          className={buttonVariants({ variant: "outline" })}
        >
          Mode lecture
        </Link>
      </div>
      <ErrorAlert error={adaptedError} />

      {/* Choix du chemin de génération (décision 9) */}
      <Dialog open={choiceOpen} onOpenChange={setChoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Générer un dossier</DialogTitle>
          </DialogHeader>
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setChoiceOpen(false);
                setGenerateOpen(true);
              }}
              className="w-full rounded-[6px] border border-line-strong bg-surface px-4 py-3 text-left transition-colors hover:border-accent-line hover:bg-accent-soft-2"
            >
              <p className="text-sm font-semibold">Dossier standard</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                Votre profil complet, mis en forme tel quel.
              </p>
            </button>
            <button
              type="button"
              onClick={openAdaptedEditor}
              className="w-full rounded-[6px] border border-line-strong bg-surface px-4 py-3 text-left transition-colors hover:border-accent-line hover:bg-accent-soft-2"
            >
              <p className="text-sm font-semibold">Version adaptée</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                Sélectionnez expériences et compétences pour une mission
                précise.
              </p>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <DossierGenerationDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        target={{ kind: "self" }}
      />
      {adaptedPool && (
        <DossierAdaptedEditor
          open={adaptedOpen}
          onOpenChange={setAdaptedOpen}
          target={{ kind: "self" }}
          experiences={adaptedPool.experiences.map((e) => ({
            id: e.id,
            role: e.role,
            client_name: e.client_name,
          }))}
          skills={adaptedPool.skills.map((s) => ({
            id: s.id,
            name: s.skill_ref.name,
          }))}
        />
      )}
    </section>
  );
}
