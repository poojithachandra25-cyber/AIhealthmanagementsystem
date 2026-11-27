import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { errorMessage } from '../../../../core/api';
import { fromIso, fullDate, initialsOf, timeLabel } from '../../dashboard.data';
import { DoctorAppointment, doctorApi, patientMeta, PatientRow } from '../doctor.api';
import { DoctorStore } from '../doctor.store';

/** Everyone who booked with this doctor; upcoming visits confirm/cancel inline: ?view=patients */
@Component({
  selector: 'app-doctor-patients',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './patients-view.html',
  styleUrl: './patients-view.scss',
})
export class DoctorPatientsView {
  protected readonly store = inject(DoctorStore);

  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly timeLabel = timeLabel;
  protected readonly initials = initialsOf;
  protected readonly patientMeta = patientMeta;

  protected readonly patients = signal<PatientRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly onlyOpen = signal(false);

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.patients().filter(
      (p) =>
        (!this.onlyOpen() || p.open.length) &&
        (!q || `${p.name} ${p.email} ${p.phone ?? ''}`.toLowerCase().includes(q)),
    );
  });
  protected readonly awaiting = computed(() =>
    this.patients().reduce((n, p) => n + p.open.filter((a) => a.status === 'pending').length, 0),
  );

  constructor() {
    // Reload whenever an appointment changes anywhere on the dashboard.
    effect(() => {
      this.store.version();
      untracked(() => this.load());
    });
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.patients.set(await doctorApi.patients());
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected act(p: PatientRow, a: DoctorAppointment, status: 'confirmed' | 'cancelled'): void {
    this.store.setStatus({ ...a, patient: p.name }, status);
  }

  /** History opens on the patient's most relevant appointment: the next one, else the latest. */
  protected history(p: PatientRow): void {
    const id =
      p.open[0]?.id ??
      this.store
        .appointments()
        .filter((a) => a.patientId === p.id)
        .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))[0]?.id;
    if (id) this.store.openCase(id, 'view');
  }
}
