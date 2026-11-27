// Date and slot helpers shared by the doctors and appointments routes.
// Dates travel as 'YYYY-MM-DD' strings and times as 'HH:MM', in the server's local time zone.

const BOOKING_WINDOW_DAYS = 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parses YYYY-MM-DD; returns null for malformed or impossible dates. */
function parseDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return isoDate(date) === value ? date : null;
}

/** Whether a date string falls between today and the end of the booking window. */
function inBookingWindow(value) {
  const date = parseDate(value);
  if (!date) return false;
  const today = parseDate(isoDate());
  const last = new Date(today);
  last.setDate(last.getDate() + BOOKING_WINDOW_DAYS);
  return date >= today && date <= last;
}

const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** 'HH:MM' slot start times between start (inclusive) and end (exclusive). */
function slotTimes(start, end, minutes) {
  const slots = [];
  for (let t = toMinutes(start); t + minutes <= toMinutes(end); t += minutes) {
    slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return slots;
}

/** Slot start times that have already passed today. */
function isPast(date, time) {
  if (date !== isoDate()) return date < isoDate();
  const now = new Date();
  return toMinutes(time) <= now.getHours() * 60 + now.getMinutes();
}

/**
 * A doctor's slots on one date, each marked available or not.
 * Returns null when the doctor doesn't consult on that weekday.
 * `db` is the pool or a connection inside a transaction.
 */
async function doctorSlots(db, doctorId, date) {
  const [[hours]] = await db.query(
    `SELECT TIME_FORMAT(start_time, '%H:%i') AS start, TIME_FORMAT(end_time, '%H:%i') AS end,
            slot_minutes AS minutes
       FROM doctor_availability WHERE doctor_id = ? AND day_of_week = ?`,
    [doctorId, parseDate(date).getDay()],
  );
  if (!hours) return null;

  const [booked] = await db.query(
    `SELECT TIME_FORMAT(appointment_time, '%H:%i') AS time FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND status <> 'cancelled'`,
    [doctorId, date],
  );
  const taken = new Set(booked.map((b) => b.time));
  return slotTimes(hours.start, hours.end, hours.minutes).map((time) => ({
    time,
    available: !taken.has(time) && !isPast(date, time),
  }));
}

module.exports = { BOOKING_WINDOW_DAYS, isoDate, parseDate, inBookingWindow, isPast, doctorSlots };
