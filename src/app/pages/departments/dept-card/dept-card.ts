import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { accentVars, Department } from '../../../core/departments.data';

/** Colour-coded department card linking to the department's doctors page. */
@Component({
  selector: 'app-dept-card',
  imports: [RouterLink, MatIconModule],
  templateUrl: './dept-card.html',
  styleUrl: './dept-card.scss',
})
export class DeptCard {
  readonly dept = input.required<Department>();
  protected readonly accent = computed(() => accentVars(this.dept()));
}
