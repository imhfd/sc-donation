import { campaign, monthlyLinks } from './config.js';
import { toMinorUnits } from './lib/amount.js';
const $ = (id) => document.getElementById(id);
let mode = 'monthly', selected = '10', busy = false, apiReady = false;
const custom = $('custom-amount'), currency = $('currency'), message = $('form-message');
const money = (minor, code = currency.value) => new Intl.NumberFormat(code === 'gbp' ? 'en-GB' : 'en-US', { style: 'currency', currency: code.toUpperCase(), minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(minor / 100);
const endpoint = (path) => `${campaign.apiBase.replace(/\/$/, '')}/api/${path}`;
function currentAmount() { return custom.value.trim() || selected; }
function announce(messageText) {
  message.textContent = messageText;
  if (!messageText) return;
  message.classList.remove('message-enter');
  void message.offsetWidth;
  message.classList.add('message-enter');
}
function render({animateAmount = false} = {}) {
  const symbol = currency.value === 'gbp' ? '£' : '$';
  const modeToggle = document.querySelector('.mode-toggle');
  modeToggle.dataset.selection = mode;
  document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); });
  document.querySelectorAll('[data-amount]').forEach(button => {
    const active = !custom.value && button.dataset.amount === selected;
    button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    button.querySelector('strong').textContent = symbol + button.dataset.amount;
    button.querySelector('span').textContent = mode === 'monthly' ? '/ month' : 'one-time';
  });
  $('currency-symbol').textContent = symbol;
  $('custom-unit').textContent = mode === 'monthly' ? '/ month' : '';
  $('amount-hint').textContent = `From ${symbol}1. Every contribution matters.`;
  $('frequency-note').textContent = mode === 'monthly' ? 'A steady gift. A lasting difference.' : 'One gift. A story that lives on.';
  $('commitment').textContent = mode === 'monthly' ? 'Monthly support. Change or cancel anytime.' : 'A one-time gift. No recurring payments.';
  const amountIsPremium = currency.value === 'usd' && Number(currentAmount()) === 50;
  const card = document.querySelector('.donation-card');
  card.classList.toggle('is-premium', amountIsPremium);
  card.dataset.mode = mode;
  card.dataset.currency = currency.value;
  const label = $('checkout-button-label');
  try {
    const nextLabel = `Donate ${money(toMinorUnits(currentAmount()))}${mode === 'monthly' ? '/month' : ''}`;
    const changed = label.textContent !== nextLabel;
    label.textContent = nextLabel;
    if (animateAmount && changed) {
      label.classList.remove('cta-enter');
      void label.offsetWidth;
      label.classList.add('cta-enter');
    }
  } catch { $('checkout-button-label').textContent = 'Enter a valid amount'; }
  message.textContent = ''; message.classList.remove('message-enter'); custom.removeAttribute('aria-invalid');
}
function pulseAmount(button) {
  button.classList.remove('amount-pop');
  void button.offsetWidth;
  button.classList.add('amount-pop');
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  if (mode === button.dataset.mode) return;
  mode = button.dataset.mode; render({animateAmount:true});
  const note = $('frequency-note'); note.classList.remove('note-enter'); void note.offsetWidth; note.classList.add('note-enter');
}));
document.querySelectorAll('[data-amount]').forEach(button => button.addEventListener('click', () => { selected = button.dataset.amount; custom.value = ''; render({animateAmount:true}); pulseAmount(button); }));
custom.addEventListener('input', () => render({animateAmount:true})); currency.addEventListener('change', () => render({animateAmount:true}));
let attempt;
try { attempt = JSON.parse(sessionStorage.getItem('sc-donation-attempt')); } catch { /* Storage may be unavailable. */ }
$('donation-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (busy) return;
  let unitAmount;
  try { unitAmount = toMinorUnits(currentAmount()); }
  catch (error) { announce(error.message); custom.setAttribute('aria-invalid', 'true'); custom.focus(); return; }
  const selection = { amount: (unitAmount / 100).toFixed(2), currency: currency.value, mode };
  const fingerprint = JSON.stringify(selection);
  if (!attempt || attempt.fingerprint !== fingerprint || Date.now() - attempt.created > 30 * 60 * 1000) attempt = { fingerprint, requestId: crypto.randomUUID(), created: Date.now() };
  try { sessionStorage.setItem('sc-donation-attempt', JSON.stringify(attempt)); } catch { /* In-memory retry still works. */ }
  busy = true; $('donation-controls').disabled = true; $('checkout-button-label').textContent = 'Opening secure checkout…'; announce('');
  try {
    if (!apiReady && selection.currency === 'gbp' && selection.mode === 'monthly' && monthlyLinks[unitAmount / 100]) { window.location.assign(monthlyLinks[unitAmount / 100]); return; }
    if (!apiReady) throw new Error('Secure checkout is not connected to this site yet, so custom amounts, one-time gifts and USD are temporarily unavailable. To give now, switch to GBP + Monthly and choose a preset.');
    const response = await fetch(endpoint('checkout'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selection, requestId: attempt.requestId }), signal: AbortSignal.timeout(20000) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Secure checkout is temporarily unavailable. Please try again.');
    const checkout = new URL(result.url);
    if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.stripe.com') throw new Error('Unable to open secure checkout. Please try again.');
    window.location.assign(checkout.href);
  } catch (error) {
    $('donation-controls').disabled = false; busy = false; render();
    announce(error.name === 'TimeoutError' ? 'Checkout took too long. Please retry; your request will not be duplicated.' : error.message === 'Failed to fetch' ? 'Unable to connect. Check your connection and try again.' : error.message);
  }
});
window.addEventListener('pageshow', (event) => { if (!event.persisted) return; busy = false; $('donation-controls').disabled = false; render(); });
const goal = Number(campaign.goal);
$('goal-label').textContent = Number.isFinite(goal) && goal > 0 ? `${money(goal * 100, campaign.currency)} goal (${campaign.currency.toUpperCase()})` : '';
if (typeof campaign.raised === 'number' && campaign.raised >= 0 && goal > 0) {
  const percent = Math.min(100, campaign.raised / goal * 100);
  $('raised-label').textContent = `${money(Math.round(campaign.raised * 100), campaign.currency)} raised`;
  $('progress-fill').style.width = `${percent}%`;
  $('progress-track').setAttribute('role', 'progressbar'); $('progress-track').setAttribute('aria-label', 'Campaign fundraising progress');
  $('progress-track').setAttribute('aria-valuenow', String(percent)); $('progress-track').setAttribute('aria-valuemin', '0'); $('progress-track').setAttribute('aria-valuemax', '100');
  $('progress-note').textContent = `${Math.floor(percent)}% of our goal${Number.isInteger(campaign.supporters) && campaign.supporters >= 0 ? ` · ${campaign.supporters.toLocaleString()} supporters` : ''}${campaign.updatedAt ? ` · Updated ${campaign.updatedAt}` : ''}`;
} else $('progress-track').classList.add('is-unpublished');
document.querySelectorAll('.share-button').forEach(button => button.addEventListener('click', async () => {
  const share = { title: 'Help fund the next Sacred Chronicles film', text: 'Our history. A future we build together.', url: campaign.shareUrl };
  try { if (navigator.share) { await navigator.share(share); return; } } catch (error) { if (error.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(share.url); $('share-status').textContent = 'Campaign link copied. Thank you for spreading the word!'; }
  catch { $('share-link').hidden = false; $('share-link').value = share.url; $('share-link').focus(); $('share-link').select(); $('share-status').textContent = 'Copy this link to share the campaign.'; }
}));
if ('IntersectionObserver' in window) {
  new IntersectionObserver(entries => { document.querySelector('.mobile-donate').classList.toggle('is-hidden', entries[0].isIntersecting); }, {threshold:0.15}).observe($('donate'));
  document.body.classList.add('motion-ready');
  const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveal.unobserve(entry.target); }
  }), {threshold:0.12});
  document.querySelectorAll('section.rv').forEach(section => reveal.observe(section));
}
render();
fetch(endpoint('health'), {signal: AbortSignal.timeout(5000)}).then(r => r.ok ? r.json() : null).then(data => { apiReady = data?.checkoutReady === true; }).catch(() => {});
const params = new URLSearchParams(location.search);
if (params.get('checkout') === 'cancelled') {
  attempt = null; try { sessionStorage.removeItem('sc-donation-attempt'); } catch {}
  message.textContent = 'Checkout cancelled. You can change your gift and try again.';
  $('donate').scrollIntoView();
} else if (params.get('checkout') === 'success') {
  message.textContent = 'Checking your payment status…'; $('donate').scrollIntoView();
  fetch(`${endpoint('session')}?session_id=${encodeURIComponent(params.get('session_id') || '')}`, {signal:AbortSignal.timeout(10000)}).then(async response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
    message.textContent = data.paymentStatus === 'paid' ? `Thank you! Your ${data.mode === 'subscription' ? 'monthly ' : ''}gift of ${money(data.amountTotal, data.currency)} is confirmed.` : 'Your payment is still processing. Stripe will email your confirmation when it succeeds.';
    attempt = null; try { sessionStorage.removeItem('sc-donation-attempt'); } catch {}
  }).catch(() => { message.textContent = 'We could not confirm your payment status here. Please check your Stripe confirmation email before donating again.'; });
}
