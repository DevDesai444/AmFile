# External Integrations

**Analysis Date:** 2026-08-09

## Summary: There Are None

**AmFile has zero external integrations.** This is not a gap in the analysis — it is the actual state of the codebase, and it is the single most important fact for planning the multi-user server backend.

Verified by exhaustive grep across `src/`:

| Searched for | Result |
|---|---|
| `fetch(`, `axios`, `node-fetch`, `got(`, `XMLHttpRequest`, `WebSocket` | **0 hits** |
| `http.request`, `https://`, `net.` | **0 hits** |
| Any database client, ORM, or driver in `package.json` | **None declared** |
| Any auth SDK / OAuth / JWT library | **None declared** |
| Any telemetry, analytics, or error-tracking SDK | **None declared** |
| `process.env` in `src/` | **1 hit**, and it is `ELECTRON_RENDERER_URL` (dev-server URL injected by electron-vite) at `src/main/index.ts:67-68` |
| `.env` / `.env.*` files | **None exist** in the repo |

The app is a fully offline, single-user, local-filesystem desktop program. Everything it does happens inside the Electron process tree and on the user's own disk.

## APIs & External Services

**None.**

The two panels that *look* like they call a service — AI research chat and compliance checking — are wired to local in-process stubs. Both are deliberately structured behind a one-file swap point.

**AI research chat:**
- Interface: `src/main/services/ai/AiProvider.ts` — a single method, `sendMessage(threadId, text, onChunk)`, with a `StreamChunk` union of `{kind:'status'}` / `{kind:'token'}` / `{kind:'done'}`. The streaming shape is already modelled, which means swapping in a real streaming LLM does not change the contract.
- Swap point: `src/main/services/ai/provider.ts` — 6 lines, exports `export const aiProvider: AiProvider = new StubAiProvider()`. Its own comment states nothing outside this file needs to change.
- Current implementation: `src/main/services/ai/stub/StubAiProvider.ts` (58 lines). Local, synthetic, no imports beyond its own types.
- IPC surface: `src/main/ipc/ai.ts` (`ai:sendMessage` invoke; `ai:messageChunk` push events back to the window).
- Renderer surface: `window.amfile.ai.sendMessage` / `onMessageChunk` (`src/preload/index.ts:49-58`), consumed by `src/renderer/src/store/chatStore.ts`.
- Auth: none. No API key, no endpoint, no model name anywhere in the codebase.

**Compliance checking:**
- Interface: `src/main/services/compliance/ComplianceProvider.ts` — `checkDocument(docId, docPath)` and `checkFolder(folderId, folderPath, onProgress)`. The domain vocabulary is already fully typed: `Severity` (high/medium/low), `ConfidenceTier` (verified/corroborated/advisory), `Finding.detectionMethod` (code-verified/quote-anchored/model-judgment), `precedentCount`, `CrossDocIssue`, `AgentLogLine`, `FolderRunUpdate`.
- Swap point: `src/main/services/compliance/provider.ts` — 6 lines, exports `export const complianceProvider: ComplianceProvider = new StubComplianceProvider()`.
- Current implementation: `src/main/services/compliance/stub/StubComplianceProvider.ts` (219 lines). Local, synthetic, no network.
- IPC surface: `src/main/ipc/compliance.ts` (`compliance:checkDocument`, `compliance:checkFolder` invokes; `compliance:folderProgress` push events).
- Renderer surface: `window.amfile.compliance.*` (`src/preload/index.ts:38-48`), consumed by `src/renderer/src/store/complianceStore.ts`.
- **Intended real backend:** the `deficiency-chatbot` repo (`DevDesai444/deficiency-chatbot`, tracked in `github.md`). Not built, not reachable, not referenced by any code in this repo. `github.md` is a design-provenance note recording which of that repo's frontend components inspired AmFile's compliance dock — it is documentation, not configuration.

## Data Storage

**Databases:** None. No SQL, no NoSQL, no embedded store (no SQLite, no LevelDB, no lowdb). No ORM, no migrations directory, no schema files.

**File Storage:** Local filesystem only, via Node's `fs.promises` in the main process.
- Folder tree read: `src/main/services/fs/tree.ts` — `readProjectTree(rootPath)` does a one-shot recursive `readdir`, classifying entries as `folder` / `docx` / `file`. Skips `.git`, `node_modules`, `.DS_Store`, `.amfile-recovery`, and any dotfile.
- Document read/write: `src/main/ipc/docx.ts` (`docx:read`, `docx:write`, `docx:createBlank`) — reads/writes real `.docx` bytes at arbitrary user-chosen paths.
- PDF write: `src/main/ipc/print.ts:25` — `fs.writeFile(outPath, data)` where `data` comes from Chromium's `printToPDF`.
- Paths come from native dialogs only (`fs:openFolderDialog`, `fs:openFileDialog`, `fs:saveFileDialog` in `src/main/ipc/fs.ts`). The app never invents a storage location — there is no `app.getPath('userData')` usage anywhere.
- **No file watching.** `chokidar` is declared in `package.json` but imported nowhere; the tree is only refreshed when the renderer re-invokes `fs:readDirRecursive`.

**Caching:** None. No Redis, no in-memory cache layer, no HTTP cache. Zustand stores hold live state only and use **no `persist` middleware** — every store in `src/renderer/src/store/` (all nine) imports the bare `create` from `zustand`. Nothing survives an app restart.

## Authentication & Identity

**None.** The app has no concept of a user account, session, token, or login.

Identity is a hard-coded placeholder in exactly one place: `src/renderer/src/editor/extensions/trackChangeMarks.ts:3-8`, where every track-change mark defaults to `authorId: 'local-user'` and `authorName: 'You'`. That default propagates all the way into exported Word documents — `src/main/services/docx/export.ts:63,71` falls back to `author: 'Reviewer'` when the attribute is missing.

Comments carry the same pattern: `src/renderer/src/editor/extensions/comment.ts` stores an `authorName` on the mark, with the body in `commentStore`.

**Implication for multi-user work:** the track-changes and comment marks already carry `authorId` / `authorName` / `timestamp` / `changeId` attributes on every mark. The data model is multi-author-ready; only the *source* of identity is missing. Threading a real user through means changing the default in `trackChangeMarks.ts` and wherever comments are created — not redesigning the document model.

## Monitoring & Observability

**Error Tracking:** None. No Sentry, no Bugsnag, no crash reporter (`crashReporter` is never called). Errors in the docx pipeline are swallowed by bare `catch {}` blocks that fall back to defaults — see `src/main/services/docx/import.ts:48-50` (invalid zip) and `import.ts:81-83` (unparseable section properties).

**Analytics:** None. No product analytics, no usage telemetry, no event tracking of any kind.

**Logs:** stdout/stderr from the Electron process only. No logging framework, no log file, no log shipping. Nothing is retained after the process exits.

## CI/CD & Deployment

**Hosting:** Not applicable — desktop app, no server component.

**CI Pipeline:** **None.** There is no `.github/` directory. No GitHub Actions, no CircleCI, no Jenkins, no pipeline config of any kind. Every build, typecheck, and package step is run manually on a developer machine.

**Distribution:** Manual. `npm run dist:mac` / `npm run dist:win` produce artifacts in `dist/`; getting them to users is an out-of-band, undocumented step. No auto-updater is configured (`electron-updater` is not a dependency, and `electron-builder.yml` has no `publish` block).

**Repository:** `origin` → `https://github.com/DevDesai444/AmFile.git`

## Environment Configuration

**Development:**
- Required env vars: **none.** `npm install && npm run dev` is the complete setup. No credentials, no service accounts, no local database, no Docker.
- `ELECTRON_RENDERER_URL` is set automatically by electron-vite during `npm run dev` and read at `src/main/index.ts:67`; it is not something a developer sets.
- Secrets location: **not applicable** — the repo has no secrets to manage. `.gitignore` covers `node_modules/`, `out/`, `dist/`, `.DS_Store`, `*.log`, `.amfile-recovery/`, `*.tsbuildinfo`, and two generated `electron.vite.config.*` artifacts. There is no `.env` entry because there are no `.env` files.
- Mock/stub services: `StubAiProvider` and `StubComplianceProvider`, always active, with no flag to disable them.

**Staging:** Does not exist.

**Production:**
- Build-time only. The signing/notarization env vars are consumed by electron-builder, never by application code:

| Variable | Used by | Default |
|---|---|---|
| `APPLE_ID` | macOS notarization | unset |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS notarization | unset |
| `CSC_LINK` | Windows code signing (cert file) | unset |
| `CSC_KEY_PASSWORD` | Windows code signing (cert password) | unset |
| `CSC_IDENTITY_AUTO_DISCOVERY` | Set to `false` locally to skip signing cleanly | unset |

- `electron-builder.yml` hard-codes `mac.notarize: false` and `dmg.sign: false`. No certificates are committed and none should be — supply `.p12`/`.pfx` material as CI secrets if a pipeline is ever added.

## Webhooks & Callbacks

**Incoming:** None. The app runs no HTTP server, opens no ports, and registers no protocol handler or deep-link scheme.

**Outgoing:** None. No outbound request of any kind is made.

The only "callback"-shaped mechanism is internal: main → renderer IPC push events over `ipcRenderer.on`, unsubscribed via returned disposers (`src/preload/index.ts`):
- `window:maximizeChanged` — window state
- `compliance:folderProgress` — folder-run progress updates
- `ai:messageChunk` — token streaming from the AI stub

## Network Posture (read this before adding a backend)

Three separate things currently block network access, and all three must be consciously addressed:

1. **CSP forbids it.** `src/renderer/index.html:6-8` sets `default-src 'self'` with **no `connect-src` directive**, so `connect-src` inherits `'self'`. The renderer cannot reach any external origin today. Same for fonts (`font-src 'self' data:`) — which is why `@fontsource` is self-hosted rather than loaded from a CDN.
2. **No HTTP client exists.** Nothing is installed and nothing is imported. A choice has to be made (native `fetch` in main, `undici`, `axios`).
3. **No config mechanism exists.** There is no `.env` loading, no settings file, no `userData` store — a server URL or tenant ID has literally nowhere to live.

**Recommended direction, consistent with existing architecture:** route all network traffic through the **main process** and expose it over the existing preload bridge, rather than widening the renderer CSP. This matches how every other capability already works (`fs`, `docx`, `print`, `ai`, `compliance` are all main-process services behind `window.amfile.*`), keeps `contextIsolation: true` / `nodeIntegration: false` intact (`src/main/index.ts:24-30`), and leaves the CSP untouched. The `AiProvider` / `ComplianceProvider` swap-point pattern is the template to follow for a new `SyncProvider` or `AuthProvider`.

**Also relevant:** `zod` ^3.25.76 is already declared in `dependencies` and imported nowhere. IPC payloads currently cross the preload bridge with compile-time types only — `src/preload/index.ts:30` declares `model: AmFileDocumentModel` and `src/main/ipc/docx.ts` trusts it unverified. Once responses arrive from a server rather than from a local stub, that trust is no longer safe; `zod` is the pre-provisioned answer.

## Developer-Machine Tooling (not an app integration)

The Databricks CLI v1.6.0 is installed on the developer machine at `/opt/homebrew/bin/databricks`, associated with the workspace `aip-amn-dev.cloud.databricks.com`.

**AmFile does not talk to Databricks.** There is no Databricks SDK in `package.json`, no reference in `src/`, no workspace URL in any config file, and no credential handling. This is developer-machine context for the surrounding Amneal environment, not a dependency of this application. Do not treat it as an existing integration.

---

*Integration audit: 2026-08-09*
*Update when adding/removing external services*
