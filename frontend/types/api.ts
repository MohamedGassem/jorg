// frontend/types/api.ts

export type UserRole = "candidate" | "recruiter";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired";
export type AccessGrantStatus = "active" | "revoked";
export type FileFormat = "docx" | "pdf";
export type SkillCategory = "language" | "framework" | "database" | "tool" | "methodology" | "other";
export type LanguageLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "native";
export type ContractType = "freelance" | "cdi" | "both";

export interface Experience {
  id: string;
  profile_id: string;
  client_name: string;
  role: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  context: string | null;
  achievements: string | null;
  technologies: string[];
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  profile_id: string;
  name: string;
  category: SkillCategory;
  level: string | null;
  level_rating: number | null;
  years_of_experience: number | null;
  created_at: string;
  updated_at: string;
}

export interface Education {
  id: string;
  profile_id: string;
  school: string;
  degree: string | null;
  field_of_study: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Certification {
  id: string;
  profile_id: string;
  name: string;
  issuer: string;
  issue_date: string;
  expiry_date: string | null;
  credential_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Language {
  id: string;
  profile_id: string;
  name: string;
  level: LanguageLevel;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export type AvailabilityStatus = "available_now" | "available_from" | "not_available";
export type WorkMode = "remote" | "onsite" | "hybrid";
export type MissionDuration = "short" | "medium" | "long" | "permanent";

export const VALID_DOMAINS = [
  "finance", "retail", "industry", "public",
  "health", "tech", "telecom", "energy", "other",
] as const;
export type Domain = typeof VALID_DOMAINS[number];

export interface CandidateProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  summary: string | null;
  phone: string | null;
  email_contact: string | null;
  linkedin_url: string | null;
  location: string | null;
  years_of_experience: number | null;
  daily_rate: number | null;
  contract_type: ContractType;
  annual_salary: number | null;
  availability_status: AvailabilityStatus;
  availability_date: string | null;
  work_mode: WorkMode | null;
  location_preference: string | null;
  preferred_domains: Domain[] | null;
  mission_duration: MissionDuration | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
}

export interface RecruiterProfile {
  id: string;
  user_id: string;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  name: string;
  description: string | null;
  word_file_path: string;
  detected_placeholders: string[];
  mappings: Record<string, string>;
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  recruiter_id: string;
  organization_id: string;
  candidate_email: string;
  candidate_id: string | null;
  token: string;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
}

export interface AccessGrant {
  id: string;
  candidate_id: string;
  organization_id: string;
  status: AccessGrantStatus;
  granted_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface GeneratedDocument {
  id: string;
  access_grant_id: string;
  template_id: string | null;
  generated_by_user_id: string | null;
  file_path: string;
  file_format: FileFormat;
  generated_at: string;
}

export interface AccessibleCandidate {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export interface AccessibleCandidateRead {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  daily_rate: number | null;
  contract_type: ContractType | null;
  availability_status: AvailabilityStatus | null;
  work_mode: WorkMode | null;
  location_preference: string | null;
  preferred_domains: string[] | null;
}

export interface ApiError {
  detail: string;
}

export type OpportunityStatus = "open" | "closed";

export interface OpportunityRead {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: OpportunityStatus;
  created_at: string;
  updated_at: string;
}

export interface ShortlistCandidateInfo {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
}

export interface OpportunityDetail extends OpportunityRead {
  shortlist: ShortlistCandidateInfo[];
}

export interface BulkGenerateResult {
  candidate_id: string;
  status: "ok" | "error";
  doc_id: string | null;
  error: string | null;
}

export type OrganizationStatus = "invited" | "active" | "revoked" | "expired";
export type InteractionEventType =
  | "invitation_sent" | "invitation_accepted" | "invitation_rejected"
  | "invitation_expired" | "access_granted" | "access_revoked" | "document_generated";

export interface InteractionEvent {
  type: InteractionEventType;
  occurred_at: string;
  metadata: {
    template_name?: string | null;
    file_format?: string | null;
  };
}

export interface OrganizationInteractionCard {
  organization_id: string;
  organization_name: string;
  logo_url: string | null;
  current_status: OrganizationStatus;
  events: InteractionEvent[];
}

export interface CandidateExport {
  exported_at: string;
  user_id: string;
  email: string;
  role: UserRole;
  created_at: string;
  profile: CandidateProfile | null;
  experiences: Experience[];
  skills: Skill[];
  education: Education[];
  certifications: Certification[];
  languages: Language[];
  access_grants: Array<{
    id: string;
    organization_id: string;
    status: AccessGrantStatus;
    granted_at: string;
    revoked_at: string | null;
  }>;
  generated_documents: Array<{
    id: string;
    access_grant_id: string | null;
    template_id: string | null;
    generated_by_user_id: string | null;
    file_format: FileFormat;
    generated_at: string;
  }>;
}
