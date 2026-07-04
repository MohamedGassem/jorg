// frontend/app/(candidate)/profile/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { CvImport } from "@/components/cv-import";
import { api } from "@/lib/api";
import { ExperienceSection } from "@/components/candidate/experience-section";
import { SkillSection } from "@/components/candidate/skill-section";
import { EducationSection } from "@/components/candidate/education-section";
import { CertificationSection } from "@/components/candidate/certification-section";
import { LanguageSection } from "@/components/candidate/language-section";
import { ProfileCover } from "@/components/candidate/profile-cover";
import { ProfileRail } from "@/components/candidate/profile-rail";
import { WelcomeBanner } from "@/components/candidate/welcome-banner";
import {
  type CandidateProfile,
  type CandidateSkillProjection,
  type Certification,
  type Education,
  type Experience,
  type Language,
  type Skill,
} from "@/types/api";

const SCROLL_MARGIN = "scroll-mt-[calc(var(--app-bar-h)+1.5rem)]";

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
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projection, setProjection] = useState<CandidateSkillProjection[]>([]);
  const [formationCount, setFormationCount] = useState(0);
  const [languesCount, setLanguesCount] = useState(0);
  const [showImport, setShowImport] = useState(false);

  // Chaque source du rail est chargée indépendamment : l'échec d'un endpoint
  // (ex. skill-projection) ne doit pas vider les compteurs ni la lisibilité.
  // Le parcours et les compétences sont ensuite tenus à jour en direct par les
  // sections éditables via onExperiencesChange / onSkillsChange.
  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then(setProfile)
      .catch(console.error);
    api
      .get<Experience[]>("/candidates/me/experiences")
      .then(setExperiences)
      .catch(() => {});
    api
      .get<Skill[]>("/candidates/me/skills")
      .then(setSkills)
      .catch(() => {});
    api
      .get<CandidateSkillProjection[]>("/candidates/me/skill-projection")
      .then(setProjection)
      .catch(() => {});
    Promise.all([
      api.get<Education[]>("/candidates/me/education"),
      api.get<Certification[]>("/candidates/me/certifications"),
    ])
      .then(([education, certifications]) =>
        setFormationCount(education.length + certifications.length),
      )
      .catch(() => {});
    api
      .get<Language[]>("/candidates/me/languages")
      .then((languages) => setLanguesCount(languages.length))
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
  const counts: SommaireCounts = {
    parcours: experiences.length,
    competences: skills.length,
    formation: formationCount,
    langues: languesCount,
  };

  return (
    <div className="mx-auto w-full max-w-[1000px]">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-10 lg:max-w-[680px]">
          <Suspense fallback={null}>
            <WelcomeBanner />
          </Suspense>
          <ProfileCover profile={profile} onProfileUpdate={setProfile} />

          {(isEmpty || showImport) && (
            <CvImport onContactDetected={handleContactDetected} />
          )}

          <section id="parcours" className={SCROLL_MARGIN}>
            <SectionHeader label="Parcours" count={counts.parcours} />
            <ExperienceSection onExperiencesChange={setExperiences} />
          </section>

          <section id="competences" className={SCROLL_MARGIN}>
            <SectionHeader label="Compétences" count={counts.competences} />
            <SkillSection onSkillsChange={setSkills} />
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
    </div>
  );
}
