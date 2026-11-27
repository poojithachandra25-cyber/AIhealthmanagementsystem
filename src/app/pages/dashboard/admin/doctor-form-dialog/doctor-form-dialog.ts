import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../../../core/api';
import { AdminDepartment, AdminDoctor, adminApi } from '../admin.api';

export interface DoctorFormData {
  departments: AdminDepartment[];
  /** Set to edit this doctor; omit to add a new one. */
  doctor?: AdminDoctor;
}

/**
 * Add or edit a doctor. Adding creates the profile; the doctor then signs up with the same
 * email. Editing a doctor who has an account also changes their login email.
 */
@Component({
  selector: 'app-doctor-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ editing ? 'Edit ' + data.doctor!.name : 'Add a doctor' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (!editing) {
          <p class="lead">
            <mat-icon>info_outline</mat-icon>
            The doctor creates their account at Sign up → Doctor using <strong>this email</strong>; it is linked to
            this profile automatically. They start with Mon–Fri, 10 AM–2 PM, which they can change under Availability.
          </p>
        } @else if (data.doctor!.hasAccount) {
          <p class="lead">
            <mat-icon>info_outline</mat-icon>
            This doctor has an account. Changing the email also changes the email they log in with.
          </p>
        } @else {
          <p class="lead">
            <mat-icon>info_outline</mat-icon>
            This doctor hasn't created an account yet. They sign up as a Doctor with the email below.
          </p>
        }
        <div class="grid">
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Full name</mat-label>
            <input matInput formControlName="name" placeholder="Dr. Asha Verma" />
            @if (form.controls.name.invalid) { <mat-error>Name is required</mat-error> }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Email (used to sign up)</mat-label>
            <input matInput type="email" formControlName="email" />
            @if (form.controls.email.invalid) { <mat-error>Enter a valid email</mat-error> }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Department</mat-label>
            <mat-select formControlName="departmentId">
              @for (d of data.departments; track d.id) {
                <mat-option [value]="d.id">{{ d.name }}</mat-option>
              }
            </mat-select>
            @if (form.controls.departmentId.invalid) { <mat-error>Choose a department</mat-error> }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Designation</mat-label>
            <input matInput formControlName="title" placeholder="Senior Cardiologist" />
            @if (form.controls.title.invalid) { <mat-error>Designation is required</mat-error> }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Experience (years)</mat-label>
            <input matInput type="number" min="0" max="60" formControlName="experience" />
            @if (form.controls.experience.invalid) { <mat-error>0–60 years</mat-error> }
          </mat-form-field>
          <mat-form-field appearance="outline" class="wide">
            <mat-label>Qualifications</mat-label>
            <input matInput formControlName="qualifications" placeholder="MBBS, MD (Medicine), DM (Cardiology)" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Registration no.</mat-label>
            <input matInput formControlName="registrationNo" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Photo URL (optional)</mat-label>
            <input matInput formControlName="image" placeholder="https://…" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="wide">
            <mat-label>About (optional)</mat-label>
            <textarea matInput rows="2" maxlength="1000" formControlName="intro"></textarea>
          </mat-form-field>
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">
          @if (saving()) { <mat-spinner diameter="18" /> } @else { {{ editing ? 'Save changes' : 'Add doctor' }} }
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .lead {
      display: flex;
      gap: 8px;
      margin: 0 0 16px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--dash-accent-soft);
      color: var(--mp-ink-soft);
      font-size: 0.82rem;

      mat-icon {
        flex-shrink: 0;
        color: var(--dash-accent);
      }
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 14px;

      .wide {
        grid-column: 1 / -1;
      }
      @media (max-width: 560px) {
        grid-template-columns: 1fr;
      }
    }
    .error {
      margin: 0;
      color: #b91c1c;
      font-size: 0.84rem;
    }
    mat-spinner {
      margin: 0 22px;
    }
  `,
})
export class DoctorFormDialog {
  private readonly ref = inject<MatDialogRef<DoctorFormDialog, AdminDoctor>>(MatDialogRef);
  protected readonly data = inject<DoctorFormData>(MAT_DIALOG_DATA);
  protected readonly editing = !!this.data.doctor;

  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    departmentId: [0, Validators.min(1)],
    title: ['', [Validators.required, Validators.maxLength(120)]],
    experience: [5, [Validators.required, Validators.min(0), Validators.max(60)]],
    qualifications: [''],
    registrationNo: [''],
    image: [''],
    intro: [''],
  });

  constructor() {
    const d = this.data.doctor;
    if (d) {
      this.form.reset({
        name: d.name,
        email: d.email ?? '',
        departmentId: d.departmentId,
        title: d.title,
        experience: d.experience,
        qualifications: d.qualifications ?? '',
        registrationNo: d.registrationNo ?? '',
        image: d.image ?? '',
        intro: d.intro ?? '',
      });
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      const body = { ...v, experience: Number(v.experience) };
      const d = this.data.doctor;
      this.ref.close(d ? await adminApi.updateDoctor(d.id, body) : await adminApi.addDoctor(body));
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
