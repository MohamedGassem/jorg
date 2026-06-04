// frontend/app/(public)/verify-email/page.tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";

type Status = "loading" | "success" | "error";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setStatus("error");
      setError("Lien de vérification invalide : aucun token fourni.");
      return;
    }

    api
      .post("/auth/verify-email", { token })
      .then(() => setStatus("success"))
      .catch((err) => {
        setStatus("error");
        setError(
          err instanceof ApiError
            ? "Ce lien de vérification est invalide ou a expiré."
            : "Une erreur est survenue lors de la vérification.",
        );
      });
  }, [token]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">
            J
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Jorg
          </h1>
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold">
              Vérification de l&apos;email
            </CardTitle>
            <CardDescription>
              {status === "loading"
                ? "Validation de votre adresse en cours…"
                : status === "success"
                  ? "Votre adresse email est confirmée"
                  : "La vérification a échoué"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === "loading" && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                Veuillez patienter…
              </div>
            )}

            {status === "success" && (
              <>
                <div className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-3 text-sm text-foreground">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  Votre email a bien été vérifié. Vous pouvez maintenant vous
                  connecter.
                </div>
                <Link
                  href="/login"
                  className={buttonVariants({
                    size: "lg",
                    className: "w-full",
                  })}
                >
                  Se connecter
                </Link>
              </>
            )}

            {status === "error" && (
              <>
                <div
                  role="alert"
                  className="flex items-center gap-3 rounded-lg bg-destructive/10 px-3 py-3 text-sm text-destructive"
                >
                  <XCircle className="size-5 shrink-0" />
                  {error}
                </div>
                <Link
                  href="/login"
                  className={buttonVariants({
                    variant: "outline",
                    size: "lg",
                    className: "w-full",
                  })}
                >
                  Retour à la connexion
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
