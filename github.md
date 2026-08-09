repo: DevDesai444/deficiency-chatbot
branch: main

## Last sync

date: 2026-08-09T04:56:05Z

### Updated in this project
- Read the existing Next.js frontend (upload → agent activity → fault report) and its type contracts.
- Reused the real domain vocabulary: severity high/medium/low, tier verified/corroborated/advisory, evidence classes, precedent counts, agent layers.
- Read the `CLI_for_folders` branch README for the folder-wide (three-layer pipeline) run semantics.
- Built AmFile, a dark desktop authoring shell around that pipeline (ribbon editor, eCTD tree, inline compliance markers, folder run, AI research dock).

## Screen map

| Project screen | Repo files |
| --- | --- |
| AmFile.dc.html — compliance dock, finding cards, inline markers | frontend/src/components/flaw-card.tsx, frontend/src/components/faults.tsx, frontend/src/types/index.ts |
| AmFile.dc.html — folder run: agent activity log | frontend/src/components/agent-activity.tsx, frontend/src/types/index.ts (LayerName, EventType) |
| AmFile.dc.html — welcome / open folder | frontend/src/components/upload-panel.tsx, frontend/src/app/page.tsx |
| AmFile.dc.html — app shell, title, product framing | frontend/src/app/layout.tsx, README.md (CLI_for_folders) |

Note: the AmFile UI itself is new design work — the repo's frontend today is a single upload page, not a document editor.
