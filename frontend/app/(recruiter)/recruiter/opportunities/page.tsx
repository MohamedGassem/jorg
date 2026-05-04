"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useRecruiterOrg } from "@/lib/hooks";
import type { OpportunityRead } from "@/types/api";

export default function OpportunitiesPage() {
  const { orgId, loading, error: orgError } = useRecruiterOrg();
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [oppsLoading, setOppsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    setOppsLoading(true);
    api
      .get<OpportunityRead[]>(`/organizations/${orgId}/opportunities`)
      .then(setOpportunities)
      .catch((err) => setError(extractErrorMessage(err, "Erreur")))
      .finally(() => setOppsLoading(false));
  }, [orgId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      const opp = await api.post<OpportunityRead>(
        `/organizations/${orgId}/opportunities`,
        { title: title.trim(), description: description.trim() || null },
      );
      setOpportunities((prev) => [opp, ...prev]);
      setTitle("");
      setDescription("");
      setShowForm(false);
    } catch (err) {
      setError(extractErrorMessage(err, "Erreur"));
    } finally {
      setCreating(false);
    }
  }

  if (loading || oppsLoading)
    return <p className="text-muted-foreground">Chargement…</p>;
  if (!orgId)
    return (
      <p className="text-muted-foreground">
        Associez-vous à une organisation d&apos;abord.
      </p>
    );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Opportunités</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Annuler" : "Nouvelle opportunité"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="opp-title">Titre</Label>
                <Input
                  id="opp-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="ex: Mission Data Engineer — Fintech"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opp-desc">Description (optionnel)</Label>
                <textarea
                  id="opp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border p-2 text-sm"
                  rows={3}
                />
              </div>
              <ErrorAlert error={orgError ?? error} />
              <Button type="submit" disabled={creating || !title.trim()}>
                {creating ? "Création…" : "Créer"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {!showForm && <ErrorAlert error={orgError ?? error} />}

      {opportunities.length === 0 ? (
        <EmptyState message="Aucune opportunité. Créez-en une ci-dessus." />
      ) : (
        <ul className="space-y-3" role="list">
          {opportunities.map((opp) => (
            <li key={opp.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{opp.title}</CardTitle>
                    <Badge
                      variant={opp.status === "open" ? "default" : "secondary"}
                    >
                      {opp.status === "open" ? "Ouverte" : "Clôturée"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {opp.description && (
                    <p className="mb-3 text-sm text-muted-foreground">
                      {opp.description}
                    </p>
                  )}
                  <Link href={`/recruiter/opportunities/${opp.id}`}>
                    <Button size="sm" variant="outline">
                      Voir la shortlist
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
