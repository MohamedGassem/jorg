// frontend/app/(candidate)/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { CandidateProfile, ContractType } from "@/types/api";

type FormFields = {
  first_name: string;
  last_name: string;
  title: string;
  summary: string;
  phone: string;
  email_contact: string;
  linkedin_url: string;
  location: string;
  contract_type: ContractType;
  daily_rate: string;
  annual_salary: string;
};

const CONTRACT_OPTIONS: { value: ContractType; label: string }[] = [
  { value: "freelance", label: "Freelance (TJM)" },
  { value: "cdi", label: "CDI (salaire annuel)" },
  { value: "both", label: "Les deux" },
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
    contract_type: p.contract_type,
    daily_rate: p.daily_rate !== null ? String(p.daily_rate) : "",
    annual_salary: p.annual_salary !== null ? String(p.annual_salary) : "",
  };
}

function formToPayload(f: FormFields): Record<string, unknown> {
  const showDaily = f.contract_type === "freelance" || f.contract_type === "both";
  const showSalary = f.contract_type === "cdi" || f.contract_type === "both";
  return {
    first_name: f.first_name || null,
    last_name: f.last_name || null,
    title: f.title || null,
    summary: f.summary || null,
    phone: f.phone || null,
    email_contact: f.email_contact || null,
    linkedin_url: f.linkedin_url || null,
    location: f.location || null,
    contract_type: f.contract_type,
    daily_rate: showDaily && f.daily_rate ? Number(f.daily_rate) : null,
    annual_salary: showSalary && f.annual_salary ? Number(f.annual_salary) : null,
  };
}

export default function ProfilePage() {
  const [form, setForm] = useState<FormFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((p) => setForm(profileToForm(p)))
      .catch(console.error);
  }, []);

  function setField<K extends keyof FormFields>(k: K, v: FormFields[K]) {
    setForm((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        formToPayload(form)
      );
      setForm(profileToForm(updated));
      setMessage("Profil mis à jour");
    } catch (err) {
      setMessage(
        err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde"
      );
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <p className="text-muted-foreground">Chargement…</p>;

  const showDaily = form.contract_type === "freelance" || form.contract_type === "both";
  const showSalary = form.contract_type === "cdi" || form.contract_type === "both";

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Mon profil</h1>
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setField("first_name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setField("last_name", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Titre</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="summary">Résumé</Label>
              <Input
                id="summary"
                value={form.summary}
                onChange={(e) => setField("summary", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email_contact">Email de contact</Label>
                <Input
                  id="email_contact"
                  type="email"
                  value={form.email_contact}
                  onChange={(e) => setField("email_contact", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin_url">LinkedIn URL</Label>
              <Input
                id="linkedin_url"
                type="url"
                value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Localisation</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contract_type">Type de contrat recherché</Label>
              <Select
                value={form.contract_type}
                onValueChange={(v) => v && setField("contract_type", v as ContractType)}
              >
                <SelectTrigger id="contract_type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(showDaily || showSalary) && (
              <div className="grid grid-cols-2 gap-3">
                {showDaily && (
                  <div className="space-y-2">
                    <Label htmlFor="daily_rate">TJM (€)</Label>
                    <Input
                      id="daily_rate"
                      type="number"
                      min={0}
                      value={form.daily_rate}
                      onChange={(e) => setField("daily_rate", e.target.value)}
                    />
                  </div>
                )}
                {showSalary && (
                  <div className="space-y-2">
                    <Label htmlFor="annual_salary">Salaire annuel brut (€)</Label>
                    <Input
                      id="annual_salary"
                      type="number"
                      min={0}
                      value={form.annual_salary}
                      onChange={(e) => setField("annual_salary", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {message && (
              <p role="status" className="text-sm text-muted-foreground">
                {message}
              </p>
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
