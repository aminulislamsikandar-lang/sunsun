# Advanced Hostel Management System V41

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid hostel SaaS

Features:
- Hostel buildings
- Gender policies
- Floors
- Rooms
- Room types
- Capacity
- Beds
- Bed availability
- Wardens
- Student allocation
- Checkout
- Hostel attendance
- Leave requests and approval
- Visitor register
- Complaints
- Maintenance tickets
- Hostel fees
- Monthly fee generation
- Outstanding hostel dues
- Occupancy analytics
- Attendance reports
- Complaint/maintenance reports
- Audit log

New tables:
- hostel_buildings
- hostel_floors
- hostel_rooms
- hostel_beds
- hostel_wardens
- hostel_allocations
- hostel_attendance
- hostel_leaves
- hostel_visitors
- hostel_complaints
- hostel_maintenance
- hostel_fees
- hostel_audit_log

New UI:
- client/src/HostelCenter.jsx
- client/src/hostel.css

Intended admin route:
- `/admin/hostel`

Existing V40 data is preserved.
