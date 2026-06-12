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
import { api } from "@/lib/api";
import { useAsyncOp } from "@/lib/hooks/useAsyncOp";
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
  const [success, setSuccess] = useState<string | null>(null);
  const op = useAsyncOp("Erreur lors de l'envoi");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSuccess(null);
    await op.run(async () => {
      const inv = await api.post<Invitation>(
        `/organizations/${orgId}/invitations`,
        { candidate_email: email.trim() },
      );
      setSuccess(`Invitation envoyée à ${email.trim()}`);
      setEmail("");
      onInvited?.(inv);
    });
  }

  function handleClose() {
    setEmail("");
    setSuccess(null);
    op.clearError();
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
          <ErrorAlert error={op.error} />
          {success && (
            <p role="status" className="text-sm text-success">
              {success}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Fermer
            </Button>
            <Button type="submit" disabled={op.saving}>
              {op.saving ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
