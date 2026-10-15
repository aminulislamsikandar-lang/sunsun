# Complete Teacher Portal V23

Cost policy:
- ₹0 mandatory software cost
- No paid API
- No paid authentication provider
- Uses existing local Express + SQLite/sql.js + React stack

Added:
- Teacher login
- Teacher role
- Teacher profile
- Employee ID
- Qualification/designation
- Teacher class/subject assignments
- Assignment-restricted access
- Teacher dashboard
- Class student directory
- Daily attendance
- Attendance status controls
- Subject-specific marks endpoint
- Homework creation
- Homework submission tracking endpoint
- Teacher feedback endpoint
- Admin teacher creation
- Admin teacher listing
- Admin assignment creation

New database tables:
- teacher_profiles
- teacher_assignments
- homework
- homework_submissions

New UI:
- client/src/TeacherPortal.jsx
- client/src/teacher.css

Intended route:
- `/teacher`

Admin APIs:
- `/api/admin/teachers`
- `/api/admin/teacher-assignments`

Teacher APIs:
- `/api/teacher/login`
- `/api/teacher/dashboard`
- `/api/teacher/classes`
- `/api/teacher/classes/:assignmentId/students`
- `/api/teacher/attendance`
- `/api/teacher/marks`
- `/api/teacher/homework`
- `/api/teacher/homework/:id/submissions`

Existing V22 data is preserved.
