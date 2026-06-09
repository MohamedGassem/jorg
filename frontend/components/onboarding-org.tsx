"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { Organization, RecruiterProfile } from "@/types/api";

type Mode = "create" | "join";

interface Props {
  /** Called after successful create or join with the new organization_id. */
  onSuccess: (orgId: string) => void;
}

export function OnboardingOrg({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // create_organization now links the recruiter atomically - no second PUT needed
      const org = await api.post<Organization>("/organizations", {
        name: name.trim(),
      });
      onSuccess(org.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Erreur lors de la création",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const profile = await api.post<RecruiterProfile>("/organizations/join", {
        code: code.trim(),
      });
      onSuccess(profile.organization_id!);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Code invalide ou organisation introuvable",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Configurer votre organisation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2">
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-lg border p-3 text-left text-sm font-medium transition-all ${
                mode === m
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80"
              }`}
            >
              {m === "create"
                ? "Créer une organisation"
                : "Rejoindre une organisation"}
            </button>
          ))}
        </div>

        {mode === "create" ? (
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Nom de l&apos;organisation</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Acme Consulting"
                required
              />
            </div>
            <ErrorAlert error={error} />
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Création…" : "Créer et continuer"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="join-code">Code d&apos;invitation</Label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ex: Xk3mP9qR"
                required
              />
              <p className="text-xs text-muted-foreground">
                Demandez ce code à un membre de votre organisation.
              </p>
            </div>
            <ErrorAlert error={error} />
            <Button type="submit" disabled={saving || !code.trim()}>
              {saving ? "Vérification…" : "Rejoindre"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
