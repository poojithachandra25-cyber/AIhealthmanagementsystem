// PDF downloads for the patient: billing invoices, prescriptions and lab reports.
// jsPDF is imported on demand so it stays out of the dashboard's main bundle.
// The built-in PDF fonts have no ₹ glyph, so amounts print as "INR".
import type { jsPDF } from 'jspdf';
import { fullDate, fromIso, timeLabel } from '../dashboard.data';
import { Bill, BILL_STATUS, MedicalRecord, patientCode, RECORD_META } from './patient.api';

interface PatientInfo {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
}

const BRAND = '#0f766e';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const PAGE_W = 210;
const M = 18; // page margin, mm

const inr = (n: number) =>
  `INR ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function newDoc(): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'mm', format: 'a4' });
}

/** Brand band with the document title on the right. */
function header(doc: jsPDF, title: string, subtitle: string): void {
  doc.setFillColor(BRAND);
  doc.rect(0, 0, PAGE_W, 34, 'F');
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold').setFontSize(20).text('MedPoint', M, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9);
  doc.text('Hospital Management System', M, 22);
  doc.text('123 Medical Road, City  ·  +1 (800) 123-4567  ·  support@medpoint.com', M, 27);
  doc.setFont('helvetica', 'bold').setFontSize(15).text(title, PAGE_W - M, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9).text(subtitle, PAGE_W - M, 22, { align: 'right' });
}

/** Label/value pairs in a column; returns the y below the last line. */
function fields(doc: jsPDF, x: number, y: number, heading: string, rows: [string, string][]): number {
  doc.setTextColor(BRAND).setFont('helvetica', 'bold').setFontSize(9).text(heading.toUpperCase(), x, y);
  y += 6;
  for (const [label, value] of rows) {
    doc.setTextColor(MUTED).setFont('helvetica', 'normal').setFontSize(9).text(label, x, y);
    doc.setTextColor(INK).setFont('helvetica', 'bold').text(value || '—', x + 30, y);
    y += 5.5;
  }
  return y;
}

function footer(doc: jsPDF, note: string): void {
  doc.setDrawColor(LINE).line(M, 278, PAGE_W - M, 278);
  doc.setTextColor(MUTED).setFont('helvetica', 'normal').setFontSize(8);
  doc.text(doc.splitTextToSize(note, PAGE_W - 2 * M), M, 283);
}

const visitWhen = (date: string, time: string) => `${fullDate(fromIso(date))}, ${timeLabel(time)}`;

/** Tax invoice for one bill, showing its payment status. */
export async function downloadInvoice(bill: Bill, patientId: number): Promise<void> {
  const doc = await newDoc();
  const issued = fullDate(new Date(bill.createdAt.replace(' ', 'T')));
  header(doc, 'TAX INVOICE', `${bill.invoiceNo}  ·  Issued ${issued}`);

  const left = fields(doc, M, 48, 'Billed to', [
    ['Patient', bill.patient],
    ['Patient ID', patientCode(patientId)],
    ['Email', bill.patientEmail],
    ['Phone', bill.patientPhone ?? ''],
  ]);
  const right = fields(doc, 110, 48, 'Visit', [
    ['Doctor', bill.doctor],
    ['Department', bill.department],
    ['Date & time', visitWhen(bill.date, bill.time)],
    ['Type', bill.type === 'emergency' ? 'Emergency' : 'Regular'],
  ]);

  // Charges table.
  let y = Math.max(left, right) + 8;
  doc.setFillColor('#f1f5f9').rect(M, y, PAGE_W - 2 * M, 9, 'F');
  doc.setTextColor(MUTED).setFont('helvetica', 'bold').setFontSize(9);
  doc.text('DESCRIPTION', M + 3, y + 6);
  doc.text('AMOUNT', PAGE_W - M - 3, y + 6, { align: 'right' });
  y += 9;
  const rows: [string, string][] = [
    [`${bill.type === 'emergency' ? 'Emergency' : 'Regular'} consultation, ${bill.doctor} (${bill.department})`, inr(bill.fee)],
    [`GST @ ${bill.gstRate}%`, inr(bill.gst)],
  ];
  doc.setTextColor(INK).setFont('helvetica', 'normal').setFontSize(10);
  for (const [label, amount] of rows) {
    y += 8;
    doc.text(label, M + 3, y);
    doc.text(amount, PAGE_W - M - 3, y, { align: 'right' });
    doc.setDrawColor(LINE).line(M, y + 3, PAGE_W - M, y + 3);
  }
  y += 11;
  doc.setFont('helvetica', 'bold').setFontSize(12);
  doc.text('Total', M + 3, y);
  doc.text(inr(bill.total), PAGE_W - M - 3, y, { align: 'right' });

  // Payment status.
  y += 14;
  const status = BILL_STATUS[bill.status].label;
  const tone = bill.status === 'paid' ? '#166534' : bill.status === 'failed' ? '#b91c1c' : '#92400e';
  doc.setTextColor(BRAND).setFont('helvetica', 'bold').setFontSize(9).text('PAYMENT', M, y);
  y += 7;
  doc.setTextColor(tone).setFontSize(13).text(status.toUpperCase(), M, y);
  y += 7;
  const payment: [string, string][] = [];
  if (bill.methodDetail) payment.push(['Method', bill.methodDetail]);
  if (bill.transactionId) payment.push(['Transaction', bill.transactionId]);
  if (bill.paidAt) payment.push(['Paid on', fullDate(new Date(bill.paidAt.replace(' ', 'T')))]);
  if (bill.failureReason) payment.push(['Reason', bill.failureReason]);
  for (const [label, value] of payment) {
    doc.setTextColor(MUTED).setFont('helvetica', 'normal').setFontSize(9).text(label, M, y);
    doc.setTextColor(INK).setFont('helvetica', 'bold').text(value, M + 30, y);
    y += 5.5;
  }

  footer(
    doc,
    'Computer-generated invoice. Payments are processed by a demo gateway: no real money is charged.',
  );
  doc.save(`MedPoint-Invoice-${bill.invoiceNo}.pdf`);
}

/** A prescription or lab report written by the doctor. */
export async function downloadRecord(record: MedicalRecord, patient: PatientInfo): Promise<void> {
  const doc = await newDoc();
  const kind = RECORD_META[record.type].label;
  header(doc, kind.toUpperCase(), `Record #${record.id}  ·  ${fullDate(fromIso(record.date))}`);

  const left = fields(doc, M, 48, 'Patient', [
    ['Name', patient.name],
    ['Patient ID', patientCode(patient.id)],
    ['Email', patient.email],
  ]);
  const right = fields(doc, 110, 48, 'Prescribed by', [
    ['Doctor', record.doctor],
    ['Department', record.department],
    ['Date', fullDate(fromIso(record.date))],
  ]);

  let y = Math.max(left, right) + 10;
  doc.setDrawColor(LINE).line(M, y - 5, PAGE_W - M, y - 5);
  if (record.type === 'prescription') {
    doc.setTextColor(BRAND).setFont('helvetica', 'bold').setFontSize(26).text('Rx', M, y + 6);
    y += 16;
  }
  doc.setTextColor(INK).setFont('helvetica', 'bold').setFontSize(14).text(record.title, M, y);
  y += 8;
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor('#334155');
  const body = doc.splitTextToSize(record.details || 'No further details were recorded.', PAGE_W - 2 * M);
  doc.text(body, M, y);
  y += body.length * 5.5 + 24;

  doc.setDrawColor(MUTED).line(PAGE_W - M - 60, y, PAGE_W - M, y);
  doc.setTextColor(MUTED).setFontSize(9).text(record.doctor, PAGE_W - M, y + 5, { align: 'right' });

  footer(doc, `Issued through the MedPoint patient portal on ${fullDate(new Date())}.`);
  const slug = record.type === 'prescription' ? 'Prescription' : 'Lab-Report';
  doc.save(`MedPoint-${slug}-${record.date}-${record.id}.pdf`);
}
