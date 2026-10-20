# Simple GET and POST Google Sheets and Google Sites
This project demonstrates a simple integration using Google Sheets as the central database and dashboard, 
with Google Apps Script handling data retrieval (GET) and submission (POST) between Google Sheets and Google Sites.
The system was developed for the Career Development Program (CDP) Monitoring, allowing employees to check their CDP application progress and view status updates through Google Sites.


# CDP Tracker: Documentation and Setup Guide

Career Development Program (CDP) application status tracker for the Human Capital (HC) team.
Snapshot of the code base: 2026-10-17. Time zone: Asia/Jakarta.

This document contains no source code. The code lives in the Apps Script project bound to the HC Sheet (file list in section 5).

---

## 1. Purpose

HC maintains CDP application records manually in a Google Sheet. Employees check their own application status on a Google Sites page that embeds an Apps Script web app. Employees never get access to the Sheet.

In scope:
- Employee self-service status lookup (NIP + email).
- HC dashboard (counts per status and per team) inside the Sheet.
- Audit log of every data write.
- Lockout against guessing.

Out of scope for now:
- Email notifications (HC tells applicants directly).
- Google Forms intake (future phase).
- Manager view / Roster sheet (not built).
- NIK (replaced entirely by NIP).

---

## 2. Architecture

| Layer | What | Who can reach it |
|---|---|---|
| Database + dashboard | Google Sheet with tabs `CDP_Applications`, `Log`, `Dashboard` | HC team only |
| Logic | Container-bound Apps Script project | HC editors of the Sheet |
| Employee UI | Apps Script web app (HtmlService), served at the `/exec` URL | Anyone with a Google account |
| Entry point | Google Sites page embedding the web app by URL | Whoever the Site is published to |

Deployment settings:
- Execute as: **Me** (the deploying account)
- Who has access: **Anyone with Google account**

### Deliberate deviation from the original brief

The original design called for a web app restricted to the Workspace domain. Employees are on several Workspace domains/organizations, and the platform must work for all of them without setup on their side. The decision (Option 2) was a single deployment open to any Google account.

Consequence: Google can only verify the viewer's email for viewers on the script owner's domain. For everyone else the email is typed by the viewer and is **unverified**. Sections 3 and 4 describe how this is contained, and section 9 lists the residual risk.

---

## 3. Access model: who sees what

### 3.1 Identity

| Viewer | How identity is resolved | Trust level |
|---|---|---|
| Same domain as script owner | Google supplies the email. Anything typed by the client is ignored. | Verified |
| Other domain | Employee types a work email on the page. | Unverified |

Typed emails on the owner's domain (or on `VERIFIED_ONLY_DOMAINS`) are rejected, because viewers from those domains always arrive verified. This stops someone from claiming a verified-domain identity by typing it.

### 3.2 Authorization rule

A record is returned only if **both** the NIP and the email match the **same row**. These cases all produce the identical generic "not found" message, so the page never reveals whether a NIP or an email exists:
- wrong NIP,
- someone else's NIP,
- unknown email,
- right NIP with the wrong email.

### 3.3 What the browser receives

| Field | Sent to browser? |
|---|---|
| Application Progress (status) | Yes |
| Tracker steps and current step | Yes (empty for Declined) |
| Last Updated At | Yes, formatted in Asia/Jakarta |
| Employee Note | Verified viewers: yes. Unverified viewers: no, unless `SHOW_NOTE_TO_UNVERIFIED` is `true` |
| HC Internal Note | **Never** |
| Document | **Never** |
| Full Name, Nick Name, Team, Email, NIP | Never returned to the client |
| Any other employee's row | Never |

Declined applicants see only the status label, with no tracker steps.

### 3.4 HC-only functions

The script's public functions can be called by any visitor through `google.script.run`, so every public function that is not an employee endpoint calls an HC check first. The check passes only for emails in `HC_ADMINS`. While `HC_ADMINS` is empty (first setup), it falls back to the script owner.

Forbidden attempts are not written to the Log, so a visitor cannot flood it.

---

## 4. Lockout (throttling)

Failed lookups are counted in the script cache. Counters count failures regardless of whether the typed values exist, so lockout behavior leaks nothing.

| Viewer type | Counters | Default limit |
|---|---|---|
| Verified | one per email | 5 failures |
| Unverified | per email, per NIP, plus one global | 5 per email, 5 per NIP, 200 global |

- Window: `LOCK_MINUTES` (default 15).
- When a counter trips, one `THROTTLE_TRIGGERED` row is written to the Log (once per window).
- A locked viewer sees a generic "too many attempts" message.
- HC can clear a counter from the menu: **HC Tools > Clear lockout** (enter an email, a NIP, or `ALL` for the global counter).

---

## 5. Project files

| File | Responsibility |
|---|---|
| `Config.gs` | Constants (sheet names, column labels, statuses, property keys, defaults) and the cached config reader |
| `Util.gs` | Email and NIP normalization, lock helper, header-map helper, spreadsheet access, timestamp formatting |
| `Auth.gs` | Viewer identity resolution, HC admin guard, actor label for the Log |
| `Audit.gs` | Log sheet writer and the single write path for row data (logs old and new value) |
| `Throttle.gs` | Failed-lookup counters and lockout checks |
| `WebApp.gs` | The only employee-reachable code: page serving and the status lookup endpoint |
| `Triggers.gs` | Installable edit trigger, HC Tools menu, trigger installer |
| `Setup.gs` | Idempotent setup/repair: sheets, headers, validation, formats, properties, Dashboard |
| `HcTools.gs` | Menu actions: clear lockout, run setup |
| `Index.html` | Employee page (vanilla HTML/CSS/JS, light and dark mode) |
| `appsscript.json` | Manifest: time zone, V8 runtime, OAuth scopes, web app settings |

Design rules followed throughout:
- Columns are found by header label (row 1), never by position. Inserting or moving columns does not break anything.
- Batch reads/writes only. The lookup reads two narrow columns (NIP, Email), then one row.
- Every write takes the script lock and goes through one helper that appends to the Log.
- Values are sanitized before being written (leading `=`, `+`, `-`, `@` are neutralized so they are not parsed as formulas).
- Employee-facing errors are generic. Sheet names, stack traces, and other people's data are never shown.
- Dates are stored as real Date values and formatted with an explicit time zone.

---

## 6. Sheet schema

### 6.1 `CDP_Applications` (row 1 headers, order is free)

| Header | Filled by | Notes |
|---|---|---|
| NIP | HC | Must be unique (validation blocks duplicates). Stored as text. |
| Full Name | HC | |
| Nick Name | HC | |
| Team | HC | Feeds the Dashboard team count |
| Email | HC | Must be the Google/Workspace login email. Format-validated. |
| Document | HC | Never sent to employees |
| Application Progress | HC | Dropdown, see statuses below. Defaults to `Submitted` when empty. |
| Employee Note | HC | Visible to the employee (see 3.3). Capped at 1000 characters on output. |
| HC Internal Note | HC | Never sent to employees |
| Registered At | Automatic | Set once when the row first gets a NIP |
| Last Updated At | Automatic | Updated on every edit of the row |

Do not edit **Registered At** and **Last Updated At** by hand. Do not rename or delete any header: setup and lookups fail with a "missing column" error (logged).

### 6.2 Statuses

| Status | Tracker step |
|---|---|
| Submitted | Step 1 (default) |
| On Review | Step 2 |
| Pre-CDP Scheduled | Step 3 |
| CDP Scheduled | Step 4 |
| Completed | Step 5 |
| Declined | No steps, status label only |

A status that is not in this list is rejected by the dropdown. If one gets in anyway (for example a paste), the edit is logged as `INVALID_STATUS` and the employee sees a generic error instead of the value.

### 6.3 `Log`

Columns: Timestamp, Actor, Function, Row, Field, Old, New, Message.

Message values you will see:

| Message | Meaning |
|---|---|
| `WRITE` | A script write changed a cell (old and new value recorded) |
| `MANUAL_EDIT` | HC edited a single cell by hand |
| `INVALID_STATUS` | A status outside the allowed list was entered |
| `THROTTLE_TRIGGERED` | A lockout counter reached its limit |
| `CLEARED` | HC cleared a lockout |
| `ERROR: ...` | A function failed (function name and row are recorded) |
| `Setup/repair completed` | Setup ran |

The Log may contain typed emails and NIPs from `THROTTLE_TRIGGERED` rows. Keep the Sheet restricted to HC.

### 6.4 `Dashboard`

Rebuilt by setup using plain formulas (no script, no cache, nothing exposed to employees):
- Applicants per status, plus total records.
- Applicants per team (auto-sorted list of distinct teams).

---

## 7. Script properties

Set in Apps Script: Project Settings > Script Properties.

| Key | Purpose | Default |
|---|---|---|
| `SPREADSHEET_ID` | The HC Sheet. Seeded automatically by setup. | none |
| `HC_ADMINS` | Comma-separated HC emails allowed to run HC functions. Seeded with whoever runs setup first. | none |
| `HC_CONTACT` | Text shown to employees in help messages | "the Human Capital team" |
| `TIMEZONE` | Time zone for stamps and display | Asia/Jakarta |
| `MAX_FAILED_ATTEMPTS` | Per-email and per-NIP failure limit | 5 |
| `GLOBAL_MAX_FAILED` | Global limit for unverified viewers | 200 |
| `LOCK_MINUTES` | Lockout window | 15 |
| `SHOW_NOTE_TO_UNVERIFIED` | Show Employee Note to typed-email viewers | false |
| `VERIFIED_ONLY_DOMAINS` | Comma-separated domains whose viewers must arrive verified. Empty means the script owner's domain. | empty |

---

## 8. Setup guide

### 8.1 Prepare the Sheet

1. Create the Google Sheet and keep sharing limited to HC members only.
2. Create the tab `CDP_Applications` with the 11 headers from 6.1 in row 1. (Setup can also create it if the tab is missing or empty.)
3. Remove any old NIK column. The system uses NIP only.

### 8.2 Add the script

1. Open Extensions > Apps Script from the Sheet. The project is container-bound.
2. Create the files listed in section 5 with the exact names, and replace the manifest. To see the manifest, enable "Show appsscript.json manifest file" in Project Settings.
3. Save.

### 8.3 Run setup (first time, by the script owner)

1. Reload the Sheet. The **HC Tools** menu appears.
2. Choose **HC Tools > Run setup / repair** and approve the permission prompts. The OAuth scopes requested are spreadsheets, user email, container UI, and script triggers. There are no external APIs.
3. Setup does the following (it is safe to re-run):
   - seeds the missing script properties and sets the Sheet time zone,
   - creates missing tabs and headers,
   - applies validation (unique NIP, email format, status dropdown) and timestamp formats,
   - rebuilds the Dashboard,
   - installs exactly one installable edit trigger (removing any duplicate),
   - writes one Log line.

### 8.4 Configure properties

1. Open Script Properties and confirm `SPREADSHEET_ID` is set.
2. Set `HC_ADMINS` to the real HC team emails (comma-separated).
3. Set `HC_CONTACT` to the text employees should see (for example the HC mailbox or team name).
4. Optionally adjust the lockout values and `VERIFIED_ONLY_DOMAINS`.
5. Leave `SHOW_NOTE_TO_UNVERIFIED` as `false` unless HC accepts that typed-email viewers see the Employee Note.

### 8.5 Deploy the web app

1. Deploy > New deployment > type **Web app**.
2. Execute as: **Me**.
3. Who has access: **Anyone with Google account**.
4. Deploy, authorize, and copy the `/exec` URL. Use the `/exec` URL, not the `/dev` URL.

After every code change, publish a **new version of the same deployment** (Deploy > Manage deployments > edit > New version). This keeps the URL stable. Creating a brand new deployment changes the URL and breaks the embed.

### 8.6 Embed in Google Sites

1. In the Site editor: Insert > Embed > **By URL**, paste the `/exec` URL.
2. Make the embed full width and give it enough height that the tracker steps are not cut off.
3. Publish the Site and set its viewer audience so that employees on every participating domain can open it. A Site limited to one domain locks the other domain out before the app even loads.
4. Do not embed the Sheet or any chart built from it.

### 8.7 Hand over to HC

1. Brief HC on the daily routine (section 10).
2. Tell applicants to use the Site and, if the page asks for it, to enter the work email HC has on file.
3. Keep Sheet edit access limited to HC. Anyone with edit access to the Sheet can open the bound script.

---

## 9. Known limits and risks

### Privacy and security

1. **Typed-email path is not verified.** Anyone from a non-owner domain who knows another employee's NIP and the email on file can see that employee's status. Containment: both must match the same row, 5 failures per email/NIP lock the attempt, the Employee Note is hidden by default, and Document and HC Internal Note are never sent. Residual risk: status visible to someone who already knows both identifiers. Treat NIP as semi-secret and avoid publishing NIP lists.
2. **Global lockout can be abused.** 200 failures lock every unverified viewer for the window. HC can clear it with **HC Tools > Clear lockout > ALL**, and the trip is logged.
3. **Throttle storage is best effort.** Counters live in the script cache, which can be evicted. Lockout is a deterrent, not a hard guarantee.
4. **Execute as Me.** The app runs with the owner's permissions on the Sheet. Code that reads more than it returns is therefore the only barrier, which is why the lookup returns a fixed field list. Review any future change to the lookup for this.
5. **Owner dependency.** If the deploying account is disabled or leaves, the web app stops. Deploy from a stable account, and plan an ownership handover.
6. **NIP format is an assumption.** Current rule: 1 to 32 characters, letters, digits, and `.` `_` `-`, compared case-insensitively. If the real NIP format differs, update the rule in one place (`Util.gs`). Confirm the format.

### Operations and performance

- **Edit trigger coverage.** The trigger fires on edits made in the Sheet UI. It does not fire for changes made by scripts, Google Forms, or API writes. Rows added by those routes will not get default status or timestamps until edited by hand.
- **Lookup cost.** Each lookup reads the NIP and Email columns in full. This is fine for thousands of rows; re-evaluate if the sheet grows to tens of thousands.
- **Lock waits.** Writes wait up to 20 s for the script lock (5 s for web endpoints and log appends). Under heavy simultaneous use, a Log append may be dropped and written to the execution log instead.
- **Log growth.** The Log grows without limit. Archive or trim it periodically.
- **Quotas.** The app is subject to Apps Script quotas (concurrent executions, daily runtime, and trigger limits). They differ between consumer and Workspace accounts, so check the current figures for your account type.
- **Embed behavior.** Sign-in inside an iframe depends on browser third-party cookie settings. Some employees may need to open the web app URL directly. Include this in the test plan.
- **Cold start.** The first request after idle time can take a few seconds.

---

## 10. HC daily operation

- **Add an applicant:** fill NIP, Full Name, Team, Email in a new row. Status defaults to `Submitted`, and Registered At and Last Updated At fill automatically.
- **Update progress:** change Application Progress using the dropdown. Add an Employee Note only if the employee should read it. Put internal remarks in HC Internal Note.
- **Employee cannot log in:** confirm NIP and email in the row match what the employee uses, check the Log for `THROTTLE_TRIGGERED`, then clear the lockout from the menu.
- **Something looks wrong:** filter the Log by Message `ERROR` to see the function and row.
- **Repair after structural changes:** run **HC Tools > Run setup / repair**. It is idempotent.
- **Do not:** rename headers, hand-edit the two timestamp columns, share the Sheet outside HC, or create a second deployment for the embed.

---

## 11. Test plan

Use two test accounts (Employee A, Employee B), ideally one per domain, in separate browser profiles or incognito windows. Create test rows for both.

| # | Check | Steps | Expected |
|---|---|---|---|
| 1 | **Employee A cannot see Employee B** | Signed in as A, enter B's NIP (and B's email if the page asks). Repeat with A's own email and B's NIP. | Generic "could not find a record" message. No data from B appears. Message is identical to a nonexistent NIP. |
| 2 | Own record works | A enters own NIP (and email if asked). | Correct status and step highlight. HC Internal Note and Document never appear in the page or the network response. |
| 3 | **Failure case: lockout** | Enter wrong NIP 5 times for the same email. | Sixth attempt shows the "too many attempts" message. Log has one `THROTTLE_TRIGGERED` row. After **Clear lockout**, lookups work again. |
| 4 | Declined and note visibility | Set A's status to Declined. Then set a status back with an Employee Note. Test as verified and as typed-email viewer. | Declined shows the status label only, with no steps. Typed-email viewer does not see the note and sees the "not shown here" line. Verified viewer sees the note. |
| 5 | Audit and stamps | HC edits a status. | Last Updated At changes, Registered At unchanged, Log has `MANUAL_EDIT` and `WRITE` rows with old and new values. A pasted invalid status produces `INVALID_STATUS`. |
| 6 | Broken-structure failure | Temporarily rename the `Application Progress` header, run a lookup, then restore it and run setup. | Employee sees only the generic error. Log has an `ERROR: Missing column(s)` row. No sheet names appear on the page. |

Also confirm inside the Google Sites embed: page loads, sign-in works, and the layout is readable on mobile and in dark mode.

---

## 12. Open items to confirm

1. Real NIP format (length, characters) so the validation rule matches it.
2. Who owns the deployment long term, and who is in `HC_ADMINS`.
3. Whether the Employee Note may ever be shown to typed-email viewers.
4. Google Sites audience setting so every participating domain can reach the page.
5. Whether a manager view (Roster sheet) is needed later. It is not part of the current build.
