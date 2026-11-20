# Dayoff — Georgia small-team edition (1–10 people)

A browser-based leave request app for one manager and up to nine teammates, with Georgian public holidays, manager review, per-user leave balances, a private email allowlist, and a team calendar.

## Team leave policy (per calendar year, per employee)

| Leave type | Annual allowance | Counting rule |
| --- | ---: | --- |
| Paid annual leave | **24 days** | Monday–Friday **working days**, excluding Georgian public holidays and company holiday dates |
| Unpaid leave | **15 days** | **Calendar days**, including weekends and holidays |
| Paid casual leave | **5 days total** | Working days; can be booked in full-day portions or **0.5-day portions** (up to 10 half-days if no full days are used) |


**There is no separate half-day entitlement.** Every casual half-day uses **0.5** from the same 5 paid casual days. For example, 2 full casual days and 3 half casual days use 3.5 days, leaving 1.5 days. Pending requests reserve balance; rejected and cancelled requests restore it. Balances reset each January 1 (calendar year); there is no carry-forward or accrual/pro-rating. A leave request cannot overlap another pending or approved request, including a different leave type. Holidays are excluded from working-day counts, but not unpaid calendar-day counts. Leave date ranges may cross calendar years; each segment is charged to its respective year's allowance.

**Georgian holidays:** Fixed Georgian statutory holidays and Orthodox Easter Friday–Monday. Company-specific additional New Year days: **December 31 and January 3**; January 1 and 2 are statutory holidays. Extraordinary government-declared holidays must be configured separately; this version does not fetch official notices. All team members use a Monday–Friday schedule.

The app retains existing historical `Sick` and `Personal` records if you used an older version, but those older types have no assigned balance in this policy and are no longer available for new requests. Review old records before using the app for payroll decisions.

## 1. Try the demo

Open `index.html` in a browser. If `supabaseUrl` and `supabaseAnonKey` are empty in `config.js`, the app runs in **local demo mode** with sample employees. Use the role dropdown at the bottom to switch between manager and employee. Local demo records are saved in that browser only, not shared with your team.

## 2. Set up a shared team database (Supabase)

1. Create a project at https://supabase.com (Free tier, subject to platform limits).
2. In `schema.sql`, change `owner@example.com` to the actual manager's lowercase email. Run the **entire** file in the Supabase SQL Editor **before the first sign-in**. The SQL includes an allowlist, RLS, approval RPC, and server-side leave allowance/overlap checks.
3. Add up to nine more invitees in SQL Editor:
   ```sql
   insert into public.team_allowlist(email,role)
   values ('employee@example.com','employee')
   on conflict (email) do update set role = excluded.role;
   ```
4. In Supabase → Project Settings → API, copy the **Project URL** and **publishable or anon key** into `config.js` (these are browser-safe keys; **never put the service-role key there**).
5. In Supabase Auth → URL Configuration, set your eventual published website URL as Site URL and add it to allowed redirect URLs. Enable email OTP/magic-link sign-in as required. For dependable email delivery, configure your own SMTP mail provider; default free email sending is restricted.
6. Publish the contents of this folder (not the ZIP itself) on a static host such as GitHub Pages. Share the HTTPS website URL with approved teammates only. Employees can sign in using their approved addresses.

### If you already installed an older edition

- Back up the Supabase database first.
- Replace the site files with those in the new ZIP.
- Run the **SQL migration block at the end of `schema.sql`**, starting from `-- Georgia-team leave policy`. It changes previous `Half-day` records into `Casual` with `day_portion = half`, so they count against the **same** five-day pool. Review any employees whose combined prior casual and half-day leave exceeds five days. The prior schema should not be re-run blindly if you've made custom edits.
- Current-year earlier `Vacation`/`Unpaid` records count toward the quotas. Earlier `Personal`/`Sick` records remain unchanged. Previously recorded `Half-day` requests become casual 0.5-day requests.
- If you ran earlier versions with unauthorized / not-yet-approved data, check requests and team access before inviting colleagues.

## 3. What to test

- Submit an annual leave request over a weekend and a Georgian holiday; verify only working days are counted.
- Submit an unpaid request over a weekend or holiday; verify **every calendar day** is counted.
- Submit a casual half-day request; verify the **casual balance decreases by 0.5**, and the end date auto-matches.
- Try 6 casual working days, 16 unpaid calendar days, or an 11th casual half-day; requests should be rejected when above the annual allowance.
- Try overlapping requests; they should be blocked.
- Switch to manager and approve or reject a team member's request; balances update accordingly.
- Check Dec 31–Jan 3: it is a four-day company New Year break with **zero working-day leave** deducted.

## Caveats

- This is a starter web app, **not a deployed hosted service** and not a full HR/payroll system. Confirm your leave rules with your HR/legal adviser, particularly how sick leave, unused leave, leave accrual, and statutory entitlements must be administered.
- No employer account, ownership verification, automated holidays feed, payroll integration, or email notifications are provided.
- Cloud access depends on Supabase and the static hosting provider's free-tier terms and limits.
- Server-side quotas are fixed to 24/15/5 in `schema.sql` (using 48/30/10 half-day units). `config.js` is for connectivity only; edit both the policy logic and the backend if these allocations change in the future.
