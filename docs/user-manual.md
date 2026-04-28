# SSFS Scholarship Operations Hub User Manual

This guide explains how to use the SSFS Scholarship Operations Hub in everyday work.

It is written for staff, reviewers, and administrators. It focuses on what to do, what to prepare before using each module, and what to do when something is not working.

## 1. What this system is for

The system helps SSFS manage:

- student registry records
- scholarship applications
- recommended students
- beneficiary and support records
- food and clothing support registrations
- reports and exports

## 2. Who can use what

### Admin

Admin can use all modules and manage staff access.

Admin can:

- create and manage staff accounts
- import data into all main modules
- reset passwords
- manage beneficiaries
- run reports and exports

### Reviewer

Reviewer has limited access.

Reviewer can use:

- Dashboard
- Applications
- Food & Clothing Support

Reviewer cannot use:

- Student Registry
- Recommended Students
- Beneficiaries & Support
- Reports

## 3. How to access the app

Use the office link:

- [https://192.168.42.38:4400](https://192.168.42.38:4400)

Important:

- always use `https://`
- do not use `http://`

If you use a text-based office link later, it must match the certificate used by the system. If it does not match, the browser will show a privacy warning.

## 4. First-time setup on each PC

Before using the system on a staff PC, install the current local HTTPS certificate once.

### Certificate installation steps

1. Ask the host/admin for the current public certificate file for this deployment.
   - It should be delivered outside git as a PEM/CRT certificate file.
   - Do not use a `.pfx` bundle from the repository history.
2. Double-click the file.
3. Click `Install Certificate...`
4. Choose `Current User`
5. Choose `Place all certificates in the following store`
6. Click `Browse`
7. Select `Trusted Root Certification Authorities`
8. Finish the wizard and accept the warning
9. Close and reopen the browser
10. Open:
   - [https://192.168.42.38:4400](https://192.168.42.38:4400)

If staff skip this step, the browser may show:

- `Not Secure`
- `Your connection is not private`

## 5. Logging in

All staff must sign in before using the system.

The login page asks for:

- username
- password

### Important note for the first admin

The first admin account is created from `.env.local` on the host PC.

Those values are:

- `BOOTSTRAP_ADMIN_FULL_NAME`
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`

Important:

- changing these values does not automatically change the password of an account that already exists in the database
- after the first account exists, password changes should normally be done inside the app using `Reset password`

## 6. Staff accounts and password management

Admins can create staff accounts from the Dashboard access panel.

Admins can:

- create a new account
- choose the role
- activate or deactivate access
- reset a password
- remove an account

Safety rule:

- the last active admin account cannot be removed, deactivated, or changed out of the admin role

## 7. Main modules at a glance

### Dashboard

Use the Dashboard to see:

- overall application counts
- review progress
- reviewer workload
- beneficiary totals
- support mix
- recent activity

### Student Registry

Use Student Registry to:

- import student records
- search registry records
- review duplicates and flags
- import academic history

### Applications

Use Applications to:

- set the active scheme and academic year
- import applications
- review and classify applications
- import interview scores
- prepare outcomes
- log applicant messaging

### Recommended Students

Use Recommended Students to:

- add support-seeking students manually
- import recommended student lists
- track recommendation records
- hand recommended students into Applications or Beneficiaries when needed

### Beneficiaries & Support

Use Beneficiaries & Support to:

- preview and import beneficiary lists
- review duplicate student IDs
- manage beneficiary rows
- keep beneficiary history
- run support-related records and audit checks

### Food & Clothing Support

Use Food & Clothing Support to:

- register students who need food support, clothing support, or both
- import counselor lists
- track served students
- report support by college and semester

### Reports

Use Reports to:

- view summary totals
- view per-scheme support breakdowns
- see college coverage
- export summary and scheme workbooks

## 8. Import requirements by module

This is one of the most important parts of operating the app correctly.

### Student Registry import

Required fields:

- Full Name
- Student Reference ID
- College
- Program
- Year

Optional fields:

- Index Number
- Gender
- Disability Status
- Phone Number
- Email
- CWA
- WASSCE Aggregate
- Academic Cycle
- Notes

### Applications import

Before upload, choose in the app:

- Scheme
- Academic Year

Required fields in the file:

- Student Reference ID
- Full Name

Common optional fields:

- Email Address
- Program
- College
- Year
- Gender
- Disability Status
- WASSCE Aggregate
- CWA
- Notes / Reviewer Notes

### Interview score import

Required:

- Student Reference ID or Index Number
- Interview Score or Interview Status

Optional:

- Interview Notes
- Interview Date

### Recommended Students import

Required:

- Academic Year
- Scheme Name
- Student ID / Reference Number

Optional:

- Full Name
- Index Number
- Recommendation Reason
- Notes

### Beneficiaries & Support import

Required:

- Academic Year
- Scholarship Name or Support Name
- Full Name
- Student ID / Reference Number
- Amount Paid

Strongly expected:

- Support Type

Conditionally required:

- College
  - this becomes required when `This list is categorized into colleges` is enabled

Optional:

- Sponsor
- Index Number
- Currency
- Beneficiary Cohort
- Remarks

Batch options before upload:

- Import Mode
- Beneficiary Cohort
- Award amount currency fallback
- Duplicate student ID action
- Categorized into colleges

Currency note:

- if a row already has a `Currency` value, the row value is used
- if the file does not include currency, the selected batch currency is used
- if neither is provided, the system defaults to `GHS`

### Food & Clothing Support import

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

Support Type can be:

- Food Support
- Clothing Support
- or both

## 9. How the Applications module works

This is one of the most important operational modules.

### Step 1. Set the active scheme and academic year

At the top of the module, choose:

- Scheme
- Academic Year

Everything else in the Applications module follows this selection.

That means:

- imports
- review metrics
- issue resolution
- interview work
- outcomes
- messaging

all work against the selected scheme and academic year.

### Step 2. Import applications

Go to `Import & Setup`.

Upload the application file for the selected scheme and academic year.

Use preview first so you can:

- see valid rows
- see rows needing attention
- correct problems before final import

### Step 3. Work in Application Registry

Use `Application Registry` to:

- view imported application records
- search records
- confirm who is already in the selected scheme and year

### Step 4. Review & Exceptions

Use `Review & Exceptions` to:

- review applicants
- classify them as qualified, pending, or disqualified
- handle records with issues or exceptions

The dashboard reviewer cards are based on who actually performed the review actions.

### Step 5. Interview & Exports

Use `Interview & Exports` to:

- import interview scores
- connect interview results to applicants
- prepare export-ready lists

### Step 6. Outcomes

Use `Outcomes` to:

- prepare award decisions
- prepare not-selected decisions

This is where reviewed applications are turned into final outcomes.

### Step 7. Messaging

Use `Messaging` to:

- preview recipient groups
- prepare official applicant messages
- log messaging actions

## 10. How Recommended Students works

Recommended Students is for students who approach SSFS for support and are later linked to available schemes.

### Manual entry

1. Choose the scheme
2. Enter the student ID / reference number
3. Check the registry preview
4. Enter the recommendation reason
5. Save the record

The registry preview is important because it confirms:

- name
- college
- programme
- year

before the recommendation is saved.

### Import flow

Use Excel import when you already have a prepared list.

Preview first before importing.

### Handoffs

Recommended students can later be:

- added into Applications as already qualified
- added into Beneficiaries & Support when actual support is ready

## 11. How Beneficiaries & Support works

This module is used when real support has been awarded or paid.

### Beneficiary imports

Use this section to import:

- current beneficiary lists
- historical beneficiary lists

Important options before preview/import:

- import mode
- beneficiary cohort
- duplicate student ID action
- categorized into colleges
- award amount currency

### Duplicate handling

The system can detect:

- duplicates within the same upload
- duplicates already existing in the same scheme and year
- duplicates across other schemes and academic years

Choose the duplicate action carefully:

- Skip duplicate rows
- Import anyway
- Replace existing

### Beneficiaries list

Use the list section to:

- search records
- filter by academic year
- filter by support name
- filter by college
- filter by support type
- edit a row
- remove a row

### Rollback and scoped clear

Admins can:

- roll back the latest import batch
- clear one scheme/support within one academic year

Use these actions carefully because they affect saved beneficiary data.

## 12. How Food & Clothing Support works

This module handles registration and follow-up for students needing food support, clothing support, or both.

### Manual registration

1. Choose the academic year
2. Choose the semester
3. Enter student ID / reference number
4. Confirm the registry preview
5. Enter referral source
6. choose support type:
   - Food Support
   - Clothing Support
   - or both
7. Save the registration

### Counselor list imports

Use import when a counselor gives a prepared list.

Preview first.

The system checks the registry before saving records.

### Registered students list

Use this list to:

- search registrations
- filter by academic year
- filter by status
- edit a record
- remove a record
- mark a student as served

## 13. How Reports works

Reports brings together the main summaries from the system.

### Reports overview

Use Reports to view:

- beneficiary totals
- college breakdowns
- scheme totals
- food and clothing support summaries

### Scheme report

Choose:

- Academic Year
- Support Name

Then load the scheme report.

This helps you see:

- number of beneficiaries
- amount totals
- college-by-college breakdown

### Exports

The Reports module can generate:

- full summary workbook
- per-scheme beneficiary workbook

## 14. Daily operating tips

These habits will help avoid mistakes:

- always preview before importing
- always confirm the active scheme and academic year before working in Applications
- use student ID / reference number carefully
- do not use `http://` links
- keep at least one active admin account at all times
- back up the database before major cleanup or risky changes

## 15. When to restart the API

Restart the API when:

- you change `.env.local`
- the bootstrap admin settings were changed
- login suddenly stops working
- the app says routes are missing
- the API port is down
- the link opens but data does not load

### Restart steps

Open a terminal in:

- [scholarship-operations-platform-new](C:\Users\Lenovo\Documents\Code%20Space\student-verification-suite\scholarship-operations-platform-new)

Run:

```powershell
npm run dev:api
```

If it is already running and you want to restart it:

1. go to the terminal where it is running
2. press `Ctrl + C`
3. run:

```powershell
npm run dev:api
```

## 16. When to restart the web app

Restart the web app when:

- the link is down
- the page does not open at all
- UI changes were made on the host PC
- login page and main app do not behave correctly

Run:

```powershell
npm run dev:web
```

If it is already running and you want to restart it:

1. go to the terminal where it is running
2. press `Ctrl + C`
3. run:

```powershell
npm run dev:web
```

## 17. When the link is down

If the office link stops working:

1. check whether the host PC is on
2. make sure the host PC is still connected to the office network
3. restart the API
4. restart the web app
5. try again using:
   - [https://192.168.42.38:4400](https://192.168.42.38:4400)

If the page opens but data does not load, the API is usually the part that needs attention.

## 18. Backing up the database

The most important backup is the database backup.

Why:

- the code can be copied again
- the working data lives in the database

### Simple database backup approach

Use PostgreSQL backup tools to create a dump file.

Example:

```powershell
pg_dump "postgres://postgres:postgres@127.0.0.1:5432/scholarship_operations_platform" > ssfs-backup.sql
```

Do this:

- before major imports
- before risky cleanup
- before updates
- at regular intervals

Best practice:

- keep dated backup files
- store a copy somewhere else, not only on the host PC

Example naming:

- `ssfs-backup-2026-04-23.sql`

## 19. Backing up the code

Keep a separate copy of the code outside the host PC workflow.

Best options:

- private GitHub repository
- private GitLab repository
- copied project folder on an external drive or another PC

At minimum, keep a copy of:

- the full project folder
- `.env.local`
- local certificates if still in use

Important:

- code backup is not enough without database backup

## 20. Safe change management

If changes are made later:

- back up the database first
- keep a copy of the project folder
- restart the API after `.env.local` changes
- test the main link after restart
- test login
- test one report export

## 21. Common difficulties and what they mean

### “Not Secure” in the browser

This usually means one of these:

- the certificate was not installed on that PC
- the app was opened with `http://` instead of `https://`
- the certificate name does not match the link used

Use:

- [https://192.168.42.38:4400](https://192.168.42.38:4400)

### “Route not found” during login

Usually means:

- the API is running an older process

Fix:

- restart the API

### Bootstrap password changed in `.env.local` but login still fails

This usually means:

- the account already existed in the database
- `.env.local` does not automatically overwrite an existing password

Fix:

- use `Reset password` in the app
- or remove and recreate the bootstrap account carefully

### Page opens but data is missing

Usually means:

- the API is down
- or the app cannot reach the API

Fix:

- restart the API

### You are locked out after removing accounts

The system protects the last active admin account, so this should not happen through normal use.

If access is still lost:

- check the bootstrap admin settings in `.env.local`
- restart the API

## 22. Recommended operating routine

At the start of the day:

1. make sure the host PC is on
2. make sure the API is running
3. make sure the web app is running
4. open the system
5. sign in

Before big imports:

1. back up the database
2. confirm import fields
3. preview first
4. import only after checking issues

After big imports:

1. review the saved records
2. check the Dashboard
3. check Reports if needed

## 23. Important files for the host/admin

These are useful when maintaining the system:

- [\.env.local](C:\Users\Lenovo\Documents\Code%20Space\student-verification-suite\scholarship-operations-platform-new\.env.local)
- the current TLS certificate and key delivered through your secure admin process
- [templates/diagnostics/production-readiness-closeout.md](C:\Users\Lenovo\Documents\Code%20Space\student-verification-suite\scholarship-operations-platform-new\templates\diagnostics\production-readiness-closeout.md)

## 24. Final note

This system is designed so staff can operate it without needing to understand the technical internals.

The safest habits are:

- preview before import
- use the correct HTTPS link
- keep backups
- restart the API after environment changes
- keep at least one active admin
