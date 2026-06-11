"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api";

async function markOnboardingComplete(): Promise<boolean> {
  try {
    await api.put("/recruiters/me/profile", { onboarding_completed: true });
    return true;
  } catch (err) {
    console.warn("Failed to mark onboarding complete:", err);
    try {
      await api.put("/recruiters/me/profile", { onboarding_completed: true });
      return true;
    } catch {
      return false;
    }
  }
}

export default function RecruiterOnboardingTemplatePage() {
  const router = useRouter();

  async function handleSkip() {
    const ok = await markOnboardingComplete();
    if (!ok) {
      console.error(
        "Onboarding flag not persisted; user may see onboarding again on next login",
      );
    }
    router.push("/recruiter/dashboard");
  }

  async function handleGoToTemplates() {
    const ok = await markOnboardingComplete();
    if (!ok) {
      console.error(
        "Onboarding flag not persisted; user may see onboarding again on next login",
      );
    }
    router.push("/recruiter/documents");
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <Card>
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            Etape 3 / 3
          </p>
          <CardTitle>Vos modèles de dossier</CardTitle>
          <CardDescription>
            Retrouvez les modèles Jorg depuis la page Dossiers & modèles. Vous
            pouvez le faire maintenant ou plus tard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Les modèles de dossier permettent de générer des documents candidats
            adaptes a vos clients. Rendez-vous dans{" "}
            <strong>Dossiers & modèles</strong> pour consulter les modèles Jorg.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={handleGoToTemplates}>Voir les modèles</Button>
            <Button variant="ghost" onClick={handleSkip}>
              Passer cette etape
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
