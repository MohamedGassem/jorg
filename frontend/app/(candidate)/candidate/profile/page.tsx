// frontend/app/(candidate)/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import { VALID_DOMAINS, type AvailabilityStatus, type CandidateProfile, type ContractType, type MissionDuration, type WorkMode } from "@/types/api";

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
  const [availabilityStatus, setAvailabilityStatus] = useState<AvailabilityStatus>("not_available");
  const [availabilityDate, setAvailabilityDate] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode | "">("");
  const [locationPreference, setLocationPreference] = useState("");
  const [preferredDomains, setPreferredDomains] = useState<string[]>([]);
  const [missionDuration, setMissionDuration] = useState<MissionDuration | "">("");

  useEffect(() => {
    api
      .get<CandidateProfile>("/candidates/me/profile")
      .then((p) => {
        setForm(profileToForm(p));
        setAvailabilityStatus(p.availability_status ?? "not_available");
        setAvailabilityDate(p.availability_date ?? "");
        setWorkMode(p.work_mode ?? "");
        setLocationPreference(p.location_preference ?? "");
        setPreferredDomains(p.preferred_domains ?? []);
        setMissionDuration(p.mission_duration ?? "");
      })
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
        {
          ...formToPayload(form),
          availability_status: availabilityStatus,
          availability_date: availabilityStatus === "available_from" ? availabilityDate || null : null,
          work_mode: workMode || null,
          location_preference: locationPreference || null,
          preferred_domains: preferredDomains.length > 0 ? preferredDomains : null,
          mission_duration: missionDuration || null,
        }
      );
      setForm(profileToForm(updated));
      setAvailabilityStatus(updated.availability_status ?? "not_available");
      setAvailabilityDate(updated.availability_date ?? "");
      setWorkMode(updated.work_mode ?? "");
      setLocationPreference(updated.location_preference ?? "");
      setPreferredDomains(updated.preferred_domains ?? []);
      setMissionDuration(updated.mission_duration ?? "");
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
      <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Informations personnelles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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

          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Disponibilité &amp; préférences mission</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Disponibilité</Label>
            <RadioGroup value={availabilityStatus} onValueChange={(v) => setAvailabilityStatus(v as AvailabilityStatus)} className="flex flex-col gap-2">
              <div className="flex items-center gap-2"><RadioGroupItem value="available_now" id="av-now" /><Label htmlFor="av-now">Disponible maintenant</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="available_from" id="av-from" /><Label htmlFor="av-from">Disponible à partir du</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="not_available" id="av-no" /><Label htmlFor="av-no">Non disponible</Label></div>
            </RadioGroup>
            {availabilityStatus === "available_from" && (
              <Input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} required />
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="work-mode">Mode de travail</Label>
            <Select value={workMode} onValueChange={(v) => setWorkMode(v as WorkMode)}>
              <SelectTrigger id="work-mode"><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Télétravail</SelectItem>
                <SelectItem value="onsite">Présentiel</SelectItem>
                <SelectItem value="hybrid">Hybride</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location-pref">Localisation préférée</Label>
            <Input id="location-pref" value={locationPreference} onChange={(e) => setLocationPreference(e.target.value)} placeholder="ex: Paris, Lyon" />
          </div>
          <div className="space-y-2">
            <Label>Domaines métier</Label>
            <div className="grid grid-cols-3 gap-2">
              {VALID_DOMAINS.map((domain) => (
                <div key={domain} className="flex items-center gap-2">
                  <Checkbox id={`domain-${domain}`} checked={preferredDomains.includes(domain)} onCheckedChange={(checked) => { setPreferredDomains((prev) => checked ? [...prev, domain] : prev.filter((d) => d !== domain)); }} />
                  <Label htmlFor={`domain-${domain}`} className="capitalize">{domain}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mission-dur">Durée de mission souhaitée</Label>
            <Select value={missionDuration} onValueChange={(v) => setMissionDuration(v as MissionDuration)}>
              <SelectTrigger id="mission-dur"><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Court terme (&lt; 3 mois)</SelectItem>
                <SelectItem value="medium">Moyen terme (3–6 mois)</SelectItem>
                <SelectItem value="long">Long terme (6 mois+)</SelectItem>
                <SelectItem value="permanent">CDI / Permanent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <Button type="submit" disabled={saving}>
        {saving ? "Sauvegarde…" : "Sauvegarder"}
      </Button>
      </form>
    </div>
  );
}
