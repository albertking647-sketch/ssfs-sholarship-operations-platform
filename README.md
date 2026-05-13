# SSFS Scholarship Operations Hub

This workspace contains the SSFS Scholarship Operations Hub, a centralized scholarship, bursary, and student support platform.

The system can:
- maintain a canonical student registry
- manage scholarship schemes, funders, and award cycles
- import and score applications from uploaded Excel or CSV documents
- track recommendations, waitlists, awards, renewals, and payments
- generate management and donor reports
- validate and format portal uploads
- manage additional student support programs such as food and clothing support workflows

## Workspace Layout

- `apps/api`
  - API services for authentication, imports, applications, beneficiaries, support, reporting, and audit workflows
- `apps/web`
  - browser-based operations workspace for staff workflows
- `packages/database`
  - PostgreSQL schema, migrations, seed scripts, and database checks
- `docs`
  - user manual, blueprint, and implementation notes

## Current State

The app is intentionally dependency-light so it can run locally with the checked-in workspace packages.

What is already included:
- initial project blueprint
- PostgreSQL schema and migrations
- modular API services
- staff web workspace
- waitlist-aware domain model
- backend foundation milestone with migration scripts, optional PostgreSQL connectivity, and modular API services

## Core Domain Covered

- students and identifiers
- scholarship schemes and funders
- application cycles
- applications and eligibility checks
- scoring criteria and scoring runs
- recommendations and waitlist entries
- awards, renewals, and payments
- support programs and support applications
- imports, exports, and audit logs

## Recommendation Waitlist

The system models a recommendation waitlist as a formal operational stage, not an informal note.

The waitlist is intended for:
- needy students who are eligible
- candidates recommended by policy or committee review
- students not currently holding a conflicting active scholarship
- later promotion when award slots reopen

## Student Data Intake

The main source of student and applicant data is expected to be uploaded Excel or CSV files.

The platform normalizes header variations such as:
- `Student ID`
- `Reference Number`
- `Ref No`
- `Programme`
- `Program`
- `Level`
- `Year`

Both `Student ID` and `Reference Number` map into one internal field: `studentReferenceId`.

The API now includes the first spreadsheet import foundation for students:
- `POST /api/students/import/preview`
- `POST /api/students/import`

These endpoints accept spreadsheet-style row objects in JSON and real multipart file uploads for `.csv` and `.xlsx` files.

## Student Academic Data

The student registry now centers on:
- `studentReferenceId`
- `indexNumber`
- `college`
- `program`
- `year`
- `cwa`
- `wassceAggregate`

`CWA` is intended for continuing students, while `WASSCE Aggregate` is especially relevant for first-year applicants.

## Quick Start

Run the API:

```powershell
npm run dev:api
```

Run the web app:

```powershell
npm run dev:web
```

Run the syntax checks for the whole workspace:

```powershell
npm run check
```

## Backend Foundation

The API now has a production-oriented backend foundation with different expectations for development and production.

- The API and database scripts automatically load `.env` and `.env.local` from the project root.
- If `DATABASE_URL` is not set after env loading, the API starts in sample mode only in development and test.
- If `DATABASE_URL` is set, the API will use PostgreSQL repositories for the student registry, applications, schemes, and waitlist workflows.
- In `production`, startup fails closed unless PostgreSQL, password auth, TLS, and trusted network allowlists are all configured.
- Database migrations live in `packages/database/postgres/migrations`.
- Seed scripts live in `packages/database/scripts`.

Useful commands:

```powershell
npm run db:status
npm run db:migrate
npm run db:seed
npm run db:setup
```

## Authentication and Bootstrap

The normal operating mode for shared staff use is password-based authentication.

- Set `AUTH_MODE=password`.
- Set `AUTH_SESSION_SECRET`.
- On a fresh production database with no active admin accounts, set:
  - `BOOTSTRAP_ADMIN_FULL_NAME`
  - `BOOTSTRAP_ADMIN_USERNAME`
  - `BOOTSTRAP_ADMIN_PASSWORD`

On first startup, the API creates that admin account with a PBKDF2 password hash. After that, staff sign in through the normal login flow and use the session cookie returned by `/api/auth/login`.

## Suggested Next Steps

1. Replace the remaining sample-backed modules with database implementations.
2. Expand audit review and reporting workflows on top of the standardized audit spine.
3. Expand role-specific dashboards for administrators, reviewers, and auditors.
4. Continue hardening production workflows:
   - student registry
   - applications
   - scoring
   - waitlist promotion
   - awards

