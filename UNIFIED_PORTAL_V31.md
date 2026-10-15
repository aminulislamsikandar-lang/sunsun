# Unified School ERP Portal & Dashboard V31

Cost policy:
- ₹0 mandatory software cost
- Uses existing local Express + SQLite/sql.js + React
- No paid notification service
- No paid dashboard SaaS

Features:
- Unified admin dashboard
- Student/staff/fee/library/hostel/exam/attendance KPIs
- Module quick links
- School announcements
- Audience targeting
- Priority levels
- Student notification inbox
- Student dashboard aggregation
- Student fee summary
- Student result summary
- Student library overdue summary
- Student attendance summary
- Student announcements
- Student notifications
- Read notification endpoint
- Admin-to-student notification endpoint

New tables:
- portal_notifications
- portal_announcements
- portal_documents

New UI:
- client/src/UnifiedPortalDashboard.jsx
- client/src/portal.css

Intended admin route:
- `/admin/portal`

Existing V30 data is preserved.
