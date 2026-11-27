import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** "About Us" content shown on the Home page. */
@Component({
  selector: 'app-about-section',
  imports: [MatIconModule],
  templateUrl: './about-section.html',
  styleUrl: './about-section.scss',
})
export class AboutSection {
  protected readonly stats = [
    { value: '25k+', label: 'Patients served' },
    { value: '120+', label: 'Specialist doctors' },
    { value: '6', label: 'Specialty departments' },
    { value: '24/7', label: 'Emergency care' },
  ];

  protected readonly values = [
    { icon: 'favorite', title: 'Compassion', description: 'Every patient is treated with dignity, empathy and respect.' },
    { icon: 'verified', title: 'Excellence', description: 'Evidence-based medicine delivered by certified specialists.' },
    { icon: 'lock', title: 'Privacy', description: 'Medical records are encrypted and only shared with your care team.' },
    { icon: 'bolt', title: 'Efficiency', description: 'Digital workflows cut waiting times and paperwork for everyone.' },
    { icon: 'diversity_3', title: 'Collaboration', description: 'Doctors, nurses and staff work as one connected team.' },
    { icon: 'eco', title: 'Wellbeing', description: 'We focus on prevention and long-term health, not just treatment.' },
  ];

  protected readonly leaders = [
    { initials: 'AR', name: 'Dr. Anita Rao', role: 'Chief Medical Officer' },
    { initials: 'MK', name: 'Dr. Michael Kim', role: 'Head of Cardiology' },
    { initials: 'PS', name: 'Priya Shah', role: 'Director of Operations' },
    { initials: 'JO', name: 'Dr. James Okafor', role: 'Head of Neurology' },
  ];
}
