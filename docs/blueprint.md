# Platform Blueprint

## Product Summary

The Scholarship Operations Platform is a unified internal system for managing scholarships, bursaries, and broader student support programs.

It consolidates:
- student identity
- application intake
- eligibility and scoring
- recommendation waitlists
- awards and renewals
- payments and disbursement status
- donor and management reporting
- portal upload validation

## Primary Outcomes

The platform should help staff:
- reduce spreadsheet fragmentation
- detect duplicate beneficiaries
- identify scholarship conflicts across schemes
- shortlist candidates more consistently
- preserve institutional history by academic cycle
- promote waitlisted students quickly when slots open
- produce reliable operational and donor reports

## Core Modules

### 1. Student Registry

- canonical student profile
- `studentReferenceId` plus index number
- academic profile
- scholarship history
- support history
- duplicate detection
- `year`, `cwa`, and `wassceAggregate` support

Student data is expected to come primarily from uploaded Excel or CSV documents, with manual entry reserved for corrections or one-off additions.

The current implementation path starts with:
- spreadsheet-style row mapping
- header normalization
- preview validation
- duplicate detection before write
- import execution for valid student rows
- multipart upload support for `.csv` and `.xlsx` intake

### 2. Scholarship and Scheme Management

- schemes
- funders
- slot counts
- award limits
- cycle-specific rules
- overlap policy

### 3. Applications and Eligibility

- import applicant list
- Excel-based intake and validation
- document checklist
- application validation
- eligibility flags
- incomplete status

### 4. Shortlisting and Scoring

- scoring templates
- weighted criteria
- reviewer decisions
- interview scheduling
- recommendation decision

### 5. Recommendation Waitlist

- recommended but unawarded students
- priority rank
- need severity
- committee rationale
- slot-release promotion
- expiry and withdrawal tracking

### 6. Awards and Renewals

- award issue
- approved amount
- academic year linkage
- renewal review
- cancellation and reallocation

### 7. Payments and Disbursement

- payment batches
- disbursement period
- pending vs completed tracking
- donor contribution mapping

### 8. Reporting and Exports

- beneficiaries by scheme
- beneficiaries by college
- gender and disability summaries
- year-over-year comparisons
- waitlist conversion rates
- donor summaries
- audit-ready CSV and PDF outputs

### 9. Portal Formatter and Validator

- required column checks
- data cleaning
- duplicate detection
- missing-data detection
- portal-format transformation
- exception reporting

### 10. Student Support Programs

- food bank applications
- emergency support fund applications
- need categorization
- approval or decline workflow
- distribution logs
- collection tracking

The emergency support fund should track approved amounts and disbursement status for needy students receiving direct financial assistance.

## User Roles

- admin
- reviewer
- auditor

The admin has full control. The reviewer handles operational assessment and recommendation work. The auditor remains read-only.

## MVP Recommendation

The strongest MVP is:
- student registry
- schemes and funders
- application cycles
- application import
- eligibility checks
- scoring
- waitlist
- awards
- search
- duplicate detection
- basic reports
- audit log
