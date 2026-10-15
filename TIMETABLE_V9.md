# Timetable V9

Added weekly school routine management.

Admin:
- Create timetable entries
- Class/section
- Subject
- Teacher
- Day Monday-Saturday
- Period
- Room
- Filter by class/section
- Delete entries
- Default period schedule

Teacher:
- `/teacher/timetable`
- Personal weekly timetable

Parent:
- `/parent/timetable`
- Child's weekly timetable

Server endpoints:
- GET/POST `/api/admin/timetable`
- DELETE `/api/admin/timetable/:id`
- GET/POST `/api/admin/timetable/periods`
- GET `/api/teacher/timetable`
- GET `/api/parent/timetable`

New files:
- client/src/TimetableManagement.jsx
- client/src/TeacherTimetable.jsx
- client/src/ParentTimetable.jsx
- client/src/timetable.css

Intended admin route: `/admin/timetable`
