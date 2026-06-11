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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CvImport } from "@/components/cv-import";
import { api, ApiError } from "@/lib/api";
import type { ContractType } from "@/types/api";

export default function CandidateOnboardingProfilePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState<ContractType>("freelance");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedExperiences, setImportedExperiences] = useState(0);

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put("/candidates/me/profile", {
        title: title || null,
        location: location || null,
        contract_type: contractType,
        ...(importedExperiences > 0 ? { onboarding_completed: true } : {}),
      });
      router.push(
        importedExperiences > 0
          ? "/candidate/profile"
          : "/onboarding/candidate/skills",
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde",
      );
      setSaving(false);
    }
  }

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
      await api.put("/candidates/me/profile", payload);
    } catch (err) {
      console.warn("Failed to save detected contact info:", err);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            Étape 2 / 3
          </p>
          <CardTitle>Parlez-nous de vous</CardTitle>
          <CardDescription>
            Ces informations enrichissent votre dossier candidat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CvImport
            onContactDetected={handleContactDetected}
            onExperiencesAdded={(n) => setImportedExperiences((c) => c + n)}
          />
          <form onSubmit={handleContinue} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="space-y-1">
              <Label htmlFor="title">Titre / poste actuel</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex: Développeur Full-Stack"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="location">Localisation</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ex: Paris, France"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contract">Type de contrat recherché</Label>
              <Select
                value={contractType}
                onValueChange={(v) => setContractType(v as ContractType)}
              >
                <SelectTrigger id="contract">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="freelance">Freelance (TJM)</SelectItem>
                  <SelectItem value="cdi">CDI (salaire annuel)</SelectItem>
                  <SelectItem value="both">Les deux</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving
                ? "Enregistrement…"
                : importedExperiences > 0
                  ? "Valider et voir mon dossier"
                  : "Continuer →"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
