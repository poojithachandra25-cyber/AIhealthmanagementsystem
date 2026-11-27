import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../../../core/api';
import { dayLabel, fromIso, timeLabel } from '../../dashboard.data';
import { Bill, money, patientApi, PaymentMethod } from '../patient.api';
import { downloadInvoice } from '../pdf';

export interface PayDialogData {
  bill: Bill;
  patientId: number;
}

/**
 * Dummy payment gateway. Nothing is charged: the server approves or declines
 * based on the test values listed in the dialog. Closes with the updated bill.
 */
@Component({
  selector: 'app-pay-dialog',
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './pay-dialog.html',
  styleUrl: './pay-dialog.scss',
})
export class PayDialog implements OnInit {
  private readonly ref = inject<MatDialogRef<PayDialog, Bill>>(MatDialogRef);
  private readonly data = inject<PayDialogData>(MAT_DIALOG_DATA);

  protected readonly bill = signal(this.data.bill);
  protected readonly money = money;
  protected readonly when = `${dayLabel(fromIso(this.data.bill.date))} · ${timeLabel(this.data.bill.time)}`;

  protected readonly method = signal<PaymentMethod>('card');
  protected readonly card = { name: signal(''), number: signal(''), expiry: signal(''), cvv: signal('') };
  protected readonly vpa = signal('');
  protected readonly bank = signal('');
  protected readonly banks = signal<{ code: string; name: string }[]>([]);

  protected readonly paying = signal(false);
  protected readonly error = signal('');
  /** Set once the gateway has answered: shows the success or failure screen. */
  protected readonly outcome = signal<'paid' | 'failed' | null>(null);

  protected readonly payLabel = computed(() => `Pay ${money(this.bill().total)}`);

  constructor() {
    // Closing by Esc or backdrop still hands back the latest bill state.
    this.ref.disableClose = true;
    this.ref.backdropClick().subscribe(() => !this.paying() && this.close());
    this.ref.keydownEvents().subscribe((e) => e.key === 'Escape' && !this.paying() && this.close());
  }

  async ngOnInit(): Promise<void> {
    this.banks.set(await patientApi.banks().catch(() => []));
  }

  /** Groups card digits in fours as the user types. */
  protected formatCard(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 19);
    this.card.number.set(digits.replace(/(.{4})/g, '$1 ').trim());
  }

  /** Inserts the slash in MM/YY as the user types. */
  protected formatExpiry(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    this.card.expiry.set(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  }

  private details(): Record<string, string> {
    switch (this.method()) {
      case 'card':
        return {
          name: this.card.name(),
          number: this.card.number(),
          expiry: this.card.expiry(),
          cvv: this.card.cvv(),
        };
      case 'upi':
        return { vpa: this.vpa() };
      default:
        return { bank: this.bank() };
    }
  }

  protected async pay(): Promise<void> {
    if (this.paying()) return;
    this.paying.set(true);
    this.error.set('');
    try {
      // A short pause so the dummy gateway feels like a real round trip.
      const [bill] = await Promise.all([
        patientApi.pay(this.bill().id, { method: this.method(), details: this.details() }),
        new Promise((r) => setTimeout(r, 900)),
      ]);
      this.bill.set(bill);
      this.outcome.set(bill.status === 'paid' ? 'paid' : 'failed');
      this.card.cvv.set('');
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.paying.set(false);
    }
  }

  protected retry(): void {
    this.outcome.set(null);
    this.error.set('');
  }

  protected invoice(): void {
    downloadInvoice(this.bill(), this.data.patientId);
  }

  protected close(): void {
    this.ref.close(this.bill());
  }
}
