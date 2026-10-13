// Only these legacy donation links are included in campaign reporting.
// Other Stripe links in the merchant account belong to unrelated activity.
export const CAMPAIGN_PAYMENT_LINK_IDS = new Set([
  'plink_1U0ioZRWz15aW1XSBzkLNjty', // GBP £5 monthly
  'plink_1U0WwLRWz15aW1XS81whxGAg', // GBP £10 monthly
  'plink_1U0WyBRWz15aW1XSZOlNM11n', // GBP £30 monthly
  'plink_1U0ipFRWz15aW1XS0kfW83ZB', // GBP £50 monthly
  'plink_1U2aQTRWz15aW1XSK9J7SsSV', // GBP one-off custom amount
]);

export function isCampaignLink(id) {
  return typeof id === 'string' && CAMPAIGN_PAYMENT_LINK_IDS.has(id);
}
