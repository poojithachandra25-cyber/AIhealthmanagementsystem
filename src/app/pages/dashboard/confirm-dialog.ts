import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogConfig,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { dayLabel, fromIso, timeLabel } from './dashboard.data';

export interface CancelDialogData {
  /** Who the appointment is with, from the reader's side: the doctor or the patient. */
  withName: string;
  department?: string;
  date: string;
  time: string;
  /** Refund message: `warn` when no refund will be given, `info` otherwise. */
  note?: { tone: 'warn' | 'info'; text: string };
}

/** Opens the cancel confirmation; resolves to true only when the user confirms. */
export async function confirmCancel(dialog: MatDialog, data: CancelDialogData): Promise<boolean> {
  const config: MatDialogConfig<CancelDialogData> = {
    data,
    width: '420px',
    maxWidth: 'calc(100vw - 24px)',
  };
  return !!(await firstValueFrom(dialog.open(CancelDialog, config).afterClosed()));
}

/** Asks to confirm a cancellation, for patients and doctors alike. Closes with `true` when confirmed. */
@Component({
  selector: 'app-cancel-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="body">
      <span class="icon"><mat-icon>event_busy</mat-icon></span>
      <h2 mat-dialog-title>Cancel appointment?</h2>
      <mat-dialog-content>
        <p>
          Do you want to cancel the appointment with <strong>{{ a.withName }}</strong>?
        </p>
        <div class="details">
          @if (a.department) {
            <span><mat-icon>medical_services</mat-icon>{{ a.department }}</span>
          }
          <span><mat-icon>event</mat-icon>{{ when }}</span>
        </div>
        @if (a.note; as note) {
          <p class="note" [class.warn]="note.tone === 'warn'" role="note">
            <mat-icon>{{ note.tone === 'warn' ? 'money_off' : 'currency_rupee' }}</mat-icon>
            {{ note.text }}
          </p>
        }
        <small>This slot will be released for other patients.</small>
      </mat-dialog-content>
    </div>
    <mat-dialog-actions>
      <button mat-stroked-button [mat-dialog-close]="false" cdkFocusInitial>No, keep it</button>
      <button mat-flat-button class="danger" [mat-dialog-close]="true">Yes, cancel</button>
    </mat-dialog-actions>
  `,
  styles: `
    .note {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #dcfce7;
      color: #166534;
      font-size: 0.86rem;
      font-weight: 700;
      text-align: left;

      mat-icon {
        flex-shrink: 0;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      &.warn {
        background: #fee2e2;
        color: #991b1b;
      }
    }
    .body {
      display: grid;
      justify-items: center;
      padding-top: 24px;
      text-align: center;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #fee2e2;
      color: #b91c1c;

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
      }
    }
    h2 {
      padding-bottom: 0;
      font-weight: 800;
    }
    p {
      margin: 0 0 14px;
      color: var(--mp-ink);
    }
    .details {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;

      span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 8px;
        background: var(--dash-bg);
        color: var(--mp-ink-soft);
        font-size: 0.8rem;
        font-weight: 700;
      }
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }
    small {
      color: var(--mp-muted);
    }
    mat-dialog-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding: 8px 24px 24px;
    }
    .danger {
      --mat-button-filled-container-color: #b91c1c;
      --mat-button-filled-label-text-color: #fff;
    }
  `,
})
export class CancelDialog {
  protected readonly a = inject<CancelDialogData>(MAT_DIALOG_DATA);
  protected readonly when = `${dayLabel(fromIso(this.a.date))} · ${timeLabel(this.a.time)}`;
}
