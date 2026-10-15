# Hostel Management V14

Transport was intentionally skipped.

Added:
- Hostel buildings/blocks
- Boys/Girls/Mixed hostel classification
- Warden details
- Hostel room management
- Room capacity and monthly fee
- Student hostel allocation
- Bed number
- Check-in/check-out
- Hostel attendance
- Hostel complaints/welfare
- Visitor records
- Hostel dashboard
- Student hostel portal
- Parent hostel portal

New database tables:
- hostel_buildings
- hostel_rooms
- hostel_allocations
- hostel_attendance
- hostel_complaints
- hostel_visitors

Admin APIs:
- `/api/admin/hostels`
- `/api/admin/hostels/:id/rooms`
- `/api/admin/hostel/allocations`
- `/api/admin/hostel/attendance`
- `/api/admin/hostel/complaints`
- `/api/admin/hostel/visitors`
- `/api/admin/hostel/dashboard`

Student:
- `/api/student/hostel`
- POST `/api/student/hostel/complaints`

Parent:
- `/api/parent/hostel`

New UI:
- `client/src/HostelManagement.jsx`
- `client/src/StudentHostel.jsx`
- `client/src/ParentHostel.jsx`
- `client/src/hostel.css`

Intended routes:
- `/admin/hostel`
- `/student/hostel`
- `/parent/hostel`

Existing V13 data is preserved.
