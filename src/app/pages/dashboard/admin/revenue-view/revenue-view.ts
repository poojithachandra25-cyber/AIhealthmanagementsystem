import { Component, computed, OnInit, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { errorMessage } from '../../../../core/api';
import { fromIso, fullDate, timeLabel } from '../../dashboard.data';
import { BILL_STATUS, money, moneyWhole, PaymentMethod } from '../../patient/patient.api';
import { adminApi, Revenue } from '../admin.api';

/** Categorical slots 1–3 of the validated reference palette, in fixed order. */
const METHODS: { key: PaymentMethod; label: string; color: string }[] = [
  { key: 'card', label: 'Card', color: 'var(--series-1)' },
  { key: 'upi', label: 'UPI', color: 'var(--series-2)' },
  { key: 'netbanking', label: 'Net banking', color: 'var(--series-3)' },
];

/** Round a raw axis step up to 1, 2 or 5 × 10ⁿ. */
const niceStep = (raw: number) => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
};

/** Revenue from bill payments, as a dashboard: /dashboard?view=revenue */
@Component({
  selector: 'app-admin-revenue',
  imports: [MatIconModule, MatProgressSpinnerModule],
  templateUrl: './revenue-view.html',
  styleUrl: './revenue-view.scss',
})
export class AdminRevenueView implements OnInit {
  protected readonly money = money;
  protected readonly moneyWhole = moneyWhole;
  protected readonly billMeta = BILL_STATUS;
  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly timeLabel = timeLabel;

  protected readonly data = signal<Revenue | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** Index of the hovered/focused month column, for the tooltip. */
  protected readonly hover = signal<number | null>(null);

  protected readonly kpis = computed(() => {
    const t = this.data()?.totals;
    if (!t) return [];
    const change = t.lastMonth ? Math.round(((t.thisMonth - t.lastMonth) / t.lastMonth) * 100) : null;
    return [
      {
        icon: 'payments',
        label: 'Total revenue',
        value: money(t.collected),
        note: `${t.paidCount} successful payment${t.paidCount === 1 ? '' : 's'}`,
      },
      {
        icon: 'calendar_month',
        label: 'This month',
        value: money(t.thisMonth),
        note: change === null ? `Last month ${moneyWhole(t.lastMonth)}` : `${change >= 0 ? '+' : ''}${change}% vs last month`,
      },
      {
        icon: 'medical_services',
        label: 'Consultation fees',
        value: money(t.net),
        note: `+ ${money(t.gst)} GST collected`,
      },
      {
        icon: 'pending_actions',
        label: 'Pending dues',
        value: money(t.due),
        note: `${t.dueCount} unpaid · ${t.failedCount} failed · ${money(t.refunded)} refunded`,
      },
    ];
  });

  /** Last 6 months, oldest first, including months with no revenue. */
  protected readonly months = computed(() => {
    const rows = this.data()?.byMonth ?? [];
    const list = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (5 - i));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const row = rows.find((r) => r.month === key);
      return {
        key,
        label: d.toLocaleString('en-GB', { month: 'short' }),
        long: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
        revenue: row?.revenue ?? 0,
        bills: row?.bills ?? 0,
      };
    });
    const max = Math.max(...list.map((m) => m.revenue));
    const step = niceStep(Math.max(max, 1000) / 4);
    const top = Math.max(step * 4, Math.ceil(max / step) * step);
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    return { list, top, ticks, empty: max === 0 };
  });

  protected readonly departments = computed(() => {
    const rows = this.data()?.byDepartment ?? [];
    const max = Math.max(1, ...rows.map((r) => r.revenue));
    return rows.map((r) => ({ ...r, pct: (r.revenue / max) * 100 }));
  });

  protected readonly methods = computed(() => {
    const rows = this.data()?.byMethod ?? [];
    const total = rows.reduce((n, r) => n + r.revenue, 0);
    return METHODS.map((m) => {
      const row = rows.find((r) => r.method === m.key);
      const revenue = row?.revenue ?? 0;
      return { ...m, revenue, bills: row?.bills ?? 0, share: total ? Math.round((revenue / total) * 100) : 0 };
    });
  });
  protected readonly methodTotal = computed(() => this.methods().reduce((n, m) => n + m.revenue, 0));

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.error.set('');
    try {
      this.data.set(await adminApi.revenue());
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Short axis label: ₹0, ₹500, ₹1.5k, ₹20k. */
  protected axis(n: number): string {
    return n >= 1000 ? `₹${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}k` : `₹${n}`;
  }
}
