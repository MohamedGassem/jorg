"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

export default function RecruiterOnboardingOrgPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ organization_id: string | null }>("/recruiters/me/profile")
      .then((profile) => {
        if (cancelled) return;
        if (profile.organization_id) {
          // Already attached to an org (e.g. a demo invite code) — skip this step.
          router.replace("/onboarding/recruiter/template");
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (checking) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/organizations", { name: orgName });
      router.push("/onboarding/recruiter/template");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Erreur lors de la création",
      );
      setSaving(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode) return;
    setSaving(true);
    setError(null);
    try {
      await api.post("/organizations/join", { code: joinCode });
      router.push("/onboarding/recruiter/template");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Code invalide ou déjà utilisé",
      );
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            Étape 2 / 3
          </p>
          <CardTitle>Votre organisation</CardTitle>
          <CardDescription>
            Créez votre cabinet ou rejoignez-en un existant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "create" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("create")}
            >
              Créer
            </Button>
            <Button
              type="button"
              variant={mode === "join" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("join")}
            >
              Rejoindre
            </Button>
          </div>
          {mode === "create" ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="org-name">Nom de l&apos;organisation</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="ex: Acme Consulting"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Création…" : "Créer et continuer →"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="join-code">Code d&apos;invitation</Label>
                <Input
                  id="join-code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="JORG-XXXX-YYYY"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Connexion…" : "Rejoindre et continuer →"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
