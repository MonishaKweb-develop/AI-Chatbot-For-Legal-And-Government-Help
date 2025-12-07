document.addEventListener('DOMContentLoaded', function () {
  const messages = document.getElementById('messages');
  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const micBtn = document.getElementById('mic-btn');
  const clearBtn = document.getElementById('clear-btn');
  const speakBtn = document.getElementById('speak-btn');

  let lang = localStorage.getItem('gov_lang') || (typeof INITIAL_LANG !== 'undefined' ? INITIAL_LANG : 'en');

  // --- helpers ---
  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderStructuredReply(obj) {
    // Expecting object with possible keys: title, steps (array or string), documents, fee, link
    let html = '';
    if (obj.title) {
      html += `<p><strong>${escapeHtml(obj.title)}</strong></p>`;
    }
    if (obj.steps) {
      let items = Array.isArray(obj.steps) ? obj.steps : (typeof obj.steps === 'string' ? obj.steps.split(/\r?\n/).filter(Boolean) : []);
      if (items.length) {
        html += '<ol>';
        items.forEach(it => html += `<li>${escapeHtml(it)}</li>`);
        html += '</ol>';
      }
    }
    if (obj.documents) {
      html += `<p><strong>Required Documents:</strong> ${escapeHtml(Array.isArray(obj.documents) ? obj.documents.join(', ') : obj.documents)}</p>`;
    }
    if (obj.fee) {
      html += `<p><strong>Approx. Fee:</strong> ${escapeHtml(obj.fee)}</p>`;
    }
    if (obj.link) {
      const safeLink = escapeHtml(obj.link);
      html += `<p><strong>Official Link:</strong> <a href="${safeLink}" target="_blank" rel="noopener noreferrer">${safeLink}</a></p>`;
    }
    return html || escapeHtml(JSON.stringify(obj));
  }

  function formatPlainTextReply(text) {
    // Normalize line endings
    text = String(text).replace(/\r\n/g, '\n');

    // If text contains "Steps:" or "Required Documents:" try to parse
    if (/Steps?:/i.test(text) || /Required Documents?:/i.test(text)) {
      // Split by double newlines into blocks
      const blocks = text.split(/\n\s*\n/);
      let html = '';
      blocks.forEach(block => {
        if (/Steps?:/i.test(block)) {
          let stepsText = block.replace(/Steps?:/i, '').trim();
          // Split either by numbered bullets or new lines
          let items = stepsText.split(/\n|(?=\d+\.)/).map(s => s.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean);
          if (items.length) {
            html += '<ol>';
            items.forEach(it => html += `<li>${escapeHtml(it)}</li>`);
            html += '</ol>';
          } else {
            html += `<p>${escapeHtml(stepsText)}</p>`;
          }
        } else if (/Required Documents?:/i.test(block)) {
          let docText = block.replace(/Required Documents?:/i, '').trim();
          html += `<p><strong>Required Documents:</strong> ${escapeHtml(docText)}</p>`;
        } else if (/Official Link:/i.test(block) || /Link:/i.test(block)) {
          const m = block.match(/(https?:\/\/[^\s]+)/);
          if (m) {
            const url = escapeHtml(m[1]);
            html += `<p><strong>Official Link:</strong> <a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></p>`;
          } else {
            html += `<p>${escapeHtml(block)}</p>`;
          }
        } else if (/Fee:/i.test(block) || /Approx\. Fee:/i.test(block)) {
          html += `<p>${escapeHtml(block)}</p>`;
        } else {
          html += `<p>${escapeHtml(block)}</p>`;
        }
      });
      return html;
    }

    // fallback: convert single newlines to <br>
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  // New addMsg - handles string or structured object
  function addMsg(content, who = 'bot') {
    const d = document.createElement('div');
    d.className = 'msg ' + (who === 'bot' ? 'bot' : 'user');

    if (who === 'bot') {
      // content may be a string or an object (structured)
      if (typeof content === 'object' && content !== null) {
        d.innerHTML = renderStructuredReply(content);
      } else {
        // If JSON (string) looks like an object, try to parse
        if (typeof content === 'string') {
          try {
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object') {
              d.innerHTML = renderStructuredReply(parsed);
            } else {
              d.innerHTML = formatPlainTextReply(content);
            }
          } catch (e) {
            d.innerHTML = formatPlainTextReply(content);
          }
        } else {
          d.innerHTML = escapeHtml(String(content));
        }
      }
    } else {
      // user message - keep plain text
      d.textContent = String(content);
    }

    messages.appendChild(d);
    messages.scrollTop = messages.scrollHeight;
  }

  async function queryServer(txt) {
    const res = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: txt, lang })
    });
    const j = await res.json();
    return j.reply;
  }

  sendBtn.onclick = async () => {
    const txt = input.value.trim();
    if (!txt) return;
    addMsg(txt, 'user');
    input.value = '';
    const reply = await queryServer(txt);
    addMsg(reply, 'bot');
  };

  clearBtn.onclick = () => { messages.innerHTML = '' };

  speakBtn.onclick = async () => {
    const last = [...messages.querySelectorAll('.bot')].pop();
    if (!last) return;
    const text = last.textContent;
    try {
      const res = await fetch('/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, lang })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        new Audio(url).play();
      }
    } catch (e) {
      console.log(e);
    }
  };

  micBtn.onclick = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech Recognition not supported.');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = lang === 'en' ? 'en-IN' : (lang === 'ta' ? 'ta-IN' : (lang === 'hi' ? 'hi-IN' : 'kn-IN'));
    rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; };
    rec.start();
  };

  if (typeof SERVICE_KEY !== 'undefined' && SERVICE_KEY && SERVICE_KEY !== 'none') {
    (async () => {
      const res = await fetch('/api/services');
      const data = await res.json();
      const key = SERVICE_KEY.toLowerCase();
      if (data[key]) {
        addMsg("Loaded info for: " + data[key].title, 'bot');
        const reply = await (await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: key, lang })
        })).json();
        addMsg(reply.reply, 'bot');
      }
    })();
  }

  try {
    const ctx = document.getElementById('pieChart');
    if (ctx) {
      new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Users', 'Chats', 'Feedbacks'],
          datasets: [{ data: [10, 5, 3], backgroundColor: ['#c4b5fd', '#bcd6ff', '#d6f0ff'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    const ctx2 = document.getElementById('dashPie');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ['Users', 'Chats', 'Feedbacks'],
          datasets: [{ data: [20, 15, 5], backgroundColor: ['#c4b5fd', '#bcd6ff', '#d6f0ff'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });

      const counters = document.querySelectorAll('.counter-item');
      counters.forEach((el, idx) => { setTimeout(() => el.classList.add('visible'), idx * 500); });

      const numEls = document.querySelectorAll('.counter-number');
      numEls.forEach(el => {
        const target = parseInt(el.dataset.target || '0', 10);
        let cur = 0;
        const step = Math.max(1, Math.floor(target / 30));
        const iv = setInterval(() => {
          cur += step;
          if (cur >= target) { cur = target; clearInterval(iv); }
          el.textContent = cur;
        }, 40);
      });
    }
  } catch (e) {
    console.log(e);
  }
});
