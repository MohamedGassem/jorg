// Tiroirs d'édition en place de "Mon profil" (plan refonte-ui-mon-dossier.md,
// tranche 6, décision 8). Remplace l'EditProfileDrawer 12 champs par trois
// tiroirs contextuels ouverts depuis la zone concernée de la couverture :
//   - Identité   : nom, titre, localisation, résumé
//   - Conditions : disponibilité, contrat, TJM/salaire, mode de travail,
//                  mobilité, années d'expérience
//   - Contact    : téléphone, email, LinkedIn
// Un seul endpoint (PUT /candidates/me/profile, sémantique PATCH) ; chaque
// tiroir n'envoie que les champs de sa section. Aucun changement d'API.
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/candidate/profile-shared";
import { api, ApiError } from "@/lib/api";
import {
  AVAILABILITY_LABELS,
  CONTRACT_TYPE_LABELS,
  WORK_MODE_LABELS,
} from "@/lib/labels";
import { ErrorAlert } from "@/components/ui/ErrorAlert";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type AvailabilityStatus,
  type CandidateProfile,
  type ContractType,
  type Experience,
  type WorkMode,
} from "@/types/api";

const WORK_MODE_ITEMS: Record<string, string> = {
  "": "Non précisé",
  ...WORK_MODE_LABELS,
};

export type ProfileEditSection = "identity" | "conditions" | "contact";

const SECTION_TITLES: Record<ProfileEditSection, string> = {
  identity: "Identité",
  conditions: "Conditions & disponibilité",
  contact: "Coordonnées",
};

function deriveYearsOfExperience(experiences: Experience[]): number | null {
  const startTimes = experiences
    .map((e) => new Date(e.start_date).getTime())
    .filter((t) => !Number.isNaN(t));
  if (startTimes.length === 0) return null;
  const now = Date.now();
  const endTimes = experiences
    .map((e) =>
      e.is_current ? now : e.end_date ? new Date(e.end_date).getTime() : NaN,
    )
    .filter((t) => !Number.isNaN(t));
  const latest = endTimes.length > 0 ? Math.max(...endTimes) : now;
  const years = Math.floor(
    (latest - Math.min(...startTimes)) / (365 * 24 * 3600 * 1000),
  );
  return Math.max(years, 0);
}

export function ProfileEditDrawer({
  section,
  open,
  profile,
  onOpenChange,
  onSave,
}: {
  section: ProfileEditSection;
  open: boolean;
  profile: CandidateProfile;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: CandidateProfile) => void;
}) {
  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");
  const [title, setTitle] = useState(profile.title ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [summary, setSummary] = useState(profile.summary ?? "");
  const [yearsOfExperience, setYearsOfExperience] = useState(
    profile.years_of_experience?.toString() ?? "",
  );
  const [availabilityStatus, setAvailabilityStatus] =
    useState<AvailabilityStatus>(profile.availability_status);
  const [availabilityDate, setAvailabilityDate] = useState(
    profile.availability_date ?? "",
  );
  const [contractType, setContractType] = useState<ContractType>(
    profile.contract_type,
  );
  const [dailyRate, setDailyRate] = useState(
    profile.daily_rate?.toString() ?? "",
  );
  const [annualSalary, setAnnualSalary] = useState(
    profile.annual_salary?.toString() ?? "",
  );
  const [workMode, setWorkMode] = useState<WorkMode | "">(
    profile.work_mode ?? "",
  );
  const [locationPreference, setLocationPreference] = useState(
    profile.location_preference ?? "",
  );
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [emailContact, setEmailContact] = useState(profile.email_contact ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedin_url ?? "");
  const [suggestedYears, setSuggestedYears] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setTitle(profile.title ?? "");
    setLocation(profile.location ?? "");
    setSummary(profile.summary ?? "");
    setYearsOfExperience(profile.years_of_experience?.toString() ?? "");
    setAvailabilityStatus(profile.availability_status);
    setAvailabilityDate(profile.availability_date ?? "");
    setContractType(profile.contract_type);
    setDailyRate(profile.daily_rate?.toString() ?? "");
    setAnnualSalary(profile.annual_salary?.toString() ?? "");
    setWorkMode(profile.work_mode ?? "");
    setLocationPreference(profile.location_preference ?? "");
    setPhone(profile.phone ?? "");
    setEmailContact(profile.email_contact ?? "");
    setLinkedinUrl(profile.linkedin_url ?? "");
    setError(null);
    if (section === "conditions") {
      api
        .get<Experience[]>("/candidates/me/experiences")
        .then((experiences) =>
          setSuggestedYears(deriveYearsOfExperience(experiences)),
        )
        .catch(() => setSuggestedYears(null));
    }
  }, [open, section, profile]);

  function payloadFor(): Record<string, unknown> {
    if (section === "identity") {
      return {
        first_name: firstName || null,
        last_name: lastName || null,
        title: title || null,
        location: location || null,
        summary: summary || null,
      };
    }
    if (section === "contact") {
      return {
        phone: phone || null,
        email_contact: emailContact || null,
        linkedin_url: linkedinUrl || null,
      };
    }
    const parsedYears = parseInt(yearsOfExperience, 10);
    const parsedRate = parseInt(dailyRate, 10);
    const parsedSalary = parseInt(annualSalary, 10);
    return {
      years_of_experience: Number.isNaN(parsedYears) ? null : parsedYears,
      availability_status: availabilityStatus,
      availability_date:
        availabilityStatus === "available_from" && availabilityDate
          ? availabilityDate
          : null,
      contract_type: contractType,
      daily_rate: Number.isNaN(parsedRate) ? null : parsedRate,
      annual_salary: Number.isNaN(parsedSalary) ? null : parsedSalary,
      work_mode: workMode || null,
      location_preference: locationPreference || null,
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.put<CandidateProfile>(
        "/candidates/me/profile",
        payloadFor(),
      );
      onSave(updated);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.detail : "Erreur lors de la sauvegarde",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader overline="Édition" title={SECTION_TITLES[section]} />
        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <ErrorAlert error={error} />

          {section === "identity" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-first-name">Prénom</Label>
                  <Input
                    id="edit-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-last-name">Nom</Label>
                  <Input
                    id="edit-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-title">Titre / poste actuel</Label>
                <Input
                  id="edit-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-location">Localisation</Label>
                <Input
                  id="edit-location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-summary">Résumé</Label>
                <Textarea
                  id="edit-summary"
                  value={summary}
                  onChange={setSummary}
                  rows={4}
                />
              </div>
            </>
          )}

          {section === "conditions" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="edit-availability">Disponibilité</Label>
                <Select
                  value={availabilityStatus}
                  items={AVAILABILITY_LABELS}
                  onValueChange={(v) =>
                    setAvailabilityStatus(v as AvailabilityStatus)
                  }
                >
                  <SelectTrigger id="edit-availability">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available_now">
                      {AVAILABILITY_LABELS.available_now}
                    </SelectItem>
                    <SelectItem value="available_from">
                      {AVAILABILITY_LABELS.available_from}
                    </SelectItem>
                    <SelectItem value="not_available">
                      {AVAILABILITY_LABELS.not_available}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {availabilityStatus === "available_from" && (
                <div className="space-y-1">
                  <Label htmlFor="edit-availability-date">
                    Disponible à partir du
                  </Label>
                  <Input
                    id="edit-availability-date"
                    type="date"
                    value={availabilityDate}
                    onChange={(e) => setAvailabilityDate(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="edit-contract">Type de contrat recherché</Label>
                <Select
                  value={contractType}
                  items={CONTRACT_TYPE_LABELS}
                  onValueChange={(v) => setContractType(v as ContractType)}
                >
                  <SelectTrigger id="edit-contract">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freelance">Freelance (TJM)</SelectItem>
                    <SelectItem value="cdi">CDI (salaire annuel)</SelectItem>
                    <SelectItem value="both">Les deux</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {contractType !== "cdi" && (
                <div className="space-y-1">
                  <Label htmlFor="edit-daily-rate">TJM souhaité (€/jour)</Label>
                  <Input
                    id="edit-daily-rate"
                    type="number"
                    min={0}
                    value={dailyRate}
                    onChange={(e) => setDailyRate(e.target.value)}
                  />
                </div>
              )}
              {contractType !== "freelance" && (
                <div className="space-y-1">
                  <Label htmlFor="edit-annual-salary">
                    Salaire annuel souhaité (€)
                  </Label>
                  <Input
                    id="edit-annual-salary"
                    type="number"
                    min={0}
                    value={annualSalary}
                    onChange={(e) => setAnnualSalary(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="edit-work-mode">Mode de travail</Label>
                <Select
                  value={workMode}
                  items={WORK_MODE_ITEMS}
                  onValueChange={(v) => setWorkMode(v as WorkMode | "")}
                >
                  <SelectTrigger id="edit-work-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(WORK_MODE_ITEMS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-location-preference">
                  Mobilité / zone géographique
                </Label>
                <Input
                  id="edit-location-preference"
                  value={locationPreference}
                  placeholder="ex: Île-de-France, full remote"
                  onChange={(e) => setLocationPreference(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-years">Années d&apos;expérience</Label>
                <Input
                  id="edit-years"
                  type="number"
                  min={0}
                  value={yearsOfExperience}
                  placeholder={suggestedYears?.toString() ?? ""}
                  onChange={(e) => setYearsOfExperience(e.target.value)}
                />
                {suggestedYears !== null &&
                  yearsOfExperience !== suggestedYears.toString() && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      onClick={() =>
                        setYearsOfExperience(suggestedYears.toString())
                      }
                    >
                      Suggestion : {suggestedYears} ans (calculé depuis vos
                      expériences)
                    </button>
                  )}
              </div>
            </>
          )}

          {section === "contact" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="edit-phone">Téléphone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-email-contact">Email de contact</Label>
                <Input
                  id="edit-email-contact"
                  type="email"
                  value={emailContact}
                  onChange={(e) => setEmailContact(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-linkedin">LinkedIn</Label>
                <Input
                  id="edit-linkedin"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </div>
            </>
          )}

          <DrawerFooter>
            <Button
              variant="ghost"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
