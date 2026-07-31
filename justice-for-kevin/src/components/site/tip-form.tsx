"use client";

import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Copy,
  Download,
  FileText,
  Loader2,
  Mail,
  Paperclip,
  Phone,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Checkbox,
  FieldError,
  Input,
  Label,
  Radio,
  Textarea,
} from "@/components/ui/field";
import { TurnstileWidget } from "@/components/site/turnstile";
import { trackEvent } from "@/lib/analytics";
import { detectiveMailtoHref, detectiveTelHref, type CaseInfo } from "@/lib/case";
import { sha256HexOfFile } from "@/lib/hash";
import { generateReportPdf } from "@/lib/pdf/report";
import { categoryLabel, formatTipReport, sourceLabel } from "@/lib/report";
import {
  isAcceptedFile,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_UPLOAD_BYTES,
  SOURCE_CLASSIFICATIONS,
  TIP_CATEGORIES,
  tipSchema,
  type TipSubmission,
} from "@/lib/tip-schema";
import { formatBytes } from "@/lib/utils";
import { submitSecureTip, type SecureIntakeResult } from "@/app/(public)/submit-information/actions";

const STEPS = ["category", "source", "details", "contact", "attachments", "review", "deliver"] as const;
type StepKey = (typeof STEPS)[number];

const STEP_FIELDS: Record<StepKey, (keyof TipSubmission | `details.${string}` | `contact.${string}` | `confirmations.${string}`)[]> = {
  category: ["category"],
  source: ["sourceClassification"],
  details: ["details"],
  contact: ["contact"],
  attachments: ["attachments"],
  review: ["confirmations"],
  deliver: [],
};

const CATEGORY_OPTIONS = TIP_CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }));
const SOURCE_OPTIONS = SOURCE_CLASSIFICATIONS.map((value) => ({ value, label: sourceLabel(value) }));

export function TipForm({
  caseInfo,
  secureIntakeEnabled,
  stepLabels,
  labels,
}: {
  caseInfo: CaseInfo;
  secureIntakeEnabled: boolean;
  stepLabels: Record<StepKey, string>;
  labels: {
    next: string;
    back: string;
    speculationWarning: string;
    anonymousNote: string;
    emergency: string;
  };
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [hashing, setHashing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [secureResult, setSecureResult] = useState<SecureIntakeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const form = useForm<TipSubmission>({
    resolver: zodResolver(tipSchema),
    mode: "onTouched",
    defaultValues: {
      category: undefined as unknown as TipSubmission["category"],
      sourceClassification: undefined as unknown as TipSubmission["sourceClassification"],
      details: {
        possibleName: "",
        possibleNickname: "",
        howKnown: "",
        approximateAge: "",
        cityOrNeighborhood: "",
        workplaceOrBusiness: "",
        schoolOrOrganization: "",
        knownVehicle: "",
        knownSocialMedia: "",
        dateLastSeen: "",
        locationLastSeen: "",
        narrative: "",
      },
      contact: {
        anonymous: false,
        fullName: "",
        phone: "",
        email: "",
        preferredContactMethod: "either",
        detectiveMayContact: true,
        campaignMayContact: false,
      },
      attachments: [],
      confirmations: {
        separatedFacts: false as unknown as true,
        notEmergency: false as unknown as true,
        noPublicAccusation: false as unknown as true,
        mayForward: false as unknown as true,
      },
    },
  });

  const { register, watch, setValue, trigger, getValues, formState } = form;
  const step = STEPS[stepIndex] ?? "category";
  const values = watch();

  const report = useMemo(() => {
    try {
      const parsed = tipSchema.safeParse(getValues());
      if (!parsed.success) return null;
      return formatTipReport(parsed.data, caseInfo, new Date().toISOString());
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, values, caseInfo]);

  const goNext = async () => {
    const fields = STEP_FIELDS[step];
    const valid = fields.length === 0 ? true : await trigger(fields as Parameters<typeof trigger>[0]);
    if (!valid) return;
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
    stepHeadingRef.current?.focus();
  };

  const goBack = () => {
    setStepIndex((index) => Math.max(index - 1, 0));
    stepHeadingRef.current?.focus();
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setFileError(null);
    setHashing(true);
    try {
      const next = [...files];
      const metas = [...getValues("attachments")];
      for (const file of Array.from(list)) {
        if (!isAcceptedFile(file.name, file.type)) {
          setFileError(`"${file.name}" is not an accepted file type.`);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setFileError(`"${file.name}" exceeds the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit.`);
          continue;
        }
        const sha256 = await sha256HexOfFile(file);
        if (metas.some((meta) => meta.sha256 === sha256)) continue;
        next.push(file);
        metas.push({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          sha256,
          uploadedAt: new Date().toISOString(),
        });
      }
      setFiles(next);
      setValue("attachments", metas, { shouldValidate: true });
    } finally {
      setHashing(false);
    }
  };

  const removeFile = (sha256: string) => {
    const metas = getValues("attachments");
    const index = metas.findIndex((meta) => meta.sha256 === sha256);
    if (index === -1) return;
    setFiles((current) => current.filter((_, i) => i !== index));
    setValue(
      "attachments",
      metas.filter((meta) => meta.sha256 !== sha256),
      { shouldValidate: true },
    );
  };

  const downloadPdf = async () => {
    const parsed = tipSchema.safeParse(getValues());
    if (!parsed.success) return;
    trackEvent("report_pdf_download");
    const bytes = await generateReportPdf(parsed.data, caseInfo, new Date().toISOString());
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `information-report-case-${caseInfo.caseNumber}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadText = () => {
    if (!report) return;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `information-report-case-${caseInfo.caseNumber}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyReport = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const submitSecurely = async () => {
    const parsed = tipSchema.safeParse(getValues());
    if (!parsed.success) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("tip", JSON.stringify(parsed.data));
      if (turnstileToken) formData.set("turnstileToken", turnstileToken);
      for (const file of files) formData.append("files", file);
      setSecureResult(await submitSecureTip(formData));
    } finally {
      setSubmitting(false);
    }
  };

  const totalAttachmentBytes = (values.attachments ?? []).reduce(
    (sum, meta) => sum + meta.sizeBytes,
    0,
  );
  const overUploadLimit = totalAttachmentBytes > MAX_TOTAL_UPLOAD_BYTES;

  const mailtoWithBody = report
    ? `${detectiveMailtoHref(caseInfo)}&body=${encodeURIComponent(report.length > 1800 ? `${report.slice(0, 1800)}\n\n[Report truncated — full report attached as PDF or pasted from clipboard]` : report)}`
    : detectiveMailtoHref(caseInfo);

  const errors = formState.errors;

  return (
    <form noValidate onSubmit={(event) => event.preventDefault()}>
      {/* Progress */}
      <ol className="mb-8 flex flex-wrap gap-2" aria-label="Form progress">
        {STEPS.map((key, index) => (
          <li key={key}>
            <span
              aria-current={index === stepIndex ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                index === stepIndex
                  ? "border-steel-700 bg-steel-600 text-white"
                  : index < stepIndex
                    ? "border-steel-300 bg-steel-100 text-steel-700"
                    : "border-charcoal-200 bg-white text-charcoal-500"
              }`}
            >
              {index + 1}. {stepLabels[key]}
            </span>
          </li>
        ))}
      </ol>

      <h2 ref={stepHeadingRef} tabIndex={-1} className="text-2xl font-semibold">
        {stepIndex + 1}. {stepLabels[step]}
      </h2>

      {/* Step 1 — category */}
      {step === "category" ? (
        <fieldset className="mt-6">
          <legend className="sr-only">{stepLabels.category}</legend>
          <div className="grid gap-2.5">
            {CATEGORY_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-charcoal-200 bg-white p-4 has-[:checked]:border-steel-600 has-[:checked]:bg-steel-100/50"
              >
                <Radio value={option.value} {...register("category")} />
                <span className="text-charcoal-900">{option.label}</span>
              </label>
            ))}
          </div>
          <FieldError id="category-error" message={errors.category ? "Select a category." : undefined} />
        </fieldset>
      ) : null}

      {/* Step 2 — source classification */}
      {step === "source" ? (
        <fieldset className="mt-6">
          <legend className="sr-only">{stepLabels.source}</legend>
          <div className="grid gap-2.5">
            {SOURCE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-charcoal-200 bg-white p-4 has-[:checked]:border-steel-600 has-[:checked]:bg-steel-100/50"
              >
                <Radio value={option.value} {...register("sourceClassification")} />
                <span className="text-charcoal-900">{option.label}</span>
              </label>
            ))}
          </div>
          <FieldError
            id="source-error"
            message={errors.sourceClassification ? "Select how you know this information." : undefined}
          />
          {values.sourceClassification === "speculation" ? (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-urgent-700 bg-urgent-100 p-3 text-sm font-medium">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-urgent-700" />
              {labels.speculationWarning}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {/* Step 3 — details */}
      {step === "details" ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {(
            [
              ["possibleName", "Possible name"],
              ["possibleNickname", "Possible nickname"],
              ["howKnown", "How the person is known"],
              ["approximateAge", "Approximate age"],
              ["cityOrNeighborhood", "City or neighborhood association"],
              ["workplaceOrBusiness", "Workplace or business association"],
              ["schoolOrOrganization", "School or organization association"],
              ["knownVehicle", "Known vehicle"],
              ["knownSocialMedia", "Known social-media username"],
              ["dateLastSeen", "Date last seen"],
              ["locationLastSeen", "Location last seen"],
            ] as const
          ).map(([name, label]) => (
            <div key={name}>
              <Label htmlFor={`details-${name}`}>{label}</Label>
              <Input id={`details-${name}`} className="mt-1.5" {...register(`details.${name}`)} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label htmlFor="details-narrative">Detailed narrative *</Label>
            <Textarea
              id="details-narrative"
              className="mt-1.5"
              aria-invalid={Boolean(errors.details?.narrative)}
              aria-describedby="narrative-error"
              {...register("details.narrative")}
            />
            <FieldError id="narrative-error" message={errors.details?.narrative?.message} />
          </div>
        </div>
      ) : null}

      {/* Step 4 — contact */}
      {step === "contact" ? (
        <div className="mt-6 space-y-5">
          <label className="flex items-start gap-3 rounded-lg border border-charcoal-200 bg-white p-4">
            <Checkbox {...register("contact.anonymous")} />
            <span>
              <span className="font-medium">Submit anonymously</span>
              <span className="mt-0.5 block text-sm text-charcoal-600">{labels.anonymousNote}</span>
            </span>
          </label>

          {!values.contact?.anonymous ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="contact-fullName">Full name</Label>
                <Input
                  id="contact-fullName"
                  autoComplete="name"
                  className="mt-1.5"
                  aria-invalid={Boolean(errors.contact?.fullName)}
                  aria-describedby="contact-name-error"
                  {...register("contact.fullName")}
                />
                <FieldError id="contact-name-error" message={errors.contact?.fullName?.message} />
              </div>
              <div>
                <Label htmlFor="contact-phone">Phone</Label>
                <Input id="contact-phone" type="tel" autoComplete="tel" className="mt-1.5" {...register("contact.phone")} />
              </div>
              <div>
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  className="mt-1.5"
                  aria-invalid={Boolean(errors.contact?.email)}
                  aria-describedby="contact-email-error"
                  {...register("contact.email")}
                />
                <FieldError id="contact-email-error" message={errors.contact?.email?.message} />
              </div>
              <fieldset>
                <legend className="text-sm font-medium text-charcoal-800">Preferred contact method</legend>
                <div className="mt-1.5 flex flex-wrap gap-4">
                  {(["phone", "email", "either", "none"] as const).map((method) => (
                    <label key={method} className="flex items-center gap-2 text-sm">
                      <Radio value={method} {...register("contact.preferredContactMethod")} />
                      {method}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-start gap-3 sm:col-span-2">
                <Checkbox {...register("contact.detectiveMayContact")} />
                <span>May Detective Cox contact you?</span>
              </label>
              <label className="flex items-start gap-3 sm:col-span-2">
                <Checkbox {...register("contact.campaignMayContact")} />
                <span>May campaign administrators contact you?</span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Step 5 — attachments */}
      {step === "attachments" ? (
        <div className="mt-6">
          <p className="text-sm text-charcoal-600">
            Accepted: jpg, jpeg, png, webp, heic, mp4, mov, pdf, txt · max {formatBytes(MAX_ATTACHMENT_BYTES)} per file
            ({formatBytes(MAX_TOTAL_UPLOAD_BYTES)} total for a single secure upload — larger material can be
            provided to the detective directly). Original files are never resized or recompressed; each file is
            fingerprinted with a SHA-256 integrity hash.
          </p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-charcoal-300 bg-white p-8 text-charcoal-600 hover:border-steel-600">
            <Paperclip aria-hidden />
            <span className="font-medium">Choose files</span>
            <input
              type="file"
              multiple
              className="sr-only"
              accept=".jpg,.jpeg,.png,.webp,.heic,.mp4,.mov,.pdf,.txt"
              onChange={(event) => addFiles(event.target.files)}
            />
          </label>
          {hashing ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-charcoal-600" role="status">
              <Loader2 aria-hidden className="size-4 animate-spin" /> Hashing files…
            </p>
          ) : null}
          <FieldError id="file-error" message={fileError ?? undefined} />
          {values.attachments?.length ? (
            <ul className="mt-4 space-y-2">
              {values.attachments.map((meta) => (
                <li
                  key={meta.sha256}
                  className="flex items-center justify-between gap-3 rounded-lg border border-charcoal-200 bg-white p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{meta.filename}</p>
                    <p className="truncate text-xs text-charcoal-500">
                      {formatBytes(meta.sizeBytes)} · SHA-256 {meta.sha256.slice(0, 16)}…
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${meta.filename}`}
                    onClick={() => removeFile(meta.sha256)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Step 6 — review */}
      {step === "review" ? (
        <div className="mt-6">
          {report ? (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-charcoal-200 bg-white p-4 font-mono text-xs leading-relaxed">
              {report}
            </pre>
          ) : (
            <p role="alert" className="rounded-lg border border-urgent-700 bg-urgent-100 p-4 text-sm">
              Some steps are incomplete. Go back and finish the required fields.
            </p>
          )}
          <div className="mt-5 space-y-3">
            {(
              [
                ["separatedFacts", "I have separated firsthand knowledge from speculation."],
                ["notEmergency", "I understand this is not an emergency reporting system."],
                ["noPublicAccusation", "I will not publicly accuse or confront anyone."],
                ["mayForward", "I understand information may be forwarded to law enforcement."],
              ] as const
            ).map(([name, label]) => (
              <div key={name}>
                <label className="flex items-start gap-3">
                  {/* Controlled: form state is authoritative so validation
                      re-renders can never desync the visible checkbox. */}
                  <Checkbox
                    aria-describedby={`confirm-${name}-error`}
                    checked={values.confirmations?.[name] === true}
                    onChange={(event) =>
                      setValue(`confirmations.${name}`, event.target.checked as true, {
                        shouldValidate: true,
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
                <FieldError
                  id={`confirm-${name}-error`}
                  message={errors.confirmations?.[name] ? "This confirmation is required." : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Step 7 — delivery */}
      {step === "deliver" ? (
        <div className="mt-6 space-y-6">
          <p className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-4 text-sm text-charcoal-700">
            {labels.emergency} Attachments are listed in the report manifest with their integrity hashes —
            attach the files themselves to your email or provide them when the detective contacts you.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <ButtonLink href={mailtoWithBody} variant="primary" size="lg">
              <Mail aria-hidden /> Email Detective Cox
            </ButtonLink>
            <ButtonLink href={detectiveTelHref(caseInfo)} variant="outline" size="lg" className="bg-white">
              <Phone aria-hidden /> Call Detective Cox
            </ButtonLink>
            <Button variant="outline" size="lg" className="bg-white" onClick={copyReport}>
              <Copy aria-hidden /> {copied ? "Copied to clipboard" : "Copy formatted report"}
            </Button>
            <Button variant="outline" size="lg" className="bg-white" onClick={downloadPdf}>
              <Download aria-hidden /> Download report as PDF
            </Button>
            <Button variant="outline" size="lg" className="bg-white" onClick={downloadText}>
              <FileText aria-hidden /> Save locally as text
            </Button>
          </div>
          <span aria-live="polite" className="sr-only">{copied ? "Report copied to clipboard" : ""}</span>

          {secureIntakeEnabled ? (
            <Card className="border-steel-600">
              <CardContent className="pt-5">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck aria-hidden className="size-5 text-steel-700" /> Submit securely
                </h3>
                <p className="mt-1 text-sm text-charcoal-600">
                  Store this report privately with the campaign for organized delivery to Detective Cox.
                  You will receive a lead reference number. A submission is only reported as delivered to
                  APD after actual delivery is confirmed.
                </p>
                <div className="mt-4">
                  <TurnstileWidget onToken={setTurnstileToken} />
                </div>
                {secureResult?.ok ? (
                  <div role="status" className="mt-4 rounded-lg border border-steel-600 bg-steel-100 p-4">
                    <p className="font-medium">
                      Received. Your lead reference number is{" "}
                      <strong>{secureResult.leadReference}</strong>. Keep it for follow-up.
                      {secureResult.storedAttachments > 0
                        ? ` ${secureResult.storedAttachments} attachment${secureResult.storedAttachments === 1 ? "" : "s"} stored.`
                        : ""}
                    </p>
                    {secureResult.failedAttachments.length > 0 ? (
                      <p role="alert" className="mt-2 rounded border border-urgent-700 bg-urgent-100 p-3 text-sm font-medium">
                        These files were NOT stored and have not been delivered:{" "}
                        {secureResult.failedAttachments.join(", ")}. Please email them to
                        Detective Cox directly, referencing {secureResult.leadReference}.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {secureResult && !secureResult.ok ? (
                      <p role="alert" className="mt-4 rounded-lg border border-urgent-700 bg-urgent-100 p-3 text-sm">
                        {secureResult.error}
                      </p>
                    ) : null}
                    {overUploadLimit ? (
                      <p role="alert" className="mt-4 rounded-lg border border-urgent-700 bg-urgent-100 p-3 text-sm">
                        Attachments total {formatBytes(totalAttachmentBytes)}, above the{" "}
                        {formatBytes(MAX_TOTAL_UPLOAD_BYTES)} limit for a single secure upload.
                        Remove some files (they stay listed in your report manifest) and provide
                        them to Detective Cox directly.
                      </p>
                    ) : null}
                    <Button
                      variant="primary"
                      size="lg"
                      className="mt-4"
                      disabled={submitting || overUploadLimit}
                      onClick={submitSecurely}
                    >
                      {submitting ? <Loader2 aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
                      {submitting ? "Submitting…" : "Submit securely"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Navigation */}
      <div className="mt-8 flex gap-3">
        {stepIndex > 0 ? (
          <Button variant="outline" className="bg-white" onClick={goBack}>
            {labels.back}
          </Button>
        ) : null}
        {stepIndex < STEPS.length - 1 ? (
          <Button variant="primary" onClick={goNext} disabled={hashing}>
            {labels.next}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
