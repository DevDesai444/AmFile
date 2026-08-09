# Coding Conventions

**Analysis Date:** 2026-08-09

No linter and no formatter are configured. Every rule below is enforced by convention and
by `npm run typecheck` only. Match the existing code exactly — there is no tool to fix
drift for you.

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx`, one default-exported component per file, filename ==
  component name. `src/renderer/src/titlebar/TitleBar.tsx`, `src/renderer/src/dock/Dock.tsx`
- Everything else in the renderer: `camelCase.ts` — `ribbonActions.ts`, `commandHandler.ts`,
  `editorCommandRegistry.ts`, `findReplace.ts`, `insertImage.ts`
- Hooks: `useXxx.ts` — `src/renderer/src/editor/useDocumentIO.ts`, `useEditorStats.ts`,
  `useOutlineSync.ts`, `useTrackChangesSync.ts`
- Zustand stores: `xStore.ts` in `src/renderer/src/store/` — `uiStore.ts`, `documentStore.ts`,
  `treeStore.ts`, `trackChangesStore.ts`, `editorStatsStore.ts`
- Tiptap extensions: `camelCase.ts` in `src/renderer/src/editor/extensions/` —
  `trackChangeMarks.ts`, `pageBreak.ts`, `fontAttributes.ts`
- Service provider **interfaces**: `PascalCase` matching the interface —
  `src/main/services/ai/AiProvider.ts`, `src/main/services/compliance/ComplianceProvider.ts`
- Service provider **singletons**: lowercase `provider.ts` next to the interface —
  `src/main/services/ai/provider.ts`. This split is deliberate: the `.ts` lowercase file is
  the single swap point, the PascalCase file is the contract.
- Provider implementations: `stub/StubXProvider.ts` — `src/main/services/ai/stub/StubAiProvider.ts`
- IPC modules: `camelCase.ts` in `src/main/ipc/` — `docx.ts`, `fs.ts`, `compliance.ts`
- Directories: lowercase, one per feature slice — `titlebar/`, `ribbon/`, `navigator/`,
  `dock/`, `statusbar/`, `welcome/`, `editor/`, `store/`, `common/`, `design/`
- Test files: none exist. See TESTING.md for the naming to adopt.

**Functions:**
- `camelCase` for all functions, no prefix for async
- IPC registration: `registerXHandlers()` — `registerDocxHandlers()`, `registerFsHandlers()`
- Tiptap extension constants are `PascalCase` even though they are `const`, because they are
  used as classes/nodes: `export const PageBreak = Node.create({...})`, `Insertion`, `Deletion`,
  `CommentMark`, `FontAttributes`, `Indent`, `TrackChangesPlugin`
- Handlers are named for what they do, not `handleX` — `runRibbonAction`, `handleEditorCommand`,
  `runEditorCommand`. Inline JSX handlers are arrow functions, never extracted unless reused.

**Variables:**
- `camelCase` for locals and fields
- `UPPER_SNAKE_CASE` for module-level constants, always declared directly under the imports:
  ```ts
  // src/renderer/src/editor/extensions/indent.ts
  const MAX_INDENT = 8
  const INDENTABLE_TYPES = ['paragraph', 'heading']
  ```
  Others: `EDITOR_COMMAND_PREFIXES`, `FONT_FAMILIES`, `STYLE_MAP`, `HEADING_LEVELS`,
  `DEFAULT_PAGE_SETUP`, `INTERNAL_META`
- No underscore prefix for private. Unused-but-required params get `_` prefix, which is what
  satisfies `noUnusedParameters`: `(_event, path: string)`, `(_threadId, text, onChunk)`

**Types:**
- `PascalCase`, no `I` prefix — `ComplianceProvider`, `FsTreeNode`, `PageSetup`, `TrackedChange`
- `interface` for object shapes: props, store state, DTOs, provider contracts
- `type` for unions, string-literal enums, and function-type aliases:
  ```ts
  // src/renderer/src/store/uiStore.ts
  export type ViewMode = 'welcome' | 'editor' | 'folder' | 'settings'
  export type DockTab = 'chat' | 'compliance' | 'comments'
  ```
- No TypeScript `enum` anywhere. Use string-literal unions.
- Component props: `interface XProps` declared immediately above the component, not exported
  unless another file needs it (`BlueprintCardProps` in `src/renderer/src/common/BlueprintCard.tsx`)
- Store state interfaces are **not** exported (`interface UiState`, `interface DocumentState`);
  the payload types they reference are.

**Channel and command ids:**
- IPC channels: `domain:verb` — `docx:read`, `window:maximizeToggle`, `compliance:folderProgress`
- Ribbon/editor commands: `domain.verb` — `mark.bold`, `file.save`, `font.setSize`, `track.toggle`

## Code Style

**Formatting** (no Prettier config — match by hand):
- 2-space indentation
- Single quotes for all strings; template literals for interpolation
- **No semicolons.** The codebase has exactly one `;`-terminated line and it is inside a comment.
- Practical line width ~120 chars; longest real lines run to 133 (`src/main/services/docx/export.ts`).
  Break JSX props onto separate lines once an element exceeds it.
- Trailing commas: none, in objects, arrays, or params
- Blank line between logical blocks inside a function; blank line after the import block

**Linting:**
- No ESLint, no Biome, no config file of any kind. Do not add `eslint-disable` comments —
  there is nothing to disable, and none exist.

**Type checking (the only automated gate):**
```bash
npm run typecheck   # tsc --noEmit on tsconfig.node.json AND tsconfig.web.json
npm run build       # runs typecheck first, then electron-vite build
```
Both projects extend `@electron-toolkit/tsconfig`, which sets:
`strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true`,
`isolatedModules: true`, `forceConsistentCasingInFileNames: true`, `skipLibCheck: true`,
and — importantly — **`noImplicitAny: false`**. Strict-null and strict-function-types are on,
but an un-annotated parameter will silently become `any`. Annotate parameters explicitly;
the compiler will not catch you.

`src/renderer/src/**` and `src/preload/index.d.ts` compile under `tsconfig.web.json`
(`jsx: react-jsx`, alias `@renderer/*`). `src/main/**`, `src/preload/**`, and
`electron.vite.config.ts` compile under `tsconfig.node.json`. A file must belong to exactly
one project — do not import renderer code into main.

**TypeScript rules this codebase actually holds itself to:**
- **Explicit return type on every exported function.** Including React components:
  `export default function TitleBar(): React.JSX.Element`. 18 of the 19 `.tsx` files carry
  this annotation; the exception is `src/renderer/src/main.tsx`, which exports nothing.
  A component that can render nothing annotates the union:
  `export default function Ribbon(): React.JSX.Element | null` (`src/renderer/src/ribbon/Ribbon.tsx:78`).
  Void functions annotate `: void`, not omitted.
- `React` is **not** imported in components — `jsx: react-jsx` handles the runtime and
  `React.JSX.Element` resolves off the global namespace. Only `main.tsx` imports React
  (it needs `React.StrictMode`).
- **Zero `any` in application code.** Verified: no `: any`, `as any`, or `any[]` anywhere in
  `src/`. Use `unknown` for opaque payloads:
  ```ts
  // src/renderer/src/ribbon/editorCommandRegistry.ts
  export type EditorCommandHandler = (command: string, payload?: unknown) => void
  ```
  The only escape hatch used is `as never`, and only at the `docx` library boundary where the
  vendor types are wrong (`src/main/services/docx/export.ts:61,65,69,73` and
  `src/renderer/src/editor/useDocumentIO.ts:37`). Do not introduce new `as never` outside a
  third-party type defect, and comment it when you must.
- Module augmentation for Tiptap command typing, declared above the extension it types:
  ```ts
  // src/renderer/src/editor/extensions/indent.ts
  declare module '@tiptap/core' {
    interface Commands<ReturnType> {
      indent: { indent: () => ReturnType; outdent: () => ReturnType }
    }
  }
  ```

## Import Organization

**Order** (blank line only between the external block and the rest, if at all):
1. Node/Electron builtins — `import { app, BrowserWindow } from 'electron'`, `import { join } from 'path'`
2. External packages — `react`, `@tiptap/*`, `lucide-react`, `zustand`, `docx`, `mammoth`
3. CSS side-effect imports (renderer entry files only)
4. Local modules, ordered roughly by dependency depth — extensions, then handlers, then stores,
   then sibling components
5. Assets last-ish (`import logo from '../assets/amneal-logo.png'`)

Within a file, imports are **not** alphabetized. Group by origin and keep related imports adjacent
(see the 36-line import block in `src/renderer/src/editor/EditorCanvas.tsx`).

**Type imports:**
- Prefer a separate top-level `import type` statement (35 occurrences):
  ```ts
  // src/main/services/compliance/provider.ts
  import type { ComplianceProvider } from './ComplianceProvider'
  import { StubComplianceProvider } from './stub/StubComplianceProvider'
  ```
  This is not cosmetic — `isolatedModules: true` means an unelided type import can break the build.
- Use the inline `type` specifier only when pulling a value and a type from the same module:
  ```ts
  // src/renderer/src/dock/Dock.tsx
  import { useUiStore, type DockTab } from '../store/uiStore'
  ```

**Path aliases:**
- `@renderer/*` → `src/renderer/src/*` is configured in both `tsconfig.web.json` and
  `electron.vite.config.ts` but **is not used anywhere**. Every import in the codebase is
  relative (`../store/uiStore`). Stay relative; do not start mixing.

**CSS imports:**
- Global stylesheets are imported once, in `src/renderer/src/App.tsx`, in this exact order:
  `design/fonts.css` → `design/tokens.css` → `design/blueprint.css` → `App.css`.
  Order matters: tokens must land before anything that reads `var(--*)`.
- A feature-local stylesheet is imported by its own component, last in the import block —
  `import './editor.css'` at `src/renderer/src/editor/EditorCanvas.tsx:37`.

## React Conventions

**Component shape:**
```tsx
// src/renderer/src/common/BlueprintCard.tsx
interface BlueprintCardProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  onClick?: () => void
}

export default function BlueprintCard({ children, className, style, onClick }: BlueprintCardProps): React.JSX.Element {
```
- `export default function` — never `const X = () => {}`, never `React.FC`
- Props destructured in the parameter list
- Private sub-components live in the same file as non-exported functions with inline prop types:
  `function BigButton({ btn }: { btn: RibbonBigButton }): React.JSX.Element` (`src/renderer/src/ribbon/Ribbon.tsx:10`)

**Zustand — one selector per field:**
```tsx
// src/renderer/src/dock/Dock.tsx
const dockOpen = useUiStore((s) => s.dockOpen)
const toggleDock = useUiStore((s) => s.toggleDock)
const dock = useUiStore((s) => s.dock)
const setDock = useUiStore((s) => s.setDock)
```
Never subscribe to the whole store — it re-renders on every unrelated field change.
**Known deviation, do not copy:** `src/renderer/src/statusbar/StatusBar.tsx:10` does
`const { wordCount, page, totalPages } = useEditorStatsStore()`, so the status bar re-renders on
every keystroke's `charCount` update too.

**Cross-store and non-React access uses `getState()`:**
```ts
// src/renderer/src/ribbon/ribbonActions.ts
export async function runRibbonAction(act: string): Promise<void> {
  const ui = useUiStore.getState()
  const doc = useDocumentStore.getState()
```
Same pattern inside the ProseMirror plugin, which has no React context at all:
```ts
// src/renderer/src/editor/extensions/trackChangesPlugin.ts:8
function isTrackingOn(): boolean {
  return useDocumentStore.getState().trackChangesEnabled
}
```

**Store definition:**
```ts
// src/renderer/src/store/uiStore.ts
interface UiState {
  view: ViewMode            // state fields first
  // ...
  setView: (view: ViewMode) => void   // actions after a blank line
}

export const useUiStore = create<UiState>((set) => ({ ... }))
```
Actions that read current state take `(set, get)` — see `treeStore.ts` and `trackChangesStore.ts`.
Setters that shorthand-match their field name are written `setZoom: (zoom) => set({ zoom })`.
Action parameter types are inferred from the interface, never re-annotated.

**Effects:**
- Guard the preload bridge first, always: `if (!window.amfile) return`
- Return the preload unsubscriber directly as the cleanup:
  ```tsx
  // src/renderer/src/App.tsx
  useEffect(() => {
    if (!window.amfile) return
    return window.amfile.compliance.onFolderProgress((_folderId, update) => applyFolderProgress(update))
  }, [applyFolderProgress])
  ```
- Full dependency arrays, including store actions (they are stable references in zustand)

**Rendering:**
- Early-return for collapsed/empty/loading states rather than nested ternaries —
  `Dock.tsx:19`, `Ribbon.tsx:82`, `ProjectTree.tsx:30`
- Conditional children via `&&`: `{view === 'editor' && <EditorCanvas />}`
- Class names via template literal with a leading space:
  `` className={`tree-row${isSelected ? ' is-selected' : ''}`} ``
- `useMemo`/`useCallback` are used sparingly and only where the value is genuinely expensive or
  must be referentially stable (`FindReplaceBar.tsx:17`, all three callbacks in `useDocumentIO.ts`).
  Do not wrap everything.

## CSS Conventions

This is the most distinctive part of the codebase. **Plain CSS files only.** No Tailwind, no
CSS-in-JS, no CSS Modules, no preprocessor, no `styled-components`. Four stylesheets, 1591 lines
total:

| File | Role |
|------|------|
| `src/renderer/src/design/tokens.css` | `:root` custom properties + global element resets |
| `src/renderer/src/design/fonts.css` | `@import` of `@fontsource/barlow*` weights only |
| `src/renderer/src/design/blueprint.css` | The `.blueprint` corner-tick motif, nothing else |
| `src/renderer/src/App.css` | All app chrome, sectioned by feature (1207 lines) |
| `src/renderer/src/editor/editor.css` | Document surface + find/replace bar |

**Never hardcode a colour, font, or chrome dimension. Use a token.**
Every value in `tokens.css` exists so it can be changed in one place:
- Colour: `--ink`, `--mut`, `--mut2`, `--dv`, `--dv2`, `--chrome`, `--chrome2`, `--deep`,
  `--color-accent`, `--color-accent-400`, `--amneal`
- Severity: `--hi`, `--med`, `--low`
- Document surface: `--page-bg`, `--page-text`, `--page-text-muted`, `--page-text-faint`
- Type: `--font-heading` (Barlow Condensed), `--font-body` (Barlow),
  `--font-label` (Barlow Semi Condensed), `--font-doc` (Times New Roman)
- Layout: `--titlebar-h`, `--tabbar-h`, `--ribbon-h`, `--statusbar-h`, `--navigator-w`,
  `--navigator-collapsed-w`, `--dock-w`, `--dock-collapsed-w`

For a tint or a translucent variant, derive it — do not pick a new hex:
```css
color: color-mix(in srgb, var(--color-text) 55%, transparent);
border-color: color-mix(in srgb, var(--med) 40%, transparent);
```
**Known deviations, all pre-existing, do not extend them:** `App.css:136-137` (close-button red),
`App.css:411` and `App.css:667` (`#0f1113` where `var(--deep)` belongs), and the document-surface
greys/blues in `editor.css:99,112,115,120,125,126,132,152`. If you touch those rules, promote the
value to a token.

**Class naming — flat, BEM-ish, no nesting:**
- Block prefix per feature, hyphenated, descriptive of the element:
  `.titlebar-saved-badge`, `.tree-row`, `.dock-collapse-btn`, `.ribbon-group-label`,
  `.folder-run-row`, `.chat-cite-chip`
- Modifiers use `--`: `.titlebar--mac`, `.titlebar-saved-badge--dirty`, `.dock--collapsed`,
  `.navigator--collapsed`, `.chat-message--assistant`, `.sev-dot--high`, `.ribbon-select--narrow`
- Transient/interaction state uses a separate `is-*` class, composed at the call site:
  `.tree-row.is-selected`, `.tabbar-tab.is-active`, `.review-comment.is-resolved`
- Selectors stay one or two levels deep. There is no `>` chaining beyond `.blueprint > .corner`.

**The blueprint motif** — the app's visual signature. Any framed card gets a 1px border plus four
corner ticks. Do not hand-write the `<i>` elements; use the component:
```tsx
// src/renderer/src/common/BlueprintCard.tsx
<div className={`blueprint${className ? ` ${className}` : ''}`} style={style} onClick={onClick}>
  <i className="corner tl" />
  <i className="corner tr" />
  <i className="corner bl" />
  <i className="corner br" />
  {children}
</div>
```
Callers pass a layout class and let `blueprint.css` own the frame:
`<BlueprintCard className="welcome-action-card">`, `className="cross-doc-card"`,
`className="folder-run-agent-log"`, `className="chat-input"`.

**Other CSS rules:**
- `border-radius: 0` everywhere. The design language is square.
- Section dividers in long stylesheets: `/* ---------- Title bar ---------- */` (14 in `App.css`)
- Keyframes are prefixed `am*`: `amPulse`, `amSweep`, `amCaret`
- `!important` appears 5 times, all in override-a-generic-button situations. Avoid adding more.
- Inline `style` is reserved for computed values only — `paddingLeft: 9 + depth * 13`,
  `width: ${zoom}%`, `width: btn.width`. Everything static belongs in a class.

## Error Handling

**Be honest about the current state: error handling is the weakest area of this codebase.**
There are exactly two `try`/`catch` blocks in 4569 lines, both in
`src/main/services/docx/import.ts` (lines 48 and 81), and both are bare swallow-and-fallback:
```ts
} catch {
  // Not a valid zip / docx — importDocx below will raise the real error.
}
```
There are no custom `Error` subclasses, no error boundary, no `Result<T, E>` type, no logging
framework, and no user-visible error surface anywhere in the app.

**Specific gaps to be aware of when you touch these paths:**
- `save()` in `src/renderer/src/editor/useDocumentIO.ts:23-41` has no error handling at all. If
  `window.amfile.docx.write` rejects, the promise rejects unhandled, `markSaved()` never fires,
  and the user sees the "Unsaved" badge with no explanation.
- No IPC handler wraps its work. `src/main/ipc/docx.ts:8-23` lets `fs.readFile`/`fs.writeFile`
  rejections propagate raw across `ipcRenderer.invoke` as serialised Electron errors.
- Import warnings are only logged, never shown:
  ```ts
  // src/renderer/src/editor/useDocumentIO.ts:51
  if (result.warnings.length > 0) {
    console.warn('[docx import]', result.warnings.join('\n'))
  }
  ```
  The README claims the app "blocks import with a warning"; the code writes to DevTools. A user
  losing a reviewer's tracked changes gets no signal.
- Unwired features fall through to an informational log rather than failing:
  `ribbonActions.ts:77`, `commandHandler.ts:206`, `editorCommandRegistry.ts:27`.

**Prescription for new code** (especially anything under Part 11 scope):
- Wrap every `ipcMain.handle` body in `try`/`catch` and return a discriminated result
  (`{ ok: true, value }` / `{ ok: false, error }`) rather than letting rejections cross the bridge.
- Never swallow an error on a path that mutates a document or writes to disk. A silent failure in
  a regulatory tool is a data-integrity finding.
- Surface warnings in the UI, not `console`. Anything a reviewer needs to know about lost fidelity
  must be acknowledged, not logged.
- Keep the existing guard-clause style for *expected* absence — `if (!window.amfile) return`,
  `if (!editor) return`. Those are not error handling and are fine as they are.

## Logging

- No logging framework. `console` only, four call sites total.
- Format: bracketed subsystem tag, then the message.
  ```ts
  console.info(`[ribbon] "${act}" is not wired yet`)
  console.info(`[editor] command "${command}" not implemented yet`)
  console.warn('[docx import]', result.warnings.join('\n'))
  ```
- `console.info` for "reached an unimplemented branch", `console.warn` for degraded output.
  `console.error` is not used anywhere.
- Nothing is logged from the main process. There is no log file.
- **This will not satisfy Part 11.** Audit-trail events need a real, persisted, tamper-evident
  sink; do not model it on `console`.

## Comments

**Density: deliberately sparse.** 21 block doc-comments and 10 line comments across 4569 lines —
roughly one comment per 150 lines. Match that. Do not narrate code that reads clearly.

**Block doc-comments carry the *why* for a non-obvious decision**, sit directly above the exported
symbol (or at module top), and cross-reference the file that consumes or pairs with the thing:
```ts
// src/main/services/compliance/provider.ts
/** Single swap point: replace with a real ComplianceProvider once the deficiency-chatbot
 *  backend is ready. Nothing outside this file needs to change. */
export const complianceProvider: ComplianceProvider = new StubComplianceProvider()
```
```ts
// src/renderer/src/editor/extensions/trackChangeMarks.ts
/** Text inserted while track changes is on. Kept as a normal mark (not removed on
 *  accept) so accept = strip the mark, reject = delete the range — see
 *  editor/trackChangesPlugin.ts and store/trackChangesStore.ts. Exported to real Word
 *  tracked changes via docx's InsertedTextRun (src/main/services/docx/export.ts). */
```
Longer ones explain an algorithm *and* name its known limitation, so the gap is on the record
rather than discovered later — see the 12-line header on `TrackChangesPlugin`
(`src/renderer/src/editor/extensions/trackChangesPlugin.ts:12-23`) and the docx-fidelity rationale
on `scanForUnsupportedRevisions` (`src/main/services/docx/import.ts:22-27`).

Continuation lines use ` *  ` (asterisk, two spaces) rather than aligned prose. No `@param`,
`@returns`, or `@throws` tags are used anywhere — types carry that information.

**Line comments** are reserved for a single surprising line:
```tsx
// src/renderer/src/titlebar/TitleBar.tsx:12
// macOS draws its own traffic lights inset into this bar, so the renderer must not
// add a second set — it only draws window controls on Windows/Linux.
```
Also `useTrackChangesSync.ts:53,62`, `main/index.ts:19`, `import.ts:49`, `App.css:22`.

**TODO comments: there are zero.** `TODO`, `FIXME`, `HACK`, and `XXX` do not appear in `src/`.
Unfinished work is documented as prose in the README's "Known gaps" section instead. Follow that —
if something is out of scope, write it up in the README, don't leave a marker in the code.

## Function Design

- Short. Most exported functions are under 30 lines; the two long ones are dispatch tables
  (`handleEditorCommand`, `runRibbonAction`) and that is fine — a flat `switch` beats a nested one.
- `switch` with `return` in each case rather than `break`. Braces `{ }` around a case only when it
  declares a local. A `default:` branch always exists and always does something explicit.
- Guard clauses first, early return, no `else` after return.
- Parameters: 3 or fewer positionally; a callback goes last
  (`checkFolder(folderId, folderPath, onProgress)`). Options that are genuinely optional become a
  small inline object: `setDock: (dock: DockTab, opts?: { open?: boolean }) => void`.
- Module-private helpers are plain non-exported `function` declarations above the export that uses
  them — `flatten` in `ProjectTree.tsx`, `collect` in `useTrackChangesSync.ts`, `canned` in
  `StubAiProvider.ts`, `formatSavedTime` in `documentStore.ts`.
- Small one-liners may be arrow consts: `const sleep = (ms: number): Promise<void> => ...`

## Module Design

- **Named exports everywhere except React components**, which are default-exported.
  86 named exports across `.ts` files; 18 default exports, all `.tsx` components.
- **No barrel files.** There is no `index.ts` re-export anywhere in `src/renderer` or
  `src/main/services`. Import from the concrete file. Do not introduce barrels — they would
  create import cycles between the store layer and the editor layer.
- The `src/main/index.ts` and `src/preload/index.ts` `index` names are process entry points,
  not barrels.
- **The preload is the only renderer↔main boundary.** One object, `window.amfile`, typed as
  `export type AmFileApi = typeof amfileApi` and declared globally in
  `src/preload/index.d.ts`. Adding a capability means: add the `ipcMain.handle` in
  `src/main/ipc/*.ts`, add the wrapper in `src/preload/index.ts`, and the renderer type updates
  itself. Never `import` from `src/main/` inside `src/renderer/` — the two are separate tsconfig
  projects and it will not compile.
- **The provider pattern is the extension seam for backends.** Interface + DTOs in
  `XProvider.ts`, single instance in `provider.ts`, implementation in `stub/`. When the real
  compliance and AI backends land, only `provider.ts` changes. Follow the same shape for the
  incoming multi-user server layer.
- Types shared across the process boundary live with the main-process module that owns them and
  are imported `import type` by preload and renderer — e.g. `FsTreeNode` is defined in
  `src/main/services/fs/tree.ts`, re-declared for renderer convenience in
  `src/renderer/src/store/treeStore.ts`, and imported by `src/preload/index.ts`.

---

*Convention analysis: 2026-08-09*
*Update when patterns change*
