import { Component, ElementRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { accentVars, DEPARTMENTS } from '../../core/departments.data';

/** Navbar "Our Departments" item: opens a department list on hover or click. */
@Component({
  selector: 'app-dept-dropdown',
  imports: [RouterLink, MatIconModule],
  host: {
    '(mouseenter)': 'open()',
    '(mouseleave)': 'scheduleClose()',
    '(focusin)': 'open()',
    '(focusout)': 'scheduleClose()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'isOpen.set(false)',
  },
  templateUrl: './dept-dropdown.html',
  styleUrl: './dept-dropdown.scss',
})
export class DeptDropdown {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly departments = DEPARTMENTS;
  protected readonly accentVars = accentVars;
  protected readonly isOpen = signal(false);
  protected readonly onDeptRoute = signal(false);
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        this.isOpen.set(false);
        this.onDeptRoute.set(e.urlAfterRedirects.startsWith('/departments'));
      });
  }

  protected open(): void {
    clearTimeout(this.closeTimer);
    this.isOpen.set(true);
  }

  /** A short delay lets the pointer cross from the trigger into the panel. */
  protected scheduleClose(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.isOpen.set(false), 150);
  }

  protected toggle(): void {
    clearTimeout(this.closeTimer);
    this.isOpen.update((open) => !open);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.isOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }
}
