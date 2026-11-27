import { Component, computed, input, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { api } from '../../../core/api';
import { accentVars, DEPARTMENTS } from '../../../core/departments.data';
import { fullDate, SAMPLE_MONTHLY, shortDate } from '../dashboard.data';
import { ApptChart, MonthBucket } from './appt-chart';
import { AdminDoctorsView } from './doctors-view/doctors-view';
import { AdminPatientsView } from './patients-view/patients-view';
import { AdminRevenueView } from './revenue-view/revenue-view';

/** Views reachable from the admin side menu, as `/dashboard?view=…` (Specs/admindashboard.md). */
const VIEWS = ['doctors', 'patients', 'revenue'] as const;

type TrendKey = 'patients' | 'doctors' | 'appointments' | 'messages';

interface AdminStats extends Record<TrendKey, number> {
  admins: number;
  trends: Record<TrendKey, number[]>;
  appointmentsByMonth: { month: string; status: string; count: number }[];
  appointmentDates: { date: string; count: number }[];
  recentUsers: { id: number; name: string; email: string; role: string; createdAt: string }[];
}

const CARDS: { key: TrendKey; label: string; icon: string; color: string; kind: 'bars' | 'area' }[] = [
  { key: 'patients', label: 'Patients', icon: 'personal_injury', color: '#6250d6', kind: 'bars' },
  { key: 'doctors', label: 'Doctors', icon: 'medical_services', color: '#eb6834', kind: 'area' },
  { key: 'appointments', label: 'Appointments', icon: 'event_available', color: '#0891b2', kind: 'bars' },
  { key: 'messages', label: 'Messages', icon: 'mail_outline', color: '#16a34a', kind: 'area' },
];

const SPARK = { w: 112, h: 40 };
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

@Component({
  selector: 'app-admin-dashboard',
  imports: [MatIconModule, ApptChart, AdminDoctorsView, AdminPatientsView, AdminRevenueView],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  /** `?view=` from the URL; unknown values show the overview. `?add=1` opens Add doctor. */
  readonly view = input<string>();
  readonly add = input<string>();
  protected readonly current = computed(() => {
    const v = this.view() ?? '';
    return (VIEWS as readonly string[]).includes(v) ? v : 'overview';
  });

  protected readonly stats = signal<AdminStats | null>(null);
  protected readonly failed = signal(false);
  protected readonly departments = DEPARTMENTS;
  protected readonly accentVars = accentVars;
  protected readonly weekdays = WEEKDAYS;
  protected readonly spark = SPARK;
  protected readonly shortDate = (iso: string) => shortDate(new Date(iso));

  ngOnInit(): void {
    api
      .get<AdminStats>('/stats')
      .then(({ data }) => this.stats.set(data))
      .catch(() => this.failed.set(true));
  }

  protected readonly cards = computed(() => {
    const s = this.stats();
    return CARDS.map((c) => {
      const days = s?.trends[c.key] ?? Array(14).fill(0);
      const last = sum(days.slice(7));
      const prev = sum(days.slice(0, 7));
      const pct = prev ? Math.round(((last - prev) / prev) * 100) : last ? 100 : 0;
      return { ...c, value: s ? s[c.key] : null, pct, ...this.sparkline(days.slice(7), c.kind) };
    });
  });

  /** Last 7 days as bars (light tint, today in full colour) or a line with a soft fill. */
  private sparkline(days: number[], kind: 'bars' | 'area') {
    const max = Math.max(1, ...days);
    const slot = SPARK.w / days.length;
    const y = (v: number) => SPARK.h - 2 - (v / max) * (SPARK.h - 6);
    const labels = days.map((v, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days.length - 1 - i));
      return `${shortDate(d)}: ${v}`;
    });
    const bars = days.map((v, i) => {
      const h = Math.max(2, SPARK.h - 2 - y(v));
      return { x: i * slot + 2, y: SPARK.h - 2 - h, w: slot - 4, h, last: i === days.length - 1, label: labels[i] };
    });
    const pts = days.map((v, i) => `${(i * (SPARK.w - 4)) / (days.length - 1) + 2},${y(v)}`);
    const line = kind === 'area' ? `M${pts.join('L')}` : '';
    const fill = kind === 'area' ? `${line}L${SPARK.w - 2},${SPARK.h}L2,${SPARK.h}Z` : '';
    const hits = days.map((_, i) => ({ x: i * slot, w: slot, label: labels[i] }));
    return { bars, line, fill, hits };
  }

  /** Real appointment outcomes for the last 6 months, or sample data until bookings exist. */
  protected readonly monthly = computed(() => {
    const rows = this.stats()?.appointmentsByMonth ?? [];
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (5 - i));
      return d;
    });
    const real: MonthBucket[] = months.map((d) => {
      const key = ymd(d).slice(0, 7);
      const of = (statuses: string[]) =>
        sum(rows.filter((r) => r.month === key && statuses.includes(r.status)).map((r) => r.count));
      return {
        label: d.toLocaleString('en-GB', { month: 'short' }),
        completed: of(['completed']),
        upcoming: of(['pending', 'confirmed']),
        cancelled: of(['cancelled']),
      };
    });
    const isSample = rows.length === 0;
    const data = isSample ? real.map((m, i) => ({ ...m, ...SAMPLE_MONTHLY[i] })) : real;
    return { data, isSample };
  });

  // ---- Calendar ----
  protected readonly viewMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  protected readonly selected = signal<string | null>(null);

  private readonly dayCounts = computed(() => {
    const map = new Map<string, number>();
    const real = this.stats()?.appointmentDates ?? [];
    if (real.length) {
      for (const r of real) map.set(r.date, r.count);
    } else {
      // Sample bookings so the calendar shows its layout until real ones exist.
      const now = new Date();
      for (const day of [3, 6, 9, 10, 14, 17, 21, 24, 27]) {
        map.set(ymd(new Date(now.getFullYear(), now.getMonth(), day)), (day % 4) + 1);
      }
    }
    return map;
  });

  protected readonly monthLabel = computed(() =>
    this.viewMonth().toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
  );

  protected readonly calendar = computed(() => {
    const first = this.viewMonth();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const todayKey = ymd(new Date());
    const cells: ({ day: number; key: string; count: number; today: boolean } | null)[] = Array(first.getDay()).fill(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const key = ymd(new Date(first.getFullYear(), first.getMonth(), day));
      cells.push({ day, key, count: this.dayCounts().get(key) ?? 0, today: key === todayKey });
    }
    return cells;
  });

  protected readonly selectedInfo = computed(() => {
    const key = this.selected();
    if (!key) return null;
    const count = this.dayCounts().get(key) ?? 0;
    const [y, m, d] = key.split('-').map(Number);
    return { date: fullDate(new Date(y, m - 1, d)), count };
  });

  protected shiftMonth(delta: number): void {
    const d = this.viewMonth();
    this.viewMonth.set(new Date(d.getFullYear(), d.getMonth() + delta, 1));
    this.selected.set(null);
  }

  protected readonly isSampleCalendar = computed(() => !this.stats()?.appointmentDates?.length);
}
