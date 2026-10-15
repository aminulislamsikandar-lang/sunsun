# Examination & Marks V8

Added:
- Examinations
- Exam subjects by class/section
- Maximum/pass marks
- Exam dates
- Teacher-only marks entry for assigned class/subject
- Marks validation
- Grade rules
- Student report-card API
- Parent exam discovery API
- `ExaminationManagement.jsx`
- `TeacherMarks.jsx`
- `ReportCard.jsx`

Intended admin UI:
`/admin/examinations`

Intended teacher UI:
`/teacher/marks`

Admin API:
- GET/POST/PATCH/DELETE `/api/admin/examinations`
- GET/POST `/api/admin/examinations/:id/subjects`
- DELETE `/api/admin/exam-subjects/:id`
- GET `/api/admin/students/:studentId/report-card?exam_id=...`

Teacher API:
- GET `/api/teacher/exams`
- GET `/api/teacher/exams/:examId/subjects`
- GET `/api/teacher/exam-subjects/:id/students`
- POST `/api/teacher/exam-subjects/:id/marks`

Parent API:
- GET `/api/parent/exams`

Existing V7 data is preserved. New examination tables are created automatically.
