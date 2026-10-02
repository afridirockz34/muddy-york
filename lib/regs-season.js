// Turns the official season wording ("fourth Saturday in April to September 30",
// "January 1 to Friday before fourth Saturday in April and August 15 to
// December 31", "open all year") into concrete date windows for a given year.
// Anything it can't read exactly returns null, and callers then say "Check regs"
// rather than guess.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5 };

function nthWeekday(year, m, wd, n) {
  const first = new Date(year, m, 1);
  return new Date(year, m, 1 + ((wd - first.getDay() + 7) % 7) + (n - 1) * 7);
}
function lastWeekday(year, m, wd) {
  const last = new Date(year, m + 1, 0);
  return new Date(year, m, last.getDate() - ((last.getDay() - wd + 7) % 7));
}

// One date phrase → Date in `year`, or null.
export function parseDay(phrase, year) {
  const p = String(phrase).toLowerCase().replace(/[\u200b\u00a0]/g, " ").replace(/\s+/g, " ").replace(/^the /, "").trim();
  let m;
  if (p === "family day" || p === "family day ontario") return nthWeekday(year, 1, 1, 3);
  if ((m = p.match(/^([a-z]+) (\d{1,2})$/)) && MONTHS.includes(m[1])) return new Date(year, MONTHS.indexOf(m[1]), +m[2]);
  if ((m = p.match(/^last day (?:in|of) ([a-z]+)$/)) && MONTHS.includes(m[1])) return new Date(year, MONTHS.indexOf(m[1]) + 1, 0);
  if (p === "labour day") return nthWeekday(year, 8, 1, 1);
  if ((m = p.match(/^(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last) ([a-z]+) (?:in|of) ([a-z]+)$/)) && WEEKDAYS.includes(m[2]) && MONTHS.includes(m[3])) {
    const mo = MONTHS.indexOf(m[3]), wd = WEEKDAYS.indexOf(m[2]);
    return m[1] === "last" ? lastWeekday(year, mo, wd) : nthWeekday(year, mo, wd, ORD[m[1]]);
  }
  if ((m = p.match(/^(?:the )?day after (.+)$/))) {
    const anchor = parseDay(m[1], year);
    return anchor ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1) : null;
  }
  if ((m = p.match(/^([a-z]+) after (.+)$/)) && WEEKDAYS.includes(m[1])) {
    const anchor = parseDay(m[2], year);
    if (!anchor) return null;
    const fwd = ((WEEKDAYS.indexOf(m[1]) - anchor.getDay() + 7) % 7) || 7;
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + fwd);
  }
  if ((m = p.match(/^([a-z]+) before (.+)$/)) && WEEKDAYS.includes(m[1])) {
    const anchor = parseDay(m[2], year);
    if (!anchor) return null;
    const wd = WEEKDAYS.indexOf(m[1]);
    const back = ((anchor.getDay() - wd + 7) % 7) || 7;
    return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - back);
  }
  return null;
}

// Strip the framing words around a season so only the dates remain.
export function cleanSeason(text) {
  return String(text || "")
    .replace(/[\u200b]/g, "")
    .replace(/\s+in the following areas[\s\S]*$/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/^\s*(fish sanctuary\s*-\s*)?(no fishing\s*-?\s*)?(from\s+)?/i, "")
    .replace(/^\s*(season\s*:\s*)?(open\s+)?(from\s+)?/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.;]\s*$/, "")
    .trim();
}

// Season text → [[start, end], ...] for `year` (end inclusive to 23:59:59),
// "all" for all year, "none" for closed all year, or null when unreadable.
export function seasonWindows(text, year) {
  const t = cleanSeason(text).toLowerCase();
  if (!t) return null;
  if (/^(open )?all year$/.test(t)) return "all";
  if (/^closed all year$/.test(t)) return "none";
  const out = [];
  for (const part of t.split(/\s+and\s+(?:from\s+)?/)) {
    const m = part.replace(/^from\s+/, "").match(/^(.+?)\s+to\s+(.+)$/);
    if (!m) return null;
    const a = parseDay(m[1], year), b = parseDay(m[2], year);
    if (!a || !b) return null;
    const end = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    if (a <= b) out.push([a, end(b)]);
    else { out.push([new Date(year, 0, 1), end(b)]); out.push([a, end(new Date(year, 11, 31))]); } // wraps the new year
  }
  return out.length ? out : null;
}

export function inWindows(date, windows) {
  if (windows === "all") return true;
  if (windows === "none" || !windows) return false;
  return windows.some(([a, b]) => date >= a && date <= b);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "Apr 25 – Sep 30" style summary of windows (for compact display).
export function windowsLabel(windows) {
  if (windows === "all") return "Open all year";
  if (windows === "none") return "Closed all year";
  if (!windows) return null;
  return windows.map(([a, b]) => `${MON[a.getMonth()]} ${a.getDate()} – ${MON[b.getMonth()]} ${b.getDate()}`).join(", ");
}
