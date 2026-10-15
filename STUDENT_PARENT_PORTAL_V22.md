# Student & Parent Portal V22

Cost policy:
- ₹0 mandatory software cost
- No paid authentication provider
- No paid API
- No paid hosting requirement
- Uses existing Express + SQLite/sql.js + React stack

Added:
- Student/Parent portal authentication
- Password hashing with existing bcrypt dependency
- 7-day JWT portal sessions
- Admin portal-user management
- Student/parent role
- Student linking
- Portal dashboard
- Attendance view
- Published exam results view
- Fee balance and payment history API
- School notices
- Official issued documents list
- Admin portal notices
- Admin portal-user status/password management

New database tables:
- portal_users
- portal_notices

New UI:
- client/src/Portal.jsx
- client/src/portal.css

Intended route:
- `/portal`

Admin APIs:
- `/api/admin/portal-users`
- `/api/admin/portal-notices`

Portal APIs:
- `/api/portal/login`
- `/api/portal/dashboard`
- `/api/portal/attendance`
- `/api/portal/results`
- `/api/portal/fees`
- `/api/portal/notices`
- `/api/portal/documents`

Existing V21 data is preserved.
