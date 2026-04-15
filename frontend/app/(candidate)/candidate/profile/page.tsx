// frontend/app/(candidate)/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { CandidateProfile } from "@/types/api";

export default function ProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<CandidateProfile>("/candidates/me/profile").then(setProfile).catch(console.error);
  }, []);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const data = {
      first_name: form.get("first_name") as string || null,
      last_name: form.get("last_name") as string || null,
      title: form.get("title") as string || null,
      summary: form.get("summary") as string || null,
      phone: form.get("phone") as string || null,
      email_contact: form.get("email_contact") as string || null,
      linkedin_url: form.get("linkedin_url") as string || null,
      location: form.get("location") as string || null,
    };
    try {
      const updated = await api.put<CandidateProfile>("/candidates/me/profile", data);
      setProfile(updated);
      setMessage("Profil mis à jour");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  if (!profile) return <p className="text-muted-foreground">Chargement…</p>;

  const fields: Array<{ name: keyof CandidateProfile; label: string; type?: string }> = [
    { name: "first_name", label: "Prénom" },
    { name: "last_name", label: "Nom" },
    { name: "title", label: "Titre" },
    { name: "summary", label: "Résumé" },
    { name: "phone", label: "Téléphone", type: "tel" },
    { name: "email_contact", label: "Email de contact", type: "email" },
    { name: "linkedin_url", label: "LinkedIn URL", type: "url" },
    { name: "location", label: "Localisation" },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Mon profil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            {fields.map(({ name, label, type }) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={name}>{label}</Label>
                <Input
                  id={name}
                  name={name}
                  type={type ?? "text"}
                  defaultValue={(profile[name] as string | null) ?? ""}
                />
              </div>
            ))}
            {message && (
              <p role="status" className="text-sm text-muted-foreground">{message}</p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Sauvegarde…" : "Sauvegarder"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
