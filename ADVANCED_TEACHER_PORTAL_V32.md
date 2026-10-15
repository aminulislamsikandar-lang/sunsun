# Advanced Teacher Portal & Workstation V32

Cost policy:
- ₹0 mandatory software cost
- Uses existing local Express + SQLite/sql.js + React
- No paid teacher SaaS
- No paid attendance/marks API

Features:
- Teacher authentication guard
- Teacher profile
- Assigned classes and subjects
- Class student list
- Daily attendance
- Bulk attendance
- Secure subject ownership checks for marks
- Exam marks API
- Homework creation
- Homework due dates
- Timetable
- Leave request
- Teacher student search
- Teacher audit log

New tables:
- teacher_profiles
- teacher_subject_assignments
- teacher_timetable
- teacher_homework
- teacher_leave_requests
- teacher_messages
- teacher_audit_log

New UI:
- client/src/TeacherWorkstation.jsx
- client/src/teacher.css

Intended route:
- `/teacher`

Important:
- Existing authentication must issue a JWT with role `teacher` and a teacher/employee identifier for the Teacher Workstation guard.
- Admin remains allowed through the same API guard for maintenance/testing.
- Existing V31 data is preserved.
