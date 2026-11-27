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
import { errorMessage } from '../../../../core/api';
import { AuthService } from '../../../../core/auth.service';
import { NotifyService } from '../../../../core/notify.service';
import { phoneValidator } from '../../../../core/validators';
import { DAY_NAMES, fullDate, initialsOf, timeLabel } from '../../dashboard.data';
import { DoctorAccount, doctorApi } from '../doctor.api';
import { DoctorStore } from '../doctor.store';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { newPassword, confirmPassword } = group.value as Record<string, string>;
  return newPassword === confirmPassword ? null : { mismatch: true };
}

/** The doctor's account and admin-managed credentials; contact and About are editable: ?view=profile */
@Component({
  selector: 'app-doctor-profile',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './profile-view.html',
  styleUrl: './profile-view.scss',
})
export class DoctorProfileView implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly store = inject(DoctorStore);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly days = DAY_NAMES;
  protected readonly timeLabel = timeLabel;
  protected readonly initials = initialsOf;

  protected readonly data = signal<DoctorAccount | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly changingPassword = signal(false);
  protected readonly photoFailed = signal(false);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', phoneValidator],
    intro: ['', [Validators.required, Validators.maxLength(1000)]],
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
      this.fill(await doctorApi.account());
    } catch (err) {
      this.loadError.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  private fill(d: DoctorAccount): void {
    this.data.set(d);
    this.form.reset({
      name: d.account.name,
      email: d.account.email,
      phone: d.account.phone ?? '',
      intro: d.doctor.intro,
    });
  }

  protected memberSince(): string {
    const created = this.data()?.account.createdAt;
    return created ? fullDate(new Date(created.replace(' ', 'T'))) : '';
  }

  protected works(day: number): boolean {
    return !!this.data()?.doctor.availability.some((a) => a.day === day);
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const saved = await doctorApi.saveAccount(this.form.getRawValue());
      this.fill(saved);
      this.store.profile.update((p) => (p ? { ...p, intro: saved.doctor.intro } : p));
      this.auth.updateUser({ name: saved.account.name, email: saved.account.email, phone: saved.account.phone ?? '' });
      this.notify.success('Your profile has been updated.');
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    const d = this.data();
    if (d) this.fill(d);
  }

  protected async changePassword(formDir: { resetForm: () => void }): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.changingPassword.set(true);
    try {
      const { currentPassword, newPassword } = this.passwordForm.getRawValue();
      const { message, token } = await doctorApi.changePassword(currentPassword, newPassword);
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
