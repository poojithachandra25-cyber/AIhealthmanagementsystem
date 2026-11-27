import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../../../core/api';
import { BookDialog, BookDialogData } from '../book-dialog/book-dialog';
import { Appointment, DAY_NAMES, Doctor, initialsOf, moneyWhole, patientApi, timeLabel } from '../patient.api';

@Component({
  selector: 'app-book-appointment',
  imports: [RouterLink, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './book-appointment.html',
  styleUrl: './book-appointment.scss',
})
export class BookAppointment implements OnInit {
  private readonly dialog = inject(MatDialog);

  /** Doctor name to open the booking form for straight away (from a department page). */
  readonly preselect = input<string>();
  readonly booked = output<Appointment>();

  protected readonly days = DAY_NAMES;
  protected readonly initialsOf = initialsOf;
  protected readonly moneyWhole = moneyWhole;
  protected readonly gstRate = signal(18);
  protected readonly doctors = signal<Doctor[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly department = signal('all');
  protected readonly query = signal('');
  protected readonly brokenPhotos = signal(new Set<number>());
  private windowDays = 60;

  protected readonly departments = computed(() => {
    const seen = new Map<string, string>();
    for (const d of this.doctors()) seen.set(d.departmentSlug, d.department);
    return [...seen].map(([slug, name]) => ({ slug, name }));
  });

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.doctors().filter(
      (d) =>
        (this.department() === 'all' || d.departmentSlug === this.department()) &&
        (!q || `${d.name} ${d.title} ${d.department}`.toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const { doctors, bookingWindowDays, gstRate } = await patientApi.doctors();
      this.windowDays = bookingWindowDays;
      this.gstRate.set(gstRate);
      this.doctors.set(doctors);
      const match = doctors.find((d) => d.name === this.preselect());
      if (match) this.book(match);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected works(doctor: Doctor, day: number): boolean {
    return doctor.availability.some((a) => a.day === day);
  }

  protected hours(doctor: Doctor): string {
    const a = doctor.availability;
    if (!a.length) return 'No consulting hours';
    const same = a.every((x) => x.start === a[0].start && x.end === a[0].end);
    return same ? `${timeLabel(a[0].start)} – ${timeLabel(a[0].end)}` : 'Hours vary by day';
  }

  protected photoFailed(id: number): void {
    this.brokenPhotos.update((s) => new Set(s).add(id));
  }

  protected book(doctor: Doctor): void {
    this.dialog
      .open<BookDialog, BookDialogData, Appointment>(BookDialog, {
        data: { doctor, bookingWindowDays: this.windowDays, gstRate: this.gstRate() },
        width: '560px',
        maxWidth: 'calc(100vw - 24px)',
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((appointment) => appointment && this.booked.emit(appointment));
  }
}
