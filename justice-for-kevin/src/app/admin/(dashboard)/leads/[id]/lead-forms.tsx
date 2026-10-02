"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Input, Label, Select, Textarea } from "@/components/ui/field";
import { addLeadNote, updateLeadStatus, updateLeadTriage, type ActionResult } from "../actions";

const STATUSES = [
  "unreviewed",
  "needs_follow_up",
  "insufficient_detail",
  "submitted_to_apd",
  "corroborated",
  "duplicate",
  "closed",
  "retain",
] as const;

export function LeadForms({
  leadId,
  currentStatus,
  currentPriority,
  summary,
  normalizedNarrative,
  tags,
}: {
  leadId: string;
  currentStatus: string;
  currentPriority: string;
  summary: string;
  normalizedNarrative: string;
  tags: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: (formData: FormData) => Promise<ActionResult>) => (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) setError(result.error ?? "Action failed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded border border-urgent-700 bg-urgent-100 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-5">
          <h2 className="font-semibold">Update status</h2>
          <form action={run(updateLeadStatus)} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="leadId" value={leadId} />
            <div>
              <Label htmlFor="lead-status">Status</Label>
              <Select id="lead-status" name="status" defaultValue={currentStatus} className="mt-1 w-56">
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-64 flex-1">
              <Label htmlFor="lead-status-reason">Reason (recorded in history)</Label>
              <Input id="lead-status-reason" name="reason" className="mt-1" />
            </div>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="font-semibold">Triage (editable working copy)</h2>
          <form action={run(updateLeadTriage)} className="mt-3 space-y-4">
            <input type="hidden" name="leadId" value={leadId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="lead-priority">Priority</Label>
                <Select id="lead-priority" name="priority" defaultValue={currentPriority} className="mt-1">
                  {["unassigned", "routine", "important", "urgent"].map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="lead-tags">Tags (comma-separated)</Label>
                <Input id="lead-tags" name="tags" defaultValue={tags} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="lead-summary">Summary</Label>
              <Textarea id="lead-summary" name="summary" defaultValue={summary} className="mt-1 min-h-20" />
            </div>
            <div>
              <Label htmlFor="lead-normalized">Normalized narrative</Label>
              <Textarea
                id="lead-normalized"
                name="normalizedNarrative"
                defaultValue={normalizedNarrative}
                className="mt-1"
              />
            </div>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Save triage
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <h2 className="font-semibold">Add internal note</h2>
          <form action={run(addLeadNote)} className="mt-3 space-y-3">
            <input type="hidden" name="leadId" value={leadId} />
            <div>
              <Label htmlFor="lead-note" className="sr-only">
                Note
              </Label>
              <Textarea id="lead-note" name="body" required className="min-h-20" />
            </div>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox name="sensitive" /> Mark as sensitive
            </label>
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null} Add note
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
