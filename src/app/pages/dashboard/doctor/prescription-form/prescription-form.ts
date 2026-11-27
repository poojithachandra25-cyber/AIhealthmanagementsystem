import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { errorMessage } from '../../../../core/api';
import { NotifyService } from '../../../../core/notify.service';
import {
  Consultation,
  DoctorAppointment,
  doctorApi,
  Medicine,
  SUGGESTED_TESTS,
} from '../doctor.api';

const blankMedicine = (): Medicine => ({ name: '', dosage: '', frequency: '', duration: '' });

/**
 * The Update → Prescription tab: diagnosis, vitals, medicines, advice and suggested tests.
 * Saving publishes it to the patient's Medical Records.
 */
@Component({
  selector: 'app-prescription-form',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule],
  templateUrl: './prescription-form.html',
  styleUrl: './prescription-form.scss',
})
export class PrescriptionForm implements OnInit {
  private readonly notify = inject(NotifyService);

  readonly appointment = input.required<DoctorAppointment>();
  readonly consultation = input<Consultation | null>(null);
  /** YYYY-MM-DD; decides whether "Save & mark completed" is offered. */
  readonly today = input.required<string>();
  readonly saved = output<{ appointment: DoctorAppointment; consultation: Consultation }>();

  protected readonly suggestions = SUGGESTED_TESTS;

  protected readonly diagnosis = signal('');
  protected readonly bloodPressure = signal('');
  protected readonly pulse = signal('');
  protected readonly temperature = signal('');
  protected readonly weight = signal('');
  protected readonly medicines = signal<Medicine[]>([blankMedicine()]);
  protected readonly advice = signal('');
  protected readonly tests = signal<string[]>([]);
  protected readonly customTest = signal('');

  protected readonly saving = signal(false);
  protected readonly touched = signal(false);

  protected readonly canComplete = computed(
    () => this.appointment().status === 'confirmed' && this.appointment().date <= this.today(),
  );
  /** Custom tests the doctor typed, shown as chips alongside the suggestions. */
  protected readonly extraTests = computed(() => this.tests().filter((t) => !SUGGESTED_TESTS.includes(t)));

  ngOnInit(): void {
    const c = this.consultation();
    if (!c) return;
    this.diagnosis.set(c.diagnosis);
    this.bloodPressure.set(c.bloodPressure ?? '');
    this.pulse.set(c.pulse ?? '');
    this.temperature.set(c.temperature ?? '');
    this.weight.set(c.weight ?? '');
    this.medicines.set(c.medicines.length ? c.medicines.map((m) => ({ ...m, dosage: m.dosage ?? '', frequency: m.frequency ?? '', duration: m.duration ?? '' })) : [blankMedicine()]);
    this.advice.set(c.advice ?? '');
    this.tests.set(c.tests);
  }

  protected setMedicine(index: number, field: keyof Medicine, value: string): void {
    this.medicines.update((list) => list.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  protected addMedicine(): void {
    this.medicines.update((list) => [...list, blankMedicine()]);
  }

  protected removeMedicine(index: number): void {
    this.medicines.update((list) => (list.length > 1 ? list.filter((_, i) => i !== index) : [blankMedicine()]));
  }

  protected toggleTest(test: string): void {
    this.tests.update((list) => (list.includes(test) ? list.filter((t) => t !== test) : [...list, test]));
  }

  protected addCustomTest(): void {
    const test = this.customTest().trim().replace(/,/g, ' ');
    if (test && !this.tests().includes(test)) this.tests.update((list) => [...list, test]);
    this.customTest.set('');
  }

  protected async save(complete: boolean): Promise<void> {
    this.touched.set(true);
    if (!this.diagnosis().trim() || this.saving()) return;
    const medicines = this.medicines().filter((m) => m.name.trim() || m.dosage.trim() || m.frequency.trim() || m.duration.trim());
    if (medicines.some((m) => !m.name.trim())) {
      this.notify.error('Every medicine needs a name, or remove the empty row.');
      return;
    }
    this.saving.set(true);
    try {
      const result = await doctorApi.saveConsultation(this.appointment().id, {
        diagnosis: this.diagnosis(),
        bloodPressure: this.bloodPressure(),
        pulse: this.pulse(),
        temperature: this.temperature(),
        weight: this.weight(),
        medicines,
        advice: this.advice(),
        tests: this.tests(),
        complete,
      });
      this.notify.success(
        complete
          ? 'Prescription saved and the visit marked completed. The patient can see it now.'
          : "Prescription saved to the patient's medical records.",
      );
      this.saved.emit(result);
    } catch (err) {
      this.notify.error(errorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
