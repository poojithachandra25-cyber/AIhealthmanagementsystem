import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { accentVars, DEPARTMENTS, findDepartment } from '../../core/departments.data';
import { DoctorCard } from './doctor-card/doctor-card';

@Component({
  selector: 'app-department-detail',
  imports: [RouterLink, MatButtonModule, MatIconModule, DoctorCard],
  templateUrl: './department-detail.html',
  styleUrl: './department-detail.scss',
})
export class DepartmentDetail {
  /** Bound from the `:slug` route parameter. */
  readonly slug = input.required<string>();

  protected readonly accentVars = accentVars;
  protected readonly department = computed(() => findDepartment(this.slug()));
  protected readonly others = computed(() => DEPARTMENTS.filter((d) => d.slug !== this.slug()));
}
