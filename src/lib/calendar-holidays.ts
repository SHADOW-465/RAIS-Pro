// src/lib/calendar-holidays.ts
// Calendar synchronization and holiday recognition for timeline charts.
// Maps daily periods to real-world calendar metadata (weekday, Sunday weekly off,
// national and gazetted plant holidays, and breaks/no-production classification).

export interface CalendarDayInfo {
  /** True when the period represents a single calendar day (YYYY-MM-DD). */
  isDayGrain: boolean;
  dateIso?: string;
  year?: number;
  month?: number; // 1-12
  day?: number;   // 1-31
  dayOfWeek?: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  weekdayShort?: string; // "Sun", "Mon", etc.
  weekdayFull?: string;  // "Sunday", "Monday", etc.
  isSunday: boolean;
  isSaturday: boolean;
  isHoliday: boolean;
  holidayName: string | null;
  holidayType?: "national" | "festival" | "weekly_off" | "plant";
  formattedDate?: string; // e.g. "Thu, 15 Aug 2024"
}

export type DayProductionStatus =
  | "normal_production"
  | "holiday_off"
  | "holiday_working"
  | "unplanned_break";

export interface BreakRunInfo {
  startIndex: number;
  endIndex: number;
  runLength: number;
  startDateIso: string;
  endDateIso: string;
  startLabel: string;
  endLabel: string;
  includedHolidays: string[];
}

export interface CalendarPointContext extends CalendarDayInfo {
  status: DayProductionStatus;
  statusBadge: string;
  statusLabel: string;
  statusDescription: string;
  statusColor: string;
  breakInfo?: BreakRunInfo;
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Fixed recurring gazetted & industrial holidays (MM-DD). */
const FIXED_HOLIDAYS: Record<string, { name: string; type: "national" | "festival" }> = {
  "01-01": { name: "New Year's Day", type: "festival" },
  "01-26": { name: "Republic Day", type: "national" },
  "05-01": { name: "Labour Day / May Day", type: "national" },
  "08-15": { name: "Independence Day", type: "national" },
  "10-02": { name: "Gandhi Jayanti", type: "national" },
  "12-25": { name: "Christmas Day", type: "festival" },
};

/** Calendar dates for variable festivals (2023–2027) for Indian manufacturing plants. */
const VARIABLE_HOLIDAYS: Record<string, { name: string; type: "festival" | "national" }> = {
  // 2023
  "2023-01-26": { name: "Republic Day", type: "national" },
  "2023-03-08": { name: "Holi", type: "festival" },
  "2023-04-07": { name: "Good Friday", type: "festival" },
  "2023-04-22": { name: "Eid al-Fitr", type: "festival" },
  "2023-05-01": { name: "May Day", type: "national" },
  "2023-06-29": { name: "Eid al-Adha", type: "festival" },
  "2023-08-15": { name: "Independence Day", type: "national" },
  "2023-08-30": { name: "Raksha Bandhan", type: "festival" },
  "2023-09-07": { name: "Janmashtami", type: "festival" },
  "2023-10-02": { name: "Gandhi Jayanti", type: "national" },
  "2023-10-24": { name: "Dussehra", type: "festival" },
  "2023-11-12": { name: "Diwali", type: "festival" },
  "2023-11-13": { name: "Govardhan Puja", type: "festival" },
  "2023-11-27": { name: "Guru Nanak Jayanti", type: "festival" },

  // 2024
  "2024-01-26": { name: "Republic Day", type: "national" },
  "2024-03-25": { name: "Holi", type: "festival" },
  "2024-03-29": { name: "Good Friday", type: "festival" },
  "2024-04-11": { name: "Eid al-Fitr", type: "festival" },
  "2024-04-17": { name: "Ram Navami", type: "festival" },
  "2024-05-01": { name: "May Day", type: "national" },
  "2024-06-17": { name: "Eid al-Adha", type: "festival" },
  "2024-08-15": { name: "Independence Day", type: "national" },
  "2024-08-19": { name: "Raksha Bandhan", type: "festival" },
  "2024-08-26": { name: "Janmashtami", type: "festival" },
  "2024-10-02": { name: "Gandhi Jayanti", type: "national" },
  "2024-10-12": { name: "Dussehra", type: "festival" },
  "2024-10-31": { name: "Diwali", type: "festival" },
  "2024-11-01": { name: "Govardhan Puja", type: "festival" },
  "2024-11-15": { name: "Guru Nanak Jayanti", type: "festival" },

  // 2025
  "2025-01-26": { name: "Republic Day", type: "national" },
  "2025-03-14": { name: "Holi", type: "festival" },
  "2025-03-31": { name: "Eid al-Fitr", type: "festival" },
  "2025-04-06": { name: "Ram Navami", type: "festival" },
  "2025-04-18": { name: "Good Friday", type: "festival" },
  "2025-05-01": { name: "May Day", type: "national" },
  "2025-06-07": { name: "Eid al-Adha", type: "festival" },
  "2025-08-09": { name: "Raksha Bandhan", type: "festival" },
  "2025-08-15": { name: "Independence Day", type: "national" },
  "2025-08-16": { name: "Janmashtami", type: "festival" },
  "2025-10-02": { name: "Gandhi Jayanti / Dussehra", type: "national" },
  "2025-10-20": { name: "Diwali", type: "festival" },
  "2025-10-21": { name: "Govardhan Puja", type: "festival" },
  "2025-11-05": { name: "Guru Nanak Jayanti", type: "festival" },

  // 2026
  "2026-01-26": { name: "Republic Day", type: "national" },
  "2026-03-04": { name: "Holi", type: "festival" },
  "2026-03-20": { name: "Eid al-Fitr", type: "festival" },
  "2026-03-27": { name: "Ram Navami", type: "festival" },
  "2026-04-03": { name: "Good Friday", type: "festival" },
  "2026-05-01": { name: "May Day", type: "national" },
  "2026-05-27": { name: "Eid al-Adha", type: "festival" },
  "2026-08-15": { name: "Independence Day", type: "national" },
  "2026-08-28": { name: "Raksha Bandhan", type: "festival" },
  "2026-09-04": { name: "Janmashtami", type: "festival" },
  "2026-10-02": { name: "Gandhi Jayanti", type: "national" },
  "2026-10-20": { name: "Dussehra", type: "festival" },
  "2026-11-08": { name: "Diwali", type: "festival" },
  "2026-11-09": { name: "Govardhan Puja", type: "festival" },
  "2026-11-24": { name: "Guru Nanak Jayanti", type: "festival" },

  // 2027
  "2027-01-26": { name: "Republic Day", type: "national" },
  "2027-03-22": { name: "Holi", type: "festival" },
  "2027-03-26": { name: "Good Friday", type: "festival" },
  "2027-05-01": { name: "May Day", type: "national" },
  "2027-08-15": { name: "Independence Day", type: "national" },
  "2027-10-02": { name: "Gandhi Jayanti", type: "national" },
  "2027-10-29": { name: "Diwali", type: "festival" },
};

const ISO_DAY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a date period into calendar components without timezone drift. */
export function parseCalendarDay(periodOrDate?: string): CalendarDayInfo {
  if (!periodOrDate) {
    return { isDayGrain: false, isSunday: false, isSaturday: false, isHoliday: false, holidayName: null };
  }

  const match = periodOrDate.trim().match(ISO_DAY_REGEX);
  if (!match) {
    return { isDayGrain: false, isSunday: false, isSaturday: false, isHoliday: false, holidayName: null };
  }

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  // Construct local date without UTC offset shifting
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();
  const weekdayShort = WEEKDAYS_SHORT[dayOfWeek];
  const weekdayFull = WEEKDAYS_FULL[dayOfWeek];
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;

  const mmDd = `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const iso = `${y}-${mmDd}`;

  // Check holiday tables
  let holidayName: string | null = null;
  let holidayType: "national" | "festival" | "weekly_off" | "plant" | undefined = undefined;

  const varH = VARIABLE_HOLIDAYS[iso];
  if (varH) {
    holidayName = varH.name;
    holidayType = varH.type;
  } else {
    const fixedH = FIXED_HOLIDAYS[mmDd];
    if (fixedH) {
      holidayName = fixedH.name;
      holidayType = fixedH.type;
    }
  }

  const isHoliday = !!holidayName;
  const formattedDate = `${weekdayShort}, ${String(d).padStart(2, "0")} ${MONTH_NAMES[m - 1]} ${y}`;

  return {
    isDayGrain: true,
    dateIso: iso,
    year: y,
    month: m,
    day: d,
    dayOfWeek,
    weekdayShort,
    weekdayFull,
    isSunday,
    isSaturday,
    isHoliday,
    holidayName,
    holidayType: holidayType ?? (isSunday ? "weekly_off" : undefined),
    formattedDate,
  };
}

export interface MinimalPoint {
  period?: string;
  label: string;
  value?: number;
  checked?: number;
  rejected?: number;
  noProduction?: boolean;
}

/**
 * Determines whether a point represents an active production shift with activity.
 * Handles both rate-series with checked/rejected counts and value-series (COPQ, defect counts).
 */
export function isPointLive(p: MinimalPoint): boolean {
  if (p.noProduction === true) return false;
  if (p.value != null && !Number.isFinite(p.value)) return false;

  const hasChecked = p.checked !== undefined;
  const hasRejected = p.rejected !== undefined;

  if (hasChecked || hasRejected) {
    return (p.checked ?? 0) > 0 || (p.rejected ?? 0) > 0 || (Number.isFinite(p.value) && (p.value ?? 0) > 0);
  }

  // If checked/rejected counts are omitted (e.g. COPQ trend, defect quantity count):
  if (p.value != null && Number.isFinite(p.value)) {
    return (p.value ?? 0) > 0;
  }

  return false;
}

/**
 * Pre-computes continuous break runs (consecutive days of no production).
 */
export function computeBreakRuns(points: MinimalPoint[]): Map<number, BreakRunInfo> {
  const breakMap = new Map<number, BreakRunInfo>();
  if (!points || points.length === 0) return breakMap;

  let currentRun: number[] = [];

  const finishRun = () => {
    if (currentRun.length === 0) return;
    const startIdx = currentRun[0];
    const endIdx = currentRun[currentRun.length - 1];
    const startPt = points[startIdx];
    const endPt = points[endIdx];

    const holidays: string[] = [];
    for (const idx of currentRun) {
      const info = parseCalendarDay(points[idx].period);
      if (info.isHoliday && info.holidayName && !holidays.includes(info.holidayName)) {
        holidays.push(info.holidayName);
      }
    }

    const info: BreakRunInfo = {
      startIndex: startIdx,
      endIndex: endIdx,
      runLength: currentRun.length,
      startDateIso: startPt.period ?? "",
      endDateIso: endPt.period ?? "",
      startLabel: startPt.label,
      endLabel: endPt.label,
      includedHolidays: holidays,
    };

    for (const idx of currentRun) {
      breakMap.set(idx, info);
    }
    currentRun = [];
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const isLive = isPointLive(p);
    if (!isLive) {
      currentRun.push(i);
    } else {
      finishRun();
    }
  }
  finishRun();

  return breakMap;
}

/**
 * Resolves full calendar and production context for an entire series of points.
 */
export function resolveCalendarSeries(points: MinimalPoint[]): CalendarPointContext[] {
  if (!points || points.length === 0) return [];

  const breakRuns = computeBreakRuns(points);

  return points.map((p, i) => {
    const cal = parseCalendarDay(p.period);
    const breakInfo = breakRuns.get(i);
    const isLive = isPointLive(p);

    let status: DayProductionStatus = "normal_production";
    let statusBadge = "🏭 ACTIVE";
    let statusLabel = "Production Active";
    let statusDescription = "Regular scheduled production shift.";
    let statusColor = "var(--text)";

    if (cal.isDayGrain) {
      if (cal.isHoliday && !isLive) {
        status = "holiday_off";
        statusBadge = "🌴 HOLIDAY";
        statusLabel = `Holiday: ${cal.holidayName}`;
        statusDescription = "Scheduled plant holiday (no production planned).";
        statusColor = "var(--accent)";
      } else if (cal.isSunday && !isLive) {
        status = "holiday_off";
        statusBadge = "📅 SUN OFF";
        statusLabel = "Weekly Off (Sunday)";
        statusDescription = "Plant closed for standard Sunday weekly off.";
        statusColor = "var(--warning, #f59e0b)";
      } else if (!isLive) {
        status = "unplanned_break";
        statusBadge = "⚠️ BREAK";
        statusLabel = "Unplanned Break / No Production";
        statusDescription = `Scheduled working day (${cal.weekdayFull}) with no production recorded.`;
        statusColor = "var(--critical, #dc2626)";
      } else if (cal.isHoliday || cal.isSunday) {
        status = "holiday_working";
        statusBadge = "⚡ OT / SHIFT";
        statusLabel = cal.isHoliday
          ? `Active on Holiday (${cal.holidayName})`
          : "Sunday Overtime / Special Shift";
        statusDescription = "Production and quality inspection were active on this holiday.";
        statusColor = "var(--positive, #16a34a)";
      }
    } else {
      // Non-day grain (month/week/fy)
      if (!isLive) {
        status = "unplanned_break";
        statusBadge = "⏸ NO DATA";
        statusLabel = "No Production";
        statusDescription = "No units checked or rejected during this period.";
        statusColor = "var(--text-3)";
      }
    }

    return {
      ...cal,
      status,
      statusBadge,
      statusLabel,
      statusDescription,
      statusColor,
      breakInfo,
    };
  });
}
