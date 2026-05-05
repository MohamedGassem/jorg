// frontend/app/(candidate)/candidate/settings/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { logout } from "@/lib/auth";

export default function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.download("/candidates/me/export", `jorg-export-${today}.json`);
    } catch (err) {
      setExportError(
        err instanceof ApiError ? err.detail : "Échec de l'export",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== "SUPPRIMER") {
      setDeleteError('Saisir "SUPPRIMER" pour confirmer');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete<void>("/candidates/me");
      await logout();
      window.location.href = "/";
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.detail : "Échec de la suppression",
      );
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Paramètres</h1>

      <Card>
        <CardHeader>
          <CardTitle>Exporter mes données</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Télécharger un fichier JSON contenant l&apos;intégralité de vos
            données personnelles (profil, expériences, compétences, accès
            accordés, documents générés).
          </p>
          {exportError && (
            <p role="alert" className="text-sm text-destructive">
              {exportError}
            </p>
          )}
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? "Export en cours…" : "Exporter au format JSON"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">
            Supprimer mon compte
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Action irréversible. Votre profil et toutes ses données seront
            supprimés définitivement. Les documents déjà générés par les
            recruteurs sont conservés pour audit mais anonymisés.
          </p>
          <Button variant="destructive" onClick={() => setDialogOpen(true)}>
            Supprimer définitivement mon compte
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmation requise</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Saisir <strong>SUPPRIMER</strong>{" "}
              ci-dessous pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-text">Confirmation</Label>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="SUPPRIMER"
            />
            {deleteError && (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
