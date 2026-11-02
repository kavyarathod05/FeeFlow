import { test, expect } from "@playwright/test";

test("parent login → pay instalment → receipt path", async ({ page }) => {
  await page.goto("/login/parent");
  await page.getByLabel(/mobile/i).fill("9876500999");
  await page.getByRole("button", { name: /send otp/i }).click();
  await expect(page.getByText(/demo otp/i)).toBeVisible();
  await page.getByRole("button", { name: /verify/i }).click();
  await expect(page.getByText("बकाया राशि")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1 }).or(page.locator(".font-display").first())).toBeVisible();

  const pay = page.getByRole("button", { name: /अभी भुगतान करें|pay now/i }).first();
  await expect(pay).toBeVisible();
  await pay.click();
  await expect(page.getByText(/test mode/i)).toBeVisible();
  await page.getByRole("button", { name: /start payment session/i }).click();
  await page.getByRole("button", { name: /pay successfully/i }).click();
  await expect(page.getByText(/paid|already/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/receipt/i)).toBeVisible();
});
