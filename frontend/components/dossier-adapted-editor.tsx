"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/Toggle";
import { api } from "@/lib/api";
import {
  buildRows,
  reorder,
  toSelectionPayload,
  type CompositionRow,
} from "@/lib/dossier-composition";
import { extractErrorMessage } from "@/lib/errors";
import { useDownload } from "@/lib/hooks";
import { downloadFilename } from "@/lib/labels";
import { templateChoiceBody, type TemplateChoice } from "@/lib/template-choice";
import { cn } from "@/lib/utils";
import type { BuiltinTemplate, GeneratedDocument, Template } from "@/types/api";
import type { GenerationTarget } from "@/components/dossier-generation-dialog";

export interface ExperiencePoolItem {
  id: string;
  role: string;
  client_name: string;
}

export interface SkillPoolItem {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: GenerationTarget;
  experiences: ExperiencePoolItem[];
  skills: SkillPoolItem[];
}

const MODEL_BADGES: Record<string, string> = {
  compact_esn: "Compact",
  dossier_technique: "Technique",
  profil_premium: "Complet",
};

function experienceLabel(items: ExperiencePoolItem[], id: string): string {
  const item = items.find((e) => e.id === id);
  return item ? `${item.role} - ${item.client_name}` : id;
}

interface RowControlsProps {
  label: string;
  row: CompositionRow;
  onToggleInclude: () => void;
  onToggleFeatured: () => void;
}

function SortableExperienceRow({
  label,
  row,
  onToggleInclude,
  onToggleFeatured,
}: RowControlsProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground"
        aria-label={`Déplacer ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <Checkbox
        checked={row.included}
        onCheckedChange={onToggleInclude}
        aria-label={`Inclure ${label}`}
      />
      <span
        className={cn(
          "flex-1 text-sm",
          row.included
            ? "text-foreground"
            : "text-muted-foreground line-through",
        )}
      >
        {label}
      </span>
      <Toggle
        checked={row.featured}
        onChange={onToggleFeatured}
        disabled={!row.included}
        label={`Mettre ${label} en avant`}
      />
    </div>
  );
}

export function DossierAdaptedEditor({
  open,
  onOpenChange,
  target,
  experiences,
  skills,
}: Props) {
  const [name, setName] = useState("");
  const [objectif, setObjectif] = useState("");
  const [accroche, setAccroche] = useState("");
  const [shareContact, setShareContact] = useState(true);
  const [shareFinances, setShareFinances] = useState(true);

  const [expRows, setExpRows] = useState<CompositionRow[]>(() =>
    buildRows(
      experiences.map((e) => e.id),
      [],
    ),
  );
  const [skillRows, setSkillRows] = useState<CompositionRow[]>(() =>
    buildRows(
      skills.map((s) => s.id),
      [],
    ),
  );

  const [builtinTemplates, setBuiltinTemplates] = useState<BuiltinTemplate[]>(
    [],
  );
  const [orgTemplates, setOrgTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [choice, setChoice] = useState<TemplateChoice | null>(null);
  const [format, setFormat] = useState<"docx" | "pdf">("docx");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { download, errors: downloadErrors } = useDownload();

  const orgId = target.kind === "recruiter" ? target.orgId : null;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([
      api.get<BuiltinTemplate[]>("/templates/builtin"),
      orgId
        ? api
            .get<Template[]>(`/organizations/${orgId}/templates`)
            .then((list) =>
              list.filter((t) => t.is_valid && t.status === "active"),
            )
        : Promise.resolve([] as Template[]),
    ])
      .then(([builtins, orgs]) => {
        setBuiltinTemplates(builtins);
        setOrgTemplates(orgs);
        setLoaded(true);
      })
      .catch((err) =>
        setError(extractErrorMessage(err, "Impossible de charger les modèles")),
      );
  }, [open, loaded, orgId]);

  function setExpInclude(id: string) {
    setExpRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, included: !r.included } : r)),
    );
  }
  function setExpFeatured(id: string) {
    setExpRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, featured: !r.featured } : r)),
    );
  }
  function setSkillFeatured(id: string) {
    setSkillRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, featured: !r.featured } : r)),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setExpRows((rows) => {
      const from = rows.findIndex((r) => r.id === active.id);
      const to = rows.findIndex((r) => r.id === over.id);
      if (from === -1 || to === -1) return rows;
      return reorder(rows, from, to);
    });
  }

  async function handleGenerate() {
    if (!choice) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const metadata = {
        name: name.trim() || null,
        objectif: objectif.trim() || null,
        accroche: accroche.trim() || null,
        share_contact: shareContact,
        share_finances: shareFinances,
      };
      const createBody =
        target.kind === "recruiter"
          ? {
              candidate_id: target.candidateId,
              organization_id: target.orgId,
              ...metadata,
            }
          : metadata;
      const dossier = await api.post<{ id: string }>("/dossiers", createBody);
      await api.put(
        `/dossiers/${dossier.id}/experiences`,
        toSelectionPayload(expRows, "experience_id"),
      );
      await api.put(
        `/dossiers/${dossier.id}/skills`,
        toSelectionPayload(skillRows, "candidate_skill_id"),
      );
      const doc = await api.post<GeneratedDocument>(
        `/dossiers/${dossier.id}/generate`,
        { ...templateChoiceBody(choice), format },
      );
      setResult(doc);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur de génération"));
    } finally {
      setGenerating(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
  }

  const includedExp = expRows.filter((r) => r.included);
  const featuredSkills = skillRows.filter((r) => r.featured);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {target.kind === "recruiter"
              ? `Créer une version adaptée - ${target.candidateName}`
              : "Créer une version adaptée"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dossier-name">Nom de la version</Label>
                <Input
                  id="dossier-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex. Version mission data"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dossier-objectif">Objectif</Label>
                <Input
                  id="dossier-objectif"
                  value={objectif}
                  onChange={(e) => setObjectif(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dossier-accroche">Accroche</Label>
                <Input
                  id="dossier-accroche"
                  value={accroche}
                  onChange={(e) => setAccroche(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  checked={shareContact}
                  onChange={setShareContact}
                  label="Partager les coordonnées"
                />
                <span className="text-sm">Partager les coordonnées</span>
              </div>
              <div className="flex items-center gap-3">
                <Toggle
                  checked={shareFinances}
                  onChange={setShareFinances}
                  label="Partager les informations financières"
                />
                <span className="text-sm">
                  Partager les informations financières
                </span>
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium">Expériences</p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={expRows.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {expRows.map((row) => (
                      <SortableExperienceRow
                        key={row.id}
                        row={row}
                        label={experienceLabel(experiences, row.id)}
                        onToggleInclude={() => setExpInclude(row.id)}
                        onToggleFeatured={() => setExpFeatured(row.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium">Compétences mises en avant</p>
              <div className="flex flex-wrap gap-2">
                {skillRows.map((row) => {
                  const label =
                    skills.find((s) => s.id === row.id)?.name ?? row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSkillFeatured(row.id)}
                      aria-pressed={row.featured}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        row.featured
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <p className="text-sm font-medium">Modèle de dossier</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {builtinTemplates.map((template) => {
                  const selected =
                    choice?.source === "jorg" && choice.key === template.key;
                  return (
                    <button
                      key={template.key}
                      type="button"
                      onClick={() =>
                        setChoice({ source: "jorg", key: template.key })
                      }
                      className={cn(
                        "rounded-lg border bg-surface p-3 text-left transition-colors",
                        selected
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{template.name}</p>
                        <Badge variant="primary-soft">
                          {MODEL_BADGES[template.key] ?? "Jorg"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    </button>
                  );
                })}
                {orgTemplates.map((template) => {
                  const selected =
                    choice?.source === "org" && choice.id === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() =>
                        setChoice({ source: "org", id: template.id })
                      }
                      className={cn(
                        "rounded-lg border bg-surface p-3 text-left transition-colors",
                        selected
                          ? "border-primary ring-2 ring-primary/20"
                          : "border-border",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{template.name}</p>
                        <Badge variant="secondary">Organisation</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                {(["docx", "pdf"] as const).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={format === option ? "default" : "outline"}
                    onClick={() => setFormat(option)}
                  >
                    {option === "docx" ? "Word (.docx)" : "PDF"}
                  </Button>
                ))}
              </div>
            </section>

            <ErrorAlert error={error} />

            {result ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-sm font-medium text-success">
                  Version adaptée générée avec succès.
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    download(
                      `/documents/${result.id}/download`,
                      downloadFilename(
                        [name || "version adaptee"],
                        result.file_format,
                      ),
                      result.id,
                    )
                  }
                >
                  Télécharger ({result.file_format.toUpperCase()})
                </Button>
                <ErrorAlert error={downloadErrors[result.id] ?? null} />
              </div>
            ) : (
              <Button onClick={handleGenerate} disabled={generating || !choice}>
                {generating
                  ? "Génération..."
                  : `Générer la version ${format.toUpperCase()}`}
              </Button>
            )}
          </div>

          <aside
            role="region"
            aria-label="Aperçu de la structure"
            className="space-y-3 rounded-lg border border-border bg-muted/10 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Aperçu
            </p>
            <p className="text-base font-semibold">
              {name || "Version sans titre"}
            </p>
            {objectif && <p className="text-sm">{objectif}</p>}
            {accroche && (
              <p className="text-sm text-muted-foreground">{accroche}</p>
            )}
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Expériences
              </p>
              {includedExp.map((row) => (
                <p
                  key={row.id}
                  className={cn(
                    "text-sm",
                    row.featured && "font-semibold text-primary",
                  )}
                >
                  {experienceLabel(experiences, row.id)}
                </p>
              ))}
            </div>
            {featuredSkills.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Compétences
                </p>
                <p className="text-sm">
                  {featuredSkills
                    .map((r) => skills.find((s) => s.id === r.id)?.name ?? r.id)
                    .join(", ")}
                </p>
              </div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
