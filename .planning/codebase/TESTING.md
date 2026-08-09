# Testing Patterns

**Analysis Date:** 2026-08-09

> **There is no test suite.** No test framework, no test files, no test config, no CI. This
> document records the actual verification posture and specifies what to adopt, because
> 21 CFR Part 11 validation under GAMP 5 Category 5 will require documented, repeatable test
> evidence that does not currently exist.

## Current State

**Test framework:** none.
- `package.json` has no `test` script. Scripts are: `dev`, `build`, `preview`, `typecheck`,
  `dist:mac`, `dist:win`.
- No `vitest`, `jest`, `mocha`, `playwright`, `@testing-library/*`, or `spectron` in
  `dependencies` or `devDependencies`.
- No `vitest.config.*`, `jest.config.*`, or `playwright.config.*` anywhere in the repo.

**Test files:** none.
```bash
# Verified — returns nothing:
find . -not -path "*/node_modules/*" \( -name "*.test.*" -o -name "*.spec.*" -o -name "__tests__" \)
```

**CI:** none. No `.github/`, no `.gitlab-ci.yml`, no `Jenkinsfile`, no `azure-pipelines.yml`.
Nothing runs on push. The repo has a single commit.

**Coverage:** not measured, no target, no tooling.

## The Only Automated Gate

Type checking. That is the entire automated quality bar today.

```bash
npm run typecheck   # tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json
npm run build       # runs the same two typechecks, then electron-vite build
```

Both projects extend `@electron-toolkit/tsconfig`: `strict: true`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitReturns`, `isolatedModules`. This catches real defects — but note
`noImplicitAny: false` in that base, so an un-annotated parameter silently becomes `any` and passes.
Type checking cannot verify behaviour, and none of the risk areas below are type-detectable.

## How Verification Has Actually Been Done

Manual, undocumented, and not reproducible:
- Running the app under `npm run dev` and exercising features by hand.
- Inspecting the rendered DOM in the Electron DevTools pane against `design-reference/`, the
  approved HTML mockup kept in-repo as the visual source of truth.
- Throwaway `tsx` scripts written to poke a service (docx round-trip, OOXML parsing) and deleted
  after use. `tsx` is not in `devDependencies` and no such script survives in the repo.
- `.docx` output opened in real Microsoft Word to confirm `w:ins`/`w:del` and comment parts survive.

The README documents outcomes of this manual work ("Document (.docx) fidelity", "Known gaps"), but
there is no artifact showing *what* was executed or *whether it passed*. For Part 11 that prose is
not evidence.

## Why This Is a Blocker for Part 11 / GAMP 5 Category 5

AmFile is bespoke software (Category 5) that will create, modify, and sign GxP records. That
demands a documented validation lifecycle: requirements traceable to test cases, test cases with
recorded pass/fail results, and regression evidence for each release. Concretely, the gaps that
matter most:

- **No regression net on docx round-trip.** `src/main/services/docx/import.ts` and
  `export.ts` are ~500 lines of hand-written OOXML mapping with two bare `catch {}` blocks that
  silently fall back to defaults. A mapping regression corrupts a submission document with no
  signal.
- **No verification of track-changes accept/reject.** `useTrackChangesSync.ts:51-72` and
  `trackChangesPlugin.ts` implement revision handling by hand, and the plugin's own doc-comment
  records a known simplification (typing over a multi-character selection deletes rather than
  marks). Under Part 11 this logic *is* the record-modification path.
- **No audit trail exists yet to test.** Nothing in `src/` references audit, Part 11, or GAMP.
  Whatever lands must ship with tests from day one — retrofitting evidence is far harder.
- **Error paths are untested because they mostly do not exist.** `save()` in
  `src/renderer/src/editor/useDocumentIO.ts:23-41` has no error handling; a failed write leaves
  the user with no signal. See CONVENTIONS.md → Error Handling.

## Recommended Test Framework

### Vitest — unit and service tests

Vitest is the right choice because the project already runs Vite (`electron-vite` 2.3, Vite 5.4).
It reuses the existing config and ESM setup with essentially no new build surface.

```bash
npm i -D vitest @vitest/coverage-v8
```

`package.json` scripts to add:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```
And gate the build on it: `"build": "npm run typecheck && npm run test && electron-vite build"`.

**File location and naming** — follow the codebase's existing no-barrel, colocated style:
`*.test.ts` next to the module under test.
```
src/main/services/docx/
  import.ts
  import.test.ts
  export.ts
  export.test.ts
  html-to-pm.ts
  html-to-pm.test.ts
src/renderer/src/editor/
  useTrackChangesSync.ts
  useTrackChangesSync.test.ts
```
Binary `.docx` fixtures go in `src/main/services/docx/__fixtures__/` (checked in — a fixture that
is not version-controlled is not evidence).

**Test structure** to standardise on, matching the codebase's no-semicolon / single-quote style:
```ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'fs/promises'
import { importDocx } from './import'
import { exportDocx } from './export'

describe('docx round-trip', () => {
  it('preserves heading levels through import and export', async () => {
    const source = await readFile('src/main/services/docx/__fixtures__/headings.docx')

    const { model } = await importDocx(source, 'headings')
    const rebuilt = await exportDocx(model)
    const { model: reimported } = await importDocx(rebuilt, 'headings')

    expect(reimported.content).toEqual(model.content)
  })

  it('warns rather than silently accepting pre-existing tracked changes', async () => {
    const source = await readFile('src/main/services/docx/__fixtures__/with-revisions.docx')

    const { warnings } = await importDocx(source, 'with-revisions')

    expect(warnings.some((w) => w.includes('tracked change'))).toBe(true)
  })
})
```

**Zustand stores** are trivially testable outside React via `getState()` / `setState()` — the same
entry point `ribbonActions.ts` already uses:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentStore, DEFAULT_PAGE_SETUP } from './documentStore'

describe('documentStore', () => {
  beforeEach(() => {
    useDocumentStore.setState({ dirty: false, pageSetup: DEFAULT_PAGE_SETUP })
  })

  it('marks the document dirty when page setup changes', () => {
    useDocumentStore.getState().cycleOrientation()

    expect(useDocumentStore.getState().dirty).toBe(true)
    expect(useDocumentStore.getState().pageSetup.orientation).toBe('landscape')
  })
})
```

**Tiptap/ProseMirror logic** (track changes, marks, extensions) is testable headlessly by
constructing an `Editor` with the real extension list from `EditorCanvas.tsx` — no DOM renderer
needed beyond `jsdom`, which is already a dependency. Use `environment: 'jsdom'` for renderer tests
and `environment: 'node'` for `src/main/**`.

**Mocking:** Vitest's built-in `vi`. Mock only the process boundary:
- `window.amfile` — stub the preload surface when testing renderer code.
- `electron`'s `ipcMain` / `dialog` — when testing `src/main/ipc/*.ts`.
- `fs/promises` — only where you are testing dispatch, not I/O.
Do **not** mock `mammoth`, `docx`, `jszip`, or Tiptap. Those libraries *are* the behaviour under
test; mocking them tests nothing that matters.

### Playwright — Electron E2E

```bash
npm i -D @playwright/test
```
Playwright has first-class Electron support (`_electron.launch`) and can drive the packaged build,
which is what a Part 11 IQ/OQ script needs to reference.

```
e2e/
  open-document.spec.ts
  track-changes.spec.ts
  save-and-reopen.spec.ts
```

```ts
import { test, expect, _electron as electron } from '@playwright/test'

test('opens a docx from the project tree and shows the filename in the title bar', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'] })
  const window = await app.firstWindow()

  await window.click('.tree-row:has-text("3.2.P.5.docx")')

  await expect(window.locator('.titlebar-filename')).toHaveText('3.2.P.5.docx')
  await app.close()
})
```
The flat, stable class names documented in CONVENTIONS.md (`.tree-row`, `.titlebar-filename`,
`.statusbar-track`, `.is-selected`) make good selectors — there is no CSS-module hashing to fight.
Prefer them over `data-testid` so the selectors double as documentation of the UI contract.

## Coverage Priority — What to Test First

Ordered by regulatory and data-integrity risk, highest first.

**1. docx import/export round-trip** — `src/main/services/docx/`
The single highest-risk surface: it is the only code that reads and writes the actual regulatory
artifact, it is hand-written OOXML mapping, and it fails silently.
- Round-trip fixtures for each preserved feature the README claims: headings, multilevel lists,
  tables, images, hyperlinks, footnotes, bold/italic/underline/strike/sub/superscript.
- `readSectionPropertiesImpl` page-setup extraction (`import.ts:58-84`), including the
  twips→mm conversion and the A4/Letter and portrait/landscape branches.
- `scanForUnsupportedRevisions` (`import.ts:28-52`) — must produce warnings for `w:ins`, `w:del`,
  and `w:commentReference`, and must not throw on a non-zip input.
- The `as never` casts in `export.ts:61,65,69,73` — assert the emitted OOXML actually contains
  `w:ins`/`w:del` with the right author and date, since the type system is bypassed there.
- `htmlToPmDoc` in `html-to-pm.ts` for the mammoth-HTML → ProseMirror mapping and the custom
  `STYLE_MAP` classes (`ctd-section`, `reference`, `table-caption`).

**2. Track-changes accept/reject** — `src/renderer/src/editor/`
This is record modification. Under Part 11 an incorrect accept/reject is a data-integrity defect.
- `collect()` (`useTrackChangesSync.ts:6-37`) — adjacent text nodes sharing a `changeId` must
  coalesce into one `TrackedChange` with correct `from`/`to`.
- Accept an insertion → mark stripped, text retained. Accept a deletion → range removed.
- Reject an insertion → range removed. Reject a deletion → mark stripped, text retained.
  (`useTrackChangesSync.ts:51-72`)
- `TrackChangesPlugin` (`trackChangesPlugin.ts`) — Backspace/Delete mark instead of delete when
  tracking is on; `appendTransaction` marks inserted ranges; the `INTERNAL_META` guard prevents
  the plugin re-marking its own transactions.
- **Pin the known simplification with a test**: typing over a multi-character selection currently
  deletes outright rather than marking. Assert the current behaviour so the gap is evidenced
  rather than merely described in a comment, and so fixing it is a visible change.
- Accept/reject with tracking toggled off mid-session, and accept-then-export → Word.

**3. Audit trail — test-first, before the feature ships**
Nothing audit-related exists in `src/` yet. When the Part 11 controls land, every event needs a
test asserting it is recorded with actor, timestamp, before/after value, and reason; that entries
are append-only; and that the trail survives the operation failing partway. Write these alongside
the implementation, not after.

**4. Save/open integrity** — `src/renderer/src/editor/useDocumentIO.ts`
- `save()` with no existing `filePath` → dialog path is used; cancelled dialog → no write, no
  `markSaved()`.
- `save()` when `docx.write` rejects → currently unhandled. Add the handling *and* the test
  together; today a failed save is indistinguishable from a successful one except for the badge.
- Import warnings reach the user (once they are surfaced beyond `console.warn` at line 51).

**5. Ribbon and command dispatch** — `ribbonActions.ts`, `commandHandler.ts`, `editorCommandRegistry.ts`
Lower risk but cheap and broad. Assert every `act` string in `ribbonConfig.ts` either resolves to a
handler or is a deliberately-unwired entry, so the `console.info` fallthrough at
`ribbonActions.ts:77` cannot quietly absorb a typo in a newly added button.

**6. Store transitions** — `src/renderer/src/store/`
Fast, deterministic, no mocking. Particularly `documentStore`'s dirty-flag transitions (every
mutation that should set `dirty: true`) and `treeStore.toggleFolder`'s `Set` copy-on-write.

## Suggested Sequencing

1. Add Vitest + one round-trip test for `importDocx`/`exportDocx`. Land the infrastructure with a
   test that would actually have caught something.
2. Wire `npm run test` into `npm run build` so the gate is unavoidable.
3. Add GitHub Actions (or the Amneal-internal equivalent) running `typecheck` + `test` on push —
   without CI there is no evidence that tests ran, only that they exist.
4. Backfill track-changes tests before the multi-user backend lands, since concurrent editing will
   make those paths much harder to reason about.
5. Add Playwright once the server backend exists and multi-user flows need end-to-end coverage.
6. Turn on `@vitest/coverage-v8` and set a floor for `src/main/services/docx/` and the
   track-changes modules specifically, rather than a repo-wide percentage.

---

*Testing analysis: 2026-08-09*
*Update when test patterns change*
