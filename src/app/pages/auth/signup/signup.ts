import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/api';
import { AuthService, Role } from '../../../core/auth.service';
import { NotifyService } from '../../../core/notify.service';
import { phoneValidator } from '../../../core/validators';
import { ROLE_OPTIONS } from '../roles';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const { password, confirmPassword } = group.value as Record<string, string>;
  return password === confirmPassword ? null : { mismatch: true };
}

@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './signup.html',
  styleUrl: '../auth.scss',
})
export class Signup {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /** Patients, doctors and admins can all self-register (per Specs/layout.md). */
  protected readonly roles = ROLE_OPTIONS;
  protected readonly role = signal<Role>('patient');
  protected readonly hidePassword = signal(true);
  protected readonly loading = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', phoneValidator],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
      terms: [false, Validators.requiredTrue],
    },
    { validators: passwordsMatch },
  );

  /**
   * Doctors sign up with the email the hospital admin registered on their profile
   * (Specs/admindashboard.md); the server links the account to that profile.
   */
  protected selectRole(role: Role): void {
    this.role.set(role);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, phone, password } = this.form.getRawValue();
    this.loading.set(true);
    try {
      const user = await this.auth.register({
        name,
        email,
        phone,
        password,
        role: this.role(),
      });
      this.notify.success(`Account created. Welcome, ${user.name}!`);
      this.router.navigateByUrl('/dashboard');
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
