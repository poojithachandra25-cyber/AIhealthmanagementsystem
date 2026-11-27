import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { api, errorMessage } from '../../core/api';
import { NotifyService } from '../../core/notify.service';

@Component({
  selector: 'app-contact',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class Contact {
  private readonly notify = inject(NotifyService);

  protected readonly sending = signal(false);

  protected readonly contacts = [
    { label: 'Emergency number', value: '+1 (800) 123-4567', icon: 'phone' },
    { label: 'Email', value: 'support@medpoint.com', icon: 'mail' },
    { label: 'Address', value: '123 Medical Road, City', icon: 'location_on' },
  ];

  protected readonly hours = [
    { day: 'Monday – Friday', time: '8:00 AM – 8:00 PM' },
    { day: 'Saturday', time: '9:00 AM – 5:00 PM' },
    { day: 'Sunday', time: 'Emergency only' },
  ];

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    subject: [''],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    try {
      const { data } = await api.post<{ message: string }>('/contact', this.form.getRawValue());
      this.notify.success(data.message);
      this.form.reset();
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.sending.set(false);
    }
  }
}
