# V54 — Complete QA & Production Readiness Gate

V54 does not add a new business module. It adds a final QA gate over the existing system.

## Automated server QA

Start the backend, then:

- `GET /api/system/v54/readiness`
- `GET /api/admin/system/v54/qa`

The checks cover database connectivity and core existing tables.

## Manual role matrix

### Admin
- Login/logout
- Dashboard
- Student CRUD
- Teacher/staff CRUD
- Class/section management
- Attendance
- Leave approval
- Fees/invoices/payments
- Exams/marks
- Results/report card
- Hostel
- Notifications
- Reports/printing
- Backup/recovery
- Audit/system health

### Teacher
- Login/logout
- Own dashboard
- Assigned classes
- Student list
- Attendance
- Leave visibility/workflow
- Marks entry
- Homework
- Timetable

### Student
- Login/logout
- Profile
- Attendance
- Results
- Report card
- Homework
- Notifications
- Leave request
- Hostel information where applicable

### Parent
- Login/logout
- Linked children
- Attendance
- Results
- Fees
- Notifications
- Leave request/updates
- Profile

## UI checks
- Desktop 1920px
- Laptop 1366px
- Tablet
- Mobile 390px
- Loading state
- Empty state
- Error state
- Retry state
- Search
- Forms
- Modals
- Tables
- Print/PDF screens

## Release gate

Production release should happen only when:
1. `npm install` succeeds.
2. Frontend production build succeeds.
3. Backend starts cleanly.
4. V53 smoke test passes.
5. V54 readiness returns success with no production warnings.
6. Critical role workflows pass manually.
7. Backup creation and a restore test pass.
8. Real production environment uses HTTPS and a non-default JWT secret.

No paid dependency/service was added.
V53 is preserved in `UPGRADE_BACKUP_V53`.
