# Advanced Student Attendance V18

Added:
- Daily student roll call
- Present / Absent / Late / Leave / Half Day
- Check-in and check-out fields
- Bulk mark all present/absent
- Date-based attendance
- Student attendance records
- Monthly/date-range attendance summary
- Automatic attendance percentage
- Attendance analytics
- Student leave requests
- Admin leave approval/rejection
- Student attendance API

New database tables:
- student_attendance
- student_leave_requests

New UI:
- client/src/StudentAttendance.jsx
- client/src/AttendanceReports.jsx
- client/src/attendance.css

Intended routes:
- `/admin/student-attendance`
- `/admin/attendance-reports`

Existing V17 data is preserved.
