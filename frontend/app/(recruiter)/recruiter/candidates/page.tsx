// frontend/app/(recruiter)/candidates/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { AccessibleCandidate, RecruiterProfile } from "@/types/api";

function displayName(c: AccessibleCandidate): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || c.email;
}

export default function CandidatesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AccessibleCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await api.get<RecruiterProfile>("/recruiters/me/profile");
        if (cancelled) return;
        setOrgId(profile.organization_id);
        if (!profile.organization_id) return;
        const list = await api.get<AccessibleCandidate[]>(
          `/organizations/${profile.organization_id}/candidates`
        );
        if (!cancelled) setCandidates(list);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof ApiError ? err.detail : "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez votre compte à une organisation.
      </p>
    );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Candidats avec accès</h1>
      <p className="text-muted-foreground">
        Pour générer un dossier, rendez-vous sur la page{" "}
        <Link href="/recruiter/generate" className="underline">
          Générer
        </Link>
        .
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle>{candidates.length} candidat(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {candidates.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              Aucun candidat n&apos;a encore accepté votre invitation.
            </p>
          )}
          {candidates.map((c) => (
            <div
              key={c.user_id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div className="space-y-0.5">
                <p className="font-medium">{displayName(c)}</p>
                <p className="text-xs text-muted-foreground">{c.email}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
