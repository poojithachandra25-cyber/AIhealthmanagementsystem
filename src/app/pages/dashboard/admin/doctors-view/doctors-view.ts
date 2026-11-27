import { Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { errorMessage } from '../../../../core/api';
import { NotifyService } from '../../../../core/notify.service';
import { DAY_NAMES, initialsOf } from '../../dashboard.data';
import { AdminDepartment, AdminDoctor, adminApi } from '../admin.api';
import { DoctorFormData, DoctorFormDialog } from '../doctor-form-dialog/doctor-form-dialog';

/** Doctors grid; Add doctor and Edit open the same form (doctor-form-dialog): /dashboard?view=doctors */
@Component({
  selector: 'app-admin-doctors',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './doctors-view.html',
  styleUrl: './doctors-view.scss',
})
export class AdminDoctorsView implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /** `?add=1` opens the Add doctor form (top-bar button). */
  readonly add = input<string>();

  protected readonly initials = initialsOf;
  protected readonly days = DAY_NAMES;

  protected readonly doctors = signal<AdminDoctor[]>([]);
  protected readonly departments = signal<AdminDepartment[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly dept = signal(0);
  protected readonly brokenPhotos = signal(new Set<number>());


  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.doctors().filter(
      (d) =>
        (!this.dept() || d.departmentId === this.dept()) &&
        (!q || `${d.name} ${d.email ?? ''} ${d.title} ${d.qualifications ?? ''}`.toLowerCase().includes(q)),
    );
  });
  protected readonly awaiting = computed(() => this.doctors().filter((d) => !d.hasAccount).length);

  constructor() {
    effect(() => {
      const add = this.add();
      if (add && !this.loading()) untracked(() => this.openAdd());
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      const [doctors, departments] = await Promise.all([adminApi.doctors(), adminApi.departments()]);
      this.doctors.set(doctors);
      this.departments.set(departments);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected openAdd(): void {
    if (this.add()) {
      this.router.navigate([], { queryParams: { add: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.openForm(undefined, (doctor) => {
      this.doctors.update((list) => [...list, doctor]);
      this.notify.success(`${doctor.name} added. They can now sign up as a doctor with ${doctor.email}.`);
    });
  }

  /** Edit opens the same form as Add, filled in with the doctor's details. */
  protected edit(d: AdminDoctor): void {
    this.openForm(d, (updated) => {
      this.doctors.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      this.notify.success(`${updated.name}'s details were updated.`);
    });
  }

  private openForm(doctor: AdminDoctor | undefined, done: (d: AdminDoctor) => void): void {
    this.dialog
      .open<DoctorFormDialog, DoctorFormData, AdminDoctor>(DoctorFormDialog, {
        data: { departments: this.departments(), doctor },
        width: '640px',
        maxWidth: 'calc(100vw - 24px)',
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((result) => result && done(result));
  }

  protected photoFailed(id: number): void {
    this.brokenPhotos.update((s) => new Set(s).add(id));
  }

  protected dayList(d: AdminDoctor): string {
    return d.days.length ? d.days.map((n) => this.days[n]).join(', ') : 'No hours set';
  }
}
