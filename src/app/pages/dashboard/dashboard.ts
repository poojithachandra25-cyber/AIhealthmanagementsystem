import { Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { AuthService, Role } from '../../core/auth.service';
import { DEPARTMENTS } from '../../core/departments.data';
import { NotifyService } from '../../core/notify.service';
import { AdminDashboard } from './admin/admin-dashboard';
import { NAV, NavItem } from './dashboard.data';
import { DoctorDashboard } from './doctor/doctor-dashboard';
import { PatientDashboard } from './patient/patient-dashboard';

/** Top-bar action button per role; doctors have none. */
const CTA: Record<Role, { label: string; link: string; query?: Record<string, string> } | null> = {
  patient: { label: 'Book appointment', link: '/dashboard', query: { view: 'book' } },
  doctor: null,
  admin: { label: 'Add doctor', link: '/dashboard', query: { view: 'doctors', add: '1' } },
};

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatButtonModule, MatIconModule, PatientDashboard, DoctorDashboard, AdminDashboard],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  /**
   * Query params. Patients: ?view= picks the side-menu view (book, myappointments, records,
   * billing, profile); ?doctor= preselects a doctor for booking; ?pay= opens a bill's payment.
   */
  readonly view = input<string>();
  readonly doctor = input<string>();
  readonly pay = input<string>();
  /** Admins: ?add=1 opens the Add doctor form on the Doctors view. */
  readonly add = input<string>();

  protected readonly navOpen = signal(false);
  protected readonly active = signal('Dashboard');

  private readonly role = computed(() => this.auth.user()?.role ?? 'patient');
  protected readonly nav = computed(() => NAV[this.role()]);

  protected readonly cta = computed(() => CTA[this.role()]);

  protected readonly firstName = computed(() => {
    const parts = (this.auth.user()?.name ?? '').replace(/^dr\.?\s+/i, '').split(/\s+/);
    return this.role() === 'doctor' ? `Dr. ${parts.at(-1)}` : parts[0];
  });

  protected readonly initials = computed(() =>
    (this.auth.user()?.name ?? '?')
      .replace(/^dr\.?\s+/i, '')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join(''),
  );

  protected readonly idLabel = computed(() => {
    const user = this.auth.user();
    if (!user) return '';
    const id = 10000 + user.id;
    if (user.role === 'patient') return `Patient ID: PT-${id}`;
    if (user.role === 'doctor') return `Doctor ID: DR-${id} · ${user.specialization ?? 'MedPoint'}`;
    return `Admin · MedPoint Hospital`;
  });

  protected readonly greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  protected readonly today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  /** Highlights the side-menu item for the open view (patients) or the last section (others). */
  protected readonly activeLabel = computed(() => {
    const items = this.nav();
    if (items.some((i) => i.link?.startsWith('/dashboard'))) {
      const view = this.view();
      const match = items.find((i) => i.link && (view ? i.link.endsWith(`view=${view}`) : i.link === '/dashboard'));
      return match?.label ?? 'Dashboard';
    }
    return this.active();
  });

  /** Patients have Logout in the side menu itself, so the footer doesn't repeat it. */
  protected readonly navHasLogout = computed(() => this.nav().some((i) => i.action === 'logout'));

  protected async go(item: NavItem): Promise<void> {
    this.navOpen.set(false);
    if (item.action === 'logout') {
      this.logout();
    } else if (item.link) {
      this.router.navigateByUrl(item.link);
    } else if (item.target) {
      this.active.set(item.label);
      // Sections live on the overview, so leave the booking view first.
      if (this.view()) {
        await this.router.navigate(['/dashboard']);
        await new Promise((r) => setTimeout(r, 400));
      }
      if (item.target === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      else document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      this.notify.success(`${item.label} is coming soon.`);
    }
  }

  /** Searches department and doctor names and opens the first matching department. */
  protected search(term: string): void {
    const q = term.trim().toLowerCase();
    if (!q) return;
    const dept = DEPARTMENTS.find(
      (d) => d.title.toLowerCase().includes(q) || d.doctors.some((doc) => doc.name.toLowerCase().includes(q)),
    );
    if (dept) this.router.navigate(['/departments', dept.slug]);
    else this.notify.error(`No doctor or department matches “${term.trim()}”.`);
  }

  protected notifications(): void {
    this.notify.success("You're all caught up. No new notifications.");
  }

  protected logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
