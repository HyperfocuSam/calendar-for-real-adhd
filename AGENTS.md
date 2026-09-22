# For agents

This app is meant to be fed by an AI agent. The human clicks one button; the
agent does the rest. Everything goes through a local HTTP API on port 8790.
No auth, no cloud, no build step. If the server is not running, start it with
`node server.js` from this folder.

## The model

- Three pages: `1` Event, `2` Reminders, `3` Deadlines. A card belongs to one page.
- A card is `{ text, date }`. `date` is `YYYY-MM-DD`, local. Nothing else is required.
- Cards colour themselves by how close `date` is. You never set colour or position.
- Crossing out a card moves it to a shared archive (`done.json`). It is not deleted.

## What an agent should do

1. **Add, never duplicate.** `GET /api/entries?page=N` first. If a card with the
   same meaning already exists, `PUT /api/entries/:id` it instead of posting again.
2. **One card per real thing.** A calendar event, a payment, a deadline. Not the
   recurring noise (daily blocks, standing meetings, bank debits). The canvas is
   small on purpose. If a page has more than ~15 cards you have added too much.
3. **Write for a glance.** Under ~80 characters. Lead with the thing, not the
   context. `HKCT invoice 13,000 expected → pay Mimi 6,500` beats a sentence.
4. **Do not touch positions.** `x` and `y` belong to the human's hands.
5. **Done is the human's call.** Never `POST …/done` or `DELETE` a card unless
   the human told you to, in this conversation, about this card.

## Endpoints

All entry routes take `?page=1|2|3` (default 1).

```
GET    /api/entries                 list live cards on a page
POST   /api/entries                 { "text", "date" }              add one
PUT    /api/entries/:id             { "text"?, "date"? }            edit one
DELETE /api/entries/:id                                             remove for good (skips archive)
POST   /api/entries/:id/done                                        cross out → archive
GET    /api/done                    archive, newest first, has "page"
POST   /api/done/:id/revert                                         put back on its page
DELETE /api/done/:id                                                throw away for good
GET    /api/health                  counts per page + done count
```

## Examples

```bash
# add a deadline
curl -s -X POST 'http://localhost:8790/api/entries?page=3' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Stripe CLI key expires — re-pair","date":"2026-12-06"}'

# list events, then edit one
curl -s 'http://localhost:8790/api/entries?page=1'
curl -s -X PUT 'http://localhost:8790/api/entries/<id>?page=1' \
  -H 'Content-Type: application/json' -d '{"date":"2026-10-02"}'
```

Or use the bundled CLI, which does the same with less typing:

```bash
./todo add 3 2026-12-06 "Stripe CLI key expires — re-pair"
./todo list 1
./todo edit 1 <id> --date 2026-10-02
./todo done 1 <id>
```

## A good feeding routine

Once a day, or when the human asks "what's coming up":

1. Read the human's calendar / task tool for the next 60–90 days.
2. Drop recurring items and anything the human did not create for themselves.
3. Diff against `GET /api/entries` on each page.
4. Post only the new ones. Tell the human what you added, in one line each.
