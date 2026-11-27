import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { errorMessage } from '../../../../core/api';
import {
  AppointmentType,
  DAY_NAMES,
  Doctor,
  initialsOf,
  isoDate,
  money,
  patientApi,
  Slot,
  timeLabel,
  withGst,
} from '../patient.api';

export interface BookDialogData {
  doctor: Doctor;
  bookingWindowDays: number;
  gstRate: number;
}

@Component({
  selector: 'app-book-dialog',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './book-dialog.html',
  styleUrl: './book-dialog.scss',
})
export class BookDialog {
  private readonly ref = inject(MatDialogRef<BookDialog>);
  private readonly data = inject<BookDialogData>(MAT_DIALOG_DATA);

  protected readonly doctor = this.data.doctor;
  protected readonly initials = initialsOf(this.doctor.name);
  protected readonly timeLabel = timeLabel;
  protected readonly photoFailed = signal(false);

  private readonly workDays = new Set(this.doctor.availability.map((a) => a.day));
  protected readonly days = this.doctor.availability.map((a) => DAY_NAMES[a.day]).join(', ');
  /** One range when every day matches; otherwise doctors set different hours per day. */
  protected readonly hours = (() => {
    const a = this.doctor.availability;
    if (!a.length) return '';
    const same = a.every((x) => x.start === a[0].start && x.end === a[0].end);
    return same ? `${timeLabel(a[0].start)} – ${timeLabel(a[0].end)}` : 'hours vary by day';
  })();

  protected readonly minDate = new Date(new Date().setHours(0, 0, 0, 0));
  protected readonly maxDate = new Date(
    new Date(this.minDate).setDate(this.minDate.getDate() + this.data.bookingWindowDays),
  );
  protected readonly isWorkDay = (d: Date | null) => !!d && this.workDays.has(d.getDay());

  protected readonly type = signal<AppointmentType>('regular');
  protected readonly date = signal<Date | null>(null);
  protected readonly slots = signal<Slot[]>([]);
  protected readonly loadingSlots = signal(false);
  protected readonly slotError = signal('');
  protected readonly time = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly money = money;
  protected readonly gstRate = this.data.gstRate;
  /** Fee for the chosen type, with GST, as it will be billed. */
  protected readonly charges = computed(() =>
    withGst(this.type() === 'emergency' ? this.doctor.emergencyFee : this.doctor.consultationFee, this.gstRate),
  );

  protected readonly openSlots = computed(() => this.slots().filter((s) => s.available).length);
  protected readonly canSubmit = computed(() => !!this.date() && !!this.time() && !this.saving());

  constructor() {
    // Start on the doctor's next consulting day so slots show straight away.
    const first = new Date(this.minDate);
    while (first <= this.maxDate && !this.isWorkDay(first)) first.setDate(first.getDate() + 1);
    if (first <= this.maxDate) this.pickDate(first);
  }

  protected async pickDate(date: Date | null): Promise<void> {
    this.date.set(date);
    this.time.set(null);
    this.slots.set([]);
    this.slotError.set('');
    if (!date) return;

    this.loadingSlots.set(true);
    try {
      const slots = await patientApi.slots(this.doctor.id, isoDate(date));
      if (this.date() === date) this.slots.set(slots);
    } catch (err) {
      this.slotError.set(errorMessage(err));
    } finally {
      this.loadingSlots.set(false);
    }
  }

  protected async submit(): Promise<void> {
    const date = this.date();
    const time = this.time();
    if (!date || !time) return;

    this.saving.set(true);
    this.error.set('');
    try {
      const appointment = await patientApi.book({
        doctorId: this.doctor.id,
        date: isoDate(date),
        time,
        type: this.type(),
        reason: this.reason().trim() || undefined,
      });
      this.ref.close(appointment);
    } catch (err) {
      this.error.set(errorMessage(err));
      // The slot may have been taken meanwhile; refresh the list.
      this.pickDate(date);
    } finally {
      this.saving.set(false);
    }
  }
}
