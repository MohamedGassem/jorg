// frontend/app/(recruiter)/candidates/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { RecruiterProfile } from "@/types/api";

export default function CandidatesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<RecruiterProfile>("/recruiters/me/profile")
      .then((p) => setOrgId(p.organization_id))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId) return <p className="text-muted-foreground">Associez votre compte à une organisation.</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Candidats avec accès</h1>
      <p className="text-muted-foreground">
        Pour générer un dossier, rendez-vous sur la page{" "}
        <Link href="/recruiter/generate" className="underline">Générer</Link>.
      </p>
    </div>
  );
}
