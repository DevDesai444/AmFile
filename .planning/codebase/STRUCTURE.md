# Codebase Structure

**Analysis Date:** 2026-08-09

## Directory Layout

```
AmFile/
├── src/                          # All application source (3 Electron processes)
│   ├── main/                     # Main process — Node, owns disk + dialogs + providers
│   │   ├── index.ts              # Entry: BrowserWindow, webPreferences, handler registration
│   │   ├── ipc/                  # One module per IPC domain (15 channels, 3 push events)
│   │   └── services/             # All real work; imports NO electron
│   │       ├── docx/             # .docx ↔ AmFileDocumentModel + the wire model
│   │       ├── fs/               # Recursive project-tree reader
│   │       ├── compliance/       # Provider + stub for the deficiency backend
│   │       └── ai/               # Provider + stub for the LLM backend
│   ├── preload/                  # The ONLY renderer↔main bridge
│   │   ├── index.ts              # contextBridge.exposeInMainWorld('amfile', …)
│   │   └── index.d.ts            # Global `Window.amfile` augmentation
│   └── renderer/                 # React app — no Node, no electron imports
│       ├── index.html            # HTML entry + CSP meta
│       └── src/
│           ├── main.tsx          # ReactDOM.createRoot
│           ├── App.tsx           # Shell layout + view switch
│           ├── store/            # 9 zustand stores — all app state
│           ├── editor/           # Tiptap editor, hooks, commands, extensions/
│           ├── ribbon/           # config → actions → command registry
│           ├── navigator/        # Left panel: project tree + outline tree
│           ├── dock/             # Right panel: AI chat, compliance, review + FolderRun view
│           ├── titlebar/         # Custom title bar + window controls
│           ├── statusbar/        # Bottom status strip
│           ├── welcome/          # Welcome + Settings views
│           ├── common/           # Shared presentational primitives
│           ├── design/           # CSS token/font/blueprint layers
│           └── assets/           # Bundled images (amneal-logo.png)
├── design-reference/             # Approved HTML mockup — visual source of truth, NOT code
├── build/                        # electron-builder resources (icon, mac entitlements)
├── .planning/codebase/           # GSD codebase maps (this file)
├── electron.vite.config.ts       # Three-target build config (main/preload/renderer)
├── electron-builder.yml          # Packaging: dmg/zip, nsis, AppImage
├── tsconfig.json                 # Project references → node + web
├── tsconfig.node.json            # Typechecks src/main + src/preload
├── tsconfig.web.json             # Typechecks src/renderer/src + preload/index.d.ts
├── package.json                  # Scripts, deps ("type": "module")
└── README.md                     # Status, docx fidelity, pagination, known gaps
```

## Directory Purposes

**`src/main/`**
- Purpose: Electron main process — window lifecycle and every privileged operation
- Contains: `index.ts`, `ipc/`, `services/`
- Key files: `src/main/index.ts` (100 lines — window creation, `webPreferences`, spellcheck
  context menu, calls all six `register*Handlers()`)
- Subdirectories: `ipc/` (thin), `services/` (thick)

**`src/main/ipc/`**
- Purpose: IPC channel registration, one module per domain. Thin — argument marshalling only.
- Contains: Six `.ts` files, each exporting a single `register<Domain>Handlers()` function
- Key files:
  - `src/main/ipc/fs.ts` (46 lines) — `fs:openFolderDialog`, `fs:readDirRecursive`,
    `fs:saveFileDialog`, `fs:openFileDialog`; holds the `openRoots` WeakMap
  - `src/main/ipc/docx.ts` (24 lines) — **CHOKEPOINT**: `docx:read`, `docx:write`,
    `docx:createBlank`. The only document disk I/O in the app.
  - `src/main/ipc/print.ts` (29 lines) — `print:exportPdf` via `webContents.printToPDF`
  - `src/main/ipc/compliance.ts` (15 lines) — `compliance:checkDocument`,
    `compliance:checkFolder`; sends `compliance:folderProgress`
  - `src/main/ipc/ai.ts` (11 lines) — `ai:sendMessage`; sends `ai:messageChunk`
  - `src/main/ipc/window.ts` (25 lines) — four window channels; sends `window:maximizeChanged`.
    Takes the `BrowserWindow` as an argument (registered from `createMainWindow`, not app-ready).

**`src/main/services/`**
- Purpose: All business logic. **No file here imports `electron`** — this subtree is directly
  liftable into a server process.
- Contains: Four domain subdirectories
- Key files:
  - `src/main/services/docx/model.ts` (47 lines) — `AmFileDocumentModel`, `PageSetup`,
    `DEFAULT_PAGE_SETUP`, `PMNode`, `emptyDocumentModel()`. The wire format.
  - `src/main/services/docx/import.ts` (99 lines) — `importDocx(buffer)`: mammoth + raw OOXML
    scans for warnings and real page setup
  - `src/main/services/docx/export.ts` (220 lines) — `exportDocx(model)`: the `docx` package,
    largest service file
  - `src/main/services/docx/html-to-pm.ts` (124 lines) — mammoth HTML → `PMNode` tree (jsdom)
  - `src/main/services/fs/tree.ts` (30 lines) — `readProjectTree()`, `FsTreeNode`, `IGNORED` set
  - `src/main/services/compliance/ComplianceProvider.ts` (65 lines) — all compliance result types
  - `src/main/services/ai/AiProvider.ts` (20 lines) — `StreamChunk`, `ChatMessageResult`

**`src/main/services/<domain>/stub/`**
- Purpose: Placeholder implementations of a provider interface, returning realistic data in the
  exact shape the real backend will return
- Contains: `Stub<Domain>Provider.ts`
- Key files: `src/main/services/compliance/stub/StubComplianceProvider.ts` (219 lines — mock
  findings, an 11-doc folder run with `setTimeout` pacing, cross-doc issues),
  `src/main/services/ai/stub/StubAiProvider.ts` (58 lines — canned replies streamed word by word)

**`src/preload/`**
- Purpose: The one and only bridge between renderer and main
- Contains: Two files, both small
- Key files: `src/preload/index.ts` (63 lines — the `amfileApi` object literal, six namespaces,
  `export type AmFileApi = typeof amfileApi`, one `exposeInMainWorld`);
  `src/preload/index.d.ts` (9 lines — `declare global { interface Window { amfile: AmFileApi } }`)
- Note: type-only imports from `src/main/services/**` are the norm here

**`src/renderer/src/store/`**
- Purpose: All renderer state. 9 flat zustand stores, no middleware, no persistence.
- Contains: Nine `*Store.ts` files
- Key files:

  | Store | Lines | Owns |
  |-------|-------|------|
  | `documentStore.ts` | 110 | Open file (`filePath`/`fileName`), `dirty`/`savedAt`, `pageSetup`, `trackChangesEnabled`, `zoom`, `pendingOpenPath`, `headerText`/`footerText`, margin/orientation cycling. **Also declares its own `PageSetup` duplicate.** |
  | `uiStore.ts` | 60 | Shell layout — `ribbonOpen`/`leftOpen`/`dockOpen`, `view`, `dock` tab, `treeTab`, `activeRibbonTab`, `activeFindingId`, `selectedTreePath`. Exports `RibbonTabId`. |
  | `treeStore.ts` | 48 | Project filesystem tree — `rootPath`, `root`, `openFolders` Set, `loading`. Calls `window.amfile.fs.readDirRecursive`. |
  | `complianceStore.ts` | 38 | `documentResult`, `folderRun` (live), `folderResult` (terminal), loading flags. Calls both compliance channels. |
  | `chatStore.ts` | 78 | AI thread — `threadId` (`'main'`), `messages`, `status`, `streamingId`, token accumulation, seed messages. |
  | `trackChangesStore.ts` | 33 | `changes[]` + late-bound `onAccept`/`onReject` via `registerHandlers`. |
  | `commentStore.ts` | 31 | `comments[]` + late-bound `onDelete` via `registerDeleteHandler`. |
  | `outlineStore.ts` | 24 | `headings[]` + `activeHeadingId`, populated live from the doc. |
  | `editorStatsStore.ts` | 20 | `wordCount`, `charCount`, `page`, `totalPages` (estimated). |

  Three stores touch the bridge directly: `treeStore`, `complianceStore`, and (indirectly, via
  panels) `chatStore`.

**`src/renderer/src/editor/`**
- Purpose: The Tiptap editing surface and everything that reads from or writes to it
- Contains: One component, one bar component, four hooks, three helpers, `extensions/`, one CSS
- Key files:
  - `EditorCanvas.tsx` (163) — `useEditor` with 24 extensions, registers the `'main'` command
    handler, Cmd+S / Cmd+F listeners, consumes `pendingOpenPath`
  - `useDocumentIO.ts` (71) — **CHOKEPOINT**: `save()` (the only save in the app),
    `openFromPath()`, `exportPdf()`
  - `commandHandler.ts` (208) — `handleEditorCommand(editor, command, payload)`, the big switch
  - `useOutlineSync.ts` (27), `useEditorStats.ts` (31), `useTrackChangesSync.ts` (79) — sync hooks
  - `findReplace.ts` (45) + `FindReplaceBar.tsx` (80), `insertComment.ts` (27),
    `insertImage.ts` (21 — renderer-only `FileReader`, deliberately no IPC)
- Subdirectories: `extensions/` — seven Tiptap extensions: `paragraphStyle.ts`, `indent.ts`,
  `pageBreak.ts`, `fontAttributes.ts`, `trackChangeMarks.ts`, `trackChangesPlugin.ts`, `comment.ts`

**`src/renderer/src/ribbon/`**
- Purpose: The Word-style ribbon and the config→action→registry indirection behind it
- Contains: Two components, two logic modules
- Key files:
  - `ribbonConfig.ts` (671) — pure data, `RIBBON: Record<RibbonTabId, RibbonGroup[]>`,
    `RIBBON_TAB_ORDER`, `RibbonBigButton`/`RibbonSmallButton`/`RibbonGroup` types. Largest file
    in the repo.
  - `ribbonActions.ts` (79) — `runRibbonAction(act)`, `EDITOR_COMMAND_PREFIXES` allowlist
  - `editorCommandRegistry.ts` (31) — `registerEditorCommandHandler` / `setActiveEditor` /
    `runEditorCommand`; module-level `Map` + `activeId`
  - `Ribbon.tsx` (115), `TabBar.tsx` (31)

**`src/renderer/src/navigator/`**
- Purpose: Left panel
- Key files: `Navigator.tsx` (73 — tab toggle, "Check entire folder" footer),
  `ProjectTree.tsx` (85 — flattened tree rows, sets `pendingOpenPath` on `.docx` click),
  `OutlineTree.tsx` (40)

**`src/renderer/src/dock/`**
- Purpose: Right panel (three tabs) plus the full-width folder-run view
- Key files: `Dock.tsx` (50 — tab shell), `AiChatPanel.tsx` (95 — subscribes to
  `ai:messageChunk`), `CompliancePanel.tsx` (74), `ReviewPanel.tsx` (62 — Accept/Reject/Resolve),
  `FolderRun.tsx` (137 — rendered by `App.tsx` in the center column when `view === 'folder'`,
  not inside the dock)

**`src/renderer/src/design/`**
- Purpose: CSS layers from the Industry design system, imported once in `App.tsx`
- Key files: `tokens.css` (134 — CSS custom properties), `blueprint.css` (47 — the corner-mark
  frame), `fonts.css` (9 — `@fontsource/barlow*`)

**`design-reference/`**
- Purpose: **The original approved HTML mockup, kept as the visual source of truth. Not
  application code — nothing in `src/` imports it and it is not part of any build.**
- Contains: `AmFile.dc.html` (961 lines — the full mockup), `support.js` (1911 lines — its
  runtime), `.thumbnail`, `assets/amneal-logo.png`, `uploads/`, and `_ds/industry-<uuid>/` —
  the Industry design-system package (`styles.css`, `readme.md`, `_ds_bundle.js`,
  `_adherence.oxlintrc.json`)
- Use it to check what a screen is *supposed* to look like before changing
  `src/renderer/src/App.css` or `design/tokens.css`. Do not import from it, do not edit it to
  match code drift.

**`build/`**
- Purpose: electron-builder input resources (`directories.buildResources: build`)
- Key files: `build/icon.png`, `build/entitlements.mac.plist`

## Key File Locations

**Entry Points:**
- `src/main/index.ts` — main process (built to `out/main/index.js`, `package.json` `main` field)
- `src/preload/index.ts` — preload (built to `out/preload/index.mjs`)
- `src/renderer/index.html` → `src/renderer/src/main.tsx` → `src/renderer/src/App.tsx` — renderer

**Configuration:**
- `electron.vite.config.ts` — three build targets; `externalizeDepsPlugin` for main+preload,
  `@vitejs/plugin-react` plus the `@renderer` alias for renderer
- `tsconfig.json` — project references only
- `tsconfig.node.json` — `src/main/**`, `src/preload/**`, `electron.vite.config.ts`
- `tsconfig.web.json` — `src/renderer/src/**`, `src/preload/index.d.ts`; `@renderer/*` path alias
- `electron-builder.yml` — appId `com.amneal.amfile`; mac dmg+zip (x64/arm64), win nsis, linux AppImage
- `package.json` — `"type": "module"`; scripts `dev`, `build`, `typecheck`, `dist:mac`, `dist:win`
- `.gitignore` — `node_modules/`, `out/`, `dist/`, `.amfile-recovery/`, `*.tsbuildinfo`
- No `.env`, no `.eslintrc`, no `.prettierrc`, no runtime config file anywhere

**Core Logic:**
- `src/main/ipc/docx.ts` — document disk I/O chokepoint
- `src/renderer/src/editor/useDocumentIO.ts` — the app's only `save()`
- `src/main/services/docx/model.ts` — `AmFileDocumentModel` wire format
- `src/preload/index.ts` — the complete IPC surface in one object
- `src/main/services/{ai,compliance}/provider.ts` — the two backend swap points
- `src/renderer/src/store/` — all application state

**Testing:**
- None. No test directory, no test runner, no `*.test.*` / `*.spec.*` files anywhere.
- `npm run typecheck` (dual `tsc --noEmit`) is the only automated check.

**Documentation:**
- `README.md` — status, docx fidelity matrix, pagination rationale, track-changes design,
  explicit known gaps, signing/notarization
- `github.md` — repository push notes
- `design-reference/_ds/industry-<uuid>/readme.md` — the design system's own usage guide
- `.planning/codebase/` — GSD codebase maps

## Naming Conventions

**Files:**
- `PascalCase.tsx` — React components (`EditorCanvas.tsx`, `AiChatPanel.tsx`, `TitleBar.tsx`)
- `camelCase.ts` — non-component modules (`ribbonActions.ts`, `commandHandler.ts`, `tree.ts`)
- `use*.ts` — React hooks (`useDocumentIO.ts`, `useOutlineSync.ts`, `useTrackChangesSync.ts`)
- `*Store.ts` — zustand stores, always exporting `use<Name>Store`
- `<Domain>Provider.ts` — provider interface + types (PascalCase, no implementation)
- `provider.ts` — the lowercase singleton swap point (one per domain)
- `Stub<Domain>Provider.ts` — stub implementation, always inside `stub/`
- `index.ts` — process entry points only (`src/main/index.ts`, `src/preload/index.ts`);
  **not used as a barrel file anywhere**
- `*.css` — colocated with what they style (`editor/editor.css`, `design/tokens.css`)

**Directories:**
- lowercase single words, mostly singular by feature area: `ribbon/`, `editor/`, `navigator/`,
  `dock/`, `titlebar/`, `statusbar/`, `welcome/`, `common/`, `design/`
- plural only for genuine collections: `store/`, `services/`, `extensions/`, `assets/`
- `ipc/` and `stub/` are structural markers

**Special Patterns:**
- `register<Domain>Handlers()` — the single export of every `src/main/ipc/*.ts` module
- IPC channels are `domain:camelCaseAction` — `docx:write`, `fs:readDirRecursive`,
  `compliance:folderProgress`
- Ribbon action strings are `dot.separated` — `file.save`, `mark.bold`, `compliance.checkDocument`
- Event subscriptions on the bridge are `on<Event>` and **always return an unsubscribe closure**
  — `onFolderProgress`, `onMessageChunk`, `onMaximizeChanged`
- Every renderer bridge call is guarded with `if (!window.amfile) return`
- Non-trivial decisions carry a block comment explaining *why*, often naming the file on the
  other side of the seam (see `extensions/paragraphStyle.ts`, `services/docx/import.ts`,
  `ribbon/editorCommandRegistry.ts`)

## Where to Add New Code

**New IPC channel:**
- Handler: `src/main/ipc/<domain>.ts` inside the existing `register<Domain>Handlers()`, or a new
  module + a `register*Handlers()` call in `src/main/index.ts:83-87`
- Bridge: add to the matching namespace in `src/preload/index.ts`. Give it an explicit return
  type — `docx.read` currently has none and the renderer re-asserts the shape locally
  (`useDocumentIO.ts:5-8`).
- Types: define in `src/main/services/<domain>/` and `import type` them from preload/renderer
- Tests: none exist; verify with `npm run typecheck`

**New external backend (LLM, compliance engine, document server):**
- Interface + types: `src/main/services/<domain>/<Domain>Provider.ts`
- Swap point: `src/main/services/<domain>/provider.ts` — a single `export const x: XProvider = new …`
- Stub: `src/main/services/<domain>/stub/Stub<Domain>Provider.ts`
- Real impl: `src/main/services/<domain>/<impl>/` alongside `stub/`, then change the one line
  in `provider.ts`
- Streaming: express it as an `onChunk`/`onProgress` callback parameter on the interface method,
  and have the IPC handler turn it into `webContents.send`. Do not add an EventEmitter.

**New renderer state:**
- New store: `src/renderer/src/store/<name>Store.ts`, flat `create<T>()`, export `use<Name>Store`
- Prefer extending an existing store if the state belongs to an owner listed in the table above
- Import result types from `src/main/services/**` with `import type` rather than redeclaring

**New ribbon button:**
- Config: add `{ id, label, icon, act }` to the right group in `src/renderer/src/ribbon/ribbonConfig.ts`
- Wiring: if the `act` starts with an existing prefix in `EDITOR_COMMAND_PREFIXES`
  (`ribbonActions.ts:6`) it reaches the editor automatically — add a `case` to
  `src/renderer/src/editor/commandHandler.ts`. Otherwise add a `case` to
  `runRibbonAction` in `src/renderer/src/ribbon/ribbonActions.ts`.
- If it needs React state or document I/O, intercept it in the `EditorCanvas` handler
  (`EditorCanvas.tsx:99-125`) alongside `save` / `print` / `edit.find`.

**New editor capability:**
- Extension: `src/renderer/src/editor/extensions/<name>.ts`, plus a
  `declare module '@tiptap/core'` block for its commands
- Register: add to the `extensions` array in `EditorCanvas.tsx:52-76`
- Command: `src/renderer/src/editor/commandHandler.ts`
- Docx round-trip: if it must survive save/open, handle it in
  `src/main/services/docx/export.ts` (`runsFromInline` / `blockToDocx`) **and**
  `src/main/services/docx/import.ts` (`STYLE_MAP`) / `html-to-pm.ts`

**New UI panel or view:**
- Component: a new `src/renderer/src/<area>/` directory, or add to `dock/` for a dock tab
- Dock tab: extend `DockTab` in `store/uiStore.ts` and the `TABS` array in `dock/Dock.tsx`
- Full view: extend `ViewMode` in `store/uiStore.ts` and add the branch in `App.tsx:36-39`
- Styles: `src/renderer/src/App.css` using `design/tokens.css` variables; check
  `design-reference/AmFile.dc.html` for the intended look first

**Utilities:**
- Shared presentational primitives: `src/renderer/src/common/` (currently only `BlueprintCard.tsx`)
- Editor helpers: `src/renderer/src/editor/` as a plain `camelCase.ts` module
- Main-process helpers: `src/main/services/<domain>/`. Do not create a generic `utils/` —
  the codebase has none.

## Special Directories

**`out/`**
- Purpose: electron-vite build output (`out/main/index.js`, `out/preload/index.mjs`, `out/renderer/`)
- Source: `npm run build` / `npm run dev`
- Committed: No (`.gitignore`)

**`dist/`**
- Purpose: electron-builder packaged installers (`directories.output: dist`)
- Source: `npm run dist:mac` / `npm run dist:win`
- Committed: No (`.gitignore`)

**`design-reference/`**
- Purpose: Approved HTML mockup + the Industry design system it was built from. Read-only
  visual reference.
- Source: Hand-delivered mockup, not generated
- Committed: Yes — it is the design source of truth
- Build: Excluded from every tsconfig `include` and from `electron-builder.yml` `files`

**`.amfile-recovery/`**
- Purpose: Reserved for crash-recovery artifacts. Listed in `.gitignore` and in the tree walker's
  `IGNORED` set (`src/main/services/fs/tree.ts:11`), but **nothing currently writes it**.
- Committed: No

**`.planning/`**
- Purpose: GSD planning artifacts and codebase maps
- Committed: Yes (not in `.gitignore`)

**`node_modules/`**
- Purpose: npm dependencies (~430 top-level entries)
- Committed: No

---

*Structure analysis: 2026-08-09*
*Update when directory structure changes*
