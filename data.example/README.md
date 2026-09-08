# data.example/

Sample content showing the exact layout of the real `data/` folder, which is
git-ignored because it holds personal entries.

On first run `server.js` copies this folder to `data/` if no `data/entries.json`
exists yet, re-dating each sample entry relative to today (using its
`daysFromToday` field) so the colour groups look right. Delete the sample cards
from the page whenever you like, or start clean with `rm -rf data/` before the
first run and an empty canvas is created instead.

```
entries.json      page 1 · Event
entries-2.json    page 2 · Reminders
entries-3.json    page 3 · Deadlines
settings.json     { "floating": true }
backups/          pageN-YYYY-MM-DD.json copies, written daily by the server
server.log        written by start.command / the Launch Agent
```
