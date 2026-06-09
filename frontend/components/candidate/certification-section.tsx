// frontend/components/candidate/certification-section.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCrudSection } from "@/lib/hooks/useCrudSection";
import {
  SectionAddButton,
  ItemActions,
  safeUrl,
} from "@/components/candidate/profile-shared";
import type { Certification } from "@/types/api";

// ---- Types & constants -------------------------------------------------------

type CertForm = {
  name: string;
  issuer: string;
  issue_date: string;
  expiry_date: string;
  credential_url: string;
};

const EMPTY_CERT: CertForm = {
  name: "",
  issuer: "",
  issue_date: "",
  expiry_date: "",
  credential_url: "",
};

function certToForm(cert: Certification): CertForm {
  return {
    name: cert.name,
    issuer: cert.issuer,
    issue_date: cert.issue_date,
    expiry_date: cert.expiry_date ?? "",
    credential_url: cert.credential_url ?? "",
  };
}

// ---- Exported section --------------------------------------------------------

export function CertificationSection() {
  const crud = useCrudSection<Certification, CertForm>({
    endpoint: "/candidates/me/certifications",
    emptyForm: EMPTY_CERT,
    toForm: certToForm,
    toBody: (f) => ({
      name: f.name,
      issuer: f.issuer,
      issue_date: f.issue_date,
      expiry_date: f.expiry_date || null,
      credential_url: f.credential_url || null,
    }),
    fetchErrorMsg: "Impossible de charger les certifications",
  });
  const {
    items,
    form,
    saving,
    deleting,
    error,
    adding,
    editingId,
    loading,
    fetchError,
    setField,
    startEdit,
    startAdd,
    cancelForm,
    handleSubmit,
    handleDelete,
  } = crud;

  const inlineForm = (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cert-name">
            Nom <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cert-name"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-issuer">
            Organisme <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cert-issuer"
            value={form.issuer}
            onChange={(e) => setField("issuer", e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cert-issue">
            {"Date d'obtention"} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cert-issue"
            type="date"
            value={form.issue_date}
            onChange={(e) => setField("issue_date", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cert-expiry">{"Date d'expiration"}</Label>
          <Input
            id="cert-expiry"
            type="date"
            value={form.expiry_date}
            onChange={(e) => setField("expiry_date", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cert-url">URL du certificat</Label>
        <Input
          id="cert-url"
          type="url"
          value={form.credential_url}
          onChange={(e) => setField("credential_url", e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving
            ? "Sauvegarde…"
            : editingId
              ? "Enregistrer"
              : "Ajouter la certification"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
          Annuler
        </Button>
      </div>
    </form>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Certifications</CardTitle>
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
            message="Aucune certification ajoutee."
            description="Les certifications servent de preuves complémentaires dans les dossiers générés."
            className="px-4 py-4"
          />
        )}
        {items.map((cert) =>
          editingId === cert.id ? (
            <div key={cert.id}>{inlineForm}</div>
          ) : (
            <div
              key={cert.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{cert.name}</p>
                <p className="text-sm text-muted-foreground">
                  {cert.issuer} · {cert.issue_date}
                  {cert.expiry_date ? ` → ${cert.expiry_date}` : ""}
                </p>
                {safeUrl(cert.credential_url) && (
                  <a
                    href={safeUrl(cert.credential_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Voir le certificat →
                  </a>
                )}
              </div>
              <ItemActions
                deleteLabel="Supprimer cette certification"
                onEdit={() => startEdit(cert)}
                onDelete={() => handleDelete(cert.id)}
                disabled={deleting === cert.id}
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
