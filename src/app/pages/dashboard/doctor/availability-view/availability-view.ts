import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { errorMessage } from '../../../../core/api';
import { NotifyService } from '../../../../core/notify.service';
import { timeLabel } from '../../dashboard.data';
import { doctorApi } from '../doctor.api';
import { DoctorStore } from '../doctor.store';

interface DayRow {
  day: number;
  name: string;
  on: boolean;
  start: string;
  end: string;
}

const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
/** 06:00 … 22:00 in 30-minute steps. */
const TIMES = Array.from({ length: 33 }, (_, i) => `${pad(6 + Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`);

/** Weekly consulting hours; saving updates what patients can book: ?view=availability */
@Component({
  selector: 'app-doctor-availability',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './availability-view.html',
  styleUrl: './availability-view.scss',
})
export class DoctorAvailabilityView {
  private readonly notify = inject(NotifyService);
  protected readonly store = inject(DoctorStore);

  protected readonly times = TIMES;
  protected readonly timeLabel = timeLabel;
  protected readonly slotChoices = [15, 20, 30, 45, 60];

  protected readonly rows = signal<DayRow[]>([]);
  protected readonly slotMinutes = signal(30);
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);

  /** Days in Monday-first order, as people read a week. */
  protected readonly ordered = computed(() => {
    const r = this.rows();
    return [...r.slice(1), ...r.slice(0, 1)];
  });

  protected readonly problems = computed(() =>
    this.rows()
      .filter((r) => r.on && toMinutes(r.end) - toMinutes(r.start) < this.slotMinutes())
      .map((r) => r.name),
  );

  protected readonly summary = computed(() => {
    const on = this.rows().filter((r) => r.on);
    const slots = on.reduce(
      (n, r) => n + Math.max(0, Math.floor((toMinutes(r.end) - toMinutes(r.start)) / this.slotMinutes())),
      0,
    );
    return { days: on.length, slots };
  });

  constructor() {
    // Fill the form from the saved hours whenever the profile (re)loads.
    effect(() => {
      const profile = this.store.profile();
      untracked(() => profile && this.reset());
    });
  }

  protected reset(): void {
    const saved = this.store.profile()?.availability ?? [];
    this.slotMinutes.set(saved[0]?.slotMinutes ?? 30);
    this.rows.set(
      NAMES.map((name, day) => {
        const s = saved.find((a) => a.day === day);
        return { day, name, on: !!s, start: s?.start ?? '09:00', end: s?.end ?? '13:00' };
      }),
    );
    this.dirty.set(false);
  }

  protected slotsFor(r: DayRow): number {
    return Math.max(0, Math.floor((toMinutes(r.end) - toMinutes(r.start)) / this.slotMinutes()));
  }

  protected patch(day: number, change: Partial<DayRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.day === day ? { ...r, ...change } : r)));
    this.dirty.set(true);
  }

  protected setSlot(minutes: number): void {
    this.slotMinutes.set(minutes);
    this.dirty.set(true);
  }

  /** Copies one day's hours to every working day. */
  protected applyToAll(source: DayRow): void {
    this.rows.update((rows) => rows.map((r) => (r.on ? { ...r, start: source.start, end: source.end } : r)));
    this.dirty.set(true);
  }

  protected async save(): Promise<void> {
    if (this.problems().length || this.saving()) return;
    this.saving.set(true);
    try {
      const days = this.rows()
        .filter((r) => r.on)
        .map(({ day, start, end }) => ({ day, start, end }));
      const { availability, outsideHours } = await doctorApi.saveAvailability(this.slotMinutes(), days);
      this.store.profile.update((p) => (p ? { ...p, availability } : p));
      this.notify.success(
        'Availability saved. Patients now see your new days and times.' +
          (outsideHours
            ? ` ${outsideHours} booked appointment${outsideHours === 1 ? ' falls' : 's fall'} outside these hours and stay booked.`
            : ''),
      );
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
