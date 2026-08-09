<!-- refreshed: 2026-08-09 -->
# Codebase Concerns

**Analysis Date:** 2026-08-09

AmFile today is a **single-user, single-window, filesystem-backed** Electron editor. It is about
to become a **multi-user, server-backed, 21 CFR Part 11-regulated** system (Databricks Apps +
Lakebase Postgres, Databricks SSO, check-out locking, audit trail, e-signatures).

Every concern below is scored for that target, not for the app as it stands:

| Severity | Meaning |
|----------|---------|
| **S0 — Blocker** | Must be fixed before or during the server/Part 11 build. Either causes silent data loss, or there is no way to build the regulated feature on top of the current code. |
| **S1 — High** | Will cause user-visible failures or audit findings in the regulated build. Fix early. |
| **S2 — Medium** | Ordinary tech debt. Fix opportunistically. |
| **S3 — Low** | Cosmetic or cleanup. |

## Ranked Summary

| # | Concern | Severity | Blocks |
|---|---------|----------|--------|
| C1 | Track-change mark attrs are **functions** → `save()` throws `DataCloneError`, silently | **S0** | Everything. Documents with tracked changes cannot be saved at all. |
| C2 | `save()` has no error handling; failure is invisible | **S0** | Network saves, Part 11 §11.10(a) record accuracy |
| C3 | No IPC path validation — `openRoots` is write-only, `zod` unused | **S0** | Access controls, Part 11 §11.10(d) |
| C4 | CSP has no `connect-src` → falls back to `default-src 'self'` | **S0** | Phase A. All server/SSO calls will be blocked. |
| C5 | Comments have **zero** persistence (not in the .docx, not anywhere) | **S0** | Multi-user review, Part 11 §11.10(e) |
| C6 | Accept/reject of a tracked change is not recorded anywhere | **S0** | Audit trail, Part 11 §11.10(e) |
| C7 | Author identity hardcoded to `'local-user'` / `'You'` | **S0** | SSO attribution, Part 11 §11.10(d)(g), §11.50 |
| C8 | No `documentId`, no revision number; `savedAt` is a display string | **S0** | Check-out locking, conflict detection, versioning |
| C9 | Import warnings are `console.warn`'d — invisible to the user | **S0** | Silent loss of a reviewer's revision history |
| C10 | No dirty check on open; no quit guard; no autosave; no recovery file | **S0** | Data loss, Part 11 §11.10(c) record protection |
| C11 | Stores are never reset between documents; `File → New` doesn't clear the editor | **S0** | Cross-document data contamination |
| C12 | `.docx` round-trip drops more than the README admits | **S0** | Submission fidelity |
| C13 | PDF export has no print stylesheet — captures app chrome | **S1** | eCTD PDF artifact quality |
| C14 | `registerWindowHandlers` called inside `createMainWindow` | **S1** | macOS re-activate crash |
| C15 | No tests, no linter, no formatter, no CI | **S1** | CSV / GAMP 5 validation evidence, Part 11 §11.10(a) |
| C16 | `sandbox: false`, unguarded `shell.openExternal`, no navigation guard | **S1** | Electron hardening review |
| C17 | Images inline as base64; export hardcodes PNG @ 400×300 | **S1** | Payload size over network, image corruption |
| C18 | `readProjectTree` is unbounded, symlink-unsafe, unthrottled | **S1** | Large eCTD trees, hang/crash |
| C19 | Track-changes plugin misses several common edit shapes | **S1** | Audit completeness |
| C20 | Stub AI/compliance output is presented with no in-context disclaimer | **S1** | GxP misuse risk |
| C21 | README overstates document fidelity | **S1** | Documentation accuracy is itself a Part 11 problem |
| C22 | Duplicated type declarations (`PageSetup`, `FsTreeNode`) | **S2** | Drift |
| C23 | Dead code: `docx:createBlank`, `fs:openFileDialog`, `treeStore.refresh`, `chokidar`, `zod` | **S2** | Attack surface, confusion |
| C24 | Page count in the status bar is an estimate | **S2** | User trust |
| C25 | Renderer imports main-process types by relative path | **S2** | Coupling |
| C26 | `noImplicitAny: false` despite `strict: true` | **S2** | Type safety |
| C27 | `window.prompt` / `window.alert` used for real data entry | **S2** | UX, testability |

---

## Known Bugs

### C1 — Track-change marks carry function-valued attributes; saving throws silently

**Severity: S0 — the single most severe issue in the codebase.**

- **Files:**
  - `src/renderer/src/editor/extensions/trackChangeMarks.ts:3-8` — `authorAttrs` declares
    `timestamp: { default: () => new Date().toISOString() }` and
    `changeId: { default: () => \`c-${Math.random()...}\` }`
  - `src/renderer/src/editor/extensions/trackChangesPlugin.ts:41` and `:67` — marks are created
    with `.create({})`, i.e. **all attrs fall through to those defaults**
  - `src/renderer/src/editor/useDocumentIO.ts:37` — `window.amfile.docx.write(targetPath, model)`
  - `src/renderer/src/editor/extensions/comment.ts:23` — same pattern on `CommentMark.timestamp`

- **Root cause:** ProseMirror treats `AttributeSpec.default` as a **literal value**, not a factory.
  Verified in `node_modules/prosemirror-model/dist/index.cjs:1884` (`this.default = options.default`)
  and `:1699` (`if (attr.hasDefault) given = attr["default"]`). The function object itself becomes
  the attribute value.

- **Verified behaviour** (probe run against this repo's `prosemirror-model`):
  ```
  timestamp typeof: function
  changeId  typeof: function
  toJSON marks[0].attrs.timestamp typeof: function
  structuredClone THREW: DataCloneError ()=>new Date().toISOString() could not be cloned.
  ```

- **Symptoms:**
  1. `editor.getJSON()` returns mark attrs containing functions. `ipcRenderer.invoke` serialises
     with the Structured Clone Algorithm, which rejects functions → **`docx:write` rejects with
     `DataCloneError` for any document containing a tracked change.** Because `save()` has no
     `try/catch` (C2), the user sees no error; the title bar simply stays on "Unsaved"
     (`src/renderer/src/titlebar/TitleBar.tsx:36`). **Turn track changes on, type one character,
     press Cmd+S — the file is never written and nothing tells you.**
  2. Same for comments created by **pasting** previously-commented text: `CommentMark.parseHTML`
     (`comment.ts:26-28`) has no per-attribute `getAttrs`, so pasted comment marks take the
     function default too.
  3. `String(mark.attrs.timestamp)` in `src/main/services/docx/export.ts:64` and `:72` would write
     the literal source text `"()=>new Date().toISOString()"` into the OOXML `w:ins`/`w:del`
     `date` attribute.
  4. `String(mark.attrs.changeId)` in `src/renderer/src/editor/useTrackChangesSync.ts:18` returns
     the same string for every mark, so `collect()` merges every contiguous run of tracked text
     into one Review-panel entry regardless of author or edit session — Accept/Reject then applies
     to the merged range.
  5. `renderHTML` (`trackChangeMarks.ts:22-24`) stringifies the function into the live DOM
     attribute.

- **Part 11 impact:** This is not just a save bug. It means the tracked-change record currently has
  **no valid timestamp and no stable identity**, which is precisely what §11.10(e) requires
  ("computer-generated, time-stamped audit trails to independently record ... the date and time of
  operator entries"). Nothing built on top of these marks can be trusted until this is fixed.

- **Fix approach:**
  1. In `trackChangeMarks.ts` and `comment.ts`, change all `default: () => ...` to plain literals
     (`default: null`).
  2. In `trackChangesPlugin.ts:41,67`, create marks with explicit attrs:
     `schema.marks.deletion.create({ authorId, authorName, timestamp: new Date().toISOString(), changeId: crypto.randomUUID() })`,
     sourcing `authorId`/`authorName` from the (future) session store rather than the constant.
  3. Add `getAttrs` to `CommentMark.parseHTML` so pasted comment marks parse their real attrs.
  4. Add a regression test that round-trips `editor.getJSON()` through `structuredClone`.

### C11 — Store state is never reset between documents

**Severity: S0.** Every zustand store outlives the document it belongs to.

- **Files:**
  - `src/renderer/src/store/documentStore.ts:73-75` — `openDocument` sets `filePath`, `fileName`,
    `dirty`, `savedAt`, `pageSetup`. It does **not** touch `headerText` / `footerText`.
    `newDocument` (`:75`) does not touch them either.
  - `src/renderer/src/editor/useDocumentIO.ts:43-55` — `openFromPath` calls
    `editor.commands.setContent(...)` and `openDocument(...)`. Nothing clears `commentStore`,
    `trackChangesStore`, or `complianceStore`.
  - `src/renderer/src/ribbon/ribbonActions.ts:17-20` — `file.new` calls `doc.newDocument()` and
    switches views. `setContent` / `clearContent` is called in exactly one place in the entire
    codebase (`useDocumentIO.ts:47`), and it is not this one.

- **Symptoms:**
  1. Open document A (which has a header), open document B → B silently inherits A's header/footer
     text, and the next save **writes A's header into B's .docx**.
  2. Open A with comments, open B → A's comments still list in the Review dock, anchored to
     positions in B's text.
  3. **`File → New` keeps the previous document's entire body**, clears `filePath`, and the next
     save writes A's content to a brand-new file under a new name.

- **Part 11 impact:** Content from one submission document being written into another is a
  record-integrity failure of the most direct kind (§11.10(a),(c)). In a multi-user build the
  wrong content could be committed to the server under another user's document ID.

- **Fix approach:** Introduce a single `resetDocumentSession()` action that clears
  `documentStore` header/footer, `commentStore`, `trackChangesStore`, `outlineStore`, and
  `complianceStore`, and calls `editor.commands.clearContent(true)`. Call it from both
  `openFromPath` and `file.new`. Better: make document session state a keyed slice so the
  identity of the open document is structurally impossible to confuse.

### C14 — `registerWindowHandlers` is called from inside `createMainWindow`

**Severity: S1.**

- **Files:** `src/main/index.ts:65` (call site, inside `createMainWindow`), `:91-93`
  (`app.on('activate', ...)` calls `createMainWindow()` again), `src/main/ipc/window.ts:4-21`
  (four `ipcMain.handle` registrations).
- **Symptoms:** On macOS, closing all windows keeps the app alive (`index.ts:96-100` only quits on
  non-darwin). Clicking the dock icon fires `activate` → `createMainWindow()` →
  `registerWindowHandlers()` → `ipcMain.handle('window:minimize', ...)` on an already-registered
  channel → Electron throws `Error: Attempted to register a second handler for 'window:minimize'`.
  The window never appears.
- **Trigger:** macOS only. Close the window, then click the dock icon.
- **Fix approach:** Split `registerWindowHandlers` into a once-only `registerWindowHandlers()`
  (the four `ipcMain.handle` calls, hoisted next to the other `register*Handlers()` calls at
  `index.ts:83-87`) and a per-window `attachWindowEvents(win)` (the `maximize`/`unmaximize`
  listeners at `window.ts:23-24`).

### C13 — PDF export has no print stylesheet

**Severity: S1.**

- **Files:** `src/main/ipc/print.ts:11-24` (`win.webContents.printToPDF`),
  `src/renderer/src/App.css:1,305,310,988` (`.app-shell { overflow: hidden }`,
  `.app-center { overflow: auto }`, `.editor-scroll { overflow: auto }`).
- **Evidence:** `grep -rn "@media print" src/` and `grep -rn "@page" src/` both return **nothing**.
  There is no print stylesheet anywhere in the 1591 lines of CSS.
- **Symptoms:** `printToPDF` renders the **entire live window**, so the exported PDF includes the
  title bar, ribbon, navigator tree, dock panel, and status bar over the dark `#0f1113` theme.
  Because the editor sits inside two nested `overflow: auto` containers, Chromium's print layout
  clips the document to the visible scroll box rather than expanding it — content below the fold is
  expected to be cut off. The `transform: scale(zoom/100)` on `.editor-page`
  (`EditorCanvas.tsx:156`) also applies to the print render.
- **Verification needed:** run `Export PDF` on a >1-page document and confirm the clipping
  behaviour before sizing the fix.
- **Impact:** PDF is the eCTD submission artifact format. This is the app's regulatory output path.
- **Fix approach:** Add an `@media print` block that hides `.titlebar`, `.tab-bar`, `.ribbon`,
  `.navigator`, `.dock`, `.status-bar`; sets `.app-shell`, `.app-center`, `.editor-scroll` to
  `overflow: visible; height: auto`; forces a light background; neutralises the zoom transform; and
  declares `@page { size: ...; margin: 0 }` to pair with `preferCSSPageSize: true`. Longer term,
  render to PDF from a hidden off-screen `BrowserWindow` containing only the document, so print
  fidelity is independent of the app shell.

### C19 — Track-changes plugin misses common edit shapes

**Severity: S1.** Documented at `src/renderer/src/editor/extensions/trackChangesPlugin.ts:20-22`,
but the gap is wider than the comment admits.

- **Files:** `trackChangesPlugin.ts:27-51` (keyboard shortcuts), `:57-75` (appendTransaction),
  `src/renderer/src/editor/findReplace.ts:34-44`.
- **Gaps:**
  1. **Typing over a multi-character selection** deletes it outright — the documented gap. The
     `markDeletion` handler bails at `:33` (`if (!selection.empty) return false`).
  2. **Find & Replace destroys text with no deletion record.** `replaceMatch`
     (`findReplace.ts:35`) uses `insertContentAt(match, replacement)`, which replaces a range.
     `appendTransaction` marks only the inserted side (`:66-69`); the original text is gone with no
     `w:del`. `replaceAll` does this for every match in the document.
  3. **Cut / paste-over / drag-move** hit the same path.
  4. `appendTransaction` marks *every* insertion when tracking is on, including programmatic ones
     (TOC insertion at `commandHandler.ts:154-168`, image insertion, undo/redo replays).
  5. Deletions are recorded a character at a time (`:35-36` operate on a single position), so a
     held-down Backspace produces many separate marks that then merge unpredictably via C1's
     broken `changeId`.
- **Part 11 impact:** §11.10(e) requires the audit trail to record changes without obscuring
  previously recorded information. Silently discarding replaced text is exactly that failure.
- **Fix approach:** Move all revision recording into a single `appendTransaction` that inspects
  `ReplaceStep`/`ReplaceAroundStep` mappings and marks both the removed and inserted ranges,
  instead of intercepting keystrokes. Drop the keyboard-shortcut path entirely.

### C24 — Status-bar page count is an estimate

**Severity: S2.** `src/renderer/src/editor/useEditorStats.ts:8,21-22` — pages =
`ceil(dom.scrollHeight / 1000px)`, `max`'d against the explicit page-break count. The status bar
(`src/renderer/src/statusbar/StatusBar.tsx`) presents it as a fact, and `page` is hardcoded to `1`.
Documented in `README.md:63-69`; acceptable for now, but the number will not match the exported PDF.
**Fix approach:** label it "≈" in the UI, or derive page count from the print render.

---

## Data Loss & Integrity

### C2 — `save()` has no error handling

**Severity: S0.**

- **File:** `src/renderer/src/editor/useDocumentIO.ts:23-41`. `await window.amfile.docx.write(...)`
  at `:37` is unguarded; `markSaved()` at `:40` is unconditional on the lines that follow.
- **Symptoms:** Any rejection — a locked file, a full disk, a permissions error, C1's
  `DataCloneError`, or (soon) a network timeout, a 401 from SSO, or a 409 from check-out locking —
  becomes an unhandled promise rejection. `dirty` stays `true`, and the only feedback is the
  "Unsaved" badge that was already there (`TitleBar.tsx:36`).
- **Multi-user impact:** Once saves cross a network, transient failure becomes the normal case.
  Without a visible error the user will keep editing on top of a document that is not on the server.
- **Part 11 impact:** §11.10(a) requires the system to "discern invalid or altered records". A save
  path that cannot report failure cannot satisfy that.
- **Fix approach:** Wrap in `try/catch`; on failure keep `dirty: true`, surface a non-dismissable
  banner, and write a local recovery copy. Only call `markSaved()` on a confirmed write. Return a
  typed result (`{ ok: true } | { ok: false, code, message }`) from `docx:write` rather than
  `true`, so the renderer can distinguish "conflict" from "network" from "permission".

### C10 — No dirty guard on open, on new, or on quit; no autosave; no recovery

**Severity: S0.**

- **Files:**
  - `src/renderer/src/editor/EditorCanvas.tsx:128-132` — `pendingOpenPath` effect calls
    `openFromPath` immediately, with no `dirty` check.
  - `src/renderer/src/navigator/ProjectTree.tsx:59-67` — a single click on a `.docx` row calls
    `requestOpen(node.path)`.
  - `src/renderer/src/ribbon/ribbonActions.ts:17-20` — `file.new`, likewise unguarded.
  - `src/main/index.ts` — no `before-quit`, no `window.on('close')` guard.
    `grep -rn "before-quit\|beforeunload\|will-prevent-unload" src/` returns nothing.
  - `dirty` is read in exactly one place: `src/renderer/src/titlebar/TitleBar.tsx:10,36`. Nothing
    gates a destructive action on it.
  - No autosave and no recovery file exist. `.amfile-recovery/` appears in `.gitignore:6` and in the
    ignore set at `src/main/services/fs/tree.ts:11`, but nothing ever writes it — a vestige of a
    feature that was never built.
- **Symptoms:** Clicking another document in the tree, choosing File → New, or quitting the app
  discards unsaved work with no prompt. A crash loses everything since the last manual Cmd+S.
- **Part 11 impact:** §11.10(c) requires "protection of records to enable their accurate and ready
  retrieval throughout the records retention period".
- **Fix approach:** Guard `openFromPath` and `newDocument` behind a `confirmDiscard()` that checks
  `dirty` and offers Save / Discard / Cancel. Add `mainWindow.on('close')` +
  `app.on('before-quit')` handlers that ask the renderer for `dirty` and `event.preventDefault()`.
  Add a debounced autosave to `app.getPath('userData')/recovery/<documentId>.json` and offer
  recovery on next launch. Once the server exists, autosave becomes a draft PUT.

### C5 — Comments have no persistence whatsoever

**Severity: S0.**

- **Files:**
  - `src/renderer/src/store/commentStore.ts:21-31` — comment bodies live only in a zustand store.
    No `persist` middleware, no IPC, no disk.
  - `src/renderer/src/editor/useDocumentIO.ts:30-36` — the model sent to `docx:write` contains
    `title`, `content`, `pageSetup`, `header`, `footer`. **Comment bodies are not included.**
  - `src/main/services/docx/export.ts:35-90` — `runsFromInline` handles `bold`, `italic`,
    `underline`, `strike`, `subscript`, `superscript`, `link`, `insertion`, `deletion`. The
    `comment` mark is **not** in the list; it is silently dropped.
  - `src/main/services/docx/html-to-pm.ts:4-14` — `MARK_TAGS` has no comment entry, and mammoth
    drops `w:commentReference` anyway. Nothing can ever be read back.
- **Symptom:** Write a comment, save, close, reopen — the comment is gone, and so is the highlight.
  Nothing warns the user.
- **`README.md:58-60` claims the opposite:** "including its own track changes and comments —
  ... comment parts, openable and reviewable in actual Microsoft Word." That is not implemented.
- **Multi-user impact:** Review comments are the core artifact of a multi-user review workflow.
  There is currently no storage layer for them at all.
- **Part 11 impact:** A reviewer's comment is part of the record. §11.10(e) applies.
- **Fix approach:** Short term, emit real OOXML comment parts on export (the `docx` package
  supports `comments` on `Document`) and parse `word/comments.xml` on import via the existing JSZip
  path in `import.ts:58-84`. Target-state: comments become server-side rows keyed by
  `(documentId, revision, anchor)`, not .docx payload — which requires C8.

### C9 — Import warnings are swallowed into the console

**Severity: S0.**

- **Files:**
  - `src/main/services/docx/import.ts:28-52` — `scanForUnsupportedRevisions` correctly counts
    `<w:ins`, `<w:del`, and `<w:commentReference` in the raw OOXML and builds real,
    well-written warning strings.
  - `src/renderer/src/editor/useDocumentIO.ts:50-52` — the entire consumer:
    ```ts
    if (result.warnings.length > 0) {
      console.warn('[docx import]', result.warnings.join('\n'))
    }
    ```
- **Symptom:** Opening a Word document that a reviewer has marked up **silently accepts all of
  their tracked changes into plain text and drops all of their comments.** The user is never told.
  The detection logic exists and works — only the presentation is missing.
- **`README.md:53-56` claims the opposite:** "the app blocks import with a warning and lets you
  accept them into plain text or open a copy in Word first". No such block or dialog exists.
- **Part 11 impact:** Silent destruction of another party's revision history. Directly contrary to
  §11.10(e)'s "shall not obscure previously recorded information".
- **Fix approach:** Return the warnings to a modal that blocks the open until the user explicitly
  chooses "Accept all into plain text" or "Cancel". Log the decision to the audit trail. Once the
  server exists, refuse the import outright for documents under formal review.

### C12 — `.docx` round-trip drops more than the README admits

**Severity: S0** for a submission-authoring tool.

Losses **on export** (`src/main/services/docx/export.ts`) — each of these is silently discarded by
the `default: return []` at `:155-156` or by omission from `runsFromInline`:

| Lost | Editor source | Why |
|------|---------------|-----|
| Explicit page breaks | `extensions/pageBreak.ts` | No `case 'pageBreak'` in `blockToDocx` (`export.ts:99-157`) |
| Font family & size | `extensions/fontAttributes.ts:17-38` | `runsFromInline` (`export.ts:35-90`) never reads the `textStyle` mark |
| Text colour, highlight | `EditorCanvas.tsx:65-66` | Same |
| Indent, line spacing | `extensions/indent.ts:18-44` | `blockToDocx` ignores `attrs.indent` / `attrs.lineSpacing` |
| Paragraph style names (`ctdSection`, `reference`, `tableCaption`) | `extensions/paragraphStyle.ts` | Export never emits a Word style; the `STYLE_MAP` at `import.ts:8-15` is import-only |
| Comment marks | `extensions/comment.ts` | See C5 |
| Heading alignment | — | `case 'heading'` (`export.ts:110-118`) ignores `textAlign`, unlike `case 'paragraph'` |
| Table borders / shading / widths | — | `export.ts:125-139` writes equal-percentage cells only |
| Footnotes / endnotes | — | Not handled at all |

Three in-code doc comments assert the opposite and are wrong:
- `extensions/pageBreak.ts:14` — "a literal Word page-break run on docx export"
- `extensions/fontAttributes.ts:16` — "both are read by docx export's runsFromInline"
- `extensions/paragraphStyle.ts:7-9` — "round-trip through ... the docx import/export style map"

Losses **on import** (`src/main/services/docx/import.ts`, `html-to-pm.ts`):
- Headers and footers — `import.ts:96` hardcodes `header: null, footer: null` while export writes
  them (`export.ts:192-197`). Combined with C11, this means **open → save deletes the document's
  header and footer**, or replaces them with the previously-open document's.
- Page breaks, alignment, colour, highlight, font attributes, indent — `MARK_TAGS`
  (`html-to-pm.ts:4-14`) covers only bold/italic/underline/strike/sub/sup, and `walkBlock`
  (`:46-89`) reads no style attributes.
- Pre-existing tracked changes and comments — see C9.
- `docx:read` (`src/main/ipc/docx.ts:8-11`) calls `importDocx(buffer)` with no title, so
  `model.title` is always `'Untitled'`.

**Fix approach:** Treat fidelity as a test-driven subsystem. Build a corpus of representative ANDA
`.docx` files, add round-trip assertion tests (import → export → import, compare the PM JSON), and
close gaps in priority order: page breaks → header/footer → character formatting → paragraph styles
→ comments. Update the three lying doc comments and the README in the same change.

---

## Security Considerations

### C3 — No IPC path validation; the confinement mechanism is write-only

**Severity: S0.**

- **File:** `src/main/ipc/fs.ts:4-9` carries a doc comment promising confinement:
  > "Every path passed in from the renderer must resolve inside the last folder opened via
  > openFolderDialog; readDirRecursive re-derives and caches that root per window so a compromised
  > renderer can't walk the handler outside the chosen project."
- **Evidence:** `grep -rn "openRoots" src/` returns exactly three hits — the declaration
  (`fs.ts:9`) and two writes (`fs.ts:17`, `fs.ts:23`). **It is never read.** No handler compares a
  requested path against it.
- **Unvalidated handlers accepting arbitrary absolute paths from the renderer:**
  - `src/main/ipc/docx.ts:8-11` — `docx:read` → `fs.readFile(path)`. Arbitrary file read.
  - `src/main/ipc/docx.ts:13-17` — `docx:write` → `fs.writeFile(path, buffer)`. Arbitrary file
    write.
  - `src/main/ipc/docx.ts:19-23` — `docx:createBlank`, byte-identical to `docx:write`.
  - `src/main/ipc/print.ts:25` — `print:exportPdf` → `fs.writeFile(outPath, data)`. Arbitrary
    file write.
  - `src/main/ipc/fs.ts:21-25` — `fs:readDirRecursive` → recursive enumeration of any directory.
- **`zod` is a declared dependency** (`package.json:50`) and `grep -rn "zod" src/` returns
  **nothing**. The intended tool is installed and unused.
- **Impact:** Any renderer compromise (a malicious `.docx` reaching the DOM, a supply-chain issue in
  one of the 20 Tiptap packages, a future embedded web view for the Databricks login) escalates to
  arbitrary read/write on the user's machine, including SSH keys and, in the multi-user build, the
  cached SSO token.
- **Part 11 impact:** §11.10(d) requires "limiting system access to authorized individuals". A
  handler that will read any path on the machine is the client-side half of that control failing.
- **Fix approach:**
  1. Add `src/main/ipc/validate.ts` with zod schemas per channel.
  2. Add `assertInRoot(event, path)`: read `openRoots.get(BrowserWindow.fromWebContents(event.sender))`,
     `path.resolve()` the candidate, `fs.realpath()` it, and require `startsWith(root + sep)`.
  3. Apply it to `docx:read`, `docx:write`, `print:exportPdf`, `fs:readDirRecursive`.
  4. Stop letting `fs:readDirRecursive` set the root (`fs.ts:23`) — that lets the renderer choose
     its own sandbox. Only `fs:openFolderDialog` (`:17`), which involves a user gesture, should.
  5. Enforce the `.docx` / `.pdf` extension on write paths.

### C4 — CSP has no `connect-src`

**Severity: S0 — a hard blocker for Phase A.**

- **File:** `src/renderer/index.html:5-8`:
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; font-src 'self' data:
  ```
- **Impact:** With no `connect-src`, the directive falls back to `default-src 'self'`. **Every**
  `fetch` / `XMLHttpRequest` / `WebSocket` / `EventSource` to the Databricks App backend, the
  Lakebase API, or the SSO endpoint will be blocked by the CSP before it leaves the renderer. This
  will present as a wall of `Refused to connect` console errors on the first day of the server work.
- **Also missing:** `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`,
  `frame-ancestors 'none'`. `style-src 'unsafe-inline'` is genuinely required by Tiptap's inline
  style rendering (`fontAttributes.ts:26,34`, `indent.ts:29,38`) and is acceptable, but should be
  narrowed with a nonce if a hardening review demands it.
- **Fix approach:** Add an explicit `connect-src 'self' https://<workspace>.databricks.com` (and
  `wss:` if streaming is used). Prefer moving the CSP from the `<meta>` tag to
  `session.defaultSession.webRequest.onHeadersReceived` in the main process so it can be
  environment-aware and cannot be overridden by injected markup.

### C7 — Author identity is hardcoded

**Severity: S0.**

- **Files:**
  - `src/renderer/src/editor/extensions/trackChangeMarks.ts:4-5` —
    `authorId: { default: 'local-user' }`, `authorName: { default: 'You' }`
  - `src/renderer/src/editor/extensions/comment.ts:22` — `authorName: { default: 'You' }`
  - `src/renderer/src/editor/insertComment.ts:17` — `setComment({ ..., authorName: 'You' })`
  - `src/renderer/src/editor/insertComment.ts:18` — `addComment({ ..., authorName: 'You' })`
  - `src/renderer/src/editor/useTrackChangesSync.ts:27` — fallback `'You'`
  - `src/main/services/docx/export.ts:63,71` — fallback `'Reviewer'` written into the OOXML
    `w:ins`/`w:del` `author` attribute
- **Impact:** Every revision and every comment in every exported `.docx`, from every user, is
  attributed to "You" or "Reviewer". Once two people edit the same document there is no way to tell
  their work apart, and the exported Word file actively misattributes it.
- **Part 11 impact:** Blocks §11.10(d) (authorized individuals), §11.10(g) (authority checks), and
  §11.50 (signature manifestations must include the printed name of the signer). This is the
  identity substrate the whole e-signature feature sits on.
- **Fix approach:** Add a `sessionStore` populated from the Databricks SSO token
  (`{ userId, displayName, email }`). Have `trackChangesPlugin`, `insertComment`, and `export.ts`
  read from it. Refuse to create a revision or comment when no session is present. Never trust a
  renderer-supplied author on the server side — stamp identity from the validated token in the
  backend.

### C16 — Electron hardening gaps

**Severity: S1.**

- **Files:**
  - `src/main/index.ts:26` — `sandbox: false`. `contextIsolation: true` and
    `nodeIntegration: false` are correctly set (`:27-28`), but with the sandbox off, a renderer
    compromise plus any preload bug reaches full Node.
  - `src/main/index.ts:37-40` — `setWindowOpenHandler` calls `shell.openExternal(details.url)` for
    **any** URL with no protocol allowlist. `file://`, `smb://`, `ms-msdt:` and similar are handed
    straight to the OS.
  - No `will-navigate` handler. `grep -rn "will-navigate\|setPermissionRequestHandler" src/`
    returns nothing — the renderer can navigate the top-level frame away from the app, and any
    permission request (camera, geolocation, notifications) is auto-granted by Electron's default.
- **Fix approach:** Set `sandbox: true` (the preload only calls `ipcRenderer`, so it should survive
  the change — verify). Allowlist `https:`/`mailto:` in `setWindowOpenHandler`. Add
  `contents.on('will-navigate', (e, url) => { if (!isInternal(url)) e.preventDefault() })`. Add
  `session.setPermissionRequestHandler(() => callback(false))`.

### C20 — Stub AI and compliance output carries no in-context disclaimer

**Severity: S1 — GxP misuse risk.**

- **Files:**
  - `src/main/services/compliance/stub/StubComplianceProvider.ts:20-104` — fabricated findings with
    authoritative-looking rule IDs (`CMC-114`, `CMC-201`), severities, `detectionMethod:
    'code-verified'`, and `precedentCount` values.
  - `src/main/services/ai/stub/StubAiProvider.ts:17,27` — canned answers containing specific
    numeric regulatory claims ("Q = 80% in 30 minutes").
  - `src/renderer/src/store/chatStore.ts:23+` — `SEED_MESSAGES` pre-populates the chat with a
    fabricated exchange as if it were real history.
  - `grep` for a disclaimer across `dock/CompliancePanel.tsx`, `dock/FolderRun.tsx`,
    `dock/AiChatPanel.tsx` returns **nothing**. The only "(stub)" label in the app is in
    `src/renderer/src/welcome/SettingsView.tsx:20,24`, a screen the user may never open.
- **Impact:** A reviewer can act on invented compliance findings believing they came from a
  validated engine. `StubAiProvider.ts:35` does self-identify in the fallback branch, but the two
  keyword-matched branches at `:17` and `:27` do not.
- **Fix approach:** Render a persistent, unmissable banner in the Compliance panel, the Folder Run
  view, and the chat panel whenever `provider.kind === 'stub'`. Remove `SEED_MESSAGES` or label each
  seeded message as a demo. Ideally, gate the stub behind a build flag so it cannot ship.

### Data governance — document content will leave the machine

**Severity: S1, forward-looking.**

- **Files:** `src/main/ipc/ai.ts:5-10`, `src/main/ipc/compliance.ts:5-14`,
  `src/main/services/compliance/ComplianceProvider.ts:58-65`.
- The provider interfaces currently pass a `docPath` / `folderPath` — but a real backend will need
  the document *content*. When these providers become network-backed, unpublished ANDA content
  (trade secret, potentially subject to confidentiality commitments) starts crossing a network.
- **Fix approach:** Decide and document, before the first real provider ships: what leaves the
  machine, to which endpoint, under which contract, retained for how long, and whether the user is
  told. Add it to the Part 11 risk assessment.

---

## Missing Critical Features

### C6 — No audit trail for accept / reject

**Severity: S0 — Part 11 §11.10(e) blocker.**

- **File:** `src/renderer/src/editor/useTrackChangesSync.ts:51-72`. Accept strips the mark
  (`:57`) or deletes the range (`:59`); reject deletes the range (`:67`) or strips the mark
  (`:69`). **Nothing is recorded.** No "accepted by X at T", no event, no log, no persisted row.
  After the operation there is no evidence the change ever existed.
- **Also unrecorded:** document open, document save, comment creation/resolution/deletion, page
  setup changes, track-changes toggle (`documentStore.ts:79`), import-warning dismissal (C9).
- **Part 11 §11.10(e) requires:** "Use of secure, computer-generated, time-stamped audit trails to
  independently record the date and time of operator entries and actions that create, modify, or
  delete electronic records. Record changes shall not obscure previously recorded information."
  Accept/reject *is* the archetypal record modification, and it is currently invisible.
- **Fix approach:** Introduce an append-only `auditEvent(type, documentId, revision, payload)`
  channel that writes server-side (never client-side, never editable). Emit from every mutating
  action. The events must be independently recorded — derived from the server's own clock and
  session identity, not from renderer-supplied values (see C7). Note that C1 must be fixed first,
  or the events will carry function-source-text timestamps.

### C8 — No document identity, no revision number, no real timestamp

**Severity: S0 — blocks check-out locking and conflict detection.**

- **File:** `src/renderer/src/store/documentStore.ts`:
  - `:25` — identity *is* the filesystem path (`filePath: string | null`). Rename the file and it
    becomes a different document; two machines with different mount points see two documents.
  - `:28,57-59,74,77` — `savedAt` is produced by
    `date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })`. It is a
    **localized display string** like `"3:42 PM"` — no date, no seconds, no timezone, not
    comparable, not parseable, locale-dependent.
  - No `revision`, no `etag`, no `checkedOutBy`, no `lastModifiedBy`.
- **Impact:** There is no basis on which to detect that the server's copy is newer than yours, no
  key to lock on, and no version to attach an e-signature to. Every one of the four planned features
  needs this.
- **Part 11 impact:** §11.10(e) audit entries and §11.70 signature/record linking both require a
  stable record identity and a real timestamp.
- **Fix approach:** Add `documentId: string` (server-issued UUID), `revision: number`,
  `savedAtIso: string` (ISO-8601 UTC), `checkedOutBy: UserRef | null`, `checkedOutAt: string | null`.
  Keep `savedAt`'s formatting in the view layer only (`TitleBar.tsx:35`). Send `revision` with every
  save and have the server reject on mismatch with 409.

### C15 — No tests, no linter, no formatter, no CI

**Severity: S1 — and a validation blocker.**

- **Evidence:** `find . -name "*.test.*" -o -name "*.spec.*"` (excluding `node_modules`) returns
  nothing. No `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `biome.json`, `jest.config.*`, or
  `vitest.config.*` exists. No `.github/workflows/`. `package.json:10-17` has `dev`, `build`,
  `preview`, `typecheck`, `dist:mac`, `dist:win` — `tsc --noEmit` is the only automated check.
- **Impact:** C1 — a bug that makes saving impossible for the app's flagship feature — would have
  been caught by a single round-trip test. So would C11 and most of C12.
- **Part 11 / GAMP 5 impact:** §11.10(a) requires "validation of systems to ensure accuracy,
  reliability, consistent intended performance, and the ability to discern invalid or altered
  records". Validation needs documented, repeatable, evidenced test execution. There is currently no
  artifact to point an auditor at. This is not optional for a regulated release.
- **Fix approach:** Add Vitest + Testing Library and ESLint + Prettier. Seed with the highest-value
  tests first: `.docx` round-trip fidelity (C12), `editor.getJSON()` structured-clone safety (C1),
  IPC path validation (C3), dirty-guard behaviour (C10). Add a GitHub Actions workflow running
  `typecheck`, `lint`, `test`. Later, formalise as IQ/OQ/PQ with traceability to requirements.

---

## Tech Debt

### C17 — Images are inline base64; export hardcodes PNG at 400×300

**Severity: S1.**

- **Files:** `src/renderer/src/editor/insertImage.ts:9,18` — `FileReader.readAsDataURL` embeds the
  full image as a base64 data URL directly in the ProseMirror doc. `src/main/services/docx/export.ts:143-151`:
  ```ts
  new ImageRun({
    type: 'png',
    data: Buffer.from(String(node.attrs.src).split(',')[1] ?? '', 'base64'),
    transformation: { width: 400, height: 300 }
  })
  ```
- **Impact:**
  1. `insertImage.ts:9` accepts `image/jpeg`, `image/gif`, `image/webp` — all of them are written
     into the `.docx` labelled `type: 'png'`. Word may fail to render them.
  2. Every image is forced to 400×300 px, destroying aspect ratio. A wide stability-data figure
     comes out squashed.
  3. Base64 inflates payload ~33%. The entire document — images included — is structured-cloned
     across IPC on **every** save (`useDocumentIO.ts:37`). Once that becomes an HTTP PUT to
     Databricks, a document with a handful of screenshots produces a multi-megabyte body on every
     autosave.
- **Fix approach:** Derive `type` from the data-URL MIME prefix. Read intrinsic dimensions and scale
  to fit the page width. Longer term, move images to content-addressed blobs referenced by ID and
  upload them separately from the document body.

### C18 — `readProjectTree` is unbounded, symlink-unsafe, and unthrottled

**Severity: S1.**

- **File:** `src/main/services/fs/tree.ts:13-30`.
- **Problems:**
  1. `fs.stat` (`:18`) follows symlinks and there is no visited-path set — a symlink pointing at an
     ancestor causes infinite recursion until the stack blows or the process hangs. A user pointing
     AmFile at a network share with a self-referential link hangs the main process, freezing the
     whole app (no worker thread).
  2. No depth limit and no file-count limit — the whole tree is read eagerly.
  3. `Promise.all` over every directory entry (`:23-28`) with no concurrency cap — a large eCTD
     module tree can exhaust file descriptors (`EMFILE`).
  4. The result is one giant JSON blob structured-cloned to the renderer
     (`src/main/ipc/fs.ts:24`), then flattened on every render
     (`src/renderer/src/navigator/ProjectTree.tsx:43-44`).
- **Scaling:** A real eCTD submission is commonly 10k–100k files. Untested at that size.
- **Fix approach:** Track visited real paths, cap depth and total entries, use `fs.lstat` and skip
  symlinks, bound concurrency (e.g. 32), and switch to lazy per-directory loading driven by
  `toggleFolder`. `chokidar` is already a dependency (C23) if incremental watching is wanted.

### C22 — Duplicated type declarations

**Severity: S2.** Two types are declared twice with identical shapes and no link between them:

| Type | Main-process copy | Renderer copy |
|------|-------------------|---------------|
| `PageSetup` (+ `DEFAULT_PAGE_SETUP`) | `src/main/services/docx/model.ts:1-19` | `src/renderer/src/store/documentStore.ts:4-22` |
| `FsTreeNode` | `src/main/services/fs/tree.ts:4-9` | `src/renderer/src/store/treeStore.ts:3-8` |

- **Impact:** They cross the IPC boundary as the same payload, so any drift is a silent runtime
  mismatch that `tsc` cannot catch. `useDocumentIO.ts:6` already reaches across with
  `import('../store/documentStore').PageSetup` to paper over it.
- **Fix approach:** Create `src/shared/types.ts` (included by both `tsconfig.node.json` and
  `tsconfig.web.json`) and have both sides import from it. Do this before the server contract is
  written, so the wire types have one home.

### C23 — Dead code and unused dependencies

**Severity: S2.** All verified by grep across `src/`:

| Item | Evidence | Note |
|------|----------|------|
| `docx:createBlank` | `src/main/ipc/docx.ts:19-23`, `src/preload/index.ts:31-32` | **Byte-identical** to `docx:write` (`:13-17`). Never invoked from the renderer. An unvalidated arbitrary-write channel (C3) with no purpose. |
| `fs:openFileDialog` | `src/main/ipc/fs.ts:37-45`, `src/preload/index.ts:26` | Never invoked from the renderer |
| `treeStore.refresh()` | `src/renderer/src/store/treeStore.ts:34-39` | Defined, never called |
| `registerCommentDeleteHandler` | `src/renderer/src/editor/insertComment.ts:21-27` | Exported, never imported. `EditorCanvas.tsx:89-94` registers its own inline. Also returns a no-op cleanup `() => {}` — the cleanup is a lie. |
| `emptyDocumentModel` | `src/main/services/docx/model.ts:39-47` | Exported, never called |
| `chokidar@4.0.3` | `package.json:41` | `grep -rn "chokidar" src/` → nothing |
| `zod@3.25.76` | `package.json:50` | `grep -rn "zod" src/` → nothing. The tool for C3, installed and unused. |
| `.amfile-recovery/` | `.gitignore:6`, `src/main/services/fs/tree.ts:11` | Referenced in two ignore lists; nothing ever writes it (C10) |

- **Fix approach:** Delete `docx:createBlank` and `fs:openFileDialog` from both the handler and the
  preload — every removed IPC channel is removed attack surface. Delete the dead functions. Either
  use `chokidar` for tree watching (C18) or drop it. **Keep `zod` and actually use it** (C3).

### C25 — Renderer imports main-process types by relative path

**Severity: S2.** An established convention, noted for the coupling it creates:

- `src/renderer/src/store/chatStore.ts:2` — `from '../../../main/services/ai/AiProvider'`
- `src/renderer/src/store/complianceStore.ts` — same pattern for `ComplianceProvider`
- `src/preload/index.ts:2-5` — four cross-boundary type imports

Type-only, so nothing crosses at runtime — but `tsconfig.web.json:3` only includes
`src/renderer/src/**/*`, so these files are type-checked under the *web* config while their source
lives under the *node* config. Same target as C22: move shared contracts to `src/shared/`.

### C26 — `noImplicitAny` is disabled

**Severity: S2.** `node_modules/@electron-toolkit/tsconfig/tsconfig.json` sets `strict: true` and
then explicitly overrides `noImplicitAny: false`. Neither `tsconfig.node.json` nor
`tsconfig.web.json` re-enables it. `tsc --noEmit` is currently the **only** automated check in the
project (C15), so weakening it matters more here than it normally would.
**Fix approach:** Add `"noImplicitAny": true` to both configs and fix the fallout.

### C27 — `window.prompt` / `window.alert` used for real data entry

**Severity: S2.**

- `src/renderer/src/editor/insertComment.ts:7,10` — the **comment body** is captured with
  `window.prompt`. Single-line, no formatting, no cancel-safe draft, no length limit, not styleable,
  not testable, and it blocks the renderer.
- `src/renderer/src/editor/commandHandler.ts:135,144,150,158,193` — link URL, header text, footer
  text, TOC warning, word count.
- **Impact:** Comments are a first-class regulated artifact (C5). Entering them through a native
  modal prompt caps the feature at one line of plain text and makes the flow untestable.
- **Fix approach:** Replace with in-app modal components. Do it as part of the C5 comment
  persistence work.

---

## Fragile Areas

**`src/renderer/src/editor/useTrackChangesSync.ts`:**
- Why fragile: `collect()` (`:6-37`) rebuilds the entire change list by walking the whole document
  on **every** `update` **and** every `selectionUpdate` (`:48-49`) — i.e. on every cursor move.
  Accept/reject then re-walks the document a third time (`:54`, `:64`) to resolve positions that
  were computed at collection time. Positions are raw ProseMirror offsets stored in a zustand store
  (`trackChangesStore.ts:9-10`); any concurrent transaction between render and click invalidates
  them, and the operation silently applies to the wrong range.
- Compounded by C1: `changeId` is currently the same string for every mark, so grouping is wrong.
- Safe modification: don't change `collect()`'s grouping without first fixing C1. Prefer ProseMirror
  decorations or a plugin-state map keyed by a stable ID over position-carrying store entries.
- Test coverage: none.

**`src/main/services/docx/export.ts`:**
- Why fragile: a 220-line hand-written PM-JSON → OOXML mapper with a silent
  `default: return []` (`:155-156`). Any node type not explicitly listed is dropped without a
  warning — which is how the C12 losses happen. `runsFromInline` (`:35-90`) has the same shape for
  marks. The `as never` casts at `:65` and `:73` disable type checking exactly where the tracked-change
  author and date are set.
- Safe modification: add a round-trip test corpus before touching it. Replace the silent `default`
  with a collected-warnings channel so unsupported content is reported rather than discarded.
- Test coverage: none.

**`src/main/services/docx/html-to-pm.ts`:**
- Why fragile: mammoth → HTML → JSDOM → ProseMirror JSON is a three-stage lossy pipeline, and each
  stage silently drops what it doesn't recognise (`walkBlock` `default: return null` at `:86-87`).
  `walkTableRow:109` uses `Array.from(...).flatMap(...) || undefined`, which can never be falsy —
  an always-true expression that suggests the intended guard is missing.
- Safe modification: same as above — corpus tests first.
- Test coverage: none.

**`src/renderer/src/ribbon/ribbonConfig.ts` (671 lines, the largest file):**
- Why fragile: a flat action-string registry dispatched through `ribbonActions.ts:72-78` and
  `commandHandler.ts:205-207`, both of which fall through to `console.info("... not wired yet")`.
  A typo in an action string is indistinguishable from an intentionally-unimplemented button.
- Safe modification: type the action strings as a union and make both switches exhaustive so `tsc`
  catches unhandled cases.

**Find & Replace (`src/renderer/src/editor/findReplace.ts`):**
- Why fragile: `findAll` (`:17-25`) searches **within each text node independently**, so a query
  spanning a formatting boundary ("the **bold** word") never matches. `replaceAll` (`:38-44`)
  interacts badly with track changes (C19). No test coverage.

---

## Scaling Limits

**Document size (single document):**
- Current capacity: untested. Comfortable for the small documents used in development.
- Limit: the full document — including base64 images (C17) — is structured-cloned across IPC on
  every save. `collect()` walks the entire doc on every cursor move (Fragile Areas).
- Scaling path: measure with a realistic 100-page module 3 document containing figures and tables
  before the server work starts, so the wire format is chosen with real numbers.

**Project tree:**
- Current capacity: untested. Whole tree read eagerly, unbounded concurrency (C18).
- Limit: a real eCTD submission is 10k–100k files; expect `EMFILE` and multi-second main-process
  stalls well before that.
- Scaling path: lazy per-directory loading, bounded concurrency, virtualised tree rendering.

**Concurrency:**
- Current capacity: **one user, one window, one document.** There is no locking, no conflict
  detection, no revision, and no document identity (C8).
- Limit: two users saving the same file is a straight last-write-wins overwrite with no warning.
- Scaling path: the entire planned server work. C8 is the prerequisite.

---

## Dependencies at Risk

**`mammoth@1.11.0`** (`package.json:47`) — actively maintained, but architecturally capped: it is a
"convert to clean HTML" library and will never surface tracked changes, comments, headers, or
footers. Those are exactly the features a Part 11 build needs (C5, C9, C12). It silently accepts
`w:ins`/`w:del` by design.
*Migration plan:* the codebase already parses raw OOXML directly with JSZip + fast-xml-parser in two
places (`import.ts:28-52` for revision scanning, `:58-84` for page setup). Extend that path to own
tracked changes and comments, keeping mammoth only for body prose.

**`electron@32.3.3`** (`package.json:61`) — Electron 32 reached end of support; security fixes land
only in the three most recent majors. Shipping a regulated desktop app on an unsupported Electron
will fail a security review.
*Migration plan:* upgrade to a supported major before the regulated release. Do it before C16's
`sandbox: true` change so both land together.

**`jsdom@25.0.1`** (`package.json:44`) — a full DOM implementation pulled into the **main process**
solely to walk mammoth's HTML output (`html-to-pm.ts:1,116`). Large dependency, meaningful parse
surface, running in the most privileged process.
*Migration plan:* replace with a small streaming HTML parser, or move the conversion into a utility
process.

**`@tiptap/*` v2 (20 packages, `package.json:22-40`)** — Tiptap v3 is out; v2 will stop receiving
fixes. The app has 8 custom extensions (`src/renderer/src/editor/extensions/`) that will each need
migration.
*Migration plan:* plan the v2→v3 upgrade explicitly, after C1 is fixed and extension tests exist.

**Stub providers** (`src/main/services/ai/provider.ts:6`,
`src/main/services/compliance/provider.ts:6`) — the real compliance engine lives in the separate
`deficiency-chatbot` repo and is not ready (`README.md:11-15`). The `ComplianceProvider` interface
(`ComplianceProvider.ts:58-65`) is a guess at that repo's eventual shape.
*Migration plan:* agree the contract with the `deficiency-chatbot` team before building on it. See
also C20.

---

## Test Coverage Gaps

There are **no tests of any kind** (C15). Listed in the order they should be written:

**`.docx` round-trip fidelity — Priority: High**
- Not tested: import → export → import for tracked changes, comments, page breaks, headers/footers,
  font attributes, paragraph styles, tables, images.
- Risk: silent content loss in submission documents. C12 lists twelve confirmed losses that a single
  round-trip suite would have caught.
- Difficulty: low. `importDocx` and `exportDocx` are pure buffer-in/buffer-out functions
  (`import.ts:86`, `export.ts:173`). Needs a fixture corpus of real ANDA documents.

**Save path serialisability — Priority: High**
- Not tested: that `editor.getJSON()` survives a structured clone.
- Risk: C1 — the flagship feature silently cannot save. One assertion would have caught it.
- Difficulty: trivial.

**IPC path validation — Priority: High**
- Not tested: nothing validates paths at all today (C3).
- Risk: arbitrary file read/write from a compromised renderer.
- Difficulty: low once zod schemas exist. Test the traversal cases explicitly (`..`, absolute paths
  outside root, symlinks out of root).

**Dirty-state guards — Priority: High**
- Not tested: open-while-dirty, new-while-dirty, quit-while-dirty (C10); store reset between
  documents (C11).
- Risk: silent loss of unsaved regulatory work; cross-document contamination.
- Difficulty: low with Testing Library once the guards exist.

**Track-changes edit shapes — Priority: High**
- Not tested: type-over-selection, cut, paste-over, drag-move, Find & Replace, undo/redo, IME
  composition — all under both tracking states (C19).
- Risk: revisions silently not recorded → audit trail gaps → Part 11 finding.
- Difficulty: medium. Needs a ProseMirror test harness.

**Accept / reject correctness — Priority: High**
- Not tested: that accept and reject apply to the intended range, and that the audit event is
  emitted (C6).
- Risk: wrong text accepted or deleted; no evidence either way.
- Difficulty: medium — positions are stored in the store, which makes this hard to test today and is
  itself a signal (see Fragile Areas).

**Main-process lifecycle — Priority: Medium**
- Not tested: macOS `activate` after all windows closed (C14).
- Risk: app cannot be reopened from the dock.
- Difficulty: medium — needs a Playwright/Spectron-style Electron harness.

**Large project trees — Priority: Medium**
- Not tested: deep trees, symlink loops, 10k+ files (C18).
- Risk: main-process hang; whole app freezes.
- Difficulty: low — synthesise the fixture tree in `beforeAll`.

---

## What Is Working Well

Worth preserving as the server build lands:

- **Process isolation is correct.** `contextIsolation: true`, `nodeIntegration: false`
  (`src/main/index.ts:27-28`), a single narrow `contextBridge` surface
  (`src/preload/index.ts:7-63`), and a renderer that never imports `electron`, `fs`, or `path`.
  The boundary is in the right place — it just isn't validated yet (C3).
- **Provider abstraction.** `AiProvider` / `ComplianceProvider`
  (`src/main/services/{ai,compliance}/provider.ts`) are clean seams. A server-backed
  `DocumentProvider` should follow the same shape.
- **Revision detection on import already exists** (`import.ts:28-52`) and works correctly. Only its
  presentation is missing (C9) — a small fix for a large integrity win.
- **The docx export already emits real OOXML `w:ins` / `w:del`** (`export.ts:58-73`). The tracked
  changes *are* real Word revisions, not a private format. Fix C1's attribute plumbing and this
  becomes trustworthy.
- **Doc comments are unusually good** — they explain intent, not mechanics. Three of them are now
  wrong (C12); keeping them accurate is worth the effort.

---

*Concerns audit: 2026-08-09*
*Update as issues are fixed or new ones discovered*
