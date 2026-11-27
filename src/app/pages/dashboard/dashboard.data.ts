// Dashboard navigation, date helpers and the sample content still shown on the
// admin view. The patient and doctor views are live.
// Sample dates are relative to today so the dashboard never looks stale.

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'missed' | 'cancelled';

export interface NavItem {
  icon: string;
  label: string;
  /** Element id on the dashboard to scroll to. */
  target?: string;
  /** Route to open instead. */
  link?: string;
  /** Built-in action instead of navigation. */
  action?: 'logout';
}

export const daysFromToday = (days: number): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', options);
export const shortDate = (d: Date) => fmt({ day: 'numeric', month: 'short' }).format(d);
export const fullDate = (d: Date) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(d);
export const dayLabel = (d: Date) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d);

// Shared by the patient and doctor views. Dates travel as YYYY-MM-DD, times as 24h HH:MM.
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local Date → 'YYYY-MM-DD'. */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' → local midnight Date (new Date('YYYY-MM-DD') would be UTC). */
export const fromIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** 'YYYY-MM-DDTHH:MM' for now; compare with `${date}T${time}` to tell past from upcoming. */
export const nowStamp = (now = new Date()) =>
  `${isoDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

/** '14:30' → '2:30 PM' */
export const timeLabel = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};

export const initialsOf = (name: string) =>
  name
    .replace(/^Dr\.?\s*/i, '')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const NAV: Record<'patient' | 'doctor' | 'admin', NavItem[]> = {
  patient: [
    // Each item is its own view (Specs/patientdashboard.md), so nothing scrolls the overview.
    { icon: 'dashboard', label: 'Dashboard', link: '/dashboard' },
    { icon: 'event_available', label: 'Book Appointment', link: '/dashboard?view=book' },
    { icon: 'event_note', label: 'My Appointments', link: '/dashboard?view=myappointments' },
    { icon: 'folder_shared', label: 'Medical Records', link: '/dashboard?view=records' },
    { icon: 'receipt_long', label: 'Billing & Payments', link: '/dashboard?view=billing' },
    { icon: 'manage_accounts', label: 'Profile & Settings', link: '/dashboard?view=profile' },
    { icon: 'logout', label: 'Logout', action: 'logout' },
  ],
  doctor: [
    // Each item is its own view (Specs/doctordashboard.md).
    { icon: 'dashboard', label: 'Dashboard', link: '/dashboard' },
    { icon: 'event_note', label: 'My Appointments', link: '/dashboard?view=myappointments' },
    { icon: 'groups', label: 'Patients', link: '/dashboard?view=patients' },
    { icon: 'event_available', label: 'Availability', link: '/dashboard?view=availability' },
    { icon: 'badge', label: 'Profile', link: '/dashboard?view=profile' },
    { icon: 'logout', label: 'Logout', action: 'logout' },
  ],
  admin: [
    // Each item is its own view (Specs/admindashboard.md).
    { icon: 'dashboard', label: 'Dashboard', link: '/dashboard' },
    { icon: 'medical_services', label: 'Doctors', link: '/dashboard?view=doctors' },
    { icon: 'groups', label: 'Patients', link: '/dashboard?view=patients' },
    { icon: 'payments', label: 'Revenue', link: '/dashboard?view=revenue' },
    { icon: 'logout', label: 'Logout', action: 'logout' },
  ],
};

/** Six months of appointment outcomes, shown until real bookings exist. */
export const SAMPLE_MONTHLY = [
  { completed: 31, upcoming: 0, cancelled: 4 },
  { completed: 36, upcoming: 0, cancelled: 3 },
  { completed: 42, upcoming: 0, cancelled: 6 },
  { completed: 39, upcoming: 0, cancelled: 5 },
  { completed: 47, upcoming: 2, cancelled: 4 },
  { completed: 44, upcoming: 6, cancelled: 9 },
];
