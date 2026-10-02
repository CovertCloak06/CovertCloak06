import { describe, expect, it } from "vitest";
import { assertPermission, hasPermission, isRole } from "@/lib/auth/roles";
import { buildCampaignUrl, parseCampaignLink, sanitizeCampaignSrc } from "@/lib/qr";
import { buildShareText, DEFAULT_HEADLINE } from "@/lib/share-templates";
import { caseSeed } from "@/lib/case";

describe("roles", () => {
  it("owner has everything, including audit export", () => {
    expect(hasPermission("owner", "export_audit")).toBe(true);
    expect(hasPermission("owner", "delete_files")).toBe(true);
  });
  it("administrator cannot export audit logs or delete files", () => {
    expect(hasPermission("administrator", "export_audit")).toBe(false);
    expect(hasPermission("administrator", "delete_files")).toBe(false);
    expect(hasPermission("administrator", "manage_users")).toBe(true);
  });
  it("reviewer can review leads but not manage users", () => {
    expect(hasPermission("reviewer", "review_leads")).toBe(true);
    expect(hasPermission("reviewer", "manage_users")).toBe(false);
  });
  it("outreach manages campaigns only", () => {
    expect(hasPermission("outreach", "manage_campaigns")).toBe(true);
    expect(hasPermission("outreach", "review_leads")).toBe(false);
  });
  it("read_only can only view", () => {
    expect(hasPermission("read_only", "view_dashboard")).toBe(true);
    expect(hasPermission("read_only", "manage_content")).toBe(false);
  });
  it("assertPermission throws for missing permission", () => {
    expect(() => assertPermission("read_only", "manage_users")).toThrow(/Forbidden/);
    expect(() => assertPermission(null, "view_dashboard")).toThrow(/Forbidden/);
  });
  it("isRole validates role strings", () => {
    expect(isRole("owner")).toBe(true);
    expect(isRole("superadmin")).toBe(false);
  });
});

describe("QR campaign links", () => {
  it("builds a witness URL with a sanitized src", () => {
    expect(buildCampaignUrl("https://example.org/", "Flyer Antioch Market 001")).toBe(
      "https://example.org/witness?src=flyer-antioch-market-001",
    );
  });
  it("parses src back out of a scanned URL", () => {
    expect(parseCampaignLink("https://example.org/witness?src=flyer-antioch-market-001")).toEqual({
      url: "https://example.org/witness?src=flyer-antioch-market-001",
      src: "flyer-antioch-market-001",
    });
  });
  it("handles missing src and bad URLs", () => {
    expect(parseCampaignLink("https://example.org/witness").src).toBeNull();
    expect(parseCampaignLink("::garbage::").src).toBeNull();
  });
  it("sanitizes hostile slugs", () => {
    expect(sanitizeCampaignSrc("  <script>ALERT</script>  ")).toBe("script-alert-script");
  });
});

describe("share templates", () => {
  it("always includes case number and victim name for email format", () => {
    const text = buildShareText({
      format: "email",
      caseInfo: caseSeed,
      headline: DEFAULT_HEADLINE.en,
      body: "Body text.",
      language: "en",
      siteUrl: "https://example.org",
      includeDetectiveContact: true,
      detailed: true,
    });
    expect(text).toContain("Kevin Vandenbos");
    expect(text).toContain("Case 24-6070");
    expect(text).toContain("(925) 481-8147");
    expect(text).toContain("https://example.org/witness");
  });
  it("keeps X copy short and non-sensational", () => {
    const text = buildShareText({
      format: "x",
      caseInfo: caseSeed,
      headline: DEFAULT_HEADLINE.en,
      body: "unused",
      language: "en",
      siteUrl: "https://example.org",
      includeDetectiveContact: false,
      detailed: false,
    });
    expect(text.length).toBeLessThan(280);
    expect(text.toLowerCase()).not.toContain("wanted");
    expect(text.toLowerCase()).not.toContain("suspect");
  });
});
