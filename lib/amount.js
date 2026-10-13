export function toMinorUnits(value) {
  if (typeof value !== 'string' || !/^\d{1,5}(\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with no more than two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount < 100 || amount > 1000000) throw new Error('Choose an amount between 1 and 10,000.');
  return amount;
}
export function donationInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid donation.');
  const { amount, currency, mode, requestId } = body;
  if (!['gbp', 'usd'].includes(currency)) throw new Error('Choose GBP or USD.');
  if (!['monthly', 'once'].includes(mode)) throw new Error('Choose monthly or one-time giving.');
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) throw new Error('Invalid request identifier.');
  return { unitAmount: toMinorUnits(amount), currency, mode, requestId };
}
