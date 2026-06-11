// frontend/types/api.ts

export type UserRole = "candidate" | "recruiter";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired";
export type AccessGrantStatus = "active" | "revoked";
export type FileFormat = "docx" | "pdf";
export type SkillKind =
  | "technical"
  | "functional"
  | "sectoral"
  | "methodology"
  | "tool"
  | "soft";
export type LanguageLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "native";
export type UsageRole =
  | "lead"
  | "implementer"
  | "contributor"
  | "user"
  | "exposed_to";
export type UsageIntensity = "primary" | "secondary" | "incidental";
export type ContractType = "freelance" | "cdi" | "both";

export interface AchievementSkillTag {
  skill_ref_id: string;
  skill_ref: SkillReference;
  created_at: string;
}

export interface Achievement {
  id: string;
  experience_id: string;
  description: string;
  impact: string | null;
  order: number;
  featured: boolean;
  skill_tags: AchievementSkillTag[];
  created_at: string;
  updated_at: string;
}

export interface ExperienceSkillUsage {
  id: string;
  experience_id: string;
  skill_ref_id: string;
  skill_ref: SkillReference;
  usage_role: UsageRole;
  intensity: UsageIntensity;
  created_at: string;
}

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
  achievements_summary: string | null;
  achievements: Achievement[];
  skill_usages: ExperienceSkillUsage[];
  created_at: string;
  updated_at: string;
}

export interface SkillReference {
  id: string;
  name: string;
  slug: string;
  kind: SkillKind;
  aliases: string[];
  esco_uri: string | null;
  esco_skill_type: string | null;
  source: string;
  description: string | null;
  is_custom: boolean;
  creator_candidate_id: string | null;
}

export interface Skill {
  id: string;
  candidate_id: string;
  skill_ref_id: string;
  skill_ref: SkillReference;
  self_assessed_level: string | null;
  featured: boolean;
  notes: string | null;
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

export interface LanguageReference {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  esco_uri: string | null;
  source: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export type AvailabilityStatus =
  | "available_now"
  | "available_from"
  | "not_available";
export type WorkMode = "remote" | "onsite" | "hybrid";
export type MissionDuration = "short" | "medium" | "long" | "permanent";

export const VALID_DOMAINS = [
  "finance",
  "retail",
  "industry",
  "public",
  "health",
  "tech",
  "telecom",
  "energy",
  "other",
] as const;
export type Domain = (typeof VALID_DOMAINS)[number];

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
  avatar_url: string | null;
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
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  join_code: string;
  created_at: string;
}

export interface RecruiterProfile {
  id: string;
  user_id: string;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
}

export interface Template {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  name: string;
  description: string | null;
  word_file_path: string;
  detected_placeholders: string[];
  is_valid: boolean;
  created_at: string;
  updated_at: string;
}

export interface BuiltinTemplate {
  key: string;
  name: string;
  description: string;
}

export interface Invitation {
  id: string;
  recruiter_id: string;
  organization_id: string;
  organization_name: string | null;
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
  template_name: string | null;
  generated_at: string;
}

export interface GeneratedDocumentCandidateView {
  id: string;
  generated_at: string;
  file_format: string;
  organization_name: string;
  organization_id: string | null;
  template_name: string | null;
  recruiter_first_name: string | null;
  recruiter_last_name: string | null;
}

export interface GeneratedDocumentRecruiterView {
  id: string;
  generated_at: string;
  file_format: string;
  template_name: string | null;
  candidate_first_name: string | null;
  candidate_last_name: string | null;
  opportunity_title: string | null;
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
  experiences: Experience[];
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
  | "invitation_sent"
  | "invitation_accepted"
  | "invitation_rejected"
  | "invitation_expired"
  | "access_granted"
  | "access_revoked"
  | "document_generated";

export interface InteractionEvent {
  type: InteractionEventType;
  occurred_at: string;
  metadata: {
    template_name?: string | null;
    file_format?: string | null;
    recruiter_first_name?: string | null;
    recruiter_last_name?: string | null;
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
