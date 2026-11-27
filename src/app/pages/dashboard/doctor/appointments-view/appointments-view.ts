import { Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { fromIso, fullDate, initialsOf, timeLabel } from '../../dashboard.data';
import { BILL_STATUS } from '../../patient/patient.api';
import { DoctorAppointment, hasStarted, patientMeta } from '../doctor.api';
import { DoctorStore } from '../doctor.store';

type Tab = 'all' | 'today' | 'upcoming' | 'past' | 'cancelled';

/** Every appointment with View and Update: /dashboard?view=myappointments */
@Component({
  selector: 'app-doctor-appointments',
  imports: [MatIconModule],
  templateUrl: './appointments-view.html',
  styleUrl: './appointments-view.scss',
})
export class DoctorAppointmentsView {
  protected readonly store = inject(DoctorStore);

  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly timeLabel = timeLabel;
  protected readonly initials = initialsOf;
  protected readonly patientMeta = patientMeta;
  protected readonly billMeta = BILL_STATUS;

  protected readonly tab = signal<Tab>('all');
  protected readonly query = signal('');

  private readonly groups = computed(() => {
    const today = this.store.today;
    const all = [...this.store.appointments()].sort((a, b) =>
      `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`),
    );
    const asc = (list: DoctorAppointment[]) =>
      [...list].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    return {
      all,
      today: asc(all.filter((a) => a.date === today)),
      upcoming: asc(all.filter((a) => (a.status === 'pending' || a.status === 'confirmed') && !hasStarted(a))),
      past: all.filter((a) => a.status !== 'cancelled' && hasStarted(a)),
      cancelled: all.filter((a) => a.status === 'cancelled'),
    };
  });

  protected readonly tabs = computed(() => {
    const g = this.groups();
    return (['all', 'today', 'upcoming', 'past', 'cancelled'] as Tab[]).map((id) => ({
      id,
      label: id[0].toUpperCase() + id.slice(1),
      count: g[id].length,
    }));
  });

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.groups()[this.tab()].filter(
      (a) => !q || `${a.patient} ${a.patientEmail} ${a.reason ?? ''}`.toLowerCase().includes(q),
    );
  });

  /** A confirmed visit whose time has passed and still needs an outcome. */
  protected needsOutcome(a: DoctorAppointment): boolean {
    return a.status === 'confirmed' && hasStarted(a);
  }
}
