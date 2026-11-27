import { TitleCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { DEPARTMENTS } from './core/departments.data';
import { Chatbot } from './layout/chatbot/chatbot';
import { DeptDropdown } from './layout/dept-dropdown/dept-dropdown';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TitleCasePipe,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatToolbarModule,
    DeptDropdown,
    Chatbot,
  ],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly departments = DEPARTMENTS;

  /** The dashboard has its own sidebar and top bar, so the site header and footer are hidden there. */
  protected readonly isDashboard = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith('/dashboard')),
    ),
    { initialValue: false },
  );

  protected readonly navLinks = [
    { label: 'Home', path: '/', exact: true },
    { label: 'Our Departments', path: '/departments', exact: false },
    { label: 'Contact', path: '/contact', exact: false },
  ];

  protected readonly year = new Date().getFullYear();

  protected logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
