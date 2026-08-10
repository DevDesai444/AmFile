# AmFile

Internal Amneal Pharmaceuticals document authoring desktop app — a Word-class editor for
regulatory documents (eCTD submissions), with a server-backed project tree, and a
right-hand dock for AI research assistance and compliance checking.

Dark theme, Electron + React + TypeScript, ships for macOS and Windows.

## Status

**Working:** sign-in with GitHub, projects owned by whoever created them, contributors added by
email address whether or not they have used AmFile before, change proposals with word-level diff
and three-way merge, append-only revision history, live updates between users, a hash-chained
audit trail with in-app integrity verification, server-persisted comments, and a Word-class
editor (formatting, styles, tables, images, links, headers/footers, page setup, find & replace,
track changes with accept/reject, print to PDF, native `.docx` import/export).

**Stubbed:** the AI research chat and the compliance-check panels. Both say so in the UI. The
real compliance engine is being built separately (`deficiency-chatbot`); swapping it in is a
provider swap (`src/main/services/compliance/provider.ts`), not a UI rewrite.

**Not built:** e-signature UI (schema exists), mail merge, citations/bibliography, Design
theme presets, compare/combine. Any unbuilt ribbon command says so when clicked rather than
doing nothing.

**AmFile is not "Part 11 compliant", and no software can be.** Every operative clause of the
rule binds *persons who use* a system, not suppliers, and FDA does not certify software. This
implements the technical controls and produces the evidence needed to validate. Validation,
SOPs, training records and compliance status remain Amneal QA's to own.

## Getting started

See **[DEMO.md](DEMO.md)** for the full runbook. Short version — two terminals:

```bash
cd server && npm start   # API + database
```

```bash
npm run dev              # the desktop app
```

Sign in with GitHub. There are no sample accounts and no "create account" screen — AmFile
issues no accounts of its own, and the verified email GitHub returns is your identity.

GitHub sign-in needs a public client id (no secret; the device flow does not use one). Register
an OAuth app at <https://github.com/settings/applications/new>, tick **Enable Device Flow**, and
start the server with it:

```bash
cd server && AMFILE_GITHUB_CLIENT_ID=Ov23xxxxxxxxxxxx npm start
```

Without it the server advertises `github: false` and the app falls back to email/password, so no
unusable button is ever shown. See **[DEMO.md](DEMO.md)** for the full walkthrough.

### Who can see what

There is no administrator. A top-level folder is a project; whoever creates it owns it and
decides who else gets in, and access inherits down to every sub-folder and document. Nobody sees
a project because of a role — roles no longer exist. The trade-off is stated rather than hidden:
if every owner of a project leaves, that project is unreachable, and adding a second owner is
the only recovery path.

The server needs the Databricks CLI signed in, because the database is Lakebase and it
authenticates with a Databricks token. Run `databricks auth login` if the server won't start.

```bash
npm run typecheck  # tsc --noEmit on both main and renderer
npm run build       # production build (out/)
npm run dist:mac    # package a macOS build (dmg + zip) into dist/
npm run dist:win    # package a Windows build (NSIS installer) into dist/
```

Windows packaging can be cross-built from macOS via `electron-builder --win`, but the resulting
installer should be manually verified on a real Windows machine before distributing it — that
verification hasn't been done as part of this build.

## Architecture

- `server/` — Fastify API on Lakebase Postgres: auth, documents, revisions, locks, comments,
  audit trail. See [server/README.md](server/README.md) for the schema and the append-only
  guarantees.
- `src/renderer/src/api/` — HTTP/WebSocket client the renderer uses to reach the server.
- `src/main/` — Electron main process: window/menu lifecycle, IPC handlers (`ipc/`), and
  services (`services/`) for docx import/export, the filesystem tree, and the AI/compliance
  providers.
- `src/preload/` — the only bridge between renderer and main (`contextIsolation: true`,
  `nodeIntegration: false`); exposes a single `window.amfile` object.
- `src/renderer/` — the React app: ribbon, navigator, editor, dock, status bar, all wired to
  zustand stores in `src/renderer/src/store/`.
- `design-reference/` — the original approved HTML mockup, kept as the visual source of truth.

## Document (.docx) fidelity

AmFile reads and writes real `.docx` files (via `mammoth` for import, `docx` for export), not a
custom format — but round-tripping an arbitrary Word document isn't lossless in both directions.

**Preserved on export** (covered by `npm test`, which asserts against the generated OOXML):
headings, paragraphs, lists, tables, images, hyperlinks, bold/italic/underline/strike/sub/superscript,
font family and size, text colour, highlighting, alignment, indentation, line spacing, explicit page
breaks, the CTD Section / Reference / Table Caption paragraph styles, page setup, and headers/footers.
Track changes export as real OOXML `w:ins`/`w:del` with author and timestamp, reviewable in Word.

**Lost on import:** any *pre-existing* tracked changes or comments in the source file, table
borders/shading, and custom XML parts. Import is handled by `mammoth`, which resolves tracked
changes to plain text and drops comments. `importDocx` detects both and returns warnings.

**Known gap:** those import warnings are currently only logged to the console, not shown in the UI —
so the data-loss notice is invisible to the user. Do not rely on the app to stop you from opening a
document whose revision history matters; check it in Word first.

**Comments do not persist at all** — they live in memory for the session and are lost on reopen.

Earlier versions of this README overstated export fidelity: font, colour, highlight, indent, line
spacing, page breaks and the CTD paragraph styles were in fact silently dropped. That is fixed and
now regression-tested, but treat any fidelity claim here as true only where a test asserts it.

## Pagination

The editing view is continuous-scroll with page-shaped visual framing, not live multi-page
reflow — community Tiptap pagination packages are unreliable around tables/images, so real
pagination happens at **export/print time** via Chromium's own `printToPDF`, driven by the
page-setup model. Insert an explicit page break (Insert → Page break) for an intentional split.
`printToPDF` uses one header/footer template per print job, so per-section or
first-page-different headers aren't reachable in this version.

## Track changes

Hand-rolled (no unmaintained community package): typing while tracking is on wraps new text in
an `insertion` mark; Backspace/Delete mark the removed character as `deletion` instead of
removing it. The Review dock lists changes with Accept/Reject. Known simplification: replacing a
multi-character selection by typing over it deletes the selection outright rather than marking
it — covers the common single-character-at-a-time editing pattern, not every possible edit shape.

## Known gaps (explicitly out of scope for this pass, not silently faked)

- **Mail merge** (Mailings ribbon tab) — buttons are present but not wired.
- **Footnote/endnote authoring and citation management** — basic footnote insertion only; no
  bibliography/source manager.
- **Design theme presets** ("Amneal CTD" / "eCTD plain") — buttons present, not wired to an
  actual theming system.
- **Live multi-page pagination in the editing view** — see Pagination above.
- **Per-section / first-page-different print headers** — see Pagination above.
- **Spelling** uses Electron's native OS spellchecker (red squiggles + right-click suggestions)
  rather than an in-app dictionary UI; there's no thesaurus or read-aloud implementation.
- **Compare/combine documents, restrict editing** — ribbon buttons present, not wired.
- **Windows installer** — packaging config is in place and cross-builds successfully from macOS,
  but hasn't been manually verified on a real Windows machine.

## Signing & notarization

Both are env-var driven and intentionally left unset in this repo — no certificates are
committed. Unsigned local builds skip signing cleanly (`CSC_IDENTITY_AUTO_DISCOVERY=false`).
To enable later: set `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` (or an App Store Connect API key)
for macOS notarization, and `CSC_LINK` / `CSC_KEY_PASSWORD` for Windows code signing — supply
them as CI secrets, never commit `.p12`/`.pfx` files. Unsigned Windows builds will show a
SmartScreen warning on first run; that's expected for internal test builds, not a bug.
