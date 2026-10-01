# PHD Billing — hosted console

The billing console as a private website for the office: Google sign-in, one shared database, live updates between people, and an activity log. It has two workspaces:

- **Projects**: renovation billing, the console you've been using.
- **Property mgmt**: monthly rent, repairs, fees, owner payouts, deposits and PHD income. This replaces the monthly PM income workbook.

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `app.js`, `engine.js`, `app.css` | The app |
| `vendor/supabase.js` | Supabase client, served from your own site (not a CDN) |
| `config.js` | **The only file you edit:** your Supabase URL and key |
| `vercel.json` | Security headers (content security policy, no framing, HTTPS only) |
| `schema.sql` | Database setup. You paste it into Supabase once. `.vercelignore` keeps it and this README off the live site. |

`pm-seed.json` (your 16 months of PM history) is delivered separately on purpose. It contains tenant names and deposit amounts, so it must never go into this folder or a repository. You load it once from inside the app, then delete it.

---

## Setup

### 1. Create the database (Supabase)
1. Go to **supabase.com → New project**.
   - Name: `phd-billing`. Region: **East US (North Virginia)**.
   - Save the database password somewhere safe.
2. The **Free plan** is fine. It has two gaps, and step 4 covers both:
   - It pauses after a week without use.
   - It has no backups.
3. Open **SQL Editor → New query**, paste all of `schema.sql`, and click **Run**.
4. In the same editor, run this with the Google address you sign in with:
   ```sql
   insert into public.staff (email, name) values ('you@phdproperties.realestate', 'Your Name')
   on conflict (email) do update set active = true;
   ```
5. Go to **Project Settings → API**. Copy the **Project URL** and the **anon / publishable** key into `config.js`.

### 2. Turn on Google sign-in
1. In Supabase, go to **Authentication → Sign In / Providers → Google** and turn it on.
2. Copy the **Callback URL** it shows. It looks like `https://xxxx.supabase.co/auth/v1/callback`.
3. Go to **console.cloud.google.com** and create a project called `PHD Billing`.
4. Open **APIs & Services → OAuth consent screen**.
   - Choose **Internal** if PHD email runs on Google Workspace. Then only company accounts can sign in at all.
   - Fill in the app name and support email.
5. Open **Credentials → Create credentials → OAuth client ID → Web application**.
   - Under **Authorized redirect URIs**, paste the Supabase callback URL.
   - Create it, then copy the **Client ID** and **Client secret**.
6. Paste both into the Google provider in Supabase and click **Save**.
7. Optional: in `config.js`, set `googleDomain: "phdproperties.realestate"` so the Google screen only offers company accounts.

### 3. Put the site online (Vercel)

**Option A: private GitHub repo.** Easiest for updates later.
1. Create a **private** GitHub repository and upload everything in this folder.
2. In Vercel, click **Add New → Project**, import the repo and deploy. No build settings are needed; it's a static site.

**Option B: command line.**
1. From inside this folder, run `npx vercel deploy --prod`.

Then:
1. Copy the site address (e.g. `phd-billing.vercel.app`), or add your own under **Settings → Domains** (e.g. `billing.phdproperties.realestate`).
2. In Supabase, go to **Authentication → URL Configuration**.
   - Set **Site URL** to that address.
   - Add the same address under **Redirect URLs**.

### 4. Nightly backups to Google Drive (needed on the free plan)
This uses the same Google Apps Script as the receipt inbox. Its nightly backup call also counts as activity, so the database doesn't get paused.
1. In the Supabase SQL editor, run this and copy the result:
   `select value from public.private_settings where key = 'backup_token';`
2. In the Apps Script, replace the code with the new **Code.gs** and save.
3. Under **Project Settings → Script Properties**, add:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (the same values as `config.js`)
   - `BACKUP_TOKEN` (the value you just copied)
4. Run **setupBackup** once. It saves the first backup to Drive in **PHD Billing Backups**, then saves one every night at about 2 AM and keeps the last 60.
5. To restore, go to **Team → Backups → Restore from a backup…** in the console and choose a file.

The backup token can only read the database. It can't change or delete anything.

### 4b. Morning email of what needs action (property management)
The same Apps Script emails the team a list each weekday between 7 and 8 AM: late or short rent, payouts not marked sent, owners who owe, leases ending, deposit-return deadlines, long vacancies, months not started or closed, and receipts waiting. It uses exactly the same rules as the **Action center**, so snoozed or dismissed items stay out. On a day with nothing to do, no email is sent.
1. In **Project Settings**, set the time zone to **(GMT-05:00) Eastern Time**.
2. Under **Script Properties**, add `CONSOLE_URL` with your site address (e.g. `https://phd-billing.vercel.app`). Each item in the email links straight to that property or month.
3. Optional: add `DIGEST_TO` with a comma-separated list of addresses if it should go to specific people. Otherwise it goes to everyone active on the Team page.
4. Run **setupDigest** once. It schedules the email and sends you a preview right away. Run **previewDigest** any time to see today's list.

To change when rent counts as late, the renewal heads-up and other thresholds, go to **Property mgmt → Alert rules**.

### 5. First sign-in and moving your data in
1. In the **current** console on your computer, download a backup: Projects, then Settings, then **Download backup**.
2. Open the new site and choose **Continue with Google**. You'll land on **Team** with a welcome panel.
3. Click **Load project billing backup** and choose the backup file.
4. Click **Load PM workbook history** and choose `pm-seed.json`. Then delete that file.
5. On the **Team** page, add each teammate's Google address. They can sign in right away.
6. Receipt inbox: open **Receipt inbox** and paste the Apps Script URL and key once. The whole office shares them.

From then on, use only the website. The single-file version still works offline, but its data is separate, and editing both would split your records.

---

## How it keeps data safe
- **Invite-only.** Signing in with Google proves who someone is; the team list decides whether they get in. Anyone not on it sees "No access yet" and can't read a single record. This is enforced by the database itself (row-level security), not just the screen.
- **The key in `config.js` is meant to be public.** It only lets people sign in. The database rules keep data private, and they were tested: an outsider's reads return nothing and their writes are refused.
- **No hard deletes.** The app can't delete records; it marks them deleted. Every save is copied to an activity log with who and when, and nobody can edit that log.
- **No silent overwrites.** Every save carries the version it was based on. If two people change the same property or rent line at the same moment, the second person is told and redoes their change.
- **Backups.** A nightly copy of everything goes to your Google Drive (keeps 60), and Team → Backups restores it. **Download backup** in the app still works for a copy you hold yourself.
- **Free plan limits.** 500 MB of database: your data is about 2 MB, and the activity log trims itself to 180 days, so there's plenty of room. If the project is ever paused, the nightly backup wakes it, or open the Supabase dashboard and click **Restore project**.
- **Browser protections.** The site only runs its own code (content security policy), can't be embedded in other sites, and only talks to Supabase, Google Fonts and your receipt script.
- **Removing someone.** Click **Team → Remove**. With Workspace, suspending their Google account also blocks them.

## Maintenance
- **Add or remove people:** Team page.
- **See who changed what:** Team page, under Recent activity.
- **Update the app:** replace `index.html`, `app.js`, `engine.js` and `app.css` in the repo (or run `npx vercel deploy --prod` again). Keep your `config.js`.
- **Activity log:** the nightly backup trims it to the last 180 days automatically.
