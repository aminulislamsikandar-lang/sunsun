# Advanced Academic Scheduler V35

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid timetable SaaS

Features:
- Period management
- Working-day calendar
- Room management
- Subject management
- Weekly timetable
- Class conflict detection
- Teacher conflict detection
- Room conflict detection
- Substitute teacher
- Holiday calendar
- Teacher advanced timetable API
- Academic-year scheduling
- Schedule edit/delete
- Schedule dashboard metrics

New tables:
- academic_periods
- academic_working_days
- academic_rooms
- academic_subjects
- academic_schedule
- academic_substitutions
- academic_holidays

New UI:
- client/src/AcademicScheduler.jsx
- client/src/scheduler.css

Intended admin route:
- `/admin/academic-scheduler`

Existing V34 data is preserved.
