// Mode lecture pleine page (plan refonte-ui-mon-dossier.md, tranche 5).
// Remplace la modale "Aperçu recruteur" de la couverture. Charge le dossier
// accessible (données déjà exposées) et le rend en lecture seule.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { ProfileReadView } from "@/components/candidate/profile-read-view";
import type {
  CandidateProfile,
  CandidateSkillProjection,
  Certification,
  Education,
  Experience,
  Language,
  Skill,
} from "@/types/api";

type ReadData = {
  profile: CandidateProfile;
  experiences: Experience[];
  skills: Skill[];
  projection: CandidateSkillProjection[];
  education: Education[];
  certifications: Certification[];
  languages: Language[];
};

export default function ProfileReadPage() {
  const [data, setData] = useState<ReadData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<CandidateProfile>("/candidates/me/profile"),
      api.get<Experience[]>("/candidates/me/experiences"),
      api.get<Skill[]>("/candidates/me/skills"),
      api.get<CandidateSkillProjection[]>("/candidates/me/skill-projection"),
      api.get<Education[]>("/candidates/me/education"),
      api.get<Certification[]>("/candidates/me/certifications"),
      api.get<Language[]>("/candidates/me/languages"),
    ])
      .then(
        ([
          profile,
          experiences,
          skills,
          projection,
          education,
          certifications,
          languages,
        ]) =>
          setData({
            profile,
            experiences,
            skills,
            projection,
            education,
            certifications,
            languages,
          }),
      )
      .catch((err) =>
        setError(extractErrorMessage(err, "Impossible de charger le profil")),
      );
  }, []);

  return (
    <div className="w-full">
      <div className="mx-auto mb-6 w-full max-w-[720px]">
        <Link
          href="/candidate/profile"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          <ArrowLeft className="size-3.5" strokeWidth={1.6} />
          Revenir à l&apos;édition
        </Link>
      </div>

      {error ? (
        <div className="mx-auto w-full max-w-[720px]">
          <ErrorAlert error={error} />
        </div>
      ) : data ? (
        <ProfileReadView {...data} />
      ) : (
        <div className="mx-auto w-full max-w-[720px] space-y-4">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      )}
    </div>
  );
}
