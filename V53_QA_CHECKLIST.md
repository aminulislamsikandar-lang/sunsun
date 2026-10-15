# V53 QA Checklist

## Automated
- [ ] `node scripts/smoke-v53.mjs`
- [ ] public health returns expected status
- [ ] version endpoint reports V53
- [ ] admin login passes with test credentials
- [ ] authenticated reliability check passes

## Manual
- [ ] Admin login/logout
- [ ] Teacher login/logout
- [ ] Student login/logout
- [ ] Parent login/logout
- [ ] Student create/edit/search
- [ ] Teacher create/edit/search
- [ ] Attendance mark/edit/lock
- [ ] Leave request/approval
- [ ] Fees invoice/payment/receipt
- [ ] Exams/marks/report card
- [ ] Hostel workflows
- [ ] Notifications
- [ ] Backup creation/listing
- [ ] Mobile responsive check
- [ ] Browser refresh on major routes
- [ ] Empty/error/loading states

## Release gate
Do not label the build production-ready until automated smoke tests and the manual checklist pass on the actual deployment environment.
