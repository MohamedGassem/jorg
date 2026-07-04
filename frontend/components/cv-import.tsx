"use client";

// CvImport - upload a CV (PDF/DOCX) and review profile suggestions on a single
// full-page screen shared by the onboarding CV path and "Mon profil".
// The backend stores a pending proposal; nothing is applied to the profile
// until the candidate confirms here. Agreement is given at the screen level:
// every proposed item is checked by default and expanding a section serves to
// exclude, not to include (decided 2026-07-03).

import { useRef, useState } from "react";
import { Check, ChevronDown, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CONTRACT_TYPE_LABELS } from "@/lib/labels";
import type { ContractType, Experience, LanguageLevel } from "@/types/api";

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

interface CvIdentityProposal {
  title?: CvExtractedField;
  location?: CvExtractedField;
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
    identity?: CvIdentityProposal;
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

const CONTRACT_TYPES: ContractType[] = ["freelance", "cdi", "both"];

type SectionKey = "experiences" | "education" | "languages" | "skills";

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

function SectionShell({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-foreground">
          {label}
          <span className="ml-2 text-xs text-muted-foreground">
            {count} sélectionné{count > 1 ? "s" : ""}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t border-border/60 p-3">{children}</div>}
    </div>
  );
}

export function CvImport({
  onContactDetected,
  onApplied,
  collectIdentity = false,
}: {
  onContactDetected?: (contact: CvContactPrefill) => void;
  onApplied?: () => void;
  // The identity block (title/location/contract) belongs to the onboarding CV
  // path only. On "Mon profil", ProfileCover already owns those fields, so the
  // host leaves this false to avoid a second, overwriting editor.
  collectIdentity?: boolean;
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
  const [includeIdentity, setIncludeIdentity] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState<ContractType | "">("");
  const [expanded, setExpanded] = useState<Set<SectionKey>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAppliedSummary(null);
    setResult(null);
    setSelectedExperiences(new Set());
    setExperienceDrafts({});
    setExpanded(new Set());
    setStatus("parsing");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parsed = await api.upload<CvParseResult>(
        "/candidates/me/parse-cv",
        formData,
      );
      setResult(parsed);
      const identity = parsed.proposed_profile.identity ?? {};
      const detectedTitle = fieldValue(identity.title) ?? "";
      const detectedLocation = fieldValue(identity.location) ?? "";
      setTitle(detectedTitle);
      setLocation(detectedLocation);
      setContractType("");
      setIncludeIdentity(Boolean(detectedTitle || detectedLocation));
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

  function toggleSection(key: SectionKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  async function applyIdentity(): Promise<boolean> {
    const payload: Record<string, string> = {};
    if (title.trim()) payload.title = title.trim();
    if (location.trim()) payload.location = location.trim();
    if (contractType) payload.contract_type = contractType;
    if (Object.keys(payload).length === 0) return false;
    try {
      await api.put("/candidates/me/profile", payload);
      return true;
    } catch (err) {
      if (!isBenignConflict(err)) console.warn("Failed to save identity", err);
      return false;
    }
  }

  async function handleApply() {
    if (!result) return;
    const incompleteExperience = [...selectedExperiences].find(
      (index) => !isDraftAddable(experienceDrafts[index]),
    );
    if (incompleteExperience !== undefined) {
      setExpanded((prev) => new Set(prev).add("experiences"));
      setError(
        "Complétez au minimum client, rôle et date de début pour chaque expérience sélectionnée.",
      );
      return;
    }
    setStatus("adding");
    setError(null);
    setAppliedSummary(null);
    let experienceCount = 0;
    let achievementCount = 0;
    let educationCount = 0;
    let languageCount = 0;
    let skillCount = 0;
    // Anything other than a 409 (already on profile) is a real failure the
    // candidate must hear about - never report a silent success.
    let failedCount = 0;

    const identityApplied =
      collectIdentity && includeIdentity ? await applyIdentity() : false;

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

    const skillsToAdd = result.skills.filter(
      (s): s is CvSkillSuggestion & { skill_ref_id: string } =>
        Boolean(s.skill_ref_id && selected.has(s.skill_ref_id)),
    );
    const BATCH_SIZE = 8;
    for (let i = 0; i < skillsToAdd.length; i += BATCH_SIZE) {
      const outcomes = await Promise.all(
        skillsToAdd.slice(i, i + BATCH_SIZE).map(async (skill) => {
          try {
            await api.post("/candidates/me/skills", {
              skill_ref_id: skill.skill_ref_id,
            });
            return true;
          } catch (err) {
            if (!isBenignConflict(err)) {
              console.warn("Failed to add skill", skill.name, err);
            }
            return false;
          }
        }),
      );
      skillCount += outcomes.filter(Boolean).length;
    }

    const addedTotal =
      experienceCount +
      achievementCount +
      educationCount +
      languageCount +
      skillCount;
    if (addedTotal > 0 || identityApplied) {
      setAppliedSummary(
        buildSummaryText({
          identity: identityApplied,
          experiences: experienceCount,
          education: educationCount,
          languages: languageCount,
          skills: skillCount,
        }),
      );
    } else if (failedCount === 0) {
      // Everything selected was already on the profile (benign 409s).
      setAppliedSummary("Ces éléments sont déjà présents sur votre profil.");
    }
    if (failedCount > 0) {
      setError(
        `${failedCount} élément${failedCount > 1 ? "s n'ont" : " n'a"} pas pu être ajouté${
          failedCount > 1 ? "s" : ""
        }. Réessayez ou complétez-les manuellement.`,
      );
    }
    setStatus("ready");
    // A real (non-409) failure must stay visible: never let the caller navigate
    // away from the error. A clean apply - even one where every item was already
    // present - advances the flow so the onboarding tunnel is not a dead-end.
    if (failedCount === 0) {
      onApplied?.();
    }
  }

  const matchedSkills = result?.skills.filter((s) => s.skill_ref_id) ?? [];
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
  const identityToAdd =
    collectIdentity &&
    includeIdentity &&
    (title.trim() || location.trim() || contractType)
      ? 1
      : 0;
  const totalToAdd =
    addableExperienceCount +
    selectedEducation.size +
    addableLanguageCount +
    selected.size +
    identityToAdd;

  return (
    <div className="space-y-4">
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
              Nous en extrayons vos coordonnées et vos compétences. Vous gardez
              le contrôle : rien n&apos;est ajouté sans votre confirmation.
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
                {result ? "Choisir un autre fichier" : "Choisir un fichier"}
              </>
            )}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFile}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {result && status !== "parsing" && (
        <div className="space-y-3">
          {(() => {
            const visibleWarnings = result.warnings.filter(
              (w) => !w.startsWith("Extraction structurée heuristique"),
            );
            return visibleWarnings.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {visibleWarnings.slice(0, 3).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null;
          })()}

          {collectIdentity && (
            <div className="space-y-3 rounded-md border border-border/60 bg-background p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={includeIdentity}
                  onChange={(e) => setIncludeIdentity(e.target.checked)}
                />
                Mon titre et ma localisation
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="cv-title">Titre / poste actuel</Label>
                  <Input
                    id="cv-title"
                    value={title}
                    placeholder="ex: Développeur Full-Stack"
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cv-contract">Contrat recherché</Label>
                  <select
                    id="cv-contract"
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={contractType}
                    onChange={(e) =>
                      setContractType(e.target.value as ContractType | "")
                    }
                  >
                    <option value="">À préciser</option>
                    {CONTRACT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CONTRACT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cv-location">Localisation</Label>
                  <Input
                    id="cv-location"
                    value={location}
                    placeholder="ex: Paris, France"
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {(result.email || result.phone || result.linkedin_url) && (
            <div className="rounded-md border border-accent-line bg-accent-soft-2 px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                Coordonnées détectées
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[result.email, result.phone, result.linkedin_url]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}

          {proposedExperiences.length > 0 && (
            <SectionShell
              label="Expériences"
              count={addableExperienceCount}
              open={expanded.has("experiences")}
              onToggle={() => toggleSection("experiences")}
            >
              <div className="space-y-2">
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
            </SectionShell>
          )}

          {proposedEducation.length > 0 && (
            <SectionShell
              label="Formations"
              count={selectedEducation.size}
              open={expanded.has("education")}
              onToggle={() => toggleSection("education")}
            >
              <div className="space-y-1.5">
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
            </SectionShell>
          )}

          {proposedLanguages.length > 0 && (
            <SectionShell
              label="Langues"
              count={addableLanguageCount}
              open={expanded.has("languages")}
              onToggle={() => toggleSection("languages")}
            >
              <div className="space-y-1.5">
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
                {selectedLanguages.size > addableLanguageCount && (
                  <p className="text-xs text-muted-foreground">
                    Choisissez un niveau pour chaque langue à ajouter.
                  </p>
                )}
              </div>
            </SectionShell>
          )}

          {matchedSkills.length > 0 && (
            <SectionShell
              label="Compétences"
              count={selected.size}
              open={expanded.has("skills")}
              onToggle={() => toggleSection("skills")}
            >
              <div className="flex flex-wrap gap-2">
                {result.skills.map((skill) => {
                  const id = skill.skill_ref_id;
                  const label =
                    skill.name ?? skill.original_label ?? "Compétence";
                  if (!id) return null;
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
            </SectionShell>
          )}

          {proposedCertifications.length > 0 && (
            <div className="space-y-1.5 rounded-md border border-border/60 bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Certifications détectées
              </p>
              <p className="text-xs text-muted-foreground">
                L&apos;ajout automatique des certifications n&apos;est pas
                encore disponible. Vous pouvez les reprendre dans l&apos;onglet
                Formation.
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
            className="w-full"
            disabled={status === "adding" || totalToAdd === 0}
            onClick={handleApply}
          >
            {status === "adding" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Ajout…
              </>
            ) : (
              `Ajouter ${totalToAdd} élément${totalToAdd > 1 ? "s" : ""}`
            )}
          </Button>
          {appliedSummary && (
            <p className="text-xs text-primary">{appliedSummary}</p>
          )}
        </div>
      )}
    </div>
  );
}

function buildSummaryText(counts: {
  identity: boolean;
  experiences: number;
  education: number;
  languages: number;
  skills: number;
}): string {
  const parts: string[] = [];
  if (counts.experiences > 0)
    parts.push(
      `${counts.experiences} expérience${counts.experiences > 1 ? "s" : ""}`,
    );
  if (counts.education > 0)
    parts.push(
      `${counts.education} formation${counts.education > 1 ? "s" : ""}`,
    );
  if (counts.languages > 0)
    parts.push(`${counts.languages} langue${counts.languages > 1 ? "s" : ""}`);
  if (counts.skills > 0)
    parts.push(`${counts.skills} compétence${counts.skills > 1 ? "s" : ""}`);
  if (counts.identity) parts.push("votre titre et localisation");
  if (parts.length === 0) return "Rien n'a été ajouté.";
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
  return `${joined} ajouté${parts.length > 1 || counts.experiences > 1 ? "s" : ""} à votre profil.`;
}
