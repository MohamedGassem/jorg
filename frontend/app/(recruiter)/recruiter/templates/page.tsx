// frontend/app/(recruiter)/templates/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type { Organization, Template } from "@/types/api";

function CreateOrgPrompt({
  onCreated,
}: {
  onCreated: (orgId: string) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const org = await api.post<Organization>("/organizations", {
        name: name.trim(),
      });
      await api.put("/recruiters/me/profile", { organization_id: org.id });
      onCreated(org.id);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur lors de la création"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Templates</h1>
      <Card>
        <CardHeader>
          <CardTitle>Créer votre organisation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Votre compte n&apos;est pas encore associé à une organisation.
            Créez-en une pour commencer à gérer des templates et inviter des
            candidats.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Nom de l&apos;organisation</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Acme Consulting"
                required
              />
            </div>
            <ErrorAlert error={error} />
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Création…" : "Créer et continuer"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TemplatesPage() {
  const {
    orgId: hookOrgId,
    loading: orgLoading,
    error: orgError,
  } = useRecruiterOrg();
  // Allow local override after org creation (so CreateOrgPrompt can set it immediately)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const orgId = createdOrgId ?? hookOrgId;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [tmplLoading, setTmplLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!orgId) return;
    setTmplLoading(true);
    api
      .get<Template[]>(`/organizations/${orgId}/templates`)
      .then(setTemplates)
      .catch((err) =>
        setLoadError(extractErrorMessage(err, "Erreur de chargement")),
      )
      .finally(() => setTmplLoading(false));
  }, [orgId]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file || !name.trim()) return;

    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("file", file);

    setUploading(true);
    setUploadError(null);
    try {
      const tmpl = await api.upload<Template>(
        `/organizations/${orgId}/templates`,
        fd,
      );
      setTemplates((prev) => [...prev, tmpl]);
      setName("");
      form.reset();
    } catch (err) {
      setUploadError(extractErrorMessage(err, "Erreur upload"));
    } finally {
      setUploading(false);
    }
  }

  if (orgLoading || tmplLoading)
    return <p className="text-muted-foreground">Chargement…</p>;
  if (loadError) return <ErrorAlert error={loadError} />;
  if (!orgId) return <CreateOrgPrompt onCreated={setCreatedOrgId} />;

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Templates</h1>
        <a
          href="/api/templates/sample"
          onClick={async (e) => {
            e.preventDefault();
            const { api } = await import("@/lib/api");
            await api.download(
              "/templates/sample",
              "jorg-sample-template.docx",
            );
          }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Télécharger un exemple
        </a>
      </div>

      <ErrorAlert error={orgError} />

      <Card>
        <CardHeader>
          <CardTitle>Uploader un nouveau template</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tname">Nom du template</Label>
              <Input
                id="tname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Fichier Word (.docx)</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".docx"
                required
              />
            </div>
            <ErrorAlert error={uploadError} />
            <Button type="submit" disabled={uploading}>
              {uploading ? "Upload…" : "Uploader"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <EmptyState message="Aucun template. Uploadez-en un ci-dessus." />
      ) : (
        <ul className="space-y-3" role="list">
          {templates.map((tmpl) => (
            <li key={tmpl.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{tmpl.name}</CardTitle>
                    <Badge variant={tmpl.is_valid ? "default" : "secondary"}>
                      {tmpl.is_valid ? "Valide" : "Incomplet"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {tmpl.detected_placeholders.length} placeholder(s)
                    détecté(s)
                  </p>
                  <Link
                    href={`/recruiter/templates/${tmpl.id}`}
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                  >
                    Configurer les mappings
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
