const $ = id => document.getElementById(id);
document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    document.querySelector('.mode-toggle').dataset.selection = mode;
    document.querySelectorAll('[data-mode]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('selected', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    $('monthly-panel').hidden = mode !== 'monthly';
    $('once-panel').hidden = mode !== 'once';
  });
});
document.querySelectorAll('.share-button').forEach(button => button.addEventListener('click', async () => {
  const share = { title: 'Help fund the next Sacred Chronicles film', text: 'Our history. A future we build together.', url: 'https://donation.sacredchronicles.online/' };
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
