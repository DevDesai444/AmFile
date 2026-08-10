# AmFile — setting up and testing across machines

AmFile has no server, no database and no accounts of its own. It talks to GitHub. That is the
whole of the setup story: install the app, sign in with GitHub, and the projects you have been
added to are there.

---

## 0. One-time: register the GitHub app (5 minutes, once ever)

GitHub has no API for creating an OAuth app, so this step is yours and cannot be automated.

1. <https://github.com/settings/applications/new>
2. **Application name** `AmFile` · **Homepage URL** anything (e.g. `https://amneal.com`)
3. **Authorization callback URL** anything — it is never used; the device flow has no redirect
4. Create it, then on the app page tick **Enable Device Flow** and **Update application**
5. Copy the **Client ID** (starts `Ov23…`). There is no client secret to copy — the device flow
   does not use one, which is why it suits a desktop app.

Start AmFile with it:

```bash
AMFILE_GITHUB_CLIENT_ID=Ov23xxxxxxxxxxxx npm run dev
```

Without it the sign-in screen says so plainly rather than offering a button that cannot work.

**The same Client ID goes on every machine.** It is a public identifier, not a secret.

---

## 1. Your account

There is nothing to create in AmFile. Your GitHub account *is* your account.

- Already have one? Sign in with it.
- Don't? The sign-in screen has **I don't have a GitHub account** → github.com/signup.

**Sign in:** click **Sign in with GitHub**. A six-character code appears and github.com opens in
your browser. Type the code, approve, and the app signs you in. Nothing is typed into AmFile.

The token is kept in your OS keychain, so this is once per machine, not once per launch.

### Usernames matter for adding people

To add colleagues by their Amneal email, their GitHub username must follow the convention:

```
<name>.<surname>@amneal.com   →   <Name><Surname>

dev.desai@amneal.com          →   DevDesai
anna.van.dijk@amneal.com      →   AnnaVanDijk
```

If someone's GitHub username doesn't match, add them by **username** instead — the same box
accepts either.

---

## 2. Make a project

**New project** on the welcome screen, or in the left panel footer. Name it.

Behind the scenes that creates a **private GitHub repository** tagged `amfile-project`. You own
it. Nobody at Amneal can see it unless you add them — there is no administrator in AmFile and no
override.

Worth knowing: if every owner of a project leaves, the project is unreachable. Adding a second
owner is the only recovery path.

---

## 3. Folders and documents

In the left panel, with the project selected:

- **New folder** — a directory in the repo. Select a folder to nest inside it; the line
  underneath always says *Adding into: …* so the destination is never a guess.
- **New document** — a file in the repo. It opens in the editor with the full ribbon.

Type. The title bar shows **Unsaved**, then a version number after Ctrl/Cmd-S. Each save is a
commit; version numbers are the only versioning an analyst sees.

---

## 4. Add collaborators

**People** on the welcome screen, or the people icon on the project row.

Type an Amneal email or a GitHub username, choose **Read only** / **Can edit** / **Owner**, and
**Add**. GitHub emails them an invitation; they accept it once, with one click.

| Level | Can do |
|---|---|
| Read only | Open and read. Cannot propose changes. |
| Can edit | Edit and propose changes for review. |
| Owner | Everything, plus accept changes and manage access. |

---

## 5. On another machine

1. Install AmFile and start it with the **same Client ID**
2. **Sign in with GitHub** as that person
3. Accept the repo invitation if they haven't yet
4. The project is already there

No address to configure, no port to open, nothing on the same network. The two machines never
talk to each other — they both talk to GitHub.

---

## 6. Testing the review flow

With two people signed in on two machines:

1. **Owner** creates a document, types, saves.
2. **Editor** opens the same document, edits, saves → this becomes a **proposal**, not an
   overwrite. Behind the scenes: a branch, a commit and a pull request.
3. **Editor** saves twice more → still *one* proposal, not three. An author saving repeatedly
   leaves one review to do.
4. **Owner** opens the **Proposals** panel: a word-level diff — not "this paragraph changed" but
   `90.0` struck out and `95.0` inserted.
5. **Owner** clicks **Comment** — a PR comment, visible to everyone on the project.
6. **Owner** clicks **Accept** (squash-merges) or **Close** (closes the PR). Accepting credits
   **the author**, not the approver; check the History panel.
7. **Read only** person tries to save → refused.

### About "live"

Updates arrive by polling, within a few seconds — **not instantly**. GitHub cannot push to a
desktop app: there is no socket to hold open and no webhook a laptop can receive. Conditional
requests keep it cheap (GitHub answers *304 Not Modified* when nothing changed, and 304s don't
count against the rate limit), and the poller watches whichever document is on screen first.

This is the one part of the design that GitHub does not do cleanly. Everything else maps.

---

## 7. What each thing really is

| In AmFile | On GitHub |
|---|---|
| Project | Private repository tagged `amfile-project` |
| Folder | Directory |
| Document | JSON file holding the editor model |
| Version | Commit |
| Proposal | Branch + pull request |
| Accept / Close | Squash-merge / close the PR |
| Discussion | PR comments |
| Access | Repository collaborators |
| Audit trail | Commit history |

You can open any project on github.com and see exactly this. Nothing is hidden in a database.

---

## 8. Honest notes

- **The audit trail is git history.** Every commit hash covers its parent, so rewriting history
  changes every hash after it — tamper-evidence by construction rather than by a column AmFile
  maintains.
- **Compliance checking is a stub.** The UI, streaming and folder-wide run are real; the
  findings are not. The engine is being built in `deficiency-chatbot`.
- **Repos are private, but they are on github.com.** That is a data-location decision for
  Amneal to make deliberately, not a technical detail.
- **GAMP 5 Category 5.** Bespoke software carries the heaviest validation burden. None of this
  substitutes for that exercise.

---

## 9. If something goes wrong

| Symptom | Fix |
|---|---|
| "GitHub sign-in isn't set up" | `AMFILE_GITHUB_CLIENT_ID` was not set — see step 0. |
| Code expired | Codes last 15 minutes. Cancel and start again. |
| Project doesn't appear on the other machine | The invitation hasn't been accepted yet — check email, or github.com/notifications. |
| "No GitHub account named …" | Their username doesn't match the convention. Add them by username instead. |
| Status bar shows Offline | No internet, or GitHub is unreachable. It keeps retrying. |
| Windows: "npm.ps1 cannot be loaded because running scripts is disabled" | PowerShell's execution policy blocks npm's `.ps1` shim. Use `npm.cmd` instead of `npm` — it is a batch file, so the policy does not apply and nothing has to be relaxed. The setup script does this itself. |
| Changes not appearing | Polling is a few seconds. If it persists, check the status bar. |
