import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AboutSection } from './about-section/about-section';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatButtonModule, MatIconModule, AboutSection],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly roles = [
    { icon: 'personal_injury', title: 'Patients', description: 'Book appointments, view prescriptions and keep your medical history in one secure place.' },
    { icon: 'healing', title: 'Doctors', description: 'Manage your schedule, review patient records and share care notes instantly.' },
    { icon: 'admin_panel_settings', title: 'Administrators', description: 'Oversee staff, departments and hospital operations from a single dashboard.' },
  ];

  protected readonly steps = [
    { number: '01', title: 'Create your account', description: 'Sign up as a patient, doctor or admin in under a minute and get instant access to your portal.' },
    { number: '02', title: 'Choose a doctor', description: 'Search by department or specialty and pick a time slot that works for you.' },
    { number: '03', title: 'Get care & records', description: 'Attend your visit, review instructions and access your records in one place.' },
  ];

  protected readonly slots = ['09:30', '11:00', '14:15'];
  protected readonly selectedSlot = signal('11:00');
}
