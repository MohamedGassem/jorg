// frontend/app/(recruiter)/templates/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { RecruiterProfile, Template } from "@/types/api";

function isBlockMarker(placeholder: string): boolean {
  // Matches {{#NAME}} or {{/NAME}} — mustache-style control syntax handled
  // by the backend generator, not a user-mappable field.
  return /^\{\{[#/]/.test(placeholder);
}

const PROFILE_FIELDS = [
  { value: "first_name", label: "Prénom" },
  { value: "last_name", label: "Nom" },
  { value: "title", label: "Titre" },
  { value: "summary", label: "Résumé" },
  { value: "phone", label: "Téléphone" },
  { value: "email_contact", label: "Email contact" },
  { value: "location", label: "Localisation" },
  { value: "years_of_experience", label: "Années d'expérience" },
  { value: "daily_rate", label: "TJM" },
  { value: "annual_salary", label: "Salaire annuel" },
  { value: "experience.client_name", label: "Expérience — Client" },
  { value: "experience.role", label: "Expérience — Rôle" },
  { value: "experience.start_date", label: "Expérience — Début" },
  { value: "experience.end_date", label: "Expérience — Fin" },
  { value: "experience.description", label: "Expérience — Description" },
  { value: "experience.context", label: "Expérience — Contexte" },
  { value: "experience.achievements", label: "Expérience — Réalisations" },
  { value: "experience.technologies", label: "Expérience — Technologies" },
  { value: "availability_status", label: "Disponibilité" },
  { value: "work_mode", label: "Mode de travail" },
  { value: "location_preference", label: "Localisation préférée" },
  { value: "mission_duration", label: "Durée de mission souhaitée" },
];

export default function TemplateMappingPage() {
  const { id } = useParams<{ id: string }>();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RecruiterProfile>("/recruiters/me/profile")
      .then((p) => {
        setOrgId(p.organization_id);
        if (p.organization_id) {
          return api
            .get<Template>(
              `/organizations/${p.organization_id}/templates/${id}`,
            )
            .then((tmpl) => {
              setTemplate(tmpl);
              setMappings(tmpl.mappings as Record<string, string>);
            });
        }
      })
      .catch(console.error);
  }, [id]);

  async function handleSave() {
    if (!orgId || !template) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.put<Template>(
        `/organizations/${orgId}/templates/${template.id}/mappings`,
        { mappings, version: template.version },
      );
      setTemplate(updated);
      setMessage(
        updated.is_valid
          ? "Template valide et prêt !"
          : "Mappings sauvegardés. Tous les placeholders doivent être mappés.",
      );
    } catch (err) {
      setMessage(err instanceof ApiError ? err.detail : "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  if (!template) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Configurer : {template.name}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Mappings des placeholders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {template.detected_placeholders
            .filter((ph) => !isBlockMarker(ph))
            .map((ph) => (
              <div key={ph} className="space-y-2">
                <Label htmlFor={ph}>
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">
                    {ph}
                  </code>
                </Label>
                <Select
                  value={mappings[ph] ?? ""}
                  onValueChange={(val: string | null) =>
                    val && setMappings((prev) => ({ ...prev, [ph]: val }))
                  }
                >
                  <SelectTrigger id={ph}>
                    <SelectValue placeholder="Choisir un champ…" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFILE_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Sauvegarde…" : "Sauvegarder les mappings"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
