import { test, expect } from "@playwright/test";

test("la page de connexion repond", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
});
