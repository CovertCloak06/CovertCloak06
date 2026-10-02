"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { createManualLead } from "./actions";

/** Manual lead intake (phone / email / in-person). */
export function NewLeadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    startTransition(async () => {
      const result = await createManualLead(formData);
      if (result.ok && result.id) {
        setOpen(false);
        router.push(`/admin/leads/${result.id}`);
      } else {
        setError(result.error ?? "Failed to record lead");
      }
    });
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Record lead
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Record a new lead"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-charcoal-950/60 p-4"
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Record lead</h2>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
                <X aria-hidden />
              </Button>
            </div>
            <form action={submit} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="nl-title">Title *</Label>
                <Input id="nl-title" name="title" required className="mt-1" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="nl-channel">Intake channel</Label>
                  <Select id="nl-channel" name="intakeChannel" defaultValue="phone" className="mt-1">
                    {["web", "email", "phone", "social", "in_person", "law_enforcement", "other"].map((channel) => (
                      <option key={channel} value={channel}>
                        {channel.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="nl-class">Source classification</Label>
                  <Select id="nl-class" name="sourceClassification" defaultValue="secondhand" className="mt-1">
                    {["firsthand", "recognition", "secondhand", "online", "speculation"].map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="nl-narrative">Original narrative (immutable once saved) *</Label>
                <Textarea id="nl-narrative" name="originalNarrative" required className="mt-1" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="nl-name">Submitter name</Label>
                  <Input id="nl-name" name="submitterName" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="nl-phone">Phone</Label>
                  <Input id="nl-phone" name="submitterPhone" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="nl-email">Email</Label>
                  <Input id="nl-email" name="submitterEmail" className="mt-1" />
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-sm">
                <Checkbox name="anonymous" /> Anonymous submitter
              </label>
              {error ? (
                <p role="alert" className="rounded border border-urgent-700 bg-urgent-100 p-2.5 text-sm">
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
                  Save lead
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
