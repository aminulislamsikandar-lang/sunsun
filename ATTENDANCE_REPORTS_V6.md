# Attendance Reports V6

Added:
- Admin attendance report API
- Daily/monthly date filters
- Class and section filters
- Student filter
- Summary totals and attendance percentage
- Class-wise summary
- Detailed records
- CSV export
- Print view
- `client/src/AttendanceReports.jsx`
- `client/src/attendance-reports.css`

UI path intended: `/admin/attendance`.

The existing App.jsx is intentionally not overwritten. Add:
`import AttendanceReports from "./AttendanceReports.jsx";`
and route `/admin/attendance` to `<AttendanceReports />` in the existing admin router/path switch.
