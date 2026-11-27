// Bills and the dummy payment gateway.
// A bill is created with every appointment: the department's regular or emergency
// fee plus GST. No real money moves: payDummy() decides success or failure from
// documented test values, so both outcomes can be tried.
const crypto = require('crypto');
const { GST_RATE } = require('../config');

const round2 = (n) => Math.round(n * 100) / 100;

/** Creates the bill for an appointment. `db` is the pool or a connection in a transaction. */
async function createBill(db, appointmentId) {
  const [[appt]] = await db.query(
    `SELECT a.id, a.patient_id AS patientId, a.appointment_type AS type, a.status,
            dep.consultation_fee AS fee, dep.emergency_fee AS emergencyFee
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN departments dep ON dep.id = d.department_id
      WHERE a.id = ?`,
    [appointmentId],
  );
  if (!appt) throw new Error(`Appointment ${appointmentId} not found`);

  const fee = Number(appt.type === 'emergency' ? appt.emergencyFee : appt.fee);
  const gst = round2((fee * GST_RATE) / 100);
  const [result] = await db.query(
    `INSERT INTO bills (appointment_id, patient_id, consultation_fee, gst_rate, gst_amount, total, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [appt.id, appt.patientId, fee, GST_RATE, gst, round2(fee + gst), appt.status === 'cancelled' ? 'cancelled' : 'pending'],
  );
  return result.insertId;
}

/**
 * Settles the bill when an appointment is cancelled. An unpaid bill is always cancelled.
 * A paid bill is refunded only when `refund` is true; otherwise it stays paid.
 * Patient cancels refund only while the appointment is still pending (Specs/patientdashboard.md);
 * doctor cancels always refund.
 */
async function settleOnCancel(db, appointmentId, { refund }) {
  await db.query(
    `UPDATE bills SET status = 'cancelled'
      WHERE appointment_id = ? AND status IN ('pending', 'failed')`,
    [appointmentId],
  );
  if (refund) {
    await db.query(`UPDATE bills SET status = 'refunded' WHERE appointment_id = ? AND status = 'paid'`, [
      appointmentId,
    ]);
  }
}

/** Columns for bill listings, with what the invoice needs about the visit and the patient. */
const BILL_SELECT = `
  SELECT b.id, CONCAT('INV-', DATE_FORMAT(b.created_at, '%Y%m'), '-', LPAD(b.id, 5, '0')) AS invoiceNo,
         b.consultation_fee AS fee, b.gst_rate AS gstRate, b.gst_amount AS gst, b.total, b.status,
         b.payment_method AS method, b.payment_detail AS methodDetail, b.transaction_id AS transactionId,
         b.failure_reason AS failureReason, b.paid_at AS paidAt, b.created_at AS createdAt,
         a.id AS appointmentId, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
         TIME_FORMAT(a.appointment_time, '%H:%i') AS time, a.appointment_type AS type,
         a.status AS appointmentStatus,
         d.name AS doctor, d.title AS doctorTitle, dep.name AS department,
         u.name AS patient, u.email AS patientEmail, u.phone AS patientPhone
    FROM bills b
    JOIN appointments a ON a.id = b.appointment_id
    JOIN doctors d ON d.id = a.doctor_id
    JOIN departments dep ON dep.id = d.department_id
    JOIN users u ON u.id = b.patient_id`;

/** mysql2 returns DECIMAL as strings; the API sends numbers. */
const mapBill = (row) => ({
  ...row,
  fee: Number(row.fee),
  gstRate: Number(row.gstRate),
  gst: Number(row.gst),
  total: Number(row.total),
});

// ---- Dummy gateway ----

/** Test values that make a payment fail, so the Failed status can be demonstrated. */
const DECLINES = {
  card: { '4000000000000002': 'Card declined by the issuing bank.', '4000000000009995': 'Insufficient funds.' },
  upi: { 'fail@upi': 'UPI request declined by the payer.' },
  netbanking: { FAILBANK: 'Bank authentication failed.' },
};

const BANKS = { SBI: 'State Bank of India', HDFC: 'HDFC Bank', ICICI: 'ICICI Bank', AXIS: 'Axis Bank', FAILBANK: 'Test Bank (always fails)' };

const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
};

/**
 * Validates the payment details and "charges" them.
 * Returns { error } for invalid input, otherwise { ok, detail, reason? }.
 * Only a masked detail is ever returned for storage; CVV and full card numbers are dropped.
 */
function payDummy(method, details = {}) {
  if (method === 'card') {
    const number = String(details.number ?? '').replace(/\s+/g, '');
    const [mm, yy] = String(details.expiry ?? '').split('/').map((s) => Number(s));
    const now = new Date();
    const expired = !mm || mm > 12 || yy === undefined || 2000 + yy < now.getFullYear() ||
      (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1);
    if (!String(details.name ?? '').trim()) return { error: 'Enter the name on the card.' };
    if (!/^\d{13,19}$/.test(number) || !luhn(number)) return { error: 'Enter a valid card number.' };
    if (expired) return { error: 'Enter a valid expiry date (MM/YY) that has not passed.' };
    if (!/^\d{3,4}$/.test(String(details.cvv ?? ''))) return { error: 'Enter the 3 or 4 digit CVV.' };
    const brand = number.startsWith('4') ? 'Visa' : /^5[1-5]/.test(number) ? 'Mastercard' : 'Card';
    return result(DECLINES.card[number], `${brand} •••• ${number.slice(-4)}`);
  }
  if (method === 'upi') {
    const vpa = String(details.vpa ?? '').trim().toLowerCase();
    if (!/^[\w.-]{2,}@[a-z]{2,}$/.test(vpa)) return { error: 'Enter a valid UPI ID, e.g. name@okbank.' };
    return result(DECLINES.upi[vpa], vpa);
  }
  if (method === 'netbanking') {
    const bank = BANKS[details.bank];
    if (!bank) return { error: 'Choose your bank.' };
    return result(DECLINES.netbanking[details.bank], bank);
  }
  return { error: 'Choose a payment method.' };
}

const result = (reason, detail) => (reason ? { ok: false, reason, detail } : { ok: true, detail });

const transactionId = () => `TXN${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

module.exports = { createBill, settleOnCancel, BILL_SELECT, mapBill, payDummy, transactionId, BANKS };
