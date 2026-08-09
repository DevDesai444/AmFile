<!-- refreshed: 2026-08-09 -->
# Architecture

**Analysis Date:** 2026-08-09

## System Overview

AmFile is a three-process Electron desktop app. The renderer is a pure browser context — it
never imports `electron`, `fs`, or `path`. Every privileged operation crosses a single
`contextBridge` surface (`window.amfile`) into the main process, which owns all disk access,
all dialogs, and both pluggable service providers.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  RENDERER PROCESS  (Chromium, no Node)          `src/renderer/src/`          │
│  contextIsolation: true · nodeIntegration: false · CSP default-src 'self'    │
├──────────────────┬──────────────────┬───────────────────┬───────────────────┤
│   Ribbon         │   Navigator      │   EditorCanvas    │   Dock            │
│  `ribbon/`       │  `navigator/`    │  `editor/`        │  `dock/`          │
│  config→action   │  ProjectTree     │  Tiptap editor    │  chat/compliance  │
│  →commandRegistry│  OutlineTree     │  + extensions     │  /review panels   │
└────────┬─────────┴────────┬─────────┴─────────┬─────────┴────────┬──────────┘
         │                  │                   │                  │
         └──────────────────┴───────┬───────────┴──────────────────┘
                                    ▼
              ┌──────────────────────────────────────────────┐
              │  9 zustand stores    `src/renderer/src/store/`│
              │  documentStore · uiStore · treeStore ·        │
              │  complianceStore · chatStore · outlineStore · │
              │  editorStatsStore · trackChangesStore ·       │
              │  commentStore                                 │
              └───────────────────┬──────────────────────────┘
                                  │  window.amfile.*  (the ONLY exit)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PRELOAD  (isolated world, has Node)            `src/preload/index.ts`       │
│  contextBridge.exposeInMainWorld('amfile', { platform, window, fs, docx,     │
│                                              print, compliance, ai })        │
│  15 ipcRenderer.invoke wrappers · 3 ipcRenderer.on subscriptions             │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │  IPC (structured clone)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MAIN PROCESS  (Node)                           `src/main/`                  │
│  `index.ts` — window lifecycle, spellcheck menu, handler registration        │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│ ipc/fs.ts    │ ipc/docx.ts  │ ipc/print.ts │ ipc/         │ ipc/ai.ts       │
│ 4 channels   │ 3 channels   │ 1 channel    │ compliance.ts│ 1 channel       │
│              │ ◀ CHOKEPOINT │              │ 2 channels   │                 │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴────────┬────────┘
       ▼              ▼              ▼              ▼                ▼
┌────────────┐ ┌────────────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐
│services/fs/│ │services/docx/  │ │ Chromium │ │services/      │ │services/ai/│
│  tree.ts   │ │ import·export· │ │printToPDF│ │ compliance/   │ │ provider   │
│            │ │ model·html-to-pm│ │          │ │  provider     │ │ ↓          │
│            │ │                │ │          │ │  ↓            │ │ StubAi     │
└─────┬──────┘ └───────┬────────┘ └────┬─────┘ │  StubCompliance│ └────────────┘
      │                │               │       └──────────────┘
      ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOCAL DISK — user-chosen project folder, .docx files, .pdf output           │
│  (Today the only persistence layer. This is where a server backend slots in.)│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App bootstrap (main) | Create `BrowserWindow`, set webPreferences, register all IPC handlers, spellcheck context menu | `src/main/index.ts` |
| Preload bridge | The single `contextBridge` surface; wraps every IPC call and event subscription | `src/preload/index.ts` |
| Window IPC | Minimize/maximize/close/query + `maximizeChanged` push | `src/main/ipc/window.ts` |
| Filesystem IPC | Native folder/file/save dialogs + recursive project tree read | `src/main/ipc/fs.ts` |
| **Docx IPC** | **The only code that reads or writes document bytes to disk** | `src/main/ipc/docx.ts` |
| Print IPC | `webContents.printToPDF` driven by `PageSetup`, writes the .pdf | `src/main/ipc/print.ts` |
| Compliance IPC | Delegates to `complianceProvider`, forwards streaming progress | `src/main/ipc/compliance.ts` |
| AI IPC | Delegates to `aiProvider`, forwards streaming chunks | `src/main/ipc/ai.ts` |
| Docx import | `.docx` buffer → `AmFileDocumentModel` (mammoth + raw OOXML scan) | `src/main/services/docx/import.ts` |
| Docx export | `AmFileDocumentModel` → `.docx` buffer (`docx` package) | `src/main/services/docx/export.ts` |
| Wire model | `AmFileDocumentModel`, `PageSetup`, `PMNode` type definitions | `src/main/services/docx/model.ts` |
| Project tree | Recursive directory walk with ignore list, `.docx` tagging | `src/main/services/fs/tree.ts` |
| Compliance provider | Interface + types for the (not-yet-built) deficiency backend | `src/main/services/compliance/ComplianceProvider.ts` |
| AI provider | Interface + types for the (not-yet-chosen) LLM backend | `src/main/services/ai/AiProvider.ts` |
| App shell (renderer) | Layout frame + view switch + one global event subscription | `src/renderer/src/App.tsx` |
| Editor host | Tiptap instance, extension list, command handler registration, keyboard shortcuts | `src/renderer/src/editor/EditorCanvas.tsx` |
| **Document I/O hook** | **The only `save()` in the app**; also `openFromPath` and `exportPdf` | `src/renderer/src/editor/useDocumentIO.ts` |
| Ribbon config | Pure data: every tab/group/button and its `act` string | `src/renderer/src/ribbon/ribbonConfig.ts` |
| Ribbon actions | Routes an `act` string to a store mutation or an editor command | `src/renderer/src/ribbon/ribbonActions.ts` |
| Editor command registry | Late-bound lookup of the mounted editor's command handler | `src/renderer/src/ribbon/editorCommandRegistry.ts` |
| Editor commands | Big switch mapping command strings to Tiptap chains | `src/renderer/src/editor/commandHandler.ts` |

## Pattern Overview

**Overall:** Three-process Electron app (main / preload / renderer) with a single namespaced
IPC bridge, a provider-and-stub service layer in main, and flat zustand stores plus a
command-registry indirection in the renderer.

**Key Characteristics:**
- **Hard process boundary.** Renderer has zero Node access. Every side effect is an IPC round-trip.
- **One bridge object.** `window.amfile` is the entire renderer↔main API — 15 request/response
  channels and 3 push events.
- **Provider/stub swap points.** External backends (compliance, AI) sit behind an interface with
  a one-line singleton file that is the documented swap point.
- **Streaming as callbacks, not emitters.** Long-running provider work takes an
  `onProgress`/`onChunk` function parameter; the IPC layer turns those calls into
  `webContents.send`.
- **Narrow disk chokepoints.** Documents enter and leave disk in exactly two handlers; the
  renderer has exactly one save call site.
- **No persistent state anywhere.** No database, no config file, no cache. State lives in
  zustand (renderer memory) and in the user's `.docx` files. Restarting the app loses everything
  except what was saved to disk.
- **Single-user, single-window.** No auth, no sessions, no concurrency control, no file locking.

## Layers

**Main process — IPC layer:**
- Purpose: Translate IPC calls into service calls; own `BrowserWindow`/`dialog` access
- Location: `src/main/ipc/*.ts` (six modules, one per domain)
- Contains: `ipcMain.handle` registrations only — no business logic beyond argument marshalling
- Depends on: `src/main/services/**`, `electron`
- Used by: Preload, via channel names
- Convention: each module exports a single `register<Domain>Handlers()` function

**Main process — service layer:**
- Purpose: All real work — docx conversion, filesystem walking, provider dispatch
- Location: `src/main/services/{docx,fs,compliance,ai}/`
- Contains: Pure-ish async functions (`importDocx`, `exportDocx`, `readProjectTree`) and
  provider classes
- Depends on: npm packages (`mammoth`, `docx`, `jszip`, `fast-xml-parser`), Node `fs`
- Used by: IPC layer only. **No service imports `electron`** — `src/main/services/` is
  Electron-free and therefore directly liftable into a server process.

**Preload — bridge layer:**
- Purpose: The only channel between worlds; shape the API the renderer sees
- Location: `src/preload/index.ts` (63 lines), typed globally in `src/preload/index.d.ts`
- Contains: One `amfileApi` object literal, `export type AmFileApi = typeof amfileApi`,
  one `contextBridge.exposeInMainWorld('amfile', amfileApi)`
- Depends on: `electron`'s `ipcRenderer`, plus **type-only** imports from `src/main/services/`
- Used by: Every renderer module that needs a side effect

**Renderer — state layer:**
- Purpose: All application state; the only renderer modules allowed to hold data
- Location: `src/renderer/src/store/*.ts` (9 stores)
- Contains: Flat `create<T>()` zustand stores, no middleware, no persistence, no slices
- Depends on: `window.amfile` (three of them), type-only imports from `src/main/services/`
- Used by: Every component, plus `ribbonActions` and `commandHandler` via `.getState()`

**Renderer — feature/UI layer:**
- Purpose: Render the Word-style shell and the editing surface
- Location: `src/renderer/src/{titlebar,ribbon,navigator,editor,dock,statusbar,welcome,common}/`
- Contains: Function components (`.tsx`), hooks (`use*.ts`), Tiptap extensions
- Depends on: stores, `window.amfile`, Tiptap
- Used by: `src/renderer/src/App.tsx`

## Data Flow

### The IPC contract (complete surface)

This is the full contract a server backend must slot into. **15 `ipcMain.handle` channels,
3 `webContents.send` events.** Nothing else crosses the process boundary.

**Window** — `src/main/ipc/window.ts`, exposed as `window.amfile.window.*`

| Channel | Args | Returns | Renderer call site |
|---------|------|---------|--------------------|
| `window:minimize` | — | void | `titlebar/TitleBar.tsx:49` |
| `window:maximizeToggle` | — | void | `titlebar/TitleBar.tsx:52` |
| `window:close` | — | void | `titlebar/TitleBar.tsx:59` |
| `window:isMaximized` | — | `boolean` | `titlebar/TitleBar.tsx:18` |
| **event** `window:maximizeChanged` | `boolean` | — | `titlebar/TitleBar.tsx:19` |

**Filesystem** — `src/main/ipc/fs.ts`, exposed as `window.amfile.fs.*`

| Channel | Args | Returns | Renderer call site |
|---------|------|---------|--------------------|
| `fs:openFolderDialog` | — | `string \| null` | `ribbon/ribbonActions.ts:33` |
| `fs:readDirRecursive` | `rootPath` | `FsTreeNode` | `store/treeStore.ts:30,37` |
| `fs:saveFileDialog` | `defaultName` | `string \| null` | `editor/useDocumentIO.ts:27,59` |
| `fs:openFileDialog` | — | `string \| null` | **exposed but never called** |

**Docx — CHOKEPOINT** — `src/main/ipc/docx.ts`, exposed as `window.amfile.docx.*`

| Channel | Args | Returns | Renderer call site |
|---------|------|---------|--------------------|
| `docx:read` | `path` | `{ model, warnings }` | `editor/useDocumentIO.ts:46` |
| `docx:write` | `path`, `AmFileDocumentModel` | `true` | `editor/useDocumentIO.ts:37` |
| `docx:createBlank` | `path`, `AmFileDocumentModel` | `true` | **exposed but never called** |

**Print** — `src/main/ipc/print.ts`, exposed as `window.amfile.print.*`

| Channel | Args | Returns | Renderer call site |
|---------|------|---------|--------------------|
| `print:exportPdf` | `outPath`, `PageSetup`, `headerHtml`, `footerHtml` | `boolean` | `editor/useDocumentIO.ts:67` |

**Compliance** — `src/main/ipc/compliance.ts`, exposed as `window.amfile.compliance.*`

| Channel | Args | Returns | Renderer call site |
|---------|------|---------|--------------------|
| `compliance:checkDocument` | `docId`, `docPath` | `DocumentComplianceResult` | `store/complianceStore.ts:26` |
| `compliance:checkFolder` | `folderId`, `folderPath` | `FolderComplianceResult` | `store/complianceStore.ts:33` |
| **event** `compliance:folderProgress` | `folderId`, `FolderRunUpdate` | — | `App.tsx:25` |

**AI** — `src/main/ipc/ai.ts`, exposed as `window.amfile.ai.*`

| Channel | Args | Returns | Renderer call site |
|---------|------|---------|--------------------|
| `ai:sendMessage` | `threadId`, `text` | `ChatMessageResult` | `dock/AiChatPanel.tsx:36` |
| **event** `ai:messageChunk` | `threadId`, `StreamChunk` | — | `dock/AiChatPanel.tsx:20` |

**Non-channel:** `window.amfile.platform` is a plain `process.platform` string snapshot, read
at `titlebar/TitleBar.tsx:14` to decide whether to draw Windows window controls.

**Registration order** (`src/main/index.ts:83-89`): `registerFsHandlers`, `registerDocxHandlers`,
`registerPrintHandlers`, `registerComplianceHandlers`, `registerAiHandlers` all run once on
`app.whenReady()`. `registerWindowHandlers(mainWindow)` is different — it is called *inside*
`createMainWindow()` (`src/main/index.ts:65`) because it needs the window instance to attach
`maximize`/`unmaximize` listeners.

### CHOKEPOINT 1 — `src/main/ipc/docx.ts`

`docx:read` and `docx:write` are the **only** places in the entire application where document
content moves to or from disk. Both are four-line handlers:

- `docx:read` → `fs.readFile(path)` → `importDocx(buffer)` → `{ model, warnings }`
- `docx:write` → `exportDocx(model)` → `fs.writeFile(path, buffer)` → `true`

`docx:createBlank` is byte-identical to `docx:write` and is currently unreachable from the
renderer. `print:exportPdf` also writes to disk, but PDF output only — never document source.

**Server implication:** replacing local disk with a document server means changing these two
handlers and nothing else in main. The conversion services (`importDocx`/`exportDocx`) already
take and return buffers/models, not paths.

### CHOKEPOINT 2 — `src/renderer/src/editor/useDocumentIO.ts` `save()`

`save()` (lines 23-41) is the **only** save call site in the app. Three things reach it:

1. Ribbon "Save" button → `runRibbonAction('file.save')` → `runEditorCommand('save')` →
   `EditorCanvas`'s registered handler (`EditorCanvas.tsx:105`) → `save()`
2. Cmd/Ctrl+S keydown listener (`EditorCanvas.tsx:140-143`) → `save()`
3. Nothing else. There is no autosave, no timer, no `beforeunload` flush, no crash recovery
   (`.amfile-recovery/` appears in `.gitignore` and the tree ignore list but nothing writes it).

`save()` itself: resolve `filePath` (or prompt via `fs:saveFileDialog`) → build an
`AmFileDocumentModel` literal → `docx:write` → `openDocument()` → `markSaved()`.

**Server implication:** every write to a shared document funnels through this one function.
Optimistic-concurrency checks, lock acquisition, or a "someone else edited this" prompt all
belong here.

### Primary flow — open a `.docx`

1. User clicks a `.docx` row in the project tree (`navigator/ProjectTree.tsx:59-67`)
2. `setView('editor')` + `requestOpen(node.path)` → sets `documentStore.pendingOpenPath`
3. `EditorCanvas` effect (`EditorCanvas.tsx:128-132`) sees `pendingOpenPath` and calls
   `openFromPath(path)`
4. `useDocumentIO.openFromPath` → `window.amfile.docx.read(path)` (`useDocumentIO.ts:46`)
5. Main: `fs.readFile` → `importDocx` → mammoth HTML → `htmlToPmDoc` → `PMNode` tree; a raw
   OOXML scan (`import.ts:28`) collects warnings about unpreservable tracked changes/comments,
   and a second scan (`import.ts:58`) reads `w:sectPr` for real `PageSetup`
6. Renderer: `editor.commands.setContent(result.model.content)`, then `openDocument(path, name,
   pageSetup)`. Warnings are only `console.warn`'d (`useDocumentIO.ts:51`) — never surfaced in UI.

### Primary flow — save

1. Cmd/Ctrl+S or ribbon Save → `save()`
2. If `filePath` is null → `fs:saveFileDialog` for a target
3. Build model: `{ title: fileName, content: editor.getJSON(), pageSetup, header, footer }`.
   `header`/`footer` are synthesized on the fly from the plain strings `headerText`/`footerText`
   into single-paragraph `PMNode`s (`useDocumentIO.ts:34-35`)
4. `docx:write` → `exportDocx` builds a `docx` `Document` (runs, headings, lists, tables, images,
   `InsertedTextRun`/`DeletedTextRun` for tracked changes) → `Packer.toBuffer` → `fs.writeFile`
5. `openDocument()` + `markSaved()` clear the dirty flag and stamp `savedAt`

### Streaming flow — folder compliance run

1. `runRibbonAction('compliance.checkFolder')` → `setView('folder')` (`ribbonActions.ts:50`)
2. `dock/FolderRun.tsx:28-32` effect auto-starts `checkFolder(rootPath, rootPath)`
3. `complianceStore.checkFolder` → `compliance:checkFolder` invoke, sets `folderRunning: true`
4. Main passes an `onProgress` closure into `complianceProvider.checkFolder`
   (`ipc/compliance.ts:11`); each call becomes
   `win.webContents.send('compliance:folderProgress', folderId, update)`
5. `App.tsx:23-26` — subscribed once at app root — routes every update to
   `complianceStore.applyFolderProgress` → `folderRun`
6. The invoke's promise finally resolves with the terminal `FolderComplianceResult` → `folderResult`
7. `FolderRun.tsx:34` renders `folderResult ?? folderRun` — final result wins, live progress fills in

### Streaming flow — AI chat

Same shape: `ai:sendMessage` invoke + `ai:messageChunk` push. Subscription lives in the panel
(`dock/AiChatPanel.tsx:18-25`), not at app root. `StreamChunk` is a discriminated union of
`status` / `token` / `done`; `chatStore` handles each (`setStatus` / `appendToken` /
`completeMessage`).

### Command flow — a ribbon button click

Three hops of deliberate indirection, so the ribbon never imports an editor:

1. **Config** — `ribbon/ribbonConfig.ts` is pure data: `RIBBON: Record<RibbonTabId,
   RibbonGroup[]>`, ~670 lines, every button an `{ id, label, icon, act }` record. The `act`
   is a dotted string like `'mark.bold'` or `'file.save'`.
2. **Render** — `ribbon/Ribbon.tsx` maps the config for the active tab and wires
   `onClick={() => runRibbonAction(btn.act)}`. Two buttons are special-cased into `<select>`
   elements (`font.family`, `font.size`) that call `runEditorCommand` directly with a payload.
3. **Action** — `ribbon/ribbonActions.ts` `runRibbonAction(act)` switches. App-level acts
   (`file.new`, `file.open`, `app.settings`, `view.zoom`, `track.toggle`, `ai.*`) mutate stores
   via `.getState()`. Editor-level acts are forwarded via `runEditorCommand(act)` — matched by
   the prefix allowlist `EDITOR_COMMAND_PREFIXES` (`ribbonActions.ts:6`): `mark.`, `font.`,
   `align.`, `list.`, `paragraph.`, `style.`, `insert.`, `edit.`, `track.`. Unmatched acts
   `console.info` "not wired yet" — the ribbon is intentionally larger than the implementation.
4. **Registry** — `ribbon/editorCommandRegistry.ts` holds a `Map<string, EditorCommandHandler>`
   and an `activeId` (default `'main'`). `runEditorCommand` looks up `activeId`, falls back to
   `'main'`, and logs if nothing is mounted.
5. **Handler** — `EditorCanvas` registers itself as `'main'` on mount
   (`EditorCanvas.tsx:98-99`). Its closure intercepts `save`, `print`,
   `compliance.checkDocument`, `edit.find`, `edit.replace`, `insert.image` (things needing
   React state or the IO hook), and delegates everything else to
   `editor/commandHandler.ts` `handleEditorCommand(editor, command, payload)`.

`registerEditorCommandHandler` returns an unregister closure, which the effect returns directly
as its cleanup — so unmounting the editor removes it from the map.

**State Management:**
- 9 flat zustand stores, no middleware, no persistence, no devtools.
- Components subscribe with selector functions: `useDocumentStore((s) => s.filePath)`.
- Non-React callers (ribbon actions, editor command handler, Tiptap plugins) read imperatively
  via `useStore.getState()` — see `ribbonActions.ts:9-11`, `commandHandler.ts:144`,
  `extensions/trackChangesPlugin.ts:9`.
- Cross-module coordination uses a "pending request" idiom rather than direct calls:
  `documentStore.pendingOpenPath` is set by the tree and consumed+cleared by the editor.

## Key Abstractions

**Provider/stub pattern** — the codebase's primary extension idiom, used identically for both
external backends. Three files per domain:

| Role | Compliance | AI |
|------|-----------|-----|
| Types + interface, no implementation | `services/compliance/ComplianceProvider.ts` | `services/ai/AiProvider.ts` |
| One-line singleton — **the swap point** | `services/compliance/provider.ts` | `services/ai/provider.ts` |
| Stub implementation | `services/compliance/stub/StubComplianceProvider.ts` | `services/ai/stub/StubAiProvider.ts` |

The swap-point file is literally one export, with a comment saying so:

```ts
// src/main/services/ai/provider.ts
export const aiProvider: AiProvider = new StubAiProvider()
```

```ts
// src/main/services/compliance/provider.ts
export const complianceProvider: ComplianceProvider = new StubComplianceProvider()
```

The IPC handler imports the singleton, never the concrete class
(`ipc/ai.ts:2`, `ipc/compliance.ts:2`). Replacing a backend touches exactly one file; the IPC
channel, the preload surface, the store, and the UI are all unaffected.

**Follow this pattern for any new external dependency.** Directory layout:
`services/<domain>/<Domain>Provider.ts` (types + interface) →
`services/<domain>/provider.ts` (singleton) → `services/<domain>/stub/Stub<Domain>Provider.ts`.

**Streaming via callback parameter, not event emitter.** Providers that produce incremental
output take a callback as their last argument:

```ts
// AiProvider.ts
sendMessage(threadId: string, text: string, onChunk: (chunk: StreamChunk) => void): Promise<ChatMessageResult>

// ComplianceProvider.ts
checkFolder(folderId: string, folderPath: string, onProgress: (update: FolderRunUpdate) => void): Promise<FolderComplianceResult>
```

The provider knows nothing about IPC. The IPC handler supplies a closure that does the
`webContents.send`. The promise still resolves with the terminal result, so the renderer gets
both a stream *and* a final value from one `invoke`. Keep this shape for new streaming providers.

**The `AmFileDocumentModel` wire format** — `src/main/services/docx/model.ts`:

```ts
interface AmFileDocumentModel {
  title: string
  content: PMNode        // ProseMirror/Tiptap JSON document
  pageSetup: PageSetup
  header: PMNode | null
  footer: PMNode | null
}
```

This is **already a clean, structured-clone-safe, JSON-serializable wire format** — no
`Buffer`, no `Date`, no class instances, no circular references. It crosses IPC intact today
and would cross HTTP intact with `JSON.stringify` and no adapter. `PMNode` is deliberately a
minimal structural type (`{ type, attrs?, marks?, text?, content? }`) so main-process code does
not import Tiptap.

**`PageSetup` is declared twice, as two independent duplicates:**
- `src/main/services/docx/model.ts:1-19` — `PageSetup` + `DEFAULT_PAGE_SETUP`
- `src/renderer/src/store/documentStore.ts:4-22` — `PageSetup` + `DEFAULT_PAGE_SETUP`

Identical field-for-field and value-for-value, with no import between them and no test asserting
they agree. They pass each other across IPC by structural compatibility only. Any change to page
setup must be made in both files.

**Late-bound handler registration** — the renderer's answer to "the panel and the editor are
mounted in different subtrees." A store holds a nullable callback plus a registrar; the editor
fills it in on mount; the panel calls the store action, which forwards to the callback if present:

```ts
// store/trackChangesStore.ts
onAccept: ((id: string) => void) | null
acceptChange: (id) => get().onAccept?.(id)
registerHandlers: (onAccept, onReject) => set({ onAccept, onReject })
```

- `trackChangesStore.registerHandlers(onAccept, onReject)` — supplied by
  `editor/useTrackChangesSync.ts:51`, consumed by `dock/ReviewPanel.tsx` Accept/Reject buttons
- `commentStore.registerDeleteHandler(fn)` — supplied by `EditorCanvas.tsx:91`, consumed by
  `dock/ReviewPanel.tsx` delete

Before an editor mounts these are no-ops rather than throws, so the dock renders standalone.
Note the asymmetry: `commentStore.registerDeleteHandler` returns nothing (its `EditorCanvas.tsx:91`
effect returns `undefined` as cleanup), while `editorCommandRegistry.registerEditorCommandHandler`
*does* return an unregister closure. `editor/insertComment.ts:21-27` contains a vestigial
`registerCommentDeleteHandler` that returns an empty cleanup and is never imported.

**Sync hooks** — one hook per derived-state stream, all taking `Editor | null`, all subscribing
to Tiptap events and pushing into a store:

| Hook | Reads | Writes |
|------|-------|--------|
| `editor/useOutlineSync.ts` | heading nodes | `outlineStore.headings` |
| `editor/useEditorStats.ts` | characterCount storage + DOM height | `editorStatsStore` |
| `editor/useTrackChangesSync.ts` | `insertion`/`deletion` marks | `trackChangesStore.changes` + registers accept/reject |
| `editor/useDocumentIO.ts` | store + editor | performs IPC |

All are called together in `EditorCanvas.tsx:84-87`.

**Tiptap extensions** — `src/renderer/src/editor/extensions/`, each a `Mark`/`Node`/`Extension`
with a `declare module '@tiptap/core'` command-type augmentation. `paragraphStyle.ts`,
`trackChangeMarks.ts` and `fontAttributes.ts` are explicitly paired with docx import/export
(the OOXML style map and `runsFromInline` read the same names).

## Entry Points

**Main process:**
- Location: `src/main/index.ts` (built to `out/main/index.js`, the `main` field in `package.json`)
- Triggers: Electron app launch
- Responsibilities: `app.whenReady()` → set app user model id, register 5 handler groups,
  `createMainWindow()`. Also `window-all-closed` (quit except on darwin) and `activate`
  (re-create window on darwin).

**Renderer:**
- Location: `src/renderer/index.html` → `src/renderer/src/main.tsx` → `src/renderer/src/App.tsx`
- Triggers: `mainWindow.loadURL(ELECTRON_RENDERER_URL)` in dev, `loadFile('../renderer/index.html')` in prod
- Responsibilities: `ReactDOM.createRoot` under `React.StrictMode`; `App` imports all four CSS
  layers, renders the shell, switches on `uiStore.view`, and subscribes to
  `compliance:folderProgress`.

**Preload:**
- Location: `src/preload/index.ts` (built to `out/preload/index.mjs`, referenced at
  `src/main/index.ts:25`)
- Triggers: Injected before renderer scripts by `webPreferences.preload`
- Responsibilities: Build `amfileApi`, expose it as `window.amfile`. No logic beyond wrapping.

## Architectural Constraints

- **Renderer must never import `electron`, `fs`, or `path`.** Verified: zero such imports exist
  in `src/renderer/`. All privileged access goes through `window.amfile`.
- **`sandbox: false`** (`src/main/index.ts:26`) — required because the preload uses ESM
  (`out/preload/index.mjs`) and `externalizeDepsPlugin`. This means the preload runs with full
  Node access, so anything added to `src/preload/index.ts` is genuinely privileged. Keep the
  preload a dumb wrapper.
- **Renderer CSP** (`src/renderer/index.html`): `default-src 'self'; script-src 'self';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`. No remote
  origins are permitted — a server backend must be reached from **main**, not from the renderer.
- **`setWindowOpenHandler` denies all** and routes to `shell.openExternal`
  (`src/main/index.ts:37-40`). No in-app browsing.
- **Single-window assumption.** `registerWindowHandlers` calls `ipcMain.handle` from inside
  `createMainWindow()`. Electron throws on a duplicate handler for the same channel, so the
  macOS `activate` path (`src/main/index.ts:92`, re-creating a window after all were closed)
  will attempt to re-register `window:minimize` and friends. Multi-window support requires
  hoisting these four registrations to `app.whenReady()` and resolving the window from
  `event.sender`, which the handler bodies already do.
- **Threading:** single main-process event loop. `importDocx`/`exportDocx` are `async` but
  CPU-bound (mammoth parse, JSZip inflate, `Packer.toBuffer`) and run on the main thread — a
  large `.docx` blocks window management and every other IPC handler. No worker threads,
  no `utilityProcess`.
- **Global state in main:** `openRoots` — a `WeakMap<BrowserWindow, string>` in
  `src/main/ipc/fs.ts:9`. Its comment describes path confinement, but it is only ever written
  (lines 17, 23) and never read; `fs:readDirRecursive`, `docx:read`, `docx:write` and
  `print:exportPdf` accept any absolute path from the renderer without validation. Any
  server-mediated access-control work must add the read side here.
- **Global state in renderer:** `handlers` Map + `activeId` in
  `src/renderer/src/ribbon/editorCommandRegistry.ts:10-11` — module-level mutable singletons
  shared by the whole renderer.
- **Circular imports:** none. Dependencies flow one way — `App → features → stores → window.amfile`.
  The one back-edge is `navigator/ProjectTree.tsx` and `welcome/Welcome.tsx` importing
  `ribbon/ribbonActions.ts`, which is a leaf-ish module (imports stores + registry only).
- **No test suite, no linter config.** `npm run typecheck` (dual `tsc --noEmit` across
  `tsconfig.node.json` and `tsconfig.web.json`) is the only automated gate.
- **Type-only cross-boundary imports are allowed and used.** Renderer and preload reach into
  `src/main/services/**` for types (`store/complianceStore.ts:2`, `store/chatStore.ts:2`,
  `dock/CompliancePanel.tsx:5`, `preload/index.ts:2-5`). This works because
  `externalizeDepsPlugin` and `import type` erase at build time. It also means main's service
  types are the de-facto shared schema.

## Anti-Patterns

### Reaching around the docx chokepoint

**What happens:** Adding a new `ipcMain.handle` that calls `fs.readFile`/`fs.writeFile` on a
document path directly, instead of going through `docx:read`/`docx:write`.
**Why it's wrong:** Documents currently touch disk in exactly two handlers. That property is
what makes server mediation a two-file change. A third path silently forks the persistence
model and will not be covered by whatever locking/versioning the server introduces.
**Do this instead:** Extend `src/main/ipc/docx.ts`, or add a service under
`src/main/services/docx/` that the existing handlers call. `print:exportPdf`
(`src/main/ipc/print.ts`) is the one sanctioned exception — it writes derived PDF output only.

### Adding a second save path

**What happens:** Wiring autosave, an interval flush, an `onBlur` write, or a "save as" that
builds its own model and calls `window.amfile.docx.write` from a component.
**Why it's wrong:** `useDocumentIO.save()` is the single funnel every write goes through today.
Duplicating the model-construction literal (`useDocumentIO.ts:30-36`) means two places that must
stay in sync with `AmFileDocumentModel`, and a second write path that bypasses any future
conflict check.
**Do this instead:** Extend `save()` in `src/renderer/src/editor/useDocumentIO.ts`, or add a
sibling in the same hook that delegates to it. New triggers should call the existing `save()` —
see how Cmd+S (`EditorCanvas.tsx:140`) and the ribbon (`EditorCanvas.tsx:105`) both do.

### Importing a provider's concrete class

**What happens:** `import { StubAiProvider } from './stub/StubAiProvider'` in an IPC handler or
elsewhere, instead of importing the `aiProvider` singleton.
**Why it's wrong:** Defeats the single swap point. `src/main/services/ai/provider.ts` and
`src/main/services/compliance/provider.ts` exist so that exactly one line changes when a real
backend arrives.
**Do this instead:** `import { aiProvider } from '../services/ai/provider'` — as
`src/main/ipc/ai.ts:2` and `src/main/ipc/compliance.ts:2` do. The only file allowed to name a
concrete provider class is that domain's `provider.ts`.

### Duplicating a shared type instead of importing it

**What happens:** Re-declaring a type that already exists in `src/main/services/`, the way
`PageSetup` is declared in both `src/main/services/docx/model.ts` and
`src/renderer/src/store/documentStore.ts`, and the way `FsTreeNode` is declared in both
`src/main/services/fs/tree.ts` and `src/renderer/src/store/treeStore.ts`.
**Why it's wrong:** Two definitions that only agree by convention, with nothing that fails when
they drift. `useDocumentIO.ts:37` already has to launder the mismatch with `as never`.
**Do this instead:** `import type { X } from '../../../main/services/...'` — the pattern already
established by `store/complianceStore.ts:2`, `store/chatStore.ts:2` and `preload/index.ts:2-5`.
Type-only imports across the process boundary are erased at build time and cost nothing.

### Swallowing an import warning

**What happens:** `importDocx` collects real user-facing warnings (pre-existing tracked changes
and comments that will be destroyed), and `useDocumentIO.ts:51` `console.warn`s them.
**Why it's wrong:** The warnings exist specifically so the user can decide *before* losing a
reviewer's revision history. Routing them to devtools means the loss is silent in practice.
**Do this instead:** Surface `result.warnings` through a store (the pattern
`complianceStore.applyFolderProgress` uses) and render it. Do not add new IPC results whose
error/warning channel is `console`.

## Error Handling

**Strategy:** Effectively none. There is no top-level error boundary, no `try`/`catch` in any
IPC handler, no rejection handling in the renderer.

**Patterns actually present:**
- **Guard-and-return.** Every renderer entry to the bridge starts `if (!window.amfile) return`
  (`App.tsx:24`, `useDocumentIO.ts:24,45,58`, `treeStore.ts:28,36`, `complianceStore.ts:24,31`,
  `AiChatPanel.tsx:19`, `TitleBar.tsx:17`, `ribbonActions.ts:32`). This lets the renderer run in
  a plain browser (`electron-vite preview`, or a future web build) without throwing. Preserve it.
- **Silent-null on cancel.** Dialog handlers return `null` when the user cancels
  (`fs.ts:15,33,43`); callers early-return on null.
- **Localized `try`/`catch` with a documented fallback.** Only in
  `src/main/services/docx/import.ts` — `scanForUnsupportedRevisions` swallows non-zip errors
  (letting mammoth raise the real one) and `readSectionPropertiesImpl` falls back to
  `DEFAULT_PAGE_SETUP`.
- **`console.info` for unimplemented commands.** `ribbonActions.ts:77`
  (`"[ribbon] X is not wired yet"`), `commandHandler.ts:206`, `editorCommandRegistry.ts:27`.
  This is deliberate: the ribbon is fuller than the implementation.
- **`window.alert` / `window.prompt` as the UI.** `insertComment.ts:7,10`,
  `commandHandler.ts:135,144,150,158,193`. There is no modal/toast component.
- **Unhandled failure mode:** if `docx:read` or `docx:write` throws in main, the `invoke` promise
  rejects and nothing catches it — `save()` is called as `void save()` (`EditorCanvas.tsx:106`)
  and `openFromPath(...).then(...)` (`EditorCanvas.tsx:130`) has no `.catch`. A failed save is
  invisible to the user and leaves `dirty` unchanged.

## Cross-Cutting Concerns

**Logging:** `console.warn` / `console.info` only. No logger, no log file, no telemetry, no
crash reporter. Main-process code logs nothing at all.

**Validation:** None at the IPC boundary. Handlers trust their arguments — paths are not
normalized, confined, or checked; models are not schema-validated. `zod` is a declared
dependency in `package.json` but is not imported anywhere in `src/`. The `openRoots` WeakMap
(`ipc/fs.ts:9`) is the intended confinement mechanism and is currently write-only.

**Authentication:** None. Single-user app, no identity of any kind. Author attribution is
hardcoded: `authorName: 'You'` in `extensions/trackChangeMarks.ts:6` and
`insertComment.ts:17-18`, `authorId: 'local-user'`, and a literal `RD` avatar in
`titlebar/TitleBar.tsx:46`. `exportDocx` falls back to `'Reviewer'` when a mark carries no
author (`export.ts:63,71`). These are the identity seams a multi-user backend must fill.

**Configuration:** None. No `.env`, no config file, no `electron-store`, no `app.getPath('userData')`
usage. Every constant is a literal in source. Signing/notarization env vars
(`APPLE_ID`, `CSC_LINK`, …) are consumed by `electron-builder` at package time only, never at runtime.

**Theming:** Three CSS layers imported once in `App.tsx` — `design/fonts.css`,
`design/tokens.css` (CSS custom properties from the Industry design system),
`design/blueprint.css` (the `.blueprint` + corner-mark frame, wrapped by
`common/BlueprintCard.tsx`) — plus `App.css` and a scoped `editor/editor.css`.

**Spellcheck:** Electron-native. `spellcheck: true` in `webPreferences` plus a `context-menu`
listener in `src/main/index.ts:42-63` that builds a suggestions menu and offers
"Add to dictionary". No renderer involvement.

---

*Architecture analysis: 2026-08-09*
*Update when major patterns change*
