# V55 Data Integrity Checklist

- [ ] Run `/api/admin/system/v55/integrity`
- [ ] Duplicate admission numbers reviewed
- [ ] Duplicate emails reviewed
- [ ] Duplicate attendance reviewed
- [ ] Missing required student fields reviewed
- [ ] Orphan attendance reviewed
- [ ] Orphan fee records reviewed
- [ ] Orphan leave records reviewed
- [ ] Core tables report PASS
- [ ] Transaction test passes
- [ ] Backup exists before any cleanup
- [ ] Never delete suspicious records without reviewing the affected IDs and taking a backup
