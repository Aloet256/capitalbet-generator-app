# CapitalBet System Completion Notes — 9 August 2026

This revision completes and hardens the uploaded CapitalBet branch utility/generator application without changing its core React + Supabase architecture.

## Completed or corrected

- Removed the branch-facing release/change-branch action.
- Made the existing server `devices` row authoritative when restoring an assignment.
- Prevented a device record from being moved to a different branch.
- Enforced only one live pending/approved device per branch.
- Added branch availability directly to the selection screen.
- Added safer device approval/revoke/restore handling for admins.
- Added full-history pagination helpers for operational records.
- Extended generator statistics to day/week/month/year, including ongoing runtime.
- Added Monday–Sunday daily drill-down and hourly outage/runtime details.
- Added fuel refill litre/cost statistics for day/week/month/year.
- Expanded admin branch detail to full power, fuel, service, repair, DSTV and Yaka histories.
- Expanded the organization dashboard with fuel litres and service-due status.
- Converted Yaka from a low-units reminder concept to a monthly reload-cycle model.
- Added `expected_reload_date` to Yaka purchases and Telegram/in-app due reminders.
- Strengthened settings and device validation/error handling.
- Added automatic `created_by_device` stamping and database audit triggers.
- Tightened public RLS exposure and added a safe branch-selection RPC.
- Fixed the branch seed/schema conflict: branch reference `code` values repeat in the supplied data and therefore must not be unique.
- Added an upgrade migration path for databases that already used the original schema.
- Replaced the broken `eslint` script (ESLint was not declared in the project) with a TypeScript project check that uses the existing dependency set.

## Validation performed in this workspace

- All relative imports were checked and resolve to project files.
- All `src` TypeScript/TSX files were transpiled with the available global TypeScript compiler to catch syntax-level errors.
- The database seed/schema uniqueness conflict was detected and corrected.
- The migration was split so the PostgreSQL enum addition is committed before the new enum value is used.

A full dependency-backed `npm run build` could not be executed in this sandbox because its configured npm registry did not provide required packages (including `@supabase/supabase-js` / a transitive `yallist` dependency). The project therefore still needs the normal final `npm install && npm run build` check in an environment with standard npm registry access before production deployment.
