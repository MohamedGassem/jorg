"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { Invitation } from "@/types/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  onInvited?: (inv: Invitation) => void;
}

export function InviteCandidateDialog({
  open,
  onOpenChange,
  orgId,
  onInvited,
}: Props) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      const inv = await api.post<Invitation>(
        `/organizations/${orgId}/invitations`,
        { candidate_email: email.trim() },
      );
      setSuccess(`Invitation envoyée à ${email.trim()}`);
      setEmail("");
      onInvited?.(inv);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setEmail("");
    setError(null);
    setSuccess(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inviter un candidat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email du candidat</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="candidat@exemple.com"
              required
            />
          </div>
          <ErrorAlert error={error} />
          {success && (
            <p role="status" className="text-sm text-emerald-600">
              {success}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Fermer
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
