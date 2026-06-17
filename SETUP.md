# Be You Commission Tracker — Setup Guide

## What You Have
- `index.html` — Main PWA app
- `css/style.css` — Styles
- `js/api.js` — API layer
- `js/app.js` — Auth & navigation
- `js/tabs.js` — All screen content
- `js/export.js` — Excel export
- `Code.gs` — Google Apps Script backend
- `manifest.json` — PWA manifest

---

## STEP 1 — Set Up Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → Create new spreadsheet
2. Name it: **Be You Commission**
3. Open **Extensions → Apps Script**
4. Delete default code, paste entire contents of `Code.gs`
5. Save (Ctrl+S), name the project **BeYouCommission**

---

## STEP 2 — Run Initial Setup

1. In Apps Script, select function `setupSheets` from dropdown
2. Click **Run**
3. Allow permissions when prompted
4. You should see 3 sheets created: **Staff**, **Records**, **AuditLog**
5. Default admin account: Name = `Manager`, PIN = `12345`

---

## STEP 3 — Deploy as Web App

1. Click **Deploy → New deployment**
2. Type: **Web app**
3. Settings:
   - Description: `Be You Commission API`
   - Execute as: **Me**
   - Who has access: **Anyone** *(security is handled by PIN in the app)*
4. Click **Deploy**
5. **Copy the Web App URL** — looks like:
   `https://script.google.com/macros/s/XXXXX/exec`

---

## STEP 4 — Connect App to Backend

1. Open `js/api.js`
2. Find line: `const API_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';`
3. Replace with your URL from Step 3
4. Save

---

## STEP 5 — Host on GitHub Pages

1. Create new GitHub repo: `beyou-commission` (set to **Public**)
2. Upload all files maintaining folder structure:
   ```
   index.html
   manifest.json
   css/style.css
   js/api.js
   js/app.js
   js/tabs.js
   js/export.js
   ```
3. Go to repo **Settings → Pages**
4. Source: **Deploy from branch → main → / (root)**
5. Save — your app URL will be:
   `https://YOUR-USERNAME.github.io/beyou-commission/`

---

## STEP 6 — Add Staff Accounts

1. Open app, login as Manager (PIN: 12345)
2. You'll be prompted to reset PIN first
3. Go to **Staff tab (👥)**
4. Tap **+ Add Staff** for each staff member
5. Default PIN for new staff is **12345** — they reset on first login

---

## STEP 7 — Staff Install on Phone

**Android:**
1. Open app URL in Chrome
2. Tap ⋮ menu → **Add to Home screen**
3. Done — works like an app

**iPhone:**
1. Open app URL in Safari
2. Tap Share button → **Add to Home Screen**
3. Done

---

## Lock Rule Reminder
- Staff can edit current month anytime
- Staff can edit previous month **only before 7th of current month**
- On 7th, previous month locks automatically
- Admin can always edit any record

---

## Important Notes

- **Re-deploy after any Code.gs changes:** Apps Script → Deploy → Manage deployments → Edit → New version → Deploy
- **The Google Sheet IS your database** — back it up monthly
- Staff names must match exactly between Sheet and app login dropdown
- PIN is hashed with SHA-256 before storing — not readable even by admin

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Login fails | Check staff name matches exactly, re-deploy Apps Script |
| Blank dropdown | Run `setupSheets` again, check Staff sheet has data |
| CORS error | Re-deploy Apps Script as "Anyone" access |
| Export fails | Check internet connection (SheetJS loads from CDN) |
