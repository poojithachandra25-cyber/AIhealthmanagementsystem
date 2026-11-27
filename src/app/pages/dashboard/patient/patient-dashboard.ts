import { Component, computed, inject, input, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { NotifyService } from '../../../core/notify.service';
import { dayLabel, fromIso, fullDate, shortDate } from '../dashboard.data';
import { AppointmentsView } from './appointments-view/appointments-view';
import { BillingView } from './billing-view/billing-view';
import { BookAppointment } from './book-appointment/book-appointment';
import { Appointment, BILL_STATUS, Bill, initialsOf, money, RECORD_META, timeLabel } from './patient.api';
import { PatientStore } from './patient.store';
import { ProfileView } from './profile-view/profile-view';
import { RecordsView } from './records-view/records-view';

/** Views reachable from the patient side menu, as `/dashboard?view=…`. */
export type PatientView = 'overview' | 'book' | 'myappointments' | 'records' | 'billing' | 'profile';
const VIEWS: PatientView[] = ['book', 'myappointments', 'records', 'billing', 'profile'];

@Component({
  selector: 'app-patient-dashboard',
  imports: [
    RouterLink,
    MatIconModule,
    MatProgressSpinnerModule,
    BookAppointment,
    AppointmentsView,
    RecordsView,
    BillingView,
    ProfileView,
  ],
  providers: [PatientStore],
  templateUrl: './patient-dashboard.html',
  styleUrl: './patient-dashboard.scss',
})
export class PatientDashboard implements OnInit {
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);
  protected readonly store = inject(PatientStore);

  /** `?view=` from the URL. Unknown values show the overview. */
  readonly view = input<string>();
  /** Doctor name to open the booking form for (from a department page's Book button). */
  readonly doctor = input<string>();
  /** Bill id to open the payment dialog for. */
  readonly pay = input<string>();

  protected readonly current = computed<PatientView>(() => {
    const v = this.view() as PatientView;
    return VIEWS.includes(v) ? v : 'overview';
  });

  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly dayLabel = (iso: string) => dayLabel(fromIso(iso));
  protected readonly timeLabel = timeLabel;
  protected readonly initials = initialsOf;
  protected readonly money = money;
  protected readonly recordMeta = RECORD_META;
  protected readonly billMeta = BILL_STATUS;

  protected readonly next = computed(() => this.store.upcoming()[0]);
  protected readonly upcomingList = computed(() => this.store.upcoming().slice(0, 4));
  protected readonly recentRecords = computed(() => this.store.records().slice(0, 3));

  protected readonly kpis = computed(() => {
    const next = this.next();
    const completed = this.store.appointments().filter((a) => a.status === 'completed');
    const lastVisit = completed.map((a) => a.date).sort().at(-1);
    const rx = this.store.records().filter((r) => r.type === 'prescription').length;
    const due = this.store.payable();
    return [
      {
        icon: 'event_available',
        label: 'Upcoming appointments',
        value: `${this.store.upcoming().length}`,
        note: next ? `Next on ${shortDate(fromIso(next.date))}` : 'None scheduled',
      },
      {
        icon: 'task_alt',
        label: 'Completed visits',
        value: `${completed.length}`,
        note: lastVisit ? `Last on ${shortDate(fromIso(lastVisit))}` : 'No visits yet',
      },
      {
        icon: 'folder_shared',
        label: 'Medical records',
        value: `${this.store.records().length}`,
        note: `${rx} prescription${rx === 1 ? '' : 's'}`,
      },
      {
        icon: 'account_balance_wallet',
        label: 'Payments due',
        value: money(due.reduce((n, b) => n + b.total, 0)),
        note: due.length ? `${due.length} bill${due.length === 1 ? '' : 's'} to pay` : 'All bills settled',
      },
    ];
  });

  ngOnInit(): void {
    this.store.load();
  }

  /** After booking: take the patient to Billing with the new bill's payment open. */
  protected async onBooked(appointment: Appointment): Promise<void> {
    await this.store.refreshBilling().catch(() => undefined);
    this.notify.success(
      `Booked with ${appointment.doctor} on ${this.dayLabel(appointment.date)} at ${timeLabel(appointment.time)}. Complete the payment to finish.`,
    );
    this.router.navigate(['/dashboard'], {
      queryParams: { view: 'billing', pay: appointment.billId ?? undefined },
    });
  }

  protected payBill(bill: Bill): void {
    this.router.navigate(['/dashboard'], { queryParams: { view: 'billing', pay: bill.id } });
  }
}
