# Advanced Fees & Finance Management System V29

Cost policy:
- ₹0 mandatory software cost
- No payment gateway required
- Cash/manual payment recording works without paid services
- Browser Print can be used for receipts
- Existing local Express + SQLite/sql.js + React

Features:
- Fee structures
- Academic year
- Class targeting
- Fee components
- Mandatory/optional component field
- Frequency
- Due dates
- Late fine per day field
- Student fee assignment
- Percentage/fixed discounts
- Scholarships
- Custom total
- Invoice generation
- Invoice number
- Due/overdue/partial/paid status
- Partial payment
- Payment method
- Transaction reference
- Receipt number
- Payment history
- Student fee portal
- Collection dashboard
- Daily collection
- Collection by payment method
- Defaulters report
- Audit log

New tables:
- fee_structures
- fee_components
- student_fee_assignments
- fee_invoices
- fee_invoice_items
- fee_payments
- fee_discounts
- fee_audit_log

New UI:
- client/src/FeesFinanceCenter.jsx
- client/src/fees.css

Intended admin route:
- `/admin/fees`

Existing V28 data is preserved.
