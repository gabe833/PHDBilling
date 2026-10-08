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

- **Any month:** pick the month at the top of the Email statements window (or open a property → **Email statement** for the month shown) to send or resend a past statement.
- **Subject:** always ends with the month and year ("Owner Statement – 31 Radcliffe Street – October 2026").
- **Clear lines:** each repair line reads as the kind of work plus the detail — the vendor and MagicDoor's account decide the kind, so "August Bi-Weekly Turn Maintenance 1" from Salty Blades Lawn Care shows as "Lawn care — August bi-weekly service, visit 1". In **Preview & edit**, **Lines on the statement** lets you rewrite any line for the owner without changing the books; lines that only say "Repairs" or "Turn repairs" are highlighted. **Describe from invoice** reads the vendor's invoice from MagicDoor and writes the line for you ("Turnover — replaced kitchen faucet, patched and painted bedroom walls"); check it and edit if needed.
- **Vendor invoices from MagicDoor:** every bill line that came from MagicDoor has an **Invoice** link (Month close, the property's Repairs tab, the statement lines) that opens the vendor's invoice straight from MagicDoor. Statements can carry those invoices as attachments — **Attach the vendors' invoices from MagicDoor** (on by default) — and the statement notes "invoice attached" on those lines. This needs the updated `Statements.gs` in pm@ (Deploy → Manage deployments → Edit → New version); until then statements still go, just without the invoices, and the console says so.

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

### Getting around
- **Back arrow** (left of the page title, or the browser's back button / Alt+←) returns to the page you came from at the same spot, with the row you opened highlighted for a moment.
- On a property page, **‹ ›** (or the **[** and **]** keys) step through the properties in the list you opened it from.
- Header shortcuts: the **Drive** logo opens that property's receipt folder, **Gmail** opens the emails about it in pm@ (property management) or billing@ (projects), and the pin opens the address in Maps. Owners get a Gmail button to write to them from the right mailbox.
- Buttons that open an outside app carry its logo: Gmail for anything that emails, Nickel for paying and invoicing, Drive or Sheets for files. Hover an email address to write in Gmail or copy it.
- On Today, **Show N more** expands a section in place. Long pages get a back-to-top button.
- **On a phone**, the left menu moves behind the ☰ button in a slim top bar. That bar also has **Receipt** (take a photo of a receipt, or pick a photo or PDF) and Search. Snapped receipts are read like emailed ones and wait in the **Receipt inbox** for approval, on whichever side (Projects or Property mgmt) you're on. Big phone photos are shrunk before sending. Transactions and Month close show one card per row, and side panels open full screen.

### 6b. Receipt inbox in billing@ (PMBilling@ and ProjectBilling@)
The receipt inbox runs in **billing@phdproperties.realestate**. Mail sent to its two aliases is read automatically, about every five minutes:
- **PMBilling@phdproperties.realestate** → property management. The property is matched only against managed rentals, and it shows under **Property management** in the Receipt inbox.
- **ProjectBilling@phdproperties.realestate** → renovation projects. Matched only against project properties, shown under **Projects**.

Vendors can send invoices to those addresses directly, and Peter (or anyone) can forward them. Mail to the aliases is read from any sender; nothing reaches the books until someone approves it in the console. Each invoice is read as a whole: the total is the invoice's grand total, checked against the line items and against the amount in the email it came with. If the total was first read as one line, it's corrected and the note says so. **Read again** on any receipt re-reads it with these rules.

**Moving it from gabe@ to billing@ (once):**
1. In gabe@'s receipt-inbox Apps Script project: **Project Settings → Script properties**, copy the values (`ANTHROPIC_API_KEY`, `MODEL` if set, and `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BACKUP_TOKEN`, `DIGEST_TO` if you use them). Then **Triggers** → delete its triggers, so gabe@ stops reading mail. Approve or dismiss anything still waiting in the Receipt inbox first.
2. Sign in as **billing@** → script.google.com → New project → paste `apps-script/Code.gs` → Save. Set the time zone to Eastern (Project Settings) and paste the script properties from step 1.
3. Run **setup()** and allow access (Gmail, Drive, Sheets). It makes the labels, the **PHD Receipts** folder and the inbox sheet in billing@'s Drive, and prints the console key. If you used them before, also run **setupBackup()** and **setupDigest()**.
4. **Deploy → New deployment → Web app** · Execute as **Me (billing@)** · Who has access **Anyone** → copy the URL.
5. In the console: **Receipt inbox → Disconnect**, then paste the new URL and key.

Receipts already filed stay in gabe@'s Drive; their links keep working for anyone they're shared with.

### 6c. Bills not paid yet
- **Mark it in the email:** put **[UNPAID]** (or [TO PAY]) in the subject when you send or forward a bill to PMBilling@ or ProjectBilling@; **[PAID]** for a receipt that's already paid. Without a tag the invoice itself decides (balance due, "please pay", a PAID stamp), and a payment note like "pay from 4091 today" is picked up from the email.
- **In the console:** the receipt inbox shows *Not paid yet* or *Already paid* on each item. Property-management bills come in as **To pay** (with the due date and payment note). Project expenses get "The vendor still needs to be paid" ticked, which keeps them on **Today → Vendors to pay** and shows a banner on the transaction with **Mark vendor paid**. Any project expense can be put on the list from its transaction ("Vendor not paid yet?"); paying it through Nickel takes it off automatically.
- **Every Monday:** an email lists every bill not paid yet — property-management bills to pay or on the way, project vendors to pay, and unpaid invoices still waiting in the receipt inbox — past-due first, with totals. Turn it on once in the billing@ receipt-inbox script: run **setupWeekly()** (it sends you a preview). It goes to everyone on the Team page, or to `DIGEST_TO` if set.

### 7c. Add a bill by uploading the vendor's invoice
**Add bill** (or N) on the property management side opens an upload window. Drop in the vendor's invoice — PDF, JPG or PNG, several at once — or drag the file anywhere on the Bills or Today page. Choose **Bills to pay** or **Already paid (receipts)**.

Each file is read the same way as an emailed receipt (vendor, amount, invoice date, due date, invoice number, property) and saved to the receipt inbox's Drive folder. When the property and amount are clear, the bill is created right away with the file attached, and the file is moved into the property's folder. If the property isn't clear, the bill form opens filled in — pick the property and save. A file that was already uploaded, or that matches a bill you already have (same property and amount, same invoice number or vendor within 20 days), is flagged instead of added twice. Refunds and credits go to the receipt inbox. **Enter by hand** is still there for bills with no paperwork.

This uses the receipt inbox script (which also tells the Drive buttons where each property's folder is), so after updating the console, update the script once: open the receipt inbox's Apps Script project → replace **Code.gs** with `apps-script/Code.gs` → Save → **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL and key stay the same.

### 7d. Back-charges: costs a contractor pays, not the owner
When a project cost is the contractor's fault (a second countertop trip, a re-delivery, damage), open the transaction → **Billing state → Bill to a contractor or vendor**. Fill in who pays, their email, and whether you'll **send them an invoice** or **take it out of what we pay them**. To do several at once, tick them and choose **Bill to a contractor…** in the bulk menu.

The row stays on the property's transaction list with an orange **To charge → name** tag, but it never goes on the owner's invoice and doesn't count against the cap.

**Back-charges** (Projects side) shows everything owed to PHD, grouped by contractor:
- **Invoice {name}** emails one invoice for all their open charges from billing@, with a PDF (numbered like `BC-GPL-261006`). Use **Mark invoiced only** if you send it another way.
- **Deducted from their payment** marks the charges settled when you short their next payment.
- **Settle** on a row records a check or other payment. **Undo** reopens it.

Open back-charges also appear on **Today** and in the Monday "bills not paid" email. To get them in the email, update the receipt-inbox script in billing@ with the new `apps-script/Code.gs` (same steps as 7c).

### 7e. MagicDoor bills that aren't the owner's monthly cost
The MagicDoor sync brings vendor bills into the owner statement as repairs. On a property that is also a project (like 27 Smith St), a bill that matches one of the project's expenses (same amount, close in date, same vendor) is kept off the statement automatically. It's billed to the owner on the project invoice, and putting it on the statement as well would charge the owner twice.

For any other MagicDoor bill that shouldn't be on the statement, open the month (Properties → the property → the month) and click **✕** on the bill. Then choose **Project expense** or **Not the owner's cost**, and Save. The sync leaves it off from then on.

Everything kept off is listed under **Kept off this statement** in that month, with **Put back** to undo. Each MagicDoor bill also shows who entered it in MagicDoor and when.

Editing a bill in MagicDoor updates it here. It isn't added a second time, and a bill deleted or voided in MagicDoor comes off open months.

### 7g. Inventory (Projects → Inventory)

Bulk buys PHD keeps on hand (Costco lights and plants, Lowe's deadbolts…).
- **Paste from a sheet**: copy your inventory sheet (header row included) and paste it. It reads Store, Item, Qty Bought, Qty Left, Paid Price Ea., Retail Price Ea., Tax % and Owner Charge Ea. Pasting again updates items instead of doubling them.
- Each item shows how many are left, our cost each (paid + tax), the owner charge each and what it's over or under our cost, and the value on hand.
- **Itemize** a store charge (Inventory page → QuickBooks): one line per thing it bought — item, qty, paid each, tax %, owner charge — with a running total against the charge. Each line becomes an inventory item tied to that charge; **Edit items** changes them later (lines already used on projects can't drop below what's used). Tick “Also move this charge to Inventory Asset” to recategorize it in QuickBooks in the same step.
- **Use on a project** adds a charge to that project: vendor "PHD Inventory", "Item × qty", qty × owner charge (project fee off unless you tick it). What's left counts down; delete that transaction and the items come back. **Used on projects** lists every use.
- **QuickBooks**: store charges still in "Ask Client" with no customer are listed; tick the bulk buys and press **Move to inventory in QuickBooks** to file them under Inventory Asset (change the account with **Change account**). Lines already in it are listed with **Add its items**. On Reconcile → Fix in QuickBooks, Inventory Asset is also offered in every category list and in **Set ticked to**.

### 7h. Owner paid the contractor directly

When the owner pays a contractor themselves, open that labor line → Billing state → **Owner paid them directly — bill our fee only** (or select several and use the bulk menu). The labor stays on the project for the record but off the owner's invoices ("Paid by owner"), and a separate line — PHD Properties, "Project management fee — 15% of …" — bills only PHD's fee. The fee line follows the labor line: change the amount, unit or date and it updates, until it's on a sent invoice. Switch the labor back to "Bill to owner" and the fee line goes away. Owner-paid labor is left out of the QuickBooks check.

### 7i. Read a store order (Transactions → Read an order)

Open a Lowe's, Home Depot, Costco or Amazon order on the store's site, select all, copy and paste it — or drop the order PDF. The console finds what was billed, the tax rate, each return (items × price × tax; one return without items listed takes what's left of the refund total), and the payments a big order was split into. Check the lines, pick the property and unit, and it adds the purchase and every return as their own lines. Any line QuickBooks already has (the purchase, its pieces, each refund credit) is linked as it's added; lines that look like they're already in the project are flagged.

### 7k. Drop a receipt on a project
Drag one or more PDFs or photos (JPG, PNG) from your computer onto any page of a project property: Overview, Transactions, Scope, Invoices, Owner or Settings. Each file is read by the receipt inbox and filed in Drive like an emailed receipt, then added to **that** property:
- When the amount, date and unit are clear and nothing similar is already there, it's added as a transaction right away. Press Ctrl+Z (⌘Z) to undo.
- Otherwise its inbox card opens in the same panel, with the reason (pick the unit, no amount found, looks like one already here…). Finish it there or dismiss it.
- Files sent before are caught as duplicates. Big photos are shrunk first.

This needs the receipt inbox connected. **Add more files** in the panel works when dragging isn't handy.

### 7j. Business page (Projects → Business)

- **Profit** — what PHD earns on each project: the project fee, fees on labor owners paid directly, and inventory markup; collected, invoiced and not invoiced yet; margin on project spend.
- **Budgets** — every work item at 90%+ of its budget, over budget, or with a change order pending, across all projects. Change orders are added on a work item (Scope of work → open the item → Change orders): approved ones add to the budget, pending ones don't until approved. Items built from transactions are left out until they have a real budget.
- **Contractors** — everyone PHD paid (stores left out): paid this year and before, by card vs. check/ACH (from the QuickBooks match), contract total and what's left on each project, W-9 and insurance (COI) dates, and what isn't in QuickBooks yet. 1099s are counted at $600+ paid by check/ACH/Zelle; names with Inc./Corp. are treated as corporations (change it on the contractor). **1099 list (CSV)** exports the year.
- **Unpaid invoices** — owner invoices sent and not paid, by age. A first reminder is due at 7 days, a second at 14 (a week after the first). **Send due reminders** sends them all from billing@ after one confirmation; **Remind** opens one to edit. Nothing is sent without a press.

**Inventory → Used on projects → Post to QuickBooks** makes one journal entry per use: our cost moves from Inventory Asset to Project Management:Materials & Supplies with the project's customer. Each is posted once; the console keeps the entry's id.

### 7f. QuickBooks check of project expenses (Reconcile page)
The `qbo` function reads QuickBooks every hour, at 22 minutes past. It reads your bank and card accounts with their balances, the chart of accounts, customers, and every posted expense, check, card charge, credit and bill since the first project. **Reconcile** (Projects side) then checks each project expense against it:

- **Not in QuickBooks** lists project expenses QuickBooks has nothing for. Each shows why, for example "a different amount from Lowe's that day", or "recent — may still be in Banking → For review". **Find in QuickBooks** links one by hand, and **Not a QB expense** marks inventory, PHD's own fees and the like.
- **Needs a look** lists likely matches a person confirms with **That's it**:
  - an expense that's part of a bigger charge (a bulk receipt split here)
  - one paid in parts
  - several expenses that add up to one charge
- **Fix in QuickBooks** is the accountant part. It is one list, grouped by property, of project costs in QuickBooks with the wrong category or no customer (Amazon orders under Office Supplies, Lowe's under Leasehold Improvements…) plus lines still in "Ask Client" / Uncategorized. Every row shows what it is now and starts on a suggestion, with a one-line reason; change the **Category** or **Customer** right in the row. Picking something ticks the row. Use the filters (Labor, Materials, Uncategorized, Check first), the tick box on a property to take all of it, "Same for N more from …" to copy a category to that vendor's other lines, or **Set ticked to** at the bottom to give every ticked row one category. The bar at the bottom shows how many lines and dollars will change; press **Update in QuickBooks**. Only the category and customer on those lines change. Nothing is created, deleted or paid, and a line someone changed since the last sync is skipped.
  - Labor of $500 or more (any vendor that isn't a store) never goes to Maintenance Cost: it's pre-ticked to Project Management › Labor / Subcontractors, and Maintenance Cost can't be picked for it. Change the $500 on QuickBooks **Settings**.
  - To change a line that's already right as far as the console can tell, open **Matched** and press **Change in QB** on the expense: its QuickBooks line joins the Fix list (highlighted) with the category and customer ready to edit. "Take off this list" removes it again.
  - **Find in QuickBooks** takes several records: tick each card charge (and any refund already taken out of the console amount — credits count as minus) and the total at the bottom says whether they add up.
  - **Unmatch** (on Matched) says the two aren't the same expense. It moves to Not in QuickBooks and won't be paired with that QuickBooks record again on its own; use **Find in QuickBooks** to pick the right one, or **Undo unmatch**.
  - Categories you pick are remembered by vendor and used for that vendor's next lines. See or forget them on **Settings**.
- **In QuickBooks, not here** lists QuickBooks project costs (a project category, or a project's customer) that no expense here explains. Use **Add here** to add one, or **Not a project cost** to dismiss it.
- **Matched** shows the QuickBooks record behind each expense, including bills with one line per job.

Every transaction row also shows **QB ✓**, **QB part** or **Not in QB**. **Settings** (on the QuickBooks card) sets each project's QuickBooks customer and the Materials and Labor categories. Store purchases count as materials, everyone else as labor.

QuickBooks doesn't let other apps see Banking → **For review**, so a charge shows as matched only after it's added or matched there.

To reconnect later, use Settings → **Connect again**. If Intuit asks, add `https://skeuyevmbxtkjusmrmdd.supabase.co/functions/v1/qbo?qbo=callback` as a redirect URI in the Intuit developer app (Keys & credentials).

---

### 8. Payments: Nickel (free plan, through Nickel's MCP server)
**Today** (top of the left menu on both sides) lists what needs doing, each with the button that does it. On the Projects side: invoices to send, invoices waiting on owners (with a reminder button after two weeks), receipts to review and checks to apply. On the Property mgmt side: rent collected and who's late, bills to pay and payments on the way, owner payouts to send, owner invoices, month close and owner statements, leases and deposits, and bills paid in the last week. **Payments** is in the left menu on both sides (Projects and Property mgmt). It has two tabs:
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
