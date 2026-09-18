import { actor } from '../_helpers';
import { getRuntime } from '../../runtime';
import { one } from '../../db/index';
export default defineEventHandler(async event => {
  const wallet = await actor(event), runtime = await getRuntime();
  const reservation = await one(runtime.app.store.client, 'SELECT r.*,e.payment_mode,e.amount_luna,e.state AS event_state FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.participant_wallet=? ORDER BY r.rowid DESC LIMIT 1', [wallet]);
  const eventRow = await one(runtime.app.store.client, 'SELECT id,state,starts_at,ends_at FROM events WHERE organizer=? ORDER BY rowid DESC LIMIT 1', [wallet]);
  const payment = reservation ? await one(runtime.app.store.client, 'SELECT transaction_hash FROM payment_attempts WHERE reservation_id=? AND transaction_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1', [reservation.id]) : null;
  if (!reservation) return { event: eventRow ?? null, reservation: null };
  return { event: eventRow ?? null, transactionHash: payment?.transaction_hash ?? null, reservation: { ...reservation, intent: { recipient: runtime.app.config.treasury, value: String(reservation.amount_luna), data: reservation.memo, network: 5 } } };
});
