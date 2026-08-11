# CapitalBet — Branch Utility & Generator Management System

A complete React + TypeScript + Vite + Tailwind frontend backed by Supabase PostgreSQL/Auth, with scheduled Telegram reminders through a Supabase Edge Function.

The system has two interfaces:

- **Branch application** (`/`) — a computer selects one branch, requests approval, and then operates only that branch.
- **Admin console** (`/admin/login`) — authenticated administrators see the combined organization summary, approve devices, open full branch histories, and configure reminders.

## Main functions

### Branch computer

- Permanent one-branch assignment workflow with admin approval.
- Power outage start/stop timer with protection against duplicate ongoing outages.
- Complete outage history and generator runtime totals.
- Daily, weekly, monthly and yearly power statistics.
- Monday–Sunday daily breakdown; expand a day to see outage starts and generator minutes by hour.
- Fuel refill logging with litres, amount, authorization and remarks.
- Daily, weekly, monthly and yearly fuel refill volume/cost summaries.
- Generator servicing every 25 days, including technician details and history.
- Categorized repair history.
- DSTV monthly subscription/renewal tracking.
- Yaka monthly load tracking with an automatically generated expected reload date.
- Notifications and CSV exports for all operational records.

### Admin console

- Organization-wide monthly dashboard across all active branches.
- Total outages, generator runtime, fuel litres, fuel cost and service-due indicators.
- Search and open any branch for full historical drill-down.
- Branch detail tabs for summary, power, fuel, servicing/repairs and utilities.
- Device approval, revocation and restoration workflow.
- Forced password change when `must_change_password = true`.
- Reminder settings for generator service, DSTV and Yaka.
- Manual Telegram reminder sweep.

### Database/security

- Row Level Security on all main tables.
- Operational reads/writes are restricted to the approved device assigned to that branch, or to an authenticated admin.
- The public branch picker uses a SECURITY DEFINER RPC that exposes only branch selection fields and lock status; Telegram chat IDs and operational data are not returned to unauthenticated visitors.
- One live device assignment (`pending` or `approved`) per branch is enforced by a partial unique index.
- A device row cannot be reassigned to a different branch after creation.
- Operational inserts automatically record the creating branch device.
- Operational inserts/updates/deletes generate audit-log records through database triggers.
- Branch reference `code` values are deliberately **not unique**, because the supplied branch data contains repeated numeric values.

## 1. Install and run

Requirements: Node.js 20+ and a Supabase project.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_ADMIN_USERNAME=admin
VITE_ADMIN_EMAIL=admin@capitalbet.example
```

Then run:

```bash
npm run dev
```

## Hosting on GitHub Pages

This app is ready to deploy to GitHub Pages through the included workflow at `.github/workflows/deploy-pages.yml`.

For the GitHub account `Aloet256` and repository `capitalbet-generator-app`, the public links will be:

- Branch/user platform: `https://aloet256.github.io/capitalbet-generator-app/`
- Admin platform: `https://aloet256.github.io/capitalbet-generator-app/admin/login`
- Admin dashboard after login: `https://aloet256.github.io/capitalbet-generator-app/admin/dashboard`

The branch/user platform opens at the branch selection and device approval flow. After the device is approved, users work under `/branch/dashboard`, `/branch/power`, `/branch/servicing`, `/branch/utilities`, `/branch/reports`, and `/branch/notifications`.

Before the first GitHub Pages deployment, add these repository secrets in GitHub under **Settings -> Secrets and variables -> Actions -> New repository secret**:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ADMIN_USERNAME
VITE_ADMIN_EMAIL
```

Then enable Pages under **Settings -> Pages -> Build and deployment -> Source -> GitHub Actions**. Pushes to `main` will build and publish the app automatically. The `VITE_` values are compiled into the browser app, so never put service-role keys or Telegram bot tokens there.

To finish the live Supabase setup without copying SQL by hand, run this from a shell where the service-role key is set:

```bash
$env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
$env:SUPABASE_ADMIN_PASSWORD="A_STRONG_TEMPORARY_ADMIN_PASSWORD"
npm run provision:supabase
```

This seeds branches when the `branches` table is empty, creates/uses the Auth user `admin@capitalbet.example`, links the `admins` row, and verifies username `admin` with the password you set in `SUPABASE_ADMIN_PASSWORD`.

Telegram live-entry messages are sent by `telegram-notify`, scheduled reminders are sent by `telegram-reminders`, and scheduled fuel-cost summaries are sent by `telegram-fuel-reports`. Deploy the Edge Functions and set their secrets:

```bash
supabase functions deploy telegram-notify
supabase functions deploy telegram-reminders
supabase functions deploy telegram-fuel-reports
supabase secrets set TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN TELEGRAM_DEFAULT_CHAT_ID=-1003743501704
```

If you are using the Supabase dashboard instead of the CLI, run `supabase/setup-telegram.sql` once in the SQL editor to store the default chat ID.

Useful commands:

```bash
npm run lint     # TypeScript project check
npm run build    # TypeScript check + Vite production build
npm run preview  # preview the production build
```

## 2. Supabase database setup

### Fresh Supabase project

Run these files in this order in the Supabase SQL editor:

1. `supabase/schema.sql`
2. `supabase/seed.sql`

The updated schema is the authoritative fresh-install schema.

### Existing project that already used the original schema

Do **not** rerun the complete schema over existing data. Apply these migration files in order:

1. `supabase/migrations/20260809_01_add_yaka_reload_enum.sql`
2. `supabase/migrations/20260809_02_system_completion.sql`
3. `supabase/migrations/20260811_01_service_button_defaults.sql`
4. `supabase/migrations/20260811_02_add_service_cost.sql`
5. `supabase/migrations/20260811_03_configurable_delete_password.sql`

They are intentionally separate. PostgreSQL needs the new `yaka_reload_due` enum value committed before the next migration uses it.

The second migration also removes the incorrect uniqueness constraint from `branches.code`, preserves one live device per branch, adds monthly Yaka reload dates, strengthens RLS, adds device stamping/auditing and creates the safe branch-selection RPC.

The third migration adds the admin-configured generator service defaults used by the branch one-click service button. The fourth migration adds the service-detail fields below that button: items replaced, repairs done, and cost. The fifth migration makes branch-entry deletion use the password saved in Admin Settings instead of a hardcoded SQL value.

## 3. Create the first admin

Create a user under **Supabase Authentication -> Users** using a strong temporary password:

- Email: `admin@capitalbet.example`
- Password: choose a private temporary password

Then insert the matching admin profile:

```sql
insert into admins (auth_user_id, full_name, email, must_change_password)
values ('<AUTH_USER_UUID>', 'Super Admin', 'admin@capitalbet.example', true);
```

The admin login screen accepts username `admin`. The app maps that username to the configured `VITE_ADMIN_EMAIL` and signs in through Supabase Auth.

## 4. Telegram reminders

Create a Telegram bot with BotFather, then deploy the Edge Functions:

```bash
supabase functions deploy telegram-notify
supabase functions deploy telegram-reminders
supabase functions deploy telegram-fuel-reports
supabase secrets set TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN TELEGRAM_DEFAULT_CHAT_ID=-1003743501704
```

The Supabase runtime provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Do not put the service-role key or Telegram bot token in the frontend `.env` file.

Set either:

- a branch-specific `telegram_chat_id` on `branches`, or
- `telegram_default_chat_id` in Admin Settings as the fallback.

Schedule `telegram-reminders` once each day, preferably in the morning. It checks:

- generator services approaching their 25-day due date;
- DSTV monthly renewals;
- the latest Yaka purchase for each branch and its monthly expected reload date.

An authenticated admin can also run the same check from **Admin Settings → Run Now**.

Schedule `telegram-fuel-reports` once each day at **20:00 UTC**, which is **23:00 Africa/Kampala**. It sends daily branch fuel cost totals every day, weekly totals on Sunday night, and monthly totals on the last day of the month.

## 5. Device-lock behavior

1. On the first visit the browser creates `cb_device_fingerprint` in `localStorage`.
2. Selecting a branch creates one `pending` `devices` row.
3. The branch becomes unavailable to any other pending/approved computer.
4. The computer cannot choose another branch from the application after it has an assignment.
5. The admin approves the request; RLS then permits that computer to read/write only that branch's operational data.
6. Logging out of the admin console or refreshing/reopening the branch page does not release the branch assignment.
7. If an admin **revokes** the device, that branch becomes available for a replacement computer; the old device record remains tied to its original branch and cannot be moved to another branch.
8. If appropriate, an admin may restore the revoked device, provided no replacement computer already holds a live assignment for that branch.

### Important physical-device limitation

A normal browser cannot provide an unresettable hardware identity. This implementation strongly locks the assignment using a server-side device row plus a persistent browser fingerprint, and it restores the server assignment when the local branch key is missing. However, a user with control of the computer can erase all browser site storage and obtain a new browser fingerprint. If the organization needs a lock that survives deliberate browser-data deletion/reinstallation, use managed devices with an installed client/device certificate or another centrally provisioned hardware identity.

## 6. Business rules

- **Power:** one ongoing outage per branch. Runtime is calculated from the outage start/end timestamps, including the current running outage in dashboard statistics.
- **Generator service:** next service date = service date + 25 days.
- **DSTV:** renewal date = subscription date + 1 month.
- **Yaka:** expected reload date = purchase date + 1 month. The reminder window is configurable by the admin.
- **Fuel:** the system reports recorded refill litres and refill cost. It does not claim to measure tank consumption unless that consumption is separately captured by the business.
- **History:** branch hooks paginate records instead of silently stopping at Supabase's common 1,000-row response boundary.

## 7. Project structure

```text
src/
  components/
    analytics/        weekly/day/hour power drill-down
    charts/           generator/fuel charts
    layout/           branch/admin shells
    ui/               reusable controls
  context/            branch-device, admin-auth and theme contexts
  hooks/              Supabase data hooks per operational domain
  lib/                Supabase, device, CSV, query and utility helpers
  pages/
    branch/            branch-facing screens
    admin/             admin console screens
  types/               database/domain TypeScript types
  supabase/
    schema.sql
    seed.sql
    migrations/
  functions/telegram-fuel-reports/
  functions/telegram-reminders/
```

## 8. Deployment checklist

- [ ] Apply the fresh schema + seed, or both upgrade migrations in order.
- [ ] Confirm all branch rows loaded successfully.
- [ ] Create the first Supabase Auth admin and matching `admins` row.
- [ ] Set production frontend environment variables.
- [ ] Deploy the Telegram Edge Functions and set their bot-token secret.
- [ ] Configure branch/default Telegram chat IDs if Telegram is required.
- [ ] Schedule the reminder function daily and the fuel report function at 23:00 Africa/Kampala.
- [ ] Run `npm run lint` and `npm run build` in an environment with npm registry access.
- [ ] Test one branch device request → approval → outage → fuel → service → DSTV → Yaka flow.
- [ ] Test revocation and replacement-device behavior before rollout.

See `COMPLETION_NOTES.md` for the changes made in this completed revision.
