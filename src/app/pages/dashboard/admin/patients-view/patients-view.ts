import { Component, computed, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { errorMessage } from '../../../../core/api';
import { fromIso, fullDate, initialsOf, timeLabel } from '../../dashboard.data';
import { patientMeta } from '../../doctor/doctor.api';
import { BILL_STATUS, money, patientCode } from '../../patient/patient.api';
import { AdminPatient, adminApi } from '../admin.api';

/** Every patient and their appointments with doctors: /dashboard?view=patients */
@Component({
  selector: 'app-admin-patients',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './patients-view.html',
  styleUrl: './patients-view.scss',
})
export class AdminPatientsView implements OnInit {
  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly joined = (ts: string) => fullDate(new Date(ts.replace(' ', 'T')));
  protected readonly timeLabel = timeLabel;
  protected readonly initials = initialsOf;
  protected readonly patientMeta = patientMeta;
  protected readonly patientCode = patientCode;
  protected readonly money = money;
  protected readonly billMeta = BILL_STATUS;

  protected readonly patients = signal<AdminPatient[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.patients().filter(
      (p) =>
        !q ||
        `${p.name} ${p.email} ${p.phone ?? ''} ${p.appointments.map((a) => a.doctor).join(' ')}`
          .toLowerCase()
          .includes(q),
    );
  });

  /**
   * One grid row per appointment; the patient's cells span all their rows.
   * Patients without appointments still get a single row.
   */
  protected readonly rows = computed(() =>
    this.shown().flatMap((p) => {
      const appts = p.appointments.length ? p.appointments : [null];
      return appts.map((a, i) => ({ p, a, first: i === 0, span: appts.length }));
    }),
  );

  protected readonly totals = computed(() => {
    const all = this.patients().flatMap((p) => p.appointments);
    return {
      patients: this.patients().length,
      appointments: all.length,
      active: this.patients().filter((p) => p.appointments.some((a) => a.status === 'pending' || a.status === 'confirmed')).length,
    };
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.patients.set(await adminApi.patients());
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
