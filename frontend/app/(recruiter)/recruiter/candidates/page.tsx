"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, UserPlus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
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
import { StatusPill } from "@/components/ui/StatusPill";
import { SkillChip } from "@/components/ui/SkillChip";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import {
  AVAILABILITY_LABELS,
  CONTRACT_TYPE_LABELS,
  DOMAIN_LABELS,
  INVITATION_PILLS,
  WORK_MODE_LABELS,
  frMonthYear,
  initialsFromParts,
  labelFor,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  AccessibleCandidateRead,
  BuiltinTemplate,
  Invitation,
  OpportunityRead,
  Template,
} from "@/types/api";
import { VALID_DOMAINS } from "@/types/api";

// Convention du seed de démo : les profils fictifs sont sur @jorg.local.
function isDemoProfile(email: string) {
  return email.endsWith("@jorg.local");
}

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
    <div className="rounded-md border border-line bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        {activeSkillRefId ? (
          <p className="text-xs font-medium text-primary">
            {activeSkillName} ·{" "}
            <span className="font-normal text-ink-3">
              {totalCount} réalisation{totalCount > 1 ? "s" : ""} dans{" "}
              {matchingExpCount} expérience{matchingExpCount > 1 ? "s" : ""}
            </span>
          </p>
        ) : (
          <p className="text-xs font-medium">Expériences</p>
        )}
        <div className="flex items-center gap-3">
          {activeSkillRefId && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-3">
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
            className="text-ink-3 hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Experience list */}
      <div className="space-y-2 p-3">
        {candidate.experiences.length === 0 && (
          <p className="text-xs italic text-ink-3">
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
            <div key={exp.id} className="rounded-md bg-paper-2 px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {exp.client_name} - {exp.role}
                </span>
                <span className="font-mono text-[10px] text-ink-3">
                  {frMonthYear(exp.start_date)}
                  {exp.end_date
                    ? ` → ${frMonthYear(exp.end_date)}`
                    : exp.is_current
                      ? " → présent"
                      : ""}
                </span>
              </div>
              {exp.achievements.length === 0 ? (
                <p className="text-[11px] italic text-ink-3">
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
                        className={cn(
                          "flex items-start gap-1.5 rounded px-1.5 py-1",
                          activeSkillRefId &&
                            (isMatch ? "bg-accent-soft-2" : "opacity-40"),
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 text-xs",
                            activeSkillRefId && isMatch
                              ? "text-primary"
                              : "text-ink-3",
                          )}
                        >
                          •
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              "text-xs",
                              activeSkillRefId && isMatch
                                ? "font-medium text-ink"
                                : "text-ink-2",
                            )}
                          >
                            {ach.description}
                          </p>
                          {ach.impact &&
                            (activeSkillRefId ? isMatch : true) && (
                              <p className="text-[10px] italic text-ink-3">
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
  // Total of accessible candidates, unaffected by the active filters.
  const [accessibleTotal, setAccessibleTotal] = useState<number | null>(null);
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
  const [invBusy, setInvBusy] = useState<string | null>(null);
  const [invFeedback, setInvFeedback] = useState<Record<string, string>>({});
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
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
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
        // The unfiltered fetch is the source of truth for the total count.
        if (!Object.values(currentFilters).some(Boolean)) {
          setAccessibleTotal(data.length);
        }
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
    const isText = ["skill", "location", "q", "max_daily_rate"].includes(key);
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

  async function handleResendInvitation(inv: Invitation) {
    if (!orgId) return;
    setInvBusy(inv.id);
    try {
      await api.post(`/organizations/${orgId}/invitations/${inv.id}/resend`);
      setInvFeedback((prev) => ({ ...prev, [inv.id]: "Email renvoyé" }));
    } catch (err) {
      setInvFeedback((prev) => ({
        ...prev,
        [inv.id]: extractErrorMessage(err, "Erreur"),
      }));
    } finally {
      setInvBusy(null);
    }
  }

  async function handleCancelInvitation(inv: Invitation) {
    if (!orgId) return;
    setInvBusy(inv.id);
    try {
      await api.delete(`/organizations/${orgId}/invitations/${inv.id}`);
      setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
    } catch (err) {
      setInvFeedback((prev) => ({
        ...prev,
        [inv.id]: extractErrorMessage(err, "Erreur"),
      }));
    } finally {
      setInvBusy(null);
    }
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

  if (loading) return <p className="text-ink-3">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-ink-3">
        Associez-vous à une organisation d&apos;abord.
      </p>
    );

  const pendingInvitations = invitations.filter(
    (i) => i.status === "pending",
  ).length;
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex w-full flex-col gap-[18px]">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="j-overline">
            {accessibleTotal ?? candidates.length} accès actif
            {(accessibleTotal ?? candidates.length) > 1 ? "s" : ""}
          </p>
          <h1 className="mt-2 font-heading text-[27px] font-semibold leading-tight">
            Candidats
          </h1>
          <p className="mt-1 max-w-[560px] text-[15px] text-ink-2">
            Les candidats qui vous ont accordé l&apos;accès à leur dossier.
            Consultez, comparez, générez un dossier ciblé.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="w-fit">
          <UserPlus className="size-4" strokeWidth={1.6} />
          Inviter un candidat
        </Button>
      </header>

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

      {/* Barre de filtres */}
      <div className="rounded-lg border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] max-w-[340px] flex-1">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
              strokeWidth={1.6}
            />
            <Input
              placeholder="Rechercher un nom, un titre…"
              className="pl-9"
              value={filters.q}
              onChange={(e) => handleFilterChange("q", e.target.value)}
            />
          </div>
          <span className="hidden h-6 w-px bg-line sm:block" aria-hidden />
          <Select
            value={filters.availability_status}
            onValueChange={(v) => handleFilterChange("availability_status", v)}
          >
            <SelectTrigger className="w-auto gap-2">
              <span className="text-xs text-ink-3">Dispo</span>
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Toutes</SelectItem>
              {Object.entries(AVAILABILITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.work_mode}
            onValueChange={(v) => handleFilterChange("work_mode", v)}
          >
            <SelectTrigger className="w-auto gap-2">
              <span className="text-xs text-ink-3">Mode</span>
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              {Object.entries(WORK_MODE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.contract_type}
            onValueChange={(v) => handleFilterChange("contract_type", v)}
          >
            <SelectTrigger className="w-auto gap-2">
              <span className="text-xs text-ink-3">Contrat</span>
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.domain}
            onValueChange={(v) => handleFilterChange("domain", v)}
          >
            <SelectTrigger className="w-auto gap-2">
              <span className="text-xs text-ink-3">Domaine</span>
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Tous</SelectItem>
              {VALID_DOMAINS.map((d) => (
                <SelectItem key={d} value={d}>
                  {DOMAIN_LABELS[d] ?? d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Compétence"
            className="w-32"
            value={filters.skill}
            onChange={(e) => handleFilterChange("skill", e.target.value)}
          />
          <Input
            placeholder="Localisation"
            className="w-32"
            value={filters.location}
            onChange={(e) => handleFilterChange("location", e.target.value)}
          />
          <Input
            type="number"
            placeholder="TJM max"
            className="w-28"
            value={filters.max_daily_rate}
            onChange={(e) =>
              handleFilterChange("max_daily_rate", e.target.value)
            }
          />
          <span className="ml-auto flex items-center gap-3">
            <span className="j-meta text-xs">
              {candidates.length} candidat{candidates.length > 1 ? "s" : ""}
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[13px] font-medium text-ink-3 hover:text-primary"
              >
                Réinitialiser
              </button>
            )}
          </span>
        </div>
      </div>

      {/* Invitations envoyées */}
      {invitations.length > 0 && (
        <section className="rounded-lg border border-line bg-surface">
          <button
            type="button"
            onClick={() => setShowInvitations((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left"
            aria-expanded={showInvitations}
          >
            <span className="font-heading text-[15px] font-semibold">
              Invitations envoyées
            </span>
            <span className="flex items-center gap-2">
              {pendingInvitations > 0 && (
                <StatusPill tone="warn">
                  {pendingInvitations} en attente
                </StatusPill>
              )}
              {showInvitations ? (
                <ChevronUp className="size-4 text-ink-3" strokeWidth={1.6} />
              ) : (
                <ChevronDown className="size-4 text-ink-3" strokeWidth={1.6} />
              )}
            </span>
          </button>
          {showInvitations &&
            invitations.map((inv) => {
              const pill =
                INVITATION_PILLS[inv.status] ?? INVITATION_PILLS.expired;
              const inactive =
                inv.status === "expired" || inv.status === "rejected";
              return (
                <div
                  key={inv.id}
                  className={cn(
                    "flex items-center gap-3 border-t border-line px-5 py-3",
                    inactive && "opacity-55",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {inv.candidate_email}
                  </span>
                  {invFeedback[inv.id] && (
                    <span className="j-meta text-[12.5px]">
                      {invFeedback[inv.id]}
                    </span>
                  )}
                  <span className="j-meta text-[12.5px]">
                    expire le{" "}
                    {new Date(inv.expires_at).toLocaleDateString("fr-FR")}
                  </span>
                  <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                  {inv.status === "pending" && (
                    <span className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={invBusy === inv.id}
                        onClick={() => handleResendInvitation(inv)}
                      >
                        Renvoyer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-ink-2"
                        disabled={invBusy === inv.id}
                        onClick={() => handleCancelInvitation(inv)}
                      >
                        Annuler
                      </Button>
                    </span>
                  )}
                </div>
              );
            })}
        </section>
      )}

      <ErrorAlert error={error ?? candidatesError} />

      {candidates.length === 0 ? (
        <section className="mx-auto w-full max-w-[640px] rounded-lg border border-line bg-surface px-7 py-8 text-center">
          <h2 className="font-heading text-[19px] font-semibold">
            {hasFilters
              ? "Aucun candidat ne correspond à cette recherche"
              : "Aucun candidat accessible pour le moment"}
          </h2>
          <p className="mx-auto mt-2 max-w-[440px] text-sm text-ink-2">
            Un dossier candidat n&apos;est consultable qu&apos;avec
            l&apos;accord explicite de son propriétaire.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
            {[
              [
                "1",
                "Invitez",
                "Envoyez une invitation par e-mail au candidat.",
              ],
              [
                "2",
                "Il accepte",
                "Le candidat choisit d'accorder l'accès à son dossier.",
              ],
              [
                "3",
                "Vous exploitez",
                "Consultez le profil et générez des dossiers ciblés.",
              ],
            ].map(([num, title, sub]) => (
              <div
                key={num}
                className="rounded-md border border-line bg-paper-2 px-4 py-3"
              >
                <p className="j-overline text-[10px]">Étape {num}</p>
                <p className="mt-1 text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-ink-3">
                  {sub}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center gap-3">
            {hasFilters && (
              <Button variant="outline" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            )}
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" strokeWidth={1.6} />
              Inviter un candidat
            </Button>
          </div>
        </section>
      ) : (
        <section className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[
                  "Candidat",
                  "Compétences clés",
                  "Exp.",
                  "TJM",
                  "Dispo",
                  "",
                ].map((label, i) => (
                  <th key={i} className="j-th">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const isActive = activeSkillFilter?.candidateId === c.user_id;
                const expanded = expandedCandidates.has(c.user_id) || isActive;
                const name =
                  c.first_name && c.last_name
                    ? `${c.first_name} ${c.last_name}`
                    : c.email;

                const skillMap = new Map<string, string>();
                for (const exp of c.experiences) {
                  for (const u of exp.skill_usages) {
                    if (!skillMap.has(u.skill_ref_id)) {
                      skillMap.set(u.skill_ref_id, u.skill_ref.name);
                    }
                  }
                }
                const expSkills = Array.from(skillMap.entries()).map(
                  ([id, skillName]) => ({ id, name: skillName }),
                );

                return (
                  <CandidateRows
                    key={c.user_id}
                    candidate={c}
                    name={name}
                    expSkills={expSkills}
                    expanded={expanded}
                    isActive={isActive}
                    activeSkillFilter={activeSkillFilter}
                    setActiveSkillFilter={setActiveSkillFilter}
                    toggleExpand={() => toggleCandidateExpand(c.user_id)}
                    onGenerate={() =>
                      setGenerateFor({
                        candidateId: c.user_id,
                        candidateName: name,
                      })
                    }
                    closePanel={() => {
                      setActiveSkillFilter(null);
                      setExpandedCandidates((prev) => {
                        const next = new Set(prev);
                        next.delete(c.user_id);
                        return next;
                      });
                    }}
                    opportunities={opportunities}
                    pickingFor={pickingFor}
                    setPickingFor={setPickingFor}
                    addingTo={addingTo}
                    addFeedback={addFeedback[c.user_id]}
                    clearFeedback={() =>
                      setAddFeedback((prev) => ({ ...prev, [c.user_id]: "" }))
                    }
                    onAddToOpportunity={(oppId) =>
                      handleAddToOpportunity(c.user_id, oppId)
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function CandidateRows({
  candidate: c,
  name,
  expSkills,
  expanded,
  isActive,
  activeSkillFilter,
  setActiveSkillFilter,
  toggleExpand,
  onGenerate,
  closePanel,
  opportunities,
  pickingFor,
  setPickingFor,
  addingTo,
  addFeedback,
  clearFeedback,
  onAddToOpportunity,
}: {
  candidate: AccessibleCandidateRead;
  name: string;
  expSkills: { id: string; name: string }[];
  expanded: boolean;
  isActive: boolean;
  activeSkillFilter: {
    candidateId: string;
    skillRefId: string;
    skillName: string;
  } | null;
  setActiveSkillFilter: (
    f: { candidateId: string; skillRefId: string; skillName: string } | null,
  ) => void;
  toggleExpand: () => void;
  onGenerate: () => void;
  closePanel: () => void;
  opportunities: OpportunityRead[];
  pickingFor: string | null;
  setPickingFor: (id: string | null) => void;
  addingTo: string | null;
  addFeedback?: string;
  clearFeedback: () => void;
  onAddToOpportunity: (oppId: string) => void;
}) {
  const availabilityLabel = labelFor(
    AVAILABILITY_LABELS,
    c.availability_status,
  );

  return (
    <>
      <tr className="border-b border-line last:border-b-0 hover:bg-paper-2">
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-[11px]">
            <span className="grid size-[34px] shrink-0 place-items-center rounded-lg border border-accent-line bg-accent-soft font-heading text-[13px] font-semibold text-primary">
              {initialsFromParts(c.first_name, c.last_name, c.email)}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="whitespace-nowrap text-sm font-medium">{name}</p>
                {isDemoProfile(c.email) && (
                  <StatusPill tone="muted">Exemple</StatusPill>
                )}
              </div>
              {c.title && <p className="text-xs text-ink-3">{c.title}</p>}
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex max-w-[260px] flex-wrap gap-1.5">
            {expSkills.slice(0, 4).map((sk) => {
              const active =
                isActive && activeSkillFilter?.skillRefId === sk.id;
              return (
                <SkillChip
                  key={sk.id}
                  label={sk.name}
                  active={active}
                  onClick={() =>
                    active
                      ? setActiveSkillFilter(null)
                      : setActiveSkillFilter({
                          candidateId: c.user_id,
                          skillRefId: sk.id,
                          skillName: sk.name,
                        })
                  }
                />
              );
            })}
            {expSkills.length > 4 && (
              <span className="j-meta text-[11px]">
                +{expSkills.length - 4}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3.5">
          <span className="j-meta text-[12.5px]">
            {c.experiences.length || "—"}
          </span>
        </td>
        <td className="px-4 py-3.5">
          <span className="j-meta text-[12.5px]">
            {c.daily_rate ? `${c.daily_rate} €/j` : "—"}
          </span>
        </td>
        <td className="px-4 py-3.5">
          <span className="j-meta text-[12.5px]">
            {availabilityLabel ?? "—"}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3.5 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={onGenerate}>
              Générer
            </Button>
            <Link
              href={`/recruiter/candidates/${c.user_id}`}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Consulter
            </Link>
            {c.experiences.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={
                  expanded ? "Réduire les expériences" : "Voir les expériences"
                }
                aria-expanded={expanded}
                onClick={toggleExpand}
              >
                {expanded ? (
                  <ChevronUp className="size-4" strokeWidth={1.6} />
                ) : (
                  <ChevronDown className="size-4" strokeWidth={1.6} />
                )}
              </Button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line last:border-b-0">
          <td colSpan={6} className="bg-paper-2/60 px-4 py-3">
            {expSkills.length > 0 && (
              <div className="mb-3 rounded-md border border-line bg-surface px-3 py-2.5">
                <p className="j-overline text-[10px]">
                  Compétences ({expSkills.length})
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {expSkills.map((sk) => {
                    const active =
                      isActive && activeSkillFilter?.skillRefId === sk.id;
                    return (
                      <SkillChip
                        key={sk.id}
                        label={sk.name}
                        active={active}
                        onClick={() =>
                          active
                            ? setActiveSkillFilter(null)
                            : setActiveSkillFilter({
                                candidateId: c.user_id,
                                skillRefId: sk.id,
                                skillName: sk.name,
                              })
                        }
                      />
                    );
                  })}
                </div>
              </div>
            )}
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
              onClose={closePanel}
            />
            <div className="mt-2 space-y-2">
              {addFeedback && (
                <p className="text-xs text-ink-3">{addFeedback}</p>
              )}
              {pickingFor === c.user_id ? (
                <div className="space-y-1 rounded-md border border-line bg-surface p-2">
                  <p className="text-xs font-medium text-ink-3">
                    Choisir une mission :
                  </p>
                  {opportunities.length === 0 ? (
                    <p className="text-xs text-ink-3">
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
                        onClick={() => onAddToOpportunity(opp.id)}
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
                    clearFeedback();
                  }}
                >
                  + Mission
                </Button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
