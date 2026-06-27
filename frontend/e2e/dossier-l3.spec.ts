import { test, expect } from "@playwright/test";
import { setupGrantedCandidate } from "./helpers/flows";

// L'editeur adapte est haut : une fenetre plus grande evite que le bouton de
// generation reste hors viewport (le dialogue ne scrolle pas en interne).
test.use({ viewport: { width: 1280, height: 1600 } });

test("editeur de dossier adapte L3 : reorder, dirty, version, generation", async ({
  page,
  context,
}) => {
  await setupGrantedCandidate(page, context);

  // Ouvrir l'editeur de version adaptee.
  await page.getByRole("button", { name: "Créer une version adaptée" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("✓ Enregistré")).toBeVisible();

  // Reorder de la premiere experience par drag souris -> passe en dirty.
  // dnd-kit (PointerSensor) demande un mouvement multi-etapes pour declencher.
  const handles = dialog.getByRole("button", { name: /^Déplacer / });
  const box1 = await handles.first().boundingBox();
  const box2 = await handles.nth(1).boundingBox();
  if (!box1 || !box2) throw new Error("poignees de drag introuvables");
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.mouse.down();
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 + 8, {
    steps: 12,
  });
  await page.mouse.move(
    box2.x + box2.width / 2,
    box2.y + box2.height / 2 + 24,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(
    dialog.getByText("● Modifications non enregistrées"),
  ).toBeVisible();

  // Nommer + enregistrer -> dirty resolu.
  await dialog.locator("#dossier-name").fill("Version E2E");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog.getByText("✓ Enregistré")).toBeVisible();

  // Nouvelle version -> apparait dans la liste.
  await dialog.getByRole("button", { name: "+ Nouvelle version" }).click();
  await dialog.locator("#dossier-name").fill("Version E2E 2");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  const versions = dialog.getByRole("region", { name: "Versions adaptées" });
  await expect(
    versions.getByText("Version E2E", { exact: true }),
  ).toBeVisible();
  await expect(versions.getByText("Version E2E 2")).toBeVisible();

  // Generer un DOCX depuis le dossier adapte.
  await dialog.getByTestId("template-card").first().click();
  await dialog.getByRole("button", { name: "Word (.docx)" }).click();
  await dialog.getByRole("button", { name: /Générer la version DOCX/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Télécharger \(DOCX\)/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.docx$/);
});
