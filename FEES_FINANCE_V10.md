# Fees & Finance V10

Added:
- Fee structures
- Student fee assignments
- Discounts
- Due dates
- Payment recording
- Auto-generated receipt numbers
- Payment methods
- Transaction/reference field
- Outstanding balance
- Finance dashboard totals
- Student fee statement API
- Parent fee API
- `FinanceManagement.jsx`
- `finance.css`

Intended admin route: `/admin/fees`
Parent endpoint: `/api/parent/fees`

Admin APIs:
- GET/POST/PATCH/DELETE `/api/admin/fees/structures`
- GET `/api/admin/fees/students`
- GET/POST `/api/admin/fees/assignments`
- GET/POST `/api/admin/fees/payments`
- GET `/api/admin/fees/dashboard`
- GET `/api/admin/fees/students/:id/statement`

Existing V9 data is preserved. New finance tables are created automatically.
