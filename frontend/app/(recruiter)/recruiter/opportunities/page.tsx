"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { OpportunityRead, RecruiterProfile } from "@/types/api";

export default function OpportunitiesPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .get<RecruiterProfile>("/recruiters/me/profile")
      .then((p) => {
        setOrgId(p.organization_id);
        if (p.organization_id) {
          return api
            .get<OpportunityRead[]>(`/organizations/${p.organization_id}/opportunities`)
            .then(setOpportunities)
            .catch((err) => setError(err instanceof ApiError ? err.detail : "Erreur"));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setCreating(true);
    try {
      const opp = await api.post<OpportunityRead>(
        `/organizations/${orgId}/opportunities`,
        { title: title.trim(), description: description.trim() || null }
      );
      setOpportunities((prev) => [opp, ...prev]);
      setTitle("");
      setDescription("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setCreating(false);
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
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={creating || !title.trim()}>
                {creating ? "Création…" : "Créer"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {opportunities.length === 0 ? (
        <p className="text-muted-foreground">
          Aucune opportunité. Créez-en une ci-dessus.
        </p>
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
