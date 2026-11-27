import { Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { fromIso, fullDate, initialsOf, timeLabel } from '../../dashboard.data';
import { Appointment, BILL_STATUS, isPayable, isUpcoming, money } from '../patient.api';
import { PatientStore } from '../patient.store';

type Tab = 'all' | 'upcoming' | 'past' | 'cancelled';

/** Full-page grid of every appointment: /dashboard?view=myappointments */
@Component({
  selector: 'app-appointments-view',
  imports: [MatIconModule, RouterLink],
  templateUrl: './appointments-view.html',
  styleUrl: './appointments-view.scss',
})
export class AppointmentsView {
  private readonly router = inject(Router);
  protected readonly store = inject(PatientStore);

  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly timeLabel = timeLabel;
  protected readonly initials = initialsOf;
  protected readonly money = money;
  protected readonly billMeta = BILL_STATUS;
  protected readonly isUpcoming = isUpcoming;

  protected readonly tab = signal<Tab>('all');
  protected readonly query = signal('');

  private readonly groups = computed(() => {
    const all = [...this.store.appointments()].sort((a, b) =>
      `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`),
    );
    return {
      all,
      upcoming: this.store.upcoming(),
      past: all.filter((a) => a.status !== 'cancelled' && !isUpcoming(a)),
      cancelled: all.filter((a) => a.status === 'cancelled'),
    };
  });

  protected readonly tabs = computed(() => {
    const g = this.groups();
    return [
      { id: 'all' as Tab, label: 'All', count: g.all.length },
      { id: 'upcoming' as Tab, label: 'Upcoming', count: g.upcoming.length },
      { id: 'past' as Tab, label: 'Past', count: g.past.length },
      { id: 'cancelled' as Tab, label: 'Cancelled', count: g.cancelled.length },
    ];
  });

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.groups()[this.tab()].filter(
      (a) => !q || `${a.doctor} ${a.department} ${a.reason ?? ''}`.toLowerCase().includes(q),
    );
  });

  protected canPay(a: Appointment): boolean {
    return !!a.billId && !!a.billStatus && isPayable({ status: a.billStatus }) && a.status !== 'cancelled';
  }

  protected payNow(a: Appointment): void {
    this.router.navigate(['/dashboard'], { queryParams: { view: 'billing', pay: a.billId } });
  }
}
