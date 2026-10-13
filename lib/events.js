// Stripe is the durable donation ledger. No public totals or fulfillment are
// changed by this handler, making redelivery safe without a second database.
export function eventStatus(event) {
  const object = event.data.object;
  switch(event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return object.payment_status === 'paid' ? 'donation_paid' : 'donation_pending';
    case 'checkout.session.async_payment_failed': return 'donation_failed';
    case 'invoice.paid': return 'invoice_paid';
    case 'invoice.payment_failed': return 'invoice_payment_failed';
    case 'customer.subscription.created':
    case 'customer.subscription.updated': return `subscription_${object.status}`;
    case 'customer.subscription.deleted': return 'subscription_cancelled';
    default: return null;
  }
}
