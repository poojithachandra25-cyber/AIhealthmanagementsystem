// Types and API calls behind the doctor dashboard
// (server/src/routes/doctor-portal.js and doctor-cases.js).
import { api } from '../../../core/api';
import { AppointmentStatus, nowStamp } from '../dashboard.data';
import { AppointmentType, BillStatus, RecordType, UploadedReport } from '../patient/patient.api';

export interface DoctorAvailability {
  day: number;
  start: string;
  end: string;
  slotMinutes: number;
}

export interface DoctorProfile {
  id: number;
  name: string;
  title: string;
  experience: number;
  image: string;
  qualifications: string | null;
  registrationNo: string | null;
  intro: string;
  department: string;
  departmentSlug: string;
  accentFrom: string;
  accentTo: string;
  availability: DoctorAvailability[];
}

export interface DoctorAppointment {
  id: number;
  date: string;
  time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  reason: string | null;
  patientId: number;
  patient: string;
  patientEmail: string;
  patientPhone: string | null;
  patientDob: string | null;
  patientGender: string | null;
  recordCount: number;
  hasConsultation: boolean;
  billStatus: BillStatus | null;
}

export interface CaseRecord {
  id: number;
  type: RecordType;
  title: string;
  details: string | null;
  date: string;
  appointmentId: number | null;
  consultationId: number | null;
  doctor: string;
  department: string;
  /** Written by the signed-in doctor. */
  mine: boolean;
  /** Attached report file, if any (fetched separately). */
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
}

export interface Medicine {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface Consultation {
  diagnosis: string;
  bloodPressure: string | null;
  pulse: string | null;
  temperature: string | null;
  weight: string | null;
  advice: string | null;
  tests: string[];
  medicines: Medicine[];
}

export interface CasePatient {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface CaseFile {
  appointment: DoctorAppointment;
  patient: CasePatient;
  history: { id: number; date: string; time: string; type: AppointmentType; status: AppointmentStatus; reason: string | null; diagnosis: string | null }[];
  records: CaseRecord[];
  /** Lab reports the patient uploaded themselves. */
  uploads: UploadedReport[];
  consultation: Consultation | null;
}

export interface PatientRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  total: number;
  completed: number;
  missed: number;
  cancelled: number;
  lastVisit: string | null;
  /** Upcoming pending/confirmed appointments, soonest first. */
  open: DoctorAppointment[];
}

export interface DoctorAccount {
  account: { id: number; name: string; email: string; phone: string | null; createdAt: string };
  doctor: DoctorProfile;
}

export const doctorApi = {
  me: () =>
    api
      .get<{ profile: DoctorProfile; appointments: DoctorAppointment[] }>('/doctor/me')
      .then((r) => r.data),
  setStatus: (id: number, status: AppointmentStatus) =>
    api.patch<DoctorAppointment>(`/doctor/appointments/${id}/status`, { status }).then((r) => r.data),
  caseFile: (appointmentId: number) =>
    api.get<CaseFile>(`/doctor/appointments/${appointmentId}/case`).then((r) => r.data),
  saveConsultation: (appointmentId: number, body: Consultation & { complete?: boolean }) =>
    api
      .put<{ appointment: DoctorAppointment; consultation: Consultation }>(
        `/doctor/appointments/${appointmentId}/consultation`,
        body,
      )
      .then((r) => r.data),
  addReport: (
    appointmentId: number,
    title: string,
    details: string,
    file?: { fileName: string; mimeType: string; data: string },
  ) =>
    api
      .post<CaseRecord>(`/doctor/appointments/${appointmentId}/reports`, { title, details, file }, { timeout: 60_000 })
      .then((r) => r.data),
  /** URL (for openProtectedFile / the viewer) of a file attached to a medical record. */
  recordFileUrl: (recordId: number, download = false) =>
    `/doctor/records/${recordId}/file${download ? '?download=1' : ''}`,
  deleteRecord: (id: number) => api.delete(`/doctor/records/${id}`),
  /** URL (for openProtectedFile) of a file the patient uploaded, via one of this doctor's appointments. */
  uploadFileUrl: (appointmentId: number, reportId: number, download = false) =>
    `/doctor/appointments/${appointmentId}/uploads/${reportId}/file${download ? '?download=1' : ''}`,
  patients: () => api.get<PatientRow[]>('/doctor/patients').then((r) => r.data),
  saveAvailability: (slotMinutes: number, days: { day: number; start: string; end: string }[]) =>
    api
      .put<{ availability: DoctorAvailability[]; outsideHours: number }>('/doctor/availability', {
        slotMinutes,
        days,
      })
      .then((r) => r.data),
  account: () => api.get<DoctorAccount>('/doctor/profile').then((r) => r.data),
  saveAccount: (body: { name: string; email: string; phone: string; intro: string }) =>
    api.put<DoctorAccount>('/doctor/profile', body).then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ message: string; token: string }>('/profile/password', { currentPassword, newPassword }).then((r) => r.data),
};

/** Status changes a doctor may make, mirroring TRANSITIONS on the server. */
export const NEXT_STATUSES: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'missed', 'cancelled'],
};

export const isOpen = (a: Pick<DoctorAppointment, 'status'>) =>
  a.status === 'pending' || a.status === 'confirmed';
export const hasStarted = (a: Pick<DoctorAppointment, 'date' | 'time'>) =>
  `${a.date}T${a.time}` <= nowStamp();

/** Prescriptions and records can be written once the doctor has accepted the visit. */
export const canRecord = (a: Pick<DoctorAppointment, 'status'>) =>
  a.status === 'confirmed' || a.status === 'completed';

/** Whole years since a YYYY-MM-DD birth date. */
export function ageOf(dob: string | null): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

/** "34 yrs · Female" style summary; empty when nothing is known. */
export function patientMeta(dob: string | null, gender: string | null): string {
  const age = ageOf(dob);
  return [age !== null ? `${age} yrs` : null, gender ? gender[0].toUpperCase() + gender.slice(1) : null]
    .filter(Boolean)
    .join(' · ');
}

/** Common tests a doctor can suggest in the advice section. */
export const SUGGESTED_TESTS = [
  'Complete blood count (CBC)',
  'Blood sugar (fasting)',
  'HbA1c',
  'Lipid profile',
  'Liver function test',
  'Kidney function test',
  'Thyroid profile',
  'Urine routine',
  'Vitamin D',
  'Vitamin B12',
  'Dengue NS1',
  'Malaria antigen',
  'Typhoid (Widal)',
  'ECG',
  'Echocardiogram',
  'Chest X-ray',
  'Ultrasound abdomen',
  'CT scan',
  'MRI',
];
