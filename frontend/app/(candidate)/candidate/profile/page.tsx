// frontend/app/(candidate)/profile/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, FolderOpen, Pencil, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CvImport } from "@/components/cv-import";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { completionPercent, profileCompletionChecks } from "@/lib/completion";
import {
  AVAILABILITY_LABELS,
  CONTRACT_TYPE_LABELS,
  WORK_MODE_LABELS,
  frDate,
  labelFor,
  relativeDate,
} from "@/lib/labels";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { TabBar } from "@/components/ui/TabBar";
import { ExperienceSection } from "@/components/candidate/experience-section";
import { SkillSection } from "@/components/candidate/skill-section";
import { EducationSection } from "@/components/candidate/education-section";
import { CertificationSection } from "@/components/candidate/certification-section";
import { LanguageSection } from "@/components/candidate/language-section";
import { DossierGenerationDialog } from "@/components/dossier-generation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AvailabilityStatus,
  type CandidateProfile,
  type ContractType,
  type Experience,
  type Skill,
  type WorkMode,
} from "@/types/api";

const WORK_MODE_ITEMS: Record<string, string> = {
  "": "Non précisé",
  ...WORK_MODE_LABELS,
};

function deriveYearsOfExperience(experiences: Experience[]): number | null {
  const startTimes = experiences
    .map((e) => new Date(e.start_date).getTime())
    .filter((t) => !Number.isNaN(t));
  if (startTimes.length === 0) return null;
  const now = Date.now();
  const endTimes = experiences
    .map((e) =>
      e.is_current ? now : e.end_date ? new Date(e.end_date).getTime() : NaN,
    )
    .filter((t) => !Number.isNaN(t));
  const latest = endTimes.length > 0 ? Math.max(...endTimes) : now;
  const years = Math.floor(
    (latest - Math.min(...startTimes)) / (365 * 24 * 3600 * 1000),
  );
  return Math.max(years, 0);
}

function ProfileHero({
  profile,
  hasExperience,
  hasSkill,
  onEdit,
}: {
  profile: CandidateProfile;
  hasExperience: boolean;
  hasSkill: boolean;
  onEdit: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    profile: CandidateProfile | null;
    experiences: Experience[];
    skills: Skill[];
  } | null>(null);

  async function loadPreview() {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const [profileData, experiences, skills] = await Promise.all([
        api.get<CandidateProfile>("/candidates/me/profile"),
        api.get<Experience[]>("/candidates/me/experiences"),
        api.get<Skill[]>("/candidates/me/skills"),
      ]);
      setPreviewData({ profile: profileData, experiences, skills });
    } catch {
      // show partial data on error
    } finally {
      setPreviewLoading(false);
    }
  }

  const checks = profileCompletionChecks(profile, { hasExperience, hasSkill });
  const completion = completionPercent(checks);
  const missing = checks.filter((c) => !c.done);
  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "-";
  const availabilityLabel =
    profile.availability_status === "available_from" &&
    profile.availability_date
      ? `Disponible le ${frDate(profile.availability_date)}`
      : labelFor(AVAILABILITY_LABELS, profile.availability_status);
  const conditions = [
    availabilityLabel,
    labelFor(CONTRACT_TYPE_LABELS, profile.contract_type),
    profile.daily_rate ? `${profile.daily_rate} €/j` : null,
    profile.annual_salary
      ? `${profile.annual_salary.toLocaleString("fr-FR")} €/an`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const initials =
    [profile.first_name?.[0], profile.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "?";

  return (
    <>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="j-overline">
            Profil structuré
            {profile.updated_at
              ? ` · mis à jour ${relativeDate(profile.updated_at)}`
              : ""}
          </p>
          <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
            Mon dossier
          </h1>
          <p className="mt-1 max-w-[520px] text-[15px] text-ink-2">
            Les informations qui rendent votre profil exploitable par les
            organisations autorisées et les dossiers générés.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button variant="outline" onClick={loadPreview}>
            <Eye className="size-4" strokeWidth={1.6} />
            Voir ce qu&apos;un recruteur verra
          </Button>
          <Button onClick={() => setGenerateOpen(true)}>
            <FolderOpen className="size-4" strokeWidth={1.6} />
            Générer un dossier
          </Button>
        </div>
      </header>

      <section className="rounded-lg border border-line bg-surface px-[26px] py-[22px]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid size-[46px] shrink-0 place-items-center overflow-hidden rounded-[10px] border border-accent-line bg-accent-soft font-heading text-[19px] font-semibold text-primary">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-[22px] font-semibold leading-tight">
                {fullName}
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onEdit}
                aria-label="Modifier l'identité"
                title="Modifier l'identité"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3.5" strokeWidth={1.6} />
              </Button>
            </div>
            <p className="mt-0.5 text-[14.5px] text-ink-2">
              {[profile.title, profile.location].filter(Boolean).join(" · ") ||
                "Titre et localisation à compléter"}
            </p>
            {conditions && (
              <p className="mt-0.5 text-[13.5px] text-ink-3">{conditions}</p>
            )}
            {profile.updated_at && (
              <p className="j-meta mt-1.5">
                Mis à jour {relativeDate(profile.updated_at)}
              </p>
            )}
          </div>
          <div className="w-full shrink-0 sm:w-[220px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="j-overline text-[10.5px]">Complétude</span>
              <span className="font-mono text-sm font-medium tabular-nums">
                {completion}%
              </span>
            </div>
            <div className="h-[7px] overflow-hidden rounded border border-line bg-paper-3">
              <i
                className="block h-full rounded bg-primary transition-all"
                style={{ width: `${completion}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-ink-3">
              {missing.length > 0
                ? `À compléter : ${missing.map((c) => c.label).join(", ")}`
                : "Profil complet"}
            </p>
          </div>
        </div>
      </section>

      {/* Aperçu recruteur dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aperçu recruteur</DialogTitle>
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
                          className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary"
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
                          {exp.client_name} - {exp.role}
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
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <DossierGenerationDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        target={{ kind: "self" }}
      />
    </>
  );
}

function EditProfileDrawer({
  open,
  profile,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: CandidateProfile;
  onClose: () => void;
  onSave: (updated: CandidateProfile) => void;
}) {
  const [title, setTitle] = useState(profile.title ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedin_url ?? "");
  const [summary, setSummary] = useState(profile.summary ?? "");
  const [yearsOfExperience, setYearsOfExperience] = useState(
    profile.years_of_experience?.toString() ?? "",
  );
  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus>(profile.availability_status);
  const [availabilityDate, setAvailabilityDate] = useState(
    profile.availability_date ?? "",
  );
  const [contractType, setContractType] = useState<ContractType>(
    profile.contract_type,
  );
  const [dailyRate, setDailyRate] = useState(
    profile.daily_rate?.toString() ?? "",
  );
  const [annualSalary, setAnnualSalary] = useState(
    profile.annual_salary?.toString() ?? "",
  );
  const [workMode, setWorkMode] = useState<WorkMode | "">(
    profile.work_mode ?? "",
  );
  const [locationPreference, setLocationPreference] = useState(
    profile.location_preference ?? "",
  );
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [emailContact, setEmailContact] = useState(profile.email_contact ?? "");
  const [suggestedYears, setSuggestedYears] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(profile.title ?? "");
      setLocation(profile.location ?? "");
      setLinkedinUrl(profile.linkedin_url ?? "");
      setSummary(profile.summary ?? "");
      setYearsOfExperience(profile.years_of_experience?.toString() ?? "");
      setAvailabilityStatus(profile.availability_status);
      setAvailabilityDate(profile.availability_date ?? "");
      setContractType(profile.contract_type);
      setDailyRate(profile.daily_rate?.toString() ?? "");
      setAnnualSalary(profile.annual_salary?.toString() ?? "");
      setWorkMode(profile.work_mode ?? "");
      setLocationPreference(profile.location_preference ?? "");
      setPhone(profile.phone ?? "");
      setEmailContact(profile.email_contact ?? "");
      setError(null);
      api
        .get<Experience[]>("/candidates/me/experiences")
        .then((experiences) =>
          setSuggestedYears(deriveYearsOfExperience(experiences)),
        )
        .catch(() => setSuggestedYears(null));
    }
  }, [
    open,
    profile.title,
    profile.location,
    profile.linkedin_url,
    profile.summary,
    profile.years_of_experience,
    profile.availability_status,
    profile.availability_date,
    profile.contract_type,
    profile.daily_rate,
    profile.annual_salary,
    profile.work_mode,
    profile.location_preference,
    profile.phone,
    profile.email_contact,
  ]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const parsedYears = parseInt(yearsOfExperience, 10);
      const parsedRate = parseInt(dailyRate, 10);
      const parsedSalary = parseInt(annualSalary, 10);
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        {
          title: title || null,
          location: location || null,
          linkedin_url: linkedinUrl || null,
          summary: summary || null,
          years_of_experience: Number.isNaN(parsedYears) ? null : parsedYears,
          availability_status: availabilityStatus,
          availability_date:
            availabilityStatus === "available_from" && availabilityDate
              ? availabilityDate
              : null,
          contract_type: contractType,
          daily_rate: Number.isNaN(parsedRate) ? null : parsedRate,
          annual_salary: Number.isNaN(parsedSalary) ? null : parsedSalary,
          work_mode: workMode || null,
          location_preference: locationPreference || null,
          phone: phone || null,
          email_contact: emailContact || null,
        },
      );
      onSave(updated);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le profil</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ErrorAlert error={error} />
          <div className="space-y-1">
            <Label htmlFor="edit-title">Titre / poste actuel</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-location">Localisation</Label>
            <Input
              id="edit-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-years">Années d&apos;expérience</Label>
            <Input
              id="edit-years"
              type="number"
              min={0}
              value={yearsOfExperience}
              placeholder={suggestedYears?.toString() ?? ""}
              onChange={(e) => setYearsOfExperience(e.target.value)}
            />
            {suggestedYears !== null &&
              yearsOfExperience !== suggestedYears.toString() && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() =>
                    setYearsOfExperience(suggestedYears.toString())
                  }
                >
                  Suggestion : {suggestedYears} ans (calculé depuis vos
                  expériences)
                </button>
              )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-availability">Disponibilité</Label>
            <Select
              value={availabilityStatus}
              items={AVAILABILITY_LABELS}
              onValueChange={(v) =>
                setAvailabilityStatus(v as AvailabilityStatus)
              }
            >
              <SelectTrigger id="edit-availability">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available_now">
                  {AVAILABILITY_LABELS.available_now}
                </SelectItem>
                <SelectItem value="available_from">
                  {AVAILABILITY_LABELS.available_from}
                </SelectItem>
                <SelectItem value="not_available">
                  {AVAILABILITY_LABELS.not_available}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {availabilityStatus === "available_from" && (
            <div className="space-y-1">
              <Label htmlFor="edit-availability-date">
                Disponible à partir du
              </Label>
              <Input
                id="edit-availability-date"
                type="date"
                value={availabilityDate}
                onChange={(e) => setAvailabilityDate(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="edit-contract">Type de contrat recherché</Label>
            <Select
              value={contractType}
              items={CONTRACT_TYPE_LABELS}
              onValueChange={(v) => setContractType(v as ContractType)}
            >
              <SelectTrigger id="edit-contract">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="freelance">Freelance (TJM)</SelectItem>
                <SelectItem value="cdi">CDI (salaire annuel)</SelectItem>
                <SelectItem value="both">Les deux</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {contractType !== "cdi" && (
            <div className="space-y-1">
              <Label htmlFor="edit-daily-rate">TJM souhaité (€/jour)</Label>
              <Input
                id="edit-daily-rate"
                type="number"
                min={0}
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
              />
            </div>
          )}
          {contractType !== "freelance" && (
            <div className="space-y-1">
              <Label htmlFor="edit-annual-salary">
                Salaire annuel souhaité (€)
              </Label>
              <Input
                id="edit-annual-salary"
                type="number"
                min={0}
                value={annualSalary}
                onChange={(e) => setAnnualSalary(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="edit-work-mode">Mode de travail</Label>
            <Select
              value={workMode}
              items={WORK_MODE_ITEMS}
              onValueChange={(v) => setWorkMode(v as WorkMode | "")}
            >
              <SelectTrigger id="edit-work-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(WORK_MODE_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-location-preference">
              Mobilité / zone géographique
            </Label>
            <Input
              id="edit-location-preference"
              value={locationPreference}
              placeholder="ex: Île-de-France, full remote"
              onChange={(e) => setLocationPreference(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-phone">Téléphone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-email-contact">Email de contact</Label>
            <Input
              id="edit-email-contact"
              type="email"
              value={emailContact}
              onChange={(e) => setEmailContact(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-linkedin">LinkedIn</Label>
            <Input
              id="edit-linkedin"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-summary">Résumé</Label>
            <textarea
              id="edit-summary"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TABS = [
  { key: "experiences", label: "Expériences" },
  { key: "competences", label: "Compétences" },
  { key: "formation", label: "Formation" },
  { key: "langues", label: "Langues" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const VALID_TABS = new Set<TabKey>(TABS.map((t) => t.key));

function ProfileTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab") as TabKey | null;
  const initialTab: TabKey =
    rawTab && VALID_TABS.has(rawTab) ? rawTab : "experiences";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  function setTab(key: TabKey) {
    setActiveTab(key);
    router.replace(`?tab=${key}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      {/* Sticky tab bar (offset = hauteur de l'app bar) */}
      <div className="sticky top-[var(--app-bar-h)] z-10 -mx-7 bg-background px-7 py-1.5">
        <TabBar tabs={[...TABS]} activeTab={activeTab} onChange={setTab} />
      </div>

      {/* Tab content - only mounts active section */}
      {activeTab === "experiences" && <ExperienceSection />}
      {activeTab === "competences" && <SkillSection />}
      {activeTab === "formation" && (
        <>
          <EducationSection />
          <CertificationSection />
        </>
      )}
      {activeTab === "langues" && <LanguageSection />}
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [hasExperience, setHasExperience] = useState(false);
  const [hasSkill, setHasSkill] = useState(false);

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then(setProfile)
      .catch(console.error);
    api
      .get<Experience[]>("/candidates/me/experiences")
      .then((experiences) => setHasExperience(experiences.length > 0))
      .catch(() => {});
    api
      .get<Skill[]>("/candidates/me/skills")
      .then((skills) => setHasSkill(skills.length > 0))
      .catch(() => {});
  }, []);

  async function handleContactDetected(contact: {
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
  }) {
    const payload: Record<string, string> = {};
    if (contact.phone) payload.phone = contact.phone;
    if (contact.linkedin_url) payload.linkedin_url = contact.linkedin_url;
    if (contact.email) payload.email_contact = contact.email;
    if (Object.keys(payload).length === 0) return;
    try {
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        payload,
      );
      setProfile(updated);
    } catch (err) {
      console.warn("Failed to save detected contact info:", err);
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-[920px] space-y-[18px]">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-[18px]">
      <ProfileHero
        profile={profile}
        hasExperience={hasExperience}
        hasSkill={hasSkill}
        onEdit={() => setEditOpen(true)}
      />
      <CvImport onContactDetected={handleContactDetected} />
      <Suspense
        fallback={<div className="h-10 animate-pulse rounded-lg bg-muted" />}
      >
        <ProfileTabs />
      </Suspense>
      <p className="j-meta flex items-center gap-2">
        <ShieldCheck className="size-3.5" strokeWidth={1.6} />
        Chaque modification est historisée dans votre journal d&apos;activité.
      </p>
      <EditProfileDrawer
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSave={(updated) => setProfile(updated)}
      />
    </div>
  );
}
