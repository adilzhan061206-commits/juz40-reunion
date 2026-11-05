/* 625 сөз · 30 күн — offline vocabulary trainer (no backend, no build step). */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var STATE_KEY = 'w30.state.v1';
  var IMG_KEY = 'w30.img.v1';
  var TOTAL_DAYS = 30;
  // Leitner: box -> days until next review. Box 6 = "үйренілді" (learned).
  var INTERVAL = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
  var LEARNED_BOX = 6;
  var REVIEW_CAP = 40;          // max cards in a review block
  var MORNING_REVIEW = 10;      // older words warmed up before today's new words
  var OLD_IN_TEST = 10;         // old words mixed into the evening test
  var REVIEW_DAY_TEST = 40;     // questions on review days 26–29
  var FINAL_TEST = 100;         // questions on day 30
  var INTERVIEW_LEN = 10;

  var INTERVIEW = [
    { q: 'Why do you want to go to the USA?', qk: 'Неге АҚШ-қа барғыңыз келеді?',
      a: 'I want to improve my English, see American culture and get work experience.',
      ak: 'Ағылшын тілімді жақсартып, Америка мәдениетін көріп, жұмыс тәжірибесін жинағым келеді.' },
    { q: 'What will you do there?', qk: 'Онда не істейсіз?',
      a: 'I will work as a cook at Vivs Kitchen and Juice Bar.',
      ak: 'Vivs Kitchen and Juice Bar-да аспаз болып жұмыс істеймін.' },
    { q: 'Where is your job?', qk: 'Жұмысыңыз қай жерде?',
      a: 'In Orleans, Massachusetts. It is on Cape Cod.',
      ak: 'Массачусетс штатындағы Орлеанс қаласында. Ол Кейп-Код түбегінде.' },
    { q: 'How did you find this job?', qk: 'Бұл жұмысты қалай таптыңыз?',
      a: 'I found it online.',
      ak: 'Интернеттен таптым.' },
    { q: 'How much will you earn?', qk: 'Қанша жалақы аласыз?',
      a: '18 dollars per hour, about 32 hours a week.',
      ak: 'Сағатына 18 доллар, аптасына шамамен 32 сағат.' },
    { q: 'Who is your sponsor?', qk: 'Демеуші ұйымыңыз кім?',
      a: 'CIEE.',
      ak: 'CIEE.' },
    { q: 'What do you study?', qk: 'Не оқисыз?',
      a: 'Information Systems at SDU University in Almaty.',
      ak: 'Алматыдағы SDU университетінде ақпараттық жүйелер мамандығында оқимын.' },
    { q: 'What year are you in?', qk: 'Нешінші курста оқисыз?',
      a: 'I am in my third year.',
      ak: 'Үшінші курста оқимын.' },
    { q: 'When will you graduate?', qk: 'Оқуды қашан бітіресіз?',
      a: 'In 2028.',
      ak: '2028 жылы.' },
    { q: 'When does your program end?', qk: 'Бағдарламаңыз қашан аяқталады?',
      a: 'My job ends on September 1.',
      ak: 'Жұмысым 1 қыркүйекте аяқталады.' },
    { q: 'When will you come back to Kazakhstan?', qk: 'Қазақстанға қашан ораласыз?',
      a: 'In early September, because my classes start.',
      ak: 'Қыркүйектің басында, себебі сабақтарым басталады.' },
    { q: 'Why will you come back?', qk: 'Неге қайтып ораласыз?',
      a: 'I must finish my university. I also have a job at Juz40, and my family is here.',
      ak: 'Университетті бітіруім керек. Сондай-ақ Juz40-та жұмысым бар, отбасым да осында.' },
    { q: 'Do you work now?', qk: 'Қазір жұмыс істейсіз бе?',
      a: 'Yes, I am a supervisor at Juz40, an education company.',
      ak: 'Иә, Juz40 білім беру компаниясында супервайзермін.' },
    { q: 'Do you have cooking experience?', qk: 'Аспаздық тәжірибеңіз бар ма?',
      a: 'Yes, I worked as a cook in Almaty and Aktobe.',
      ak: 'Иә, Алматы мен Ақтөбеде аспаз болып жұмыс істедім.' },
    { q: 'Where will you live?', qk: 'Қай жерде тұрасыз?',
      a: 'I will rent a room in Orleans.',
      ak: 'Орлеанста бөлме жалдаймын.' },
    { q: 'Have you been to the USA before?', qk: 'Бұрын АҚШ-та болдыңыз ба?',
      a: 'No, this is my first time.',
      ak: 'Жоқ, бұл — менің алғашқы сапарым.' },
    { q: 'What will you do in your free time?', qk: 'Бос уақытыңызда не істейсіз?',
      a: 'I want to see the ocean, visit Boston and celebrate the Fourth of July.',
      ak: 'Мұхитты көріп, Бостонға барып, 4 шілдедегі Тәуелсіздік күнін тойлағым келеді.' },
    { q: 'Do you have relatives in the USA?', qk: 'АҚШ-та туыстарыңыз бар ма?',
      a: "No, I don't.",
      ak: 'Жоқ, туыстарым жоқ.' },
    { q: 'What will you do after the program?', qk: 'Бағдарламадан кейін не істейсіз?',
      a: 'I will come back, finish my degree and work in IT.',
      ak: 'Елге оралып, оқуымды бітіремін және IT саласында жұмыс істеймін.' },
    { q: 'Tell me about yourself.', qk: 'Өзіңіз туралы айтып беріңізші.',
      a: 'My name is Adilzhan. I am from Kazakhstan. I am a student and I like math, football and cooking.',
      ak: 'Менің атым — Әділжан. Мен Қазақстанданмын. Студентпін, математиканы, футболды және тамақ пісіруді ұнатамын.' }
  ];

  var BOX_LABELS = { 1: '1-қорап', 2: '2-қорап', 3: '3-қорап', 4: '4-қорап', 5: '5-қорап', 6: 'Үйренілді' };

  // ---------------------------------------------------------------------------
  // Safe storage
  // ---------------------------------------------------------------------------
  function lsGet(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function lsDel(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Date helpers (local calendar dates as YYYY-MM-DD)
  // ---------------------------------------------------------------------------
  function ymd(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function today() { return ymd(new Date()); }
  function addDays(dateStr, n) {
    var p = dateStr.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  // ---------------------------------------------------------------------------
  // Small utils
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function announce(text) {
    var el = document.getElementById('sr-status');
    if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 30);
  }
  // In-page dialog (native confirm/alert are blocked in some embedded viewers).
  function dialog(message, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      var prev = document.activeElement;
      var wrap = document.createElement('div');
      wrap.className = 'dlg-backdrop';
      wrap.innerHTML = '<div class="dlg card" role="alertdialog" aria-modal="true" aria-labelledby="dlg-msg">' +
        '<p id="dlg-msg">' + esc(message) + '</p><div class="row mt">' +
        (cancelLabel ? '<button type="button" class="btn" data-dlg="0">' + esc(cancelLabel) + '</button>' : '') +
        '<button type="button" class="btn btn-primary" data-dlg="1">' + esc(okLabel || 'Жақсы') + '</button></div></div>';
      function close(v) {
        document.removeEventListener('keydown', onKey, true);
        wrap.remove();
        if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* ignore */ } }
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
        else if (e.key !== 'Tab' && e.key !== 'Enter' && e.key !== ' ') e.stopPropagation();
      }
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('[data-dlg]');
        if (b) close(b.getAttribute('data-dlg') === '1');
        else if (e.target === wrap) close(false);
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(wrap);
      wrap.querySelector('[data-dlg="1"]').focus();
    });
  }
  function stripDots(s) { return String(s).replace(/\.\.\.|…/g, '').replace(/\s+/g, ' ').trim(); }

  // Normalize English text for comparisons (typing + speech).
  var CONTRACTIONS = {
    "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "he's": 'he is', "she's": 'she is',
    "it's": 'it is', "that's": 'that is', "what's": 'what is', "there's": 'there is', "where's": 'where is',
    "how's": 'how is', "let's": 'let us', "i'll": 'i will', "you'll": 'you will', "we'll": 'we will',
    "i'd": 'i would', "you'd": 'you would', "i've": 'i have', "you've": 'you have', "we've": 'we have',
    "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'cannot', "won't": 'will not',
    "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "couldn't": 'could not',
    "shouldn't": 'should not', "wouldn't": 'would not', "haven't": 'have not', "hasn't": 'has not'
  };
  function normEn(s) {
    s = String(s || '').toLowerCase().replace(/[’‘`]/g, "'");
    s = s.replace(/[^a-z0-9'\s-]/g, ' ').replace(/-/g, ' ');
    s = s.split(/\s+/).filter(Boolean).map(function (w) { return CONTRACTIONS[w] || w; }).join(' ');
    return s.replace(/'/g, '').replace(/\bcan not\b/g, 'cannot').replace(/\s+/g, ' ').trim();
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = new Array(n + 1), cur = new Array(n + 1), i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[n];
  }

  // reading_kz: CAPITAL letters = stressed syllable -> bold.
  function readingHtml(r) {
    var out = '', buf = '', bold = false;
    function flush() {
      if (!buf) return;
      out += bold ? '<b>' + esc(buf) + '</b>' : esc(buf);
      buf = '';
    }
    for (var i = 0; i < r.length; i++) {
      var ch = r[i];
      var isLetter = ch.toLowerCase() !== ch.toUpperCase();
      var up = isLetter && ch === ch.toUpperCase();
      if (isLetter && up !== bold) { flush(); bold = up; }
      buf += ch;
    }
    flush();
    return out;
  }

  // Find the learned word inside its example sentence (handles simple inflections).
  var WILD = { a: 1, an: 1, the: 1, your: 1, my: 1, you: 1, me: 1, his: 1, her: 1, our: 1, their: 1, it: 1, someone: 1, something: 1 };
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var IRREGULAR = {
    pay: 'paid', run: 'ran', find: 'found', buy: 'bought', bring: 'brought', take: 'took|taken', make: 'made',
    get: 'got|gotten', go: 'went|gone', come: 'came', leave: 'left', feel: 'felt', meet: 'met', send: 'sent',
    spend: 'spent', keep: 'kept', tell: 'told', say: 'said', think: 'thought', know: 'knew|known', see: 'saw|seen',
    eat: 'ate|eaten', give: 'gave|given', write: 'wrote|written', speak: 'spoke|spoken', drive: 'drove|driven',
    break: 'broke|broken', choose: 'chose|chosen', forget: 'forgot|forgotten', lose: 'lost', cut: 'cut', put: 'put',
    sell: 'sold', teach: 'taught', catch: 'caught', fall: 'fell|fallen', hold: 'held', sleep: 'slept', wake: 'woke'
  };
  function tokenPattern(tok) {
    var t = tok.toLowerCase();
    if (WILD[t]) return "[\\w']+";
    if (IRREGULAR[t]) return '(?:' + escRe(t) + "[\\w']*|" + IRREGULAR[t] + ')';
    if (t.length >= 4) {
      var stem = t;
      if (/(e|y)$/.test(stem)) stem = stem.slice(0, -1);
      return escRe(stem) + "[\\w']*";
    }
    return escRe(t) + '(?:s|es|ed|d|ing)?';
  }
  function findWordSpan(sentence, english) {
    var tokens = stripDots(english).replace(/[?!.,]/g, '').split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    var tries = [
      tokens.map(tokenPattern).join("[\\s,]+"),
      tokens.map(tokenPattern).join("(?:[\\s,]+[\\w']+){0,2}[\\s,]+")
    ];
    for (var i = 0; i < tries.length; i++) {
      var re = new RegExp("(^|[^\\w'])(" + tries[i] + ")(?![\\w'])", 'i');
      var m = re.exec(sentence);
      if (m) {
        var start = m.index + m[1].length;
        return { start: start, end: start + m[2].length };
      }
    }
    return null;
  }
  function highlightExample(w) {
    var span = w._span;
    if (!span) return esc(w.example);
    var s = w.example;
    return esc(s.slice(0, span.start)) + '<mark>' + esc(s.slice(span.start, span.end)) + '</mark>' + esc(s.slice(span.end));
  }
  function gapSentence(w) {
    var s = w.example, span = w._span;
    return esc(s.slice(0, span.start)) + '<span class="gap" aria-label="бос орын">&nbsp;</span>' + esc(s.slice(span.end));
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  var DATA = null;          // words.json
  var WORDS = [];           // flat list
  var BY_ID = {};
  var DAY = {};             // day number -> day object

  function indexData(json) {
    DATA = json;
    WORDS = []; BY_ID = {}; DAY = {};
    json.days.forEach(function (d) {
      DAY[d.day] = d;
      d.words.forEach(function (w) {
        w._day = d.day;
        w._span = findWordSpan(w.example, w.english);
        WORDS.push(w);
        BY_ID[w.id] = w;
      });
    });
  }

  function loadWords() {
    return fetch('words.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  function freshState() {
    return {
      v: 1,
      current: 1,
      unlocked: 1,
      days: {},
      words: {},
      activity: [],
      stats: { answered: 0, correct: 0, seconds: 0 },
      settings: { hideReading: false, photos: true },
      miles: 0,
      created: today()
    };
  }
  var S = freshState();

  function loadState() {
    var s = lsGet(STATE_KEY, null);
    if (s && s.v === 1) {
      var base = freshState();
      Object.keys(base).forEach(function (k) { if (s[k] == null) s[k] = base[k]; });
      s.settings = Object.assign(base.settings, s.settings || {});
      s.stats = Object.assign(base.stats, s.stats || {});
      S = s;
    }
  }
  function save() { lsSet(STATE_KEY, S); }

  function dayState(n) {
    if (!S.days[n]) S.days[n] = { lesson: false, test: false, score: null, done: false, doneDate: null, seen: [] };
    if (!S.days[n].seen) S.days[n].seen = [];
    return S.days[n];
  }

  function markActivity() {
    var t = today();
    if (S.activity[S.activity.length - 1] !== t) {
      if (S.activity.indexOf(t) === -1) S.activity.push(t);
      if (S.activity.length > 400) S.activity = S.activity.slice(-400);
    }
  }
  function streak() {
    var set = {};
    S.activity.forEach(function (d) { set[d] = 1; });
    var d = today();
    if (!set[d]) d = addDays(d, -1);
    var n = 0;
    while (set[d]) { n++; d = addDays(d, -1); }
    return n;
  }

  function wordState(id) { return S.words[id]; }
  function boxOf(id) { var w = S.words[id]; return w ? w.box : 0; }
  function isDue(id, t) {
    var w = S.words[id];
    return !!(w && w.box < LEARNED_BOX && w.due && w.due <= (t || today()));
  }
  function dueIds() {
    var t = today();
    return Object.keys(S.words).filter(function (id) { return BY_ID[id] && isDue(id, t); });
  }
  // weakness score: lower box & more mistakes = weaker
  function weakness(id) {
    var w = S.words[id];
    if (!w) return 50; // never seen
    return (LEARNED_BOX - w.box) * 10 + (w.wrong || 0) * 3 - (w.right || 0);
  }
  function weakFirst(ids) {
    return shuffle(ids).sort(function (a, b) { return weakness(b) - weakness(a); });
  }

  // Leitner grading. A word can move up at most one box per calendar day.
  function grade(id, ok) {
    var t = today();
    var w = S.words[id];
    if (!w) w = S.words[id] = { box: 1, due: t, right: 0, wrong: 0, lastUp: null };
    if (ok) {
      w.right = (w.right || 0) + 1;
      if (w.lastUp !== t && w.box < LEARNED_BOX) {
        w.box += 1;
        w.lastUp = t;
        w.due = w.box >= LEARNED_BOX ? null : addDays(t, INTERVAL[w.box]);
      }
    } else {
      w.wrong = (w.wrong || 0) + 1;
      w.box = 1;
      w.due = t;
      w.lastUp = null;
    }
    markActivity();
    save();
  }

  function isReviewDay(n) { return !!(DAY[n] && DAY[n].review_days && DAY[n].review_days.length); }
  function dayWordIds(n) {
    var d = DAY[n];
    if (!d) return [];
    if (isReviewDay(n)) {
      var ids = [];
      d.review_days.forEach(function (rd) { (DAY[rd] ? DAY[rd].words : []).forEach(function (w) { ids.push(w.id); }); });
      return ids;
    }
    return d.words.map(function (w) { return w.id; });
  }

  function checkDayDone(n) {
    var ds = dayState(n);
    if (ds.done || !ds.lesson || !ds.test) return false;
    ds.done = true;
    ds.doneDate = today();
    if (n < TOTAL_DAYS) S.unlocked = Math.max(S.unlocked, n + 1);
    save();
    return true;
  }

  // When the calendar day changes after a finished day, move on automatically.
  function autoAdvance() {
    var ds = S.days[S.current];
    if (ds && ds.done && ds.doneDate && ds.doneDate < today() && S.current < TOTAL_DAYS && S.current === S.unlocked - 1) {
      S.current += 1;
      save();
    }
    if (S.unlocked < S.current) S.unlocked = S.current;
  }

  // ---------------------------------------------------------------------------
  // Study-time tracking (only while a study screen is open, visible and active)
  // ---------------------------------------------------------------------------
  var lastInteract = Date.now();
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () { lastInteract = Date.now(); }, { passive: true });
  });
  setInterval(function () {
    if (!session || document.visibilityState !== 'visible') return;
    if (Date.now() - lastInteract > 90000) return;
    S.stats.seconds = (S.stats.seconds || 0) + 5;
    if (S.stats.seconds % 30 === 0) save();
  }, 5000);

  // ---------------------------------------------------------------------------
  // Speech synthesis
  // ---------------------------------------------------------------------------
  var synth = window.speechSynthesis || null;
  var voice = null;
  function pickVoice() {
    if (!synth) return;
    var voices = synth.getVoices() || [];
    var us = voices.filter(function (v) { return /^en[-_]US/i.test(v.lang); });
    if (!us.length) us = voices.filter(function (v) { return /^en/i.test(v.lang); });
    var prefs = [/samantha/i, /\bava\b/i, /allison/i, /google us english/i, /aria/i, /jenny/i, /natural/i, /zoe/i, /nicky/i, /susan/i, /alex/i, /zira/i, /guy/i];
    function score(v) {
      var s = 0;
      if (/^en[-_]US/i.test(v.lang)) s += 100;
      if (/enhanced|premium|neural|natural/i.test(v.name)) s += 30;
      for (var i = 0; i < prefs.length; i++) if (prefs[i].test(v.name)) { s += 40 - i * 2; break; }
      if (v.localService) s += 5;
      if (/novelty|whisper|bad news|bells|boing|bubbles|cellos|zarvox|trinoids|albert|jester|organ|superstar|wobble|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy/i.test(v.name)) s -= 200;
      return s;
    }
    us.sort(function (a, b) { return score(b) - score(a); });
    voice = us[0] || null;
  }
  if (synth) {
    pickVoice();
    if ('onvoiceschanged' in synth) synth.onvoiceschanged = pickVoice;
  }
  function speak(text, rate) {
    if (!synth) return;
    try {
      synth.cancel();
      var u = new SpeechSynthesisUtterance(stripDots(text));
      u.lang = 'en-US';
      if (voice) u.voice = voice;
      u.rate = rate || 0.9;
      synth.speak(u);
    } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Speech recognition
  // ---------------------------------------------------------------------------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var activeRec = null;
  function recognize() {
    return new Promise(function (resolve, reject) {
      if (!SR) { reject('unsupported'); return; }
      try { if (synth) synth.cancel(); } catch (e) { /* ignore */ }
      var rec = new SR();
      var done = false;
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 5;
      rec.continuous = false;
      rec.onresult = function (e) {
        done = true;
        var res = e.results[0], alts = [];
        for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
        resolve(alts);
      };
      rec.onerror = function (e) { if (!done) { done = true; reject(e.error || 'error'); } };
      rec.onend = function () { activeRec = null; if (!done) { done = true; resolve([]); } };
      activeRec = rec;
      try { rec.start(); } catch (err) { done = true; reject('start'); }
    });
  }
  function stopRecognition() { if (activeRec) { try { activeRec.abort(); } catch (e) { /* ignore */ } activeRec = null; } }

  function lcsMatch(targetWords, saidWords) {
    var m = targetWords.length, n = saidWords.length, i, j;
    var dp = [];
    for (i = 0; i <= m; i++) { dp.push(new Array(n + 1).fill(0)); }
    for (i = m - 1; i >= 0; i--) for (j = n - 1; j >= 0; j--) {
      dp[i][j] = targetWords[i] === saidWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
    var hit = new Array(m).fill(false);
    i = 0; j = 0;
    while (i < m && j < n) {
      if (targetWords[i] === saidWords[j]) { hit[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return hit;
  }

  // Compare recognized alternatives with target. Returns {ok, said, html}.
  function compareSpeech(target, alts) {
    var tNorm = normEn(stripDots(target));
    var tWords = tNorm.split(' ').filter(Boolean);
    var best = null;
    alts.forEach(function (alt) {
      var aNorm = normEn(alt);
      var aWords = aNorm.split(' ').filter(Boolean);
      var hits = lcsMatch(tWords, aWords);
      var count = hits.filter(Boolean).length;
      var exact = aNorm === tNorm || (tWords.length <= 3 && (' ' + aNorm + ' ').indexOf(' ' + tNorm + ' ') !== -1 && aWords.length <= tWords.length + 2);
      var score = exact ? 1000 : count / Math.max(tWords.length, aWords.length);
      if (!best || score > best.score) best = { score: score, exact: exact, alt: alt, hits: hits };
    });
    if (!best) return { ok: false, said: '', html: '' };
    var origWords = stripDots(target).split(/\s+/);
    var html = '';
    if (origWords.length === best.hits.length) {
      html = origWords.map(function (w, i) { return '<span class="' + (best.hits[i] || best.exact ? 'hit' : 'miss') + '">' + esc(w) + '</span>'; }).join(' ');
    }
    var ok = best.exact || (tWords.length >= 4 && best.score >= 0.9);
    return { ok: ok, said: best.alt, html: html };
  }

  // A reusable "🎤 say it" widget. Returns HTML; wire with bindMic().
  function micBlock(id) {
    if (!SR) return '';
    return '<button type="button" class="btn btn-soft" data-mic="' + id + '" aria-describedby="' + id + '-out">🎤 Айтып көру</button>' +
      '<div id="' + id + '-out" class="speech-out" hidden aria-live="polite"></div>';
  }
  function bindMic(id, getTarget) {
    var btn = $('[data-mic="' + id + '"]');
    if (!btn) return;
    var out = document.getElementById(id + '-out');
    btn.addEventListener('click', function () {
      if (activeRec) { stopRecognition(); return; }
      var target = getTarget();
      btn.classList.add('mic-on');
      btn.textContent = '🎙️ Тыңдап тұрмын…';
      out.hidden = false;
      out.className = 'speech-out';
      out.textContent = 'Енді айт: «' + stripDots(target) + '»';
      recognize().then(function (alts) {
        if (!alts.length) {
          out.textContent = 'Ештеңе естілмеді. Қайта байқап көр.';
          return;
        }
        var r = compareSpeech(target, alts);
        out.className = 'speech-out ' + (r.ok ? 'ok' : 'bad');
        out.innerHTML = '<div>' + (r.ok ? '✅ Дұрыс айттың!' : '❌ Сәл басқаша шықты. Дұрысын тыңда.') + '</div>' +
          '<div class="mt-s small muted">Танылған мәтін:</div><div><b>' + esc(r.said) + '</b></div>' +
          (r.html && !r.ok ? '<div class="mt-s diff small">' + r.html + '</div>' : '');
        announce(r.ok ? 'Дұрыс' : 'Қате. Дұрыс айтылуы ойнатылады');
        if (r.ok) addMiles(5);
        if (!r.ok) setTimeout(function () { speak(target, 0.8); }, 400);
      }).catch(function (err) {
        out.className = 'speech-out bad';
        out.textContent = (err === 'not-allowed' || err === 'service-not-allowed')
          ? 'Микрофонға рұқсат берілмеді. Браузер баптауларынан рұқсат бер.'
          : 'Сөйлеуді тану сәтсіз аяқталды. Қайта байқап көр.';
      }).then(function () {
        btn.classList.remove('mic-on');
        btn.textContent = '🎤 Айтып көру';
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Pictures: emoji always; real photo (Openverse → Wikimedia) when online.
  // ---------------------------------------------------------------------------
  var imgCache = lsGet(IMG_KEY, {}) || {};
  var imgPending = {};
  var PHOTO_POS = { noun: 1, verb: 1, adjective: 1 }; // abstract phrases → emoji only (avoids text-heavy pictures)

  function photoWanted(w) { return S.settings.photos && PHOTO_POS[w.part_of_speech]; }
  function cachedPhoto(w) {
    var c = imgCache[w.image_query];
    return c && c.u ? c.u : null;
  }
  function saveImgCache() { lsSet(IMG_KEY, imgCache); }

  function fetchJson(url, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 7000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function fromOpenverse(q) {
    var url = 'https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) +
      '&page_size=5&mature=false&category=photograph&aspect_ratio=wide,square';
    return fetchJson(url).then(function (j) {
      var list = (j && j.results) || [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.mature) continue;
        var u = r.thumbnail || r.url;
        if (u && /^https:/.test(u)) return u;
      }
      return null;
    });
  }
  function fromWikimedia(q) {
    var url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
      '&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=' + encodeURIComponent(q + ' filetype:bitmap') +
      '&prop=imageinfo&iiprop=url|mime&iiurlwidth=480';
    return fetchJson(url).then(function (j) {
      var pages = j && j.query && j.query.pages ? Object.keys(j.query.pages).map(function (k) { return j.query.pages[k]; }) : [];
      pages.sort(function (a, b) { return (a.index || 0) - (b.index || 0); });
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i], info = p.imageinfo && p.imageinfo[0];
        if (!info || !/jpe?g|png|webp/i.test(info.mime || '')) continue;
        if (/logo|diagram|map|chart|text|sign|poster|flag|icon|svg|screenshot|document|page/i.test(p.title || '')) continue;
        if (info.thumburl) return info.thumburl;
      }
      return null;
    });
  }
  // Resolve a photo URL for a word, cached. Calls back only if a photo was found.
  function resolvePhoto(w, cb) {
    if (!photoWanted(w) || !navigator.onLine) return;
    var q = w.image_query;
    var c = imgCache[q];
    if (c) {
      if (c.u) { cb && cb(c.u); return; }
      if (c.t && Date.now() - c.t < 7 * 864e5) return; // "not found" remembered for a week
    }
    if (imgPending[q]) { imgPending[q].push(cb); return; }
    imgPending[q] = [cb];
    fromOpenverse(q).catch(function () { return null; }).then(function (u) {
      return u || fromWikimedia(q).catch(function () { return null; });
    }).then(function (u) {
      imgCache[q] = u ? { u: u } : { u: null, t: Date.now() };
      saveImgCache();
      var cbs = imgPending[q] || [];
      delete imgPending[q];
      if (u) cbs.forEach(function (f) { if (f) f(u); });
    });
  }
  function picHtml(w) {
    var u = photoWanted(w) ? cachedPhoto(w) : null;
    return '<div class="pic' + (u ? ' has-photo' : '') + '" data-pic="' + esc(w.id) + '">' +
      (u ? '<img alt="' + esc(w.english) + ' — сурет" src="' + esc(u) + '" referrerpolicy="no-referrer" decoding="async">' : '') +
      '<span class="emoji" role="img" aria-label="' + esc(w.english) + '">' + esc(w.image_emoji) + '</span></div>';
  }
  function wirePic(w) {
    var box = $('[data-pic="' + w.id + '"]');
    if (!box) return;
    function attachErr(img) {
      img.addEventListener('error', function () {
        img.remove();
        box.classList.remove('has-photo');
        imgCache[w.image_query] = { u: null, t: Date.now() };
        saveImgCache();
      });
    }
    var existing = $('img', box);
    if (existing) { attachErr(existing); return; }
    resolvePhoto(w, function (u) {
      if (!document.body.contains(box) || $('img', box)) return;
      var img = new Image();
      img.alt = w.english + ' — сурет';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.onload = function () {
        if (!document.body.contains(box)) return;
        box.insertBefore(img, box.firstChild);
        box.classList.add('has-photo');
      };
      img.onerror = function () {
        imgCache[w.image_query] = { u: null, t: Date.now() };
        saveImgCache();
      };
      img.src = u;
    });
  }
  function prefetchPhoto(w) { if (w) resolvePhoto(w, null); }

  // ---------------------------------------------------------------------------
  // Confetti
  // ---------------------------------------------------------------------------
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.getElementById('confetti');
    if (!c || !c.getContext) return;
    var ctx = c.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    ctx.scale(dpr, dpr);
    var colors = ['#2f5bea', '#ffb703', '#22c55e', '#ef4444', '#a855f7', '#06b6d4'];
    var parts = [];
    for (var i = 0; i < 160; i++) {
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.35,
        vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
        s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length]
      });
    }
    var start = performance.now();
    function frame(now) {
      var t = now - start;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 2800);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (t < 2800) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  var app = document.getElementById('app');
  var session = null;       // current study session (lesson/test/interview/speak)
  var keyHandler = null;    // per-screen keyboard handler

  function go(screen) {
    if (location.hash === '#' + screen) route(); else location.hash = screen;
  }
  function route() {
    stopRecognition();
    var oldToast = document.querySelector('.toast');
    if (oldToast) oldToast.remove();
    if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } }
    keyHandler = null;
    var screen = (location.hash || '#home').slice(1);
    var dm = /^day-(\d{1,2})$/.exec(screen);
    if (dm) {
      var want = +dm[1];
      if (want >= 1 && want <= TOTAL_DAYS && DAY[want]) {
        S.current = want;
        S.unlocked = Math.max(S.unlocked, want);
        save();
      }
      session = null;
      try { history.replaceState(null, '', '#home'); } catch (e) { /* ignore */ }
      screen = 'home';
    }
    var needsSession = { lesson: 1, test: 1, result: 1, interview: 1, speak: 1 };
    if (needsSession[screen] && (!session || session.screen !== screen)) screen = 'home';
    if (screen === 'home' || screen === 'progress') session = null;
    var fn = { home: renderHome, progress: renderProgress, lesson: renderLesson, test: renderTest, result: renderResult, interview: renderInterview, speak: renderSpeak }[screen] || renderHome;
    fn();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', function (e) {
    if (keyHandler && !e.metaKey && !e.ctrlKey && !e.altKey) keyHandler(e);
  });

  function setView(html, focusSel) {
    app.innerHTML = html;
    var f = focusSel ? $(focusSel) : $('h1', app);
    if (f) {
      if (!f.hasAttribute('tabindex') && !/^(BUTTON|INPUT|A)$/.test(f.tagName)) f.setAttribute('tabindex', '-1');
      try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    }
  }
  function topbar(title) {
    return '<div class="topbar"><button type="button" class="icon-btn" data-act="home" aria-label="Басты бетке оралу">←</button>' +
      '<h1 class="title">' + esc(title) + '</h1><span class="spacer"></span></div>';
  }
  function bindCommon() {
    $all('[data-act="home"]').forEach(function (b) { b.addEventListener('click', function () { go('home'); }); });
  }

  // ---------------------------------------------------------------------------
  // Shared visual pieces: flight path, miles
  // ---------------------------------------------------------------------------
  var PLANE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21.6 12c0-.8-.7-1.4-1.5-1.4h-5.3L9.9 3.1H7.8l2.5 7.5H5.6L3.9 8.4H2.4l1 3.6-1 3.6h1.5l1.7-2.2h4.7l-2.5 7.5h2.1l4.9-7.5h5.3c.8 0 1.5-.6 1.5-1.4z"/></svg>';
  function flightBar(pct) {
    var p = Math.max(0, Math.min(100, pct));
    return '<div class="flight" aria-hidden="true"><span class="fill" style="width:' + p + '%"></span>' +
      '<span class="plane" style="left:' + Math.max(3, Math.min(97, p)) + '%">' + PLANE_SVG + '</span></div>';
  }
  function tripHeader(text, done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    return '<div class="counter" role="status">' + esc(text) + '</div>' +
      '<div class="trip">' + flightBar(pct) + '</div>';
  }

  var CLASSES = [
    { min: 0, name: 'Эконом' },
    { min: 3000, name: 'Эконом плюс' },
    { min: 9000, name: 'Бизнес' },
    { min: 18000, name: 'Бірінші класс' }
  ];
  function milesClass(m) {
    var cur = CLASSES[0], next = null;
    for (var i = 0; i < CLASSES.length; i++) {
      if (m >= CLASSES[i].min) { cur = CLASSES[i]; next = CLASSES[i + 1] || null; }
    }
    return { cur: cur, next: next };
  }
  function fmtNum(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  var toastTimer = null;
  function addMiles(n, quiet) {
    if (!n) return;
    S.miles = (S.miles || 0) + n;
    if (session) session.miles = (session.miles || 0) + n;
    save();
    if (quiet) return;
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = '✈ <b>+' + n + '</b> миль';
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 1500);
  }
  function daysDoneCount() {
    var c = 0;
    for (var d = 1; d <= TOTAL_DAYS; d++) if (S.days[d] && S.days[d].done) c++;
    return c;
  }

  // ---------------------------------------------------------------------------
  // HOME
  // ---------------------------------------------------------------------------
  function morningReviewIds(n) {
    var own = {};
    dayWordIds(n).forEach(function (id) { own[id] = 1; });
    return weakFirst(dueIds().filter(function (id) { return !own[id]; }));
  }

  function renderHome() {
    autoAdvance();
    var n = S.current;
    var d = DAY[n];
    var ds = dayState(n);
    var review = isReviewDay(n);
    var due = dueIds().length;
    var learned = Object.keys(S.words).filter(function (id) { return BY_ID[id] && S.words[id].box >= LEARNED_BOX; }).length;
    var seen = Math.min(ds.seen.length, 25);
    var morningRev = Math.min(morningReviewIds(n).length, MORNING_REVIEW);

    var pct;
    if (review) pct = (ds.lesson ? 50 : 0) + (ds.test ? 50 : 0);
    else pct = Math.round(((seen + (ds.test ? 25 : 0)) / 50) * 100);

    // where the plane is on the 30-day route
    var routePct = ((n - 1) + pct / 100) / TOTAL_DAYS * 100;

    // today's words (stub of the pass)
    var stub;
    if (review) {
      var rd = d.review_days;
      stub = '<span class="label">Бүгін қайталанатын сөздер</span>' +
        '<p class="mt-s">' + (rd.length > 1 ? rd[0] + '–' + rd[rd.length - 1] : rd[0]) + '-күндердің ' + dayWordIds(n).length + ' сөзі' +
        (n === TOTAL_DAYS ? ' · 100 сұрақтық қорытынды тест' : '') + '</p>';
    } else {
      var words = d.words.map(function (w) { return w.english; });
      stub = '<span class="label">Бүгінгі 25 жаңа сөз</span><div class="chips" lang="en">' +
        words.slice(0, 9).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') +
        '<span class="more">+' + (words.length - 9) + '</span></div>';
    }

    var cls = milesClass(S.miles || 0).cur.name;
    var pass =
      '<section class="pass" aria-label="Отырғызу талоны">' +
        '<div class="pass-main">' +
          '<div class="pass-top"><span class="label">Boarding pass · J-1 2027</span><span class="label">' + esc(cls) + '</span></div>' +
          '<div class="pass-day"><div><h1>' + n + '-күн</h1></div>' +
            '<span class="streak" aria-label="Күн қатарынан: ' + streak() + '">🔥 ' + streak() + '</span></div>' +
          '<p class="topic">' + esc(d.topic_kz) + '</p>' +
          '<p class="topic-en" lang="en">' + esc(d.topic_en) + '</p>' +
          '<div class="route" aria-label="Маршрут: ' + n + '-күн, 30 күннің ішінде">' +
            '<div><div class="iata">ALA</div><div class="city">Алматы</div></div>' +
            flightBar(routePct) +
            '<div class="right"><div class="iata">BOS</div><div class="city">Кейп-Код</div></div>' +
          '</div>' +
          '<div class="fields">' +
            '<div><span class="label">Күн</span><b>' + (n < 10 ? '0' : '') + n + '<small>/30</small></b></div>' +
            '<div><span class="label">Миль</span><b>' + fmtNum(S.miles || 0) + '</b></div>' +
            '<div><span class="label">Үйренілді</span><b>' + learned + '<small>/' + WORDS.length + '</small></b></div>' +
          '</div>' +
        '</div>' +
        '<div class="pass-stub">' + stub + '</div>' +
      '</section>';

    var landed = '';
    if (ds.done) {
      landed = '<div class="landed" role="status"><h2>🛬 ' + n + '-күн аяқталды!</h2>' +
        (n < TOTAL_DAYS
          ? '<p>Жарайсың! ' + (n + 1) + '-күн ашылды. Ертең таңертең жалғастыр немесе қазір баста.</p>' +
            '<button type="button" class="btn btn-ok btn-block mt" data-act="next-day">' + (n + 1) + '-күнге ұшу →</button>'
          : '<p>Құттықтаймыз! 30 күндік бағдарламаны толық аяқтадың. Енді сұхбатқа дайынсың! 🇺🇸</p>') +
        '</div>';
    }

    var lessonSub, lessonState, testSub, testState;
    if (review) {
      lessonSub = 'Әлсіз сөздерді қайталау · ' + REVIEW_CAP + ' карточка';
    } else if (ds.lesson) {
      lessonSub = '25 жаңа сөз өтілді';
    } else if (seen > 0) {
      lessonSub = 'Жаңа сөздер: ' + seen + '/25 — жалғастыр';
    } else {
      lessonSub = (morningRev ? morningRev + ' қайталау + ' : '') + '25 жаңа сөз';
    }
    lessonState = ds.lesson ? 'ДАЙЫН ✓' : (seen > 0 && !review ? seen + '/25' : 'БАСТАУ →');
    testSub = n === TOTAL_DAYS ? '100 сұрақ · барлық 625 сөз' : (review ? REVIEW_DAY_TEST + ' сұрақ · әлсіз сөздер' : '25 бүгінгі + ескі сөздер');
    testState = ds.test ? ds.score + '% ✓' : (ds.lesson ? 'БАСТАУ →' : 'КЕШКЕ');
    var lessonCls = ds.lesson ? 'is-done' : 'is-next';
    var testCls = ds.test ? 'is-done' : (ds.lesson ? 'is-next' : '');

    setView(
      pass +
      landed +
      '<div class="section-head"><h2>Бүгінгі маршрут</h2><span class="pct">' + pct + '%</span></div>' +
      '<div class="daybar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Күннің прогресі"><span style="width:' + pct + '%"></span></div>' +
      '<ol class="steps">' +
        '<li><button type="button" class="step ' + lessonCls + '" data-act="lesson">' +
          '<span class="step-n" aria-hidden="true">' + (ds.lesson ? '✓' : '1') + '</span>' +
          '<span class="step-body"><span class="step-t">☀️ Таңғы сабақ</span><span class="step-s">' + esc(lessonSub) + '</span></span>' +
          '<span class="step-state">' + lessonState + '</span></button></li>' +
        '<li><button type="button" class="step ' + testCls + '" data-act="test">' +
          '<span class="step-n" aria-hidden="true">' + (ds.test ? '✓' : '2') + '</span>' +
          '<span class="step-body"><span class="step-t">🌙 Кешкі тест</span><span class="step-s">' + esc(testSub) + '</span></span>' +
          '<span class="step-state">' + testState + '</span></button></li>' +
      '</ol>' +
      '<div class="due-row">' +
        '<span class="txt">🔁 Бүгін қайталауға: ' + due + ' сөз</span>' +
        (due ? '<button type="button" class="btn btn-soft btn-small" data-act="review">Қайталау</button>' : '<span class="muted" aria-label="Бәрі қайталанды">✓</span>') +
      '</div>' +
      '<nav class="tiles" aria-label="Қосымша жаттығулар">' +
        '<button type="button" class="tile" data-act="interview"><span class="ico" aria-hidden="true">🎙️</span>Сұхбат жаттығуы</button>' +
        '<button type="button" class="tile" data-act="speak"><span class="ico" aria-hidden="true">🗣️</span>Айтылу жаттығуы</button>' +
        '<button type="button" class="tile" data-act="progress"><span class="ico" aria-hidden="true">📊</span>Прогресс</button>' +
      '</nav>' +
      '<p class="reminder mt">Таңертең — жаңа 25 сөз, кешке — тест. Күніне 30–40 минут.</p>' +
      (n < TOTAL_DAYS && !ds.done
        ? '<div class="center mt-s"><button type="button" class="btn btn-ghost btn-small" data-act="unlock">Келесі күнді ашу</button></div>'
        : '')
    );

    function on(act, fn) { var b = $('[data-act="' + act + '"]'); if (b) b.addEventListener('click', fn); }
    on('lesson', function () { startLesson('lesson'); });
    on('review', function () { startLesson('due'); });
    on('test', function () { startTest(n === TOTAL_DAYS ? 'final' : 'day'); });
    on('interview', startInterview);
    on('progress', function () { go('progress'); });
    on('speak', startSpeak);
    on('next-day', function () { S.current = Math.min(TOTAL_DAYS, n + 1); S.unlocked = Math.max(S.unlocked, S.current); save(); renderHome(); });
    on('unlock', function () {
      function unlock() { S.current = n + 1; S.unlocked = Math.max(S.unlocked, S.current); save(); renderHome(); }
      if (ds.done) { unlock(); return; }
      dialog('Бүгінгі сабақ пен тест әлі аяқталмаған. Бәрібір ' + (n + 1) + '-күнді ашасың ба?', 'Иә, ашу', 'Жоқ').then(function (yes) { if (yes) unlock(); });
    });
  }

  // ---------------------------------------------------------------------------
  // LESSON (flashcards)
  // ---------------------------------------------------------------------------
  function startLesson(mode, ids) {
    var n = S.current;
    var ds = dayState(n);
    var queue = [];
    if (mode === 'due') {
      weakFirst(dueIds()).slice(0, REVIEW_CAP).forEach(function (id) { queue.push({ id: id, kind: 'review' }); });
    } else if (mode === 'list') {
      ids.forEach(function (id) { queue.push({ id: id, kind: 'review' }); });
    } else if (isReviewDay(n)) {
      var due = weakFirst(dueIds()).slice(0, REVIEW_CAP);
      var dueSet = {};
      due.forEach(function (id) { dueSet[id] = 1; queue.push({ id: id, kind: 'review' }); });
      var extra = weakFirst(dayWordIds(n).filter(function (id) { return !dueSet[id]; }));
      extra.slice(0, Math.max(10, REVIEW_CAP - queue.length)).forEach(function (id) { queue.push({ id: id, kind: 'review' }); });
    } else {
      // A short warm-up of the weakest older words, then today's 25 new words.
      // The rest of the due words stay in "Бүгін қайталауға" on the home screen.
      var dayIds = dayWordIds(n);
      var unseen = dayIds.filter(function (id) { return ds.seen.indexOf(id) === -1; });
      var fresh = unseen.length ? unseen : dayIds; // all seen → go through again
      if (unseen.length === dayIds.length) {
        morningReviewIds(n).slice(0, MORNING_REVIEW).forEach(function (id) { queue.push({ id: id, kind: 'review' }); });
      }
      if (queue.length) queue.push({ kind: 'break', count: fresh.length });
      fresh.forEach(function (id) { queue.push({ id: id, kind: 'new' }); });
    }
    if (!queue.length) {
      dialog('Қазір қайталайтын сөз жоқ. Жарайсың! 👏');
      return;
    }
    session = { screen: 'lesson', mode: mode, day: n, queue: queue, pos: 0, flipped: false, requeued: {}, known: 0, unknown: 0, unknownIds: [], miles: 0 };
    go('lesson');
  }

  function renderBreak(item) {
    var s = session;
    setView(
      topbar('Таңғы сабақ') +
      '<section class="card break-card" aria-live="polite">' +
        '<div class="big" aria-hidden="true">🛫</div>' +
        '<h2>Қайталау аяқталды!</h2>' +
        '<p>Ескі сөздер: білемін — ' + s.known + ', білмеймін — ' + s.unknown + '.</p>' +
        '<p>Енді бүгінгі <b>' + item.count + ' жаңа сөз</b>.</p>' +
      '</section>' +
      '<button type="button" class="btn btn-primary btn-block mt" data-act="go-new">Жаңа сөздерді бастау →</button>',
      '[data-act="go-new"]'
    );
    bindCommon();
    $('[data-act="go-new"]').addEventListener('click', function () { s.pos++; renderLesson(); });
    keyHandler = function (e) { if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { s.pos++; renderLesson(); } };
  }

  function renderLesson() {
    var s = session;
    if (s.pos >= s.queue.length) return finishLesson();
    var item = s.queue[s.pos];
    if (item.kind === 'break') return renderBreak(item);
    var w = BY_ID[item.id];
    var cards = s.queue.filter(function (q) { return q.kind !== 'break'; });
    var before = s.queue.slice(0, s.pos).filter(function (q) { return q.kind !== 'break'; }).length;
    var newTotal = s.queue.filter(function (q) { return q.kind === 'new'; }).length;
    var revTotal = cards.length - newTotal;
    var idxInKind = s.queue.slice(0, s.pos + 1).filter(function (q) { return q.kind === item.kind; }).length;
    var phase = item.kind === 'new' ? 'Жаңа сөздер · ' + idxInKind + '/' + newTotal : 'Қайталау · ' + idxInKind + '/' + revTotal;
    var hide = S.settings.hideReading;
    var st = S.words[w.id];
    var box = st ? Math.min(st.box, 5) : 0;
    var dots = '';
    for (var b = 1; b <= 5; b++) dots += '<i class="' + (b <= box ? 'on' : '') + '"></i>';
    var breakIdx = -1;
    s.queue.forEach(function (q, i) { if (q.kind === 'break') breakIdx = i; });
    var canSkip = s.mode === 'lesson' && item.kind === 'review' && breakIdx > s.pos;

    var tag = item.kind === 'new'
      ? '<div class="tag is-new"><span class="label">Жаңа сөз</span><span class="label">' + w._day + '-күн</span></div>'
      : '<div class="tag"><span class="label">Қайталау · ' + w._day + '-күннен</span><span class="boxdots" role="img" aria-label="' + (box || 1) + '-қорап">' + dots + '</span></div>';

    var front =
      tag +
      picHtml(w) +
      '<div class="word" lang="en">' + esc(w.english) + '</div>' +
      '<div class="pos" lang="en">' + esc(w.part_of_speech) + '</div>' +
      '<div class="pron"><span class="ipa" lang="en">' + esc(w.ipa) + '</span>' +
        (hide
          ? '<button type="button" class="reading-hidden" data-act="show-reading" aria-label="Оқылуын көрсету">👁 оқылуы</button>'
          : '<span class="reading">' + readingHtml(w.reading_kz) + '</span>') +
      '</div>' +
      '<p class="example" lang="en">' + highlightExample(w) + '</p>';

    var back = s.flipped
      ? '<hr class="flip-line">' +
        '<div class="meaning">' + esc(w.kazakh) + '</div>' +
        '<p class="example-kz">' + esc(w.example_kz) + '</p>'
      : '';

    var actions = s.flipped
      ? '<div class="row mt"><button type="button" class="btn btn-bad" data-act="unknown">Білмеймін 🔁</button>' +
        '<button type="button" class="btn btn-ok" data-act="known">Білемін ✅</button></div>'
      : '<button type="button" class="btn btn-primary btn-block mt" data-act="flip">Аудару — мағынасын көру</button>';
    var hint = s.flipped ? 'Пернетақта: 1 — білмеймін, 2 — білемін, L — тыңдау' : 'Пернетақта: Space — аудару, L — тыңдау';

    setView(
      topbar(s.mode === 'lesson' ? 'Таңғы сабақ' : 'Қайталау') +
      tripHeader(phase, before, cards.length) +
      '<article class="card flash mt' + (s.flipped ? ' flipped' : '') + '" aria-label="Сөз карточкасы">' + front + back + '</article>' +
      actions +
      '<div class="grid2 mt">' +
        '<button type="button" class="btn" data-act="say">🔊 Тыңдау</button>' +
        '<button type="button" class="btn" data-act="slow">🐢 Баяу</button>' +
        '<button type="button" class="btn" data-act="sentence"' + (SR ? '' : ' style="grid-column:1/-1"') + '>🔊 Сөйлемді тыңдау</button>' +
        (SR ? '<button type="button" class="btn btn-soft" data-mic="mic-card" aria-describedby="mic-card-out">🎤 Айтып көру</button>' : '') +
      '</div>' +
      (SR ? '<div id="mic-card-out" class="speech-out" hidden aria-live="polite"></div>' : '') +
      '<label class="toggle mt-s"><span>Оқылуын жасыру</span><input type="checkbox" role="switch" data-act="hide"' + (hide ? ' checked' : '') + '></label>' +
      (canSkip ? '<button type="button" class="btn btn-ghost btn-block" data-act="skip-review">Қайталауды өткізіп, жаңа сөздерге өту →</button>' : '') +
      '<p class="center small muted">' + hint + '</p>',
      s.flipped ? '[data-act="known"]' : 'h1'
    );
    bindCommon();
    wirePic(w);
    var next = s.queue[s.pos + 1];
    if (next && next.id) prefetchPhoto(BY_ID[next.id]);
    bindMic('mic-card', function () { return w.english; });

    function on(act, fn) { var el = $('[data-act="' + act + '"]'); if (el) el.addEventListener(el.type === 'checkbox' ? 'change' : 'click', fn); }
    on('say', function () { speak(w.english, 0.9); });
    on('slow', function () { speak(w.english, 0.6); });
    on('sentence', function () { speak(w.example, 0.9); });
    on('flip', flip);
    on('known', function () { answer(true); });
    on('unknown', function () { answer(false); });
    on('skip-review', function () { s.pos = breakIdx + 1; s.flipped = false; renderLesson(); });
    on('hide', function (e) { S.settings.hideReading = e.target.checked; save(); renderLesson(); });
    on('show-reading', function (e) {
      var span = document.createElement('span');
      span.className = 'reading';
      span.innerHTML = readingHtml(w.reading_kz);
      e.currentTarget.replaceWith(span);
    });

    function flip() { s.flipped = true; renderLesson(); announce(w.kazakh); }
    function answer(ok) {
      grade(w.id, ok);
      if (item.kind === 'new') {
        var ds = dayState(s.day);
        if (ds.seen.indexOf(w.id) === -1) { ds.seen.push(w.id); save(); }
      }
      addMiles(ok ? (item.kind === 'new' ? 10 : 5) : 2, true);
      if (ok) s.known++; else {
        s.unknown++;
        if (s.unknownIds.indexOf(w.id) === -1) s.unknownIds.push(w.id);
        if (!s.requeued[w.id]) { s.requeued[w.id] = 1; s.queue.push({ id: w.id, kind: 'review' }); }
      }
      s.pos++;
      s.flipped = false;
      renderLesson();
    }
    keyHandler = function (e) {
      if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') return;
      var k = e.key.toLowerCase();
      if (!s.flipped && (k === ' ' || k === 'enter') && (!e.target || e.target.tagName !== 'BUTTON')) { e.preventDefault(); flip(); }
      else if (s.flipped && k === '1') answer(false);
      else if (s.flipped && k === '2') answer(true);
      else if (k === 'l') speak(w.english, 0.9);
    };
  }

  function finishLesson() {
    var s = session;
    var n = s.day;
    var ds = dayState(n);
    var finishedDay = false;
    if (s.mode === 'lesson') {
      if (isReviewDay(n)) ds.lesson = true;
      else if (dayWordIds(n).every(function (id) { return ds.seen.indexOf(id) !== -1; })) ds.lesson = true;
      save();
      finishedDay = checkDayDone(n);
      if (finishedDay) addMiles(100, true);
    }
    var title = s.mode === 'lesson' ? 'Таңғы сабақ аяқталды!' : 'Қайталау аяқталды!';
    setView(
      topbar(s.mode === 'lesson' ? 'Таңғы сабақ' : 'Қайталау') +
      '<section class="card break-card">' +
        '<div class="big" aria-hidden="true">' + (finishedDay ? '🛬' : '☀️') + '</div>' +
        '<h2>' + title + '</h2>' +
        '<p>Білемін: <b>' + s.known + '</b> · Білмеймін: <b>' + s.unknown + '</b></p>' +
        (s.miles ? '<span class="miles-earned">✈ +' + fmtNum(s.miles) + ' миль</span>' : '') +
        (s.mode === 'lesson' && !ds.test ? '<p>Кешке тест тапсыруды ұмытпа!</p>' : '') +
        (finishedDay ? '<p><b>' + n + '-күн толық аяқталды!</b></p>' : '') +
      '</section>' +
      '<div class="stack mt">' +
        (s.mode === 'lesson' && !ds.test ? '<button type="button" class="btn btn-primary" data-act="test">🌙 Тестті қазір бастау</button>' : '') +
        (s.unknownIds.length ? '<button type="button" class="btn btn-soft" data-act="again">🔁 Білмеген сөздерді қайталау (' + s.unknownIds.length + ')</button>' : '') +
        '<button type="button" class="btn" data-act="home">Басты бетке</button>' +
      '</div>'
    );
    bindCommon();
    if (finishedDay) confetti();
    var t = $('[data-act="test"]'); if (t) t.addEventListener('click', function () { startTest(n === TOTAL_DAYS ? 'final' : 'day'); });
    var a = $('[data-act="again"]'); if (a) a.addEventListener('click', function () { startLesson('list', s.unknownIds.slice()); });
  }

  // ---------------------------------------------------------------------------
  // TEST
  // ---------------------------------------------------------------------------
  var Q_TYPES = ['en_kz', 'kz_en', 'pic_en', 'en_pic', 'listen', 'reading', 'type', 'gap'];
  var Q_PROMPT = {
    en_kz: 'Қазақша аудармасын таңда',
    kz_en: 'Ағылшынша баламасын таңда',
    pic_en: 'Суретке сәйкес сөзді таңда',
    en_pic: 'Сөзге сәйкес суретті таңда',
    listen: 'Тыңда да, естіген сөзді таңда',
    reading: 'Дұрыс оқылуын таңда',
    type: 'Ағылшынша жаз',
    gap: 'Бос орынға сәйкес сөзді таңда'
  };

  function pickDistractors(w, keyFn, count) {
    var key = keyFn(w);
    var used = {}; used[key] = 1;
    // never offer another word that has the same Kazakh meaning / same answer
    var samePos = shuffle(WORDS.filter(function (x) { return x.part_of_speech === w.part_of_speech; }));
    var any = shuffle(WORDS);
    var out = [];
    [samePos, any].forEach(function (pool) {
      for (var i = 0; i < pool.length && out.length < count; i++) {
        var x = pool[i];
        if (x.id === w.id || x.kazakh === w.kazakh || normEn(x.english) === normEn(w.english)) continue;
        var k = keyFn(x);
        if (used[k]) continue;
        used[k] = 1;
        out.push(x);
      }
    });
    return out;
  }

  function typeApplicable(type, w) {
    if (type === 'gap') return !!w._span;
    if (type === 'listen') return !!synth;
    return true;
  }

  function makeQuestion(w, type) {
    var q = { id: w.id, type: type };
    var keyFn = {
      en_kz: function (x) { return x.kazakh; },
      kz_en: function (x) { return normEn(x.english); },
      pic_en: function (x) { return x.image_emoji; },
      en_pic: function (x) { return x.image_emoji; },
      listen: function (x) { return normEn(x.english); },
      reading: function (x) { return x.reading_kz; },
      gap: function (x) { return normEn(x.english); }
    }[type];
    if (keyFn) {
      var extra = pickDistractors(w, keyFn, 3);
      q.options = shuffle([w].concat(extra.slice(0, 3))).map(function (x) { return x.id; });
    }
    return q;
  }

  function buildQuestions(ids) {
    var types = [];
    var qs = ids.map(function (id) {
      var w = BY_ID[id];
      if (!types.length) types = shuffle(Q_TYPES);
      var idx = 0;
      while (idx < types.length && !typeApplicable(types[idx], w)) idx++;
      var type = idx < types.length ? types.splice(idx, 1)[0] : 'en_kz';
      return makeQuestion(w, type);
    });
    return shuffle(qs);
  }

  function startTest(mode, ids) {
    var n = S.current;
    var list;
    if (mode === 'final') {
      list = shuffle(WORDS.map(function (w) { return w.id; })).slice(0, FINAL_TEST);
    } else if (mode === 'list') {
      list = ids.slice();
    } else if (isReviewDay(n)) {
      list = weakFirst(dayWordIds(n)).slice(0, REVIEW_DAY_TEST);
    } else {
      var todayIds = dayWordIds(n);
      var set = {};
      todayIds.forEach(function (id) { set[id] = 1; });
      var t = today();
      var old = Object.keys(S.words).filter(function (id) { return BY_ID[id] && !set[id] && BY_ID[id]._day < n; });
      old.sort(function (a, b) {
        var da = isDue(a, t) ? 1 : 0, db = isDue(b, t) ? 1 : 0;
        return db - da || weakness(b) - weakness(a);
      });
      var oldPick = shuffle(old.slice(0, OLD_IN_TEST * 2)).slice(0, OLD_IN_TEST);
      list = todayIds.concat(oldPick);
    }
    if (!list.length) { dialog('Тест үшін сөз жоқ.'); return; }
    session = {
      screen: 'test', mode: mode, day: n,
      questions: buildQuestions(list), pos: 0, answered: false,
      correct: 0, mistakes: [], graded: {}
    };
    go('test');
  }

  function renderTest() {
    var s = session;
    if (s.pos >= s.questions.length) { finishTest(); return; }
    var q = s.questions[s.pos];
    var w = BY_ID[q.id];
    var title = s.mode === 'final' ? 'Қорытынды тест' : (s.mode === 'list' ? 'Жаттығу тесті' : 'Кешкі тест');
    var main = '';
    switch (q.type) {
      case 'en_kz':
      case 'reading':
        main = '<div class="q-main"><div class="word" lang="en">' + esc(w.english) + '</div>' +
          (q.type === 'en_kz' ? '<div class="pron"><span class="reading">' + readingHtml(w.reading_kz) + '</span></div>' : '') + '</div>';
        break;
      case 'kz_en':
      case 'type':
        main = '<div class="q-main"><div class="kz">' + esc(w.kazakh) + '</div></div>';
        break;
      case 'pic_en':
        main = '<div class="q-main"><div class="emoji" role="img" aria-label="Сурет">' + esc(w.image_emoji) + '</div></div>';
        break;
      case 'en_pic':
        main = '<div class="q-main"><div class="word" lang="en">' + esc(w.english) + '</div></div>';
        break;
      case 'listen':
        main = '<div class="q-main"><div class="audio-row">' +
          '<button type="button" class="btn btn-primary" data-act="play">🔊 Тыңдау</button>' +
          '<button type="button" class="btn" data-act="play-slow">🐢 Баяу</button></div></div>';
        break;
      case 'gap':
        main = '<div class="q-main"><p class="q-sentence" lang="en">' + gapSentence(w) + '</p>' +
          '<p class="example-kz">' + esc(w.example_kz) + '</p></div>';
        break;
    }

    var body;
    if (q.type === 'type') {
      body = '<form class="mt" data-form="type" autocomplete="off">' +
        '<label for="type-in" class="visually-hidden">Ағылшынша сөзді жаз</label>' +
        '<input id="type-in" class="text-input" type="text" lang="en" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Ағылшынша…" enterkeyhint="done">' +
        '<div class="row mt-s"><button type="button" class="btn btn-ghost" data-act="skip">Білмеймін</button>' +
        '<button type="submit" class="btn btn-primary">Тексеру</button></div></form>';
    } else {
      var pics = q.type === 'en_pic';
      body = '<div class="options' + (pics ? ' pics' : '') + '" role="group" aria-label="Жауап нұсқалары">' +
        q.options.map(function (oid, i) {
          var o = BY_ID[oid];
          var label;
          if (pics) label = '<span class="key" aria-hidden="true">' + (i + 1) + '</span><span role="img" aria-label="' + esc(o.english) + '">' + esc(o.image_emoji) + '</span>';
          else if (q.type === 'en_kz') label = '<span class="key" aria-hidden="true">' + (i + 1) + '</span><span>' + esc(o.kazakh) + '</span>';
          else if (q.type === 'reading') label = '<span class="key" aria-hidden="true">' + (i + 1) + '</span><span class="reading">' + readingHtml(o.reading_kz) + '</span>';
          else label = '<span class="key" aria-hidden="true">' + (i + 1) + '</span><span lang="en">' + esc(o.english) + '</span>';
          return '<button type="button" class="opt" data-opt="' + esc(oid) + '">' + label + '</button>';
        }).join('') + '</div>';
    }

    setView(
      topbar(title) +
      tripHeader((s.pos + 1) + ' / ' + s.questions.length + ' · Дұрыс: ' + s.correct, s.pos, s.questions.length) +
      '<section class="card q-card mt">' +
        '<p class="q-prompt">' + Q_PROMPT[q.type] + '</p>' + main + body +
        '<div id="fb" aria-live="polite"></div>' +
      '</section>',
      q.type === 'type' ? '#type-in' : (q.type === 'listen' ? '[data-act="play"]' : '.q-prompt')
    );
    bindCommon();

    if (q.type === 'listen') {
      $('[data-act="play"]').addEventListener('click', function () { speak(w.english, 0.9); });
      $('[data-act="play-slow"]').addEventListener('click', function () { speak(w.english, 0.6); });
      setTimeout(function () { speak(w.english, 0.9); }, 250);
    }

    $all('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () { choose(b.getAttribute('data-opt')); });
    });
    var form = $('[data-form="type"]');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (s.answered) { next(); return; }
        var val = $('#type-in').value;
        if (!normEn(val)) { $('#type-in').focus(); return; }
        settle(typedOk(val, w), val);
      });
      $('[data-act="skip"]').addEventListener('click', function () { if (!s.answered) settle(false, ''); });
    }

    function choose(oid) {
      if (s.answered) return;
      settle(oid === w.id, oid);
    }

    function settle(ok, chosen) {
      s.answered = true;
      S.stats.answered++;
      addMiles(ok ? 10 : 1, !ok);
      if (ok) { S.stats.correct++; s.correct++; }
      else if (!s.mistakes.some(function (m) { return m === w.id; })) s.mistakes.push(w.id);
      // one Leitner update per word per test; a wrong answer always wins
      if (!ok) grade(w.id, false);
      else if (!s.graded[w.id]) grade(w.id, true);
      s.graded[w.id] = 1;

      $all('[data-opt]').forEach(function (b) {
        var id = b.getAttribute('data-opt');
        b.disabled = true;
        if (id === w.id) b.classList.add('correct');
        else if (id === chosen) b.classList.add('wrong');
      });
      var input = $('#type-in');
      if (input) input.readOnly = true;
      var submit = form ? $('[type="submit"]', form) : null;
      if (submit) submit.textContent = 'Келесі →';
      var skip = $('[data-act="skip"]'); if (skip) skip.remove();

      var fb = $('#fb');
      fb.innerHTML = '<div class="feedback ' + (ok ? 'ok' : 'bad') + '">' +
        (ok ? '✅ Дұрыс!' : '❌ Қате.' + (q.type === 'type' && chosen ? ' Сен жаздың: «' + esc(chosen) + '»' : '')) +
        '<div class="info"><b lang="en">' + esc(w.english) + '</b> <span class="reading" style="color:var(--reading)">' + readingHtml(w.reading_kz) + '</span> — ' + esc(w.kazakh) + '</div>' +
        '</div>' +
        '<div class="row mt"><button type="button" class="btn" data-act="hear" aria-label="Сөзді тыңдау">🔊</button>' +
        (form ? '' : '<button type="button" class="btn btn-primary" data-act="next" style="flex:3">Келесі →</button>') + '</div>';
      $('[data-act="hear"]').addEventListener('click', function () { speak(w.english, 0.9); });
      var nb = $('[data-act="next"]');
      if (nb) { nb.addEventListener('click', next); nb.focus(); }
      else if (submit) submit.focus();
      announce(ok ? 'Дұрыс' : 'Қате. Дұрыс жауап: ' + w.english + ' — ' + w.kazakh);
      if (!ok) speak(w.english, 0.9);
      save();
    }

    function next() { s.pos++; s.answered = false; renderTest(); }

    keyHandler = function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (!s.answered && /^[1-4]$/.test(e.key) && q.options) {
        var oid = q.options[+e.key - 1];
        if (oid) choose(oid);
      } else if (s.answered && e.key === 'Enter' && (!e.target || e.target.tagName !== 'BUTTON')) {
        e.preventDefault(); next();
      } else if (q.type === 'listen' && e.key.toLowerCase() === 'l') speak(w.english, 0.9);
    };
  }

  function typedOk(val, w) {
    var v = normEn(val);
    var answers = WORDS.filter(function (x) { return x.kazakh === w.kazakh; }).map(function (x) { return normEn(stripDots(x.english)); });
    return answers.some(function (a) {
      if (v === a) return true;
      var allowed = a.replace(/\s/g, '').length >= 4 ? 1 : 0;
      return levenshtein(v, a) <= allowed;
    });
  }

  function finishTest() {
    var s = session;
    var total = s.questions.length;
    var pct = total ? Math.round((s.correct / total) * 100) : 0;
    var finishedDay = false;
    if (s.mode === 'day' || s.mode === 'final') {
      var ds = dayState(s.day);
      ds.test = true;
      ds.score = ds.score == null ? pct : Math.max(ds.score, pct);
      save();
      finishedDay = checkDayDone(s.day);
      if (finishedDay) addMiles(100, true);
    }
    markActivity();
    save();
    session = { screen: 'result', from: s, pct: pct, finishedDay: finishedDay, miles: s.miles || 0 };
    go('result');
  }

  function renderResult() {
    var r = session, s = r.from;
    var n = s.day;
    var ds = dayState(n);
    var msg = r.pct >= 90 ? 'Керемет нәтиже! 🌟' : r.pct >= 70 ? 'Жақсы! Қателерді қайталап ал. 💪' : 'Қателерді қайталап, тағы байқап көр. 🔁';
    var mistakes = s.mistakes.map(function (id) {
      var w = BY_ID[id];
      return '<li><span class="en" lang="en">' + esc(w.english) + '</span><span class="kz">' + esc(w.kazakh) + '</span></li>';
    }).join('');
    setView(
      topbar('Нәтиже') +
      '<div class="card center">' +
        '<div class="score" aria-label="Нәтиже ' + r.pct + ' пайыз">' + r.pct + '%</div>' +
        '<p class="mt-s">' + s.correct + ' / ' + s.questions.length + ' дұрыс</p>' +
        (r.miles ? '<span class="miles-earned">✈ +' + fmtNum(r.miles) + ' миль</span>' : '') +
        '<p class="mt-s">' + msg + '</p>' +
        (r.finishedDay ? '<p class="mt"><b>🎉 ' + n + '-күн толық аяқталды!</b>' + (n < TOTAL_DAYS ? ' ' + (n + 1) + '-күн ашылды.' : ' 30 күндік бағдарлама аяқталды!') + '</p>' : '') +
        (s.mode === 'day' && !ds.lesson ? '<p class="mt muted small">Күнді аяқтау үшін таңғы сабақты да өт.</p>' : '') +
      '</div>' +
      (s.mistakes.length
        ? '<button type="button" class="btn btn-primary btn-block mt" data-act="redo">🔁 Қателерді қайталау (' + s.mistakes.length + ')</button>' +
          '<h2 class="section">Қателер</h2><div class="card"><ul class="list">' + mistakes + '</ul></div>'
        : '<p class="center mt">Бірде-бір қате жоқ! 👏</p>') +
      (n === TOTAL_DAYS && s.mode === 'final' ? '<button type="button" class="btn btn-soft btn-block mt" data-act="interview">🎙️ Сұхбат жаттығуына өту</button>' : '') +
      '<button type="button" class="btn btn-block mt" data-act="home">Басты бетке</button>'
    );
    bindCommon();
    if (r.finishedDay) confetti();
    var redo = $('[data-act="redo"]');
    if (redo) redo.addEventListener('click', function () { startLesson('list', s.mistakes.slice()); });
    var iv = $('[data-act="interview"]');
    if (iv) iv.addEventListener('click', startInterview);
  }

  // ---------------------------------------------------------------------------
  // INTERVIEW
  // ---------------------------------------------------------------------------
  function startInterview() {
    session = { screen: 'interview', list: shuffle(INTERVIEW).slice(0, INTERVIEW_LEN), pos: 0, shown: false, done: false };
    go('interview');
  }

  function renderInterview() {
    var s = session;
    if (s.pos >= s.list.length) {
      setView(
        topbar('Сұхбат жаттығуы') +
        '<section class="card break-card"><div class="big" aria-hidden="true">🎙️</div><h2>Жарайсың!</h2>' +
        '<p>' + s.list.length + ' сұраққа жауап бердің. Күн сайын қайталасаң, сұхбатта сенімді боласың.</p>' +
        (s.miles ? '<span class="miles-earned">✈ +' + fmtNum(s.miles) + ' миль</span>' : '') + '</section>' +
        '<div class="stack mt"><button type="button" class="btn btn-primary" data-act="again">Тағы 10 сұрақ</button>' +
        '<button type="button" class="btn" data-act="home">Басты бетке</button></div>'
      );
      bindCommon();
      $('[data-act="again"]').addEventListener('click', startInterview);
      markActivity(); save();
      return;
    }
    var it = s.list[s.pos];
    setView(
      topbar('Сұхбат жаттығуы') +
      tripHeader('Сұрақ ' + (s.pos + 1) + ' / ' + s.list.length, s.pos, s.list.length) +
      '<section class="card mt">' +
        '<p class="q-prompt">Консул сұрайды:</p>' +
        '<p class="question-en" lang="en">' + esc(it.q) + '</p>' +
        '<p class="question-kz">' + esc(it.qk) + '</p>' +
        '<div class="audio-row"><button type="button" class="btn" data-act="replay">🔊 Қайта тыңдау</button>' +
        '<button type="button" class="btn" data-act="replay-slow">🐢 Баяу</button></div>' +
        (SR ? '<div class="stack mt">' + micBlockFree() + '</div>' : '<p class="note mt">Бұл браузерде сөйлеуді тану жоқ — жауапты дауыстап айт немесе ойша айт.</p>') +
        (s.shown
          ? '<div class="answer" aria-live="polite"><p class="small muted">Үлгі жауап:</p><p class="en" lang="en">' + esc(it.a) + '</p><p class="kz">' + esc(it.ak) + '</p>' +
            '<div class="audio-row"><button type="button" class="btn" data-act="ans">🔊 Тыңдау</button><button type="button" class="btn" data-act="ans-slow">🐢 Баяу</button></div>' +
            (SR ? '<div class="stack mt-s">' + micBlock('mic-ans') + '</div>' : '') + '</div>'
          : '') +
      '</section>' +
      (s.shown
        ? '<button type="button" class="btn btn-primary btn-block mt" data-act="next">Келесі сұрақ →</button>'
        : '<button type="button" class="btn btn-primary btn-block mt" data-act="show">Үлгі жауап</button>'),
      s.shown ? '.answer .en' : '.question-en'
    );
    bindCommon();
    function on(act, fn) { var b = $('[data-act="' + act + '"]'); if (b) b.addEventListener('click', fn); }
    on('replay', function () { speak(it.q, 0.9); });
    on('replay-slow', function () { speak(it.q, 0.6); });
    on('ans', function () { speak(it.a, 0.9); });
    on('ans-slow', function () { speak(it.a, 0.6); });
    on('show', function () { s.shown = true; renderInterview(); speak(it.a, 0.9); });
    on('next', function () { s.pos++; s.shown = false; addMiles(15); renderInterview(); });
    bindFreeMic();
    bindMic('mic-ans', function () { return it.a; });
    if (!s.shown) setTimeout(function () { speak(it.q, 0.9); }, 300);
    keyHandler = function (e) {
      if (e.key === 'Enter' && (!e.target || e.target.tagName !== 'BUTTON')) {
        e.preventDefault();
        if (!s.shown) { s.shown = true; renderInterview(); speak(it.a, 0.9); }
        else { s.pos++; s.shown = false; addMiles(15); renderInterview(); }
      }
    };
  }

  // Free answer: just show what was recognized.
  function micBlockFree() {
    return '<button type="button" class="btn btn-soft" data-mic-free aria-describedby="mic-free-out">🎤 Жауап беру</button>' +
      '<div id="mic-free-out" class="speech-out" hidden aria-live="polite"></div>';
  }
  function bindFreeMic() {
    var btn = $('[data-mic-free]');
    if (!btn) return;
    var out = $('#mic-free-out');
    btn.addEventListener('click', function () {
      if (activeRec) { stopRecognition(); return; }
      btn.classList.add('mic-on');
      btn.textContent = '🎙️ Тыңдап тұрмын…';
      out.hidden = false;
      out.className = 'speech-out';
      out.textContent = 'Ағылшынша жауап бер…';
      recognize().then(function (alts) {
        out.innerHTML = alts.length
          ? '<div class="small muted">Сен айттың:</div><div lang="en"><b>' + esc(alts[0]) + '</b></div><div class="small muted mt-s">Енді үлгі жауаппен салыстыр.</div>'
          : 'Ештеңе естілмеді. Қайта байқап көр.';
      }).catch(function (err) {
        out.className = 'speech-out bad';
        out.textContent = (err === 'not-allowed' || err === 'service-not-allowed')
          ? 'Микрофонға рұқсат берілмеді. Браузер баптауларынан рұқсат бер.'
          : 'Сөйлеуді тану сәтсіз аяқталды. Қайта байқап көр.';
      }).then(function () {
        btn.classList.remove('mic-on');
        btn.textContent = '🎤 Жауап беру';
      });
    });
  }

  // ---------------------------------------------------------------------------
  // SPEAKING PRACTICE (word → sentence for today's words)
  // ---------------------------------------------------------------------------
  function startSpeak() {
    var n = S.current;
    var ids = isReviewDay(n) ? weakFirst(dayWordIds(n)).slice(0, 25) : dayWordIds(n);
    var items = [];
    ids.forEach(function (id) {
      items.push({ id: id, kind: 'word' });
      items.push({ id: id, kind: 'sentence' });
    });
    session = { screen: 'speak', items: items, pos: 0 };
    go('speak');
  }

  function renderSpeak() {
    var s = session;
    if (s.pos >= s.items.length) {
      setView(topbar('Айтылу жаттығуы') +
        '<section class="card break-card"><div class="big" aria-hidden="true">🗣️</div><h2>Жарайсың!</h2><p>Барлық сөз бен сөйлемді айтып шықтың.</p></section>' +
        '<button type="button" class="btn btn-block mt" data-act="home">Басты бетке</button>');
      bindCommon();
      markActivity(); save();
      return;
    }
    var it = s.items[s.pos];
    var w = BY_ID[it.id];
    var target = it.kind === 'word' ? w.english : w.example;
    setView(
      topbar('Айтылу жаттығуы') +
      tripHeader((s.pos + 1) + ' / ' + s.items.length + ' · ' + (it.kind === 'word' ? 'Сөз' : 'Сөйлем'), s.pos, s.items.length) +
      '<section class="card flash mt">' +
        (it.kind === 'word'
          ? picHtml(w) + '<div class="word" lang="en">' + esc(w.english) + '</div>' +
            '<div class="pron"><span class="ipa" lang="en">' + esc(w.ipa) + '</span><span class="reading">' + readingHtml(w.reading_kz) + '</span></div>' +
            '<p class="example-kz">' + esc(w.kazakh) + '</p>'
          : '<p class="q-sentence" lang="en">' + highlightExample(w) + '</p><p class="example-kz">' + esc(w.example_kz) + '</p>') +
      '</section>' +
      '<div class="grid2 mt"><button type="button" class="btn" data-act="say">🔊 Тыңдау</button><button type="button" class="btn" data-act="slow">🐢 Баяу</button></div>' +
      (SR ? '<div class="stack mt-s">' + micBlock('mic-speak') + '</div>'
          : '<p class="note mt">Бұл браузер сөйлеуді тануды қолдамайды, сондықтан 🎤 батырмасы жасырылды. Тыңдап, дауыстап қайтала. Chrome (Android) немесе Safari (iPhone) браузерінде тексеру жұмыс істейді.</p>') +
      '<div class="row mt"><button type="button" class="btn" data-act="prev"' + (s.pos ? '' : ' disabled') + '>← Артқа</button>' +
      '<button type="button" class="btn btn-primary" data-act="next">Келесі →</button></div>',
      'h1'
    );
    bindCommon();
    if (it.kind === 'word') wirePic(w);
    bindMic('mic-speak', function () { return target; });
    function on(act, fn) { var b = $('[data-act="' + act + '"]'); if (b) b.addEventListener('click', fn); }
    on('say', function () { speak(target, 0.9); });
    on('slow', function () { speak(target, 0.6); });
    on('next', function () { s.pos++; markActivity(); renderSpeak(); });
    on('prev', function () { if (s.pos) { s.pos--; renderSpeak(); } });
  }

  // ---------------------------------------------------------------------------
  // PROGRESS
  // ---------------------------------------------------------------------------
  function renderProgress() {
    var counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    Object.keys(S.words).forEach(function (id) { if (BY_ID[id]) counts[S.words[id].box] = (counts[S.words[id].box] || 0) + 1; });
    var started = Object.keys(S.words).filter(function (id) { return BY_ID[id]; }).length;
    var learned = counts[6];
    var acc = S.stats.answered ? Math.round((S.stats.correct / S.stats.answered) * 100) : 0;
    var minutes = Math.round((S.stats.seconds || 0) / 60);
    var maxCount = Math.max(1, counts[1], counts[2], counts[3], counts[4], counts[5], counts[6]);

    var boxes = [1, 2, 3, 4, 5, 6].map(function (b) {
      return '<div class="box-row"><span>' + BOX_LABELS[b] + '</span>' +
        '<span class="bar" aria-hidden="true"><span style="width:' + Math.round((counts[b] / maxCount) * 100) + '%"></span></span>' +
        '<span class="n">' + counts[b] + '</span></div>';
    }).join('');

    var cal = '';
    for (var d = 1; d <= TOTAL_DAYS; d++) {
      var ds = S.days[d];
      var cls = (ds && ds.done ? 'done' : '') + (d === S.current ? ' today' : '');
      var lbl = d + '-күн' + (ds && ds.done ? ', аяқталды' : '') + (d === S.current ? ', ағымдағы күн' : '') + (d > S.unlocked ? ', жабық' : '');
      cal += d <= S.unlocked
        ? '<button type="button" class="' + cls + '" data-day="' + d + '" aria-label="' + lbl + '"' + (d === S.current ? ' aria-current="date"' : '') + '>' + d + '</button>'
        : '<span class="' + cls + '" aria-label="' + lbl + '">' + d + '</span>';
    }

    var hard = Object.keys(S.words).filter(function (id) { return BY_ID[id] && S.words[id].wrong > 0; })
      .sort(function (a, b) { return S.words[b].wrong - S.words[a].wrong || S.words[a].box - S.words[b].box; })
      .slice(0, 20);
    var hardHtml = hard.length
      ? '<div class="card"><ul class="list">' + hard.map(function (id) {
          var w = BY_ID[id];
          return '<li><span><span class="en" lang="en">' + esc(w.english) + '</span> <span class="small muted">×' + S.words[id].wrong + '</span></span><span class="kz">' + esc(w.kazakh) + '</span></li>';
        }).join('') + '</ul></div>' +
        '<div class="row mt"><button type="button" class="btn btn-soft" data-act="hard-cards">🃏 Карточкалар</button>' +
        '<button type="button" class="btn btn-primary" data-act="hard-test">📝 Тест</button></div>'
      : '<p class="muted">Әзірге қиын сөздер жоқ. Тест тапсырған сайын осында жиі қателескен сөздер шығады.</p>';

    var mc = milesClass(S.miles || 0);
    var toNext = mc.next ? mc.next.min - (S.miles || 0) : 0;
    var classPct = mc.next ? Math.round(((S.miles || 0) - mc.cur.min) / (mc.next.min - mc.cur.min) * 100) : 100;
    setView(
      topbar('Прогресс') +
      '<section class="card class-card">' +
        '<span class="label">Ұшу милі · ' + fmtNum(S.miles || 0) + '</span>' +
        '<div class="class-name">' + esc(mc.cur.name) + '</div>' +
        '<div class="daybar" aria-hidden="true"><span style="width:' + classPct + '%"></span></div>' +
        '<p>' + (mc.next ? '«' + esc(mc.next.name) + '» класына дейін ' + fmtNum(toNext) + ' миль қалды.' : 'Ең жоғары класс! 🥂') +
        ' Миль жаңа сөз, дұрыс жауап және сұхбат жаттығуы үшін беріледі.</p>' +
      '</section>' +
      '<div class="stats mt">' +
        '<div class="card stat"><div class="v">🔥 ' + streak() + '</div><div class="l">күн қатарынан</div></div>' +
        '<div class="card stat"><div class="v">' + learned + '</div><div class="l">үйренілген сөз / ' + WORDS.length + '</div></div>' +
        '<div class="card stat"><div class="v">' + acc + '%</div><div class="l">тест дәлдігі</div></div>' +
        '<div class="card stat"><div class="v">' + minutes + '</div><div class="l">минут оқыдың</div></div>' +
      '</div>' +
      '<h2 class="section">Қораптар бойынша (басталған: ' + started + ')</h2>' +
      '<div class="card boxes">' + boxes + '</div>' +
      '<p class="small muted mt-s">1-қорап — бүгін, 2 — 1 күннен кейін, 3 — 3 күннен, 4 — 7 күннен, 5 — 14 күннен кейін қайталанады.</p>' +
      '<h2 class="section">Паспорт мөрлері · 30 күн</h2>' +
      '<div class="card"><div class="cal">' + cal + '</div>' +
        '<div class="legend"><span><i style="background:var(--ok-soft);border:2px solid var(--ok)"></i>аяқталды</span><span><i style="border:2px dashed var(--accent)"></i>ағымдағы күн</span><span><i style="background:var(--surface-2);border:2px solid var(--line)"></i>жабық</span></div>' +
        '<p class="small muted mt-s">Ашық күнді басып, соған ауысуға болады.</p></div>' +
      '<h2 class="section">Қиын сөздер</h2>' + hardHtml +
      '<h2 class="section">Баптаулар</h2>' +
      '<div class="card">' +
        '<label class="toggle"><span>Нақты фото жүктеу (интернет болса)</span><input type="checkbox" role="switch" data-set="photos"' + (S.settings.photos ? ' checked' : '') + '></label>' +
        '<label class="toggle"><span>Оқылуын жасыру</span><input type="checkbox" role="switch" data-set="hideReading"' + (S.settings.hideReading ? ' checked' : '') + '></label>' +
        (SR ? '' : '<p class="note mt-s">Бұл браузер сөйлеуді тануды (🎤) қолдамайды, сондықтан айтуды тексеру жасырылды.</p>') +
        (synth ? '' : '<p class="note mt-s">Бұл браузерде дыбыстау (🔊) жоқ.</p>') +
      '</div>' +
      '<button type="button" class="btn btn-block btn-danger mt" data-act="reset">Прогресті тазалау</button>'
    );
    bindCommon();
    $all('[data-day]').forEach(function (b) {
      b.addEventListener('click', function () { S.current = +b.getAttribute('data-day'); save(); go('home'); });
    });
    $all('[data-set]').forEach(function (inp) {
      inp.addEventListener('change', function () { S.settings[inp.getAttribute('data-set')] = inp.checked; save(); });
    });
    var hc = $('[data-act="hard-cards"]'); if (hc) hc.addEventListener('click', function () { startLesson('list', hard); });
    var ht = $('[data-act="hard-test"]'); if (ht) ht.addEventListener('click', function () { startTest('list', hard); });
    $('[data-act="reset"]').addEventListener('click', function () {
      dialog('Барлық прогресс өшіріледі: сөздер, тест нәтижелері, күндер. Сенімдісің бе?', 'Иә, тазалау', 'Болдырмау').then(function (yes) {
        if (!yes) return;
        lsDel(STATE_KEY);
        S = freshState();
        save();
        go('home');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function boot() {
    loadState();
    loadWords().then(function (json) {
      indexData(json);
      if (!DAY[S.current]) S.current = 1;
      save();
      route();
    }).catch(function () {
      app.innerHTML = '<div class="card center"><h1 style="font-size:22px">Сөздер жүктелмеді</h1>' +
        '<p class="mt">Алғаш ашқанда интернет керек. Қосылып, бетті жаңарт.</p>' +
        '<button type="button" class="btn btn-primary mt" data-act="reload">Қайта жүктеу</button></div>';
      var rl = $('[data-act="reload"]'); if (rl) rl.addEventListener('click', function () { location.reload(); });
    });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        var hadController = !!navigator.serviceWorker.controller;
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache unavailable */ });
        // When a new version takes over, reload once so the phone shows it right away.
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (!hadController || window.__w30reloaded) return;
          window.__w30reloaded = true;
          if (!session) location.reload();
        });
      });
    }
  }

  // test hooks (used only by automated checks)
  window.__w30 = { findWordSpan: findWordSpan, normEn: normEn, typedOk: function (v, id) { return typedOk(v, BY_ID[id]); }, compareSpeech: compareSpeech, words: function () { return WORDS; }, state: function () { return S; } };

  boot();
})();
