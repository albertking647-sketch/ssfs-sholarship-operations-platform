# Authentication And Role Access Design

Date: 2026-04-23

## Goal

Add real password protection to the Scholarship Operations Platform so staff must log in before using the app, with admin-controlled account creation and role assignment.

This design also includes three approved cleanup items:

- show real reviewer names in the dashboard reviewer leaderboard, with separate cards per reviewer
- remove the Applications context note that was flagged as unnecessary
- reduce instruction-style text where it visually reads like an action area

## Scope

Included:

- username/password authentication
- first-admin bootstrap from `.env.local`
- admin-managed staff accounts
- role-based module visibility in the web app
- role-based API access restrictions
- named reviewer attribution in dashboard reporting
- light UI cleanup tied to the approved review comments

Not included:

- forgot-password email flow
- multi-factor authentication
- external identity providers
- self-service signup
- password-change reminder policy

## Roles

### Admin

Admin can:

- log in
- create staff accounts
- assign roles
- activate or deactivate accounts
- reset passwords
- access every module

### Reviewer

Reviewer can:

- log in
- access Dashboard
- access Applications
- access Food & Clothing Support

Reviewer cannot see or access:

- Student Registry
- Recommended Students
- Beneficiaries & Support
- Reports

## First Admin Bootstrap

The first admin account will come from `.env.local`.

Required bootstrap values:

- `BOOTSTRAP_ADMIN_FULL_NAME`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`

Application behavior:

1. On API startup, check whether any user accounts already exist.
2. If no accounts exist and the bootstrap values are present, create the first admin account.
3. If accounts already exist, do not recreate or overwrite the bootstrap admin.
4. If no accounts exist and bootstrap values are missing, authentication setup is considered incomplete and login should fail with a clear setup message for the host/admin.

This keeps initial setup secure and avoids needing an unsafe public signup flow.

## Authentication Model

Use a database-backed local account system with username/password login and server-validated sessions.

## Storage

Create a real application user store in the database with:

- `id`
- `full_name`
- `username`
- `password_hash`
- `role_code`
- `status`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

Status values:

- `active`
- `inactive`

Usernames must be unique.

Passwords must never be stored in plain text. Store only a password hash.

## Session Model

Use login-issued bearer tokens backed by server-side session records or signed tokens persisted in the database/runtime layer.

Recommended behavior:

- login returns a session token
- frontend stores the token in the current saved connection state
- `/api/auth/session` resolves the authenticated user from that token
- logout clears the saved token and session state

The current dev-token approach should remain available only as an explicit development fallback, not as the normal operational mode.

## Login Flow

When the app loads:

1. If no valid authenticated session is present, show a login screen instead of the main workspace.
2. User enters:
   - username
   - password
3. On success:
   - session token is stored
   - current user profile is loaded
   - allowed modules render based on role
4. On failure:
   - show a clear authentication error

## Admin Staff Management

Add a small admin-only workspace for account control.

Recommended location:

- an admin-only `Access Management` section inside the app shell, or
- an admin-only panel under Dashboard if a new module feels too heavy

Required actions:

- create account
- set full name
- set username
- set role
- set temporary/new password
- activate/deactivate account
- reset password

Deliberate guardrails:

- reviewers cannot manage users
- inactive users cannot log in
- the system should not allow deletion of the last active admin account

## Web App Access Rules

Module visibility must be enforced in the frontend.

### Admin visible modules

- Dashboard
- Student Registry
- Applications
- Recommended Students
- Beneficiaries & Support
- Food & Clothing Support
- Reports

### Reviewer visible modules

- Dashboard
- Applications
- Food & Clothing Support

Frontend rules:

- hidden modules should not appear in the sidebar
- deep-linking or saved module state should redirect reviewers back to an allowed module
- module descriptions and tabs should adjust cleanly after role filtering

## API Access Rules

The API must enforce the same role restrictions, regardless of what the frontend hides.

Required outcome:

- reviewer requests to restricted modules should be rejected even if someone manipulates the browser manually

Main restrictions to apply:

- reviewer cannot access Student Registry management endpoints
- reviewer cannot access Recommended Students endpoints
- reviewer cannot access Beneficiaries & Support endpoints
- reviewer cannot access Reports endpoints

Admin retains full access.

## Dashboard Reviewer Leaderboard

Current problem:

- cards show generic names like `Application Reviewer`
- multiple reviewers can collapse into one identity

New behavior:

- dashboard reviewer cards should use the real stored full name of the authenticated reviewer/admin who made each decision
- each distinct reviewer identity should get its own card
- recommendation-origin or system-origin actions should still stay distinct from human reviewer cards where appropriate

Data requirement:

- review actions must reliably store reviewer user ID and reviewer full name
- reporting must group by stored reviewer identity, not generic labels

## UI Cleanup Included In This Change

### Applications

- remove the flagged Applications context note:
  - `The active scheme and academic year drive imports...`

### Food & Clothing Support

- reduce instruction blocks that visually resemble action panels
- keep only concise helper text where it genuinely assists a required step

### General wording cleanup

- prefer concise helper text
- avoid large descriptive blocks directly below action controls unless they are necessary for error prevention

## Error Handling

Authentication and access errors should be explicit:

- invalid username/password
- inactive account
- bootstrap admin not configured
- session expired
- permission denied for this role

Do not expose raw internal errors to users.

## Testing

Required verification coverage:

- bootstrap admin is created only when no users exist
- login succeeds with correct username/password
- login fails with wrong password
- inactive account cannot log in
- admin can create reviewer account
- admin can reset reviewer password
- reviewer cannot access restricted modules in frontend
- reviewer cannot access restricted module APIs directly
- admin can still access all modules
- dashboard reviewer leaderboard separates distinct reviewer names

## Migration Strategy

1. Add user/account storage.
2. Add bootstrap admin creation.
3. Add login/session endpoints.
4. Update frontend to support login gate and authenticated session rendering.
5. Apply role-based sidebar/module filtering.
6. Tighten API route permissions.
7. Update reviewer leaderboard aggregation.
8. Apply approved UI cleanup items.

## Risks And Mitigations

### Risk: locking out all admins

Mitigation:

- protect the last active admin account from being disabled or removed

### Risk: reviewer discovers hidden URLs

Mitigation:

- enforce permissions in API routes, not only the frontend

### Risk: weak bootstrap admin setup

Mitigation:

- require explicit bootstrap admin values in `.env.local`
- document that the bootstrap password should be changed/reset through admin management after first setup

### Risk: old dev-token behavior conflicts with new login

Mitigation:

- keep dev-token mode clearly isolated as development-only behavior
- prefer real login/session mode in local office deployment

## Recommended Implementation Outcome

After this change:

- the app opens to a login page
- only authenticated staff can enter
- admin creates and manages staff accounts
- reviewer access is limited to Dashboard, Applications, and Food & Clothing Support
- real reviewer names appear in dashboard reviewer cards
- the flagged UI wording issues are cleaned up as part of the same delivery
