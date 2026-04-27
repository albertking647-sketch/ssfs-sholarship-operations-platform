# Database Package

This package contains the PostgreSQL foundation for the Scholarship Operations Platform.

The schema is organized around these ideas:
- a canonical student identity
- academic-cycle-aware applications
- configurable scheme and funder ownership
- separate recommendation, waitlist, award, and payment records
- auditable imports and exports

## Contents

- `postgres/schema.sql`
- `postgres/migrations/001_initial_schema.sql`
- `scripts/migrate.js`
- `scripts/status.js`

## Important Design Notes

- A student can have multiple identifiers.
- A student can apply many times across cycles.
- A recommendation can result in a waitlist entry or an award.
- An award can have many payments.
- Waitlist entries are preserved historically.

## Commands

Run from the project root:

```powershell
npm run db:status
npm run db:migrate
npm run db:seed
```

`db:status` reports which migrations exist and, when `DATABASE_URL` is configured, which ones have already been applied.

`db:migrate` applies pending SQL migrations in version order and records them in `schema_migrations`.

`db:seed` inserts or updates the first operational dataset used by the PostgreSQL-backed API:
- roles and users
- funders and schemes
- application cycle
- students and identifiers
- applications, recommendations, and waitlist entries
- awards and payments
