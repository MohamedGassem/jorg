// frontend/app/(candidate)/candidate/skills/page.tsx
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
import type {
  Experience,
  Skill,
  Education,
  Certification,
  Language,
  SkillCategory,
  LanguageLevel,
} from "@/types/api";

// ---- shared helpers ----------------------------------------------------------

const SKILL_CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: "language", label: "Langage" },
  { value: "framework", label: "Framework" },
  { value: "database", label: "Base de données" },
  { value: "tool", label: "Outil" },
  { value: "methodology", label: "Méthodologie" },
  { value: "other", label: "Autre" },
];

const LANGUAGE_LEVELS: { value: LanguageLevel; label: string }[] = [
  { value: "A1", label: "A1 — Débutant" },
  { value: "A2", label: "A2 — Élémentaire" },
  { value: "B1", label: "B1 — Intermédiaire" },
  { value: "B2", label: "B2 — Indépendant" },
  { value: "C1", label: "C1 — Avancé" },
  { value: "C2", label: "C2 — Maîtrise" },
  { value: "native", label: "Langue maternelle" },
];

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error) return err.message;
  return fallback;
}

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function Textarea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  );
}

// ---- Experiences ------------------------------------------------------------

type ExpForm = {
  client_name: string;
  role: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  context: string;
  achievements: string;
  technologies: string;
};

const EMPTY_EXP: ExpForm = {
  client_name: "",
  role: "",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
  context: "",
  achievements: "",
  technologies: "",
};

function ExperienceSection() {
  const [items, setItems] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ExpForm>(EMPTY_EXP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Experience[]>("/candidates/me/experiences")
      .then(setItems)
      .catch((err) => setFetchError(errMsg(err, "Impossible de charger les expériences")))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof ExpForm>(k: K, v: ExpForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        client_name: form.client_name,
        role: form.role,
        start_date: form.start_date,
        end_date: form.is_current ? null : form.end_date || null,
        is_current: form.is_current,
        description: form.description || null,
        context: form.context || null,
        achievements: form.achievements || null,
        technologies: form.technologies
          ? form.technologies.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      };
      const created = await api.post<Experience>("/candidates/me/experiences", body);
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_EXP);
      setAdding(false);
    } catch (err) {
      setError(errMsg(err, "Erreur lors de l'ajout"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/experiences/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(errMsg(err, "Erreur lors de la suppression"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Expériences professionnelles</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { setAdding(!adding); setError(null); }}>
          {adding ? "Annuler" : "+ Ajouter"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Aucune expérience ajoutée.</p>
        )}
        {items.map((exp) => (
          <div key={exp.id} className="flex items-start justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="font-medium">{exp.role} — {exp.client_name}</p>
              <p className="text-sm text-muted-foreground">
                {exp.start_date} → {exp.is_current ? "présent" : (exp.end_date ?? "")}
              </p>
              {exp.technologies.length > 0 && (
                <p className="text-xs text-muted-foreground">{exp.technologies.join(", ")}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Supprimer cette expérience"
              onClick={() => handleDelete(exp.id)}
            >
              ✕
            </Button>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-md border p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="exp-client">Client *</Label>
                <Input id="exp-client" value={form.client_name} onChange={(e) => set("client_name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exp-role">Rôle *</Label>
                <Input id="exp-role" value={form.role} onChange={(e) => set("role", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="exp-start">Date début *</Label>
                <Input id="exp-start" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="exp-end">Date fin</Label>
                <Input id="exp-end" type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} disabled={form.is_current} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="exp-current"
                type="checkbox"
                checked={form.is_current}
                onChange={(e) => { set("is_current", e.target.checked); if (e.target.checked) set("end_date", ""); }}
                className="h-4 w-4 cursor-pointer"
              />
              <Label htmlFor="exp-current" className="cursor-pointer">Poste actuel</Label>
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-tech">Technologies (séparées par virgule)</Label>
              <Input id="exp-tech" value={form.technologies} onChange={(e) => set("technologies", e.target.value)} placeholder="React, TypeScript, Node.js" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-desc">Description</Label>
              <Textarea id="exp-desc" value={form.description} onChange={(v) => set("description", v)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-context">Contexte</Label>
              <Textarea id="exp-context" value={form.context} onChange={(v) => set("context", v)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="exp-achiev">Réalisations</Label>
              <Textarea id="exp-achiev" value={form.achievements} onChange={(v) => set("achievements", v)} />
            </div>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Ajout…" : "Ajouter"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Skills -----------------------------------------------------------------

type SkillForm = {
  name: string;
  category: SkillCategory;
  level: string;
  years_of_experience: string;
};

const EMPTY_SKILL: SkillForm = { name: "", category: "language", level: "", years_of_experience: "" };

function SkillSection() {
  const [items, setItems] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<SkillForm>(EMPTY_SKILL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Skill[]>("/candidates/me/skills")
      .then(setItems)
      .catch((err) => setFetchError(errMsg(err, "Impossible de charger les compétences")))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof SkillForm>(k: K, v: SkillForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        category: form.category,
        level: form.level || null,
        years_of_experience: form.years_of_experience ? Number(form.years_of_experience) : null,
      };
      const created = await api.post<Skill>("/candidates/me/skills", body);
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_SKILL);
      setAdding(false);
    } catch (err) {
      setError(errMsg(err, "Erreur lors de l'ajout"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/skills/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(errMsg(err, "Erreur lors de la suppression"));
    }
  }

  const categoryLabel = (cat: SkillCategory) =>
    SKILL_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Compétences techniques</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { setAdding(!adding); setError(null); }}>
          {adding ? "Annuler" : "+ Ajouter"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Aucune compétence ajoutée.</p>
        )}
        {items.map((skill) => (
          <div key={skill.id} className="flex items-start justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="font-medium">{skill.name}</p>
              <p className="text-sm text-muted-foreground">
                {categoryLabel(skill.category)}
                {skill.level ? ` · ${skill.level}` : ""}
                {skill.years_of_experience ? ` · ${skill.years_of_experience} an(s)` : ""}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Supprimer cette compétence"
              onClick={() => handleDelete(skill.id)}
            >
              ✕
            </Button>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-md border p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="skill-name">Nom *</Label>
                <Input id="skill-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="skill-cat">Catégorie *</Label>
                <Select value={form.category} onValueChange={(v) => v && set("category", v as SkillCategory)}>
                  <SelectTrigger id="skill-cat" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SKILL_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="skill-level">Niveau</Label>
                <Input id="skill-level" value={form.level} onChange={(e) => set("level", e.target.value)} placeholder="ex: Senior, Expert…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="skill-years">{"Années d'expérience"}</Label>
                <Input id="skill-years" type="number" min={0} value={form.years_of_experience} onChange={(e) => set("years_of_experience", e.target.value)} />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Ajout…" : "Ajouter"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Education --------------------------------------------------------------

type EduForm = {
  school: string;
  degree: string;
  field_of_study: string;
  start_date: string;
  end_date: string;
  description: string;
};

const EMPTY_EDU: EduForm = { school: "", degree: "", field_of_study: "", start_date: "", end_date: "", description: "" };

function EducationSection() {
  const [items, setItems] = useState<Education[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<EduForm>(EMPTY_EDU);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Education[]>("/candidates/me/education")
      .then(setItems)
      .catch((err) => setFetchError(errMsg(err, "Impossible de charger les formations")))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof EduForm>(k: K, v: EduForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        school: form.school,
        degree: form.degree || null,
        field_of_study: form.field_of_study || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        description: form.description || null,
      };
      const created = await api.post<Education>("/candidates/me/education", body);
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_EDU);
      setAdding(false);
    } catch (err) {
      setError(errMsg(err, "Erreur lors de l'ajout"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/education/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(errMsg(err, "Erreur lors de la suppression"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Formation</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { setAdding(!adding); setError(null); }}>
          {adding ? "Annuler" : "+ Ajouter"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Aucune formation ajoutée.</p>
        )}
        {items.map((edu) => (
          <div key={edu.id} className="flex items-start justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="font-medium">{edu.school}</p>
              <p className="text-sm text-muted-foreground">
                {[edu.degree, edu.field_of_study].filter(Boolean).join(" · ")}
              </p>
              {(edu.start_date || edu.end_date) && (
                <p className="text-xs text-muted-foreground">{edu.start_date ?? ""} → {edu.end_date ?? ""}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Supprimer cette formation"
              onClick={() => handleDelete(edu.id)}
            >
              ✕
            </Button>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-md border p-4">
            <div className="space-y-1">
              <Label htmlFor="edu-school">{"École / Établissement *"}</Label>
              <Input id="edu-school" value={form.school} onChange={(e) => set("school", e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edu-degree">Diplôme</Label>
                <Input id="edu-degree" value={form.degree} onChange={(e) => set("degree", e.target.value)} placeholder="ex: Master, Licence…" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edu-field">{"Domaine d'études"}</Label>
                <Input id="edu-field" value={form.field_of_study} onChange={(e) => set("field_of_study", e.target.value)} placeholder="ex: Informatique" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="edu-start">Date début</Label>
                <Input id="edu-start" type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edu-end">Date fin</Label>
                <Input id="edu-end" type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edu-desc">Description</Label>
              <Textarea id="edu-desc" value={form.description} onChange={(v) => set("description", v)} />
            </div>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Ajout…" : "Ajouter"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Certifications ---------------------------------------------------------

type CertForm = {
  name: string;
  issuer: string;
  issue_date: string;
  expiry_date: string;
  credential_url: string;
};

const EMPTY_CERT: CertForm = { name: "", issuer: "", issue_date: "", expiry_date: "", credential_url: "" };

function CertificationSection() {
  const [items, setItems] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CertForm>(EMPTY_CERT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Certification[]>("/candidates/me/certifications")
      .then(setItems)
      .catch((err) => setFetchError(errMsg(err, "Impossible de charger les certifications")))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof CertForm>(k: K, v: CertForm[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        issuer: form.issuer,
        issue_date: form.issue_date,
        expiry_date: form.expiry_date || null,
        credential_url: form.credential_url || null,
      };
      const created = await api.post<Certification>("/candidates/me/certifications", body);
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_CERT);
      setAdding(false);
    } catch (err) {
      setError(errMsg(err, "Erreur lors de l'ajout"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/certifications/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(errMsg(err, "Erreur lors de la suppression"));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Certifications</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { setAdding(!adding); setError(null); }}>
          {adding ? "Annuler" : "+ Ajouter"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Aucune certification ajoutée.</p>
        )}
        {items.map((cert) => (
          <div key={cert.id} className="flex items-start justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <p className="font-medium">{cert.name}</p>
              <p className="text-sm text-muted-foreground">
                {cert.issuer} · {cert.issue_date}
                {cert.expiry_date ? ` → ${cert.expiry_date}` : ""}
              </p>
              {safeUrl(cert.credential_url) && (
                <a href={safeUrl(cert.credential_url)!} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  Voir le certificat
                </a>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Supprimer cette certification"
              onClick={() => handleDelete(cert.id)}
            >
              ✕
            </Button>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-md border p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cert-name">Nom *</Label>
                <Input id="cert-name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cert-issuer">Organisme *</Label>
                <Input id="cert-issuer" value={form.issuer} onChange={(e) => set("issuer", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cert-issue">{"Date d'obtention *"}</Label>
                <Input id="cert-issue" type="date" value={form.issue_date} onChange={(e) => set("issue_date", e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cert-expiry">{"Date d'expiration"}</Label>
                <Input id="cert-expiry" type="date" value={form.expiry_date} onChange={(e) => set("expiry_date", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cert-url">URL du certificat</Label>
              <Input id="cert-url" type="url" value={form.credential_url} onChange={(e) => set("credential_url", e.target.value)} placeholder="https://…" />
            </div>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Ajout…" : "Ajouter"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Languages --------------------------------------------------------------

type LangForm = { name: string; level: LanguageLevel };
const EMPTY_LANG: LangForm = { name: "", level: "B2" };

function LanguageSection() {
  const [items, setItems] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<LangForm>(EMPTY_LANG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Language[]>("/candidates/me/languages")
      .then(setItems)
      .catch((err) => setFetchError(errMsg(err, "Impossible de charger les langues")))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<Language>("/candidates/me/languages", form);
      setItems((prev) => [...prev, created]);
      setForm(EMPTY_LANG);
      setAdding(false);
    } catch (err) {
      setError(errMsg(err, "Erreur lors de l'ajout"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/candidates/me/languages/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(errMsg(err, "Erreur lors de la suppression"));
    }
  }

  const levelLabel = (lv: LanguageLevel) =>
    LANGUAGE_LEVELS.find((l) => l.value === lv)?.label ?? lv;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Langues</CardTitle>
        <Button variant="outline" size="sm" onClick={() => { setAdding(!adding); setError(null); }}>
          {adding ? "Annuler" : "+ Ajouter"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Aucune langue ajoutée.</p>
        )}
        {items.map((lang) => (
          <div key={lang.id} className="flex items-center justify-between rounded-md border p-3">
            <p className="font-medium">
              {lang.name}{" "}
              <span className="text-sm font-normal text-muted-foreground">— {levelLabel(lang.level)}</span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Supprimer cette langue"
              onClick={() => handleDelete(lang.id)}
            >
              ✕
            </Button>
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && (
          <form onSubmit={handleAdd} className="space-y-3 rounded-md border p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lang-name">Langue *</Label>
                <Input
                  id="lang-name"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="ex: Français, Anglais…"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lang-level">Niveau *</Label>
                <Select value={form.level} onValueChange={(v) => v && setForm((prev) => ({ ...prev, level: v as LanguageLevel }))}>
                  <SelectTrigger id="lang-level" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Ajout…" : "Ajouter"}</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Page -------------------------------------------------------------------

export default function SkillsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Profil de compétences</h1>
      <ExperienceSection />
      <SkillSection />
      <EducationSection />
      <CertificationSection />
      <LanguageSection />
    </div>
  );
}
