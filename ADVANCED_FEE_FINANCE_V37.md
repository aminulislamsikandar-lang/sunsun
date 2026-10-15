# Advanced Fee & Finance Management V37

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid payment gateway required

Features:
- Fee structures
- Class-wise structures
- Academic year
- Frequency and due day
- Fee structure line items
- Student fee assignments
- Discounts: percentage/fixed
- Scholarships
- Concessions
- Invoice generation
- Automatic invoice numbers
- Invoice line items
- Partial payments
- Payment validation against balance
- Receipt numbers
- Payment methods: cash/bank transfer/UPI/cheque/other
- Outstanding balance
- Paid/partial/unpaid status
- Overdue invoice report
- Defaulter report
- Daily/monthly collection query
- Finance dashboard
- Finance audit log

New tables:
- fee_structures
- fee_structure_items
- student_fee_assignments
- fee_invoices
- fee_invoice_items
- fee_payments
- fee_scholarships
- fee_audit_log

New UI:
- client/src/FinanceCenter.jsx
- client/src/finance.css

Intended admin route:
- `/admin/finance`

Existing V36 data is preserved.
