"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type { AccessibleCandidateRead, OpportunityRead } from "@/types/api";
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
      <h1 className="text-2xl font-bold">Candidats accessibles</h1>

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

      <ErrorAlert error={error ?? candidatesError} />
      {candidates.length === 0 ? (
        <EmptyState message="Aucun candidat ne correspond aux filtres." />
      ) : (
        <ul className="space-y-3" role="list">
          {candidates.map((c) => (
            <li key={c.user_id}>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-base">
                    {c.first_name && c.last_name
                      ? `${c.first_name} ${c.last_name}`
                      : c.email}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  {c.title && <p>{c.title}</p>}
                  <div className="flex flex-wrap gap-3">
                    {c.daily_rate && <span>TJM : {c.daily_rate} €/j</span>}
                    {c.availability_status && (
                      <span>Dispo : {c.availability_status}</span>
                    )}
                    {c.work_mode && <span>{c.work_mode}</span>}
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
                          Choisir une opportunité :
                        </p>
                        {opportunities.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Aucune opportunité ouverte.
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
                        + Opportunité
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
