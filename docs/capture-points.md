# Capture points

A capture point is anything put out into the world that adds people to a pipeline: a website form, a UBO form,
a QR code on a business card. Each one points at a pipeline lane **by id**, so renaming a pipeline or lane never
breaks it.

Code: `api/src/app/capture-points/` (model `CapturePoint` in `apps/api/prisma/schema.prisma`).

## What happens when someone comes in

One routine, `captureToPipeline()` (`capture-points/capture.util.ts`), for every kind of capture point:

- **Already on that pipeline** (an open card whose email, or whose person's email, matches): the touch is logged on
  that card's Activity and Last contact is updated. The card does not move.
- **New**: a card in the capture point's lane, source Inbound, a "Lead Source" note, next action
  "Follow up: <capture point>" tomorrow, and `Lead.capturePointId` set. What they wrote goes on the card's Activity.
- The capture point's `captureCount` and `lastCapturedAt` go up.
- A capture point that is turned off (`isActive: false`) captures nothing.

## Three ways in

1. **UBO forms** (Forms area): a capture point with `formId` set (one per form). On a public submission
   (`FreeFormDestination.submit`) the person goes to the pipeline and the submission counts as accepted, so it
   skips Waiting for review. A failure there never fails the submission.
2. **Outside forms** (e.g. the heyupstart.com contact form's Lambda): `POST /leads/ingest` with an `x-api-key`
   service key and `capturePointId`:

   ```json
   { "capturePointId": "<id>", "name": "Pat Lee", "email": "pat@example.org", "organization": "Example Org",
     "phone": "503-555-0100", "note": "What they wrote", "noteTitle": "Contact form: Ask a General Question" }
   ```

   Returns `{ "duplicate": <matched an open card>, "leadId": "<id>" }`, or `{ "skipped": true }` when the capture
   point is off. Without `capturePointId`, ingest works as before (`pipelineName`/`stageName` by name, always a new
   card) for the Donor Readiness Audit and Mirador checkout.
3. **Any website's form, from the browser** (no server, no key): `POST /api/capture/:id` with JSON
   `{ name, email, phone, organization, message, subject, website, t }`. Name or email is required. `website` is a
   hidden honeypot field (filled in = bot) and `t` is milliseconds on the form (under 3000 = bot); bots get
   `{ "ok": true }` and nothing is saved. Other protections: the capture point's **Allowed websites** (the browser's
   Origin must be listed; empty = any website), 10 posts a minute per visitor, and the on/off switch (off answers 410).
   Answers `{ "ok": true, "duplicate": <matched an open card> }`. Capture points that belong to a UBO form don't take
   these posts (404). CORS is open on this path (`public-forms-cors.ts`).
4. **QR codes and links**: a small UBO form with a public link, sent to a pipeline as in 1.

The service key is a tenant-wide secret: only call ingest from a server (a Lambda), never from a web page.

## API (staff, Pipeline area)

`GET /capture-points?pipelineId=&formId=`, `GET /capture-points/:id`, and with Pipeline setup:
`POST /capture-points` `{ name, stageId, formId?, isActive?, allowedOrigins? }`, `PATCH /capture-points/:id` `{ name?, stageId?, isActive?, allowedOrigins? }`,
`DELETE /capture-points/:id` (cards it brought in stay; they lose the link).

`GET /pipelines` gives each lane a `capturePointCount` (active ones) for the board badges.

## Pipelines and lanes

- Deleting a lane moves its capture points with its cards, or to the pipeline's first remaining lane when it had no
  cards.
- A pipeline with capture points can't be deleted until they point elsewhere or are deleted.
