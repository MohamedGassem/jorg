"use client";

import { useState } from "react";
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

async function markOnboardingComplete() {
  await api
    .put("/candidates/me/profile", { onboarding_completed: true })
    .catch((err) => {
      console.warn("Failed to mark onboarding complete:", err);
    });
}

export default function CandidateOnboardingSkillsPage() {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [role, setRole] = useState("");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName || !role || !startDate) {
      setError("Tous les champs sont requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post("/candidates/me/experiences", {
        client_name: clientName,
        role,
        start_date: startDate,
        is_current: true,
      });
      await markOnboardingComplete();
      router.push("/candidate/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.detail
          : "Erreur lors de l'enregistrement",
      );
      setSaving(false);
    }
  }

  async function handleSkip() {
    await markOnboardingComplete();
    router.push("/candidate/dashboard");
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground">Étape 3 / 3</p>
        <CardTitle>Votre première expérience</CardTitle>
        <CardDescription>
          Ajoutez votre expérience la plus récente pour enrichir votre dossier.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleFinish} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="space-y-1">
            <Label htmlFor="client">Nom du client / entreprise</Label>
            <Input
              id="client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exp-role">Votre rôle</Label>
            <Input
              id="exp-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="start">Date de début</Label>
            <Input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Terminer"}
            </Button>
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Passer cette étape →
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
