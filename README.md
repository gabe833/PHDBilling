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
2. In the Apps Script, replace the code with `apps-script/Code.gs` and save.
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

### 6. MagicDoor sync
The console reads MagicDoor every hour (read-only) and keeps property details current. It reads:
- properties, units and leases: rent, balance, days past due, last payment, deposits, and tenants' names and contact details
- owners
- management fees, vendor bills, owner distributions and lease renewals

Social Security numbers, dates of birth and bank details are never saved.

1. Store the MagicDoor key in Supabase under **Edge Functions → Secrets** as `MAGICDOOR_API_KEY`.
2. Deploy the function from `supabase/magicdoor/` (two files: `index.ts` and `engine.js`) under the name `magicdoor`, with **JWT verification off**. The function checks the Team list itself.
3. In **SQL Editor**, run `supabase/magicdoor-setup.sql` once. It schedules the hourly sync.
4. In the console, open **Property mgmt → MagicDoor** and click **Sync now**. Check the links (most match by address), and pick a unit for anything that didn't match.

With **Automatic** on, each hourly sync updates the console on the server, so it happens whether or not anyone has the console open:
- one row per MagicDoor unit: duplicates merged, missing units added, test entries removed
- tenants, their contact details, lease dates and rent
- leased or vacant
- the owner, when none is set

It also records this month's rent that MagicDoor shows as paid in full, adds vendor bills as repair items, and marks owner payouts sent. MagicDoor's own "10% Admin Fee" lines are never imported, because the console adds the admin fee itself. Closed months, fee rules and notes are never changed. Every change is listed under **MagicDoor → Recent updates**.

Late rent, evictions, deposit returns after a move-out, and PM fees that differ from MagicDoor appear in the Action center and the morning email.

---

### 7. Owner statement emails (from pm@)
Month close → **Email statements** lists one email per property from **pm@phdproperties.realestate**, with the statement attached as a PDF. Open **Preview & edit** on any of them to see exactly what the owner gets and change the wording. Then **Send from pm@**, or **Save as Gmail draft** to send from Gmail yourself. From the list you can **Send N now** for everyone ticked, or **Send draft** for one already waiting in Gmail. Tick "Use this subject and message for every owner statement from now on" to change the standard wording. Sent emails keep the label **AutoDraft/Owner Statements**. Closing a month still makes drafts automatically unless you switch that off.

1. Sign in to Google as **pm@phdproperties.realestate** → script.google.com → New project → paste `apps-script/Statements.gs` → Save.
2. To include pm@'s Gmail signature: **Services (+)** → **Gmail API** → Add.
3. Run **setup()** and allow access. The log shows the console key.
4. Deploy → New deployment → **Web app** · Execute as **Me** · Who has access **Anyone** → copy the URL.
5. In the console: Month close → Email statements → paste the URL and key → Connect.

**Already installed?** Paste the new version of `Statements.gs`, add the Gmail API service if you want the signature, then Deploy → **Manage deployments** → pencil → Version: **New version** → Deploy. The URL and key stay the same. Until then, saving drafts works but sending from the console says to update the script.

The key is kept with the office's shared settings. If it's ever exposed, run **rotateConsoleKey()** in that script and paste the new one.

### 7b. Project invoice emails (sent from billing@)
On a project invoice, **Email owner** writes the email the way the office sends it ("Hi Ken, … Here is the project invoice link for 3108 Terry Dr: 3108TERRY-002"). The invoice number links to the pay link. You see it and can edit it in the console, with a live preview, then press **Send from billing@** or **Save as Gmail draft**. Sent emails sit in billing@'s Sent folder with the label **Console/Project Invoices**, and the invoice shows when and to whom it went. Tick "Use this subject and message for future invoice emails" to change the standard wording.

1. Sign in to Google as **billing@phdproperties.realestate** → script.google.com → New project → paste `apps-script/ProjectInvoices.gs` → Save.
2. To include billing@'s Gmail signature: left sidebar → **Services (+)** → **Gmail API** → Add.
3. Run **setup()** and allow access. The log shows the console key.
4. Deploy → New deployment → **Web app** · Execute as **Me** · Who has access **Anyone** → copy the URL.
5. In the console: open any project invoice → **Email owner** → paste the URL and key → Connect (once for the office).

The key is kept with the office's shared settings. If it's ever exposed, run **rotateConsoleKey()** in that script and paste the new one. The script sends at most 60 emails a day (change `MAX_PER_DAY` if needed).

---

### 8. Payments: Nickel (free plan, through Nickel's MCP server)
**Today** (top of the left menu on both sides) lists what needs doing across projects and property management, each with the button that does it. **Payments** is in the left menu on both sides (Projects and Property mgmt). It has two tabs:
- **Money in & out:** Nickel balances, every payment in and out with a **Receipt** button (Nickel's PDF) and a link to the console record it belongs to, and **Deposited checks to apply**. A check you deposited in Nickel can be put toward any open owner or project invoice without moving money again.
- **Setup:** where vendors are paid from, who can send money, and which QuickBooks accounts and products Nickel codes things to.

**Setup (once)**
1. Nickel → Settings → MCP → API tokens → **Create token**. Copy it (it's shown once).
2. Supabase → Edge Functions → Secrets → add `NICKEL_MCP_TOKEN` with the token. The token never goes in `config.js` or the browser.
3. Who may send money is the `payers` list (`supabase/payments-setup.sql`). Everyone else can add bills and invoices but can't pay.
4. **Payments → Setup:** pick the pay-from account and (with your bookkeeper) the QuickBooks accounts: vendor bills, owner invoices, project vendor bills, and the project invoice products. Nickel's own QuickBooks connection does the posting.

**Confirmations.** Every change in Nickel pops up a **Nickel confirmation window** in the console with Nickel's exact wording. Nothing happens until you press **Confirm**. If nobody answers in about 100 seconds, nothing runs and Nickel's approval link is offered instead. Reading never needs a confirmation.

**Syncing (every hour at :37, or "Check Nickel" on any record)**
- **Bills** paid in Nickel turn **Paid**, with Nickel's payment receipt and where the money is (on the way, deposited, or failed). A cancelled or failed payment puts the bill back in To pay. Bills already in Nickel (added there by hand) are matched by vendor and amount.
- **Owner invoices** and **project invoices** pick up every payment: online payments with their receipt, partial payments, and payments recorded in Nickel. Paid in full turns the invoice paid.
- **Older project invoices** made by hand in Nickel (like 3282HARTWELL-001…005) are matched by number when you open the property's invoices, so their status, pay link and receipts show.
- **Project expenses** PHD paid through Nickel get the payment receipt on the transaction (matched by amount and the vendor or property on the Nickel bill). Press **×** on the "Paid in Nickel" chip if it matched the wrong one.
- Owners and vendors are matched to Nickel by email, then name. Bank details stay in Nickel; the console keeps ids, bank name and last four digits only.

**Tools (each one confirmed in the Nickel window)**
- **Bills:** pay (one confirmation for many), cancel a payment before it leaves, update a bill changed here, delete it in Nickel when voided, record a check payment in Nickel.
- **Owner invoices:** create and email the pay link, email it again as a reminder, change the due date, record a check in Nickel (ticked by default on Record payment), charge the owner's account on file, delete it in Nickel.
- **Project invoices:** lock → **Create in QuickBooks + get pay link** (billed to the same Nickel customer as the property's earlier invoices), email it or email it again, charge the account on file, **Mark paid in Nickel too** after you mark it paid here, delete it in Nickel to redo it.
- **Project expenses:** open a transaction → **Pay through Nickel** adds it as a Nickel bill and pays the vendor (two confirmations). The receipt lands on the transaction.
- **Owners:** the Owner page shows the Nickel customer and any account on file, and can email the owner Nickel's form to put a bank account on file.
- **Vendors:** add to Nickel, email the bank-details form, and **Send changes to Nickel** (name, email, address).

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
