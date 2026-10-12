"use client";

// Single decision screen shown after register: "Comment démarrer ?".
// Three first-class exits, each of which records onboarding completion server
// side before landing the candidate. No step numbering (decided 2026-07-03).

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, PenLine, Clock } from "lucide-react";
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
import { CONTRACT_TYPE_LABELS } from "@/lib/labels";
import { safeInternalPath } from "@/lib/safe-path";
import type { ContractType } from "@/types/api";

type View = "choice" | "manual" | "cv";

async function completeOnboarding() {
  await api.post("/candidates/me/onboarding/complete");
}

export function CandidateOnboardingChoice() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Parcours invitation (C9) : renvoyer le candidat vers son point de départ
  // à la sortie du tunnel, quel que soit le chemin choisi.
  const next = safeInternalPath(searchParams.get("next"));
  const [view, setView] = useState<View>("choice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [contractType, setContractType] = useState<ContractType>("freelance");

  async function handleSkip() {
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding();
      router.push(next ?? "/candidate/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Une erreur est survenue",
      );
      setBusy(false);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put("/candidates/me/profile", {
        title: title || null,
        location: location || null,
        contract_type: contractType,
      });
      await completeOnboarding();
      router.push(next ?? "/candidate/profile?welcome=1");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Une erreur est survenue",
      );
      setBusy(false);
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

  // Applying the import (the single CTA in CvImport) is the CV path's exit:
  // record completion server side and land on the profile with a welcome flag.
  async function handleImportApplied() {
    setBusy(true);
    setError(null);
    try {
      await completeOnboarding();
      router.push(next ?? "/candidate/profile?welcome=1");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Une erreur est survenue",
      );
      setBusy(false);
    }
  }

  if (view === "cv") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">
            Importer mon CV
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vérifiez ce que nous avons détecté. Rien n&apos;est ajouté à votre
            profil sans votre accord.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <CvImport
          collectIdentity
          onContactDetected={handleContactDetected}
          onApplied={handleImportApplied}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView("choice")}
          disabled={busy}
        >
          ← Retour
        </Button>
      </div>
    );
  }

  if (view === "manual") {
    return (
      <div className="mx-auto w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Remplir à la main</CardTitle>
            <CardDescription>
              Ces informations enrichissent votre dossier candidat.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleManualSubmit} className="space-y-4">
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
                <Label htmlFor="contract">Type de contrat recherché</Label>
                <Select
                  value={contractType}
                  items={CONTRACT_TYPE_LABELS}
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
              <div className="space-y-1">
                <Label htmlFor="location">Localisation</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="ex: Paris, France"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? "Enregistrement…" : "Enregistrer et voir mon profil"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setView("choice")}
                  disabled={busy}
                >
                  ← Retour
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Comment démarrer ?</CardTitle>
          <CardDescription>
            Choisissez une façon de commencer. Vous pourrez tout compléter plus
            tard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            variant="outline"
            className="h-auto w-full justify-start gap-3 py-4 text-left"
            onClick={() => setView("cv")}
            disabled={busy}
          >
            <FileText className="size-5 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium">Importer mon CV</span>
              <span className="text-sm text-muted-foreground">
                On pré-remplit votre profil, vous validez.
              </span>
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto w-full justify-start gap-3 py-4 text-left"
            onClick={() => setView("manual")}
            disabled={busy}
          >
            <PenLine className="size-5 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium">Remplir à la main</span>
              <span className="text-sm text-muted-foreground">
                Quelques informations pour démarrer votre dossier.
              </span>
            </span>
          </Button>
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-3 py-4 text-left"
            onClick={handleSkip}
            disabled={busy}
          >
            <Clock className="size-5 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium">Plus tard</span>
              <span className="text-sm text-muted-foreground">
                Accéder directement à mon tableau de bord.
              </span>
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
