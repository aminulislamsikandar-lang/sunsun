# Advanced Student Performance & Analytics V39

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid analytics SaaS

Features:
- Student academic profile
- Published exam history
- Exam-to-exam comparison
- Attendance vs performance
- Subject-wise latest performance
- Improvement detection
- Performance decline detection
- Attendance risk detection
- Fail-risk detection
- Weak-subject detection
- At-risk student list
- Class performance endpoint
- Performance snapshots
- Performance goals
- Goal updates
- Teacher performance view API
- Performance audit log

New tables:
- performance_snapshots
- performance_insights
- performance_goals
- performance_audit_log

New UI:
- client/src/PerformanceAnalytics.jsx
- client/src/performance.css

Intended admin route:
- `/admin/performance`

Teacher endpoint:
- `GET /api/teacher/performance/student/:id`

Existing V38 data is preserved.
