// frontend/components/candidate/language-section.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { useCrudSection } from "@/lib/hooks/useCrudSection";
import {
  LANGUAGE_LEVELS,
  SectionAddButton,
  ItemActions,
} from "@/components/candidate/profile-shared";
import type { Language, LanguageLevel, LanguageReference } from "@/types/api";

// ---- Types & constants -------------------------------------------------------

type LangForm = { name: string; level: LanguageLevel };
const EMPTY_LANG: LangForm = { name: "", level: "B2" };

// ---- Exported section --------------------------------------------------------

export function LanguageSection() {
  const crud = useCrudSection<Language, LangForm>({
    endpoint: "/candidates/me/languages",
    emptyForm: EMPTY_LANG,
    toForm: (lang) => ({ name: lang.name, level: lang.level }),
    toBody: (f) => ({ name: f.name, level: f.level }),
    fetchErrorMsg: "Impossible de charger les langues",
  });
  const {
    items,
    form,
    setForm,
    saving,
    error,
    adding,
    editingId,
    loading,
    fetchError,
    startEdit,
    startAdd,
    handleSubmit,
    handleDelete,
  } = crud;
  const [languageRefs, setLanguageRefs] = useState<LanguageReference[]>([]);
  const [searchingRefs, setSearchingRefs] = useState(false);

  useEffect(() => {
    const query = form.name.trim();
    if (query.length < 2) {
      setLanguageRefs([]);
      setSearchingRefs(false);
      return;
    }

    setSearchingRefs(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.get<LanguageReference[]>(
          `/candidates/language-references?q=${encodeURIComponent(query)}`,
        );
        setLanguageRefs(results.filter((ref) => ref.name !== form.name));
      } catch {
        setLanguageRefs([]);
      } finally {
        setSearchingRefs(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [form.name]);

  function cancelForm() {
    crud.cancelForm();
    setLanguageRefs([]);
  }

  function selectLanguageRef(ref: LanguageReference) {
    setForm((prev) => ({ ...prev, name: ref.name }));
    setLanguageRefs([]);
  }

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="relative space-y-1.5">
          <Label htmlFor="lang-name">
            Langue <span className="text-destructive">*</span>
          </Label>
          <Input
            id="lang-name"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="ex: Français, Anglais…"
            required
          />
          {(languageRefs.length > 0 || searchingRefs) && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-md">
              {languageRefs.map((ref) => (
                <button
                  key={ref.id}
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => selectLanguageRef(ref)}
                >
                  <span className="font-medium">{ref.name}</span>
                  {ref.aliases.length > 0 && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {ref.aliases.slice(0, 3).join(", ")}
                    </span>
                  )}
                </button>
              ))}
              {searchingRefs && languageRefs.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Recherche...
                </div>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lang-level">
            Niveau <span className="text-destructive">*</span>
          </Label>
          <Select
            value={form.level}
            onValueChange={(v) =>
              v && setForm((prev) => ({ ...prev, level: v as LanguageLevel }))
            }
          >
            <SelectTrigger id="lang-level" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_LEVELS.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? "Sauvegarde…"
            : editingId
              ? "Enregistrer"
              : "Ajouter la langue"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
          Annuler
        </Button>
      </div>
    </form>
  );

  return (
    <Card className="overflow-visible">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Langues</CardTitle>
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
            message="Aucune langue ajoutee."
            description="Ajoutez les langues utiles pour les missions et les dossiers presentes aux recruteurs."
            className="px-4 py-4"
          />
        )}
        {items.map((lang) =>
          editingId === lang.id ? (
            <div key={lang.id}>{inlineForm}</div>
          ) : (
            <div
              key={lang.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <div className="flex items-center gap-2.5">
                <p className="font-medium">{lang.name}</p>
                <Badge variant="secondary" className="text-xs">
                  {lang.level}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {
                    LANGUAGE_LEVELS.find(
                      (l) => l.value === lang.level,
                    )?.label.split(" — ")[1]
                  }
                </span>
              </div>
              <ItemActions
                deleteLabel="Supprimer cette langue"
                onEdit={() => startEdit(lang)}
                onDelete={() => handleDelete(lang.id)}
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
