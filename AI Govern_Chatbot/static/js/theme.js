document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const langSelect = document.getElementById('lang-select');

    const saved = localStorage.getItem('gov_theme') || 'purple';
    html.setAttribute('data-theme', saved);
    const savedLang = localStorage.getItem('gov_lang') || 'en';
    if (langSelect) langSelect.value = savedLang;
    if (langSelect) langSelect.addEventListener('change', () => { localStorage.setItem('gov_lang', langSelect.value) });
    if (toggle) toggle.addEventListener('click', () => {
        const cur = html.getAttribute('data-theme');
        const nxt = cur === 'purple' ? 'blue' : 'purple';
        html.setAttribute('data-theme', nxt);
        localStorage.setItem('gov_theme', nxt)
    })
});