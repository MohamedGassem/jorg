"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type { OrgMember, Organization, Template } from "@/types/api";

type Tab = "organisation" | "membres" | "templates";

export default function RecruiterSettingsPage() {
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [activeTab, setActiveTab] = useState<Tab>("organisation");
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
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
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then(setTemplates)
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
    { key: "organisation", label: "Organisation" },
    { key: "membres", label: "Membres" },
    { key: "templates", label: "Templates" },
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
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Organisation tab */}
      {activeTab === "organisation" && org && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{org.name}</CardTitle>
              <CardDescription>Slug : {org.slug}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Membres tab */}
      {activeTab === "membres" && (
        <div className="space-y-4">
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

      {/* Templates tab */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </p>
            <Link
              href="/recruiter/templates"
              className={buttonVariants({ size: "sm" })}
            >
              Gérer les templates →
            </Link>
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun template. Cliquez sur &quot;Gérer les templates&quot; pour
              en uploader un.
            </p>
          ) : (
            <ul className="space-y-2">
              {templates.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border/40 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.detected_placeholders.length} placeholder(s)
                    </p>
                  </div>
                  <Badge variant={t.is_valid ? "default" : "secondary"}>
                    {t.is_valid ? "Valide" : "Incomplet"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
