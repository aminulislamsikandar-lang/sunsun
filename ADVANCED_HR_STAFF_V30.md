# Advanced HR & Staff Management System V30

Cost policy:
- ₹0 mandatory software cost
- No paid HR SaaS
- No external payroll API
- Existing local Express + SQLite/sql.js + React

Features:
- Departments
- Designations
- Employee profiles
- Employee code
- Contact details
- Joining / exit
- Employment type
- Qualification
- Experience
- Emergency contact
- Staff documents
- Leave types
- Leave requests
- Leave approval/rejection
- Staff attendance
- Check-in / check-out
- Attendance remarks
- Salary structures
- Basic + HRA + allowances + deductions
- Gross/net salary calculation
- Monthly payroll generation
- Payroll payment
- Payslip number
- Performance reviews
- Rating categories
- HR audit log
- HR dashboard

New tables:
- hr_departments
- hr_designations
- hr_employees
- hr_documents
- hr_leave_types
- hr_leave_requests
- hr_attendance
- hr_salary_structures
- hr_payroll
- hr_performance
- hr_audit_log

New UI:
- client/src/HRStaffCenter.jsx
- client/src/hr.css

Intended admin route:
- `/admin/hr`

Existing V29 data is preserved.
