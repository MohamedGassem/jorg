"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { TabBar } from "@/components/ui/TabBar";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type { OrgMember, Organization } from "@/types/api";

type Tab = "profil" | "organisation";

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
    <Card>
      <CardHeader>
        <CardTitle>Profil personnel</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="max-w-sm space-y-4">
          <div className="space-y-1">
            <Label htmlFor="rec-first-name">Prénom</Label>
            <Input
              id="rec-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec-last-name">Nom</Label>
            <Input
              id="rec-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec-job-title">Titre / poste</Label>
            <Input
              id="rec-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
            />
          </div>
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </form>
      </CardContent>
    </Card>
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
  ];

  if (orgLoading) return <p className="text-muted-foreground">Chargement…</p>;

  if (!orgId) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;êtes pas encore associé à une organisation. Retournez sur
          le{" "}
          <Link href="/recruiter/dashboard" className="underline">
            tableau de bord
          </Link>{" "}
          pour en créer ou rejoindre une.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Configuration</h1>
      <ErrorAlert error={error} />

      {/* Tab bar */}
      <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Profil personnel tab */}
      {activeTab === "profil" && <ProfilPersonnelTab />}

      {/* Organisation tab (merged with membres) */}
      {activeTab === "organisation" && (
        <div className="space-y-4">
          {/* Org info */}
          {org && (
            <Card>
              <CardHeader>
                <CardTitle>{org.name}</CardTitle>
                <CardDescription>Slug : {org.slug}</CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Join code */}
          <Card>
            <CardHeader>
              <CardTitle>Code d&apos;invitation</CardTitle>
              <CardDescription>
                Partagez ce code pour permettre à un collègue de rejoindre votre
                organisation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {org && (
                <div className="flex items-center gap-3">
                  <code className="rounded-md bg-muted px-4 py-2 font-mono text-lg tracking-widest">
                    {org.join_code}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyCode}
                    className="gap-1.5"
                  >
                    {codeCopied ? (
                      <Check className="size-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {codeCopied ? "Copié !" : "Copier"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleRegenerateCode}
                    disabled={regenerating}
                    className="gap-1.5 text-muted-foreground"
                    title="Régénérer le code (invalide l'ancien)"
                  >
                    <RefreshCw
                      className={`size-3.5 ${regenerating ? "animate-spin" : ""}`}
                    />
                    Régénérer
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Members list */}
          <Card>
            <CardHeader>
              <CardTitle>Membres ({members.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun membre pour l&apos;instant.
                </p>
              ) : (
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li
                      key={m.user_id}
                      className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {m.first_name && m.last_name
                            ? `${m.first_name} ${m.last_name}`
                            : m.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {m.email}
                          {m.job_title ? ` · ${m.job_title}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
