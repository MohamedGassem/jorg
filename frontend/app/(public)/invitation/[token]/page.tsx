// frontend/app/(public)/invitation/[token]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { JorgWordmark } from "@/components/ui/JorgWordmark";
import { api, ApiError } from "@/lib/api";
import type { PublicInvitationRead } from "@/types/api";

type LoadStatus = "loading" | "error" | "ready";

async function fetchRole(): Promise<"candidate" | "recruiter" | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    const data = (await res.json()) as { role?: "candidate" | "recruiter" };
    return data.role ?? null;
  } catch {
    return null;
  }
}

function effectiveStatus(invitation: PublicInvitationRead): string {
  if (
    invitation.status === "pending" &&
    new Date(invitation.expires_at).getTime() < Date.now()
  ) {
    return "expired";
  }
  return invitation.status;
}

export default function PublicInvitationPage() {
  const { token } = useParams<{ token: string }>();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [invitation, setInvitation] = useState<PublicInvitationRead | null>(
    null,
  );
  const [role, setRole] = useState<"candidate" | "recruiter" | null>(null);
  const [shareFinances, setShareFinances] = useState(true);
  const [shareContact, setShareContact] = useState(true);
  const [responding, setResponding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.get<PublicInvitationRead>(`/public/invitations/${token}`),
      fetchRole(),
    ])
      .then(([inv, r]) => {
        setInvitation(inv);
        setRole(r);
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }, [token]);

  async function respond(action: "accept" | "reject") {
    setResponding(true);
    setActionError(null);
    try {
      await api.post(
        `/invitations/${token}/${action}`,
        action === "accept"
          ? {
              share_finances_internal: shareFinances,
              share_contact: shareContact,
            }
          : undefined,
      );
      const refreshed = await api.get<PublicInvitationRead>(
        `/public/invitations/${token}`,
      );
      setInvitation(refreshed);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.detail : "Une erreur est survenue",
      );
    } finally {
      setResponding(false);
    }
  }

  const orgLabel = invitation?.organization_name ?? "Une organisation";
  const status = invitation ? effectiveStatus(invitation) : null;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <JorgWordmark />
        </div>

        <Card>
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg font-semibold">Invitation</CardTitle>
            <CardDescription>
              {loadStatus === "ready" && status === "pending"
                ? `${orgLabel} souhaite accéder à votre dossier de compétences.`
                : "Détail de l'invitation"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadStatus === "loading" && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                Chargement de l&apos;invitation…
              </div>
            )}

            {loadStatus === "error" && (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-lg bg-destructive/10 px-3 py-3 text-sm text-destructive"
              >
                <XCircle className="size-5 shrink-0" />
                Cette invitation est introuvable ou le lien est invalide.
              </div>
            )}

            {loadStatus === "ready" && status && status !== "pending" && (
              <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-3 text-sm text-foreground">
                <CheckCircle2 className="size-5 shrink-0 text-primary" />
                {status === "accepted"
                  ? "Cette invitation a déjà été acceptée."
                  : status === "rejected"
                    ? "Cette invitation a été refusée."
                    : "Cette invitation a expiré."}
              </div>
            )}

            {loadStatus === "ready" && status === "pending" && (
              <>
                {actionError && (
                  <div
                    role="alert"
                    className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {actionError}
                  </div>
                )}

                {role === "candidate" ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Choisissez ce que vous partagez. Le dossier de base
                      (identité, expériences, compétences) est toujours inclus ;
                      vous pouvez révoquer l&apos;accès à tout moment.
                    </p>
                    <div className="flex flex-col gap-2.5">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={shareFinances}
                          onCheckedChange={setShareFinances}
                        />
                        Partager mon TJM / ma rémunération
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={shareContact}
                          onCheckedChange={setShareContact}
                        />
                        Partager mes coordonnées (téléphone, email)
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 justify-center"
                        disabled={responding}
                        onClick={() => respond("accept")}
                      >
                        {responding ? "En cours…" : "Autoriser l'accès"}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 justify-center"
                        disabled={responding}
                        onClick={() => respond("reject")}
                      >
                        Refuser
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Connectez-vous ou créez votre espace candidat pour
                      répondre à cette invitation.
                    </p>
                    <div className="flex flex-col gap-2">
                      <Link
                        href={`/login?next=/invitation/${token}`}
                        className={buttonVariants({
                          size: "lg",
                          className: "w-full",
                        })}
                      >
                        Me connecter
                      </Link>
                      <Link
                        href={`/register?role=candidate&next=/invitation/${token}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "lg",
                          className: "w-full",
                        })}
                      >
                        Créer mon espace candidat
                      </Link>
                    </div>
                  </>
                )}
              </>
            )}

            <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0" />
              Rien n&apos;est partagé sans votre accord explicite.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
