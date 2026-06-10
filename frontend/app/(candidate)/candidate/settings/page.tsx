"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Download, Minus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { TabBar } from "@/components/ui/TabBar";
import { Toggle } from "@/components/ui/Toggle";
import { api, ApiError } from "@/lib/api";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { CandidateProfile } from "@/types/api";

type Tab = "infos" | "compte" | "rgpd";

function SettingsCard({
  legend,
  sub,
  children,
}: {
  legend: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
      <div>
        <h2 className="text-[15px] font-semibold">{legend}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function InformationsPersonnellesTab() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((p) => {
        setProfile(p);
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
      })
      .catch(() => {
        setLoadError("Impossible de charger votre profil.");
      });
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

  if (loadError) return <ErrorAlert error={loadError} />;
  if (!profile) return <p className="text-ink-3">Chargement…</p>;

  return (
    <SettingsCard
      legend="Informations personnelles"
      sub="Ces informations identifient votre profil candidat dans Jorg."
    >
      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first-name" className="text-[13.5px] text-ink-2">
              Prénom
            </Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name" className="text-[13.5px] text-ink-2">
              Nom
            </Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        {message && !isError && (
          <p className="text-sm text-success">{message}</p>
        )}
        <ErrorAlert error={isError ? message : null} />
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>
    </SettingsCard>
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
    <SettingsCard
      legend="Zone de danger"
      sub="Actions irréversibles liées à votre compte."
    >
      <div className="flex flex-col gap-4 rounded-[7px] border border-danger/40 bg-danger/5 px-[18px] py-3.5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-semibold text-danger">
            Supprimer le compte
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Suppression définitive de toutes vos données. Tous les accès et
            dossiers générés sont révoqués.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-danger/50 text-danger hover:bg-danger/10 hover:text-danger"
          onClick={() => setDialogOpen(true)}
        >
          Supprimer…
        </Button>
      </div>
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
    </SettingsCard>
  );
}

function RightRow({
  title,
  sub,
  danger,
  action,
  last,
}: {
  title: string;
  sub: string;
  danger?: boolean;
  action: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-[13px] sm:flex-row sm:items-center sm:gap-[13px]",
        !last && "border-b border-line",
      )}
    >
      <span
        className={cn(
          "grid size-[22px] shrink-0 place-items-center rounded-md border",
          danger
            ? "border-dashed border-line-strong bg-paper-2 text-ink-4"
            : "border-positive-border bg-positive-soft text-positive",
        )}
      >
        {danger ? (
          <Minus className="size-[13px]" strokeWidth={1.6} />
        ) : (
          <Check className="size-[13px]" strokeWidth={1.6} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", danger && "text-danger")}>
          {title}
        </p>
        <p className="text-[12.5px] text-ink-3">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function RgpdTab({ onRequestDeletion }: { onRequestDeletion: () => void }) {
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
    <>
      <SettingsCard
        legend="Vos droits sur vos données"
        sub="Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de portabilité et d'effacement."
      >
        <ErrorAlert error={exportError} />
        <div className="flex flex-col">
          <RightRow
            title="Droit d'accès et de portabilité"
            sub="Export structuré (JSON) de votre profil, expériences, compétences et accès."
            action={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={exporting}
                onClick={handleExport}
              >
                <Download className="size-3.5" strokeWidth={1.6} />
                {exporting ? "Export en cours…" : "Exporter JSON"}
              </Button>
            }
          />
          <RightRow
            title="Droit de rectification"
            sub="Corrigez vos informations dans Mon dossier à tout moment."
            action={
              <Link
                href="/candidate/profile"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "shrink-0",
                )}
              >
                <ArrowRight className="size-3.5" strokeWidth={1.6} />
                Aller à Mon dossier
              </Link>
            }
          />
          <RightRow
            title="Droit à l'effacement"
            sub="Supprimer définitivement toutes vos données. Tous les accès tiers sont révoqués."
            danger
            last
            action={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-danger/50 text-danger hover:bg-danger/10 hover:text-danger"
                onClick={onRequestDeletion}
              >
                Demander la suppression
              </Button>
            }
          />
        </div>
      </SettingsCard>

      <SettingsCard
        legend="Cookies & traceurs"
        sub="Jorg n'utilise que des cookies strictement nécessaires au fonctionnement de la plateforme."
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Cookies fonctionnels</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              Session, préférences, thème. Obligatoires — ne peuvent pas être
              désactivés.
            </p>
          </div>
          <Toggle checked disabled label="Cookies fonctionnels" />
        </div>
      </SettingsCard>
    </>
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
    <div className="flex w-full flex-col gap-[18px]">
      <header>
        <p className="j-overline">Espace candidat</p>
        <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
          Compte &amp; données
        </h1>
        <p className="mt-1 text-[15px] text-ink-2">
          Gérez votre identité candidat, l&apos;export de vos données et les
          actions sensibles liées à votre compte.
        </p>
      </header>
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />
      <div className="flex max-w-3xl flex-col gap-4">
        {activeTab === "infos" && <InformationsPersonnellesTab />}
        {activeTab === "compte" && <CompteTab />}
        {activeTab === "rgpd" && (
          <RgpdTab onRequestDeletion={() => setActiveTab("compte")} />
        )}
      </div>
    </div>
  );
}
