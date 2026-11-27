import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'MedPoint HMS | Home',
    loadComponent: () => import('./pages/home/home').then((m) => m.Home),
  },
  {
    path: 'departments',
    title: 'MedPoint HMS | Our Departments',
    loadComponent: () => import('./pages/departments/departments').then((m) => m.Departments),
  },
  {
    path: 'departments/:slug',
    title: 'MedPoint HMS | Department',
    loadComponent: () =>
      import('./pages/department-detail/department-detail').then((m) => m.DepartmentDetail),
  },
  {
    path: 'forgot-password',
    title: 'MedPoint HMS | Update password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'contact',
    title: 'MedPoint HMS | Contact',
    loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
  },
  {
    path: 'login',
    title: 'MedPoint HMS | Login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'signup',
    title: 'MedPoint HMS | Sign up',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/signup/signup').then((m) => m.Signup),
  },
  {
    path: 'dashboard',
    title: 'MedPoint HMS | Dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard),
  },
  { path: '**', redirectTo: '' },
];
