import { z } from "zod";

/** Step 1 — information category */
export const TIP_CATEGORIES = [
  "recognize_person",
  "know_name",
  "saw_something",
  "vehicle_info",
  "media_evidence",
  "social_media_info",
  "heard_from_other",
  "other",
] as const;
export type TipCategory = (typeof TIP_CATEGORIES)[number];

/** Step 2 — source classification */
export const SOURCE_CLASSIFICATIONS = [
  "firsthand",
  "recognition",
  "secondhand",
  "online",
  "speculation",
] as const;
export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];

export const CONTACT_METHODS = ["phone", "email", "either", "none"] as const;

export const ACCEPTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "mp4",
  "mov",
  "pdf",
  "txt",
] as const;

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
  "text/plain",
] as const;

/** Configurable server-side; this is the default per-file ceiling. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

/** Aggregate ceiling for a single secure-intake upload request — the Server
 * Action body limit (next.config.ts) is sized just above this. Direct
 * delivery (email/PDF manifest) is not affected; larger material should be
 * provided to the detective directly. */
export const MAX_TOTAL_UPLOAD_BYTES = 100 * 1024 * 1024;

export const attachmentMetaSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  uploadedAt: z.string().datetime(),
});
export type AttachmentMeta = z.infer<typeof attachmentMetaSchema>;

export const detailsSchema = z.object({
  possibleName: z.string().max(200).optional().or(z.literal("")),
  possibleNickname: z.string().max(200).optional().or(z.literal("")),
  howKnown: z.string().max(500).optional().or(z.literal("")),
  approximateAge: z.string().max(50).optional().or(z.literal("")),
  cityOrNeighborhood: z.string().max(200).optional().or(z.literal("")),
  workplaceOrBusiness: z.string().max(200).optional().or(z.literal("")),
  schoolOrOrganization: z.string().max(200).optional().or(z.literal("")),
  knownVehicle: z.string().max(300).optional().or(z.literal("")),
  knownSocialMedia: z.string().max(300).optional().or(z.literal("")),
  dateLastSeen: z.string().max(50).optional().or(z.literal("")),
  locationLastSeen: z.string().max(300).optional().or(z.literal("")),
  narrative: z.string().min(10, "Please describe what you know.").max(10000),
});

export const contactSchema = z
  .object({
    anonymous: z.boolean(),
    fullName: z.string().max(200).optional().or(z.literal("")),
    phone: z.string().max(50).optional().or(z.literal("")),
    email: z
      .string()
      .email("Enter a valid email address.")
      .max(320)
      .optional()
      .or(z.literal("")),
    preferredContactMethod: z.enum(CONTACT_METHODS),
    detectiveMayContact: z.boolean(),
    campaignMayContact: z.boolean(),
  })
  .refine(
    (value) =>
      value.anonymous ||
      Boolean(value.fullName?.trim() || value.phone?.trim() || value.email?.trim()),
    {
      message:
        "Provide at least one way to reach you, or choose to submit anonymously.",
      path: ["fullName"],
    },
  );

export const confirmationsSchema = z.object({
  separatedFacts: z.literal(true, {
    errorMap: () => ({ message: "This confirmation is required." }),
  }),
  notEmergency: z.literal(true, {
    errorMap: () => ({ message: "This confirmation is required." }),
  }),
  noPublicAccusation: z.literal(true, {
    errorMap: () => ({ message: "This confirmation is required." }),
  }),
  mayForward: z.literal(true, {
    errorMap: () => ({ message: "This confirmation is required." }),
  }),
});

export const tipSchema = z.object({
  category: z.enum(TIP_CATEGORIES),
  sourceClassification: z.enum(SOURCE_CLASSIFICATIONS),
  details: detailsSchema,
  contact: contactSchema,
  attachments: z.array(attachmentMetaSchema).max(20),
  confirmations: confirmationsSchema,
});

export type TipDetails = z.infer<typeof detailsSchema>;
export type TipContact = z.infer<typeof contactSchema>;
export type TipSubmission = z.infer<typeof tipSchema>;

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isAcceptedFile(filename: string, mimeType: string): boolean {
  const ext = extensionOf(filename);
  return (
    (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext) &&
    ((ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType) ||
      // Some browsers report empty/octet-stream for HEIC and MOV files.
      mimeType === "" ||
      mimeType === "application/octet-stream")
  );
}
