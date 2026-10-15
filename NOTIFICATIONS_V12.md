# Notifications & Communication V12

Added:
- Central notification storage
- Admin announcement composer
- Audience targeting: everyone/admins/teachers/students/parents
- Normal/high/urgent priority
- Publish and expiry fields
- Announcement history
- Notification bell
- Unread count
- Mark one read
- Mark all read
- Automatic 30-second refresh

New database tables:
- notifications
- announcements

New UI:
- client/src/NotificationCenter.jsx
- client/src/NotificationsBell.jsx
- client/src/notifications.css

Intended admin route:
`/admin/notifications`

Notification APIs:
- GET `/api/admin/notifications`
- PATCH `/api/admin/notifications/:id/read`
- POST `/api/admin/notifications/read-all`
- GET `/api/teacher/notifications`
- GET `/api/student/notifications`
- GET `/api/parent/notifications`

Announcement APIs:
- GET/POST `/api/admin/announcements`
- DELETE `/api/admin/announcements/:id`

Add `<NotificationsBell role="admin" />` to admin header.
Use role="teacher", role="student", or role="parent" in the corresponding portal headers.

Existing V11 data is preserved.
