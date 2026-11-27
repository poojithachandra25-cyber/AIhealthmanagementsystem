import { Component, computed, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { DEPARTMENTS } from '../../core/departments.data';
import { DeptCard } from './dept-card/dept-card';

@Component({
  selector: 'app-departments',
  imports: [RouterLink, MatButtonModule, MatIconModule, DeptCard],
  templateUrl: './departments.html',
  styleUrl: './departments.scss',
})
export class Departments {
  protected readonly departments = DEPARTMENTS;
  protected readonly doctorCount = DEPARTMENTS.reduce((n, d) => n + d.doctors.length, 0);

  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.departments;
    return this.departments.filter((d) =>
      [d.title, d.tagline, d.description, ...d.services, ...d.doctors.map((doc) => doc.name)].some(
        (text) => text.toLowerCase().includes(q),
      ),
    );
  });

  protected onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
