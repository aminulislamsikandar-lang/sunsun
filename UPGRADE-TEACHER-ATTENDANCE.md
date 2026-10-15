# Teacher + Attendance Upgrade

## Teacher portal
- URL: `/teacher`
- Demo login: `teacher@adarsha.edu.in`
- Demo password: `Teacher@12345`
- Teacher JWT uses a separate audience from admin JWT.
- Teachers can only access assigned classes/subjects.

## Attendance
- Daily date selection
- Class/section/subject selection
- Roll number, admission number and student name
- Present / Absent / Late / Leave
- Optional remarks
- Mark all present/absent
- Save and update attendance
- Attendance history summary

## Admin
- New `Teacher Accounts` section
- Create/edit/delete teacher accounts
- Assign classes/sections/subjects through API
- Student records now support `roll_no`
- Admin attendance summary API is available

## Important
This upgrade preserves the existing admin authentication and Windows-safe sql.js WASM path. Before production, change all development credentials/secrets and configure a production database and JWT secret.
