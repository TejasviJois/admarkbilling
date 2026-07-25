-- Allow follow-up reminders (e.g. "call client after Aug 3") on the calendar table.
alter table admark.calendar drop constraint if exists calendar_calendar_type_check;
alter table admark.calendar
  add constraint calendar_calendar_type_check
  check (calendar_type in ('meeting', 'call', 'reminder'));
