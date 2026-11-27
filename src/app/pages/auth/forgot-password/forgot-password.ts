import { Component, inject, signal } from '@angular/core';
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
import { Router, RouterLink } from '@angular/router';
import { api, errorMessage } from '../../../core/api';
import { Role } from '../../../core/auth.service';
import { NotifyService } from '../../../core/notify.service';
import { ROLE_OPTIONS } from '../roles';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { newPassword, confirmPassword } = group.value as Record<string, string>;
  return newPassword === confirmPassword ? null : { mismatch: true };
}

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './forgot-password.html',
  styleUrl: '../auth.scss',
})
export class ForgotPassword {
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly roles = ROLE_OPTIONS;
  protected readonly role = signal<Role>('patient');
  protected readonly hidePassword = signal(true);
  protected readonly loading = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, newPassword } = this.form.getRawValue();
    this.loading.set(true);
    try {
      const { data } = await api.post<{ message: string }>('/auth/update-password', {
        email,
        role: this.role(),
        newPassword,
      });
      this.notify.success(data.message);
      this.router.navigateByUrl('/login');
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
