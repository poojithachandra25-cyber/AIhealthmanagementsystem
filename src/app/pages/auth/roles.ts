import { Role } from '../../core/auth.service';

export interface RoleOption {
  value: Role;
  label: string;
  icon: string;
  tagline: string;
}

export const ROLE_OPTIONS: RoleOption[] = [
  { value: 'patient', label: 'Patient', icon: 'personal_injury', tagline: 'Book visits and view your records' },
  { value: 'doctor', label: 'Doctor', icon: 'healing', tagline: 'Manage schedules and patient care' },
  { value: 'admin', label: 'Admin', icon: 'admin_panel_settings', tagline: 'Run hospital operations' },
];
