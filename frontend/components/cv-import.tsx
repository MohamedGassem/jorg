"use client";

// CvImport — upload a CV (PDF/DOCX/TXT) and pre-fill the candidate profile.
// The backend extracts contact details + ESCO skills and returns them as
// *suggestions*; nothing is persisted until the candidate confirms here.

import { useRef, useState } from "react";
import { Check, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CvSkillSuggestion {
  skill_ref_id: string;
  name: string;
  kind: string;
}

interface CvParseResult {
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  skills: CvSkillSuggestion[];
}

interface CvContactPrefill {
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
}

export function CvImport({
  onContactDetected,
}: {
  onContactDetected?: (contact: CvContactPrefill) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "adding">(
    "idle",
  );
  const [result, setResult] = useState<CvParseResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAdded(null);
    setResult(null);
    setStatus("parsing");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parsed = await api.upload<CvParseResult>(
        "/candidates/me/parse-cv",
        formData,
      );
      setResult(parsed);
      setSelected(new Set(parsed.skills.map((s) => s.skill_ref_id)));
      setStatus("ready");
      onContactDetected?.({
        email: parsed.email,
        phone: parsed.phone,
        linkedin_url: parsed.linkedin_url,
      });
    } catch (err) {
      setStatus("idle");
      setError(
        err instanceof ApiError
          ? err.detail
          : "Impossible de lire ce fichier. Réessayez avec un PDF, DOCX ou TXT.",
      );
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddSkills() {
    if (!result) return;
    setStatus("adding");
    setError(null);
    let count = 0;
    for (const skill of result.skills) {
      if (!selected.has(skill.skill_ref_id)) continue;
      try {
        await api.post("/candidates/me/skills", {
          skill_ref_id: skill.skill_ref_id,
        });
        count += 1;
      } catch (err) {
        // 409 = already on profile; ignore and keep going.
        if (!(err instanceof ApiError && err.status === 409)) {
          console.warn("Failed to add skill", skill.name, err);
        }
      }
    }
    setAdded(count);
    setStatus("ready");
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">
            Importer un CV pour gagner du temps
          </p>
          <p className="text-xs text-muted-foreground">
            Nous en extrayons vos coordonnées et vos compétences. Vous gardez le
            contrôle : rien n&apos;est ajouté sans votre confirmation.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={handleFile}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={status === "parsing" || status === "adding"}
        onClick={() => inputRef.current?.click()}
      >
        {status === "parsing" ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Analyse du CV…
          </>
        ) : (
          <>
            <Upload className="size-4" />
            Choisir un fichier
          </>
        )}
      </Button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && status !== "parsing" && (
        <div className="mt-4 space-y-3">
          {(result.email || result.phone || result.linkedin_url) && (
            <p className="text-xs text-muted-foreground">
              Coordonnées détectées et pré-remplies
              {result.email ? ` · ${result.email}` : ""}
              {result.phone ? ` · ${result.phone}` : ""}
            </p>
          )}

          {result.skills.length > 0 ? (
            <>
              <p className="text-sm font-medium text-foreground">
                {result.skills.length} compétence
                {result.skills.length > 1 ? "s" : ""} détectée
                {result.skills.length > 1 ? "s" : ""} — sélectionnez celles à
                ajouter
              </p>
              <div className="flex flex-wrap gap-2">
                {result.skills.map((skill) => {
                  const isSelected = selected.has(skill.skill_ref_id);
                  return (
                    <button
                      key={skill.skill_ref_id}
                      type="button"
                      onClick={() => toggle(skill.skill_ref_id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-border/80",
                      )}
                    >
                      {isSelected ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <X className="size-3" />
                      )}
                      {skill.name}
                    </button>
                  );
                })}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={status === "adding" || selected.size === 0}
                onClick={handleAddSkills}
              >
                {status === "adding" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Ajout…
                  </>
                ) : (
                  `Ajouter ${selected.size} compétence${selected.size > 1 ? "s" : ""}`
                )}
              </Button>
              {added !== null && (
                <p className="text-xs text-primary">
                  {added} compétence{added > 1 ? "s" : ""} ajoutée
                  {added > 1 ? "s" : ""} à votre profil.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune compétence reconnue automatiquement. Vous pourrez les
              ajouter manuellement.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
