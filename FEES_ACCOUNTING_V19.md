# Advanced Fees & Accounting V19

Added:
- Fee structure management
- Class/academic-year fee setup
- Tuition, admission, exam, library, hostel, activity and other fee categories
- Annual/monthly/quarterly/one-time frequency
- Automatic fee generation for a class
- Student fee ledger
- Due/partial/paid status
- Payment collection
- Cash/UPI/bank/card/cheque methods
- Receipt number generation
- Transaction reference
- Discounts/scholarships
- Expense and income transactions
- Finance dashboard
- Outstanding balance
- Students with dues
- Net income calculation

New database tables:
- fee_structures
- student_fee_charges
- fee_payments
- fee_discounts
- finance_transactions

New UI:
- client/src/FeesAccounting.jsx
- client/src/fees.css

Intended route:
- `/admin/fees`

Existing V18 data is preserved.
