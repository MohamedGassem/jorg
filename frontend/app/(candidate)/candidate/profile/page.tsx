// frontend/app/(candidate)/profile/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { TabBar } from "@/components/ui/TabBar";
import {
  ExperienceSection,
  SkillSection,
  EducationSection,
  CertificationSection,
  LanguageSection,
} from "@/components/candidate/profile-sections";
import { CandidateGenerateDossierDialog } from "@/components/candidate-generate-dossier-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type CandidateProfile,
  type Experience,
  type Skill,
} from "@/types/api";

function calcCompletion(p: CandidateProfile): number {
  const checks = [
    Boolean(p.avatar_url),
    Boolean(p.title),
    Boolean(p.summary),
    Boolean(p.location),
    Boolean(p.linkedin_url),
    p.availability_status !== "not_available",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function ProfileHero({
  profile,
  onEdit,
}: {
  profile: CandidateProfile;
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

  const completion = calcCompletion(profile);
  const fullName =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border bg-muted">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt={fullName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted-foreground">
                {(profile.first_name?.[0] ?? "?").toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className="font-heading text-2xl font-semibold">{fullName}</h1>
            {profile.title && (
              <p className="text-sm text-muted-foreground">{profile.title}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${completion}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {completion}% complété
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGenerateOpen(true)}
          >
            Générer un dossier
          </Button>
          <Button variant="outline" size="sm" onClick={loadPreview}>
            Aperçu recruteur
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            ✏ Modifier
          </Button>
        </div>
      </div>

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
      <CandidateGenerateDossierDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
      />
    </div>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(profile.title ?? "");
      setLocation(profile.location ?? "");
      setLinkedinUrl(profile.linkedin_url ?? "");
      setSummary(profile.summary ?? "");
      setError(null);
    }
  }, [
    open,
    profile.title,
    profile.location,
    profile.linkedin_url,
    profile.summary,
  ]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        {
          title: title || null,
          location: location || null,
          linkedin_url: linkedinUrl || null,
          summary: summary || null,
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
      <DialogContent className="sm:max-w-md">
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
      {/* Sticky tab bar */}
      <div className="sticky top-0 z-10 -mx-8 bg-background px-8">
        <TabBar tabs={[...TABS]} activeTab={activeTab} onChange={setTab} />
      </div>

      {/* Tab content — only mounts active section */}
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

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then(setProfile)
      .catch(console.error);
  }, []);

  if (!profile) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
        <div className="h-10 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <ProfileHero profile={profile} onEdit={() => setEditOpen(true)} />
      <Suspense
        fallback={<div className="h-10 animate-pulse rounded-lg bg-muted" />}
      >
        <ProfileTabs />
      </Suspense>
      <EditProfileDrawer
        open={editOpen}
        profile={profile}
        onClose={() => setEditOpen(false)}
        onSave={(updated) => setProfile(updated)}
      />
    </div>
  );
}
