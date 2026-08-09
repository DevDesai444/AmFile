# Technology Stack

**Analysis Date:** 2026-08-09

## Languages

**Primary:**
- TypeScript 5.9.3 - All application code across all three Electron processes (`src/main/`, `src/preload/`, `src/renderer/`)
- TSX (React JSX) - All renderer UI components (`src/renderer/src/**/*.tsx`)

**Secondary:**
- Plain CSS - All styling. Five stylesheets, no preprocessor, no framework, no CSS-in-JS:
  - `src/renderer/src/design/tokens.css` - design tokens (dark theme variables)
  - `src/renderer/src/design/blueprint.css` - app shell layout
  - `src/renderer/src/design/fonts.css` - `@fontsource` `@import`s
  - `src/renderer/src/App.css` - component styles
  - `src/renderer/src/editor/editor.css` - ProseMirror/page-frame styles
- YAML - Packaging config only (`electron-builder.yml`)
- HTML - Renderer entry document `src/renderer/index.html`; also the frozen visual mockup in `design-reference/`

## Runtime

**Environment:**
- Electron 32.3.3 - Desktop shell. Bundles Chromium 128 (renderer) and Node.js 20.x (main/preload; `electron`'s own `@types/node` pin is `^20.9.0`).
- Node.js v22.22.0 - Developer machine toolchain version (runs Vite/tsc/electron-builder). Not the runtime the shipped app executes on.
- **ESM throughout** - `package.json` sets `"type": "module"`. Build output confirms it: `out/main/index.js` is ESM (`import { app } from "electron"`) and preload emits as `out/preload/index.mjs`, which `src/main/index.ts:25` loads by that exact `.mjs` name.
- No `.nvmrc`, no `engines` field - Node version is unpinned.

**Package Manager:**
- npm 10.9.4
- Lockfile: `package-lock.json` present and committed (~322 KB)

## Frameworks

**Core:**
- React 18.3.1 + react-dom 18.3.1 - Renderer UI. Mounted at `src/renderer/src/main.tsx` into `#root`.
- Tiptap 2.26.2 (`@tiptap/react`, `@tiptap/core`, resolved 2.27.2) - Rich-text editor framework wrapping ProseMirror. Single editor instance created in `src/renderer/src/editor/EditorCanvas.tsx:51`.
- ProseMirror (via `@tiptap/pm` 2.26.2, resolved 2.27.2) - Underlying document model/state/view. Used directly in `src/renderer/src/editor/extensions/trackChangesPlugin.ts` (`Plugin`, `PluginKey`, `TextSelection` from `@tiptap/pm/state`).

**Testing:**
- **None.** No test runner, no assertion library, no test files. `find src -name "*.test.*" -o -name "*.spec.*"` returns zero results. No `jest.config.*` / `vitest.config.*`.

**Build/Dev:**
- electron-vite 2.3.0 - Orchestrates three Vite builds (main/preload/renderer) from one config. Config: `electron.vite.config.ts`.
- Vite 5.4.20 (resolved 5.4.21) - Bundler and dev server with HMR for the renderer.
- `@vitejs/plugin-react` 4.7.0 - React Fast Refresh + JSX transform.
- `externalizeDepsPlugin()` - Applied to `main` and `preload` only (`electron.vite.config.ts:7,10`). Node-native deps (mammoth, jszip, docx, jsdom, fast-xml-parser) stay external in main; renderer deps are bundled.
- TypeScript 5.9.3 - Typecheck only (`tsc --noEmit`); Vite/esbuild does the actual transpilation.
- electron-builder 25.1.8 - Installer/package generation.

**Linting/Formatting:**
- **None configured.** No `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `biome.json`, or `.editorconfig` at repo root. Code style is convention-by-consistency only.

## Key Dependencies

**Critical (document I/O — the core value of the app):**
- `mammoth` ^1.11.0 (resolved 1.12.0) - **docx → HTML import.** Used at `src/main/services/docx/import.ts:88` via `mammoth.convertToHtml({ buffer }, { styleMap: STYLE_MAP })`. The `STYLE_MAP` (`import.ts:8-15`) maps Word styles `Heading 1..3`, `CTD Section`, `Reference`, `Table Caption` to HTML tags/classes.
- `docx` ^9.5.1 (resolved 9.7.1, dolanmiu) - **Model → docx export.** Used throughout `src/main/services/docx/export.ts`. Notably emits real OOXML tracked changes via `InsertedTextRun` / `DeletedTextRun` (`export.ts:59-73`), page setup via `convertMillimetersToTwip` + `PageOrientation` (`export.ts:176-190`), and headers/footers via `Header`/`Footer` (`export.ts:212-213`).
- `jszip` ^3.10.1 - **Raw .docx zip access.** Opens the `.docx` archive to read `word/document.xml` directly, twice in `src/main/services/docx/import.ts`: `scanForUnsupportedRevisions` (line 31) regex-counts `<w:ins`/`<w:del`/`<w:commentReference` so the user is warned before mammoth silently accepts them, and `readSectionPropertiesImpl` (line 60) pulls the section properties mammoth discards.
- `fast-xml-parser` ^5.3.0 (resolved 5.10.1) - **OOXML section-properties parsing.** `new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })` at `src/main/services/docx/import.ts:63`, reading `w:sectPr` → `w:pgSz`/`w:pgMar` and converting twips → mm to recover page size, orientation, and margins.
- `jsdom` ^25.0.1 - **HTML → ProseMirror JSON.** `src/main/services/docx/html-to-pm.ts:116` parses mammoth's HTML string in the main process (where there is no DOM) and walks it into the `PMNode` tree defined in `src/main/services/docx/model.ts`.

**Critical (editor + state):**
- `@tiptap/starter-kit` ^2.26.2 - Base node/mark set. Configured with `paragraph: false` at `EditorCanvas.tsx:53` so the custom `StyledParagraph` replaces the stock paragraph node.
- `zustand` ^5.0.8 (resolved 5.0.14) - All renderer state. Nine stores in `src/renderer/src/store/`: `chatStore`, `commentStore`, `complianceStore`, `documentStore`, `editorStatsStore`, `outlineStore`, `trackChangesStore`, `treeStore`, `uiStore`. **Every store uses the bare `create` import — no middleware anywhere.** No `persist`, no `createJSONStorage`, no `devtools`, no `immer`. Consequence: nothing survives an app restart; window/dock layout, open folder, and chat history are all in-memory only.

**UI:**
- `lucide-react` ^0.544.0 - Icon set. Used in `src/renderer/src/ribbon/ribbonConfig.ts` (the ribbon's full icon table, ~100 icons), plus `titlebar/TitleBar.tsx`, `navigator/Navigator.tsx`, `navigator/ProjectTree.tsx`, `navigator/OutlineTree.tsx`, `dock/Dock.tsx`, `statusbar/StatusBar.tsx`, `welcome/Welcome.tsx`, `editor/FindReplaceBar.tsx`.
- `@fontsource/barlow`, `@fontsource/barlow-condensed`, `@fontsource/barlow-semi-condensed` ^5.2.8 - Self-hosted Barlow family, `@import`ed as ten weight-specific CSS files in `src/renderer/src/design/fonts.css`. Self-hosting matters: the CSP forbids remote font loading (see below).

**Electron toolkit (devDependencies, but runtime-relevant):**
- `@electron-toolkit/utils` ^4.0.0 - `electronApp.setAppUserModelId`, `optimizer.watchWindowShortcuts`, `is.dev` in `src/main/index.ts`.
- `@electron-toolkit/preload` ^3.0.2 - Preload helpers (installed; `src/preload/index.ts` uses raw `contextBridge`/`ipcRenderer` directly).
- `@electron-toolkit/tsconfig` ^1.0.1 - Base tsconfigs extended by both project configs.

## Declared but Unused Dependencies

Both are in `dependencies` (not dev) and both return **zero hits** from `grep -rn "chokidar\|zod" src/`. Neither appears in `electron.vite.config.ts` or `electron-builder.yml` either.

- `chokidar` ^4.0.3 - **Unused.** No filesystem watching exists. `src/main/services/fs/tree.ts` does a one-shot recursive `fs.readdir` walk (`readProjectTree`), and the renderer must re-invoke `fs:readDirRecursive` to see changes. This is the dependency the multi-user work will want for detecting out-of-band edits to shared document folders.
- `zod` ^3.25.76 - **Unused.** No runtime validation anywhere. IPC payloads cross the preload bridge with compile-time types only — e.g. `src/preload/index.ts:30` declares `model: AmFileDocumentModel`, and `src/main/ipc/docx.ts` trusts it. This is the dependency the multi-user work will want for validating server responses and IPC/API boundaries.

Treat both as pre-provisioned for the server backend, not as accidental cruft — but note nothing in the current app breaks if they are removed.

## Configuration

**Environment:**
- **No `.env` files exist** and none are read. Only one `process.env` access in the entire `src/` tree: `ELECTRON_RENDERER_URL` at `src/main/index.ts:67-68`, which electron-vite injects during `npm run dev` to point the window at the Vite dev server. Production falls through to `loadFile(join(__dirname, '../renderer/index.html'))`.
- Signing/notarization env vars (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `CSC_IDENTITY_AUTO_DISCOVERY`) are consumed by electron-builder, not by app code. All unset by default.
- **Implication for multi-user work:** there is no config loading mechanism at all. A server URL, tenant ID, or auth endpoint has nowhere to live today.

**Build:**
- `electron.vite.config.ts` - Three-target build; `@renderer` alias → `src/renderer/src` (renderer only).
- `tsconfig.json` - Solution file. `"files": []`, references the two project configs below.
- `tsconfig.node.json` - Extends `@electron-toolkit/tsconfig/tsconfig.node.json`. Includes `electron.vite.config.ts`, `src/main/**/*`, `src/preload/**/*`. Types: `electron-vite/node`.
- `tsconfig.web.json` - Extends `@electron-toolkit/tsconfig/tsconfig.web.json`. Includes `src/renderer/src/**/*` **and** `src/preload/index.d.ts` (this is how the renderer sees the `window.amfile` type). `jsx: react-jsx`, path alias `@renderer/*`.
- `electron-builder.yml` - Packaging.
- **Note the split is enforced:** main/preload and renderer are separate TS projects. Main-process code cannot import renderer code and vice versa. `src/main/services/docx/model.ts:21-29` deliberately hand-rolls a minimal structural `PMNode` interface rather than importing Tiptap types, so the docx services stay renderer-free.

**Scripts (`package.json`):**
```bash
npm run dev        # electron-vite dev — HMR renderer, auto-restart main
npm run build      # tsc --noEmit on BOTH projects, then electron-vite build → out/
npm run typecheck  # tsc --noEmit -p tsconfig.node.json && -p tsconfig.web.json
npm run preview    # electron-vite preview
npm run dist:mac   # build + electron-builder --mac  → dist/
npm run dist:win   # build + electron-builder --win  → dist/
```
There is no `test` script and no `lint` script. `npm run build` is the only quality gate, and it is types-only.

## Security Posture (build-level)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` (`src/main/index.ts:24-30`). All main-process capability is funnelled through the single `window.amfile` object exposed at `src/preload/index.ts:63`.
- CSP in `src/renderer/index.html:6-8`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`. There is **no `connect-src` directive**, so it inherits `default-src 'self'` — the renderer is currently forbidden from making outbound network requests to any external host. Adding a server backend requires either widening this CSP or routing all traffic through the main process over IPC (the latter is the better fit for the existing preload-bridge architecture).
- `setWindowOpenHandler` denies in-app new windows and hands URLs to `shell.openExternal` (`src/main/index.ts:37-40`).
- `spellcheck: true` uses Electron's native OS spellchecker; a custom context menu offers `dictionarySuggestions` and `addWordToSpellCheckerDictionary` (`src/main/index.ts:42-63`).

## Packaging

**Config:** `electron-builder.yml`. App ID `com.amneal.amfile`. Build resources in `build/` (`icon.png`, `entitlements.mac.plist`). Output to `dist/`. Packaged `files` are only `out/**/*` and `package.json`; `asarUnpack: '**/*.node'`.

**Targets:**
- macOS: `dmg` and `zip`, each for **both `x64` and `arm64`**. Category `public.app-category.productivity`. `hardenedRuntime: true`, `gatekeeperAssess: false`, entitlements + entitlementsInherit both `build/entitlements.mac.plist`.
- Windows: `nsis`, `x64` only. NSIS is non-one-click (`oneClick: false`), lets the user change install directory, creates desktop + Start Menu shortcuts.
- Linux: `AppImage`, `x64`, category `Office`. **Note:** the Linux target is configured but there is no `dist:linux` script — it is reachable only via a direct `electron-builder --linux` invocation.

**Signing / notarization — off by default, env-var driven:**
- `mac.notarize: false` and `dmg.sign: false` are hard-coded in `electron-builder.yml:30,33`.
- No certificates are committed. macOS notarization would need `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` (or an App Store Connect API key); Windows signing would need `CSC_LINK` + `CSC_KEY_PASSWORD`. Supply via CI secrets — never commit `.p12`/`.pfx`.
- Local unsigned builds should set `CSC_IDENTITY_AUTO_DISCOVERY=false` to skip signing cleanly.
- Unsigned Windows builds trigger a SmartScreen warning on first run. Expected for internal test builds.

## Platform Requirements

**Development:**
- macOS, Windows, or Linux with Node.js and npm. No Docker, no local database, no external service, no credentials needed — `npm install && npm run dev` is the entire setup.
- Windows installers cross-build from macOS via `electron-builder --win`, but the resulting installer has **not** been verified on real Windows hardware.

**Production:**
- Distributed as a signed-or-unsigned desktop installer (dmg/zip on macOS, NSIS on Windows), installed per-machine. No server, no backend, no hosting, no deployment pipeline.
- Documents live wherever the user points the folder picker (`fs:openFolderDialog`); the app writes real `.docx` to those paths. There is no application data directory, no `app.getPath('userData')` usage, and no local database.

---

*Stack analysis: 2026-08-09*
*Update after major dependency changes*
