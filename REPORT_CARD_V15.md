# Report Card & Performance V15

Added a complete result/report-card system.

Admin:
- Create report cards
- Add unlimited subjects
- Max marks and obtained marks
- Automatic subject percentage
- Automatic overall percentage
- Automatic grade
- Automatic Pass/Fail
- Rank
- Attendance percentage
- Remarks
- Draft/published state
- Publish result
- Delete result
- Filter by academic year, term and exam

Student:
- Published report cards
- Subject-wise marks
- Overall percentage
- Grade
- Pass/Fail
- Rank
- Remarks

Parent:
- Published report cards for linked students
- Subject-wise performance
- Overall percentage
- Grade
- Pass/Fail
- Rank

Teacher:
- Read-only report-card listing API for academic year/term.

Default grading:
90+ A+
80-89.99 A
70-79.99 B+
60-69.99 B
50-59.99 C
40-49.99 D
below 40 F

Overall Pass requires overall percentage >= 33 and no subject marked Fail.

New database tables:
- report_cards
- report_card_subjects

New UI:
- client/src/ReportCardManagement.jsx
- client/src/StudentReportCards.jsx
- client/src/ParentReportCards.jsx
- client/src/report-card.css

Intended routes:
- `/admin/report-cards`
- `/student/report-cards`
- `/parent/report-cards`

Existing V14 data is preserved.
