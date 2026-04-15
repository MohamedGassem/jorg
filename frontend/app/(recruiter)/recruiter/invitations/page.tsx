// frontend/app/(recruiter)/invitations/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { Invitation, RecruiterProfile } from "@/types/api";

const statusLabel: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  expired: "Expirée",
};

export default function InvitationsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    api.get<RecruiterProfile>("/recruiters/me/profile").then((p) => setOrgId(p.organization_id)).catch(console.error);
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !email.trim()) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const inv = await api.post<Invitation>(`/organizations/${orgId}/invitations`, {
        candidate_email: email.trim(),
      });
      setInvitations((prev) => [inv, ...prev]);
      setSuccess(`Invitation envoyée à ${email}`);
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setSending(false);
    }
  }

  if (!orgId) return <p className="text-muted-foreground">Associez d&apos;abord votre compte à une organisation.</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Invitations</h1>
      <Card>
        <CardHeader><CardTitle>Inviter un candidat</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email du candidat</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {success && <p role="status" className="text-sm text-green-600">{success}</p>}
            <Button type="submit" disabled={sending}>
              {sending ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {invitations.length > 0 && (
        <ul className="space-y-3" role="list">
          {invitations.map((inv) => (
            <li key={inv.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{inv.candidate_email}</CardTitle>
                    <Badge variant="secondary">{statusLabel[inv.status] ?? inv.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Expire le {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
