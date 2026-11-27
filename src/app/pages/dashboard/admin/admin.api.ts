// Types and API calls for the admin views (server/src/routes/admin.js).
import { api } from '../../../core/api';
import { AppointmentStatus } from '../dashboard.data';
import { AppointmentType, Bill, BillStatus, PaymentMethod } from '../patient/patient.api';

export interface AdminDepartment {
  id: number;
  slug: string;
  name: string;
}

export interface AdminDoctor {
  id: number;
  name: string;
  title: string;
  experience: number;
  qualifications: string | null;
  registrationNo: string | null;
  email: string | null;
  intro: string;
  image: string;
  departmentId: number;
  department: string;
  departmentSlug: string;
  userId: number | null;
  accountEmail: string | null;
  hasAccount: boolean;
  appointments: number;
  /** Consulting weekdays, 0 = Sunday. */
  days: number[];
}

export interface DoctorInput {
  name: string;
  title: string;
  departmentId: number;
  experience: number;
  qualifications: string;
  registrationNo: string;
  email: string;
  intro?: string;
  image?: string;
}

export interface AdminPatient {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  createdAt: string;
  appointments: {
    id: number;
    date: string;
    time: string;
    type: AppointmentType;
    status: AppointmentStatus;
    reason: string | null;
    doctor: string;
    department: string;
    billStatus: BillStatus | null;
    billTotal: number | null;
  }[];
}

export interface RevenueRow {
  label: string;
  revenue: number;
  bills: number;
  department?: string;
}

export interface Revenue {
  totals: {
    collected: number;
    net: number;
    gst: number;
    paidCount: number;
    refunded: number;
    refundedCount: number;
    due: number;
    dueCount: number;
    failedCount: number;
    thisMonth: number;
    lastMonth: number;
  };
  byMonth: { month: string; revenue: number; bills: number }[];
  byDepartment: RevenueRow[];
  byDoctor: RevenueRow[];
  byMethod: { method: PaymentMethod; revenue: number; bills: number }[];
  recent: Bill[];
}

export const adminApi = {
  departments: () => api.get<AdminDepartment[]>('/admin/departments').then((r) => r.data),
  doctors: () => api.get<AdminDoctor[]>('/admin/doctors').then((r) => r.data),
  addDoctor: (body: DoctorInput) => api.post<AdminDoctor>('/admin/doctors', body).then((r) => r.data),
  updateDoctor: (id: number, body: DoctorInput) =>
    api.put<AdminDoctor>(`/admin/doctors/${id}`, body).then((r) => r.data),
  patients: () => api.get<AdminPatient[]>('/admin/patients').then((r) => r.data),
  revenue: () => api.get<Revenue>('/admin/revenue').then((r) => r.data),
};
