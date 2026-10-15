# Teacher Management Upgrade

This upgrade adds an admin-side Teacher Accounts manager on top of the existing Teacher Portal + Attendance system.

## Admin → Teacher Accounts

- Search teachers by name, employee ID, email, or subject
- See total/active/inactive teacher counts
- Create teacher accounts
- Edit teacher account details
- Change a teacher password from the edit dialog
- Activate/deactivate teacher accounts
- Delete teacher accounts
- Select a teacher and manage class/section/subject assignments
- Add and remove multiple class assignments
- Assignments are used by the existing teacher authorization checks, so teachers can only access assigned classes/subjects

## Existing backend APIs used

- `GET /api/admin/teachers`
- `POST /api/admin/teachers`
- `PATCH /api/admin/teachers/:id`
- `DELETE /api/admin/teachers/:id`
- `GET /api/admin/teachers/:id/classes`
- `POST /api/admin/teachers/:id/classes`
- `DELETE /api/admin/teachers/classes/:assignmentId`

The existing server already contained these endpoints and teacher/attendance tables; this upgrade focuses on making them usable through the Admin UI.
