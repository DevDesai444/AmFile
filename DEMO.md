# AmFile — demo runbook

Read this first. It tells you exactly what to run, what to show, and — importantly — what
**not** to click, so nothing surprises you in front of an audience.

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

The AmFile window opens on the login screen.

> The server needs the Databricks CLI signed in, because the database is Lakebase and it
> authenticates with a Databricks token. If the server errors on startup, run
> `databricks auth login` and start it again.

**Sanity check before you present:**

```bash
curl -s http://127.0.0.1:8787/api/health
```

Should print `{"ok":true,"service":"amfile-server"}`.

---

## 2. Accounts

All four use the password **`AmFile2026!`**

| Email | Name | Roles |
|---|---|---|
| `riya.patel@amneal.com` | Riya Patel | author, reviewer |
| `arjun.mehta@amneal.com` | Arjun Mehta | author |
| `sara.khan@amneal.com` | Sara Khan | reviewer, approver |
| `admin@amneal.com` | System Administrator | admin, author |

---

## 3. The demo, in order

### A. Sign in
Sign in as **Riya**. Point out the login screen enforces real controls — five failed attempts
locks the account for 15 minutes, passwords expire after 90 days. Her initials appear top
right; the status bar bottom right says **Connected**.

### B. The document list is a database, not a folder
The left panel lists documents from Postgres with a revision number on each. This is not a
file share — every document has an identity, a version history and an audit trail.

### C. Open and edit
Click **3.2.P.5 Control of Drug Product**. The title bar shows the revision and
**CHECKED OUT TO YOU** — Riya now holds the lock, and a padlock appears on that row.

Type an edit. Press **Cmd-S**. The revision number increments.

### D. Two people at once — the money shot
You need a second user. Easiest is a second terminal:

```bash
cd ~/dev/AmFile && ./scripts/demo-second-user.sh
```

That signs in as the admin, force-checks-in the document, and saves a new revision.

Watch Riya's window, without touching it:
- the tree revision number jumps
- a banner appears: **"System Administrator saved revision N of this document"**
- click **Reload** and the other person's content appears

### E. Conflicts are refused, not merged badly
While Riya has the document checked out, the script's first attempt to save as Arjun is
**refused** — the server returns `locked_by_other`. Nobody's work gets silently overwritten.
This is deliberate: for regulatory documents, refusing is safer than auto-merging.

### F. Part 11 — the audit trail
Open the **Audit** tab in the right dock.

- Every action is there: opened, checked out, saved, forced check-in — with who and when.
- **Version history** lists every revision with its author and time.
- Click **Verify audit integrity** → *"All N audit records verified; chain intact."*

Explain what that button proves: the audit table rejects UPDATE, DELETE and TRUNCATE at the
database level, and every row is hash-chained to the one before it. If someone with database
access alters a record, the chain breaks and this button says so, naming the row.

If you want to *show* that (optional, and it leaves the chain broken until you reset):

```bash
cd ~/dev/AmFile && ./scripts/demo-tamper.sh
```

Then click Verify again — it reports the exact altered row.

---

## 4. Be straight about what is not finished

If asked, these are honest answers, and giving them is better than being caught out:

- **The AI panel is not connected to any model.** The replies are canned. The panel says so.
- **The Compliance panel shows example findings, not real analysis.** The engine is being
  built in a separate project. The panel says so.
- **Comments do not survive reopening a document** yet.
- **E-signatures** have a database schema but no UI.
- **Word feature gaps:** mail merge, citations/bibliography, and the Design theme presets are
  not wired. Everything on the Home tab, tables, images, links, headers/footers, page setup,
  find & replace and track changes do work.
- **This runs against a Databricks *dev* workspace on AWS.** Real submission records must not
  go in it, and QA has to qualify the platform before real use.
- **AmFile is not "Part 11 compliant"** and nobody can make software compliant. It implements
  the technical controls. Validation, SOPs and training records are Amneal QA's to own.

---

## 5. If something breaks

| Symptom | Fix |
|---|---|
| Login says "Cannot reach the AmFile server" | Terminal 1 died. Restart `npm start` in `server/`. |
| Server won't start, Postgres auth error | `databricks auth login`, then retry. |
| Status bar says **Offline** | The WebSocket dropped; it retries every 2s. Restarting the server is enough. |
| Document says locked by someone who isn't there | Locks expire 90s after the last heartbeat. Wait, or sign in as admin and force check-in. |
| Audit verify says the chain is broken | Someone ran the tamper script. Reset (below). |

**Full reset to a clean demo state:**

```bash
cd ~/dev/AmFile && ./scripts/demo-reset.sh
```

Wipes documents, revisions and the audit log, re-applies the schema and re-seeds the four
users and four documents. Safe on the dev instance only.
