# Advanced Fee & Finance Management V47

Library management is intentionally skipped.

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid payment gateway, SMS, email, or finance SaaS required

Features:
- Fee structures
- Class-wise fee plans
- Monthly/other frequency
- Due dates
- Late-fee rules
- Student fee assignments
- Fixed/percentage concessions
- Monthly invoice generation
- Unique invoice numbers
- Partial/full payments
- Receipt numbers
- Payment methods and transaction reference
- Refunds
- Outstanding dues
- Overdue calculation
- Late-fee recalculation
- Monthly collection reports
- Payment-method reports
- Class-wise financial reports
- Finance audit log

New tables:
- fee_structures_v47
- student_fee_assignments_v47
- fee_invoices_v47
- fee_payments_v47
- fee_concessions_v47
- fee_refunds_v47
- fee_finance_audit_v47

New UI:
- client/src/FeeFinanceCenter.jsx
- client/src/fee-finance.css

Intended admin route:
- `/admin/fees/finance`

Existing V46 data is preserved.
