# Advanced Examination & Assessment System V27

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid examination SaaS
- No external result API

Features:
- Exam planner
- Exam types
- Academic year
- Class / section targeting
- Exam subjects
- Maximum marks
- Pass marks
- Subject date/time
- Teacher assignment field
- Theory / practical / internal / grace marks
- Present / absent status
- Bulk marks API
- Automatic totals
- Automatic percentage
- Grade scale
- Pass/fail calculation
- Class rank
- Result generation
- Result publish
- Result lock
- Result audit log
- Printable-report-card-ready API
- Student result portal API

New tables:
- exams
- exam_subjects
- exam_marks
- exam_results
- exam_grade_scales
- exam_audit_log

New UI:
- client/src/ExaminationCenter.jsx
- client/src/examination.css

Intended admin route:
- `/admin/examinations`

Existing V26 data is preserved.
