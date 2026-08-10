# AmFile — demo runbook

Read this first. It tells you what to run, what to show, and what **not** to click, so nothing
surprises you in front of an audience.

---

## 1. Start it (two terminals, ~30 seconds)

**Terminal 1 — the server**

```bash
cd ~/dev/AmFile/server && npm start
```

Wait for `AmFile server listening on http://127.0.0.1:8787`.

**Terminal 2 — the app**

```bash
cd ~/dev/AmFile && npm run dev
```

The AmFile window opens on the sign-in screen.

> The server needs the Databricks CLI signed in, because the database is Lakebase and it
> authenticates with a Databricks token. If the server errors on startup, run
> `databricks auth login` and start it again.

**Sanity check before you present:**

```bash
curl -s http://127.0.0.1:8787/api/health
```

Should print `{"ok":true,"service":"amfile-server"}`.

---

## 2. Who can sign in

There are no sample accounts and no "create account" screen. **AmFile issues no accounts at
all** — you sign in with GitHub, and the verified email GitHub gives us is your identity.

The database currently holds exactly one user (`devdesai@amneal.com`) and no projects, so the
first thing you will do on stage is create one.

### Before the demo: one 60-second setup step

GitHub sign-in needs a public client id, and only you can create it — GitHub has no API for
registering an OAuth app.

1. Go to <https://github.com/settings/applications/new>
2. **Application name**: `AmFile` · **Homepage URL**: anything, e.g. `https://amneal.com`
3. **Authorization callback URL**: anything, e.g. `https://amneal.com` — it is never used, the
   device flow has no redirect
4. Create it, then on the app page tick **Enable Device Flow** and save
5. Copy the **Client ID** and start the server with it:

```bash
cd ~/dev/AmFile/server && AMFILE_GITHUB_CLIENT_ID=Ov23xxxxxxxxxxxx npm start
```

There is no client secret to copy — the device flow does not use one, which is why it suits a
desktop app.

**If you skip this step** the server reports `github: false` and the sign-in screen falls back
to email and password (`devdesai@amneal.com`). Everything else in the demo works identically.
Nobody is ever shown a GitHub button that cannot work.

---

## 3. The demo, in order

### A. Sign in
Click **Sign in with GitHub**. A six-character code appears and github.com opens in the real
browser; type the code, approve, and the app signs you in. Nothing is typed into AmFile itself.

Point out the button underneath: **"I don't have a GitHub account"** opens a one-line prompt
pointing at github.com/signup. That is the entire onboarding story — there is no invite email
to chase and no administrator to ask.

### B. Create a project
**New project** on the welcome screen. Name it (e.g. `ANDA 217-445 — Rivastigmine TDS`).

You are its owner. Say plainly: *there is no administrator in AmFile.* Nobody at Amneal — not
IT, not me — can see this project unless you add them. The consequence is worth stating too: if
every owner of a project leaves, the project is unreachable. Adding a second owner is the only
recovery path, and that is deliberate.

### C. Add people by email
**People** (welcome screen, or the ribbon under *File → Workspace*). Type a colleague's email
and choose Read only / Can edit / Owner.

The important bit: **they do not need an AmFile account, and they do not need one yet.** The row
shows as *Invited*. The first time anyone signs in with that address — today or next month —
the invitation becomes real access automatically and the project is simply there.

Demonstrate on a second machine if you have one: sign in, and the project is already listed.

### D. A document
**New document** into the project. It opens in the editor with the full ribbon.

Type. The title bar shows **Unsaved**, then **Saved** and a version number after Ctrl/Cmd-S.
Version numbers are the only versioning an analyst ever sees.

### E. Two people at once
With a colleague signed in to the same project on another machine, both open the document.
Their edits arrive live, highlighted, and hovering a highlight names who made it.

### F. Propose and review
An editor's save becomes a **change proposal** rather than overwriting the document. Open the
**Proposals** panel: the reviewer sees a word-level diff — not "this paragraph changed" but the
exact words, `90.0` struck out and `95.0` inserted — and can **Accept**, **Close**, or
**Comment**.

Accepting creates the next revision and credits **the author**, not the approver. Show that in
the History panel.

If two people changed the same sentence, the merge refuses to guess and reports a conflict with
all three versions side by side. Say why: silently picking one is how a specification acquires a
number nobody approved.

### G. The audit trail
Open the **Audit** panel. Every action, with the printed name of who did it and when.

Click **Verify**. It re-computes the hash chain and reports `chain intact`. This is tamper
*detection* — each row's hash includes the previous row's, so removing or editing any row is
visible. Deletion is separately blocked by database triggers, including `TRUNCATE`.

> Want to prove it rather than assert it? `scripts/demo-tamper.sh` edits a row directly in the
> database and then shows Verify catching it. Run it before the demo, not during.

### H. Compliance
**Check document** in the ribbon (Review tab), and the folder-wide check from the Navigator
footer. Both are wired end to end but currently call a stub — the real engine lives in
`deficiency-chatbot` and drops in behind `ComplianceProvider` without touching the UI.

---

## 4. What not to click

| Control | Why |
|---|---|
| Dictate, Translate, Thesaurus | Deliberately refused — they would send your text to an external service. Clicking gives a clear explanation, which is fine to show if asked. |
| 3D model | No representation in a `.docx` submission. |
| Macros | AmFile does not execute user scripts, by design. |
| Split view | Not built. **New window** then **Side by side** does the same job. |

---

## 5. If something goes wrong

| Symptom | Fix |
|---|---|
| Status bar says **Offline** | The server stopped. Restart terminal 1. The app reconnects on its own. |
| Server exits at startup with a token error | `databricks auth login`, then start it again. |
| Sign in with GitHub is missing | `AMFILE_GITHUB_CLIENT_ID` is not set — see section 2. Email/password still works. |
| GitHub says the device code expired | Codes last 15 minutes. Click Cancel and start again. |
| "You do not have access to this project" | Access is per project and never global. Ask an owner to add your address. |
| Document says locked by someone who isn't there | Locks expire 90 seconds after the last heartbeat. Wait, or an owner can force check-in. |

---

## 6. Honest notes

Things worth knowing before someone asks:

- **The audit log was reset to empty on 10 Aug 2026**, when the invented sample accounts and
  demo folders were deleted. Deleting those rows broke the hash chain — Verify caught it, which
  is the guarantee working — so the chain was restarted from zero. In production this must never
  happen; a record is a record. It is noted here rather than hidden because an audit trail whose
  history is quietly discontinuous is worse than one that says where it starts.
- **Traffic is unencrypted HTTP on loopback.** Fine for a laptop demo, not for real submission
  records. TLS is a deployment concern, not a code change.
- **Compliance checking is a stub.** The UI, the streaming and the folder-wide run are real; the
  findings are not.
- **GAMP 5 Category 5.** Bespoke software carries the heaviest validation burden. Nothing here
  substitutes for that exercise.
