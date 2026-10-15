# Complete Student Management V16

Added:
- Student directory with search
- Status filters
- Student statistics
- Complete personal profile
- DOB, gender, blood group, category, nationality
- Contact and address information
- Emergency contact
- Previous school
- Admission date
- House
- Student status
- Student documents
- Document verification
- Academic history
- Student promotion
- Promotion history
- Student profile API
- Student self profile UI

New database tables:
- student_profiles
- student_documents
- student_history
- student_promotions

Admin APIs:
- GET `/api/admin/students`
- GET `/api/admin/students/:id`
- POST `/api/admin/students/:id/profile`
- PATCH `/api/admin/students/:id/status`
- POST `/api/admin/students/:id/documents`
- PATCH/DELETE `/api/admin/student-documents/:id`
- GET/POST `/api/admin/students/:id/history`
- POST `/api/admin/students/:id/promote`
- GET `/api/admin/student-stats`

Student UI:
- `client/src/StudentManagement.jsx`
- `client/src/StudentProfile.jsx`
- `client/src/student-management.css`

Intended routes:
- `/admin/students`
- `/student/profile`

Existing V15 data is preserved.
