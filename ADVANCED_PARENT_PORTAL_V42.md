# Advanced Parent / Guardian Portal V42

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid communication SaaS

Features:
- Parent accounts
- Secure parent login
- Multiple children per parent
- Student linking
- Parent dashboard
- Attendance view
- Published result view
- Fee status
- Hostel status
- Library borrowing status
- Homework
- School calendar
- Notifications
- Parent-to-school messages
- Parent complaints/support
- Admin notifications
- Admin homework assignment
- Complaint management
- Parent audit log

New tables:
- parent_accounts
- parent_student_links
- parent_messages
- parent_notifications
- parent_homework
- parent_calendar_events
- parent_complaints
- parent_audit_log

New UI:
- client/src/ParentPortal.jsx
- client/src/parent.css

Intended parent route:
- `/parent`

Existing V41 data is preserved.
