import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {toMinorUnits,donationInput} from '../lib/amount.js';
import {checkoutParams,stripeClient} from '../lib/stripe.js';
import {eventStatus} from '../lib/events.js';
import {netDonationMinor} from '../lib/ledger.js';
import checkout from '../api/checkout.js';
import webhook from '../api/webhook.js';
import session from '../api/session.js';
import {invoiceSubscriptionId} from '../api/reconcile.js';
const requestId='abcdabcd-abcd-abcd-abcd-abcdabcdabcd';
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(v){this.body=v;return this},end(){return this}}}
const req = body => ({method:'POST',headers:{origin:'https://donation.sacredchronicles.online','content-type':'application/json'},body});
process.env.SITE_URL='https://donation.sacredchronicles.online';
process.env.ALLOWED_ORIGIN=process.env.SITE_URL;
process.env.DATABASE_URL='postgresql://test:test@localhost/test';
process.env.CRON_SECRET='test-cron-secret';
test('exact cents and pounds, including custom decimals',()=>{assert.equal(toMinorUnits('75'),7500);assert.equal(toMinorUnits('1.01'),101);assert.equal(toMinorUnits('9999.99'),999999);assert.equal(toMinorUnits('10000'),1000000)});
test('reject ambiguous, negative, tiny, oversized and non-string amounts',()=>{for(const v of ['','0','0.99','-5','1e3','5.555','10,00','10000.01','Infinity','NaN',' 5 ',5,{},null]) assert.throws(()=>toMinorUnits(v))});
test('server validates all currency, frequency and request fields',()=>{for(const change of [{currency:'eur'},{mode:'yearly'},{requestId:'bad'},{amount:true}])assert.throws(()=>donationInput({amount:'10',currency:'gbp',mode:'monthly',requestId,...change}))});
for(const mode of ['monthly','once'])for(const currency of ['gbp','usd'])test(`${mode} ${currency} custom amount sent unchanged to Checkout`,()=>{
 const data=donationInput({amount:'75.23',mode,currency,requestId});const p=checkoutParams(data,process.env.SITE_URL);
 assert.equal(p.mode,mode==='monthly'?'subscription':'payment');assert.equal(p.line_items[0].price_data.unit_amount,7523);assert.equal(p.line_items[0].price_data.currency,currency);assert.equal(p.line_items[0].price_data.recurring?.interval,mode==='monthly'?'month':undefined);assert.equal(p.line_items[0].quantity,1);assert.equal(p.adaptive_pricing.enabled,false);assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));assert.equal(p.payment_method_types,undefined);
});
test('missing credentials fail closed and malformed amounts never call Stripe',async()=>{delete process.env.STRIPE_SECRET_KEY;delete process.env.STRIPE_WEBHOOK_SECRET;let res=response();await checkout(req({amount:'75',mode:'monthly',currency:'gbp',requestId}),res);assert.equal(res.statusCode,503);res=response();await checkout(req({amount:'-1',mode:'once',currency:'gbp',requestId}),res);assert.equal(res.statusCode,400)});
test('foreign origins are rejected',async()=>{const r=req({});r.headers.origin='https://untrusted.example';const res=response();await checkout(r,res);assert.equal(res.statusCode,403)});
test('checkout passes the same idempotency key for retries',async(t)=>{
 process.env.STRIPE_SECRET_KEY='sk_test_unit_test_only';process.env.STRIPE_WEBHOOK_SECRET='whsec_unit_test_only';
 const calls=[];t.mock.method(stripeClient().checkout.sessions,'create',async(...args)=>{calls.push(args);return {url:'https://checkout.stripe.com/c/pay/test-only'}});
 for(let i=0;i<2;i++){const res=response();await checkout(req({amount:'20.55',mode:'once',currency:'usd',requestId}),res);assert.equal(res.statusCode,200)}
 assert.equal(calls[0][0].line_items[0].price_data.unit_amount,2055);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0][1].idempotencyKey,`sc-donation-${requestId}`);
});
test('pending asynchronous payments are never acknowledged as paid',()=>{assert.equal(eventStatus({type:'checkout.session.completed',data:{object:{payment_status:'unpaid'}}}),'donation_pending');assert.equal(eventStatus({type:'checkout.session.async_payment_succeeded',data:{object:{payment_status:'paid'}}}),'donation_paid');for(const type of ['invoice.paid','invoice.payment_failed','charge.captured','charge.refunded','refund.failed','refund.updated','charge.dispute.closed'])assert.ok(eventStatus({type,data:{object:{}}}))});
test('refunds and active disputes reduce only captured donations',()=>{assert.equal(netDonationMinor(5000,1000,500,true),3500);assert.equal(netDonationMinor(5000,5000,0,true),0);assert.equal(netDonationMinor(5000,0,5000,true),0);assert.equal(netDonationMinor(5000,0,0,false),0)});
test('reconciliation reads subscription references from legacy and current invoice shapes',()=>{assert.equal(invoiceSubscriptionId({subscription:'sub_legacy'}),'sub_legacy');assert.equal(invoiceSubscriptionId({parent:{subscription_details:{subscription:{id:'sub_current'}}}}),'sub_current');assert.equal(invoiceSubscriptionId({} ),null)});
test('webhook rejects forged signatures and accepts signed events',async()=>{
 process.env.STRIPE_SECRET_KEY='sk_test_unit_test_only';process.env.STRIPE_WEBHOOK_SECRET='whsec_unit_test_only';
 const payload=JSON.stringify({id:'evt_unit_test',type:'unhandled.test',data:{object:{}}});
 for(const valid of [false,true]){const request=Readable.from([Buffer.from(payload)]);request.method='POST';request.headers={'stripe-signature':valid?stripeClient().webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET}):'invalid'};const res=response();await webhook(request,res);assert.equal(res.statusCode,valid?200:400)}
});
test('success status is retrieved from Stripe without exposing donor information',async(t)=>{
 t.mock.method(stripeClient().checkout.sessions,'retrieve',async()=>({metadata:{campaign:'sc-donation'},payment_status:'paid',amount_total:7523,currency:'usd',mode:'subscription',customer_email:'private@example.invalid'}));
 const res=response();await session({method:'GET',headers:{},query:{session_id:'cs_test_abcdefghijklmnop'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.amountTotal,7523);assert.equal(res.body.customer_email,undefined);
});
