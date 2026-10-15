# Advanced Parent Portal & Family Workstation V33

Cost policy:
- ₹0 mandatory software cost
- No paid parent portal SaaS
- No paid messaging gateway
- Existing local Express + SQLite/sql.js + React

Features:
- Parent profile
- Parent code
- Multiple children
- Parent-child relationships
- Primary child
- Child selector
- Child profile
- Attendance summary and history
- Results summary
- Published report cards API
- Fee summary
- Invoice and payment history
- Homework
- Overdue library count
- Parent notifications
- Read/unread notifications
- School announcements
- Parent school requests
- Request approval workflow
- Parent messages API
- Admin parent management
- Parent-child linking
- Parent audit log

New tables:
- parent_profiles
- parent_student_links
- parent_messages
- parent_requests
- parent_audit_log

New UI:
- client/src/ParentPortal.jsx
- client/src/parent.css

Intended route:
- `/parent`

Important:
- Existing authentication must issue a JWT with role `parent` and parent/user identifier.
- Parent-child links must be configured by admin before child data is exposed.
- Existing V32 data is preserved.
