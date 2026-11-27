import { computed, inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AxiosError } from 'axios';
import { errorMessage } from '../../../core/api';
import { NotifyService } from '../../../core/notify.service';
import { confirmCancel } from '../confirm-dialog';
import { AppointmentStatus, dayLabel, fromIso, isoDate } from '../dashboard.data';
import { CaseDialog, CaseDialogData } from './case-dialog/case-dialog';
import { DoctorAppointment, doctorApi, DoctorProfile, hasStarted } from './doctor.api';

/**
 * The doctor's profile and appointments, shared by every doctor view.
 * Provided by DoctorDashboard, so it lives as long as the dashboard is open.
 */
@Injectable()
export class DoctorStore {
  private readonly dialog = inject(MatDialog);
  private readonly notify = inject(NotifyService);

  readonly profile = signal<DoctorProfile | null>(null);
  readonly appointments = signal<DoctorAppointment[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notLinked = signal(false);
  readonly busy = signal<number | null>(null);
  /** Bumped after any status change, so views holding their own data (Patients) can reload. */
  readonly version = signal(0);

  readonly today = isoDate(new Date());

  readonly todays = computed(() =>
    this.appointments()
      .filter((a) => a.date === this.today)
      .sort((a, b) => a.time.localeCompare(b.time)),
  );
  readonly requests = computed(() =>
    this.appointments()
      .filter((a) => a.status === 'pending' && !hasStarted(a))
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
  );
  /** Confirmed visits whose time has passed without an outcome. */
  readonly needOutcome = computed(() =>
    this.appointments().filter((a) => a.status === 'confirmed' && hasStarted(a)),
  );

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const { profile, appointments } = await doctorApi.me();
      this.profile.set(profile);
      this.appointments.set(appointments);
      this.notLinked.set(false);
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data?.code === 'NOT_LINKED') {
        // The server links accounts by email (GET /me); nothing matched yet.
        this.notLinked.set(true);
      } else {
        this.error.set(errorMessage(err));
      }
    } finally {
      this.loading.set(false);
    }
  }

  upsert(appointment: DoctorAppointment): void {
    this.appointments.update((list) => list.map((a) => (a.id === appointment.id ? appointment : a)));
    this.version.update((v) => v + 1);
  }

  /** Changes an appointment's status; cancelling asks for confirmation first. */
  async setStatus(a: Pick<DoctorAppointment, 'id' | 'patient' | 'date' | 'time'>, status: AppointmentStatus): Promise<boolean> {
    if (
      status === 'cancelled' &&
      !(await confirmCancel(this.dialog, {
        withName: a.patient,
        date: a.date,
        time: a.time,
        // Doctor cancellations always refund the patient (server: settleOnCancel).
        note: { tone: 'info', text: 'If the patient has paid, the full amount will be refunded.' },
      }))
    ) {
      return false;
    }
    this.busy.set(a.id);
    try {
      const updated = await doctorApi.setStatus(a.id, status);
      this.upsert(updated);
      this.notify.success(`${a.patient}'s appointment on ${dayLabel(fromIso(a.date))} is now ${updated.status}.`);
      return true;
    } catch (err) {
      this.notify.error(errorMessage(err));
      return false;
    } finally {
      this.busy.set(null);
    }
  }

  /** Opens the patient case dialog: read-only `view`, or `update` with the prescription form. */
  openCase(appointmentId: number, mode: 'view' | 'update'): void {
    this.dialog
      .open<CaseDialog, CaseDialogData, DoctorAppointment>(CaseDialog, {
        data: { appointmentId, mode, store: this },
        width: '760px',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100vh - 32px)',
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((updated) => updated && this.upsert(updated));
  }
}
