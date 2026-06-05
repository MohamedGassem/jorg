"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Breadcrumb } from "@/components/breadcrumb";
import { GenerateDossierDialog } from "@/components/generate-dossier-dialog";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type {
  AccessibleCandidateRead,
  BuiltinTemplate,
  OpportunityRead,
  Template,
} from "@/types/api";

function candidateName(c: AccessibleCandidateRead): string {
  return c.first_name && c.last_name
    ? `${c.first_name} ${c.last_name}`
    : c.email;
}

export default function CandidateDetailPage() {
  const { id: candidateId } = useParams<{ id: string }>();
  const { orgId, loading: orgLoading } = useRecruiterOrg();
  const [candidate, setCandidate] = useState<AccessibleCandidateRead | null>(
    null,
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [builtinTemplates, setBuiltinTemplates] = useState<BuiltinTemplate[]>(
    [],
  );
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [pickingOpp, setPickingOpp] = useState(false);
  const [addFeedback, setAddFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    Promise.all([
      api
        .get<AccessibleCandidateRead[]>(`/organizations/${orgId}/candidates`)
        .then((list) => {
          const found = list.find((c) => c.user_id === candidateId) ?? null;
          setCandidate(found);
          if (!found) setError("Candidat introuvable ou accès non autorisé.");
        }),
      api
        .get<Template[]>(`/organizations/${orgId}/templates`)
        .then(setTemplates),
      api
        .get<BuiltinTemplate[]>("/templates/builtin")
        .then(setBuiltinTemplates),
      api
        .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
        .then((opps) =>
          setOpportunities(opps.filter((o) => o.status === "open")),
        ),
    ]).catch((err) =>
      setError(extractErrorMessage(err, "Erreur de chargement")),
    );
  }, [orgId, candidateId]);

  async function handleAddToOpportunity(oppId: string) {
    if (!orgId || !candidateId) return;
    setAddingTo(oppId);
    try {
      await api.post(
        `/organizations/${orgId}/opportunities/${oppId}/candidates`,
        { candidate_id: candidateId },
      );
      setAddFeedback("Candidat ajouté à l'opportunité ✓");
      setPickingOpp(false);
    } catch (err) {
      setAddFeedback(extractErrorMessage(err, "Erreur"));
    } finally {
      setAddingTo(null);
    }
  }

  if (orgLoading) return <p className="text-muted-foreground">Chargement…</p>;
  if (error) return <ErrorAlert error={error} />;
  if (!candidate) return <p className="text-muted-foreground">Chargement…</p>;

  const name = candidateName(candidate);

  return (
    <div className="max-w-3xl space-y-6">
      <Breadcrumb
        items={[
          { label: "Candidats", href: "/recruiter/candidates" },
          { label: name },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          {candidate.title && (
            <p className="mt-1 text-sm text-muted-foreground">
              {candidate.title}
            </p>
          )}
        </div>
        <Button onClick={() => setGenerateOpen(true)}>
          Générer un dossier
        </Button>
      </div>

      <GenerateDossierDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        orgId={orgId!}
        candidateId={candidateId}
        candidateName={name}
        templates={templates}
        builtinTemplates={builtinTemplates}
      />

      {/* Profile summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {candidate.daily_rate && <p>TJM : {candidate.daily_rate} €/j</p>}
          {candidate.availability_status && (
            <p>Disponibilité : {candidate.availability_status}</p>
          )}
          {candidate.work_mode && <p>Mode : {candidate.work_mode}</p>}
          {candidate.location_preference && (
            <p>Localisation : {candidate.location_preference}</p>
          )}
        </CardContent>
      </Card>

      {/* Experiences */}
      {candidate.experiences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Expériences ({candidate.experiences.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidate.experiences.map((exp) => (
              <div
                key={exp.id}
                className="rounded-md border border-border/40 p-3"
              >
                <p className="text-sm font-medium">
                  {exp.client_name} — {exp.role}
                </p>
                <p className="text-xs text-muted-foreground">
                  {exp.start_date}
                  {exp.end_date
                    ? ` → ${exp.end_date}`
                    : exp.is_current
                      ? " → présent"
                      : ""}
                </p>
                {exp.achievements.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {exp.achievements.map((ach) => (
                      <li
                        key={ach.id}
                        className="text-xs text-muted-foreground"
                      >
                        • {ach.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add to opportunity */}
      <div className="space-y-2">
        {addFeedback && (
          <p className="text-sm text-muted-foreground">{addFeedback}</p>
        )}
        {pickingOpp ? (
          <div className="rounded border p-3 space-y-2">
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
                  onClick={() => handleAddToOpportunity(opp.id)}
                >
                  {opp.title}
                </Button>
              ))
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setPickingOpp(false)}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPickingOpp(true);
              setAddFeedback(null);
            }}
          >
            + Ajouter à une opportunité
          </Button>
        )}
      </div>
    </div>
  );
}
