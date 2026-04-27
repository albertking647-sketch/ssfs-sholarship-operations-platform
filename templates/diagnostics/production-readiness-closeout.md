# Production Readiness Closeout

Generated: 2026-04-22

## Scope covered in this closeout

- Production-readiness checklist
- Admin / Reviewer / Auditor permissions summary
- Required import fields per module
- Export list
- Backup / rollback notes
- Report verification notes
- User-facing wording and empty-state cleanup

## Production-readiness checklist

- API health responds successfully
- Dashboard loads current metrics and support summaries
- Applications import / review / export flow is available
- Recommended Students manual add, import, edit, remove, and handoff flows are available
- Beneficiaries & Support supports preview, import, duplicate handling, lifecycle edits, scoped clear, and rollback
- Food & Clothing Support supports manual registration, import, edit, remove, and mark-served flow
- Reports overview, scheme reporting, summary export, and Food & Clothing reporting are available
- Role restrictions are enforced on write routes
- Multi-currency beneficiary totals are surfaced in dashboard, reports, and summary workbook
- Food & Clothing semester tracking is captured in manual entry, imports, saved records, and reporting

## Role and permission summary

### Admin

- Full access across modules
- Required for:
  - application imports
  - interview imports
  - beneficiary imports
  - beneficiary rollback
  - beneficiary scoped clear
  - recommended-student imports
  - Food & Clothing imports
  - application export
  - outbound application messaging send/log actions

### Reviewer

- Read access across operational modules and reports
- Can work on:
  - application review
  - issue resolution
  - manual application creation
  - recommended-student create / edit / remove / handoff
  - Food & Clothing create / edit / remove / mark served
- Cannot run admin-only imports, beneficiary rollback/clear, or application export/send flows

### Auditor

- Read-only access where reporting and audit visibility matter
- Can access:
  - reports
  - beneficiary lists / history / audit / import history
  - recommended-student lists
  - Food & Clothing lists
- Cannot perform write actions

## Required import fields per module

### Student Registry

Required:
- Full Name
- Student Reference ID
- College
- Program
- Year

Optional:
- Index Number
- Gender
- Disability Status
- Phone Number
- Email
- CWA
- WASSCE Aggregate
- Academic Cycle
- Notes

### Applications

Context is selected in-app before upload:
- Scheme
- Academic Year

Required in file:
- Student Reference ID
- Full Name

Common optional fields used by the importer:
- Email Address
- Program
- College
- Year
- Gender
- Disability Status
- WASSCE Aggregate
- CWA
- Notes / Reviewer Notes

### Interview Score Import

Required:
- Student Reference ID or Index Number
- Interview Score or Interview Status

Optional:
- Interview Notes
- Interview Date

### Recommended Students

Required:
- Academic Year
- Scheme Name
- Student ID / Reference Number

Optional:
- Full Name
- Index Number
- Recommendation Reason
- Notes

### Beneficiaries & Support

Required:
- Academic Year
- Scholarship Name or Support Name
- Full Name
- Student ID / Reference Number
- Amount Paid

Expected / strongly supported:
- Support Type

Conditionally required:
- College
  - required when `This list is categorized into colleges` is enabled

Optional:
- Sponsor
- Index Number
- Currency
- Beneficiary Cohort
- Remarks

Batch-level options:
- Import Mode
- Beneficiary Cohort
- Award Amount Currency fallback
- Duplicate Student ID action
- Categorized into colleges toggle

### Food & Clothing Support

Required:
- Academic Year
- Semester
- Student ID / Reference Number
- Support Type

Optional:
- Full Name
- Index Number
- Referring Counselor / Source
- Notes

## Export list

### Applications

- Application list export workbook
  - admin only
  - includes application records for the selected scheme / academic year filters

### Reports

- Full summary workbook
  - available to admin, reviewer, auditor
  - includes:
    - Support Summary
    - Year Comparison
    - Scheme Breakdown
    - College Breakdown
    - Food & Clothing Summary
    - Food & Clothing Colleges
    - Food & Clothing Years

- Per-scheme beneficiary workbook
  - available to admin, reviewer, auditor
  - scoped to selected academic year + support name

## Backup and rollback notes

### Beneficiaries & Support

- Latest import batch can be rolled back by batch reference
- Rollback removes rows created by that imported batch
- Rollback reason is captured in audit history
- Scoped clear is available for a specific support name within a specific academic year
- Record-level edit / replace / remove actions are audited

### Recommended Students

- No batch rollback flow is exposed
- Records can be edited or removed before downstream handoff
- Handoff to Applications is blocked when the same student already exists for the same scheme + academic year

### Food & Clothing Support

- No batch rollback flow is exposed
- Manual records can be edited, removed, or marked served
- Import is registry-matched first so unmatched rows stay out before save

### Reports / Exports

- Export workbooks are generated on demand
- Current diagnostics copies are stored in:
  - `templates/diagnostics/beneficiary-summary-report-verification.xlsx`
  - `templates/diagnostics/final-readiness-summary-export.xlsx`
  - `templates/diagnostics/reports-closeout-summary-export.xlsx`
  - `templates/diagnostics/reports-closeout-mixed-currency-and-semesters.xlsx`

## Report verification notes

### Multi-currency totals

Verified across:
- dashboard current-year beneficiary statistics
- report summary cards
- scheme report cards and college breakdowns
- full summary workbook

Expected behavior:
- row-level `Currency` wins when present in beneficiary import files
- batch-level award amount currency acts as fallback when the file does not provide one
- if neither is present, beneficiary import defaults to `GHS`
- totals are shown by currency instead of pretending mixed-currency amounts are one single total
- a fresh closeout workbook with mixed `GHS`, `USD`, and `EUR` data is stored in:
  - `templates/diagnostics/reports-closeout-mixed-currency-and-semesters.xlsx`

### Food & Clothing semester reporting

Verified end to end for:
- manual registration
- import validation
- saved records
- duplicate checking by student + academic year + semester
- report summary aggregation
- export workbook support sheets

## Verification evidence captured in this closeout

Code and service checks run successfully:
- `npm.cmd run check`
- `node apps/api/tests/run-beneficiaries-service-tests.js`
- `node apps/api/tests/run-food-bank-service-tests.js`
- `node apps/api/tests/run-recommended-students-service-tests.js`
- `node apps/api/tests/run-reports-service-tests.js`
- `node apps/api/tests/run-schemes-service-tests.js`

Live API checks completed:
- auditor read access to `GET /api/reports/beneficiaries/summary`: passed
- auditor write attempt to `POST /api/food-bank`: correctly blocked with `403`
- reviewer export of `GET /api/reports/beneficiaries/summary-export`: passed

## User-facing cleanup completed in this closeout

- Reports wording now refers to currency-aware totals where mixed currencies can exist
- Export button wording now reflects workbook-style output
- Reports overview copy now better reflects summary + export behavior
- Empty states remain explicit about whether data has not been loaded yet or no saved records exist yet

## Non-blocking future enhancements

- Add a dedicated operating guide inside the app for first-time admins
- Add download templates for each importable module
- Add richer report charts for Food & Clothing by semester
- Add backup/export snapshots for Recommended Students and Food & Clothing lists if operationally needed
