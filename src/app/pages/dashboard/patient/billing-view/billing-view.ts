import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth.service';
import { NotifyService } from '../../../../core/notify.service';
import { fromIso, fullDate, timeLabel } from '../../dashboard.data';
import { Bill, BILL_STATUS, BillStatus, isPayable, money } from '../patient.api';
import { PatientStore } from '../patient.store';
import { PayDialog, PayDialogData } from '../pay-dialog/pay-dialog';
import { downloadInvoice } from '../pdf';

type Filter = 'all' | BillStatus;

@Component({
  selector: 'app-billing-view',
  imports: [MatIconModule],
  templateUrl: './billing-view.html',
  styleUrl: './billing-view.scss',
})
export class BillingView {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly auth = inject(AuthService);
  protected readonly store = inject(PatientStore);

  /** Bill id from `?pay=`: opens the payment dialog straight away (after booking). */
  readonly pay = input<string>();

  protected readonly money = money;
  protected readonly statusMeta = BILL_STATUS;
  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly timeLabel = timeLabel;
  protected readonly filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'paid', label: 'Success' },
    { id: 'failed', label: 'Failed' },
    { id: 'pending', label: 'Pending' },
    { id: 'refunded', label: 'Refunded' },
  ];

  protected readonly filter = signal<Filter>('all');
  private openedFor: number | null = null;

  protected readonly shown = computed(() =>
    this.filter() === 'all' ? this.store.bills() : this.store.bills().filter((b) => b.status === this.filter()),
  );

  protected readonly totals = computed(() => {
    const bills = this.store.bills();
    const sum = (list: Bill[]) => list.reduce((n, b) => n + b.total, 0);
    return {
      paid: sum(bills.filter((b) => b.status === 'paid')),
      due: sum(bills.filter(isPayable)),
      dueCount: bills.filter(isPayable).length,
      failed: bills.filter((b) => b.status === 'failed').length,
    };
  });

  constructor() {
    // Open the payment dialog for ?pay=<id> once bills have loaded.
    effect(() => {
      const id = Number(this.pay());
      const bill = this.store.bills().find((b) => b.id === id);
      if (!id || !bill || this.openedFor === id) return;
      this.openedFor = id;
      untracked(() => {
        this.router.navigate([], {
          queryParams: { pay: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        if (isPayable(bill)) this.openPayment(bill);
      });
    });
  }

  protected openPayment(bill: Bill): void {
    const user = this.auth.user();
    if (!user) return;
    this.dialog
      .open<PayDialog, PayDialogData, Bill>(PayDialog, {
        data: { bill, patientId: user.id },
        width: '560px',
        maxWidth: 'calc(100vw - 24px)',
        autoFocus: false,
      })
      .afterClosed()
      .subscribe((updated) => {
        if (!updated) return;
        this.store.updateBill(updated);
        if (updated.status === 'paid') this.notify.success(`Payment of ${money(updated.total)} received.`);
      });
  }

  protected invoice(bill: Bill): void {
    const user = this.auth.user();
    if (user) downloadInvoice(bill, user.id);
  }
}
