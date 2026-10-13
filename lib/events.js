const ledgerEvents = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'invoice.paid',
  'invoice.payment_failed',
  'charge.captured',
  'charge.succeeded',
  'charge.updated',
  'charge.refunded',
  'refund.created',
  'refund.failed',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
]);

export function eventStatus(event) {
  if (!ledgerEvents.has(event?.type)) return null;
  const object = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return object.payment_status === 'paid' ? 'donation_paid' : 'donation_pending';
    case 'checkout.session.async_payment_failed': return 'donation_failed';
    case 'invoice.paid': return 'invoice_paid';
    case 'invoice.payment_failed': return 'invoice_payment_failed';
    case 'charge.succeeded': return 'charge_paid';
    case 'charge.captured': return 'charge_paid';
    case 'charge.updated': return 'charge_updated';
    case 'charge.refunded':
    case 'refund.created':
    case 'refund.failed':
    case 'refund.updated': return 'refund_updated';
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_withdrawn':
    case 'charge.dispute.funds_reinstated': return 'dispute_updated';
    default: return null;
  }
}
