"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { SettingsCard } from "@/components/ui/SettingsCard";
import { TabBar } from "@/components/ui/TabBar";
import { Label } from "@/components/ui/label";
import {
  DeleteAccountDialog,
  ExportDataButton,
} from "@/components/account-data-actions";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import { initialsFromParts } from "@/lib/labels";
import type { OrgMember, Organization } from "@/types/api";

type Tab = "profil" | "organisation" | "donnees";

function ProfilPersonnelTab() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{
        first_name: string | null;
        last_name: string | null;
        job_title: string | null;
      }>("/recruiters/me/profile")
      .then((p) => {
        setFirstName(p.first_name ?? "");
        setLastName(p.last_name ?? "");
        setJobTitle(p.job_title ?? "");
      })
      .catch(() => setLoadError("Impossible de charger votre profil."));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.put("/recruiters/me/profile", {
        first_name: firstName || null,
        last_name: lastName || null,
        job_title: jobTitle || null,
      });
      setMessage("Profil mis à jour.");
    } catch {
      setMessage("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <ErrorAlert error={loadError} />;

  return (
    <SettingsCard
      legend="Profil recruteur"
      sub="Ces informations identifient vos actions auprès des candidats."
    >
      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="rec-first-name"
              className="text-[13.5px] text-ink-2"
            >
              Prénom
            </Label>
            <Input
              id="rec-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-last-name" className="text-[13.5px] text-ink-2">
              Nom
            </Label>
            <Input
              id="rec-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-job-title" className="text-[13.5px] text-ink-2">
            Titre / poste
          </Label>
          <Input
            id="rec-job-title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>
        {message && <p className="text-sm text-ink-3">{message}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>
    </SettingsCard>
  );
}

function DonneesTab() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <SettingsCard
        legend="Vos données"
        sub="Conformément au RGPD, vous disposez d'un droit d'accès et de portabilité sur vos données."
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium">Export de vos données (JSON)</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              Profil recruteur, organisation et dossiers générés.
            </p>
          </div>
          <ExportDataButton
            exportUrl="/recruiters/me/export"
            filePrefix="jorg-recruteur-export"
          />
        </div>
      </SettingsCard>

      <SettingsCard
        legend="Supprimer mon compte"
        sub="Action irréversible liée à votre compte recruteur."
      >
        <div className="flex flex-col gap-4 rounded-[7px] border border-danger/40 bg-danger/5 px-[18px] py-3.5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-semibold text-danger">
              Supprimer le compte
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              Suppression définitive de votre compte recruteur. Votre
              organisation et les dossiers générés sont conservés.
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
        <DeleteAccountDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          deleteUrl="/recruiters/me"
        />
      </SettingsCard>
    </>
  );
}

export default function RecruiterSettingsPage() {
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [activeTab, setActiveTab] = useState<Tab>("profil");
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      api
        .get<Organization>(`/organizations/${orgId}`)
        .then(setOrg)
        .catch((err) => setError(extractErrorMessage(err, "Erreur"))),
      api
        .get<OrgMember[]>(`/organizations/${orgId}/members`)
        .then(setMembers)
        .catch(() => {}),
    ]);
  }, [orgId]);

  async function handleRegenerateCode() {
    if (!orgId) return;
    setRegenerating(true);
    try {
      const updated = await api.post<Organization>(
        `/organizations/${orgId}/regenerate-join-code`,
        {},
      );
      setOrg(updated);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur"));
    } finally {
      setRegenerating(false);
    }
  }

  function copyCode() {
    if (!org) return;
    void navigator.clipboard.writeText(org.join_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "profil", label: "Profil personnel" },
    { key: "organisation", label: "Organisation" },
    { key: "donnees", label: "Données" },
  ];

  if (orgLoading) return <p className="text-ink-3">Chargement…</p>;

  if (!orgId) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="font-heading text-[27px] font-semibold leading-tight">
          Configuration
        </h1>
        <p className="text-sm text-ink-2">
          Vous n&apos;êtes pas encore associé à une organisation. Retournez sur
          le{" "}
          <Link
            href="/recruiter/dashboard"
            className="font-medium text-primary hover:underline"
          >
            tableau de bord
          </Link>{" "}
          pour en créer ou rejoindre une.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <header>
        <p className="j-overline">
          {org?.name ?? "Espace recruteur"} · organisation
        </p>
        <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
          Paramètres
        </h1>
        <p className="mt-1 max-w-[560px] text-[15px] text-ink-2">
          Gérez votre profil recruteur, votre organisation et les accès de
          l&apos;équipe à l&apos;espace Jorg.
        </p>
      </header>
      <ErrorAlert error={error} />

      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="underline"
      />

      <div className="flex max-w-3xl flex-col gap-4">
        {activeTab === "profil" && <ProfilPersonnelTab />}

        {activeTab === "donnees" && <DonneesTab />}

        {activeTab === "organisation" && (
          <>
            <SettingsCard
              legend="Code d'invitation équipe"
              sub="Partagez ce code pour permettre à un collègue de rejoindre votre organisation."
            >
              {org && (
                <div className="flex flex-wrap items-center gap-3">
                  <code className="rounded-[7px] border border-line bg-paper-2 px-4 py-2 font-mono text-lg tracking-[0.14em]">
                    {org.join_code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyCode}
                    className="gap-1.5"
                  >
                    {codeCopied ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5" strokeWidth={1.6} />
                    )}
                    {codeCopied ? "Copié !" : "Copier"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegenerateCode}
                    disabled={regenerating}
                    className="gap-1.5 text-ink-3"
                    title="Régénérer le code (invalide l'ancien)"
                  >
                    <RefreshCw
                      className={`size-3.5 ${regenerating ? "animate-spin" : ""}`}
                      strokeWidth={1.6}
                    />
                    Régénérer
                  </Button>
                </div>
              )}
            </SettingsCard>

            <section className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="flex items-center gap-2 px-[26px] pb-3.5 pt-[22px]">
                <h2 className="text-[15px] font-semibold">Membres</h2>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-accent-line bg-accent-soft px-1.5 font-mono text-[11px] font-medium text-primary">
                  {members.length}
                </span>
              </div>
              {members.length === 0 ? (
                <p className="px-[26px] pb-5 text-sm text-ink-3">
                  Aucun membre pour l&apos;instant. Partagez le code
                  d&apos;invitation pour ajouter un collègue à
                  l&apos;organisation.
                </p>
              ) : (
                members.map((m) => (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3 border-t border-line px-[26px] py-3"
                  >
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-lg border border-accent-line bg-accent-soft font-heading text-[13px] font-semibold text-primary">
                      {initialsFromParts(m.first_name, m.last_name, m.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.first_name && m.last_name
                          ? `${m.first_name} ${m.last_name}`
                          : m.email}
                      </p>
                      <p className="truncate text-xs text-ink-3">
                        {m.email}
                        {m.job_title ? ` · ${m.job_title}` : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
