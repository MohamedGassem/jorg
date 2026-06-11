"use client";

// CvImport - upload a CV (PDF/DOCX) and review profile suggestions.
// The backend stores a pending proposal; nothing is applied to the profile
// until the candidate confirms here.

import { useRef, useState } from "react";
import { Check, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Experience, LanguageLevel } from "@/types/api";

interface CvExtractedField {
  value: string | null;
  confidence?: number;
  evidence_text?: string | null;
  source_section?: string | null;
  needs_review?: boolean;
}

interface CvExperienceProposal {
  role?: CvExtractedField;
  client_name?: CvExtractedField;
  start_date?: CvExtractedField;
  end_date?: CvExtractedField;
  is_current?: boolean;
  description?: CvExtractedField;
  achievements_summary?: CvExtractedField;
  achievements?: CvExtractedField[];
}

interface CvEducationProposal {
  school?: CvExtractedField;
  degree?: CvExtractedField;
  field_of_study?: CvExtractedField;
  start_date?: CvExtractedField;
  end_date?: CvExtractedField;
}

interface CvCertificationProposal {
  name?: CvExtractedField;
  issuer?: CvExtractedField;
  issue_date?: CvExtractedField;
  expiry_date?: CvExtractedField;
}

interface CvLanguageProposal {
  name?: CvExtractedField;
  level?: CvExtractedField;
}

interface CvSkillSuggestion {
  skill_ref_id: string | null;
  name: string | null;
  original_label?: string | null;
  match_type?: "explicit" | "inferred" | "normalized" | "unmatched";
  kind: string | null;
}

interface CvParseResult {
  proposal_id: string | null;
  status: "pending_review" | "reviewed" | "failed";
  extraction_method: string | null;
  quality_score: number | null;
  warnings: string[];
  proposed_profile: {
    experiences?: CvExperienceProposal[];
    education?: CvEducationProposal[];
    certifications?: CvCertificationProposal[];
    languages?: CvLanguageProposal[];
  };
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  skills: CvSkillSuggestion[];
}

const LANGUAGE_LEVELS: LanguageLevel[] = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
  "native",
];

function fieldValue(field?: CvExtractedField): string | null {
  return field?.value?.trim() || null;
}

// A 409 means the item is already on the profile - benign, not a failure.
function isBenignConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

function cvDateToInputValue(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  return "";
}

interface CvExperienceDraft {
  client_name: string;
  role: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  achievements: string[];
}

function experienceDraftFromProposal(
  item: CvExperienceProposal,
): CvExperienceDraft {
  const endDate = cvDateToInputValue(fieldValue(item.end_date));
  const achievements = (item.achievements ?? [])
    .map((field) => fieldValue(field))
    .filter((value): value is string => Boolean(value));
  const summary = fieldValue(item.achievements_summary);
  if (summary && achievements.length === 0) {
    achievements.push(
      ...summary
        .split(/\n|[•-]\s+/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
  }
  // is_current comes from the backend ("actuel"/"présent"); an empty end_date
  // alone must NOT flip a finished role to "current" - it often just means the
  // end date failed to parse.
  const isCurrent = Boolean(item.is_current);
  return {
    client_name: fieldValue(item.client_name) ?? "",
    role: fieldValue(item.role) ?? "",
    start_date: cvDateToInputValue(fieldValue(item.start_date)),
    end_date: isCurrent ? "" : endDate,
    is_current: isCurrent,
    description: fieldValue(item.description) ?? "",
    achievements,
  };
}

function isDraftAddable(draft: CvExperienceDraft | undefined): boolean {
  return Boolean(
    draft?.client_name.trim() && draft.role.trim() && draft.start_date,
  );
}

function detectedLanguageLevel(value: string | null): LanguageLevel | "" {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "native" ||
    normalized === "natif" ||
    normalized === "native speaker"
  ) {
    return "native";
  }
  const upper = normalized.toUpperCase();
  return LANGUAGE_LEVELS.includes(upper as LanguageLevel)
    ? (upper as LanguageLevel)
    : "";
}

interface CvContactPrefill {
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
}

export function CvImport({
  onContactDetected,
}: {
  onContactDetected?: (contact: CvContactPrefill) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "adding">(
    "idle",
  );
  const [result, setResult] = useState<CvParseResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedExperiences, setSelectedExperiences] = useState<Set<number>>(
    new Set(),
  );
  const [experienceDrafts, setExperienceDrafts] = useState<
    Record<number, CvExperienceDraft>
  >({});
  const [selectedEducation, setSelectedEducation] = useState<Set<number>>(
    new Set(),
  );
  const [selectedLanguages, setSelectedLanguages] = useState<Set<number>>(
    new Set(),
  );
  const [languageLevels, setLanguageLevels] = useState<
    Record<number, LanguageLevel | "">
  >({});
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [addedProfileItems, setAddedProfileItems] = useState<string | null>(
    null,
  );

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAdded(null);
    setAddedProfileItems(null);
    setResult(null);
    setSelectedExperiences(new Set());
    setExperienceDrafts({});
    setStatus("parsing");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parsed = await api.upload<CvParseResult>(
        "/candidates/me/parse-cv",
        formData,
      );
      setResult(parsed);
      setSelected(
        new Set(
          parsed.skills
            .map((s) => s.skill_ref_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const parsedExperienceDrafts = Object.fromEntries(
        (parsed.proposed_profile.experiences ?? []).map((item, index) => [
          index,
          experienceDraftFromProposal(item),
        ]),
      );
      setExperienceDrafts(parsedExperienceDrafts);
      setSelectedExperiences(
        new Set(
          Object.entries(parsedExperienceDrafts)
            .filter(
              ([, draft]) =>
                draft.role ||
                draft.description ||
                draft.achievements.length > 0,
            )
            .map(([index]) => Number(index)),
        ),
      );
      setSelectedEducation(
        new Set(
          (parsed.proposed_profile.education ?? [])
            .map((item, index) => (fieldValue(item.school) ? index : null))
            .filter((index): index is number => index !== null),
        ),
      );
      setSelectedLanguages(
        new Set(
          (parsed.proposed_profile.languages ?? [])
            .map((item, index) => (fieldValue(item.name) ? index : null))
            .filter((index): index is number => index !== null),
        ),
      );
      setLanguageLevels(
        Object.fromEntries(
          (parsed.proposed_profile.languages ?? []).map((item, index) => [
            index,
            detectedLanguageLevel(fieldValue(item.level)),
          ]),
        ),
      );
      setStatus("ready");
      onContactDetected?.({
        email: parsed.email,
        phone: parsed.phone,
        linkedin_url: parsed.linkedin_url,
      });
    } catch (err) {
      setStatus("idle");
      setError(
        err instanceof ApiError
          ? err.detail
          : "Impossible de lire ce fichier. Réessayez avec un PDF ou DOCX.",
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEducation(index: number) {
    setSelectedEducation((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleExperience(index: number) {
    setSelectedExperiences((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateExperienceDraft(
    index: number,
    patch: Partial<CvExperienceDraft>,
  ) {
    setExperienceDrafts((prev) => ({
      ...prev,
      [index]: { ...prev[index], ...patch },
    }));
  }

  function updateExperienceAchievement(
    expIndex: number,
    achievementIndex: number,
    value: string,
  ) {
    setExperienceDrafts((prev) => {
      const draft = prev[expIndex];
      if (!draft) return prev;
      const achievements = [...draft.achievements];
      achievements[achievementIndex] = value;
      return { ...prev, [expIndex]: { ...draft, achievements } };
    });
  }

  function toggleLanguage(index: number) {
    setSelectedLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleAddSkills() {
    if (!result) return;
    setStatus("adding");
    setError(null);
    const toAdd = result.skills.filter(
      (s): s is CvSkillSuggestion & { skill_ref_id: string } =>
        Boolean(s.skill_ref_id && selected.has(s.skill_ref_id)),
    );
    const BATCH_SIZE = 8;
    let count = 0;
    for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
      const outcomes = await Promise.all(
        toAdd.slice(i, i + BATCH_SIZE).map(async (skill) => {
          try {
            await api.post("/candidates/me/skills", {
              skill_ref_id: skill.skill_ref_id,
            });
            return true;
          } catch (err) {
            // 409 = already on profile; ignore and keep going.
            if (!(err instanceof ApiError && err.status === 409)) {
              console.warn("Failed to add skill", skill.name, err);
            }
            return false;
          }
        }),
      );
      count += outcomes.filter(Boolean).length;
    }
    setAdded(count);
    setStatus("ready");
  }

  async function handleAddProfileItems() {
    if (!result) return;
    const incompleteExperience = [...selectedExperiences].find(
      (index) => !isDraftAddable(experienceDrafts[index]),
    );
    if (incompleteExperience !== undefined) {
      setError(
        "Complétez au minimum client, rôle et date de début pour chaque expérience sélectionnée.",
      );
      return;
    }
    setStatus("adding");
    setError(null);
    setAddedProfileItems(null);
    let experienceCount = 0;
    let achievementCount = 0;
    let educationCount = 0;
    let languageCount = 0;
    // Anything other than a 409 (already on profile) is a real failure the
    // candidate must hear about - never report a silent success.
    let failedCount = 0;

    for (const index of selectedExperiences) {
      const draft = experienceDrafts[index];
      if (!isDraftAddable(draft)) continue;
      const achievementTexts = draft.achievements
        .map((value) => value.trim())
        .filter(Boolean);
      try {
        const created = await api.post<Experience>(
          "/candidates/me/experiences",
          {
            client_name: draft.client_name.trim(),
            role: draft.role.trim(),
            start_date: draft.start_date,
            end_date: draft.is_current ? null : draft.end_date || null,
            is_current: draft.is_current,
            description: draft.description.trim() || null,
            achievements_summary: achievementTexts.join("\n") || null,
          },
        );
        experienceCount += 1;
        // Achievements are independent and carry their own order - add them
        // concurrently instead of serially.
        const outcomes = await Promise.allSettled(
          achievementTexts.map((description, order) =>
            api.post(`/candidates/me/experiences/${created.id}/achievements`, {
              description,
              impact: null,
              order,
            }),
          ),
        );
        for (const outcome of outcomes) {
          if (outcome.status === "fulfilled") achievementCount += 1;
          else if (!isBenignConflict(outcome.reason)) failedCount += 1;
        }
      } catch (err) {
        if (!isBenignConflict(err)) {
          failedCount += 1;
          console.warn(
            "Failed to add experience proposal",
            draft.client_name,
            err,
          );
        }
      }
    }

    for (const index of selectedEducation) {
      const item = result.proposed_profile.education?.[index];
      const school = fieldValue(item?.school);
      if (!school) continue;
      try {
        await api.post("/candidates/me/education", {
          school,
          degree: fieldValue(item?.degree),
          field_of_study: fieldValue(item?.field_of_study),
          // Partial CV dates (YYYY / YYYY-MM) are padded to the period start so
          // the year/month is kept instead of being dropped entirely.
          start_date: cvDateToInputValue(fieldValue(item?.start_date)) || null,
          end_date: cvDateToInputValue(fieldValue(item?.end_date)) || null,
        });
        educationCount += 1;
      } catch (err) {
        if (!isBenignConflict(err)) {
          failedCount += 1;
          console.warn("Failed to add education proposal", school, err);
        }
      }
    }

    for (const index of selectedLanguages) {
      const item = result.proposed_profile.languages?.[index];
      const name = fieldValue(item?.name);
      const level = languageLevels[index];
      if (!name || !level) continue;
      try {
        await api.post("/candidates/me/languages", { name, level });
        languageCount += 1;
      } catch (err) {
        if (!isBenignConflict(err)) {
          failedCount += 1;
          console.warn("Failed to add language proposal", name, err);
        }
      }
    }

    const addedTotal =
      experienceCount + achievementCount + educationCount + languageCount;
    if (addedTotal > 0) {
      setAddedProfileItems(
        `${experienceCount} expérience${experienceCount > 1 ? "s" : ""}, ${achievementCount} réalisation${achievementCount > 1 ? "s" : ""}, ${educationCount} formation${educationCount > 1 ? "s" : ""} et ${languageCount} langue${
          languageCount > 1 ? "s" : ""
        } ajoutée${addedTotal > 1 ? "s" : ""}.`,
      );
    }
    if (failedCount > 0) {
      setError(
        `${failedCount} élément${failedCount > 1 ? "s n'ont" : " n'a"} pas pu être ajouté${
          failedCount > 1 ? "s" : ""
        }. Réessayez ou complétez-les manuellement.`,
      );
    }
    setStatus("ready");
  }

  const proposedExperiences = result?.proposed_profile.experiences ?? [];
  const proposedEducation = result?.proposed_profile.education ?? [];
  const proposedCertifications = result?.proposed_profile.certifications ?? [];
  const proposedLanguages = result?.proposed_profile.languages ?? [];
  const addableLanguageCount = [...selectedLanguages].filter(
    (index) => languageLevels[index],
  ).length;
  const addableExperienceCount = [...selectedExperiences].filter((index) =>
    isDraftAddable(experienceDrafts[index]),
  ).length;
  const addableProfileCount =
    addableExperienceCount + selectedEducation.size + addableLanguageCount;

  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-paper-2 px-[22px] py-[18px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-[38px] shrink-0 place-items-center rounded-[10px] border border-accent-line bg-accent-soft text-primary">
          <FileText className="size-[17px]" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">
            Importer un CV pour gagner du temps
          </p>
          <p className="mt-px text-[13px] text-ink-2">
            Nous en extrayons vos coordonnées et vos compétences. Vous gardez le
            contrôle : rien n&apos;est ajouté sans votre confirmation.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={status === "parsing" || status === "adding"}
          onClick={() => inputRef.current?.click()}
        >
          {status === "parsing" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Analyse du CV…
            </>
          ) : (
            <>
              <Upload className="size-4" strokeWidth={1.6} />
              Choisir un fichier
            </>
          )}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFile}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && status !== "parsing" && (
        <div className="mt-4 space-y-3">
          {(result.email || result.phone || result.linkedin_url) && (
            <p className="text-xs text-muted-foreground">
              Coordonnées détectées et pré-remplies
              {result.email ? ` · ${result.email}` : ""}
              {result.phone ? ` · ${result.phone}` : ""}
            </p>
          )}

          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Proposition en attente de validation
            {result.extraction_method ? ` · ${result.extraction_method}` : ""}
            {typeof result.quality_score === "number"
              ? ` · qualité ${result.quality_score}/100`
              : ""}
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {result.warnings.slice(0, 3).map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Sections proposées :{" "}
            {[
              ["expériences", result.proposed_profile.experiences?.length ?? 0],
              ["formations", result.proposed_profile.education?.length ?? 0],
              [
                "certifications",
                result.proposed_profile.certifications?.length ?? 0,
              ],
              ["langues", result.proposed_profile.languages?.length ?? 0],
            ]
              .filter(([, count]) => Number(count) > 0)
              .map(([label, count]) => `${count} ${label}`)
              .join(" · ") || "coordonnées et compétences"}
          </p>

          {(proposedExperiences.length > 0 ||
            proposedEducation.length > 0 ||
            proposedCertifications.length > 0 ||
            proposedLanguages.length > 0) && (
            <div className="space-y-3 rounded-md border border-border/60 bg-background p-3">
              <p className="text-sm font-medium text-foreground">
                Proposition de profil structuré
              </p>

              {proposedExperiences.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Expériences à relire
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Les dates partielles sont préremplies au premier jour de la
                    période détectée. Vérifiez-les avant ajout.
                  </p>
                  {proposedExperiences.map((item, index) => {
                    const draft =
                      experienceDrafts[index] ??
                      experienceDraftFromProposal(item);
                    const label = draft.role || `Expérience ${index + 1}`;
                    return (
                      <div
                        key={`experience-${index}-${label}`}
                        className="space-y-2 rounded-md bg-muted/40 px-2 py-2 text-xs"
                      >
                        <label className="flex items-center gap-2 font-medium text-foreground">
                          <input
                            type="checkbox"
                            checked={selectedExperiences.has(index)}
                            onChange={() => toggleExperience(index)}
                          />
                          {label}
                        </label>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <input
                            className="h-8 rounded-md border border-input bg-background px-2"
                            value={draft.client_name}
                            placeholder="Client ou entreprise *"
                            onChange={(event) =>
                              updateExperienceDraft(index, {
                                client_name: event.target.value,
                              })
                            }
                          />
                          <input
                            className="h-8 rounded-md border border-input bg-background px-2"
                            value={draft.role}
                            placeholder="Rôle *"
                            onChange={(event) =>
                              updateExperienceDraft(index, {
                                role: event.target.value,
                              })
                            }
                          />
                          <input
                            className="h-8 rounded-md border border-input bg-background px-2"
                            type="date"
                            value={draft.start_date}
                            onChange={(event) =>
                              updateExperienceDraft(index, {
                                start_date: event.target.value,
                              })
                            }
                          />
                          <input
                            className="h-8 rounded-md border border-input bg-background px-2"
                            type="date"
                            value={draft.end_date}
                            disabled={draft.is_current}
                            onChange={(event) =>
                              updateExperienceDraft(index, {
                                end_date: event.target.value,
                              })
                            }
                          />
                        </div>
                        <label className="flex items-center gap-2 text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={draft.is_current}
                            onChange={(event) =>
                              updateExperienceDraft(index, {
                                is_current: event.target.checked,
                                end_date: event.target.checked
                                  ? ""
                                  : draft.end_date,
                              })
                            }
                          />
                          Expérience en cours
                        </label>
                        <textarea
                          className="min-h-16 w-full rounded-md border border-input bg-background px-2 py-1"
                          value={draft.description}
                          placeholder="Description"
                          onChange={(event) =>
                            updateExperienceDraft(index, {
                              description: event.target.value,
                            })
                          }
                        />
                        <div className="space-y-1">
                          <p className="font-medium text-muted-foreground">
                            Réalisations
                          </p>
                          {draft.achievements.length === 0 ? (
                            <p className="text-muted-foreground">
                              Aucune réalisation détectée.
                            </p>
                          ) : (
                            draft.achievements.map((achievement, achIndex) => (
                              <textarea
                                key={`experience-${index}-achievement-${achIndex}`}
                                className="min-h-10 w-full rounded-md border border-input bg-background px-2 py-1"
                                value={achievement}
                                onChange={(event) =>
                                  updateExperienceAchievement(
                                    index,
                                    achIndex,
                                    event.target.value,
                                  )
                                }
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {proposedEducation.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Formations
                  </p>
                  {proposedEducation.map((item, index) => {
                    const school = fieldValue(item.school);
                    const degree = fieldValue(item.degree);
                    if (!school) return null;
                    return (
                      <label
                        key={`education-${index}-${school}`}
                        className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedEducation.has(index)}
                          onChange={() => toggleEducation(index)}
                        />
                        <span>
                          <span className="font-medium text-foreground">
                            {school}
                          </span>
                          {degree ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {degree}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {proposedLanguages.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Langues
                  </p>
                  {proposedLanguages.map((item, index) => {
                    const name = fieldValue(item.name);
                    if (!name) return null;
                    return (
                      <div
                        key={`language-${index}-${name}`}
                        className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs"
                      >
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedLanguages.has(index)}
                            onChange={() => toggleLanguage(index)}
                          />
                          <span className="font-medium text-foreground">
                            {name}
                          </span>
                        </label>
                        <select
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                          value={languageLevels[index] ?? ""}
                          onChange={(event) =>
                            setLanguageLevels((prev) => ({
                              ...prev,
                              [index]: event.target.value as LanguageLevel | "",
                            }))
                          }
                        >
                          <option value="">Niveau à choisir</option>
                          {LANGUAGE_LEVELS.map((level) => (
                            <option key={level} value={level}>
                              {level === "native" ? "Natif" : level}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {proposedCertifications.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Certifications détectées
                  </p>
                  <p className="text-xs text-muted-foreground">
                    L&apos;ajout automatique des certifications n&apos;est pas
                    encore disponible. Vous pouvez les reprendre dans
                    l&apos;onglet Formation.
                  </p>
                  {proposedCertifications.slice(0, 4).map((item, index) => {
                    const name =
                      fieldValue(item.name) || `Certification ${index + 1}`;
                    const issuer = fieldValue(item.issuer);
                    return (
                      <p
                        key={`certification-${index}-${name}`}
                        className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground"
                      >
                        {name}
                        {issuer ? ` · ${issuer}` : ""}
                      </p>
                    );
                  })}
                </div>
              )}

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={status === "adding" || addableProfileCount === 0}
                onClick={handleAddProfileItems}
              >
                {status === "adding" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Ajout…
                  </>
                ) : (
                  `Ajouter ${addableProfileCount} proposition${
                    addableProfileCount > 1 ? "s" : ""
                  }`
                )}
              </Button>
              {selectedLanguages.size > addableLanguageCount && (
                <p className="text-xs text-muted-foreground">
                  Choisissez un niveau pour chaque langue à ajouter.
                </p>
              )}
              {addedProfileItems && (
                <p className="text-xs text-primary">{addedProfileItems}</p>
              )}
            </div>
          )}

          {result.skills.length > 0 ? (
            <>
              <p className="text-sm font-medium text-foreground">
                {result.skills.length} compétence
                {result.skills.length > 1 ? "s" : ""} détectée
                {result.skills.length > 1 ? "s" : ""}, sélectionnez celles à
                ajouter
              </p>
              <div className="flex flex-wrap gap-2">
                {result.skills.map((skill) => {
                  const id = skill.skill_ref_id;
                  const label =
                    skill.name ?? skill.original_label ?? "Compétence";
                  if (!id) {
                    return (
                      <span
                        key={`unmatched-${label}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
                      >
                        {label} · non reconnue
                      </span>
                    );
                  }
                  const isSelected = selected.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggle(id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-border/80",
                      )}
                    >
                      {isSelected ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <X className="size-3" />
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={status === "adding" || selected.size === 0}
                onClick={handleAddSkills}
              >
                {status === "adding" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Ajout…
                  </>
                ) : (
                  `Ajouter ${selected.size} compétence${selected.size > 1 ? "s" : ""}`
                )}
              </Button>
              {added !== null && (
                <p className="text-xs text-primary">
                  {added} compétence{added > 1 ? "s" : ""} ajoutée
                  {added > 1 ? "s" : ""} à votre profil.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune compétence reconnue automatiquement. Vous pourrez les
              ajouter manuellement.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
