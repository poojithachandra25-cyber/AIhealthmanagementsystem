const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { BILL_SELECT, mapBill, payDummy, transactionId, BANKS } = require('../utils/billing');

const router = express.Router();
router.use(requireAuth, requireRole('patient'));

async function ownBill(db, id, patientId, lock = false) {
  const [[row]] = await db.query(
    `${BILL_SELECT} WHERE b.id = ? AND b.patient_id = ?${lock ? ' FOR UPDATE' : ''}`,
    [id, patientId],
  );
  return row ? mapBill(row) : null;
}

/** The signed-in patient's bills, newest first. */
router.get('/mine', async (req, res) => {
  const [rows] = await pool.query(`${BILL_SELECT} WHERE b.patient_id = ? ORDER BY b.id DESC`, [
    req.user.id,
  ]);
  res.json(rows.map(mapBill));
});

/** Banks offered for dummy net banking. */
router.get('/banks', (_req, res) => {
  res.json(Object.entries(BANKS).map(([code, name]) => ({ code, name })));
});

router.get('/:id', async (req, res) => {
  const bill = await ownBill(pool, req.params.id, req.user.id);
  if (!bill) return res.status(404).json({ message: 'Bill not found.' });
  res.json(bill);
});

/**
 * Pays a bill through the dummy gateway. Body: { method, details }.
 * card: { name, number, expiry 'MM/YY', cvv } · upi: { vpa } · netbanking: { bank }
 */
router.post('/:id/pay', async (req, res) => {
  const { method, details } = req.body ?? {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const bill = await ownBill(conn, req.params.id, req.user.id, true);
    if (!bill) {
      await conn.rollback();
      return res.status(404).json({ message: 'Bill not found.' });
    }
    if (!['pending', 'failed'].includes(bill.status)) {
      await conn.rollback();
      const why = bill.status === 'paid' ? 'This bill is already paid.' : `This bill is ${bill.status}.`;
      return res.status(409).json({ message: why });
    }

    const outcome = payDummy(method, details);
    if (outcome.error) {
      await conn.rollback();
      return res.status(400).json({ message: outcome.error });
    }

    await conn.query(
      `UPDATE bills
          SET status = ?, payment_method = ?, payment_detail = ?, transaction_id = ?,
              failure_reason = ?, paid_at = IF(? = 'paid', NOW(), NULL)
        WHERE id = ?`,
      [
        outcome.ok ? 'paid' : 'failed',
        method,
        outcome.detail,
        transactionId(),
        outcome.ok ? null : outcome.reason,
        outcome.ok ? 'paid' : 'failed',
        bill.id,
      ],
    );
    await conn.commit();
    res.json(await ownBill(pool, bill.id, req.user.id));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

module.exports = router;
