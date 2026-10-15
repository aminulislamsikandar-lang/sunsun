# Academic Management V7

Added centralized academic structure:
- Classes
- Sections
- Subjects
- Class teacher assignment
- Teacher subject/class assignment
- Teacher assigned academic classes endpoint

Admin UI:
- `client/src/AcademicManagement.jsx`
- `client/src/academic-management.css`

Intended UI path:
`/admin/academic`

The existing App routing is intentionally preserved. Add:
`import AcademicManagement from "./AcademicManagement.jsx";`
and route `/admin/academic` to `<AcademicManagement />`.

Server endpoints:
- GET/POST/PATCH/DELETE `/api/admin/academic/classes`
- GET/POST/PATCH/DELETE `/api/admin/academic/sections`
- GET/POST/PATCH/DELETE `/api/admin/academic/subjects`
- GET/POST/PATCH/DELETE `/api/admin/academic/assignments`
- GET `/api/teacher/academic/classes`

Existing database data is preserved; new academic tables are created automatically.
