// Types and API calls behind the patient dashboard. Dates travel as 'YYYY-MM-DD'
// and times as 'HH:MM' (24h), both in the hospital's local time. Money is in INR.
import { api } from '../../../core/api';
import { AppointmentStatus, nowStamp } from '../dashboard.data';

export type AppointmentType = 'regular' | 'emergency';
export type RecordType = 'prescription' | 'lab_report' | 'diagnosis' | 'advice';
export type BillStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export type PaymentMethod = 'card' | 'upi' | 'netbanking';

export interface Availability {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  start: string;
  end: string;
}

export interface Doctor {
  id: number;
  name: string;
  title: string;
  experience: number;
  image: string;
  department: string;
  departmentSlug: string;
  accentFrom: string;
  accentTo: string;
  /** Department fees before GST. */
  consultationFee: number;
  emergencyFee: number;
  availability: Availability[];
}

export interface Appointment {
  id: number;
  date: string;
  time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  reason: string | null;
  doctorId: number;
  doctor: string;
  doctorTitle: string;
  doctorImage: string;
  department: string;
  departmentSlug: string;
  billId: number | null;
  billStatus: BillStatus | null;
  billTotal: number | null;
}

export interface MedicalRecord {
  id: number;
  type: RecordType;
  title: string;
  details: string | null;
  date: string;
  doctor: string;
  department: string;
  /** Report file a doctor attached, if any. */
  fileName: string | null;
  fileMime: string | null;
  fileSize: number | null;
}

/** A lab report the patient uploaded themselves (the file is fetched separately). */
export interface UploadedReport {
  id: number;
  title: string;
  notes: string | null;
  date: string;
  fileName: string;
  mimeType: 'application/pdf' | 'image/png' | 'image/jpeg';
  size: number;
  uploadedAt: string;
  /** The doctor it was sent to; null = shared with all the patient's doctors. */
  doctorId: number | null;
  doctorName: string | null;
}

export interface ReportUpload {
  title: string;
  reportDate: string;
  notes: string;
  /** Booked doctor it is for; null shares it with all the patient's doctors. */
  doctorId: number | null;
  fileName: string;
  mimeType: string;
  /** base64 file contents */
  data: string;
}

/** What patients may upload; the server checks the real file contents too. */
export const UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export interface Bill {
  id: number;
  invoiceNo: string;
  fee: number;
  gstRate: number;
  gst: number;
  total: number;
  status: BillStatus;
  method: PaymentMethod | null;
  methodDetail: string | null;
  transactionId: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  appointmentId: number;
  date: string;
  time: string;
  type: AppointmentType;
  appointmentStatus: AppointmentStatus;
  doctor: string;
  doctorTitle: string;
  department: string;
  patient: string;
  patientEmail: string;
  patientPhone: string | null;
}

export interface Profile {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  dateOfBirth: string | null;
  gender: 'female' | 'male' | 'other' | null;
  bloodGroup: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}

export interface Slot {
  time: string;
  available: boolean;
}

export interface BookingRequest {
  doctorId: number;
  date: string;
  time: string;
  type: AppointmentType;
  reason?: string;
}

export interface PaymentRequest {
  method: PaymentMethod;
  details: Record<string, string>;
}

export const patientApi = {
  doctors: () =>
    api
      .get<{ bookingWindowDays: number; gstRate: number; doctors: Doctor[] }>('/doctors')
      .then((r) => r.data),
  slots: (doctorId: number, date: string) =>
    api.get<{ slots: Slot[] }>(`/doctors/${doctorId}/slots`, { params: { date } }).then((r) => r.data.slots),
  appointments: () => api.get<Appointment[]>('/appointments/mine').then((r) => r.data),
  book: (body: BookingRequest) => api.post<Appointment>('/appointments', body).then((r) => r.data),
  cancel: (id: number) => api.patch<Appointment>(`/appointments/${id}/cancel`).then((r) => r.data),
  records: () => api.get<MedicalRecord[]>('/records/mine').then((r) => r.data),
  uploads: () => api.get<UploadedReport[]>('/records/uploads').then((r) => r.data),
  uploadReport: (body: ReportUpload) =>
    api.post<UploadedReport>('/records/uploads', body, { timeout: 60_000 }).then((r) => r.data),
  deleteUpload: (id: number) => api.delete(`/records/uploads/${id}`),
  /** URL for openProtectedFile(); ?download=1 asks the server to send it as an attachment. */
  /** URL of a file a doctor attached to one of the patient's records. */
  recordFileUrl: (id: number, download = false) => `/records/${id}/file${download ? '?download=1' : ''}`,
  uploadFileUrl: (id: number, download = false) => `/records/uploads/${id}/file${download ? '?download=1' : ''}`,
  bills: () => api.get<Bill[]>('/bills/mine').then((r) => r.data),
  banks: () => api.get<{ code: string; name: string }[]>('/bills/banks').then((r) => r.data),
  pay: (billId: number, body: PaymentRequest) =>
    api.post<Bill>(`/bills/${billId}/pay`, body).then((r) => r.data),
  profile: () => api.get<Profile>('/profile').then((r) => r.data),
  saveProfile: (body: Omit<Profile, 'id' | 'role' | 'createdAt'>) =>
    api.put<Profile>('/profile', body).then((r) => r.data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ message: string; token: string }>('/profile/password', { currentPassword, newPassword }).then((r) => r.data),
};

export { DAY_NAMES, fromIso, initialsOf, isoDate, timeLabel } from '../dashboard.data';

/** Upcoming means pending or confirmed and not yet started. */
export const isUpcoming = (a: Appointment) =>
  (a.status === 'pending' || a.status === 'confirmed') && `${a.date}T${a.time}` > nowStamp();

export const patientCode = (id: number) => `PT-${10000 + id}`;

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
/** ₹1,770.00 */
export const money = (n: number) => inr.format(n);
/** ₹1,770, for fee labels. */
export const moneyWhole = (n: number) => inrWhole.format(n);

/** GST and total for a fee, rounded to paise the same way the server does. */
export const withGst = (fee: number, rate: number) => {
  const gst = Math.round(fee * rate) / 100;
  return { fee, gst, total: Math.round((fee + gst) * 100) / 100 };
};

/** Bills that can still be paid. */
export const isPayable = (b: Pick<Bill, 'status'>) => b.status === 'pending' || b.status === 'failed';

export const BILL_STATUS: Record<BillStatus, { label: string; css: string }> = {
  paid: { label: 'Success', css: 'paid' },
  failed: { label: 'Failed', css: 'failed' },
  pending: { label: 'Pending', css: 'pending' },
  refunded: { label: 'Refunded', css: 'refunded' },
  cancelled: { label: 'Cancelled', css: 'cancelled' },
};

export const RECORD_META: Record<RecordType, { label: string; icon: string }> = {
  prescription: { label: 'Prescription', icon: 'medication' },
  lab_report: { label: 'Lab report', icon: 'science' },
  diagnosis: { label: 'Diagnosis', icon: 'assignment' },
  advice: { label: 'Doctor advice', icon: 'tips_and_updates' },
};

/** Record types the patient can download as a PDF. */
export const DOWNLOADABLE: RecordType[] = ['prescription', 'lab_report'];
