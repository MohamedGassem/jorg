"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api, ApiError } from "@/lib/api";
import { logout } from "@/lib/auth";
import type { CandidateProfile } from "@/types/api";

type Tab = "infos" | "compte" | "rgpd";

function InformationsPersonnellesTab() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((p) => {
        setProfile(p);
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
      })
      .catch(console.error);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setIsError(false);
    try {
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        {
          first_name: firstName || null,
          last_name: lastName || null,
        },
      );
      setProfile(updated);
      setMessage("Informations mises à jour.");
    } catch (err) {
      setIsError(true);
      setMessage(
        err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informations personnelles</CardTitle>
        <CardDescription>
          Nom et prénom associés à votre compte.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="max-w-sm space-y-4">
          <div className="space-y-1">
            <Label htmlFor="first-name">Prénom</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="last-name">Nom</Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          {message && (
            <p
              className={
                isError ? "text-sm text-destructive" : "text-sm text-green-600"
              }
            >
              {message}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CompteTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
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
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Supprimer le compte</CardTitle>
        <CardDescription>
          Cette action est irréversible. Toutes vos données seront supprimées.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setDialogOpen(true)}>
          Supprimer mon compte
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
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
      </CardContent>
    </Card>
  );
}

function RgpdTab() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Données personnelles (RGPD)</CardTitle>
        <CardDescription>
          Téléchargez une copie de toutes vos données au format JSON.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <ErrorAlert error={exportError} />
        <Button onClick={handleExport} disabled={exporting} variant="outline">
          {exporting ? "Export en cours…" : "Exporter mes données"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("infos");

  const tabs: { key: Tab; label: string }[] = [
    { key: "infos", label: "Informations personnelles" },
    { key: "compte", label: "Compte" },
    { key: "rgpd", label: "RGPD" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Paramètres</h1>
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === "infos" && <InformationsPersonnellesTab />}
      {activeTab === "compte" && <CompteTab />}
      {activeTab === "rgpd" && <RgpdTab />}
    </div>
  );
}
