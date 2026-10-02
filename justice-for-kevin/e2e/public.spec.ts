import { expect, test } from "@playwright/test";

test.describe("public site", () => {
  test("homepage communicates the case immediately", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /Kevin Vandenbos/ })).toBeVisible();
    await expect(page.getByText("24-6070").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Help Identify a Potential Witness/i })).toBeVisible();
  });

  test("witness page uses potential-witness language and no-confrontation notice", async ({ page }) => {
    await page.goto("/witness");
    await expect(
      page.getByText(/potential witness or person police are seeking to identify/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/Do not confront, threaten, harass/i)).toBeVisible();
  });

  test("detective contact actions use tel: and mailto:", async ({ page }) => {
    await page.goto("/witness");
    const call = page.getByRole("link", { name: /Call Detective Cox/i }).first();
    await expect(call).toHaveAttribute("href", /^tel:\+19254818147$/);
    const email = page.getByRole("link", { name: /Email Detective Cox/i }).first();
    await expect(email).toHaveAttribute("href", /^mailto:jcox@antiochca\.gov\?subject=/);
  });

  test("language toggle switches to Spanish", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Switch language to Español/i }).click();
    await expect(page.getByRole("link", { name: /Ayude a identificar/i }).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test("tip form walks through steps and blocks missing confirmations", async ({ page }) => {
    await page.goto("/submit-information");
    await expect(page.getByText(/not an emergency reporting system/i).first()).toBeVisible();

    await page.getByLabel(/I recognize the person/).check();
    await page.getByRole("button", { name: /^Next$/ }).click();

    await page.getByLabel(/Personal inference or speculation/).check();
    await expect(page.getByText(/Clearly separate what you directly know/i)).toBeVisible();
    await page.getByRole("button", { name: /^Next$/ }).click();

    await page
      .getByLabel(/Detailed narrative/)
      .fill("I believe I have seen this person near the market on Wilbur Avenue.");
    await page.getByRole("button", { name: /^Next$/ }).click();

    await page.getByLabel(/Submit anonymously/).check();
    await page.getByRole("button", { name: /^Next$/ }).click();

    // attachments (skip)
    await page.getByRole("button", { name: /^Next$/ }).click();

    // review — confirmations required
    await page.getByRole("button", { name: /^Next$/ }).click();
    await expect(page.getByText(/This confirmation is required/).first()).toBeVisible();

    for (const label of [
      /separated firsthand knowledge/i,
      /not an emergency reporting system/i,
      /not publicly accuse/i,
      /forwarded to law enforcement/i,
    ]) {
      await page.getByLabel(label).check();
    }
    await page.getByRole("button", { name: /^Next$/ }).click();
    await expect(page.getByRole("button", { name: /Download report as PDF/i })).toBeVisible();
  });

  test("admin routes redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/admin/leads");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("basic accessibility: skip link, landmarks, labeled nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("a.skip-link")).toHaveAttribute("href", "#main-content");
    await expect(page.locator("main#main-content")).toBeVisible();
    // The primary nav is display-hidden on mobile (hamburger menu instead),
    // so assert attachment via the landmark selector rather than by role.
    await expect(page.locator('nav[aria-label="Primary"]')).toBeAttached();
  });
});
