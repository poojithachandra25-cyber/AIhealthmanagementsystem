import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { errorMessage } from '../../../../core/api';
import { fileSize, fileToBase64, openProtectedFile } from '../../../../core/files';
import { NotifyService } from '../../../../core/notify.service';
import { AppointmentStatus, fromIso, fullDate, timeLabel } from '../../dashboard.data';
import { BILL_STATUS, RECORD_META, UPLOAD_MAX_BYTES, UPLOAD_TYPES, UploadedReport } from '../../patient/patient.api';
import { openReportViewer } from '../../report-viewer';
import {
  canRecord,
  CaseFile,
  CaseRecord,
  Consultation,
  DoctorAppointment,
  doctorApi,
  hasStarted,
  NEXT_STATUSES,
  patientMeta,
} from '../doctor.api';
import type { DoctorStore } from '../doctor.store';
import { PrescriptionForm } from '../prescription-form/prescription-form';

export interface CaseDialogData {
  appointmentId: number;
  /** `view`: read-only history and records. `update`: also the prescription form and outcome actions. */
  mode: 'view' | 'update';
  store: DoctorStore;
}

const ACTIONS: Partial<Record<AppointmentStatus, { label: string; icon: string }>> = {
  confirmed: { label: 'Confirm', icon: 'check_circle' },
  completed: { label: 'Mark completed', icon: 'task_alt' },
  missed: { label: 'Mark missed', icon: 'person_off' },
  cancelled: { label: 'Cancel', icon: 'cancel' },
};

@Component({
  selector: 'app-case-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    PrescriptionForm,
  ],
  templateUrl: './case-dialog.html',
  styleUrl: './case-dialog.scss',
})
export class CaseDialog implements OnInit {
  private readonly ref = inject<MatDialogRef<CaseDialog, DoctorAppointment>>(MatDialogRef);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  protected readonly data = inject<CaseDialogData>(MAT_DIALOG_DATA);

  protected readonly update = this.data.mode === 'update';
  protected readonly meta = RECORD_META;
  protected readonly billMeta = BILL_STATUS;
  protected readonly actions = ACTIONS;
  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly timeLabel = timeLabel;
  protected readonly patientMeta = patientMeta;
  protected readonly fileSize = fileSize;

  protected readonly file = signal<CaseFile | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** Prescription tab when updating, History when viewing. */
  protected readonly tab = signal(this.update ? 3 : 2);

  // Reports tab: adding a lab report.
  protected readonly reportTitle = signal('');
  protected readonly reportDetails = signal('');
  protected readonly reportFile = signal<File | null>(null);
  protected readonly reportFileError = signal('');
  /** A lab report needs a name, plus results, a file, or both. */
  protected readonly canAddReport = computed(
    () => !!this.reportTitle().trim() && (!!this.reportDetails().trim() || !!this.reportFile()),
  );
  protected readonly savingReport = signal(false);
  protected readonly confirmDelete = signal<number | null>(null);

  protected readonly appt = computed(() => this.file()?.appointment ?? null);
  protected readonly labReports = computed(() => (this.file()?.records ?? []).filter((r) => r.type === 'lab_report'));
  protected readonly otherRecords = computed(() => (this.file()?.records ?? []).filter((r) => r.type !== 'lab_report'));
  protected readonly canWrite = computed(() => !!this.appt() && canRecord(this.appt()!));

  /** Token: this visit's position in the doctor's schedule for that day. */
  protected readonly token = computed(() => {
    const a = this.appt();
    if (!a) return '';
    const day = this.data.store
      .appointments()
      .filter((x) => x.date === a.date && x.status !== 'cancelled')
      .sort((x, y) => x.time.localeCompare(y.time));
    const i = day.findIndex((x) => x.id === a.id);
    return i >= 0 ? String(i + 1) : '–';
  });

  protected readonly nextActions = computed(() => {
    const a = this.appt();
    if (!a || !this.update) return [];
    return (NEXT_STATUSES[a.status] ?? []).filter(
      (s) => (s !== 'completed' || a.date <= this.data.store.today) && (s !== 'missed' || hasStarted(a)),
    );
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.file.set(await doctorApi.caseFile(this.data.appointmentId));
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected async setStatus(status: AppointmentStatus): Promise<void> {
    const a = this.appt();
    if (!a) return;
    if (await this.data.store.setStatus(a, status)) await this.load();
  }

  /** The prescription form saved: refresh the file so History and Records show it. */
  protected async onSaved(result: { appointment: DoctorAppointment; consultation: Consultation }): Promise<void> {
    this.data.store.upsert(result.appointment);
    await this.load();
  }

  /** Checks the chosen report file in the browser; the server checks its contents again. */
  protected pickReportFile(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    input.value = '';
    this.reportFileError.set('');
    if (!file) return;
    if (!UPLOAD_TYPES.includes(file.type)) {
      this.reportFileError.set('Choose a PDF, PNG or JPG file.');
      return;
    }
    if (file.size > UPLOAD_MAX_BYTES) {
      this.reportFileError.set(`That file is ${fileSize(file.size)}. The limit is 5 MB.`);
      return;
    }
    this.reportFile.set(file);
    if (!this.reportTitle().trim()) this.reportTitle.set(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  }

  protected async addReport(): Promise<void> {
    const title = this.reportTitle().trim();
    if (!this.canAddReport() || this.savingReport()) return;
    this.savingReport.set(true);
    try {
      const picked = this.reportFile();
      const file = picked
        ? { fileName: picked.name, mimeType: picked.type, data: await fileToBase64(picked) }
        : undefined;
      const record = await doctorApi.addReport(this.data.appointmentId, title, this.reportDetails().trim(), file);
      this.file.update((f) => (f ? { ...f, records: [record, ...f.records] } : f));
      this.reportTitle.set('');
      this.reportDetails.set('');
      this.reportFile.set(null);
      this.notify.success(`Lab report "${record.title}" added to the patient's records.`);
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.savingReport.set(false);
    }
  }

  protected async removeReport(id: number): Promise<void> {
    if (this.confirmDelete() !== id) {
      this.confirmDelete.set(id);
      return;
    }
    this.confirmDelete.set(null);
    try {
      await doctorApi.deleteRecord(id);
      this.file.update((f) => (f ? { ...f, records: f.records.filter((r) => r.id !== id) } : f));
    } catch (err) {
      this.notify.error(errorMessage(err));
    }
  }

  /** Shows a doctor-recorded lab report: its results and its attached file, if any. */
  protected viewRecord(r: CaseRecord): void {
    openReportViewer(this.dialog, {
      title: r.title,
      kind: RECORD_META[r.type].label,
      meta: [`${r.doctor} · ${r.department}`, fullDate(fromIso(r.date))],
      details: r.details,
      file:
        r.fileName && r.fileMime
          ? {
              url: doctorApi.recordFileUrl(r.id),
              downloadUrl: doctorApi.recordFileUrl(r.id, true),
              name: r.fileName,
              mime: r.fileMime,
              size: r.fileSize,
            }
          : null,
    });
  }

  /** Shows a lab report the patient uploaded. */
  protected viewUpload(u: UploadedReport): void {
    const id = this.data.appointmentId;
    openReportViewer(this.dialog, {
      title: u.title,
      kind: 'Uploaded by the patient',
      meta: [`Report date ${fullDate(fromIso(u.date))}`],
      details: u.notes,
      file: {
        url: doctorApi.uploadFileUrl(id, u.id),
        downloadUrl: doctorApi.uploadFileUrl(id, u.id, true),
        name: u.fileName,
        mime: u.mimeType,
        size: u.size,
      },
    });
  }

  /** Opens (or downloads) a lab report the patient uploaded. */
  protected async openUpload(reportId: number, fileName: string, download: boolean): Promise<void> {
    try {
      await openProtectedFile(doctorApi.uploadFileUrl(this.data.appointmentId, reportId, download), fileName, download);
    } catch (err) {
      this.notify.error(errorMessage(err));
    }
  }

  protected close(): void {
    this.ref.close(this.appt() ?? undefined);
  }
}
