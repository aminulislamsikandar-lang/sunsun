# Advanced Admission & Enrollment V36

Cost policy:
- ₹0 mandatory software cost
- No paid admission SaaS
- No paid application gateway
- Existing local Express + SQLite/sql.js + React

Features:
- Admission sessions
- Academic-year admissions
- Open/closed session
- Application fee field
- Public application submission API
- Unique application number
- Application tracking
- Application pipeline
- Under review / shortlisted / approved / waitlisted / rejected / withdrawn
- Document checklist
- Document verification
- Follow-up/CRM notes
- Next follow-up date
- Application audit log
- Student enrollment conversion
- Automatic student record creation
- Roll number and section during enrollment
- Admin admission dashboard

New tables:
- admission_sessions
- admission_applications
- admission_documents
- admission_followups
- admission_enrollments
- admission_audit_log

New UI:
- client/src/AdmissionsCenter.jsx
- client/src/admissions.css

Intended admin route:
- `/admin/admissions`

Public application endpoints:
- `POST /api/admissions/apply`
- `GET /api/admissions/application/:applicationNo`

Existing V35 data is preserved.
