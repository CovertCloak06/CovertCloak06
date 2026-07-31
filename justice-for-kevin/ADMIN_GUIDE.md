# Administrator Guide

## Roles

| Role | Can |
| --- | --- |
| owner | Everything, plus audit export and attachment deletion |
| administrator | Content, leads, entities, users, sources, files, settings, transmissions |
| reviewer | Review leads, entities, sources; no user management, no audit edits (nobody has those) |
| outreach | Campaigns, flyers, distribution, public updates |
| read_only | View dashboard content |

Assign roles at **Admin → Users** (person must sign in once first). Every
role change is audited.

## Daily workflow

1. **Dashboard** — check unreviewed leads, follow-ups, duplicate suggestions.
2. **Leads** — open a lead, read the immutable original narrative, write the
   normalized summary, set priority/tags, add notes (mark sensitive where
   appropriate), and update status with a reason. The original submission can
   never be edited; your working copy is the normalized narrative.
3. **Duplicates** — suggestions list score + reasons. Confirm or reject;
   nothing is ever merged or deleted automatically.
4. **Entities** — create typed entities and link them to leads with a
   relationship + confidence. Entities are never publicly visible and must
   never be treated as suspect lists.
5. **Transmissions** — build a packet (leads + attachment hash manifest),
   deliver it to Detective Cox yourself (email/portal/in person), then update
   the delivery status. Only **delivered/acknowledged** marks leads as
   `submitted_to_apd` — "sent" is never shown as "received."
6. **Sources** — verify placeholders ("Replace with verified source") before
   approving anything for public display; reviews stamp
   `last_reviewed_at`, and corrections publish with a correction note.
7. **Settings** — secure intake toggle, attachment ceiling, emergency notice,
   maintenance mode, approved witness wording (change only on an official
   law-enforcement statement). All changes are audited.

## Publishing rules (hard requirements)

- Never publish unverified lead information, names of alleged suspects, home
  addresses, personal phone numbers, private social profiles, graphic
  content, private medical/family information, or minors' identifying
  information.
- Public comments do not exist on this platform; do not add them.
- The person in released material is a **potential witness** — nothing more.

## Files

- Private originals are only reachable through the audited "Signed URL"
  button (120-second links).
- Deletion is owner-only and soft-delete-first; check evidentiary value with
  the detective before any physical deletion.

## Contact-detail removal requests

If a submitter asks for their contact details to be removed: null the
submitter fields on the lead (status reason: "contact removal request"),
keep the immutable narrative and audit trail, and note the request in lead
notes marked sensitive.
