// frontend/app/(recruiter)/templates/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { Organization, RecruiterProfile, Template } from "@/types/api";

function CreateOrgPrompt({ onCreated }: { onCreated: (orgId: string) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const org = await api.post<Organization>("/organizations", { name: name.trim() });
      await api.put("/recruiters/me/profile", { organization_id: org.id });
      onCreated(org.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur lors de la création");
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
            Votre compte n&apos;est pas encore associé à une organisation. Créez-en une pour
            commencer à gérer des templates et inviter des candidats.
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
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
  const [orgId, setOrgId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    api.get<RecruiterProfile>("/recruiters/me/profile")
      .then((p) => {
        setOrgId(p.organization_id);
        if (p.organization_id) {
          return api.get<Template[]>(`/organizations/${p.organization_id}/templates`);
        }
        return [];
      })
      .then(setTemplates)
      .catch((err) => setLoadError(err instanceof ApiError ? err.detail : "Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);

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
      const tmpl = await api.upload<Template>(`/organizations/${orgId}/templates`, fd);
      setTemplates((prev) => [...prev, tmpl]);
      setName("");
      form.reset();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.detail : "Erreur upload");
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (loadError) return <p role="alert" className="text-sm text-destructive">{loadError}</p>;
  if (!orgId) return <CreateOrgPrompt onCreated={setOrgId} />;

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold">Templates</h1>

      <Card>
        <CardHeader><CardTitle>Uploader un nouveau template</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tname">Nom du template</Label>
              <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Fichier Word (.docx)</Label>
              <Input id="file" name="file" type="file" accept=".docx" required />
            </div>
            {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}
            <Button type="submit" disabled={uploading}>
              {uploading ? "Upload…" : "Uploader"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <p className="text-muted-foreground">Aucun template. Uploadez-en un ci-dessus.</p>
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
                    {tmpl.detected_placeholders.length} placeholder(s) détecté(s)
                  </p>
                  <Link
                    href={`/recruiter/templates/${tmpl.id}`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
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
