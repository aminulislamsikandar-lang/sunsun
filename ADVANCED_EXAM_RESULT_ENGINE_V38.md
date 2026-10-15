# Advanced Examination & Result Engine V38

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid examination SaaS

Features:
- Exam creation
- Exam types
- Academic year
- Class/section scope
- Subject setup
- Theory/practical/internal marks
- Grace marks
- Pass percentage
- Grade rules
- Division rules
- Automatic percentage
- Automatic grade
- Subject pass/fail
- Overall pass/fail
- Rank calculation
- Result recalculation
- Result locking
- Result publishing
- Published student result API
- Class analytics
- Grade distribution
- Subject performance statistics
- Audit log

New tables:
- exam_rules
- advanced_exams
- advanced_exam_subjects
- advanced_exam_marks
- advanced_exam_results
- advanced_exam_audit

New UI:
- client/src/ExamEngine.jsx
- client/src/exam.css

Intended admin route:
- `/admin/exams`

Student result endpoint:
- `GET /api/student/exams/:id/result`

Existing V37 data is preserved.
