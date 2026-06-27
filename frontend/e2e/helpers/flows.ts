import {
  expect,
  type Page,
  type BrowserContext,
  type APIRequestContext,
} from "@playwright/test";

export const E2E_PASSWORD = "E2ePassw0rd!";

export function uniqueEmail(prefix: string): string {
  const stamp =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${prefix}+${stamp}@jorgtest.com`;
}

export async function login(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Accéder à mon espace" }).click();
  await page.waitForURL(/\/(candidate|recruiter)\/dashboard/);
}

interface RegisterArgs {
  email: string;
  password: string;
  role: "candidate" | "recruiter";
  firstName: string;
  lastName: string;
}

export async function registerAndLogin(
  page: Page,
  args: RegisterArgs,
): Promise<void> {
  await page.goto("/register");
  await page
    .getByRole("button", {
      name: args.role === "candidate" ? /^Candidat/ : /^Recruteur/,
    })
    .click();
  await page.locator("#first-name").fill(args.firstName);
  await page.locator("#last-name").fill(args.lastName);
  await page.locator("#email").fill(args.email);
  await page.locator("#password").fill(args.password);
  if (args.role === "recruiter") {
    // Champ requis cote UI ; ignore par le backend quand alpha_invite_required=false.
    await page.locator("#alpha-code").fill("JORG-E2E-0000");
  }
  await page.getByRole("button", { name: "Créer mon compte Jorg" }).click();
  await page.waitForURL(/\/onboarding\//);
  await login(page, args.email, args.password);
}

export async function createOrganization(
  page: Page,
  name: string,
): Promise<void> {
  await page.goto("/onboarding/recruiter/organization");
  await page.locator("#org-name").fill(name);
  await page.getByRole("button", { name: /Créer et continuer/ }).click();
  await page.waitForURL(/\/onboarding\/recruiter\/template/);
}

export async function inviteCandidate(
  page: Page,
  candidateEmail: string,
): Promise<void> {
  await page.goto("/recruiter/candidates");
  await page
    .getByRole("button", { name: "Inviter un candidat" })
    .first()
    .click();
  await page.locator("#invite-email").fill(candidateEmail);
  await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Invitation envoyée");
}

export async function fetchInvitationToken(
  request: APIRequestContext,
  candidateEmail: string,
): Promise<string> {
  const res = await request.get(
    `/api/test/last-invitation-token?email=${encodeURIComponent(candidateEmail)}`,
  );
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { token: string };
  return body.token;
}

interface SeedExperience {
  client_name: string;
  role: string;
  start_date: string; // YYYY-MM-DD
}

export async function seedCandidateExperiences(
  request: APIRequestContext,
  experiences: SeedExperience[],
): Promise<void> {
  for (const exp of experiences) {
    const res = await request.post("/api/candidates/me/experiences", {
      data: exp,
    });
    expect(res.ok()).toBeTruthy();
  }
}

export async function acceptInvitation(
  page: Page,
  token: string,
): Promise<void> {
  await page.goto(`/invitation/${token}`);
  await page.getByRole("button", { name: "Autoriser l'accès" }).click();
  await expect(
    page.getByText("Cette invitation a déjà été acceptée."),
  ).toBeVisible();
}

export async function openCandidateDetail(page: Page): Promise<void> {
  await page.goto("/recruiter/candidates");
  await page.getByRole("link", { name: "Consulter" }).first().click();
  await page.waitForURL(/\/recruiter\/candidates\/.+/);
}

/**
 * Deroule le parcours complet jusqu'a un grant actif, puis ouvre la fiche
 * candidat cote recruteur. Reutilise par le golden path et le bloc L3.
 */
export async function setupGrantedCandidate(
  page: Page,
  context: BrowserContext,
): Promise<{ recruiterEmail: string; candidateEmail: string }> {
  const recruiterEmail = uniqueEmail("recruiter");
  const candidateEmail = uniqueEmail("candidate");

  await registerAndLogin(page, {
    email: recruiterEmail,
    password: E2E_PASSWORD,
    role: "recruiter",
    firstName: "Rae",
    lastName: "Cruteur",
  });
  await createOrganization(page, "E2E Consulting");
  await inviteCandidate(page, candidateEmail);

  const token = await fetchInvitationToken(context.request, candidateEmail);

  await registerAndLogin(page, {
    email: candidateEmail,
    password: E2E_PASSWORD,
    role: "candidate",
    firstName: "Cana",
    lastName: "Didat",
  });
  await seedCandidateExperiences(context.request, [
    { client_name: "Acme", role: "Lead Dev", start_date: "2021-01-01" },
    { client_name: "Globex", role: "Architecte", start_date: "2019-03-01" },
  ]);
  await acceptInvitation(page, token);

  await login(page, recruiterEmail, E2E_PASSWORD);
  await openCandidateDetail(page);

  return { recruiterEmail, candidateEmail };
}
