# Events & Calendar V13

Added:
- School events calendar
- Holidays
- Exams
- Meetings
- Competitions
- Admissions events
- Activities
- Start/end date and time
- Location
- Audience targeting
- Priority
- Admin event CRUD
- Teacher calendar API
- Student calendar API
- Parent calendar API
- Public event API

New database table:
- school_events

New UI:
- client/src/CalendarEvents.jsx
- client/src/CalendarView.jsx
- client/src/calendar.css

Intended routes:
- `/admin/calendar`
- `/teacher/calendar`
- `/student/calendar`
- `/parent/calendar`

Admin API:
- GET/POST `/api/admin/events`
- PATCH/DELETE `/api/admin/events/:id`

Portal APIs:
- GET `/api/teacher/events`
- GET `/api/student/events`
- GET `/api/parent/events`
- GET `/api/events`

Existing V12 data is preserved.
