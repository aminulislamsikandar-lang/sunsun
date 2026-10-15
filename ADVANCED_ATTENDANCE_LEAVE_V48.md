# Advanced Attendance & Leave Management V48

Library management intentionally skipped.

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid attendance/notification SaaS

Features:
- Centralized student attendance
- Teacher attendance
- Bulk attendance
- Present/Absent/Late/Half-day/Leave
- Monthly attendance summaries
- Attendance percentage
- Monthly attendance lock/unlock
- Attendance audit
- Low attendance alerts
- Student notifications
- Parent notifications
- Leave types
- Student leave requests
- Admin leave approval/rejection
- Approved leave automatically reflected in attendance
- Attendance settings
- Class-wise attendance summary API
- Student attendance history API

New tables:
- leave_types_v48
- leave_requests_v48
- attendance_records_v48
- attendance_monthly_lock_v48
- attendance_audit_v48
- attendance_alerts_v48
- teacher_attendance_v48
- attendance_settings_v48

New UI:
- client/src/AttendanceLeaveCenter.jsx
- client/src/attendance-leave.css

Intended admin route:
- `/admin/attendance/leave`

Existing V47 data is preserved.
