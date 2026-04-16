// frontend/app/(candidate)/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import type { CandidateProfile } from "@/types/api";

type FormFields = {
  first_name: string;
  last_name: string;
  title: string;
  summary: string;
  phone: string;
  email_contact: string;
  linkedin_url: string;
  location: string;
};

const FIELD_KEYS: Array<keyof FormFields> = [
  "first_name", "last_name", "title", "summary",
  "phone", "email_contact", "linkedin_url", "location",
];

function profileToForm(p: CandidateProfile): FormFields {
  return {
    first_name: p.first_name ?? "",
    last_name: p.last_name ?? "",
    title: p.title ?? "",
    summary: p.summary ?? "",
    phone: p.phone ?? "",
    email_contact: p.email_contact ?? "",
    linkedin_url: p.linkedin_url ?? "",
    location: p.location ?? "",
  };
}

const FIELD_META: Array<{ name: keyof FormFields; label: string; type?: string }> = [
  { name: "first_name", label: "Prénom" },
  { name: "last_name", label: "Nom" },
  { name: "title", label: "Titre" },
  { name: "summary", label: "Résumé" },
  { name: "phone", label: "Téléphone", type: "tel" },
  { name: "email_contact", label: "Email de contact", type: "email" },
  { name: "linkedin_url", label: "LinkedIn URL", type: "url" },
  { name: "location", label: "Localisation" },
];

export default function ProfilePage() {
  const [form, setForm] = useState<FormFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.get<CandidateProfile>("/candidates/me/profile")
      .then((p) => setForm(profileToForm(p)))
      .catch(console.error);
  }, []);

  function handleChange(name: keyof FormFields, value: string) {
    setForm((prev) => prev ? { ...prev, [name]: value } : prev);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    const data = Object.fromEntries(
      FIELD_KEYS.map((k) => [k, form[k] || null])
    );
    try {
      const updated = await api.put<CandidateProfile>("/candidates/me/profile", data);
      setForm(profileToForm(updated));
      setMessage("Profil mis à jour");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Mon profil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            {FIELD_META.map(({ name, label, type }) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={name}>{label}</Label>
                <Input
                  id={name}
                  type={type ?? "text"}
                  value={form[name]}
                  onChange={(e) => handleChange(name, e.target.value)}
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
