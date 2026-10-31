import { conversionDateError, isRealCalendarDay, latestServerDay, localToday } from "../dates";

test("isRealCalendarDay rejects shapes and days that do not exist", () => {
  expect(isRealCalendarDay("2026-02-28")).toBe(true);
  expect(isRealCalendarDay("2028-02-29")).toBe(true);
  expect(isRealCalendarDay("2026-02-29")).toBe(false);
  expect(isRealCalendarDay("2026-02-31")).toBe(false);
  expect(isRealCalendarDay("2026-06-31")).toBe(false);
  expect(isRealCalendarDay("26-06-01")).toBe(false);
  expect(isRealCalendarDay(null)).toBe(false);
});

test("the form's check and the server's check agree", () => {
  const now = new Date(2026, 9, 31, 12, 0, 0); // local noon, 31 Oct 2026
  expect(localToday(now)).toBe("2026-10-31");
  expect(conversionDateError("2026-10-31", localToday(now))).toBeNull();
  expect(conversionDateError("2026-11-01", localToday(now))).toMatch(/in the future/);
  expect(conversionDateError("2026-02-31", localToday(now))).toMatch(/not a real calendar date/);
  expect(latestServerDay(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11-01");
});
