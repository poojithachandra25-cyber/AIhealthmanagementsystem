// Basic mode: a keyword-matching responder over the same knowledge as the Claude prompt.
// Used when no Claude credentials are configured (or the API is unavailable), so the
// website's chat widget still answers the common questions from live data.
const { GST_RATE } = require('../config');
const { DAY_NAMES, inr, withGst } = require('./knowledge');

const has = (q, ...words) => words.some((w) => q.includes(w));

function findDepartment(q, departments) {
  const aliases = { cardio: 'cardiology', heart: 'cardiology', neuro: 'neurology', brain: 'neurology',
    ortho: 'orthopedics', bone: 'orthopedics', joint: 'orthopedics', child: 'pediatrics', kid: 'pediatrics',
    paediatric: 'pediatrics', pediatric: 'pediatrics', trauma: 'emergency', general: 'general-medicine', fever: 'general-medicine' };
  for (const d of departments) {
    if (q.includes(d.name.toLowerCase()) || q.includes(d.slug.replace('-', ' '))) return d;
  }
  for (const [word, slug] of Object.entries(aliases)) {
    if (q.includes(word)) return departments.find((d) => d.slug === slug);
  }
  return null;
}

function findDoctor(q, departments) {
  for (const d of departments) {
    for (const doc of d.doctors) {
      const parts = doc.name.replace(/^dr\.?\s+/i, '').toLowerCase().split(/\s+/);
      if (parts.some((p) => p.length > 2 && q.includes(p))) return { doc, dept: d };
    }
  }
  return null;
}

const feeLine = (d) =>
  `${d.name}: Regular ${inr(d.fee)} (${inr(withGst(d.fee))} with GST), Emergency ${inr(d.emergencyFee)} (${inr(withGst(d.emergencyFee))} with GST)`;

function doctorReply({ doc, dept }) {
  return [
    `${doc.name} is ${doc.title} in ${dept.name}, with ${doc.experience} years' experience${doc.qualifications ? ` (${doc.qualifications})` : ''}.`,
    `Consulting: ${doc.hoursText}.`,
    `Consultation fee: ${inr(dept.fee)} regular or ${inr(dept.emergencyFee)} emergency, plus ${GST_RATE}% GST.`,
    'To book, log in as a patient and choose Book Appointment in your dashboard.',
  ].join('\n');
}

function departmentReply(d) {
  const docs = d.doctors.map((doc) => `- ${doc.name}, ${doc.title} (${doc.hoursText})`).join('\n');
  return [
    `${d.name} (open ${d.hours}): ${d.tagline}`,
    d.services.length ? `Services: ${d.services.join(', ')}.` : '',
    `Fees: Regular ${inr(d.fee)}, Emergency ${inr(d.emergencyFee)} (plus ${GST_RATE}% GST).`,
    `Doctors:\n${docs}`,
  ].filter(Boolean).join('\n');
}

/** Answers one question; `knowledge` is { data: { departments } } from getKnowledge(). */
function basicAnswer(question, knowledge) {
  const q = ` ${question.toLowerCase()} `;
  const { departments } = knowledge.data;

  if (has(q, 'chest pain', 'unconscious', 'bleeding', 'accident', 'can\'t breathe', 'cannot breathe', 'stroke', 'heart attack')) {
    return 'If this is an emergency, please call +1 (800) 123-4567 now or come straight to the Emergency & Trauma department, open 24/7. I can\'t give medical advice in chat.';
  }

  const doctor = findDoctor(q, departments);
  if (doctor) return doctorReply(doctor);

  const dept = findDepartment(q, departments);
  const askingFee = has(q, 'fee', 'cost', 'price', 'charge', 'how much', 'gst', 'expensive');
  if (dept && !askingFee) return departmentReply(dept);

  if (askingFee) {
    const list = dept ? [dept] : departments;
    return [
      `Consultation fees (before ${GST_RATE}% GST):`,
      ...list.map((d) => `- ${feeLine(d)}`),
      'You pay right after booking, by card, UPI or net banking (a demo gateway - no real money is charged).',
    ].join('\n');
  }

  if (has(q, 'refund', 'cancel')) {
    return [
      'You can cancel from My Appointments or your dashboard; a pop-up asks you to confirm.',
      '- If the appointment is still pending (not yet confirmed by the doctor), a paid fee is refunded.',
      '- If the doctor has already confirmed it, no refund is given.',
      '- If the doctor cancels, you are always refunded.',
    ].join('\n');
  }

  if (has(q, 'book', 'appointment', 'schedule', 'slot')) {
    return [
      'To book an appointment:',
      '1. Log in (or sign up) as a patient.',
      '2. Open Book Appointment in your dashboard and pick a doctor - each card shows their consulting days, hours and fees.',
      '3. Click Book, choose Regular or Emergency, pick a date and a free time slot, and add a reason if you like.',
      '4. Click Book Appointment, then pay the fee plus GST on the Billing page.',
    ].join('\n');
  }

  if (has(q, 'pay', 'payment', 'card', 'upi', 'bank', 'invoice', 'bill')) {
    return `After booking you go straight to Billing & Payments. Pay by card, UPI or net banking (a demo gateway - no real money is charged). The total is the consultation fee plus ${GST_RATE}% GST. Every bill has a downloadable invoice, and its status shows as Success, Failed, Pending or Refunded.`;
  }

  if (has(q, 'record', 'prescription', 'report', 'upload', 'lab', 'download')) {
    return 'Your Medical Records page lists the prescriptions, lab reports, diagnoses and advice your doctors add. Prescriptions and lab reports download as PDF. You can also upload your own lab reports (PDF, PNG or JPG, up to 5 MB), and doctors you have booked can view them.';
  }

  if (has(q, 'hour', 'timing', 'open', 'visit', 'when are you', 'sunday', 'saturday')) {
    return 'Visiting hours: Monday – Friday 8:00 AM – 8:00 PM; Saturday 9:00 AM – 5:00 PM; Sunday emergency only. Emergency care is available 24/7. Each doctor\'s consulting days are shown on their department page and when you book.';
  }

  if (has(q, 'contact', 'phone', 'call', 'email', 'address', 'location', 'where')) {
    return 'Emergency number: +1 (800) 123-4567\nEmail: support@medpoint.com\nAddress: 123 Medical Road, City\nYou can also send us a message from the Contact page; we usually reply within one business day.';
  }

  if (has(q, 'password', 'forgot', 'login', 'log in', 'sign up', 'signup', 'register', 'account')) {
    return 'Use Sign up to create a patient, doctor or admin account (doctors sign up with the email the hospital admin registered for them). Use Login to sign in, and "Forgot password?" on the login page to set a new password.';
  }

  if (has(q, 'department', 'speciali', 'service', 'doctor', 'treat')) {
    return [
      `We have ${departments.length} departments:`,
      ...departments.map((d) => `- ${d.name} (${d.doctors.length} doctors) - ${d.tagline}`),
      'Ask me about any of them, or about a specific doctor.',
    ].join('\n');
  }

  if (has(q, ' hi ', ' hello', ' hey', 'good morning', 'good evening', 'thank')) {
    return 'Hello! I\'m the MedPoint assistant. I can help with departments, doctors and their timings, fees, booking, payments and refunds, medical records, and contact details.';
  }

  return 'I\'m not sure about that one. I can help with departments, doctors and their consulting days, consultation fees, booking and cancelling appointments, payments and refunds, medical records, visiting hours and contact details. For anything else, please call +1 (800) 123-4567 or email support@medpoint.com.';
}

module.exports = { basicAnswer };
