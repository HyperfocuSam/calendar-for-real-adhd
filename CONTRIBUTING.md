# Contributing

Thanks for looking. A few things to know before you open a PR.

**The point of this app is what it leaves out.** No lists, no tags, no
priorities, no projects, no sync, no accounts. If a feature adds a decision the
user has to make every time they log something, it is probably not for here.

**What is welcome**

- Bugs, especially around placement, drag, and the offline cache.
- Agent integrations: an MCP server, a Raycast command, a cron example,
  an importer for a calendar or task tool. Put them in `integrations/`.
- Accessibility and keyboard-only use.
- Ports of `todo` (the CLI) to other shells.

**How**

1. Zero dependencies stays zero. `server.js` is Node 18+ stdlib only;
   `index.html` is one file with no build step.
2. Keep the data files human-readable JSON. People will edit them by hand.
3. Run it, click it, cross a card out, reload. If that still works, open the PR.
