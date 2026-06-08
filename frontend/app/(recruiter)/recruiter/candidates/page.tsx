"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { InviteCandidateDialog } from "@/components/invite-candidate-dialog";
import { GenerateDossierDialog } from "@/components/generate-dossier-dialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import {
  INVITATION_STATUS_LABELS,
  INVITATION_STATUS_VARIANTS,
} from "@/lib/labels";
import type {
  AccessibleCandidateRead,
  BuiltinTemplate,
  Invitation,
  OpportunityRead,
  Template,
} from "@/types/api";
import { VALID_DOMAINS } from "@/types/api";

const EMPTY_FILTERS = {
  availability_status: "",
  work_mode: "",
  contract_type: "",
  max_daily_rate: "",
  skill: "",
  location: "",
  domain: "",
  q: "",
};

function CandidateExperiencePanel({
  candidate,
  activeSkillRefId,
  activeSkillName,
  onClose,
}: {
  candidate: AccessibleCandidateRead;
  activeSkillRefId: string | null;
  activeSkillName: string | null;
  onClose: () => void;
}) {
  const [focusOnly, setFocusOnly] = useState(false);

  const totalCount = activeSkillRefId
    ? candidate.experiences
        .flatMap((e) => e.achievements)
        .filter((a) =>
          a.skill_tags.some((t) => t.skill_ref_id === activeSkillRefId),
        ).length
    : 0;

  const matchingExpCount = activeSkillRefId
    ? candidate.experiences.filter((exp) =>
        exp.achievements.some((ach) =>
          ach.skill_tags.some((t) => t.skill_ref_id === activeSkillRefId),
        ),
      ).length
    : 0;

  return (
    <div className="mt-3 rounded-lg border border-border/40 bg-muted/5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        {activeSkillRefId ? (
          <p className="text-xs font-medium text-primary">
            {activeSkillName} ·{" "}
            <span className="font-normal text-muted-foreground">
              {totalCount} réalisation{totalCount > 1 ? "s" : ""} dans{" "}
              {matchingExpCount} expérience{matchingExpCount > 1 ? "s" : ""}
            </span>
          </p>
        ) : (
          <p className="text-xs font-medium text-foreground">Expériences</p>
        )}
        <div className="flex items-center gap-3">
          {activeSkillRefId && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={focusOnly}
                onChange={(e) => setFocusOnly(e.target.checked)}
                className="accent-primary"
              />
              Liées uniquement
            </label>
          )}
          <button
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Experience list */}
      <div className="space-y-2 p-3">
        {candidate.experiences.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            Aucune expérience renseignée.
          </p>
        )}
        {candidate.experiences.map((exp) => {
          const relevantAchs = activeSkillRefId
            ? exp.achievements.filter((a) =>
                a.skill_tags.some((t) => t.skill_ref_id === activeSkillRefId),
              )
            : exp.achievements;

          if (focusOnly && activeSkillRefId && relevantAchs.length === 0)
            return null;

          return (
            <div key={exp.id} className="rounded-md bg-background/60 px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {exp.client_name} — {exp.role}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {exp.start_date}
                  {exp.end_date
                    ? ` → ${exp.end_date}`
                    : exp.is_current
                      ? " → présent"
                      : ""}
                </span>
              </div>
              {exp.achievements.length === 0 ? (
                <p className="text-[11px] italic text-muted-foreground">
                  Aucune réalisation.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {exp.achievements.map((ach) => {
                    const isMatch = activeSkillRefId
                      ? ach.skill_tags.some(
                          (t) => t.skill_ref_id === activeSkillRefId,
                        )
                      : true;
                    if (focusOnly && activeSkillRefId && !isMatch) return null;
                    return (
                      <div
                        key={ach.id}
                        className={`flex items-start gap-1.5 rounded px-1.5 py-1 ${
                          activeSkillRefId
                            ? isMatch
                              ? "bg-primary/10"
                              : "opacity-40"
                            : ""
                        }`}
                      >
                        <span
                          className={`mt-0.5 text-xs ${activeSkillRefId && isMatch ? "text-primary" : "text-muted-foreground"}`}
                        >
                          •
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-xs ${activeSkillRefId && isMatch ? "font-medium text-foreground" : "text-muted-foreground"}`}
                          >
                            {ach.description}
                          </p>
                          {ach.impact &&
                            (activeSkillRefId ? isMatch : true) && (
                              <p className="text-[10px] italic text-muted-foreground">
                                {ach.impact}
                              </p>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  const { orgId, loading, error } = useRecruiterOrg();
  const [candidates, setCandidates] = useState<AccessibleCandidateRead[]>([]);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addFeedback, setAddFeedback] = useState<Record<string, string>>({});
  const [activeSkillFilter, setActiveSkillFilter] = useState<{
    candidateId: string;
    skillRefId: string;
    skillName: string;
  } | null>(null);
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(
    new Set(),
  );
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showInvitations, setShowInvitations] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [generateFor, setGenerateFor] = useState<{
    candidateId: string;
    candidateName: string;
  } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [builtinTemplates, setBuiltinTemplates] = useState<BuiltinTemplate[]>(
    [],
  );

  function toggleCandidateExpand(userId: string) {
    setExpandedCandidates((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  const fetchCandidates = useCallback(
    async (currentOrgId: string, currentFilters: typeof EMPTY_FILTERS) => {
      const params = new URLSearchParams();
      Object.entries(currentFilters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      const qs = params.toString();
      const url = `/organizations/${currentOrgId}/candidates${qs ? `?${qs}` : ""}`;
      try {
        const data = await api.get<AccessibleCandidateRead[]>(url);
        setCandidates(data);
      } catch (err) {
        setCandidatesError(extractErrorMessage(err, "Erreur de chargement"));
      }
    },
    [],
  );

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      fetchCandidates(orgId, EMPTY_FILTERS),
      api
        .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
        .then((opps) =>
          setOpportunities(opps.filter((o) => o.status === "open")),
        )
        .catch(() => {}),
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then(setTemplates)
        .catch(() => {}),
      api
        .get<BuiltinTemplate[]>("/templates/builtin")
        .then(setBuiltinTemplates)
        .catch(() => {}),
      api
        .get<Invitation[]>(`/organizations/${orgId}/invitations`)
        .then(setInvitations)
        .catch(() => {}),
    ]);
  }, [orgId, fetchCandidates]);

  function handleFilterChange(
    key: keyof typeof EMPTY_FILTERS,
    value: string | null,
  ) {
    value = value ?? "";
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (!orgId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const isText = ["skill", "location", "q"].includes(key);
    if (isText) {
      debounceRef.current = setTimeout(() => fetchCandidates(orgId, next), 300);
    } else {
      fetchCandidates(orgId, next);
    }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    if (orgId) fetchCandidates(orgId, EMPTY_FILTERS);
  }

  async function handleAddToOpportunity(candidateId: string, oppId: string) {
    if (!orgId) return;
    setAddingTo(oppId);
    try {
      await api.post(
        `/organizations/${orgId}/opportunities/${oppId}/candidates`,
        {
          candidate_id: candidateId,
        },
      );
      setAddFeedback((prev) => ({
        ...prev,
        [candidateId]: "Candidat ajouté ✓",
      }));
      setPickingFor(null);
    } catch (err) {
      setAddFeedback((prev) => ({
        ...prev,
        [candidateId]: extractErrorMessage(err, "Erreur"),
      }));
    } finally {
      setAddingTo(null);
    }
  }

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez-vous à une organisation d&apos;abord.
      </p>
    );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Candidats autorisés</h1>
        <Button onClick={() => setInviteOpen(true)}>Inviter un candidat</Button>
      </div>

      <InviteCandidateDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        orgId={orgId}
      />

      {generateFor && (
        <GenerateDossierDialog
          open={!!generateFor}
          onOpenChange={(open) => {
            if (!open) setGenerateFor(null);
          }}
          orgId={orgId}
          candidateId={generateFor.candidateId}
          candidateName={generateFor.candidateName}
          templates={templates}
          builtinTemplates={builtinTemplates}
        />
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1">
              <Label>Disponibilité</Label>
              <Select
                value={filters.availability_status}
                onValueChange={(v) =>
                  handleFilterChange("availability_status", v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Toutes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Toutes</SelectItem>
                  <SelectItem value="available_now">
                    Disponible maintenant
                  </SelectItem>
                  <SelectItem value="available_from">
                    Disponible prochainement
                  </SelectItem>
                  <SelectItem value="not_available">Non disponible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mode de travail</Label>
              <Select
                value={filters.work_mode}
                onValueChange={(v) => handleFilterChange("work_mode", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="remote">Télétravail</SelectItem>
                  <SelectItem value="onsite">Présentiel</SelectItem>
                  <SelectItem value="hybrid">Hybride</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Contrat</Label>
              <Select
                value={filters.contract_type}
                onValueChange={(v) => handleFilterChange("contract_type", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="freelance">Freelance</SelectItem>
                  <SelectItem value="cdi">CDI</SelectItem>
                  <SelectItem value="both">Les deux</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>TJM max (€/j)</Label>
              <Input
                type="number"
                placeholder="ex: 800"
                value={filters.max_daily_rate}
                onChange={(e) =>
                  handleFilterChange("max_daily_rate", e.target.value)
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Compétence</Label>
              <Input
                placeholder="ex: Python"
                value={filters.skill}
                onChange={(e) => handleFilterChange("skill", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Localisation</Label>
              <Input
                placeholder="ex: Paris"
                value={filters.location}
                onChange={(e) => handleFilterChange("location", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Domaine</Label>
              <Select
                value={filters.domain}
                onValueChange={(v) => handleFilterChange("domain", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  {VALID_DOMAINS.map((d) => (
                    <SelectItem key={d} value={d} className="capitalize">
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Recherche libre</Label>
              <Input
                placeholder="titre, résumé…"
                value={filters.q}
                onChange={(e) => handleFilterChange("q", e.target.value)}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {candidates.length} candidat{candidates.length > 1 ? "s" : ""}
            </span>
            <Button variant="outline" size="sm" onClick={resetFilters}>
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sent invitations collapsible */}
      {invitations.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowInvitations((v) => !v)}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Invitations envoyées ({invitations.length})
            {invitations.filter((i) => i.status === "pending").length > 0 &&
              ` · ${invitations.filter((i) => i.status === "pending").length} en attente`}
          </button>
          {showInvitations && (
            <ul className="mt-2 space-y-1">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between rounded border border-border/40 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">
                    {inv.candidate_email}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                    </span>
                    <StatusBadge
                      status={inv.status}
                      labels={INVITATION_STATUS_LABELS}
                      variants={INVITATION_STATUS_VARIANTS}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ErrorAlert error={error ?? candidatesError} />
      {candidates.length === 0 ? (
        <EmptyState
          message="Aucun candidat autorisé ne correspond à cette recherche."
          description="Essayez d'élargir les filtres ou invitez un candidat pour obtenir son accord d'accès."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                Inviter un candidat
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="space-y-3" role="list">
          {candidates.map((c) => {
            const isActive = activeSkillFilter?.candidateId === c.user_id;

            // Collect unique skills from all experiences
            const skillMap = new Map<string, string>();
            for (const exp of c.experiences) {
              for (const u of exp.skill_usages) {
                if (!skillMap.has(u.skill_ref_id)) {
                  skillMap.set(u.skill_ref_id, u.skill_ref.name);
                }
              }
            }
            const expSkills = Array.from(skillMap.entries()).map(
              ([id, name]) => ({
                id,
                name,
              }),
            );

            return (
              <li key={c.user_id}>
                <Card>
                  <CardHeader className="pb-1">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">
                        {c.first_name && c.last_name
                          ? `${c.first_name} ${c.last_name}`
                          : c.email}
                      </CardTitle>
                      {c.experiences.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleCandidateExpand(c.user_id)}
                          className="ml-2 mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {expandedCandidates.has(c.user_id) ? (
                            <>
                              <ChevronUp className="size-3.5" /> Réduire
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3.5" /> Expériences (
                              {c.experiences.length})
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {c.title && <p>{c.title}</p>}
                    <div className="flex flex-wrap gap-3">
                      {c.daily_rate && <span>TJM : {c.daily_rate} €/j</span>}
                      {c.availability_status && (
                        <span>Dispo : {c.availability_status}</span>
                      )}
                      {c.work_mode && <span>{c.work_mode}</span>}
                    </div>

                    {expSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {expSkills.map((sk) => {
                          const active =
                            isActive && activeSkillFilter?.skillRefId === sk.id;
                          return (
                            <button
                              key={sk.id}
                              type="button"
                              onClick={() => {
                                if (active) {
                                  setActiveSkillFilter(null);
                                } else {
                                  setActiveSkillFilter({
                                    candidateId: c.user_id,
                                    skillRefId: sk.id,
                                    skillName: sk.name,
                                  });
                                }
                              }}
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                active
                                  ? "border-primary/50 bg-primary/10 text-primary"
                                  : "border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                              }`}
                            >
                              {sk.name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {(expandedCandidates.has(c.user_id) || isActive) && (
                      <CandidateExperiencePanel
                        candidate={c}
                        activeSkillRefId={
                          isActive && activeSkillFilter
                            ? activeSkillFilter.skillRefId
                            : null
                        }
                        activeSkillName={
                          isActive && activeSkillFilter
                            ? activeSkillFilter.skillName
                            : null
                        }
                        onClose={() => {
                          setActiveSkillFilter(null);
                          setExpandedCandidates((prev) => {
                            const next = new Set(prev);
                            next.delete(c.user_id);
                            return next;
                          });
                        }}
                      />
                    )}

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setGenerateFor({
                            candidateId: c.user_id,
                            candidateName:
                              c.first_name && c.last_name
                                ? `${c.first_name} ${c.last_name}`
                                : c.email,
                          })
                        }
                      >
                        Générer un dossier
                      </Button>
                      <Link href={`/recruiter/candidates/${c.user_id}`}>
                        <Button size="sm" variant="ghost">
                          Voir le profil →
                        </Button>
                      </Link>
                    </div>

                    <div className="pt-1 space-y-2">
                      {addFeedback[c.user_id] && (
                        <p className="text-xs text-muted-foreground">
                          {addFeedback[c.user_id]}
                        </p>
                      )}
                      {pickingFor === c.user_id ? (
                        <div className="rounded border p-2 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            Choisir une mission :
                          </p>
                          {opportunities.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Aucune mission ouverte.
                            </p>
                          ) : (
                            opportunities.map((opp) => (
                              <Button
                                key={opp.id}
                                size="sm"
                                variant="outline"
                                className="w-full justify-start text-xs"
                                disabled={addingTo === opp.id}
                                onClick={() =>
                                  handleAddToOpportunity(c.user_id, opp.id)
                                }
                              >
                                {opp.title}
                              </Button>
                            ))
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => setPickingFor(null)}
                          >
                            Annuler
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPickingFor(c.user_id);
                            setAddFeedback((prev) => ({
                              ...prev,
                              [c.user_id]: "",
                            }));
                          }}
                        >
                          + Mission
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
