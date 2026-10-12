// Allowlist des chemins de redirection internes (plan refonte-onboarding.md,
// 2.3, C9). Consommé après login/register pour renvoyer un utilisateur vers son
// point de départ (typiquement une invitation) sans ouvrir de redirection
// ouverte : seuls des chemins internes connus, jamais une URL absolue.

const ALLOWED_PREFIXES = [
  "/invitation/",
  "/candidate/",
  "/recruiter/",
  "/onboarding/",
];

export function safeInternalPath(
  next: string | null | undefined,
): string | null {
  if (!next) return null;
  // Un chemin interne commence par un seul "/" ; "//" ou un backslash ouvrent
  // la porte aux URLs protocol-relative ou aux contournements de parsing.
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return null;
  }
  return ALLOWED_PREFIXES.some((prefix) => next.startsWith(prefix))
    ? next
    : null;
}
