# Done clock — design

Date: 2026-09-14
Project: SAM-TodoCanva

## Intent

Crossing out a card (the existing **×**) means done, not gone. Done cards leave the canvas and collect in a shared archive, opened from a **CLOCK** pill on the main page. A row can be reverted to its original page, or thrown away for good.

## Decisions

- **×** on a canvas card marks it done. It is no longer a hard delete.
- One shared done list across pages 1–3. Each row shows the original page name (Event / Reminders / Deadlines).
- Each clock-list row has **REVERT** and **×** (permanent delete). No confirm, matching the old canvas ×.
- **CLOCK** pill sits bottom-right, to the left of FLOAT, same size as SAVE / FLOAT.
- The list opens as a centre overlay, same pattern as the LOG dialog.

## Data

`data/done.json` — array, shared across pages.

```json
{
  "id": "mtsiysmk-cveufy",
  "text": "Dentist",
  "date": "2026-09-11",
  "page": 1,
  "x": 128,
  "y": 96,
  "createdAt": "…",
  "doneAt": "…"
}
```

Live page files stay live-only. Daily backups copy `done.json` as `done-YYYY-MM-DD.json` (last 30 days).

## API

Moves are one server operation. Write order is chosen so a crash cannot lose a card:

| Action | Call | Write order |
|---|---|---|
| Cross out | `POST /api/entries/:id/done?page=N` body `{ x?, y? }` | archive first, then remove from the page |
| Revert | `POST /api/done/:id/revert` | restore to original page first, then remove from archive |
| Throw away | `DELETE /api/done/:id` | remove from archive only |
| List | `GET /api/done` | newest `doneAt` first |

Duplicate-in-both (crash between the two writes) is recoverable: the card is still live on the canvas; a second × upserts the archive row; a second revert is a no-op add and then drops the archive row.

## UI

- **CLOCK** is in the card keep-out list, so cards never sit on it.
- Overlay: Escape or click the dimmed background to close.
- Empty state: “Nothing done yet.”
- Revert restores the saved `x,y` on the original page. The overlay does not switch pages. If you are already on that page, the card appears immediately.
- Offline: the done list uses `localStorage` cache `todocanva.cache.done`, same idea as the canvas cache. Failed writes alert, same as today’s delete.

## Out of scope

- Count badge on CLOCK
- Auto-switch to the original page on revert
- Confirm dialogs
- Editing a done item in the list
