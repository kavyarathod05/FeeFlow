import { test, expect } from "@playwright/test";

test("parent login → pay instalment → receipt path", async ({ page }) => {
  await page.goto("/login/parent");
  await page.getByLabel(/mobile/i).fill("9876500999");
  await page.getByRole("button", { name: /send otp/i }).click();
  await expect(page.getByText(/demo otp/i)).toBeVisible();
  await page.getByRole("button", { name: /verify/i }).click();
  await expect(page.getByText(/outstanding|बकाया/i)).toBeVisible({ timeout: 15_000 });

  const pay = page.getByRole("button", { name: /pay now|अभी भुगतान/i });
  if (await pay.isVisible()) {
    await pay.click();
    await expect(page.getByText(/test mode/i)).toBeVisible();
    await page.getByRole("button", { name: /start payment session/i }).click();
    await page.getByRole("button", { name: /pay successfully/i }).click();
    await expect(page.getByText(/paid|already/i)).toBeVisible({ timeout: 15_000 });
  }
});
