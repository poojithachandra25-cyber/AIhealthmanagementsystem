import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { errorMessage } from '../../../core/api';
import { NotifyService } from '../../../core/notify.service';
import { CancelDialogData, confirmCancel } from '../confirm-dialog';
import { dayLabel, fromIso } from '../dashboard.data';
import { Appointment, Bill, isPayable, isUpcoming, MedicalRecord, money, patientApi } from './patient.api';

/** The refund message the cancel pop-up shows for this appointment. */
function refundNote(a: Appointment): CancelDialogData['note'] {
  if (a.status === 'confirmed') return { tone: 'warn', text: 'No refund will be provided.' };
  if (a.billStatus === 'paid') return { tone: 'info', text: 'You will be refunded for your payment.' };
  // Pending but never paid: there is nothing to give back.
  return { tone: 'info', text: "You haven't paid for this appointment, so there's nothing to refund." };
}

/**
 * The patient's appointments, records and bills, shared by every patient view.
 * Provided by PatientDashboard, so it lives as long as the dashboard is open.
 */
@Injectable()
export class PatientStore {
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly appointments = signal<Appointment[]>([]);
  readonly records = signal<MedicalRecord[]>([]);
  readonly bills = signal<Bill[]>([]);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly cancelling = signal<number | null>(null);

  readonly upcoming = computed(() =>
    this.appointments()
      .filter((a) => isUpcoming(a))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
  );
  readonly payable = computed(() => this.bills().filter(isPayable));

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [appointments, records, bills] = await Promise.all([
        patientApi.appointments(),
        patientApi.records(),
        patientApi.bills(),
      ]);
      this.appointments.set(appointments);
      this.records.set(records);
      this.bills.set(bills);
      this.loaded.set(true);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-reads bills and appointments, e.g. after a booking or a payment. */
  async refreshBilling(): Promise<void> {
    const [appointments, bills] = await Promise.all([patientApi.appointments(), patientApi.bills()]);
    this.appointments.set(appointments);
    this.bills.set(bills);
  }

  /** Stores a bill returned by a payment and mirrors its status onto the appointment. */
  updateBill(bill: Bill): void {
    this.bills.update((list) => list.map((b) => (b.id === bill.id ? bill : b)));
    this.appointments.update((list) =>
      list.map((a) => (a.billId === bill.id ? { ...a, billStatus: bill.status } : a)),
    );
  }

  /**
   * Asks for confirmation, then cancels. Refund rule (Specs/patientdashboard.md):
   * a pending appointment's payment is refunded; a confirmed one's is not.
   */
  async cancel(appointment: Appointment): Promise<void> {
    const { doctor, department, date, time } = appointment;
    const note = refundNote(appointment);
    if (!(await confirmCancel(this.dialog, { withName: doctor, department, date, time, note }))) return;
    this.cancelling.set(appointment.id);
    try {
      await patientApi.cancel(appointment.id);
      await this.refreshBilling();
      const refunded = appointment.status === 'pending' && appointment.billStatus === 'paid';
      this.notify.success(
        `Appointment with ${doctor} on ${dayLabel(fromIso(date))} cancelled.` +
          (refunded && appointment.billTotal !== null
            ? ` ${money(appointment.billTotal)} has been refunded.`
            : ''),
      );
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.cancelling.set(null);
    }
  }
}
