import { ApiError } from "@/lib/api";

const BUSINESS_ERROR_LABELS: Record<string, string> = {
  already_in_shortlist:
    "Ce candidat est déjà dans la shortlist de cette mission.",
  "not authenticated": "Votre session a expiré. Reconnectez-vous.",
  "experience not found": "Expérience introuvable.",
  "template not found": "Modèle introuvable.",
  "document not found": "Document introuvable.",
  "file no longer available": "Le fichier n'est plus disponible.",
};

export function mapBusinessError(detail: string): string {
  return BUSINESS_ERROR_LABELS[detail] ?? detail;
}

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return mapBusinessError(err.detail);
  if (err instanceof Error) return err.message;
  return fallback;
}
