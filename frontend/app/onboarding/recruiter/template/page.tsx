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
    // Retry once
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
      // Still redirect — user can retry from dashboard
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
    <Card>
      <CardHeader>
        <p className="text-xs font-medium text-muted-foreground">Étape 3 / 3</p>
        <CardTitle>Votre premier template</CardTitle>
        <CardDescription>
          Configurez vos templates depuis la page Dossiers. Vous pouvez le faire
          maintenant ou plus tard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Les templates permettent de générer des dossiers personnalisés pour
          vos clients. Rendez-vous dans <strong>Dossiers → Templates</strong>{" "}
          pour en créer ou en importer un.
        </p>
        <div className="flex flex-col gap-2">
          <Button onClick={handleGoToTemplates}>
            Configurer mes templates →
          </Button>
          <Button variant="ghost" onClick={handleSkip}>
            Passer cette étape →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
