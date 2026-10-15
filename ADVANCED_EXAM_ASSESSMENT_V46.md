# Advanced Exam & Assessment Management V46

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid exam/assessment SaaS

Features:
- Exam planner and schedules
- Paper date/time/room/invigilator
- Maximum marks and pass marks
- Marks update audit trail
- Result lock/unlock
- Mandatory lock before publish
- Result publishing
- Student notifications on publish
- Result correction requests
- Correction approval/rejection
- Overall ranking API
- Subject ranking/average API
- Configurable grading rule sets
- Admin assessment dashboard

New tables:
- exam_schedules_v46
- exam_mark_audit_v46
- result_locks_v46
- result_corrections_v46
- grading_rules_v46

New UI:
- client/src/ExamAssessmentCenter.jsx
- client/src/exam-assessment.css

Intended admin route:
- `/admin/exams/assessment`

Existing V45 data is preserved.
