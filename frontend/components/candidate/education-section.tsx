// frontend/components/candidate/education-section.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCrudSection } from "@/lib/hooks/useCrudSection";
import {
  Textarea,
  SectionAddButton,
  ItemActions,
} from "@/components/candidate/profile-shared";
import type { Education } from "@/types/api";

// ---- Types & constants -------------------------------------------------------

type EduForm = {
  school: string;
  degree: string;
  field_of_study: string;
  start_date: string;
  end_date: string;
  description: string;
};

const EMPTY_EDU: EduForm = {
  school: "",
  degree: "",
  field_of_study: "",
  start_date: "",
  end_date: "",
  description: "",
};

function eduToForm(edu: Education): EduForm {
  return {
    school: edu.school,
    degree: edu.degree ?? "",
    field_of_study: edu.field_of_study ?? "",
    start_date: edu.start_date ?? "",
    end_date: edu.end_date ?? "",
    description: edu.description ?? "",
  };
}

// ---- Exported section --------------------------------------------------------

export function EducationSection() {
  const crud = useCrudSection<Education, EduForm>({
    endpoint: "/candidates/me/education",
    emptyForm: EMPTY_EDU,
    toForm: eduToForm,
    toBody: (f) => ({
      school: f.school,
      degree: f.degree || null,
      field_of_study: f.field_of_study || null,
      start_date: f.start_date || null,
      end_date: f.end_date || null,
      description: f.description || null,
    }),
    fetchErrorMsg: "Impossible de charger les formations",
  });
  const {
    items,
    form,
    saving,
    error,
    adding,
    editingId,
    loading,
    fetchError,
    setField,
    startEdit,
    startAdd,
    cancelForm,
    handleSubmit,
    handleDelete,
  } = crud;

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="edu-school">
          {"École / Établissement"} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="edu-school"
          value={form.school}
          onChange={(e) => setField("school", e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edu-degree">Diplôme</Label>
          <Input
            id="edu-degree"
            value={form.degree}
            onChange={(e) => setField("degree", e.target.value)}
            placeholder="ex: Master, Licence…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edu-field">{"Domaine d'études"}</Label>
          <Input
            id="edu-field"
            value={form.field_of_study}
            onChange={(e) => setField("field_of_study", e.target.value)}
            placeholder="ex: Informatique"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edu-start">Date début</Label>
          <Input
            id="edu-start"
            type="date"
            value={form.start_date}
            onChange={(e) => setField("start_date", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edu-end">Date fin</Label>
          <Input
            id="edu-end"
            type="date"
            value={form.end_date}
            onChange={(e) => setField("end_date", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edu-desc">Description</Label>
        <Textarea
          id="edu-desc"
          value={form.description}
          onChange={(v) => setField("description", v)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? "Sauvegarde…"
            : editingId
              ? "Enregistrer"
              : "Ajouter la formation"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
          Annuler
        </Button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Formation</CardTitle>
        <SectionAddButton
          adding={adding && !editingId}
          onToggle={() => {
            if (adding || editingId) {
              cancelForm();
            } else {
              startAdd();
            }
          }}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
        {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
        {!loading && !fetchError && items.length === 0 && !adding && (
          <EmptyState
            message="Aucune formation ajoutee."
            description="Ajoutez les diplomes ou parcours qui renforcent la lecture de votre dossier."
            className="px-4 py-4"
          />
        )}
        {items.map((edu) =>
          editingId === edu.id ? (
            <div key={edu.id}>{inlineForm}</div>
          ) : (
            <div
              key={edu.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{edu.school}</p>
                <p className="text-sm text-muted-foreground">
                  {[edu.degree, edu.field_of_study].filter(Boolean).join(" · ")}
                </p>
                {(edu.start_date || edu.end_date) && (
                  <p className="text-xs text-muted-foreground">
                    {edu.start_date ?? ""} → {edu.end_date ?? ""}
                  </p>
                )}
              </div>
              <ItemActions
                deleteLabel="Supprimer cette formation"
                onEdit={() => startEdit(edu)}
                onDelete={() => handleDelete(edu.id)}
              />
            </div>
          ),
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {adding && !editingId && inlineForm}
      </CardContent>
    </Card>
  );
}
