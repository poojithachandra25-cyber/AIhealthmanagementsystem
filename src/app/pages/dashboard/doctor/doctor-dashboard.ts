import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth.service';
import { DAY_NAMES, fromIso, fullDate, initialsOf, shortDate, timeLabel } from '../dashboard.data';
import { DoctorAppointmentsView } from './appointments-view/appointments-view';
import { DoctorAvailabilityView } from './availability-view/availability-view';
import { hasStarted, isOpen, patientMeta } from './doctor.api';
import { DoctorStore } from './doctor.store';
import { DoctorPatientsView } from './patients-view/patients-view';
import { DoctorProfileView } from './profile-view/profile-view';

/** Views reachable from the doctor side menu, as `/dashboard?view=…`. */
const VIEWS = ['myappointments', 'patients', 'availability', 'profile'] as const;
type DoctorView = 'overview' | (typeof VIEWS)[number];

@Component({
  selector: 'app-doctor-dashboard',
  imports: [
    RouterLink,
    MatIconModule,
    MatProgressSpinnerModule,
    DoctorAppointmentsView,
    DoctorPatientsView,
    DoctorAvailabilityView,
    DoctorProfileView,
  ],
  providers: [DoctorStore],
  templateUrl: './doctor-dashboard.html',
  styleUrl: './doctor-dashboard.scss',
})
export class DoctorDashboard implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly store = inject(DoctorStore);

  /** `?view=` from the URL. Unknown values show the overview. */
  readonly view = input<string>();
  protected readonly current = computed<DoctorView>(() => {
    const v = this.view() as DoctorView;
    return (VIEWS as readonly string[]).includes(v) ? v : 'overview';
  });

  protected readonly days = DAY_NAMES;
  protected readonly timeLabel = timeLabel;
  protected readonly initials = initialsOf;
  protected readonly patientMeta = patientMeta;
  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly photoFailed = signal(false);

  protected readonly kpis = computed(() => {
    const all = this.store.appointments();
    const today = this.store.todays();
    const upcoming = all.filter((a) => isOpen(a) && !hasStarted(a) && a.date > this.store.today);
    const next = [...upcoming].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
    const patients = new Set(all.map((a) => a.patientId));
    const seen = new Set(all.filter((a) => a.status === 'completed').map((a) => a.patientId));
    return [
      {
        icon: 'today',
        label: "Today's appointments",
        value: today.filter((a) => a.status !== 'cancelled').length,
        note: `${today.filter((a) => a.status === 'completed').length} completed`,
      },
      {
        icon: 'pending_actions',
        label: 'Pending requests',
        value: this.store.requests().length,
        note: this.store.requests().length ? 'Awaiting your confirmation' : 'All caught up',
      },
      {
        icon: 'event_upcoming',
        label: 'Upcoming',
        value: upcoming.length,
        note: next ? `Next on ${shortDate(fromIso(next.date))}` : 'Nothing scheduled',
      },
      {
        icon: 'groups',
        label: 'Patients seen',
        value: seen.size,
        note: `${patients.size} patient${patients.size === 1 ? '' : 's'} booked in total`,
      },
    ];
  });

  protected readonly consulting = computed(() => {
    const a = this.store.profile()?.availability ?? [];
    if (!a.length) return 'No consulting hours set';
    const same = a.every((x) => x.start === a[0].start && x.end === a[0].end);
    return same ? `${timeLabel(a[0].start)} – ${timeLabel(a[0].end)}` : 'Hours vary by day';
  });

  protected readonly email = computed(() => this.auth.user()?.email ?? '');

  ngOnInit(): void {
    this.store.load();
  }

  protected works(day: number): boolean {
    return !!this.store.profile()?.availability.some((a) => a.day === day);
  }
}
