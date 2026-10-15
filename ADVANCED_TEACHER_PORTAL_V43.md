# Advanced Teacher Portal & Classroom Management V43

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid teacher SaaS

Features:
- Teacher dashboard
- Teacher class/subject assignments
- Class roster
- Student access restricted to assigned classes
- Daily bulk attendance
- Attendance statuses
- Marks entry API
- Homework assignment
- Automatic parent homework notifications
- Student notes
- Student performance view
- Class announcements
- Parent announcements
- Teacher audit log

New tables:
- teacher_class_assignments
- teacher_student_notes
- teacher_homework
- teacher_announcements
- teacher_audit_log

New UI:
- client/src/TeacherPortal.jsx
- client/src/teacher.css

Intended teacher route:
- `/teacher`

Existing V42 data is preserved.
