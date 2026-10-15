# Complete Examination Engine V20

Cost policy:
- No paid APIs
- No paid services
- No subscription dependency
- Uses existing local SQLite/sql.js + Express/React stack

Added:
- Exam creation
- Exam types
- Academic year/class
- Pass percentage
- Subject configuration
- Theory marks
- Practical marks
- Internal assessment
- Grace marks
- Pass marks
- Exam schedule fields
- Student-wise marks entry
- Bulk marks API
- Automatic subject percentage
- Automatic grade
- Subject pass/fail
- Automatic overall percentage
- Overall grade
- Overall pass/fail
- Rank calculation
- Result calculation
- Result publishing
- Result locking
- Draft/unpublished state

New database tables:
- exams
- exam_subjects
- exam_marks
- exam_results

New UI:
- client/src/ExaminationManagement.jsx
- client/src/exam.css

Intended route:
- `/admin/examinations`

Existing V19 data is preserved.
