/* Diwaniya on the TV: fallback for old smart-TV browsers (ES5, no modules, no build step).
   The modern TV page sets window.__dtTvReady as soon as it runs. If it has not run after six
   seconds (a browser too old for the build), this script draws a plain scoreboard instead:
   the room code, the live totals in big numbers and the season's top five, read from the same
   public tv_state(code) door every 10 seconds. It never signs in and never writes text as HTML. */
(function () {
  'use strict';
  var WAIT = 6000;
  var POLL = 10000;

  function meta(name) {
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? m.getAttribute('content') || '' : '';
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.appendChild(document.createTextNode(String(text)));
    return e;
  }
  function clean(raw) {
    return String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  }
  function valid(code) {
    return /^[ACDEFHJKLMNPRTUVWXY3479]{6}$/.test(code);
  }
  function load(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (e) {
      return '';
    }
  }
  function save(key, value) {
    try {
      if (value) window.localStorage.setItem(key, value);
      else window.localStorage.removeItem(key);
    } catch (e) {}
  }

  var ar = load('dt.tv.lang') !== 'en';
  var T = ar
    ? { title: 'شاشة الديوانية', code: 'رمز الغرفة', show: 'اعرض', unknown: 'لم نجد هذا الرمز.', ended: 'انتهت هذه الشاشة. اطلب رمزاً جديداً.', limit: 'محاولات كثيرة. انتظر عشر دقائق.', offline: 'تعذّر الاتصال، نحاول من جديد…', team: 'الفريق ', round: 'الجولة ', season: 'جدول الموسم', none: 'لا لعبة تُسجَّل الآن', old: 'متصفح هذا التلفزيون قديم، فهذه نسخة مبسّطة. لأفضل عرض: لابتوب على HDMI.' }
    : { title: 'Diwaniya screen', code: 'Room code', show: 'Show', unknown: "We couldn't find that code.", ended: 'This screen has ended. Ask for a new code.', limit: 'Too many tries. Wait ten minutes.', offline: "Can't reach the server, trying again…", team: 'Team ', round: 'Round ', season: 'Season table', none: 'No game being scored right now', old: "This TV's browser is old, so this is a simple version. For the full board: a laptop on HDMI." };

  var root;
  var timer = null;
  var code = '';

  function reset() {
    while (root.firstChild) root.removeChild(root.firstChild);
  }

  function askCode(note) {
    if (timer) window.clearTimeout(timer);
    reset();
    var box = el('div', 'tvl');
    box.appendChild(el('h1', '', T.title));
    box.appendChild(el('p', '', T.old));
    var form = el('form', '');
    var label = el('label', '', T.code + ' ');
    var input = el('input', '');
    input.setAttribute('maxlength', '7');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('dir', 'ltr');
    label.appendChild(input);
    form.appendChild(label);
    form.appendChild(el('button', '', T.show));
    if (note) form.appendChild(el('p', '', note));
    form.onsubmit = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      var c = clean(input.value);
      if (valid(c)) {
        code = c;
        poll();
      }
      return false;
    };
    box.appendChild(form);
    root.appendChild(box);
    try {
      input.focus();
    } catch (e) {}
  }

  function show(state) {
    reset();
    var box = el('div', 'tvl');
    box.appendChild(el('h1', '', state.diwaniya ? state.diwaniya.name : ''));
    var live = state.live || [];
    if (!live.length) box.appendChild(el('p', '', T.none));
    for (var i = 0; i < live.length && i < 2; i++) {
      var g = live[i];
      box.appendChild(el('p', '', (g.table ? g.table + ' · ' : '') + T.round + g.rounds));
      var row = el('div', 'tvl-row');
      for (var k = 0; k < g.totals.length; k++) {
        var cell = el('div', 'tvl-cell');
        cell.appendChild(el('div', '', T.team + (k + 1)));
        cell.appendChild(el('div', 'tvl-score', g.totals[k]));
        var names = [];
        for (var p = 0; p < g.players.length; p++) if (g.players[p].team === k + 1) names.push(g.players[p].name);
        cell.appendChild(el('div', '', names.join(' · ')));
        row.appendChild(cell);
      }
      box.appendChild(row);
    }
    var season = state.season || [];
    if (season.length) {
      box.appendChild(el('h2', '', T.season));
      var list = el('ol', '');
      for (var s = 0; s < season.length && s < 5; s++) list.appendChild(el('li', '', season[s].name + ' — ' + season[s].wins + '/' + season[s].played));
      box.appendChild(list);
    }
    root.appendChild(box);
  }

  function poll() {
    if (timer) window.clearTimeout(timer);
    var url = meta('dt-supabase-url');
    var key = meta('dt-supabase-key');
    if (!url || !key || !valid(code)) return askCode();
    var xhr = new XMLHttpRequest();
    xhr.open('POST', url + '/rest/v1/rpc/tv_state', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('apikey', key);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var next = POLL;
      if (xhr.status === 200) {
        var data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {}
        if (data && data.status === 'live') {
          save('dt.tv.code', code);
          show(data);
        } else {
          save('dt.tv.code', '');
          return askCode(data && data.status === 'ended' ? T.ended : T.unknown);
        }
      } else if (xhr.responseText.indexOf('54000') >= 0) {
        return askCode(T.limit);
      } else {
        next = POLL * 2;
      }
      timer = window.setTimeout(poll, next);
    };
    xhr.send(JSON.stringify({ p_code: code }));
  }

  window.setTimeout(function () {
    if (window.__dtTvReady) return;
    root = document.getElementById('tv-legacy');
    if (!root) return;
    code = clean((window.location.hash || '').replace('#', '')) || load('dt.tv.code');
    if (valid(code)) poll();
    else askCode();
  }, WAIT);
})();
