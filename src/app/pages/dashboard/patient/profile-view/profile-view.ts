import { Component, inject, OnInit, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../../../core/api';
import { AuthService } from '../../../../core/auth.service';
import { NotifyService } from '../../../../core/notify.service';
import { phoneValidator as PHONE } from '../../../../core/validators';
import { fullDate, isoDate } from '../../dashboard.data';
import { patientApi, patientCode, Profile } from '../patient.api';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { newPassword, confirmPassword } = group.value as Record<string, string>;
  return newPassword === confirmPassword ? null : { mismatch: true };
}

/** The patient's saved details, editable: /dashboard?view=profile */
@Component({
  selector: 'app-profile-view',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './profile-view.html',
  styleUrl: './profile-view.scss',
})
export class ProfileView implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly genders = [
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'other', label: 'Other' },
  ];
  protected readonly bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  protected readonly today = isoDate(new Date());

  protected readonly profile = signal<Profile | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly changingPassword = signal(false);
  protected readonly hidePassword = signal(true);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', PHONE],
    dateOfBirth: [''],
    gender: [''],
    bloodGroup: [''],
    address: ['', Validators.maxLength(255)],
    emergencyContactName: ['', Validators.maxLength(120)],
    emergencyContactPhone: ['', PHONE],
  });

  protected readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      this.fill(await patientApi.profile());
    } catch (err) {
      this.loadError.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  private fill(p: Profile): void {
    this.profile.set(p);
    this.form.reset({
      name: p.name,
      email: p.email,
      phone: p.phone ?? '',
      dateOfBirth: p.dateOfBirth ?? '',
      gender: p.gender ?? '',
      bloodGroup: p.bloodGroup ?? '',
      address: p.address ?? '',
      emergencyContactName: p.emergencyContactName ?? '',
      emergencyContactPhone: p.emergencyContactPhone ?? '',
    });
  }

  protected patientId(): string {
    const p = this.profile();
    return p ? patientCode(p.id) : '';
  }

  protected memberSince(): string {
    const p = this.profile();
    return p ? fullDate(new Date(p.createdAt.replace(' ', 'T'))) : '';
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const v = this.form.getRawValue();
      const saved = await patientApi.saveProfile({
        ...v,
        gender: (v.gender || null) as Profile['gender'],
        phone: v.phone || null,
        dateOfBirth: v.dateOfBirth || null,
        bloodGroup: v.bloodGroup || null,
        address: v.address || null,
        emergencyContactName: v.emergencyContactName || null,
        emergencyContactPhone: v.emergencyContactPhone || null,
      });
      this.fill(saved);
      // Keep the greeting, avatar and navbar in step with the new details.
      this.auth.updateUser({ name: saved.name, email: saved.email, phone: saved.phone ?? '' });
      this.notify.success('Your profile has been updated.');
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    const p = this.profile();
    if (p) this.fill(p);
  }

  protected async changePassword(formDir: { resetForm: () => void }): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.changingPassword.set(true);
    try {
      const { currentPassword, newPassword } = this.passwordForm.getRawValue();
      const { message, token } = await patientApi.changePassword(currentPassword, newPassword);
      // Older tokens are now revoked; keep this session on the fresh one.
      this.auth.setToken(token);
      formDir.resetForm();
      this.notify.success(message);
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.changingPassword.set(false);
    }
  }
}
