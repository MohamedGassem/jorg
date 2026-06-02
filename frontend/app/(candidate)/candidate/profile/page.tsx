// frontend/app/(candidate)/profile/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { NotificationBell } from "@/components/notification-bell";
import {
  ExperienceSection,
  SkillSection,
  EducationSection,
  CertificationSection,
  LanguageSection,
} from "@/app/(candidate)/candidate/skills/page";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  VALID_DOMAINS,
  type AvailabilityStatus,
  type CandidateProfile,
  type ContractType,
  type Experience,
  type MissionDuration,
  type Skill,
  type WorkMode,
} from "@/types/api";

type FormFields = {
  first_name: string;
  last_name: string;
  title: string;
  summary: string;
  phone: string;
  email_contact: string;
  linkedin_url: string;
  location: string;
  contract_type: ContractType;
  daily_rate: string;
  annual_salary: string;
};

const CONTRACT_OPTIONS: { value: ContractType; label: string }[] = [
  { value: "freelance", label: "Freelance (TJM)" },
  { value: "cdi", label: "CDI (salaire annuel)" },
  { value: "both", label: "Les deux" },
];

function profileToForm(p: CandidateProfile): FormFields {
  return {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    title: p.title ?? "",
    summary: p.summary ?? "",
    phone: p.phone ?? "",
    email_contact: p.email_contact ?? "",
    linkedin_url: p.linkedin_url ?? "",
    location: p.location ?? "",
    contract_type: p.contract_type,
    daily_rate: p.daily_rate !== null ? String(p.daily_rate) : "",
    annual_salary: p.annual_salary !== null ? String(p.annual_salary) : "",
  };
}

function formToPayload(f: FormFields): Record<string, unknown> {
  const showDaily =
    f.contract_type === "freelance" || f.contract_type === "both";
  const showSalary = f.contract_type === "cdi" || f.contract_type === "both";
  return {
    first_name: f.first_name || null,
    last_name: f.last_name || null,
    title: f.title || null,
    summary: f.summary || null,
    phone: f.phone || null,
    email_contact: f.email_contact || null,
    linkedin_url: f.linkedin_url || null,
    location: f.location || null,
    contract_type: f.contract_type,
    daily_rate: showDaily && f.daily_rate ? Number(f.daily_rate) : null,
    annual_salary:
      showSalary && f.annual_salary ? Number(f.annual_salary) : null,
  };
}

function InformationsSection() {
  const [form, setForm] = useState<FormFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus>("not_available");
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode | "">("");
  const [locationPreference, setLocationPreference] = useState("");
  const [preferredDomains, setPreferredDomains] = useState<string[]>([]);
  const [missionDuration, setMissionDuration] = useState<MissionDuration | "">(
    "",
  );

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((p) => {
        setForm(profileToForm(p));
        setAvailabilityStatus(p.availability_status ?? "not_available");
        setAvailabilityDate(p.availability_date ?? "");
        setWorkMode(p.work_mode ?? "");
        setLocationPreference(p.location_preference ?? "");
        setPreferredDomains(p.preferred_domains ?? []);
        setMissionDuration(p.mission_duration ?? "");
      })
      .catch(console.error);
  }, []);

  function setField<K extends keyof FormFields>(k: K, v: FormFields[K]) {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    setSaved(false);
    setIsError(false);
    try {
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        {
          ...formToPayload(form),
          availability_status: availabilityStatus,
          availability_date:
            availabilityStatus === "available_from"
              ? availabilityDate || null
              : null,
          work_mode: workMode || null,
          location_preference: locationPreference || null,
          preferred_domains:
            preferredDomains.length > 0 ? preferredDomains : null,
          mission_duration: missionDuration || null,
        },
      );
      setForm(profileToForm(updated));
      setAvailabilityStatus(updated.availability_status ?? "not_available");
      setAvailabilityDate(updated.availability_date ?? "");
      setWorkMode(updated.work_mode ?? "");
      setLocationPreference(updated.location_preference ?? "");
      setPreferredDomains(updated.preferred_domains ?? []);
      setMissionDuration(updated.mission_duration ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setIsError(true);
      setMessage(
        err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  const showDaily =
    form.contract_type === "freelance" || form.contract_type === "both";
  const showSalary =
    form.contract_type === "cdi" || form.contract_type === "both";

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
          <CardDescription>
            Vos coordonnées et présentation professionnelle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setField("first_name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setField("last_name", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Titre professionnel</Label>
              <Input
                id="title"
                placeholder="ex: Développeur Full-Stack Senior"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="summary">Résumé</Label>
              <textarea
                id="summary"
                rows={4}
                value={form.summary}
                onChange={(e) => setField("summary", e.target.value)}
                placeholder="Décrivez votre profil en quelques phrases…"
                className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email_contact">Email de contact</Label>
                <Input
                  id="email_contact"
                  type="email"
                  value={form.email_contact}
                  onChange={(e) => setField("email_contact", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedin_url">LinkedIn URL</Label>
              <Input
                id="linkedin_url"
                type="url"
                placeholder="https://linkedin.com/in/…"
                value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Localisation</Label>
              <Input
                id="location"
                placeholder="ex: Paris, France"
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contrat &amp; rémunération</CardTitle>
          <CardDescription>
            Indiquez vos préférences contractuelles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="contract_type">Type de contrat recherché</Label>
            <Select
              value={form.contract_type}
              onValueChange={(v) =>
                v && setField("contract_type", v as ContractType)
              }
            >
              <SelectTrigger id="contract_type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTRACT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(showDaily || showSalary) && (
            <div className="grid grid-cols-2 gap-4">
              {showDaily && (
                <div className="space-y-1.5">
                  <Label htmlFor="daily_rate">TJM (€/jour)</Label>
                  <Input
                    id="daily_rate"
                    type="number"
                    min={0}
                    placeholder="700"
                    value={form.daily_rate}
                    onChange={(e) => setField("daily_rate", e.target.value)}
                  />
                </div>
              )}
              {showSalary && (
                <div className="space-y-1.5">
                  <Label htmlFor="annual_salary">Salaire annuel brut (€)</Label>
                  <Input
                    id="annual_salary"
                    type="number"
                    min={0}
                    placeholder="55000"
                    value={form.annual_salary}
                    onChange={(e) => setField("annual_salary", e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disponibilité &amp; préférences mission</CardTitle>
          <CardDescription>
            Ces informations aident les recruteurs à filtrer les profils.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Disponibilité</Label>
            <RadioGroup
              value={availabilityStatus}
              onValueChange={(v) =>
                setAvailabilityStatus(v as AvailabilityStatus)
              }
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2.5">
                <RadioGroupItem value="available_now" id="av-now" />
                <Label htmlFor="av-now" className="cursor-pointer font-normal">
                  Disponible maintenant
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <RadioGroupItem value="available_from" id="av-from" />
                <Label htmlFor="av-from" className="cursor-pointer font-normal">
                  Disponible à partir du
                </Label>
              </div>
              <div className="flex items-center gap-2.5">
                <RadioGroupItem value="not_available" id="av-no" />
                <Label htmlFor="av-no" className="cursor-pointer font-normal">
                  Non disponible
                </Label>
              </div>
            </RadioGroup>
            {availabilityStatus === "available_from" && (
              <Input
                type="date"
                value={availabilityDate}
                onChange={(e) => setAvailabilityDate(e.target.value)}
                className="mt-2 w-48"
                required
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="work-mode">Mode de travail</Label>
            <Select
              value={workMode}
              onValueChange={(v) => setWorkMode(v as WorkMode)}
            >
              <SelectTrigger id="work-mode">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Télétravail</SelectItem>
                <SelectItem value="onsite">Présentiel</SelectItem>
                <SelectItem value="hybrid">Hybride</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location-pref">Localisation préférée</Label>
            <Input
              id="location-pref"
              value={locationPreference}
              onChange={(e) => setLocationPreference(e.target.value)}
              placeholder="ex: Paris, Lyon"
            />
          </div>

          <div className="space-y-2">
            <Label>Domaines métier</Label>
            <div className="grid grid-cols-3 gap-2">
              {VALID_DOMAINS.map((domain) => (
                <div key={domain} className="flex items-center gap-2">
                  <Checkbox
                    id={`domain-${domain}`}
                    checked={preferredDomains.includes(domain)}
                    onCheckedChange={(checked) => {
                      setPreferredDomains((prev) =>
                        checked
                          ? [...prev, domain]
                          : prev.filter((d) => d !== domain),
                      );
                    }}
                  />
                  <Label
                    htmlFor={`domain-${domain}`}
                    className="cursor-pointer font-normal capitalize"
                  >
                    {domain}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mission-dur">Durée de mission souhaitée</Label>
            <Select
              value={missionDuration}
              onValueChange={(v) => setMissionDuration(v as MissionDuration)}
            >
              <SelectTrigger id="mission-dur">
                <SelectValue placeholder="Choisir…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Court terme (&lt; 3 mois)</SelectItem>
                <SelectItem value="medium">Moyen terme (3–6 mois)</SelectItem>
                <SelectItem value="long">Long terme (6 mois+)</SelectItem>
                <SelectItem value="permanent">CDI / Permanent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Footer actions */}
      <div className="flex items-center gap-4 pb-8">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Sauvegarde…" : "Sauvegarder le profil"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-500">
            <CheckCircle2 className="size-4" />
            Profil mis à jour
          </span>
        )}
        {isError && message && (
          <span role="alert" className="text-sm text-destructive">
            {message}
          </span>
        )}
      </div>
    </form>
  );
}

type ProfileTab =
  | "informations"
  | "experiences"
  | "competences"
  | "formation"
  | "langues";

const TABS: { key: ProfileTab; label: string }[] = [
  { key: "informations", label: "Informations" },
  { key: "experiences", label: "Expériences" },
  { key: "competences", label: "Compétences" },
  { key: "formation", label: "Formation" },
  { key: "langues", label: "Langues" },
];

const VALID_TABS = new Set(TABS.map((t) => t.key));

function ProfileTabs() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") as ProfileTab | null;
  const activeTab: ProfileTab =
    rawTab && VALID_TABS.has(rawTab) ? rawTab : "informations";

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <a
            key={tab.key}
            href={`?tab=${tab.key}`}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Tab content — only mounts active section */}
      {activeTab === "informations" && <InformationsSection />}
      {activeTab === "experiences" && <ExperienceSection />}
      {activeTab === "competences" && <SkillSection />}
      {activeTab === "formation" && <EducationSection />}
      {activeTab === "langues" && <LanguageSection />}
    </div>
  );
}

export default function ProfilePage() {
  const [previewOpen, setPreviewOpen] = useState(false);
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
      const [profile, experiences, skills] = await Promise.all([
        api.get<CandidateProfile>("/candidates/me/profile"),
        api.get<Experience[]>("/candidates/me/experiences"),
        api.get<Skill[]>("/candidates/me/skills"),
      ]);
      setPreviewData({ profile, experiences, skills });
    } catch {
      // show partial data on error
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Mon profil
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informations personnelles et profil de compétences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadPreview}>
            Aperçu recruteur
          </Button>
          <NotificationBell portal="candidate" />
        </div>
      </div>
      {/* Suspense required for useSearchParams in Next.js App Router */}
      <Suspense
        fallback={<div className="h-10 animate-pulse rounded-lg bg-muted" />}
      >
        <ProfileTabs />
      </Suspense>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aperçu recruteur</DialogTitle>
          </DialogHeader>
          {previewLoading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : previewData ? (
            <div className="space-y-4 text-sm">
              {previewData.profile && (
                <div>
                  <p className="font-semibold text-base">
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
                  <p className="font-medium mb-1">Compétences clés</p>
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
                  <p className="font-medium mb-2">Expériences</p>
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
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
