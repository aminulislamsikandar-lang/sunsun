# Homework & Assignments V11

Added:
- Teacher homework creation
- Class/section/subject assignment
- Due dates
- Maximum marks
- Student submission
- Submission status
- Teacher review/marks/feedback API
- Parent homework visibility
- Admin homework directory
- `TeacherHomework.jsx`
- `StudentHomework.jsx`
- `ParentHomework.jsx`
- `homework.css`

Server endpoints:
Admin:
- GET/POST/PATCH/DELETE `/api/admin/homework`
Teacher:
- GET/POST `/api/teacher/homework`
- GET `/api/teacher/homework/:id/submissions`
- PATCH `/api/teacher/homework/:homeworkId/submissions/:studentId`
Student:
- GET `/api/student/homework`
- POST `/api/student/homework/:id/submit`
Parent:
- GET `/api/parent/homework`

New tables:
- homework
- homework_submissions

Intended routes:
- `/teacher/homework`
- `/student/homework`
- `/parent/homework`

Existing V10 data is preserved.
