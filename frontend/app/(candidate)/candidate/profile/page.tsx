// frontend/app/(candidate)/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CvImport } from "@/components/cv-import";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import {
  AVAILABILITY_LABELS,
  CONTRACT_TYPE_LABELS,
  WORK_MODE_LABELS,
} from "@/lib/labels";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ExperienceSection } from "@/components/candidate/experience-section";
import { SkillSection } from "@/components/candidate/skill-section";
import { EducationSection } from "@/components/candidate/education-section";
import { CertificationSection } from "@/components/candidate/certification-section";
import { LanguageSection } from "@/components/candidate/language-section";
import { ProfileCover } from "@/components/candidate/profile-cover";
import { ProfileRail } from "@/components/candidate/profile-rail";
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
  type CandidateSkillProjection,
  type Certification,
  type ContractType,
  type Education,
  type Experience,
  type Language,
  type Skill,
  type WorkMode,
} from "@/types/api";

const WORK_MODE_ITEMS: Record<string, string> = {
  "": "Non précisé",
  ...WORK_MODE_LABELS,
};

const SCROLL_MARGIN = "scroll-mt-[calc(var(--app-bar-h)+1.5rem)]";

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

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
      <h2 className="font-heading text-[19px] font-semibold leading-tight">
        {label}
      </h2>
      {count !== undefined && <span className="j-meta">{count}</span>}
    </div>
  );
}

interface SommaireCounts {
  parcours: number;
  competences: number;
  formation: number;
  langues: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projection, setProjection] = useState<CandidateSkillProjection[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [counts, setCounts] = useState<SommaireCounts>({
    parcours: 0,
    competences: 0,
    formation: 0,
    langues: 0,
  });

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then(setProfile)
      .catch(console.error);
    Promise.all([
      api.get<Experience[]>("/candidates/me/experiences"),
      api.get<Skill[]>("/candidates/me/skills"),
      api.get<CandidateSkillProjection[]>("/candidates/me/skill-projection"),
      api.get<Education[]>("/candidates/me/education"),
      api.get<Certification[]>("/candidates/me/certifications"),
      api.get<Language[]>("/candidates/me/languages"),
    ])
      .then(([exps, sks, proj, education, certifications, languages]) => {
        setExperiences(exps);
        setSkills(sks);
        setProjection(proj);
        setCounts({
          parcours: exps.length,
          competences: sks.length,
          formation: education.length + certifications.length,
          langues: languages.length,
        });
      })
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
      <div className="mx-auto w-full max-w-[1000px] space-y-[18px]">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const isEmpty = experiences.length === 0 && skills.length === 0;

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-10 lg:max-w-[680px]">
          <ProfileCover profile={profile} onEdit={() => setEditOpen(true)} />

          {(isEmpty || showImport) && (
            <CvImport onContactDetected={handleContactDetected} />
          )}

          <section id="parcours" className={SCROLL_MARGIN}>
            <SectionHeader label="Parcours" count={counts.parcours} />
            <ExperienceSection />
          </section>

          <section id="competences" className={SCROLL_MARGIN}>
            <SectionHeader label="Compétences" count={counts.competences} />
            <SkillSection />
          </section>

          <section id="formation" className={SCROLL_MARGIN}>
            <SectionHeader label="Formation" count={counts.formation} />
            <div className="space-y-6">
              <EducationSection />
              <CertificationSection />
            </div>
          </section>

          <section id="langues" className={SCROLL_MARGIN}>
            <SectionHeader label="Langues" count={counts.langues} />
            <LanguageSection />
          </section>

          <p className="j-meta flex items-center gap-2">
            <ShieldCheck className="size-3.5" strokeWidth={1.6} />
            Chaque modification est historisée dans votre journal
            d&apos;activité.
          </p>
        </div>

        <ProfileRail
          profile={profile}
          experiences={experiences}
          skills={skills}
          projection={projection}
          counts={counts}
          isEmpty={isEmpty}
          importVisible={showImport}
          onToggleImport={() => setShowImport((v) => !v)}
        />
      </div>

      <EditProfileDrawer
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSave={(updated) => setProfile(updated)}
      />
    </div>
  );
}
