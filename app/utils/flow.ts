export function checkInAvailability(state: string | undefined, startsAt: number | undefined, endsAt: number | undefined, now: number) {
  if (!['RESERVED', 'CONFIRMED'].includes(state ?? '') || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { open: false, waitMs: 0 };
  if (now < startsAt!) return { open: false, waitMs: startsAt! - now };
  return { open: now < endsAt!, waitMs: 0 };
}

export function refundProgress(receipt: { refunds?: Array<{ state?: string }> } | undefined) {
  const refunds = receipt?.refunds;
  if (!Array.isArray(refunds) || refunds.length === 0) return { exists: false, settled: false };
  return { exists: true, settled: refunds.every(refund => refund.state === 'SETTLED') };
}

export function paymentAction(receipt: any, localAttempt: boolean, now: number) {
  if (!receipt?.reservation) return 'none';
  if (!['HOLD_CREATED', 'HELD', 'HOLD_EXPIRED', 'EXPIRED'].includes(receipt.reservation.state)) return 'none';
  if (localAttempt || receipt.evidence?.payments?.length) return 'recover';
  return receipt.reservation.hold_expires > now ? 'pay' : 'expired';
}

export function registrationOpen(event: any, now: number) {
  return event?.state === 'OPEN' && event.starts_at > now && event.available_seats > 0;
}

export function eventGroup(event: any, now: number) {
  if (event.state === 'CANCELLED') return 'cancelled';
  if (event.state === 'DRAFT') return 'draft';
  if (event.state === 'COMPLETED' || now >= event.ends_at) return 'completed';
  if (now >= event.check_in_closes_at) return 'closed';
  return now >= event.check_in_opens_at ? 'live' : 'upcoming';
}
