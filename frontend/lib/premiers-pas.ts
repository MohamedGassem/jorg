// "Premiers pas" recruiter milestones (plan refonte-onboarding.md, décision 3).
// Chaque jalon ne compte QUE les actions propres à ce recruteur : les données
// demo (grants seedés) et les gestes des autres membres de l'org partagée sont
// exclus par construction, en filtrant sur l'id utilisateur du recruteur.

import type { GeneratedDocumentRecruiterView, Invitation } from "@/types/api";

export interface RecruiterMilestones {
  // Ce recruteur a envoyé au moins une invitation.
  invited: boolean;
  // Au moins une de ses invitations a été acceptée.
  accepted: boolean;
  // Ce recruteur a généré au moins un dossier.
  generated: boolean;
}

export function recruiterMilestones(
  invitations: Invitation[],
  documents: GeneratedDocumentRecruiterView[],
  userId: string,
): RecruiterMilestones {
  const mine = invitations.filter((inv) => inv.recruiter_id === userId);
  return {
    invited: mine.length > 0,
    accepted: mine.some((inv) => inv.status === "accepted"),
    generated: documents.some((doc) => doc.generated_by_user_id === userId),
  };
}

export function allMilestonesDone(m: RecruiterMilestones): boolean {
  return m.invited && m.accepted && m.generated;
}
