import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { Doctor, doctorProfile } from '../../../core/departments.data';

/** Professional doctor profile card with a "Book an Appointment" action. */
@Component({
  selector: 'app-doctor-card',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './doctor-card.html',
  styleUrl: './doctor-card.scss',
})
export class DoctorCard {
  readonly doctor = input.required<Doctor>();
  readonly department = input.required<string>();

  protected readonly profile = computed(() => doctorProfile(this.doctor()));
  protected readonly imageFailed = signal(false);

  protected readonly initials = computed(() =>
    this.doctor()
      .name.replace(/^Dr\.\s*/, '')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2),
  );
}
