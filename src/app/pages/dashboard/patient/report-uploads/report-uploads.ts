import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { errorMessage } from '../../../../core/api';
import { fileSize, fileToBase64, openProtectedFile } from '../../../../core/files';
import { NotifyService } from '../../../../core/notify.service';
import { fromIso, fullDate, isoDate } from '../../dashboard.data';
import { patientApi, UPLOAD_MAX_BYTES, UPLOAD_TYPES, UploadedReport } from '../patient.api';
import { PatientStore } from '../patient.store';

/** "All my doctors" in the doctor picker (sent to the API as no doctor). */
const ALL_DOCTORS = 0;

/**
 * The patient's own lab report uploads (Medical Records page). Doctors with an
 * appointment see them in the case file's Reports tab.
 */
@Component({
  selector: 'app-report-uploads',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './report-uploads.html',
  styleUrl: './report-uploads.scss',
})
export class ReportUploads implements OnInit {
  private readonly notify = inject(NotifyService);
  private readonly store = inject(PatientStore);
  protected readonly allDoctors = ALL_DOCTORS;

  /** Doctors the patient has booked (not cancelled), each once - who a report can be sent to. */
  protected readonly doctors = computed(() => {
    const seen = new Map<number, { id: number; name: string; department: string }>();
    for (const a of this.store.appointments()) {
      if (a.status !== 'cancelled' && !seen.has(a.doctorId)) {
        seen.set(a.doctorId, { id: a.doctorId, name: a.doctor, department: a.department });
      }
    }
    return [...seen.values()];
  });

  /** Default: the doctor of the next upcoming visit, else all doctors. */
  private readonly defaultDoctor = computed(() => this.store.upcoming()[0]?.doctorId ?? ALL_DOCTORS);
  /** Chosen doctor; null until the patient picks, so the default can follow loaded data. */
  private readonly pickedDoctor = signal<number | null>(null);
  protected readonly doctorId = computed(() => this.pickedDoctor() ?? this.defaultDoctor());

  protected readonly fullDate = (iso: string) => fullDate(fromIso(iso));
  protected readonly fileSize = fileSize;
  protected readonly today = isoDate(new Date());
  protected readonly accept = '.pdf,.png,.jpg,.jpeg,' + UPLOAD_TYPES.join(',');

  protected readonly reports = signal<UploadedReport[]>([]);
  protected readonly loading = signal(true);
  protected readonly formOpen = signal(false);

  // Upload form
  protected readonly title = signal('');
  protected readonly date = signal(this.today);
  protected readonly notes = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly fileError = signal('');
  protected readonly uploading = signal(false);
  protected readonly confirmDelete = signal<number | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.reports.set(await patientApi.uploads());
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected pick(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    this.fileError.set('');
    if (file && !UPLOAD_TYPES.includes(file.type)) {
      this.fileError.set('Choose a PDF, PNG or JPG file.');
      input.value = '';
      return;
    }
    if (file && file.size > UPLOAD_MAX_BYTES) {
      this.fileError.set(`That file is ${fileSize(file.size)}. The limit is 5 MB.`);
      input.value = '';
      return;
    }
    this.file.set(file);
    // Suggest a test name from the file name if none was typed.
    if (file && !this.title().trim()) this.title.set(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  }

  protected pickDoctor(id: number): void {
    this.pickedDoctor.set(id);
  }

  protected reset(): void {
    this.title.set('');
    this.date.set(this.today);
    this.notes.set('');
    this.pickedDoctor.set(null);
    this.file.set(null);
    this.fileError.set('');
    this.formOpen.set(false);
  }

  protected async upload(): Promise<void> {
    const file = this.file();
    if (!file || !this.title().trim() || this.uploading()) return;
    this.uploading.set(true);
    try {
      const report = await patientApi.uploadReport({
        title: this.title().trim(),
        reportDate: this.date() || this.today,
        notes: this.notes().trim(),
        doctorId: this.doctorId() === ALL_DOCTORS ? null : this.doctorId(),
        fileName: file.name,
        mimeType: file.type,
        data: await fileToBase64(file),
      });
      this.reports.update((list) => [report, ...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id));
      this.notify.success(
        `"${report.title}" uploaded. ${report.doctorName ? `${report.doctorName} can now see it.` : 'All your doctors can now see it.'}`,
      );
      this.reset();
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.uploading.set(false);
    }
  }

  protected async open(r: UploadedReport, download: boolean): Promise<void> {
    try {
      await openProtectedFile(patientApi.uploadFileUrl(r.id, download), r.fileName, download);
    } catch (err) {
      this.notify.error(errorMessage(err));
    }
  }

  protected async remove(r: UploadedReport): Promise<void> {
    if (this.confirmDelete() !== r.id) {
      this.confirmDelete.set(r.id);
      return;
    }
    this.confirmDelete.set(null);
    try {
      await patientApi.deleteUpload(r.id);
      this.reports.update((list) => list.filter((x) => x.id !== r.id));
      this.notify.success(`"${r.title}" deleted.`);
    } catch (err) {
      this.notify.error(errorMessage(err));
    }
  }
}
