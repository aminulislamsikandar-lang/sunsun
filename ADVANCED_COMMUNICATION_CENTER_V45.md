# Advanced Communication & Notification Center V45

Cost policy:
- ₹0 mandatory software cost
- Existing local Express + SQLite/sql.js + React
- No paid SMS, email, push, or communication SaaS is required

Features:
- Central communication campaigns
- Target all students + parents
- Target a class/section
- Priority levels
- Draft/publish/cancel campaigns
- Delivery tracking
- Read tracking
- Communication analytics
- Message templates
- Communication preferences
- Parent inbox
- Student inbox
- Central audit log

New tables:
- communication_campaigns
- communication_recipients
- communication_templates
- communication_preferences
- communication_audit_log

New UI:
- client/src/CommunicationCenter.jsx
- client/src/communication.css

Intended admin route:
- `/admin/communication`

Existing V44 data is preserved.
