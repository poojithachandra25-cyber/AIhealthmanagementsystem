import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';

export interface MonthBucket {
  label: string;
  completed: number;
  upcoming: number;
  cancelled: number;
}

type SeriesKey = 'completed' | 'upcoming' | 'cancelled';

// Validated categorical slots 1–3 (dataviz reference palette, light surface).
const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'completed', label: 'Completed', color: '#2a78d6' },
  { key: 'upcoming', label: 'Upcoming', color: '#eb6834' },
  { key: 'cancelled', label: 'Cancelled', color: '#1baf7a' },
];

const H = 250;
const PAD = { top: 14, right: 8, bottom: 28, left: 34 };

const niceStep = (raw: number) => {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
};

/** A bar segment with only its top corners rounded (data end), flat on the baseline side. */
const topRounded = (x: number, y: number, w: number, h: number) => {
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

@Component({
  selector: 'app-appt-chart',
  template: `
    <div class="legend">
      <div class="tile">
        <span><i class="dot all"></i>All</span>
        <strong>{{ totals().all }}</strong>
      </div>
      @for (s of series; track s.key) {
        <div class="tile">
          <span><i class="dot" [style.background]="s.color"></i>{{ s.label }}</span>
          <strong>{{ totals()[s.key] }}</strong>
        </div>
      }
    </div>

    <div class="plot" #plot (mouseleave)="hover.set(null)">
      <svg [attr.viewBox]="'0 0 ' + w() + ' ' + h" role="img" aria-label="Appointments per month by status">
        @for (t of ticks(); track t.value) {
          <line [attr.x1]="pad.left" [attr.x2]="w() - pad.right" [attr.y1]="t.y" [attr.y2]="t.y" class="grid" />
          <text [attr.x]="pad.left - 8" [attr.y]="t.y + 4" class="axis" text-anchor="end">{{ t.value }}</text>
        }
        @for (col of columns(); track col.label; let i = $index) {
          <g [class.dim]="hover() !== null && hover() !== i">
            @for (seg of col.segments; track seg.key) {
              <path [attr.d]="seg.d" [attr.fill]="seg.color" />
            }
          </g>
          <text [attr.x]="col.cx" [attr.y]="h - 8" class="axis" text-anchor="middle">{{ col.label }}</text>
          <rect
            class="hit"
            [attr.x]="col.cx - col.cw / 2"
            [attr.y]="pad.top"
            [attr.width]="col.cw"
            [attr.height]="h - pad.top - pad.bottom"
            (mouseenter)="hover.set(i)"
          />
        }
      </svg>

      @if (hover() !== null) {
        @let col = columns()[hover()!];
        <div class="tip" [class.flip]="col.cx > w() / 2" [style.left.px]="col.cx">
          <strong>{{ col.label }}</strong>
          @for (s of series; track s.key) {
            <span><i class="dot" [style.background]="s.color"></i>{{ s.label }}<b>{{ col.data[s.key] }}</b></span>
          }
          <span class="sum">Total<b>{{ col.total }}</b></span>
        </div>
      }
    </div>

    <table class="sr-only">
      <caption>Appointments per month</caption>
      <tr><th>Month</th>@for (s of series; track s.key) {<th>{{ s.label }}</th>}</tr>
      @for (m of data(); track m.label) {
        <tr><td>{{ m.label }}</td><td>{{ m.completed }}</td><td>{{ m.upcoming }}</td><td>{{ m.cancelled }}</td></tr>
      }
    </table>
  `,
  styles: `
    :host { display: block; position: relative; }
    .legend { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .tile { padding: 10px 12px; border: 1px solid var(--dash-line); border-radius: 12px; }
    .tile span { display: flex; align-items: center; gap: 6px; color: var(--mp-ink-soft); font-size: .76rem; font-weight: 600; }
    .tile strong { display: block; margin-top: 4px; font-size: 1.3rem; font-weight: 800; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    .dot.all { background: var(--mp-ink); }
    .plot { position: relative; }
    svg { display: block; width: 100%; height: auto; }
    .grid { stroke: var(--dash-line); stroke-width: 1; }
    .axis { fill: var(--mp-muted); font-size: 11px; font-family: inherit; }
    g { transition: opacity .15s; }
    g.dim { opacity: .35; }
    .hit { fill: transparent; cursor: pointer; }
    .tip { position: absolute; top: 0; margin-left: 10px; min-width: 150px; padding: 10px 12px;
      border-radius: 10px; background: var(--dash-navy); color: #fff; font-size: .76rem; pointer-events: none;
      box-shadow: 0 10px 24px rgba(15, 23, 42, .2); }
    .tip.flip { margin-left: 0; transform: translateX(calc(-100% - 10px)); }
    .tip strong { display: block; margin-bottom: 6px; }
    .tip span { display: flex; align-items: center; gap: 6px; color: #cbd5e1; line-height: 1.7; }
    .tip b { margin-left: auto; color: #fff; }
    .tip .sum { margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,.15); }
    @media (max-width: 600px) { .legend { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `,
})
export class ApptChart {
  readonly data = input.required<MonthBucket[]>();

  protected readonly series = SERIES;
  /** Drawn at the plot's real pixel width so labels stay 11px on every screen. */
  protected readonly w = signal(640);
  private readonly plot = viewChild<ElementRef<HTMLElement>>('plot');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.plot()?.nativeElement;
      if (!el) return;
      const ro = new ResizeObserver(([entry]) => this.w.set(Math.max(280, Math.round(entry.contentRect.width))));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }
  protected readonly h = H;
  protected readonly pad = PAD;
  protected readonly hover = signal<number | null>(null);

  protected readonly totals = computed(() => {
    const t = { all: 0, completed: 0, upcoming: 0, cancelled: 0 };
    for (const m of this.data()) {
      for (const s of SERIES) t[s.key] += m[s.key];
    }
    t.all = t.completed + t.upcoming + t.cancelled;
    return t;
  });

  private readonly scale = computed(() => {
    const max = Math.max(1, ...this.data().map((m) => m.completed + m.upcoming + m.cancelled));
    const step = niceStep(max / 4);
    return { step, top: step * Math.ceil(max / step) };
  });

  private readonly y = (v: number) =>
    H - PAD.bottom - (v / this.scale().top) * (H - PAD.top - PAD.bottom);

  protected readonly ticks = computed(() => {
    const { step, top } = this.scale();
    const out = [];
    for (let v = 0; v <= top; v += step) out.push({ value: v, y: this.y(v) });
    return out;
  });

  protected readonly columns = computed(() => {
    const data = this.data();
    const cw = (this.w() - PAD.left - PAD.right) / data.length;
    const bw = Math.min(40, cw * 0.5);
    return data.map((m, i) => {
      const cx = PAD.left + cw * i + cw / 2;
      let acc = 0;
      const present = SERIES.filter((s) => m[s.key] > 0);
      const segments = present.map((s, idx) => {
        const y0 = this.y(acc) - (idx > 0 ? 2 : 0); // 2px surface gap between stacked fills
        acc += m[s.key];
        const y1 = this.y(acc);
        const hgt = Math.max(1, y0 - y1);
        const isTop = idx === present.length - 1;
        const x = cx - bw / 2;
        const d = isTop ? topRounded(x, y0 - hgt, bw, hgt) : `M${x},${y0 - hgt}h${bw}v${hgt}h${-bw}Z`;
        return { key: s.key, color: s.color, d };
      });
      return { label: m.label, cx, cw, segments, data: m, total: acc };
    });
  });
}
