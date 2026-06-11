"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { jwtDecode } from "jwt-decode";
import { Check, CheckCircle2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JorgWordmark } from "@/components/ui/JorgWordmark";
import { AuthLegalFooter } from "@/components/AuthLegalFooter";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuthResponse } from "@/types/api";

interface JwtPayload {
  role: "candidate" | "recruiter";
}

const TRUST_ITEMS = [
  {
    title: "Profil structuré",
    detail: "Retrouvez les compétences, expériences et preuves utiles.",
  },
  {
    title: "Accès contrôlés",
    detail: "Suivez qui peut consulter votre profil et les actions associées.",
  },
  {
    title: "Dossiers générés",
    detail: "Accédez aux documents produits depuis les modèles Jorg.",
  },
];

function AuthTrustPanel() {
  return (
    <aside className="rounded-lg border border-line bg-paper-2 px-[26px] py-[22px]">
      <p className="j-overline">Workspace RH document-first</p>
      <h2 className="mt-3 font-heading text-xl font-semibold">
        Votre dossier reste structuré, contrôlé et exploitable.
      </h2>
      <div className="mt-4 flex flex-col">
        {TRUST_ITEMS.map((item, i) => (
          <div
            key={item.title}
            className={cn(
              "flex items-start gap-[13px] py-[13px]",
              i < TRUST_ITEMS.length - 1 && "border-b border-line",
            )}
          >
            <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-md border border-positive-border bg-positive-soft text-positive">
              <Check className="size-[13px]" strokeWidth={1.6} />
            </span>
            <div>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-[12.5px] text-ink-3">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="j-meta mt-4 flex items-center gap-2 text-[11.5px]">
        <ShieldCheck className="size-3.5" strokeWidth={1.6} />
        Chaque consultation est tracée et visible par le candidat.
      </p>
    </aside>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const justReset = searchParams.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<AuthResponse>("/auth/login", {
        email,
        password,
      });
      const { role } = jwtDecode<JwtPayload>(data.access_token);
      router.push(
        role === "candidate" ? "/candidate/dashboard" : "/recruiter/dashboard",
      );
    } catch (err) {
      console.error("[login]", err);
      if (err instanceof ApiError) {
        setError(err.detail);
      } else if (err instanceof TypeError && err.message.includes("fetch")) {
        setError(
          "Impossible de contacter le serveur. Vérifiez que le backend est démarré.",
        );
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Erreur inconnue");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-8">
      <div className="grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <JorgWordmark />
          <div className="mt-8">
            <p className="j-overline">Espace sécurisé</p>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Accéder à mon espace Jorg
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Retrouvez votre dossier, vos accès et les documents générés depuis
              votre profil.
            </p>
          </div>

          {(justRegistered || justReset) && (
            <div className="mt-5 flex items-start gap-3 rounded-lg bg-primary-soft px-3 py-3 text-sm text-foreground">
              <CheckCircle2 className="size-5 shrink-0 text-primary" />
              {justRegistered
                ? "Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous."
                : "Mot de passe réinitialisé. Vous pouvez maintenant vous connecter."}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
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
            </div>
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
              {loading ? "Connexion..." : "Accéder à mon espace"}
            </Button>
          </form>

          <p className="mt-5 text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Créer un compte
            </Link>
          </p>
        </section>

        <AuthTrustPanel />
      </div>
      <AuthLegalFooter />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
