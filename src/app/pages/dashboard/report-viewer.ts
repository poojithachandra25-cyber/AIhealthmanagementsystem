import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { api, errorMessage } from '../../core/api';
import { fileSize, openProtectedFile } from '../../core/files';

export interface ReportViewerData {
  title: string;
  /** e.g. "Lab report" or "Uploaded by the patient". */
  kind: string;
  /** Lines under the title: doctor, dates, file name… */
  meta: string[];
  details?: string | null;
  /** Protected API URL of the attached file, if there is one. */
  file?: { url: string; downloadUrl: string; name: string; mime: string; size: number | null } | null;
}

/** Opens the viewer for a lab report (details plus an inline preview of its file). */
export function openReportViewer(dialog: MatDialog, data: ReportViewerData): void {
  dialog.open(ReportViewer, { data, width: '820px', maxWidth: 'calc(100vw - 24px)', autoFocus: false });
}

/**
 * Shows a lab report: its details and, when a file is attached, the file itself
 * (an image inline, a PDF in a frame). The file is fetched with the user's token.
 */
@Component({
  selector: 'app-report-viewer',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <header class="head">
      <span class="ic"><mat-icon>science</mat-icon></span>
      <div class="who">
        <small class="kind">{{ data.kind }}</small>
        <h2 mat-dialog-title>{{ data.title }}</h2>
        @for (line of data.meta; track $index) {
          <small>{{ line }}</small>
        }
      </div>
      <button mat-icon-button mat-dialog-close aria-label="Close"><mat-icon>close</mat-icon></button>
    </header>

    <mat-dialog-content>
      @if (data.details) {
        <section class="details">
          <h3>Results</h3>
          <p>{{ data.details }}</p>
        </section>
      }

      @if (data.file; as f) {
        <section class="preview">
          @if (loading()) {
            <div class="state"><mat-spinner diameter="26" /> Loading the report…</div>
          } @else if (error()) {
            <div class="state error">{{ error() }}</div>
          } @else if (f.mime === 'application/pdf' && pdfUrl()) {
            <iframe [src]="pdfUrl()" [title]="data.title"></iframe>
          } @else if (imageUrl()) {
            <img [src]="imageUrl()" [alt]="data.title" />
          }
        </section>
      } @else if (!data.details) {
        <p class="state">No results or file were added to this report.</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      @if (data.file; as f) {
        <small class="file">{{ f.name }}{{ f.size ? ' · ' + size(f.size) : '' }}</small>
        <button mat-button (click)="newTab()"><mat-icon>open_in_new</mat-icon>Open in new tab</button>
        <button mat-stroked-button (click)="download()"><mat-icon>download</mat-icon>Download</button>
      }
      <button mat-flat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: `
    .head {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 18px 12px 12px 24px;
      border-bottom: 1px solid var(--dash-line);
    }
    .ic {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      background: #dbeafe;
      color: #1d4ed8;
    }
    .who {
      display: grid;
      flex: 1;
      min-width: 0;

      small {
        color: var(--mp-muted);
        font-size: 0.78rem;
      }
      .kind {
        color: #1d4ed8;
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
    }
    h2 {
      margin: 2px 0;
      padding: 0;
      font-weight: 800;
      &::before {
        display: none;
      }
    }
    mat-dialog-content {
      display: grid;
      gap: 16px;
      padding-top: 16px !important;
    }
    .details {
      padding: 14px 16px;
      border-radius: 12px;
      background: var(--dash-bg);

      h3 {
        margin: 0 0 6px;
        font-size: 0.8rem;
        font-weight: 800;
      }
      p {
        margin: 0;
        color: var(--mp-ink-soft);
        font-size: 0.88rem;
        white-space: pre-line;
      }
    }
    .preview {
      border: 1px solid var(--dash-line);
      border-radius: 12px;
      overflow: hidden;
      background: #f8fafc;

      iframe {
        display: block;
        width: 100%;
        height: min(70vh, 640px);
        border: 0;
      }
      img {
        display: block;
        max-width: 100%;
        max-height: 70vh;
        margin: 0 auto;
        object-fit: contain;
      }
    }
    .state {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      padding: 24px;
      color: var(--mp-ink-soft);
      &.error {
        color: #b91c1c;
      }
    }
    .file {
      margin-right: auto;
      overflow: hidden;
      color: var(--mp-muted);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    mat-dialog-actions mat-icon {
      margin-right: 4px;
    }
  `,
})
export class ReportViewer implements OnInit, OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly data = inject<ReportViewerData>(MAT_DIALOG_DATA);

  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly pdfUrl = signal<SafeResourceUrl | null>(null);
  protected readonly imageUrl = signal<string | null>(null);
  protected readonly size = fileSize;
  private objectUrl: string | null = null;

  async ngOnInit(): Promise<void> {
    const f = this.data.file;
    if (!f) return;
    this.loading.set(true);
    try {
      const { data } = await api.get<Blob>(f.url, { responseType: 'blob' });
      this.objectUrl = URL.createObjectURL(data);
      // The blob URL is our own fetched file, so it is safe to frame.
      if (f.mime === 'application/pdf') this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
      else this.imageUrl.set(this.objectUrl);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected newTab(): void {
    const f = this.data.file;
    if (f) openProtectedFile(f.url, f.name, false).catch((err) => this.error.set(errorMessage(err)));
  }

  protected download(): void {
    const f = this.data.file;
    if (f) openProtectedFile(f.downloadUrl, f.name, true).catch((err) => this.error.set(errorMessage(err)));
  }

  ngOnDestroy(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}
