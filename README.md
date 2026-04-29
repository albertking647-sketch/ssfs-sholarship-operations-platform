# SSFS Scholarship Operations Hub

This is a fresh project scaffold for a centralized scholarship, bursary, and student support platform.

It is designed to grow into a system that can:
- maintain a canonical student registry
- manage scholarship schemes, funders, and award cycles
- import and score applications from uploaded Excel or CSV documents
- track recommendations, waitlists, awards, renewals, and payments
- generate management and donor reports
- validate and format portal uploads
- manage additional student support programs such as food bank workflows and an emergency support fund

## Workspace Layout

- `apps/api`
  - lightweight API prototype for core modules
- `apps/web`
  - lightweight web shell for the platform overview
- `packages/database`
  - initial PostgreSQL schema draft and domain notes
- `docs`
  - blueprint and implementation roadmap

## Current State

This scaffold is intentionally dependency-light so it can run immediately without package installation.

What is already included:
- initial project blueprint
- initial PostgreSQL schema
- core API route skeletons
- core web shell
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

The platform will normalize header variations such as:
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

These endpoints currently accept spreadsheet-style row objects in JSON so we can validate header mapping, row normalization, duplicate detection, and import logic before adding full binary `.xlsx` upload handling.
They now also accept real multipart file uploads for `.csv` and `.xlsx` files.

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

Run the API prototype:

```powershell
cd scholarship-operations-platform
npm run dev:api
```

Run the web shell:

```powershell
cd scholarship-operations-platform
npm run dev:web
```

Run the syntax checks for the whole workspace:

```powershell
cd scholarship-operations-platform
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
cd scholarship-operations-platform
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
3. Add more operational dashboards for administrators, reviewers, and auditors.
4. Add Excel import and export jobs for application intake and reporting.
5. Build the next production workflows:
   - student registry
   - applications
   - scoring
   - waitlist promotion
   - awards

