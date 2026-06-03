// frontend/app/(public)/register/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, UserCircle, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Role = "candidate" | "recruiter";

const ROLES: {
  value: Role;
  label: string;
  description: string;
  icon: typeof UserCircle;
}[] = [
  {
    value: "candidate",
    label: "Candidat",
    description: "Je gère mon profil de compétences",
    icon: UserCircle,
  },
  {
    value: "recruiter",
    label: "Recruteur",
    description: "Je génère des CVs pour mes clients",
    icon: Briefcase,
  },
];

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>("candidate");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role");
    if (r === "candidate" || r === "recruiter") setRole(r);
  }, []);

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
        ...(role === "recruiter" && alphaCode
          ? { alpha_invite_code: alphaCode }
          : {}),
      });
      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Inscription échouée");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">
            J
          </div>
          <div className="text-center">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              Jorg
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Créez votre compte gratuitement
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold">
              Créer un compte
            </CardTitle>
            <CardDescription>
              Rejoignez Jorg en tant que candidat ou recruteur
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role picker */}
              <div className="space-y-1.5">
                <Label>Je suis</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map(({ value, label, description, icon: Icon }) => {
                    const selected = role === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRole(value)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all duration-150",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                            : "border-border bg-muted/20 hover:border-border/80 hover:bg-muted/40",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4",
                            selected ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span
                          className={cn(
                            "text-sm font-medium",
                            selected ? "text-foreground" : "text-foreground/80",
                          )}
                        >
                          {label}
                        </span>
                        <span className="text-xs text-muted-foreground leading-tight">
                          {description}
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
                  Minimum 8 caractères
                </p>
              </div>

              {role === "recruiter" && (
                <div className="space-y-1">
                  <Label htmlFor="alpha-code">Code d&apos;accès alpha</Label>
                  <Input
                    id="alpha-code"
                    value={alphaCode}
                    onChange={(e) => setAlphaCode(e.target.value.toUpperCase())}
                    placeholder="JORG-XXXX-YYYY"
                    required={role === "recruiter"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Code d&apos;invitation requis pendant la phase alpha.
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
                {loading ? "Création…" : "Créer mon compte"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Déjà inscrit ?{" "}
              <Link
                href="/login"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Se connecter
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
