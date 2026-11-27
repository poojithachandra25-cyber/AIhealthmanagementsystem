# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project goals

MedPoint is a Hospital Management System. The requirements are in [Projectscope.md](Projectscope.md):


- **Frontend:** latest Angular with **Angular Material**. Every page must be responsive, professional and eye-catching.
- **Navbar:** Home, Our Departments, Contact and a Login button. The About Us content lives on the Home page (`pages/home/about-section/`, anchor `#about`), and departments have their own page at `/departments`. There is no separate About page.
- Later feature specs live in `Specs/`. Read them alongside Projectscope.md. `Specs/layout.md` covers:
  - the Our Departments dropdown (opens on hover and click)
  - department pages listing doctors, whose Book an Appointment buttons go to `/login`
  - Admin as a Sign up option
  - a Forgot password → Update password page
- **Roles:** login supports three roles: Patient, Doctor and Admin. The Login and Sign up pages must look professional.
- **Backend:** Node.js + Express, called from the frontend with **axios**. Do not use Angular `HttpClient`.
- Projectscope.md says "LMS website", which looks like a template leftover; the product is the hospital system.
- The layout is supposed to follow a reference image the user shares. It is not in the repo; ask for it before reworking the layout.

## Commands

The frontend (repo root) and the backend (`server/`) run as separate processes. Start both:

- `npm run server`: Express API at http://localhost:3000 (`node --watch`). Run `npm run server:install` first on a fresh clone. MySQL must be running.
- `npm start`: Angular dev server at http://localhost:4200. `proxy.conf.json` forwards `/api/*` to port 3000. Restart it after changing the proxy.
- `npm run build`: production build to `dist/`
- `npm test -- --watch=false`: Vitest unit tests (jsdom, via `@angular/build:unit-test`, not Karma)
- Single spec: `npx ng test --watch=false --include src/app/app.spec.ts`
- Format: `npx prettier --write .` (100-character lines, single quotes)

## Frontend architecture

- **Standalone and zoneless** (no `zone.js`): put state that the UI reads in signals. axios promises resolve outside Angular, so a plain field change will not re-render.
- **Angular 22 naming:** no `.component` suffix on files or `Component` on class names (`login.ts`, class `Login`).
- `app.ts` / `app.html` is the **shell**: sticky navbar (it collapses to a `mat-menu` below 860px), `<router-outlet>`, footer. When signed in, the Login button becomes a user menu with Dashboard and Log out.
- **Routes** (`app.routes.ts`) are all lazy `loadComponent` routes to `src/app/pages/*`. `/login`, `/signup` and `/forgot-password` use `guestGuard`; `/dashboard` uses `authGuard`. The router uses `withComponentInputBinding()`, so route and query params bind to component `input()`s. Examples: `slug` on `/departments/:slug`, and `doctor`/`department` query params on `/login`.
- **Department and doctor data** is static in `core/departments.data.ts` (`DEPARTMENTS`): 6 departments with 3 doctors each. The user asked to keep only 6.
  - Each department has its own `accent` gradient. `accentVars()` exposes it as the `--accent-1`/`--accent-2` CSS variables, which cascade into child components such as the doctor and department cards.
  - Use dark-enough accent colours: white text sits on them.

  `DEPARTMENTS` is the single source for:
  - the navbar dropdown (`layout/dept-dropdown/`, a custom hover/click panel rather than `mat-menu`, because `mat-menu` doesn't open on hover)
  - the `/departments` list and the `/departments/:slug` detail page
  - the doctor specialization list on Sign up

  Doctor photos are placeholder `randomuser.me` portraits. They fall back to initials if a photo fails to load.
- **`core/`:**
  - `api.ts`: the shared axios instance (`baseURL: '/api'`, attaches the JWT) and `errorMessage()`, which turns API and network errors into UI text.
  - `auth.service.ts`: holds the user in a signal and stores the token and user in `localStorage` (`mp_token`, `mp_user`).
  - `notify.service.ts`: snackbar helper.
- **Role picker:** `pages/auth/roles.ts` defines it, and Login, Sign up and Forgot password all use it. All three roles can sign up.
- **Dashboard** (`pages/dashboard/`) follows reference layouts the user supplied. It has its own navy sidebar and top bar, so `app.ts` hides the site header and footer on `/dashboard` (`isDashboard`).
  - `dashboard.ts` is the shell; it renders `patient/`, `doctor/` or `admin/` by role.
  - Sidebar items come from `NAV` in `dashboard.data.ts`: each scrolls to a card id, opens a route, runs an `action` (`logout`), or shows "coming soon".
  - **Patient is live** (spec: `Specs/patientdashboard.md`). Every side-menu item is its own view, chosen by `?view=`. The views don't scroll the overview:
    - none: the overview (KPIs, next appointment, payments due, recent records, upcoming list)
    - `book`: `patient/book-appointment/` (doctor cards with available days and the department's regular and emergency fees)
    - `myappointments`: `patient/appointments-view/`, the full appointments grid
    - `records`: `patient/records-view/` (prescriptions and lab reports download as PDF), plus `patient/report-uploads/`, where the patient uploads their own lab reports (PDF/PNG/JPG, ≤ 5 MB) and can view, download or delete them
    - `billing`: `patient/billing-view/` (bills with Success/Failed/Pending/Refunded status, Pay, invoice PDF)
    - `profile`: `patient/profile-view/` (edit personal details, change password)
    - The menu also has a Logout item.

    `PatientDashboard` provides `patient.store.ts` (`PatientStore`), which holds appointments, records and bills for all the views and owns `cancel()`. `patient/patient.api.ts` holds the types, API calls, `money()` (INR) and `withGst()`. Dates travel as `YYYY-MM-DD` strings and times as 24h `HH:MM`; use `fromIso()`, not `new Date(iso)`, which parses as UTC.
  - **Booking → payment:** **Book** opens `patient/book-dialog/` (type, datepicker limited to consulting days, slots, optional reason, fee + GST summary). Booking creates a bill and redirects to `?view=billing&pay=<billId>`, which opens `patient/pay-dialog/`: a **dummy gateway** with Card, UPI and Net banking options.
    - Test values that succeed: card `4242 4242 4242 4242`.
    - Test values that fail: card `4000 0000 0000 0002` (declined) or `4000 0000 0000 9995` (insufficient funds), UPI `fail@upi`, and "Test Bank".
    - `?doctor=<name>` opens the booking dialog for that doctor; Login sends patients there when they arrive from a doctor's Book button. Cancelling asks for confirmation through `confirmCancel()` (not the browser `confirm()`).
  - **PDFs** come from `patient/pdf.ts` (jsPDF, dynamically imported into its own chunk; `angular.json` allow-lists its optional CommonJS deps). The built-in fonts have no ₹ glyph, so PDFs print "INR".
  - **Doctor is live** (spec: `Specs/doctordashboard.md`). Every side-menu item is its own view, chosen by `?view=`:
    - none: the overview (KPIs, today's schedule, pending requests, profile card)
    - `myappointments`: `doctor/appointments-view/`, with **View** and **Update** buttons
    - `patients`: `doctor/patients-view/`, one row per patient, with inline Confirm/Cancel for each upcoming visit
    - `availability`: `doctor/availability-view/`, the weekly hours editor; patients see changes straight away
    - `profile`: `doctor/profile-view/`. Account details and "About" are editable. Qualifications, registration number, title and experience are read-only because the admin manages them.
    - The menu also has a Logout item.

    `DoctorDashboard` provides `doctor.store.ts` (`DoctorStore`), which holds the profile and appointments for all the views and owns `setStatus()` and `openCase()`. `version` changes after every status change so the Patients view reloads.
  - **View / Update** open `doctor/case-dialog/` with tabs **Visit · Reports · History · Prescription** (Prescription appears in Update mode only). History shows every visit with this doctor (completed, missed, cancelled) plus all of the patient's records.
    - The Reports tab lists the patient's own uploads ("Uploaded by the patient") above the lab results doctors recorded. In Update mode, a doctor's **Add lab report** takes results, an uploaded report file (PDF/PNG/JPG ≤ 5 MB), or both. Every report has **View**, which opens the shared `report-viewer.ts` (`openReportViewer()`): results plus an inline preview of the file (an image, or a PDF in a frame), with Download and Open in new tab. Patients get the same viewer from **View report** on Medical Records. Files are fetched through the authenticated API with `core/files.ts` (`openProtectedFile`, `fileToBase64`).
    - In Update mode, the Visit tab sets the outcome: Confirm, Mark completed, **Mark missed** (only after the slot's time) or Cancel. The Reports tab adds lab reports.
    - The Prescription tab is `doctor/prescription-form/`, which matches the user's screenshots: diagnosis; BP, pulse, temperature and weight; a medicines table (name, dosage, frequency, duration) with "+ Add medicine"; advice; and test suggestions (`SUGGESTED_TESTS` plus custom tests). It also offers "Save & mark completed".
    - An account with no linked profile sees a "profile isn't set up yet" card with **Check again**. `GET /api/doctor/me` links the account automatically once a profile carries its email (`linkByEmail`).
  - Both views cancel through the shared `confirm-dialog.ts` (`confirmCancel()`). Shared date helpers (`isoDate`, `fromIso`, `timeLabel`, `nowStamp`, `DAY_NAMES`, `initialsOf`) live in `dashboard.data.ts`.
  - **Admin is live** (spec: `Specs/admindashboard.md`). The side menu is Dashboard, Doctors, Patients, Revenue and Logout, each its own `?view=`:
    - none: the overview, from `/api/stats` (counts, 14-day sparklines, the appointment chart `admin/appt-chart.ts`, the calendar, recent sign-ups; sample data only while `appointments` is empty)
    - `doctors`: `admin/doctors-view/`. **Add doctor** (also the top-bar button, `?add=1`) and each row's **Edit** open the same form, `admin/doctor-form-dialog/` (`DoctorFormData.doctor` set means edit). Every detail, including email, is edited there. New doctors get Mon–Fri 10:00–14:00.
    - `patients`: `admin/patients-view/`, every patient with an expandable list of their appointments and payment status
    - `revenue`: `admin/revenue-view/`, built from `bills`. KPI tiles; a single-series monthly column chart and single-hue department bars (slot 1); a payment-method segmented bar using validated slots 1–3 with a labelled legend (aqua is below 3:1, so the labels are required); top doctors; recent transactions. Every chart has a hover tooltip or title and a "View as table" option.
    - Chart colours are dataviz-validated categorical slots 1–3 (`#2a78d6`, `#eb6834`, `#1baf7a`).
  - Shared dashboard classes (`.dash-card`, `.dash-kpis`, `.dash-table`, `.status-pill`, `.segmented`, `.list-row`, `.sample-note`) live in `styles.scss`.
- **Styling:**
  - `src/styles.scss` holds the Material theme (azure palette, Manrope font loaded in `index.html`), the `--mp-*` color tokens, and shared classes: `.page-shell`, `.section`, `.section-header`, `.eyebrow`, `.page-banner`, `.card-grid`, `.info-card`, `.icon-tile`, `.pill-button`.
  - Reuse these classes rather than redefining them per component: component stylesheets fail the build above 8kB (warning at 4kB).
  - Login and Sign up share `pages/auth/auth.scss`.
- Icons use the **Material Icons** font (not Symbols). Check that an icon name exists in that set; for example, `stethoscope` and `clinical_notes` don't.

## Backend architecture (`server/`)

- CommonJS Express 5 app. `src/index.js` mounts `routes/auth.js` (`/api/auth/register|login|update-password|me`), `routes/contact.js` (`POST /api/contact`; `GET` is admin-only) and `routes/stats.js` (admin-only: counts, daily trends, appointments by month and date, recent users), `routes/doctors.js` (`GET /api/doctors` with weekly availability; `GET /api/doctors/:id/slots?date=`), `routes/appointments.js` (patient: `GET /mine`, `POST /`, `PATCH /:id/cancel`) and `routes/records.js` (patient: `GET /mine`; uploads: `GET|POST /uploads`, `GET /uploads/:id/file`, `DELETE /uploads/:id`; `GET /:id/file` for a file a doctor attached) and `routes/bills.js` (patient: `GET /api/bills/mine`, `GET /banks`, `GET /:id`, `POST /:id/pay`), `routes/profile.js` (any signed-in user: `GET|PUT /api/profile`, `PUT /password`) and `routes/admin.js` (admin: `GET /api/admin/departments`, `GET|POST /doctors`, `PUT /doctors/:id`, `GET /patients`, `GET /revenue`), `routes/doctor-portal.js` (doctor: `GET /api/doctor/me` (auto-links by email), `PATCH /appointments/:id/status`, `GET /patients`, `PUT /availability`, `GET|PUT /profile`) and `routes/doctor-cases.js` (doctor: `GET /appointments/:id/case` (includes the patient's `uploads`), `GET /appointments/:id/uploads/:reportId/file`, `GET /records/:id/file` (a record's attached file), `PUT /appointments/:id/consultation`, `POST /appointments/:id/reports` (optional `file`), `DELETE /records/:id`). Both use `utils/doctor-context.js` (`withProfile` sets `req.doctor`), so every doctor route is scoped to the doctor's own linked profile. Slot logic and the 60-day booking window live in `utils/schedule.js`. `utils/billing.js` holds `createBill()` (called inside the booking transaction), `settleOnCancel(db, id, { refund })` (unpaid → cancelled; paid → refunded only when `refund` is true). A patient cancel refunds only a **pending** appointment; a **confirmed** one keeps the payment (the pop-up warns "No refund will be provided"). A doctor cancel always refunds and the dummy gateway `payDummy()`. It stores only masked payment details, never full card numbers or the CVV. GST is `GST_RATE` in `config.js` (18%, env-overridable). Booking locks the doctor row (`FOR UPDATE`) so two patients can't take the same slot.
- **Auth:** bcrypt password hashes plus a JWT (`middleware/auth.js`: `requireAuth`, `requireRole`). Login and update-password require the chosen role to match the account's role. Registration accepts all three roles. **Doctors sign up with the email the admin registered on a `doctors` row.** Registration fails with 403 if no profile has that email, and otherwise links the account to that profile.
- **Known demo-only gaps, required by the spec:** anyone can register as Admin, and update-password resets a password with only an email and role, without email or OTP verification. Both are marked with `NOTE:` comments and must be secured before real use.
- **Storage: MySQL** via `mysql2/promise`, with the pool in `src/db/index.js`.
  - Connection defaults come from Projectscope.md (`localhost:3306`, user `root`, database `hospitalmanagement`) and live in `src/config.js`. Override them with `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME`.
  - On startup, `initDatabase()` creates the database and runs `src/db/schema.sql`. The schema is idempotent (`CREATE TABLE IF NOT EXISTS`). Columns added to an existing table go in `ADDED_COLUMNS` in `src/db/index.js`, which `migrate()` applies with `ALTER TABLE`.
  - It then seeds `departments`, `department_services` and `doctors` from `src/db/seed-data.js`, once, only while `departments` is empty. `npm --prefix server run db:init` does the same without starting the API.
  - If MySQL is unreachable, the server exits.
- **Tables:**
  - `users`: all three roles; `specialization` is set for doctors.
  - `departments` and `department_services`
  - `doctors`: optional `user_id` link to a login account. **A doctor account only sees bookings through this link.** `doctors.email` (unique) is the email the admin registers. `seedDoctorEmails()` fills any empty one from the name ("Dr. Ravi Menon" → `ravimenon@medpoint.com`, with a number appended on a clash), so seeded doctors can sign up straight away; signing up or signing in with it links the account, and `users.specialization` follows the profile's department. A profile can have only one account. When the admin (or the doctor, under Profile) changes the email, the linked account's login email changes with it.
  - `appointments`: patient ↔ doctor, date and time, `appointment_type` (regular or emergency), status (pending, confirmed, completed, **missed** or cancelled), reason. Patients book and cancel from the dashboard. `migrate()` adds `missed` to existing databases.
  - `consultations` (one per appointment: diagnosis, vitals, advice, `recommended_tests`) and `prescription_items` (medicines). Saving a consultation replaces its generated `medical_records` rows (`medical_records.consultation_id`): a diagnosis with vitals, a prescription listing the medicines, and advice with recommended tests. That is how the patient sees it. Generated records can't be deleted one by one; save again instead.
  - `doctors.qualifications` / `registration_no`: admin-managed credentials, seeded once by `seedDoctorDetails()` while empty.
  - `doctor_availability`: weekly consulting hours per doctor (`day_of_week` 0 = Sunday), 30-minute slots. Seeded once by `seedAvailability()` while empty.
  - `medical_records`: prescriptions, lab reports, diagnoses and advice a doctor adds for a patient. Doctors write them from the dashboard, and only for their own confirmed or completed appointments. The user wants live data only: don't seed sample records, and clean up anything a test writes.
  - `bills`: one per appointment. It holds the fee (the department's `consultation_fee` or `emergency_fee` by appointment type), `gst_rate`, `gst_amount`, `total` and `status` (pending, paid, failed, refunded or cancelled), plus the masked payment method, transaction id and failure reason. Invoice numbers are derived (`INV-YYYYMM-00001`). On startup, `backfillBills()` bills any appointment that has no bill.
  - `departments.consultation_fee` / `emergency_fee` (INR, before GST) are set once from `fees` in `seed-data.js` by `seedFees()`.
  - `users` also holds the patient profile fields `date_of_birth`, `gender`, `blood_group`, `address`, `emergency_contact_name` and `emergency_contact_phone`.
  - `medical_records.file_name|file_mime|file_size|file_data`: an optional file a doctor attaches to a lab report, checked by the same `validateFile()`. `POST /api/doctor/appointments/:id/reports` also gets the 8 MB body limit (a regex route in `index.js`).
  - `patient_reports`: lab reports a patient uploads, with the file in a `LONGBLOB`. Uploads arrive as base64 JSON; only `/api/records/uploads` accepts large bodies (8 MB, set in `index.js` before the global parser). `utils/uploads.js` checks the type by its magic bytes (PDF, PNG, JPEG), enforces 5 MB, cleans the file name, and serves files with `nosniff`. A doctor can open one only through their own appointment with that patient.
  - `contact_messages`
- Routes use `snake_case` columns and map them to the `camelCase` the frontend expects (see `publicUser` in `routes/auth.js`).
- **Duplicated data:** the frontend still renders departments and doctors from its own static `core/departments.data.ts`. `server/src/db/seed-data.js` duplicates that data, so keep them in sync, or add a `/api/departments` endpoint and switch the frontend to it.
- **Test accounts** (created through the Sign up UI, password `123456789`):
  - `patient@medpoint.com`
  - `doctor@medpoint.com` (not linked: no profile has this email; add it to one under Admin → Doctors to link it)
  - `michealkim@medpoint.com` (the user's own account, linked to Dr. Michael Kim, doctors.id 1)
  - `admin@medpoint.com`

  There is no seeded admin, but anyone can sign up as Admin.
- `JWT_SECRET` and `PORT` come from environment variables, with development defaults in `src/config.js`.
