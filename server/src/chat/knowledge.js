// What the chatbot knows: live hospital data from MySQL plus how the MedPoint website works.
// Built into one plain-text block for Claude's system prompt (and used by the basic-mode
// responder). Cached briefly so repeated requests send byte-identical text (prompt caching).
const { pool } = require('../db');
const { GST_RATE } = require('../config');

const CACHE_MS = 5 * 60 * 1000;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let cached = null;

const pad = (n) => String(n).padStart(2, '0');
const time12 = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
const inr = (n) => `Rs. ${Number(n).toLocaleString('en-IN')}`;
const withGst = (n) => Math.round(n * (1 + GST_RATE / 100) * 100) / 100;

/** Doctor's consulting hours as "Monday, Wednesday, Friday · 9:00 AM – 1:00 PM" (or per day). */
function hoursText(availability) {
  if (!availability.length) return 'no consulting hours set';
  const same = availability.every((a) => a.start === availability[0].start && a.end === availability[0].end);
  if (same) {
    return `${availability.map((a) => DAY_NAMES[a.day]).join(', ')} · ${time12(availability[0].start)} – ${time12(availability[0].end)}`;
  }
  return availability.map((a) => `${DAY_NAMES[a.day]} ${time12(a.start)} – ${time12(a.end)}`).join('; ');
}

/** Structured data (also used by the basic responder). */
async function loadData() {
  const [departments] = await pool.query(
    `SELECT id, slug, name, tagline, description, hours,
            consultation_fee AS fee, emergency_fee AS emergencyFee
       FROM departments ORDER BY id`,
  );
  const [services] = await pool.query('SELECT department_id AS departmentId, name FROM department_services ORDER BY id');
  const [doctors] = await pool.query(
    `SELECT d.id, d.name, d.title, d.experience_years AS experience, d.qualifications, d.intro,
            d.department_id AS departmentId, d.user_id IS NOT NULL AS hasAccount
       FROM doctors d ORDER BY d.department_id, d.id`,
  );
  const [hours] = await pool.query(
    `SELECT doctor_id AS doctorId, day_of_week AS day,
            TIME_FORMAT(start_time, '%H:%i') AS start, TIME_FORMAT(end_time, '%H:%i') AS end
       FROM doctor_availability ORDER BY doctor_id, day_of_week`,
  );

  const deps = departments.map((d) => ({
    ...d,
    fee: Number(d.fee),
    emergencyFee: Number(d.emergencyFee),
    services: services.filter((s) => s.departmentId === d.id).map((s) => s.name),
    doctors: [],
  }));
  const byId = new Map(deps.map((d) => [d.id, d]));
  for (const doc of doctors) {
    const availability = hours.filter((h) => h.doctorId === doc.id);
    byId.get(doc.departmentId)?.doctors.push({ ...doc, availability, hoursText: hoursText(availability) });
  }
  return { departments: deps };
}

/** Everything about the website that doesn't live in the database. */
const SITE_GUIDE = `
WEBSITE (MedPoint Hospital Management System)
- Public pages: Home (with About Us), Our Departments (/departments, one page per department listing its doctors), Contact (/contact), Login, Sign up, Forgot password.
- Accounts: patients, doctors and admins can sign up. Doctors must sign up with the email address the hospital admin registered for them; their account is then linked to their doctor profile automatically. "Forgot password" on the login page lets you set a new password.
- After logging in, everyone gets a dashboard at /dashboard with a side menu.

PATIENT DASHBOARD
- Menu: Dashboard, Book Appointment, My Appointments, Medical Records, Billing & Payments, Profile & Settings, Logout.
- Booking: Book Appointment shows every doctor with their consulting days, hours and fees. Click Book, choose the appointment type (Regular or Emergency), pick a date (only the doctor's consulting days, up to 60 days ahead), choose a free time slot, optionally add a reason, then Book Appointment. Slots are 30 minutes (doctors can change this).
- Payment: after booking you go straight to Billing to pay. The fee depends on the department and on Regular vs Emergency, plus ${GST_RATE}% GST. Payment methods: card, UPI or net banking. This is a demo payment gateway: no real money is charged. Each bill has a downloadable invoice (PDF). Payment status shows as Success, Failed, Pending, Refunded or Cancelled.
- Cancelling: from My Appointments or the dashboard. A pop-up asks to confirm. If the appointment is still pending (not yet confirmed by the doctor) a paid fee is refunded; if the doctor has already confirmed it, no refund is given. If the doctor cancels, the patient is always refunded.
- Appointment statuses: pending (waiting for the doctor), confirmed, completed, missed (patient did not attend) and cancelled.
- Medical Records: prescriptions, lab reports, diagnoses and advice written by your doctors. Prescriptions and lab reports can be downloaded as PDF. Patients can also upload their own lab reports (PDF, PNG or JPG, up to 5 MB); doctors they have booked can view them.
- Profile & Settings: update name, email, phone, date of birth, gender, blood group, address and emergency contact, and change your password.

DOCTOR DASHBOARD
- Menu: Dashboard, My Appointments, Patients, Availability, Profile, Logout.
- Doctors confirm or cancel requests, view a patient's history and records (View), and record the visit (Update): diagnosis, vitals, medicines, advice and recommended tests, which appear in the patient's Medical Records. They can add lab reports with files and mark visits completed or missed.
- Availability: doctors set their own weekly consulting days and hours; patients see changes immediately.

ADMIN DASHBOARD
- Menu: Dashboard, Doctors, Patients, Revenue, Logout. Admins add and edit doctors (including their sign-up email), see all patients with their appointments, and see revenue from bill payments.

CONTACT
- Emergency number: +1 (800) 123-4567 (emergency care is available 24/7)
- Email: support@medpoint.com
- Address: 123 Medical Road, City
- Visiting hours: Monday – Friday 8:00 AM – 8:00 PM; Saturday 9:00 AM – 5:00 PM; Sunday emergency only.
- The Contact page has a message form; the team usually replies within one business day.
`.trim();

function render({ departments }) {
  const lines = ['DEPARTMENTS, FEES AND DOCTORS (live from the hospital database)'];
  lines.push(
    `Fees are per consultation, before ${GST_RATE}% GST. "Regular" and "Emergency" are the two appointment types.`,
  );
  for (const d of departments) {
    lines.push('');
    lines.push(`## ${d.name} (page: /departments/${d.slug}) - open ${d.hours}`);
    lines.push(`${d.tagline} ${d.description}`);
    if (d.services.length) lines.push(`Services: ${d.services.join(', ')}.`);
    lines.push(
      `Fees: Regular ${inr(d.fee)} (${inr(withGst(d.fee))} with GST); Emergency ${inr(d.emergencyFee)} (${inr(withGst(d.emergencyFee))} with GST).`,
    );
    for (const doc of d.doctors) {
      lines.push(
        `- ${doc.name}: ${doc.title}, ${doc.experience} years' experience${doc.qualifications ? `, ${doc.qualifications}` : ''}. Consulting: ${doc.hoursText}.`,
      );
    }
  }
  return `${lines.join('\n')}\n\n${SITE_GUIDE}`;
}

/** { text, data } - cached for a few minutes so the system prompt stays byte-stable. */
async function getKnowledge() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  const data = await loadData();
  cached = { at: Date.now(), data, text: render(data) };
  return cached;
}

module.exports = { getKnowledge, DAY_NAMES, inr, withGst };
