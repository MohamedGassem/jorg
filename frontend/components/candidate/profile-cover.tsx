// Couverture "Mon profil" — masthead éditorial qui remplace l'ancien hero et
// la carte d'identité (plan refonte-ui-mon-dossier.md, tranche 3 + décision 9).
// Le nom, l'intitulé et le résumé appartiennent au consultant (serif) ; les
// conditions au registre (mono) ; l'unique action pleine violette est
// "Générer un dossier", entrée vers les deux chemins standard / adaptée.
"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type {
  CandidateProfile,
  Certification,
  Education,
  Experience,
  Language,
  Skill,
} from "@/types/api";

export function ProfileCover({
  profile,
  onEdit,
}: {
  profile: CandidateProfile;
  onEdit: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [adaptedOpen, setAdaptedOpen] = useState(false);
  const [adaptedPool, setAdaptedPool] = useState<{
    experiences: Experience[];
    skills: Skill[];
  } | null>(null);
  const [adaptedError, setAdaptedError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    profile: CandidateProfile | null;
    experiences: Experience[];
    skills: Skill[];
    education: Education[];
    certifications: Certification[];
    languages: Language[];
  } | null>(null);

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const [
        profileData,
        experiences,
        skills,
        education,
        certifications,
        languages,
      ] = await Promise.all([
        api.get<CandidateProfile>("/candidates/me/profile"),
        api.get<Experience[]>("/candidates/me/experiences"),
        api.get<Skill[]>("/candidates/me/skills"),
        api.get<Education[]>("/candidates/me/education"),
        api.get<Certification[]>("/candidates/me/certifications"),
        api.get<Language[]>("/candidates/me/languages"),
      ]);
      setPreviewData({
        profile: profileData,
        experiences,
        skills,
        education,
        certifications,
        languages,
      });
    } catch {
      // show partial data on error
    } finally {
      setPreviewLoading(false);
    }
  }

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
        <Button variant="outline" onClick={loadPreview}>
          Mode lecture
        </Button>
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

      {/* Aperçu recruteur (modale conservée en tranche 3 ; remplacée par le
          mode lecture pleine page en tranche 5) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Mode lecture</DialogTitle>
          </DialogHeader>
          {previewLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : previewData ? (
            <div className="space-y-4 text-sm">
              {previewData.profile && (
                <div>
                  <p className="text-base font-semibold">
                    {previewData.profile.first_name}{" "}
                    {previewData.profile.last_name}
                  </p>
                  {previewData.profile.title && (
                    <p className="text-muted-foreground">
                      {previewData.profile.title}
                    </p>
                  )}
                  {previewData.profile.summary && (
                    <p className="mt-2">{previewData.profile.summary}</p>
                  )}
                </div>
              )}
              {previewData.skills.filter((s) => s.featured).length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Compétences clés</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.skills
                      .filter((s) => s.featured)
                      .map((s) => (
                        <span
                          key={s.id}
                          className="rounded-[5px] border border-accent-line bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-primary"
                        >
                          {s.skill_ref.name}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              {previewData.experiences.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">Expériences</p>
                  <div className="space-y-3">
                    {previewData.experiences.map((exp) => (
                      <div
                        key={exp.id}
                        className="rounded border border-border/40 p-3"
                      >
                        <p className="font-medium">
                          {exp.client_name} — {exp.role}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exp.start_date}
                          {exp.end_date
                            ? ` → ${exp.end_date}`
                            : exp.is_current
                              ? " → présent"
                              : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewData.education.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">Formations</p>
                  <div className="space-y-2">
                    {previewData.education.map((edu) => (
                      <div key={edu.id}>
                        <p className="font-medium">
                          {[edu.degree, edu.field_of_study]
                            .filter(Boolean)
                            .join(" · ") || edu.school}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {edu.school}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewData.certifications.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">Certifications</p>
                  <div className="space-y-2">
                    {previewData.certifications.map((cert) => (
                      <div key={cert.id}>
                        <p className="font-medium">{cert.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cert.issuer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewData.languages.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Langues</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.languages.map((lang) => (
                      <span
                        key={lang.id}
                        className="rounded-[5px] border border-border/60 px-2.5 py-0.5 text-xs"
                      >
                        {lang.name} · {lang.level}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
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
