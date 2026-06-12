"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { logout } from "@/lib/auth";

interface ExportDataButtonProps {
  exportUrl: string;
  /** Filename stem; the current date and `.json` are appended at click time. */
  filePrefix: string;
}

export function ExportDataButton({
  exportUrl,
  filePrefix,
}: ExportDataButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.download(exportUrl, `${filePrefix}-${today}.json`);
    } catch (err) {
      setExportError(
        err instanceof ApiError ? err.detail : "Échec de l'export",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <Button
        variant="outline"
        size="sm"
        disabled={exporting}
        onClick={handleExport}
      >
        <Download className="size-3.5" strokeWidth={1.6} />
        {exporting ? "Export en cours…" : "Exporter JSON"}
      </Button>
      <ErrorAlert error={exportError} />
    </div>
  );
}

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleteUrl: string;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  deleteUrl,
}: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText !== "SUPPRIMER") {
      setDeleteError('Saisir "SUPPRIMER" pour confirmer');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete<void>(deleteUrl);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer la suppression</DialogTitle>
          <DialogDescription>
            Saisir <strong>SUPPRIMER</strong> pour confirmer.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="SUPPRIMER"
        />
        <ErrorAlert error={deleteError} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
