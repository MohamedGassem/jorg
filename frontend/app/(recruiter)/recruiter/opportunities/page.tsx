"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill } from "@/components/ui/StatusPill";
import { SkillChip } from "@/components/ui/SkillChip";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { OpportunityRead, SkillReference } from "@/types/api";

type SelectedSkill = { skill_ref_id: string; name: string };

export default function OpportunitiesPage() {
  const { orgId, loading, error: orgError } = useRecruiterOrg();
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillResults, setSkillResults] = useState<SkillReference[]>([]);

  useEffect(() => {
    if (!orgId) return;
    setOppsLoading(true);
    api
      .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
      .then(setOpportunities)
      .catch((err) => setError(extractErrorMessage(err, "Erreur")))
      .finally(() => setOppsLoading(false));
  }, [orgId]);

  useEffect(() => {
    const q = skillQuery.trim();
    if (q.length < 2) {
      setSkillResults([]);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      api
        .get<SkillReference[]>(
          `/skill-references/public?q=${encodeURIComponent(q)}`,
        )
        .then((res) => {
          if (active) setSkillResults(res);
        })
        .catch(() => {
          if (active) setSkillResults([]);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [skillQuery]);

  function addSkill(skill: SkillReference) {
    setSelectedSkills((prev) =>
      prev.some((s) => s.skill_ref_id === skill.id)
        ? prev
        : [...prev, { skill_ref_id: skill.id, name: skill.name }],
    );
    setSkillQuery("");
    setSkillResults([]);
  }

  function removeSkill(refId: string) {
    setSelectedSkills((prev) => prev.filter((s) => s.skill_ref_id !== refId));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      const opp = await api.post<OpportunityRead>(
        `/organizations/${orgId}/opportunities`,
        {
          title: title.trim(),
          description: description.trim() || null,
          skill_ref_ids: selectedSkills.map((s) => s.skill_ref_id),
        },
      );
      setOpportunities((prev) => [opp, ...prev]);
      setTitle("");
      setDescription("");
      setSelectedSkills([]);
      setSkillQuery("");
      setShowForm(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur"));
    } finally {
      setCreating(false);
    }
  }

  if (loading || oppsLoading) return <p className="text-ink-3">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-ink-3">
        Associez-vous à une organisation d&apos;abord.
      </p>
    );

  const openCount = opportunities.filter((o) => o.status === "open").length;

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="j-overline">
            {openCount} mission{openCount > 1 ? "s" : ""} ouverte
            {openCount > 1 ? "s" : ""}
          </p>
          <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
            Missions
          </h1>
          <p className="mt-1 max-w-[560px] text-[15px] text-ink-2">
            Regroupez les candidats autorisés autour d&apos;un besoin client
            pour préparer des dossiers adaptés à l&apos;opportunité.
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="w-fit">
          {showForm ? (
            "Annuler"
          ) : (
            <>
              <Plus className="size-4" strokeWidth={1.6} />
              Nouvelle mission
            </>
          )}
        </Button>
      </header>

      {showForm && (
        <section className="rounded-lg border border-line bg-surface px-[26px] py-[22px]">
          <form onSubmit={handleCreate} className="max-w-xl space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="opp-title" className="text-[13.5px] text-ink-2">
                Titre de la mission
              </Label>
              <Input
                id="opp-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="ex: Mission Data Engineer - Fintech"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opp-desc" className="text-[13.5px] text-ink-2">
                Contexte du besoin (optionnel)
              </Label>
              <textarea
                id="opp-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-md border border-line-2 bg-surface p-2 text-sm"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opp-skills" className="text-[13.5px] text-ink-2">
                Compétences requises
              </Label>
              {selectedSkills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSkills.map((s) => (
                    <SkillChip
                      key={s.skill_ref_id}
                      label={s.name}
                      onRemove={() => removeSkill(s.skill_ref_id)}
                    />
                  ))}
                </div>
              )}
              <div className="relative">
                <Input
                  id="opp-skills"
                  value={skillQuery}
                  onChange={(e) => setSkillQuery(e.target.value)}
                  placeholder="Rechercher une compétence…"
                  autoComplete="off"
                />
                {skillResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-md">
                    {skillResults.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => addSkill(r)}
                          className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-paper-2"
                        >
                          {r.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <ErrorAlert error={orgError ?? error} />
            <Button type="submit" disabled={creating || !title.trim()}>
              {creating ? "Création…" : "Créer la mission"}
            </Button>
          </form>
        </section>
      )}

      {!showForm && <ErrorAlert error={orgError ?? error} />}

      {opportunities.length === 0 ? (
        <section className="rounded-lg border border-dashed border-line-strong bg-paper-2 px-6 py-8 text-center">
          <p className="text-sm font-medium">Aucune mission ouverte</p>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-5 text-ink-3">
            Créez une mission pour regrouper des candidats autorisés et générer
            les dossiers adaptés au besoin client.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setShowForm(true)}>
            Créer une mission
          </Button>
        </section>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Mission", "Créée le", "Statut", ""].map((label, i) => (
                  <th key={i} className="j-th">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp) => {
                const closed = opp.status !== "open";
                return (
                  <tr
                    key={opp.id}
                    className={cn(
                      "relative border-b border-line last:border-b-0 hover:bg-paper-2",
                      closed && "opacity-55",
                    )}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-[11px]">
                        <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-line bg-paper-2 text-ink-3">
                          <BriefcaseBusiness
                            className="size-[15px]"
                            strokeWidth={1.6}
                          />
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/recruiter/opportunities/${opp.id}`}
                            className="text-sm font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {opp.title}
                          </Link>
                          {opp.description && (
                            <p className="line-clamp-1 text-xs text-ink-3">
                              {opp.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="j-meta text-[12.5px]">
                        {new Date(opp.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusPill tone={closed ? "muted" : "positive"}>
                        {closed ? "clôturée" : "ouverte"}
                      </StatusPill>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="whitespace-nowrap text-[13.5px] font-medium text-ink-3">
                        Voir
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
