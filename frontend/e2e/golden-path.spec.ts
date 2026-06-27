import { test, expect } from "@playwright/test";
import { setupGrantedCandidate } from "./helpers/flows";

test("recruteur invite, candidat accepte, recruteur genere un DOCX", async ({
  page,
  context,
}) => {
  await setupGrantedCandidate(page, context);

  // Sur la fiche candidat, composer un dossier.
  await page.getByRole("button", { name: "Composer un dossier" }).click();
  const dialog = page.getByRole("dialog");

  // Selectionner le premier modele Jorg, format DOCX, generer.
  await dialog.getByTestId("template-card").first().click();
  await dialog.getByRole("button", { name: "Word (.docx)" }).click();
  await dialog.getByRole("button", { name: /Générer le dossier DOCX/ }).click();

  // Telecharger et verifier le .docx.
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Télécharger \(DOCX\)/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
});
