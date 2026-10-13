import {database} from './db.js';

const ECB = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+GBP.EUR.SP00.A';
const SOURCE = 'ECB daily euro reference rates (USD and GBP against EUR)';

function dateOnly(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid payment date.');
  return date.toISOString().slice(0, 10);
}

function previousDate(day, days) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function parseRates(csv) {
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(','));
  const rates = new Map();
  for (const row of rows) {
    if (row.length < 8) continue;
    const [key,,,,,, date, value] = row;
    const currency = key.split('.')[1];
    if (!['USD', 'GBP'].includes(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Number(value))) continue;
    const item = rates.get(date) || {};
    item[currency.toLowerCase()] = Number(value);
    rates.set(date, item);
  }
  return rates;
}

export async function rateForPayment(currency, paidAt) {
  if (currency === 'usd') return {rate: 1, fxDate: dateOnly(paidAt), source: 'USD amount, no conversion'};
  if (currency !== 'gbp') throw new Error('Unsupported reporting currency.');
  const paidDate = dateOnly(paidAt);
  const sql = database();
  const cached = await sql`SELECT observation_date::text, usd_per_eur::text, gbp_per_eur::text
    FROM campaign_fx_rates WHERE observation_date <= ${paidDate}::date
    ORDER BY observation_date DESC LIMIT 1`;
  if (cached[0] && cached[0].observation_date >= previousDate(paidDate, 7)) {
    return {rate: Number(cached[0].usd_per_eur) / Number(cached[0].gbp_per_eur), fxDate: cached[0].observation_date, source: SOURCE};
  }

  const url = new URL(ECB);
  url.searchParams.set('startPeriod', previousDate(paidDate, 7));
  url.searchParams.set('endPeriod', paidDate);
  url.searchParams.set('format', 'csvdata');
  url.searchParams.set('detail', 'dataonly');
  const response = await fetch(url, {signal: AbortSignal.timeout(8000), headers: {Accept: 'text/csv'}});
  if (!response.ok) throw new Error(`ECB rates unavailable (${response.status}).`);
  const rates = parseRates(await response.text());
  const days = [...rates.keys()].filter(day => day <= paidDate).sort().reverse();
  const fxDate = days.find(day => rates.get(day)?.usd && rates.get(day)?.gbp);
  if (!fxDate) throw new Error('ECB did not publish a usable USD/GBP reference rate for this payment date.');
  const {usd, gbp} = rates.get(fxDate);
  await sql`INSERT INTO campaign_fx_rates (observation_date, usd_per_eur, gbp_per_eur, source)
    VALUES (${fxDate}::date, ${usd}, ${gbp}, ${SOURCE}) ON CONFLICT (observation_date) DO NOTHING`;
  return {rate: usd / gbp, fxDate, source: SOURCE};
}

export async function preloadFxRates(startDate, endDate) {
  const from = previousDate(startDate, 7);
  const url = new URL(ECB);
  url.searchParams.set('startPeriod', from);
  url.searchParams.set('endPeriod', endDate);
  url.searchParams.set('format', 'csvdata');
  url.searchParams.set('detail', 'dataonly');
  const response = await fetch(url, {signal: AbortSignal.timeout(12000), headers: {Accept:'text/csv'}});
  if (!response.ok) throw new Error(`ECB rates unavailable (${response.status}).`);
  const rates = parseRates(await response.text());
  const rows = [...rates.entries()].filter(([,value]) => value.usd && value.gbp);
  if (!rows.length) throw new Error('ECB returned no USD/GBP rates for reconciliation.');
  const sql = database();
  await sql.transaction(rows.map(([date, value]) => sql`INSERT INTO campaign_fx_rates (observation_date, usd_per_eur, gbp_per_eur, source)
    VALUES (${date}::date, ${value.usd}, ${value.gbp}, ${SOURCE}) ON CONFLICT (observation_date) DO NOTHING`));
  return new Map(rows.map(([date, value]) => [date, {rate:value.usd / value.gbp, fxDate:date, source:SOURCE}]));
}

export function preloadedRateFor(currency, paidAt, rates) {
  if (currency === 'usd') return {rate:1, fxDate:dateOnly(paidAt), source:'USD amount, no conversion'};
  const day = dateOnly(paidAt);
  const fxDate = [...rates.keys()].filter(date => date <= day).sort().at(-1);
  if (!fxDate || day > previousDate(fxDate, -7)) throw new Error('No recent ECB rate is available for this payment date.');
  return rates.get(fxDate);
}

export function convertToUsdMinor(amountMinor, rate) {
  if (!Number.isSafeInteger(amountMinor) || !Number.isFinite(rate) || rate <= 0) throw new Error('Invalid amount or FX rate.');
  return Math.round(amountMinor * rate);
}
