"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JorgWordmark } from "@/components/ui/JorgWordmark";
import { AuthLegalFooter } from "@/components/AuthLegalFooter";
import { api, ApiError } from "@/lib/api";
import { safeInternalPath } from "@/lib/safe-path";
import { cn } from "@/lib/utils";

type Role = "candidate" | "recruiter";

const ROLES: {
  value: Role;
  label: string;
  description: string;
  detail: string;
}[] = [
  {
    value: "candidate",
    label: "Candidat",
    description: "Je construis mon dossier de compétences",
    detail: "Structurez votre profil et gardez le contrôle des accès.",
  },
  {
    value: "recruiter",
    label: "Recruteur",
    description: "Je génère des dossiers candidats",
    detail: "Travaillez depuis des profils autorisés et des modèles Jorg.",
  },
];

const TRUST_STEPS = [
  {
    title: "Profil structuré",
    detail: "Les informations utiles sont rangées pour alimenter les dossiers.",
  },
  {
    title: "Accès contrôlé",
    detail: "Les candidats savent quelles organisations peuvent agir.",
  },
  {
    title: "Dossier généré",
    detail: "Les documents sont produits depuis les modèles de dossier Jorg.",
  },
];

function RegisterTrustPanel({ role }: { role: Role }) {
  return (
    <aside className="rounded-lg border border-line bg-paper-2 px-[26px] py-[22px]">
      <p className="j-overline">Alpha privée Jorg</p>
      <h2 className="mt-3 font-heading text-xl font-semibold">
        {role === "candidate"
          ? "Votre profil devient un dossier fiable, partageable sous contrôle."
          : "Vos dossiers candidats partent de profils autorisés, pas de copies dispersées."}
      </h2>
      <div className="mt-5 flex flex-col gap-3">
        {TRUST_STEPS.map((step, i) => (
          <div
            key={step.title}
            className="rounded-md border border-line bg-surface px-4 py-3"
          >
            <p className="j-overline text-[10px]">Étape {i + 1}</p>
            <p className="mt-1 text-sm font-semibold">{step.title}</p>
            <p className="mt-0.5 text-[12.5px] leading-5 text-ink-3">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>(() => {
    const r = searchParams.get("role");
    return r === "candidate" || r === "recruiter" ? r : "candidate";
  });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [alphaCode, setAlphaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/register", {
        email,
        password,
        role,
        first_name: firstName,
        last_name: lastName,
        ...(role === "recruiter" && alphaCode.length > 0
          ? { alpha_invite_code: alphaCode }
          : {}),
      });
      // Recruiters have no onboarding tunnel (décision 5) : leur seul état
      // bloquant est l'absence d'organisation, géré par le dashboard. Le `next`
      // (parcours invitation, C9) est porté à travers l'onboarding candidat et
      // consommé directement côté recruteur.
      const next = safeInternalPath(searchParams.get("next"));
      if (role === "candidate") {
        router.push(
          next
            ? `/onboarding/candidate/profile?next=${encodeURIComponent(next)}`
            : "/onboarding/candidate/profile",
        );
      } else {
        router.push(next ?? "/recruiter/dashboard");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Inscription échouée");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
      <div className="grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,460px)_1fr]">
        <section className="rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <JorgWordmark />
          <div className="mt-8">
            <p className="j-overline">Espace sécurisé</p>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Créer mon espace Jorg
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Choisissez votre parcours avant de renseigner vos informations.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Votre parcours</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ROLES.map(({ value, label, description, detail }) => {
                  const selected = role === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        selected
                          ? "border-primary bg-accent-soft-2 text-foreground"
                          : "border-line-2 bg-surface hover:bg-paper-2",
                      )}
                    >
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="mt-1 block text-sm text-foreground">
                        {description}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="first-name">Prénom</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="last-name">Nom</Label>
                <Input
                  id="last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimum 8 caractères.
              </p>
            </div>

            {role === "recruiter" && (
              <div className="space-y-1.5 rounded-lg border border-warn-border bg-warn-soft p-3">
                <Label htmlFor="alpha-code">Code d&apos;accès alpha</Label>
                <Input
                  id="alpha-code"
                  value={alphaCode}
                  onChange={(e) => setAlphaCode(e.target.value.toUpperCase())}
                  placeholder="JORG-XXXX-YYYY"
                  required={role === "recruiter"}
                />
                <p className="text-xs text-muted-foreground">
                  L&apos;accès recruteur se fait sur demande pendant
                  l&apos;alpha. Ce code vous place dans une organisation de
                  démonstration, déjà remplie de profils d&apos;exemple, pour
                  explorer les fonctionnalités.
                </p>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Création..." : "Créer mon compte Jorg"}
            </Button>

            <p className="text-xs leading-5 text-muted-foreground">
              En créant un compte, vous acceptez nos{" "}
              <Link
                href="/mentions-legales"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                mentions légales
              </Link>{" "}
              et notre{" "}
              <Link
                href="/privacy"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                politique de confidentialité
              </Link>
              .
            </p>
          </form>

          <p className="mt-5 text-sm text-muted-foreground">
            Déjà inscrit ?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Se connecter
            </Link>
          </p>
        </section>

        <RegisterTrustPanel role={role} />
      </div>
      <AuthLegalFooter />
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
