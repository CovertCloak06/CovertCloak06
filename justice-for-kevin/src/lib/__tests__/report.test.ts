import { describe, expect, it } from "vitest";
import { caseSeed } from "@/lib/case";
import { formatTipReport } from "@/lib/report";
import { tipSchema, type TipSubmission } from "@/lib/tip-schema";

const baseTip: TipSubmission = {
  category: "recognize_person",
  sourceClassification: "recognition",
  details: {
    possibleName: "Jane Roe",
    possibleNickname: "",
    howKnown: "Seen at a neighborhood market",
    approximateAge: "30s",
    cityOrNeighborhood: "Antioch",
    workplaceOrBusiness: "",
    schoolOrOrganization: "",
    knownVehicle: "White sedan",
    knownSocialMedia: "",
    dateLastSeen: "",
    locationLastSeen: "",
    narrative: "I recognize the clothing from the released image; I have seen this person near Wilbur Avenue.",
  },
  contact: {
    anonymous: false,
    fullName: "Sam Example",
    phone: "925-555-0100",
    email: "sam@example.org",
    preferredContactMethod: "either",
    detectiveMayContact: true,
    campaignMayContact: false,
  },
  attachments: [
    {
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1234,
      sha256: "a".repeat(64),
      uploadedAt: "2026-07-25T12:00:00.000Z",
    },
  ],
  confirmations: {
    separatedFacts: true,
    notEmergency: true,
    noPublicAccusation: true,
    mayForward: true,
  },
};

describe("formatTipReport", () => {
  const report = formatTipReport(baseTip, caseSeed, "2026-07-25T12:00:00.000Z");

  it("includes the case header and category labels", () => {
    expect(report).toContain("CASE: Kevin Vandenbos Homicide");
    expect(report).toContain("CASE NUMBER: 24-6070");
    expect(report).toContain("INFORMATION CATEGORY: I recognize the person");
    expect(report).toContain("SOURCE CLASSIFICATION: Direct recognition");
  });

  it("places recognition narrative under firsthand, not speculation", () => {
    const firsthandIndex = report.indexOf("FIRSTHAND OBSERVATIONS:");
    const speculationIndex = report.indexOf("INFERENCES OR SPECULATION:");
    expect(report.slice(firsthandIndex, speculationIndex)).toContain("I recognize the clothing");
    expect(report.slice(speculationIndex)).toContain("—");
  });

  it("includes the attachment manifest with hash and size", () => {
    expect(report).toContain("photo.jpg");
    expect(report).toContain("a".repeat(64));
    expect(report).toContain("1234 bytes");
  });

  it("routes speculation narrative to the speculation section", () => {
    const speculativeTip = { ...baseTip, sourceClassification: "speculation" as const };
    const speculativeReport = formatTipReport(speculativeTip, caseSeed, "2026-07-25T12:00:00.000Z");
    const speculationIndex = speculativeReport.indexOf("INFERENCES OR SPECULATION:");
    expect(speculativeReport.slice(speculationIndex)).toContain("I recognize the clothing");
  });

  it("labels anonymous submissions", () => {
    const anonymousTip = {
      ...baseTip,
      contact: { ...baseTip.contact, anonymous: true },
    };
    expect(formatTipReport(anonymousTip, caseSeed, "2026-07-25T12:00:00.000Z")).toContain(
      "SUBMITTER: Anonymous submission",
    );
  });
});

describe("tipSchema", () => {
  it("accepts a complete submission", () => {
    expect(tipSchema.safeParse(baseTip).success).toBe(true);
  });
  it("rejects when confirmations are missing", () => {
    const bad = {
      ...baseTip,
      confirmations: { ...baseTip.confirmations, noPublicAccusation: false },
    };
    expect(tipSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects non-anonymous submissions without any contact info", () => {
    const bad = {
      ...baseTip,
      contact: { ...baseTip.contact, fullName: "", phone: "", email: "" },
    };
    expect(tipSchema.safeParse(bad).success).toBe(false);
  });
  it("accepts anonymous submissions without contact info", () => {
    const anonymous = {
      ...baseTip,
      contact: { ...baseTip.contact, anonymous: true, fullName: "", phone: "", email: "" },
    };
    expect(tipSchema.safeParse(anonymous).success).toBe(true);
  });
  it("rejects short narratives", () => {
    const bad = { ...baseTip, details: { ...baseTip.details, narrative: "short" } };
    expect(tipSchema.safeParse(bad).success).toBe(false);
  });
});
