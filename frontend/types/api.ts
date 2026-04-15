// frontend/types/api.ts

export type UserRole = "candidate" | "recruiter";
export type InvitationStatus = "pending" | "accepted" | "rejected" | "expired";
export type AccessGrantStatus = "active" | "revoked";
export type FileFormat = "docx" | "pdf";

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

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

export interface ApiError {
  detail: string;
}
