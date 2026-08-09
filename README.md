# AmFile

Internal Amneal Pharmaceuticals document authoring desktop app — a Word-class editor for
regulatory documents (eCTD submissions), with a real filesystem-backed document tree, and a
right-hand dock for AI research assistance and compliance checking.

Dark theme, Electron + React + TypeScript, ships for macOS and Windows.

## Status

The editor, document tree, and file I/O are real and functional. The AI research chat and
compliance-check panels are wired to **stub providers** — the real compliance backend is being
built separately (`deficiency-chatbot` repo) and isn't ready yet; swapping it in later is a
provider swap (`src/main/services/compliance/provider.ts`), not a UI rewrite. Same for AI chat
(`src/main/services/ai/provider.ts`) once a model/provider is chosen.

## Getting started

```bash
npm install
npm run dev        # launches the app with hot reload
```

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

**Preserved on import:** headings, lists (including multilevel), tables (text + basic character
formatting), images, footnotes/endnotes, hyperlinks, bold/italic/underline/strike/sub/superscript,
and — via a custom OOXML reader — page setup. **Lost on import:** any *pre-existing* tracked
changes or comments in the source file (the app blocks import with a warning and lets you accept
them into plain text or open a copy in Word first, rather than silently discarding a reviewer's
revisions), table borders/shading, and custom XML parts.

**AmFile-authored content round-trips well in both directions**, including its own track changes
and comments — accepted/rejected changes made in AmFile export as real OOXML `w:ins`/`w:del` and
comment parts, openable and reviewable in actual Microsoft Word.

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
