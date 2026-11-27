import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../../core/auth.service';
import { NotifyService } from '../../../../core/notify.service';
import { fromIso, fullDate } from '../../dashboard.data';
import { DOWNLOADABLE, MedicalRecord, patientApi, RECORD_META, RecordType } from '../patient.api';
import { PatientStore } from '../patient.store';
import { downloadRecord } from '../pdf';
import { ReportUploads } from '../report-uploads/report-uploads';
import { openReportViewer } from '../../report-viewer';

type Filter = 'all' | RecordType;

/** Medical records written by the patient's doctors: /dashboard?view=records */
@Component({
  selector: 'app-records-view',
  imports: [MatIconModule, ReportUploads],
  templateUrl: './records-view.html',
  styleUrl: './records-view.scss',
})
export class RecordsView {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  protected readonly store = inject(PatientStore);

  protected readonly meta = RECORD_META;
  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly filters: Filter[] = ['all', 'prescription', 'lab_report', 'diagnosis', 'advice'];
  protected readonly filter = signal<Filter>('all');
  protected readonly downloading = signal<number | null>(null);

  protected readonly counts = computed(() => {
    const counts: Record<string, number> = { all: this.store.records().length };
    for (const r of this.store.records()) counts[r.type] = (counts[r.type] ?? 0) + 1;
    return counts;
  });

  protected readonly shown = computed(() =>
    this.filter() === 'all'
      ? this.store.records()
      : this.store.records().filter((r) => r.type === this.filter()),
  );

  protected label(f: Filter): string {
    return f === 'all' ? 'All' : RECORD_META[f].label;
  }

  /** Opens a record whose doctor attached the report file (e.g. a lab report PDF or scan). */
  protected view(r: MedicalRecord): void {
    openReportViewer(this.dialog, {
      title: r.title,
      kind: RECORD_META[r.type].label,
      meta: [`${r.doctor} · ${r.department}`, fullDate(fromIso(r.date))],
      details: r.details,
      file:
        r.fileName && r.fileMime
          ? {
              url: patientApi.recordFileUrl(r.id),
              downloadUrl: patientApi.recordFileUrl(r.id, true),
              name: r.fileName,
              mime: r.fileMime,
              size: r.fileSize,
            }
          : null,
    });
  }

  protected canDownload(r: MedicalRecord): boolean {
    return DOWNLOADABLE.includes(r.type);
  }

  protected async download(r: MedicalRecord): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    this.downloading.set(r.id);
    try {
      await downloadRecord(r, user);
    } catch {
      this.notify.error('Could not create the PDF. Please try again.');
    } finally {
      this.downloading.set(null);
    }
  }
}
