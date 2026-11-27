import { Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/api';
import { AuthService, Role } from '../../../core/auth.service';
import { NotifyService } from '../../../core/notify.service';
import { ROLE_OPTIONS } from '../roles';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: '../auth.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /** Set from query params when arriving via a doctor's "Book an Appointment" button. */
  readonly doctor = input<string>();
  readonly department = input<string>();

  protected readonly roles = ROLE_OPTIONS;
  protected readonly role = signal<Role>('patient');
  protected readonly roleLabel = computed(
    () => this.roles.find((r) => r.value === this.role())?.label ?? '',
  );
  protected readonly hidePassword = signal(true);
  /** Why the last session ended, if it was signed out automatically. */
  protected readonly notice = this.auth.takeSessionNotice();
  protected readonly loading = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.loading.set(true);
    try {
      const user = await this.auth.login(email, password, this.role());
      this.notify.success(`Welcome back, ${user.name}!`);
      // Patients who came from a doctor's "Book an Appointment" button go straight to booking.
      const doctor = this.doctor();
      if (user.role === 'patient' && doctor) {
        this.router.navigate(['/dashboard'], { queryParams: { view: 'book', doctor } });
      } else {
        this.router.navigateByUrl('/dashboard');
      }
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}
