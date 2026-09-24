/* 출산가방 체크리스트 - vanilla JS, localStorage only */
(function () {
  'use strict';

  var STORAGE_KEY = 'birth-bag-checklist';
  var UI_KEY = 'birth-bag-checklist:ui';
  var DATA_VERSION = 1;
  var UNDO_MS = 8000;
  var ICON_PRESETS = ['🧳', '🛏️', '👶🏻', '🤱🏻', '🍼', '🧸', '🏥', '🎒', '🧴', '👕', '📄', '✨'];
  var ICON_MAX = 16; // UTF-16 code units; enough for one multi-codepoint emoji
  var NOTE_MAX = 5000;
  var HIGHLIGHT_MAX = 2000;
  var PICK_MAX = 8000;
  var PICK_KEYS = ['gpt', 'claude'];
  var DATE_LABEL_MAX = 30, DATE_MEMO_MAX = 500, DATE_TIME_MAX = 30;
  var NAME_MAX = 30, NAME_MEMO_MAX = 500, HANJA_CHARS_MAX = 20, HANJA_MEANING_MAX = 120;
  var MEMO_MAX = 5000;
  var SUPPORT_STATUS = ['todo', 'applied', 'received', 'na'];
  var SUPPORT_STATUS_LABEL = { todo: '확인 전', applied: '신청함', received: '받음', na: '해당 없음' };
  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; });
    return [];
  }
  function pickLabel(key) { return key === 'gpt' ? 'GPT' : 'Claude'; }
  function cleanPickText(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, PICK_MAX);
  }
  function emptyPicks() { return { gpt: '', claude: '' }; }
  function normalizePicks(raw) {
    var picks = emptyPicks();
    if (raw && typeof raw === 'object') {
      PICK_KEYS.forEach(function (k) { if (typeof raw[k] === 'string') picks[k] = cleanPickText(raw[k]); });
    }
    return picks;
  }

  // One line per point; leading bullet characters are stripped so pasted lists render cleanly.
  function cleanHighlights(text) {
    return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n')
      .map(function (l) { return l.trim().replace(/^[-*\u2022\u00b7]\s*/, ''); })
      .filter(function (l) { return l; })
      .join('\n').slice(0, HIGHLIGHT_MAX);
  }

  function defaultIconFor(name) {
    for (var i = 0; i < DEFAULT_TEMPLATE.length; i++) {
      if (DEFAULT_TEMPLATE[i].name === name) return DEFAULT_TEMPLATE[i].icon;
    }
    return '';
  }

  // Emoji saved before skin tones were applied -> same emoji with the light skin tone
  var ICON_TONE_UPGRADES = { '👶': '👶🏻', '🤱': '🤱🏻' };

  function cleanIcon(value) {
    return String(value == null ? '' : value).replace(/\s+/g, '').slice(0, ICON_MAX);
  }

  var DEFAULT_TEMPLATE = [
    { name: '출산가방', icon: '🧳', items: ['산모 수첩', '신분증', '손목 보호대', '가디건', '수유 브라 또는 나시', '수유 패드', '산모 패드', '산모 팬티', '입는 생리대', '생리대 오버나이트 또는 대형', '슬리퍼', '굽은 빨대', '텀블러 또는 종이컵', '비데 물티슈', '충전기', '수건', '물티슈', '세면도구', '양치도구', '머리끈 또는 머리띠', '보호자 의류'] },
    { name: '조리원가방', icon: '🛏️', items: ['발목 보호대', '돌돌이 양말', '임산부 레깅스', '압박 스타킹', '유축기', '유축기 깔때기', '초유 저장팩', '유두 보호 크림', '튼살 크림', '철분제 및 기타 영양제', '노트북', '태블릿', '무형광 세탁망', '각티슈', '기초 화장품', '네임펜', '메모지', '가위', '여분 지퍼백', '손톱깎이', '멀티탭', '보호자 침구'] },
    { name: '아기 용품', icon: '👶🏻', items: ['젖병', '젖꼭지', '젖병 세정 도구', '아기 손수건', '아기 배냇저고리', '속싸개', '겉싸개', '손싸개', '발싸개', '아기 모자', '아기 양말', '기저귀 발진 크림', '체온계', '바구니 카시트', '아기 세탁세제', '아기 물티슈', '아기 면봉', '아기 보습 제품', '아기 기저귀'] }
  ];

  /* ---------- utilities ---------- */
  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  function parseQty(value) {
    // returns { ok, value } - value is null (empty) or integer >= 1
    var s = String(value == null ? '' : value).trim();
    if (s === '') return { ok: true, value: null };
    if (!/^\d+$/.test(s)) return { ok: false, value: null };
    var n = parseInt(s, 10);
    if (!isFinite(n) || n < 1) return { ok: false, value: null };
    return { ok: true, value: n };
  }

  // 금액: 숫자만 남겨 정수(원)로. 빈 값은 null. '5,000', '5000원', '5천원', '1.5만원' 허용
  var PRICE_MAX = 999999999;
  function parsePrice(value) {
    var t = String(value == null ? '' : value).trim().replace(/원$/, '').trim();
    if (t === '') return { ok: true, value: null };
    var k = t.match(/^(\d+(?:\.\d+)?)\s*(만|천)$/);
    var n;
    if (k) n = Math.round(parseFloat(k[1]) * (k[2] === '만' ? 10000 : 1000));
    else {
      var digits = t.replace(/[,\s]/g, '');
      if (!/^\d+$/.test(digits)) return { ok: false, value: null };
      n = parseInt(digits, 10);
    }
    if (!isFinite(n) || n < 0 || n > PRICE_MAX) return { ok: false, value: null };
    return { ok: true, value: n };
  }
  function formatNumber(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function formatWon(n) { return n === null || n === undefined ? '' : formatNumber(n) + '원'; }
  // 입력 중 쉼표 자동 삽입 (커서는 끝으로)
  function formatPriceInput(el) {
    var digits = el.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
    el.value = digits ? formatNumber(digits) : '';
  }

  function todayStamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function timeStamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- data model ---------- */
  // 기본 상태는 분류 3개만 만들고 준비물은 비워 둔다(직접 하나씩 추가). DEFAULT_TEMPLATE의 이름 목록은
  // 예전 버전이 채워 둔 '손대지 않은 예시 준비물'을 알아보고 한 번 비우는 데만 쓴다.
  var TEMPLATE_NAMES = {};
  DEFAULT_TEMPLATE.forEach(function (cat) { cat.items.forEach(function (n) { TEMPLATE_NAMES[n] = true; }); });
  function createDefaultState() {
    var categories = [];
    var items = [];
    DEFAULT_TEMPLATE.forEach(function (cat) {
      categories.push({ id: uid(), name: cat.name, icon: cat.icon });
    });
    return { version: DATA_VERSION, categories: categories, items: items, notes: [], highlights: '', picks: emptyPicks(), dates: [], names: [], dueDate: '', memo: '', memos: [], supports: [] };
  }

  // Validates and normalises an unknown object into app state. Returns { ok, data, error }.
  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '파일 형식이 올바르지 않습니다.' };
    if (typeof raw.version !== 'number' || raw.version < 1) return { ok: false, error: '버전 정보가 없거나 올바르지 않습니다.' };
    if (raw.version > DATA_VERSION) return { ok: false, error: '이 앱보다 새로운 버전(' + raw.version + ')의 파일입니다.' };
    if (!Array.isArray(raw.categories) || !Array.isArray(raw.items)) return { ok: false, error: '분류 또는 준비물 목록이 없습니다.' };

    var seen = {};
    var categories = [];
    var migrated = false;
    for (var i = 0; i < raw.categories.length; i++) {
      var c = raw.categories[i];
      if (!c || typeof c !== 'object') return { ok: false, error: (i + 1) + '번째 분류가 올바르지 않습니다.' };
      var cid = typeof c.id === 'string' ? c.id.trim() : '';
      var cname = typeof c.name === 'string' ? c.name.trim() : '';
      if (!cid) return { ok: false, error: (i + 1) + '번째 분류에 ID가 없습니다.' };
      if (!cname) return { ok: false, error: (i + 1) + '번째 분류 이름이 비어 있습니다.' };
      if (seen[cid]) return { ok: false, error: '분류 ID가 중복되었습니다: ' + cid };
      seen[cid] = true;
      // icon is optional; data saved before icons existed gets the template icon for default names
      var icon = '';
      if (c.icon === undefined) { icon = defaultIconFor(cname); if (icon) migrated = true; }
      else if (typeof c.icon === 'string') {
        icon = cleanIcon(c.icon);
        if (ICON_TONE_UPGRADES[icon]) { icon = ICON_TONE_UPGRADES[icon]; migrated = true; }
      }
      categories.push({ id: cid, name: cname.slice(0, 40), icon: icon });
    }

    var items = [];
    var seenItem = {};
    for (var j = 0; j < raw.items.length; j++) {
      var it = raw.items[j];
      if (!it || typeof it !== 'object') return { ok: false, error: (j + 1) + '번째 준비물이 올바르지 않습니다.' };
      var iid = typeof it.id === 'string' ? it.id.trim() : '';
      var iname = typeof it.name === 'string' ? it.name.trim() : '';
      if (!iid) return { ok: false, error: (j + 1) + '번째 준비물에 ID가 없습니다.' };
      if (!iname) return { ok: false, error: (j + 1) + '번째 준비물 이름이 비어 있습니다.' };
      if (seenItem[iid]) return { ok: false, error: '준비물 ID가 중복되었습니다: ' + iid };
      if (typeof it.categoryId !== 'string' || !seen[it.categoryId]) return { ok: false, error: '"' + iname + '" 항목이 존재하지 않는 분류를 가리킵니다.' };
      seenItem[iid] = true;
      var price = null;
      if (it.price !== null && it.price !== undefined && it.price !== '') {
        var pp = parsePrice(it.price);
        if (!pp.ok) return { ok: false, error: '"' + iname + '" 항목의 금액이 올바르지 않습니다.' };
        price = pp.value;
      }
      // (구버전 백업의 qty/unit는 무시한다: 수량 칸이 금액 칸으로 바뀜)
      items.push({
        id: iid,
        categoryId: it.categoryId,
        name: iname.slice(0, 60),
        price: price,
        memo: typeof it.memo === 'string' ? it.memo.trim().slice(0, 200) : '',
        done: it.done === true,
        excluded: it.excluded === true
      });
    }
    // notes are optional (added after v1 launch); missing or malformed list => empty
    var notes = [];
    if (raw.notes !== undefined) {
      if (!Array.isArray(raw.notes)) return { ok: false, error: '진료 메모 목록이 올바르지 않습니다.' };
      var seenNote = {};
      for (var k = 0; k < raw.notes.length; k++) {
        var nt = raw.notes[k];
        if (!nt || typeof nt !== 'object') return { ok: false, error: (k + 1) + '번째 진료 메모가 올바르지 않습니다.' };
        var nid = typeof nt.id === 'string' ? nt.id.trim() : '';
        if (!nid) return { ok: false, error: (k + 1) + '번째 진료 메모에 ID가 없습니다.' };
        if (seenNote[nid]) return { ok: false, error: '진료 메모 ID가 중복되었습니다: ' + nid };
        seenNote[nid] = true;
        var ndate = typeof nt.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nt.date) ? nt.date : '';
        var ntitle = typeof nt.title === 'string' ? nt.title.trim().slice(0, 60) : '';
        var nbody = typeof nt.body === 'string' ? nt.body.replace(/\r\n?/g, '\n').trim().slice(0, NOTE_MAX) : '';
        if (!ntitle && !nbody) return { ok: false, error: (k + 1) + '번째 진료 메모가 비어 있습니다.' };
        notes.push({ id: nid, date: ndate, title: ntitle, body: nbody });
      }
    }
    var highlights = typeof raw.highlights === 'string' ? cleanHighlights(raw.highlights) : '';
    var picks = normalizePicks(raw.picks);

    // 택일 후보 (structured)
    var dates = [];
    var seenDate = {};
    if (raw.dates !== undefined) {
      if (!Array.isArray(raw.dates)) return { ok: false, error: '택일 후보 목록이 올바르지 않습니다.' };
      for (var di = 0; di < raw.dates.length; di++) {
        var dc = raw.dates[di];
        if (!dc || typeof dc !== 'object') return { ok: false, error: (di + 1) + '번째 택일 후보가 올바르지 않습니다.' };
        var did = typeof dc.id === 'string' ? dc.id.trim() : '';
        if (!did) return { ok: false, error: (di + 1) + '번째 택일 후보에 ID가 없습니다.' };
        if (seenDate[did]) return { ok: false, error: '택일 후보 ID가 중복되었습니다: ' + did };
        var ddate = typeof dc.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dc.date) ? dc.date : '';
        var dtime = typeof dc.time === 'string' ? dc.time.trim().slice(0, DATE_TIME_MAX) : '';
        var dlabel = typeof dc.label === 'string' ? dc.label.trim().slice(0, DATE_LABEL_MAX) : '';
        var dmemo = typeof dc.memo === 'string' ? dc.memo.replace(/\r\n?/g, '\n').trim().slice(0, DATE_MEMO_MAX) : '';
        if (!ddate && !dlabel && !dmemo && !dtime) return { ok: false, error: (di + 1) + '번째 택일 후보가 비어 있습니다.' };
        seenDate[did] = true;
        dates.push({ id: did, date: ddate, time: dtime, label: dlabel, memo: dmemo });
      }
    }

    // 이름 후보 (한자 풀이 + 택일 연결)
    var names = [];
    var seenName = {};
    if (raw.names !== undefined) {
      if (!Array.isArray(raw.names)) return { ok: false, error: '이름 후보 목록이 올바르지 않습니다.' };
      for (var ni = 0; ni < raw.names.length; ni++) {
        var nc = raw.names[ni];
        if (!nc || typeof nc !== 'object') return { ok: false, error: (ni + 1) + '번째 이름 후보가 올바르지 않습니다.' };
        var nid2 = typeof nc.id === 'string' ? nc.id.trim() : '';
        var nname = typeof nc.name === 'string' ? nc.name.trim().slice(0, NAME_MAX) : '';
        if (!nid2) return { ok: false, error: (ni + 1) + '번째 이름 후보에 ID가 없습니다.' };
        if (!nname) return { ok: false, error: (ni + 1) + '번째 이름 후보의 이름이 비어 있습니다.' };
        if (seenName[nid2]) return { ok: false, error: '이름 후보 ID가 중복되었습니다: ' + nid2 };
        seenName[nid2] = true;
        var hanja = [];
        asArray(nc.hanja).forEach(function (h) {
          if (!h || typeof h !== 'object') return;
          var chars = typeof h.chars === 'string' ? h.chars.trim().slice(0, HANJA_CHARS_MAX) : '';
          var meaning = typeof h.meaning === 'string' ? h.meaning.trim().slice(0, HANJA_MEANING_MAX) : '';
          if (!chars && !meaning) return;
          hanja.push({ id: (typeof h.id === 'string' && h.id) ? h.id : uid(), chars: chars, meaning: meaning });
        });
        var dateIds = asArray(nc.dateIds).filter(function (x) { return typeof x === 'string' && seenDate[x]; });
        names.push({
          id: nid2, name: nname, favorite: nc.favorite === true,
          memo: typeof nc.memo === 'string' ? nc.memo.replace(/\r\n?/g, '\n').trim().slice(0, NAME_MEMO_MAX) : '',
          hanja: hanja, dateIds: dateIds
        });
      }
    }

    var dueDate = typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : '';
    var memo = typeof raw.memo === 'string' ? raw.memo.replace(/\r\n?/g, '\n').slice(0, MEMO_MAX) : '';
    var memos = [];
    var seenMemo = {};
    if (raw.memos !== undefined) {
      if (!Array.isArray(raw.memos)) return { ok: false, error: '메모 목록이 올바르지 않습니다.' };
      for (var mi = 0; mi < raw.memos.length; mi++) {
        var mm = raw.memos[mi];
        if (!mm || typeof mm !== 'object') return { ok: false, error: (mi + 1) + '번째 메모가 올바르지 않습니다.' };
        var mid = typeof mm.id === 'string' ? mm.id.trim() : '';
        var mtext = typeof mm.text === 'string' ? mm.text.replace(/\r\n?/g, '\n').slice(0, MEMO_MAX) : '';
        if (!mid || !mtext.trim() || seenMemo[mid]) continue; // empty or duplicate memos are dropped
        seenMemo[mid] = true;
        memos.push({ id: mid, text: mtext, updated: typeof mm.updated === 'number' ? mm.updated : 0 });
      }
    }
    if (memo.trim() && !seenMemo['legacy-memo']) { memos.push({ id: 'legacy-memo', text: memo, updated: 0 }); }
    memo = '';

    // 정부 지원 체크리스트
    var supports = [];
    var seenSup = {};
    if (raw.supports !== undefined) {
      if (!Array.isArray(raw.supports)) return { ok: false, error: '정부 지원 목록이 올바르지 않습니다.' };
      for (var si = 0; si < raw.supports.length; si++) {
        var sp = raw.supports[si];
        if (!sp || typeof sp !== 'object') return { ok: false, error: (si + 1) + '번째 지원 항목이 올바르지 않습니다.' };
        var spid = typeof sp.id === 'string' ? sp.id.trim() : '';
        var sptitle = typeof sp.title === 'string' ? sp.title.trim().slice(0, 60) : '';
        if (!spid) return { ok: false, error: (si + 1) + '번째 지원 항목에 ID가 없습니다.' };
        if (!sptitle) return { ok: false, error: (si + 1) + '번째 지원 항목의 제목이 비어 있습니다.' };
        if (seenSup[spid]) return { ok: false, error: '지원 항목 ID가 중복되었습니다: ' + spid };
        seenSup[spid] = true;
        var str = function (v, n) { return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').trim().slice(0, n) : ''; };
        var spstatus = SUPPORT_STATUS.indexOf(sp.status) !== -1 ? sp.status : 'todo';
        supports.push({ id: spid, title: sptitle, target: str(sp.target, 300), benefit: str(sp.benefit, 500), howto: str(sp.howto, 500),
          deadline: (typeof sp.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.deadline)) ? sp.deadline : '',
          link: str(sp.link, 300), status: spstatus, memo: str(sp.memo, 500) });
      }
    }
    return { ok: true, migrated: migrated, data: { version: DATA_VERSION, categories: categories, items: items, notes: notes, highlights: highlights, picks: picks, dates: dates, names: names, dueDate: dueDate, memo: memo, memos: memos, supports: supports } };
  }

  /* ---------- storage ---------- */
  var storageOk = true;
  var warningKind = null; // 'save' | 'load'

  function loadState() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageOk = false;
      showStorageWarning('브라우저 저장소에 접근할 수 없습니다. 변경 사항이 저장되지 않으니 JSON 내보내기로 백업하세요.', 'save');
      return { state: createDefaultState(), fresh: true };
    }
    if (raw === null) return { state: createDefaultState(), fresh: true };
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      backupCorrupt(raw);
      showStorageWarning('저장된 기록을 읽을 수 없어 기본 목록으로 시작합니다. 손상된 기록은 브라우저 저장소에 별도 보관했습니다.', 'load');
      return { state: createDefaultState(), fresh: true };
    }
    var result = normalizeState(parsed);
    if (!result.ok) {
      backupCorrupt(raw);
      showStorageWarning('저장된 기록이 손상되어 기본 목록으로 시작합니다. (' + result.error + ')', 'load');
      return { state: createDefaultState(), fresh: true };
    }
    if (result.migrated) {
      // persist filled-in defaults quietly; a failure here is reported on the next normal save
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result.data)); } catch (e) { /* ignore */ }
    }
    return { state: result.data, fresh: false };
  }

  function backupCorrupt(raw) {
    try { window.localStorage.setItem(STORAGE_KEY + ':corrupt-' + Date.now(), raw); } catch (e) { /* ignore */ }
  }

  var changeListeners = [];
  var applyingRemote = false;
  var touched = false; // true once the user changed anything on this device

  function saveState(opts) {
    opts = opts || {};
    var statusEl = $('#save-status');
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
      statusEl.textContent = (opts.remote ? '동기화됨 ' : '자동 저장됨 ') + timeStamp();
      statusEl.classList.remove('is-error');
      hideStorageWarning();
      if (!opts.silent && !applyingRemote) {
        if (!opts.initial) touched = true;
        changeListeners.forEach(function (cb) { try { cb(state); } catch (e) { /* listener errors must not break saving */ } });
      }
      return true;
    } catch (e) {
      storageOk = false;
      statusEl.textContent = '저장 실패';
      statusEl.classList.add('is-error');
      showStorageWarning('변경 사항을 저장하지 못했습니다. 저장 공간이 부족하거나 브라우저가 저장을 막고 있을 수 있습니다. JSON 내보내기로 백업하세요.', 'save');
      return false;
    }
  }

  function showStorageWarning(msg, kind) {
    var el = $('#storage-warning');
    warningKind = kind;
    el.textContent = msg;
    el.hidden = false;
  }
  function hideStorageWarning() {
    var el = $('#storage-warning');
    if (!el.hidden && warningKind === 'save') { el.hidden = true; el.textContent = ''; warningKind = null; }
  }

  /* ---------- state ---------- */
  var state;
  var ui = { filter: 'all', editMode: false, pendingUndo: null, undoTimer: null, collapsed: {}, noteForm: null, qtyEdit: null, highlightEdit: false, activeCategory: null, highlightsCollapsed: false, itemEdit: null, view: 'checklist', picksEdit: null, picksActive: 'gpt', dateEdit: null, nameEdit: null, search: '', searchOpen: false, stripOpen: false, onboardingDismissed: false, deviceName: '', autoName: '', toastRemote: true, lastSeenActivity: 0, activity: [], supportEdit: null, memoFocus: null, seenBase: 0, templateCleared: false, bulkOpen: null, sort: {} };

  // Active tab (narrow screens): falls back to the first category when the saved one is gone.
  function activeCategoryId() {
    if (!state.categories.length) return null;
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === ui.activeCategory) return ui.activeCategory;
    return state.categories[0].id;
  }

  function setActiveCategory(id) {
    ui.activeCategory = id;
    ui.qtyEdit = null;
    ui.itemEdit = null;
    saveUiPrefs();
    render();
  }

  function toggleHighlightsCollapsed() {
    ui.highlightsCollapsed = !ui.highlightsCollapsed;
    saveUiPrefs();
    renderHighlights();
  }

  var uiPrefsFound = false;
  function loadUiPrefs() {
    try {
      var raw = window.localStorage.getItem(UI_KEY);
      if (!raw) return;
      uiPrefsFound = true;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.collapsed && typeof parsed.collapsed === 'object') ui.collapsed = parsed.collapsed;
        if (parsed.sort && typeof parsed.sort === 'object') ui.sort = parsed.sort;
        if (typeof parsed.activeCategory === 'string') ui.activeCategory = parsed.activeCategory;
        ui.highlightsCollapsed = parsed.highlightsCollapsed === true;
        if (['home','checklist','notes','picks','names','settings','supports','memos'].indexOf(parsed.view) !== -1) ui.view = parsed.view;
        ui.onboardingDismissed = parsed.onboardingDismissed === true;
        if (typeof parsed.deviceName === 'string') ui.deviceName = parsed.deviceName.slice(0, 12);
        if (typeof parsed.autoName === 'string') ui.autoName = parsed.autoName.slice(0, 12);
        ui.templateCleared = parsed.templateCleared === true;
        if (parsed.toastRemote === false) ui.toastRemote = false;
        if (typeof parsed.lastSeenActivity === 'number') ui.lastSeenActivity = parsed.lastSeenActivity;
        if (parsed.picksActive === 'gpt' || parsed.picksActive === 'claude') ui.picksActive = parsed.picksActive;
      }
    } catch (e) { /* UI preferences are optional */ }
  }

  function saveUiPrefs() {
    try {
      var keep = {};
      state.categories.forEach(function (c) { if (ui.collapsed[c.id]) keep[c.id] = true; });
      ui.collapsed = keep;
      window.localStorage.setItem(UI_KEY, JSON.stringify({
        collapsed: ui.collapsed,
        sort: ui.sort,
        activeCategory: ui.activeCategory,
        picksActive: ui.picksActive,
        view: ui.view,
        onboardingDismissed: ui.onboardingDismissed,
        deviceName: ui.deviceName,
        autoName: ui.autoName,
        templateCleared: ui.templateCleared,
        toastRemote: ui.toastRemote,
        lastSeenActivity: ui.lastSeenActivity,
        highlightsCollapsed: ui.highlightsCollapsed
      }));
    } catch (e) { /* ignore */ }
  }

  function toggleCollapsed(categoryId) {
    if (ui.collapsed[categoryId]) delete ui.collapsed[categoryId];
    else ui.collapsed[categoryId] = true;
    saveUiPrefs();
    render();
  }

  function itemsOf(categoryId) {
    return state.items.filter(function (it) { return it.categoryId === categoryId; });
  }

  function findItem(id) {
    for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
    return null;
  }

  function findCategory(id) {
    for (var i = 0; i < state.categories.length; i++) if (state.categories[i].id === id) return state.categories[i];
    return null;
  }

  function computeProgress(items) {
    var total = 0, done = 0, excluded = 0, sum = 0, priced = 0;
    items.forEach(function (it) {
      if (it.excluded) { excluded++; return; }
      total++;
      if (it.done) done++;
      if (typeof it.price === 'number') { sum += it.price; priced++; }
    });
    var percent = 0;
    var result_sum = sum;
    if (total > 0) {
      percent = done === total ? 100 : Math.min(99, Math.floor((done / total) * 100));
    }
    return { total: total, done: done, excluded: excluded, percent: percent, sum: result_sum, priced: priced };
  }

  // 화면용: '합계 12,000원' 부분만 굵게
  function progressHtml(p) {
    var base = escapeHtml(progressText(p, true));
    if (p.total > 0 && p.sum > 0) base += ' · <b class="sum">합계 ' + escapeHtml(formatWon(p.sum)) + '</b>';
    return base;
  }
  function progressText(p, noSum) {
    if (p.total === 0) {
      return p.excluded > 0 ? '준비 항목 없음 · 제외 ' + p.excluded + '개' : '준비 항목 없음';
    }
    var t = p.done + '/' + p.total + '개 완료 · ' + p.percent + '%';
    if (p.excluded > 0) t += ' · 제외 ' + p.excluded + '개';
    if (p.sum > 0 && !noSum) t += ' · 합계 ' + formatWon(p.sum);
    return t;
  }

  var SORT_MODES = ['default', 'price-desc', 'price-asc'];
  function sortModeOf(catId) { var m = ui.sort[catId]; return SORT_MODES.indexOf(m) === -1 ? 'default' : m; }
  function setSortMode(catId, mode) {
    if (SORT_MODES.indexOf(mode) === -1) mode = 'default';
    if (mode === 'default') delete ui.sort[catId]; else ui.sort[catId] = mode;
    saveUiPrefs();
  }
  // 금액 정렬: 금액 없는 항목은 항상 맨 아래, 같은 금액은 원래 순서 유지
  function sortItems(list, mode) {
    if (mode !== 'price-desc' && mode !== 'price-asc') return list;
    var dir = mode === 'price-desc' ? -1 : 1;
    return list.map(function (it, i) { return { it: it, i: i }; }).sort(function (a, b) {
      var pa = a.it.price, pb = b.it.price;
      if (pa === null && pb === null) return a.i - b.i;
      if (pa === null) return 1;
      if (pb === null) return -1;
      if (pa !== pb) return (pa - pb) * dir;
      return a.i - b.i;
    }).map(function (x) { return x.it; });
  }

  function matchesFilter(it) {
    switch (ui.filter) {
      case 'todo': return !it.excluded && !it.done;
      case 'done': return !it.excluded && it.done;
      case 'excluded': return it.excluded;
      default: return true;
    }
  }

  function emptyMessage(catItems) {
    if (catItems.length === 0) return '아직 준비물이 없습니다. 위 칸에 이름을 적고 추가를 누르세요. 한 번에 여러 개를 넣으려면 ‘여러 개’를 누르세요.';
    switch (ui.filter) {
      case 'todo': return '미완료 항목이 없습니다. 이 분류는 준비를 마쳤어요.';
      case 'done': return '아직 완료한 항목이 없습니다.';
      case 'excluded': return '제외한 항목이 없습니다.';
      default: return '표시할 항목이 없습니다.';
    }
  }

  /* ---------- rendering ---------- */
  function focusKeyOf(el) {
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.focusKey) return el.dataset.focusKey;
      el = el.parentElement;
    }
    return null;
  }

  function setView(view) {
    if (['home','checklist','notes','picks','names','settings','supports','memos'].indexOf(view) === -1) return;
    if (ui.view === view) return;
    ui.view = view;
    ui.qtyEdit = null;
    ui.itemEdit = null;
    ui.dateEdit = null;
    ui.nameEdit = null;
    ui.supportEdit = null;
    if (view === 'home') { ui.seenBase = ui.lastSeenActivity; markActivitySeen(false); }
    saveUiPrefs();
    render();
    window.scrollTo(0, 0);
  }

  function renderPrimaryTabs() {
    var p = computeProgress(state.items);
    document.body.classList.toggle('is-checklist-view', ui.view === 'checklist');
    var cCount = $('#ptab-checklist-count');
    if (cCount) cCount.textContent = p.total ? p.done + '/' + p.total : '';
    var nCount = $('#ptab-notes-count');
    if (nCount) nCount.textContent = state.notes.length ? String(state.notes.length) : '';
    var pkFilled = PICK_KEYS.filter(function (k) { return state.picks && state.picks[k]; }).length;
    var pkCount = $('#ptab-picks-count');
    if (pkCount) pkCount.textContent = pkFilled ? String(pkFilled) : '';
    var nmCount = $('#ptab-names-count');
    if (nmCount) nmCount.textContent = state.names.length ? String(state.names.length) : '';
    Array.prototype.forEach.call(document.querySelectorAll('.primary-tab'), function (btn) {
      var active = btn.dataset.view === ui.view;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    var vh = $('#view-home');
    if (vh) vh.hidden = ui.view !== 'home';
    var vs = $('#view-settings'); if (vs) vs.hidden = ui.view !== 'settings';
    var vsp = $('#view-supports'); if (vsp) vsp.hidden = ui.view !== 'supports';
    var vmm = $('#view-memos'); if (vmm) vmm.hidden = ui.view !== 'memos';
    var hb = $('#ptab-home-count');
    if (hb) { var un = unreadActivityCount(); hb.textContent = un ? (un > 99 ? '99+' : String(un)) : ''; }
    var vc = $('#view-checklist'), vn = $('#view-notes'), vp = $('#view-picks'), vm = $('#view-names');
    if (vc) vc.hidden = ui.view !== 'checklist';
    if (vn) vn.hidden = ui.view !== 'notes';
    if (vp) vp.hidden = ui.view !== 'picks';
    if (vm) vm.hidden = ui.view !== 'names';
  }

  function updateTabScroll(bar) {
    if (!bar) return;
    var scrollable = bar.scrollWidth > bar.clientWidth + 2;
    bar.classList.toggle('is-scrollable', scrollable);
    if (!scrollable) return;
    var active = bar.querySelector('.is-active');
    if (!active) return;
    var al = active.offsetLeft, ar = al + active.offsetWidth;
    if (al < bar.scrollLeft) bar.scrollLeft = Math.max(0, al - 8);
    else if (ar > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = ar - bar.clientWidth + 8;
  }

  function render() {
    var activeKey = focusKeyOf(document.activeElement);
    renderPrimaryTabs();
    renderOverall();
    renderTabs();
    renderCategories();
    renderNotes();
    renderPicks();
    renderDates();
    renderNames();
    renderHighlights();
    updateTabScroll($('#primary-tabs'));
    updateTabScroll($('#category-tabs'));
    updateTabScroll($('#pick-tabs'));
    renderHome();
    renderHighlightsStrip();
    renderDday();
    renderActivity();
    renderMemo();
    renderSettings();
    renderSupports();
    var searchBox = $('#search-wrap');
    if (searchBox) searchBox.hidden = !ui.searchOpen || ui.editMode || ui.view !== 'checklist';
    var st = $('#search-toggle');
    if (st) { st.setAttribute('aria-pressed', ui.searchOpen ? 'true' : 'false'); st.classList.toggle('is-active', ui.searchOpen || !!ui.search); }
    var fs = $('#filter-select');
    if (fs && fs.value !== ui.filter) fs.value = ui.filter;
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit-toggle]'), function (b) {
      b.setAttribute('aria-pressed', ui.editMode ? 'true' : 'false');
      b.textContent = ui.editMode ? '편집 완료' : (b.dataset.editToggle === 'short' ? '편집' : '편집 모드');
    });
    if (activeKey) {
      var target = document.querySelector('[data-focus-key="' + activeKey + '"]');
      if (target) target.focus({ preventScroll: true });
    }
  }

  function renderOverall() {
    var p = computeProgress(state.items);
    $('#overall-progress-text').innerHTML = progressHtml(p);
    $('#overall-progress-fill').style.width = p.percent + '%';
    $('#overall-progress-bar').setAttribute('aria-valuenow', String(p.percent));
    $('#overall-progress-bar').setAttribute('aria-valuetext', progressText(p));
  }

  function refreshProgress() {
    renderOverall();
    renderTabs();
    state.categories.forEach(function (cat) {
      var card = document.querySelector('.category[data-category-id="' + cat.id + '"]');
      if (!card) return;
      var p = computeProgress(itemsOf(cat.id));
      $('.progress-text', card).textContent = progressText(p, true);
      $('.progress-bar__fill', card).style.width = p.percent + '%';
      $('.progress-bar', card).setAttribute('aria-valuenow', String(p.percent));
      $('.progress-bar', card).setAttribute('aria-valuetext', progressText(p, true));
      var tl = $('.cat-total__label', card), ts = $('.cat-total__sum', card);
      if (tl) tl.textContent = '총 합계 · 금액 입력 ' + p.priced + '/' + p.total + '개' + (p.excluded ? ' (제외 ' + p.excluded + '개 미포함)' : '');
      if (ts) ts.textContent = formatWon(p.sum);
    });
  }

  function searching() { return !ui.editMode && ui.view === 'checklist' && ui.search.trim() !== ''; }

  function renderSearchResults(root, q) {
    var needle = q.trim().toLowerCase();
    var matches = [];
    state.categories.forEach(function (cat) {
      itemsOf(cat.id).forEach(function (it) {
        if (it.name.toLowerCase().indexOf(needle) !== -1 && matchesFilter(it)) matches.push({ it: it, cat: cat });
      });
    });
    var html = '<div class="search-results">';
    html += '<p class="search-results__count">‘' + escapeHtml(q.trim()) + '’ 검색 결과 ' + matches.length + '개</p>';
    if (!matches.length) {
      html += '<p class="items-empty">일치하는 준비물이 없습니다.</p>';
    } else {
      html += '<ul class="items">' + matches.map(function (m) {
        var it = m.it;
        var cls = 'item search-item' + (it.done ? ' is-done' : '') + (it.excluded ? ' is-excluded' : '');
        var meta = [];
        if (it.price !== null) meta.push('금액 ' + formatWon(it.price));
        var h = '<li class="' + cls + '" data-item-id="' + escapeHtml(it.id) + '"><div class="item__row"><label class="item__check">';
        h += '<input type="checkbox" data-action="toggle-done"' + (it.done ? ' checked' : '') + (it.excluded ? ' disabled' : '') + ' aria-label="' + escapeHtml(it.name) + ' 가방에 담기 완료">';
        h += '<span class="item__body"><span class="item__name">' + escapeHtml(it.name) + '</span>';
        h += '<span class="badge badge--cat">' + (m.cat.icon ? escapeHtml(m.cat.icon) + ' ' : '') + escapeHtml(m.cat.name) + '</span>';
        if (it.excluded) h += '<span class="badge badge--excluded">제외</span>';
        else if (it.done) h += '<span class="badge badge--done">완료</span>';
        if (meta.length) h += '<span class="item__meta">' + escapeHtml(meta.join(' · ')) + '</span>';
        if (it.memo) h += '<span class="item__memo">' + escapeHtml(it.memo) + '</span>';
        h += '</span></label></div></li>';
        return h;
      }).join('') + '</ul>';
    }
    html += '</div>';
    root.innerHTML = html;
  }

  function renderCategories() {
    var editBar = $('#edit-bar');
    if (editBar) {
      editBar.hidden = !ui.editMode || !state.categories.length;
      var ccb = $('#clear-category-btn'); var ac = state.categories.length ? findCategory(activeCategoryId()) : null;
      if (ccb) { ccb.textContent = '🗑 ' + (ac ? '‘' + ac.name + '’ 비우기' : '이 분류 비우기'); ccb.disabled = !ac || itemsOf(ac.id).length === 0; }
      var cab = $('#clear-items-btn-2'); if (cab) cab.disabled = state.items.length === 0;
    }
    var root = $('#categories');
    var catTabs = $('#category-tabs');
    if (searching()) {
      if (catTabs) catTabs.hidden = true;
      renderSearchResults(root, ui.search);
      return;
    }
    if (catTabs) catTabs.hidden = false;
    if (state.categories.length === 0) {
      root.innerHTML = '<div class="empty-state"><p>분류가 없습니다.</p><p>분류 탭의 <strong>+</strong> 버튼으로 다시 시작할 수 있어요.</p></div>';
      return;
    }
    root.innerHTML = state.categories.map(renderCategory).join('');
  }

  function renderTabs() {
    var bar = $('#category-tabs');
    if (state.categories.length === 0) { bar.innerHTML = ''; bar.hidden = true; return; }
    bar.hidden = false;
    var active = activeCategoryId();
    bar.innerHTML = state.categories.map(function (cat) {
      var p = computeProgress(itemsOf(cat.id));
      var isActive = cat.id === active;
      var count = p.total ? p.done + '/' + p.total : '0';
      return '<button type="button" role="tab" class="category-tab' + (isActive ? ' is-active' : '') + '" data-action="select-tab" data-category-id="' + escapeHtml(cat.id) + '" data-focus-key="tab:' + escapeHtml(cat.id) + '" aria-selected="' + (isActive ? 'true' : 'false') + '" aria-controls="cat-' + escapeHtml(cat.id) + '" tabindex="' + (isActive ? '0' : '-1') + '">' +
        (cat.icon ? '<span class="category-tab__icon" aria-hidden="true">' + escapeHtml(cat.icon) + '</span>' : '') +
        '<span class="category-tab__name">' + escapeHtml(cat.name) + '</span>' +
        '<span class="category-tab__count">' + escapeHtml(count) + '</span></button>';
    }).join('') + '<button type="button" class="category-tab category-tab--add" data-action="add-category-tab" aria-label="분류 추가">+</button>';
  }

  function renderCategory(cat) {
    var catItems = itemsOf(cat.id);
    var p = computeProgress(catItems);
    var sortMode = ui.editMode ? 'default' : sortModeOf(cat.id);
    var visible = sortItems(catItems.filter(matchesFilter), sortMode);
    var titleId = 'cat-title-' + cat.id;
    var collapsed = !ui.editMode && !!ui.collapsed[cat.id];
    var bodyId = 'cat-body-' + cat.id;
    var isActive = cat.id === activeCategoryId();
    var html = '<section class="category' + (collapsed ? ' is-collapsed' : '') + (isActive ? ' is-active' : '') + '" id="cat-' + escapeHtml(cat.id) + '" data-category-id="' + escapeHtml(cat.id) + '" aria-labelledby="' + titleId + '">';
    html += '<div class="category__head">';
    if (ui.editMode) {
      html += '<label class="visually-hidden" for="cat-icon-' + escapeHtml(cat.id) + '">분류 아이콘</label>';
      html += '<input type="text" class="category__icon-input" id="cat-icon-' + escapeHtml(cat.id) + '" data-action="set-icon" data-focus-key="cat-icon:' + escapeHtml(cat.id) + '" value="' + escapeHtml(cat.icon || '') + '" maxlength="' + ICON_MAX + '" placeholder="아이콘" autocomplete="off">';
      html += '<label class="visually-hidden" for="cat-name-' + escapeHtml(cat.id) + '">분류 이름</label>';
      html += '<input type="text" class="category__title-input" id="cat-name-' + escapeHtml(cat.id) + '" data-action="rename-category" data-focus-key="cat-name:' + escapeHtml(cat.id) + '" value="' + escapeHtml(cat.name) + '" maxlength="40" aria-labelledby="' + titleId + '">';
      html += '<h2 id="' + titleId + '" class="visually-hidden">' + escapeHtml(cat.name) + '</h2>';
      var cidx = state.categories.indexOf(cat);
      html += '<span class="reorder">';
      html += '<button type="button" class="btn btn--small reorder__btn" data-action="cat-up"' + (cidx <= 0 ? ' disabled' : '') + ' aria-label="분류 위로">▲</button>';
      html += '<button type="button" class="btn btn--small reorder__btn" data-action="cat-down"' + (cidx >= state.categories.length - 1 ? ' disabled' : '') + ' aria-label="분류 아래로">▼</button></span>';
      html += '<button type="button" class="btn btn--small btn--danger" data-action="delete-category" data-focus-key="cat-del:' + escapeHtml(cat.id) + '" aria-label="분류 ' + escapeHtml(cat.name) + ' 삭제">삭제</button>';
      html += '</div><div class="icon-presets" role="group" aria-label="' + escapeHtml(cat.name) + ' 아이콘 선택">';
      ICON_PRESETS.forEach(function (ic) {
        html += '<button type="button" class="icon-presets__btn' + (cat.icon === ic ? ' is-active' : '') + '" data-action="pick-icon" data-icon="' + escapeHtml(ic) + '" aria-label="아이콘 ' + escapeHtml(ic) + '" aria-pressed="' + (cat.icon === ic ? 'true' : 'false') + '">' + escapeHtml(ic) + '</button>';
      });
      html += '<button type="button" class="icon-presets__btn icon-presets__btn--none' + (!cat.icon ? ' is-active' : '') + '" data-action="pick-icon" data-icon="" aria-pressed="' + (!cat.icon ? 'true' : 'false') + '">없음</button>';
    } else {
      html += '<h2 id="' + titleId + '" class="category__title">';
      html += '<button type="button" class="category__toggle" data-action="toggle-collapse" data-focus-key="cat-toggle:' + escapeHtml(cat.id) + '" aria-expanded="' + (collapsed ? 'false' : 'true') + '" aria-controls="' + bodyId + '">';
      if (cat.icon) html += '<span class="category__icon" aria-hidden="true">' + escapeHtml(cat.icon) + '</span>';
      html += '<span class="category__name">' + escapeHtml(cat.name) + '</span>';
      html += '<span class="category__chevron" aria-hidden="true"></span>';
      html += '<span class="visually-hidden">' + (collapsed ? ' 펼치기' : ' 접기') + '</span>';
      html += '</button></h2>';
    }
    html += '</div>';

    html += '<div class="category__progress"><p class="progress-text">' + escapeHtml(progressText(p, true)) + '</p>';
    html += '<div class="progress-bar" role="progressbar" aria-label="' + escapeHtml(cat.name) + ' 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.percent + '" aria-valuetext="' + escapeHtml(progressText(p, true)) + '"><div class="progress-bar__fill" style="width:' + p.percent + '%"></div></div></div>';
    // 총 합계(목록 위) + 금액 정렬 칩
    if (catItems.length && !collapsed) {
      html += '<div class="cat-total" aria-live="polite"><span class="cat-total__label">총 합계 · 금액 입력 ' + p.priced + '/' + p.total + '개' + (p.excluded ? ' (제외 ' + p.excluded + '개 미포함)' : '') + '</span><strong class="cat-total__sum">' + escapeHtml(formatWon(p.sum)) + '</strong></div>';
      if (!ui.editMode) {
        html += '<div class="sort-chips" role="group" aria-label="' + escapeHtml(cat.name) + ' 정렬">';
        [['default', '기본순'], ['price-desc', '금액 높은순 ↓'], ['price-asc', '금액 낮은순 ↑']].forEach(function (o) {
          var on = sortMode === o[0];
          html += '<button type="button" class="sort-chip' + (on ? ' is-active' : '') + '" data-action="sort-items" data-sort="' + o[0] + '" data-focus-key="sort:' + escapeHtml(cat.id) + ':' + o[0] + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + o[1] + '</button>';
        });
        html += '</div>';
      }
    }

    html += '<div class="category__body" id="' + bodyId + '"' + (collapsed ? ' hidden' : '') + '>';
    var bulkOpen = ui.bulkOpen === cat.id;
    html += '<form class="inline-form quick-add" data-action="add-item">';
    html += '<label class="visually-hidden" for="new-item-' + escapeHtml(cat.id) + '">' + escapeHtml(cat.name) + '에 추가할 준비물</label>';
    html += '<input type="text" id="new-item-' + escapeHtml(cat.id) + '" data-focus-key="new-item:' + escapeHtml(cat.id) + '" placeholder="준비물 이름 (예: 수유 패드 5,000원)" maxlength="80" autocomplete="off" enterkeyhint="done">';
    html += '<button type="submit" class="btn btn--primary">추가</button>';
    html += '<button type="button" class="btn quick-add__bulk' + (bulkOpen ? ' is-active' : '') + '" data-action="bulk-toggle" data-focus-key="bulk-toggle:' + escapeHtml(cat.id) + '" aria-expanded="' + (bulkOpen ? 'true' : 'false') + '" aria-controls="bulk-' + escapeHtml(cat.id) + '">여러 개</button>';
    html += '</form>';
    html += '<form class="bulk-add" id="bulk-' + escapeHtml(cat.id) + '" data-action="bulk-add"' + (bulkOpen ? '' : ' hidden') + '>';
    html += '<label class="visually-hidden" for="bulk-text-' + escapeHtml(cat.id) + '">한 줄에 하나씩 준비물 입력</label>';
    html += '<textarea id="bulk-text-' + escapeHtml(cat.id) + '" data-focus-key="bulk-text:' + escapeHtml(cat.id) + '" rows="6" placeholder="한 줄에 하나씩 적으세요&#10;수유 패드 5,000원&#10;산모 수첩&#10;물티슈 12000"></textarea>';
    html += '<div class="bulk-add__actions"><span class="bulk-add__hint">이름 뒤에 금액을 적으면 함께 저장됩니다(예: 물티슈 12000, 젖병 1.5만원). 메모장·카톡에서 복사한 목록을 그대로 붙여넣어도 됩니다.</span>';
    html += '<button type="submit" class="btn btn--primary btn--small">모두 추가</button></div>';
    html += '</form>';
    if (visible.length === 0) {
      html += '<p class="items-empty">' + escapeHtml(emptyMessage(catItems)) + '</p>';
    } else {
      if (!ui.editMode) html += '<div class="items-colhead" aria-hidden="true"><span>준비물</span><span>금액</span></div>';
      html += '<ul class="items">' + visible.map(ui.editMode ? renderItemEdit : renderItemView).join('') + '</ul>';
    }

    html += '</div>';
    html += '</section>';
    return html;
  }

  function qtyLabel(it) { return formatWon(it.price); }
  function priceFieldHtml(it, id, focusKey) {
    return '<div class="price-field"><input type="text" id="' + focusKey.replace(':', '-') + '" data-field="price" data-focus-key="' + focusKey + '" value="' + (it.price === null ? '' : formatNumber(it.price)) + '" inputmode="numeric" autocomplete="off" maxlength="11" placeholder="예: 5,000"><span class="price-field__suffix" aria-hidden="true">원</span></div>';
  }

  function renderItemView(it) {
    var id = escapeHtml(it.id);
    var editing = ui.qtyEdit === it.id && !it.excluded;
    var cls = 'item' + (it.done ? ' is-done' : '') + (it.excluded ? ' is-excluded' : '') + (editing ? ' is-qty-editing' : '');
    var html = '<li class="' + cls + '" data-item-id="' + id + '">';
    html += '<div class="item__row">';
    html += '<label class="item__check">';
    html += '<input type="checkbox" data-action="toggle-done" data-focus-key="check:' + id + '"' + (it.done ? ' checked' : '') + (it.excluded ? ' disabled' : '') + ' aria-label="' + escapeHtml(it.name) + ' 가방에 담기 완료">';
    html += '<span class="item__body">';
    html += '<span class="item__name">' + escapeHtml(it.name) + '</span>';
    if (it.excluded) html += '<span class="badge badge--excluded">제외</span>';
    else if (it.done) html += '<span class="badge badge--done">완료</span>';
    if (it.memo) html += '<span class="item__memo">' + escapeHtml(it.memo) + '</span>';
    html += '</span></label>';
    html += '<div class="item__side">';
    if (it.excluded) {
      html += '<button type="button" class="btn btn--small" data-action="toggle-excluded" data-focus-key="excl:' + id + '" aria-label="' + escapeHtml(it.name) + ' 다시 포함">다시 포함</button>';
    } else {
      var label = qtyLabel(it);
      html += '<button type="button" class="item__qty' + (label ? '' : ' item__qty--empty') + '" data-action="edit-qty" data-focus-key="qty-btn:' + id + '" aria-expanded="' + (editing ? 'true' : 'false') + '" aria-label="' + escapeHtml(it.name) + ' 금액 ' + (label ? escapeHtml(label) : '미입력') + ', 누르면 수정">' + (label ? escapeHtml(label) : '<span aria-hidden="true">＋</span>') + '</button>';
    }
    html += '</div></div>';
    if (editing) {
      html += '<div class="item__qty-edit">';
      html += '<div class="item__qty-edit__row">';
      html += '<div class="field"><label for="q-qty-' + id + '">금액</label>' + priceFieldHtml(it, id, 'q-qty:' + id) + '</div>';
      html += '<button type="button" class="btn btn--primary btn--small item__qty-done" data-action="close-qty" data-focus-key="q-done:' + id + '">완료</button>';
      html += '</div>';
      html += '<p class="field-error" data-error hidden></p>';
      html += '</div>';
    }
    html += '</li>';
    return html;
  }

  function renderItemEdit(it) {
    var id = escapeHtml(it.id);
    var badges = (it.excluded ? ' <span class="badge badge--excluded">제외됨</span>' : '') + (it.done && !it.excluded ? ' <span class="badge badge--done">완료</span>' : '');
    if (ui.itemEdit !== it.id) {
      // Compact row: keeps edit mode short on phones; one item expands at a time.
      var c = 'item item--edit-compact' + (it.done ? ' is-done' : '') + (it.excluded ? ' is-excluded' : '');
      var h = '<li class="' + c + '" data-item-id="' + id + '"><div class="item__edit-row">';
      h += '<span class="item__body"><span class="item__name">' + escapeHtml(it.name) + '</span>' + badges;
      if (it.memo) h += '<span class="item__memo">' + escapeHtml(it.memo) + '</span>';
      h += '</span>';
      var siblings = itemsOf(it.categoryId);
      var pos = siblings.map(function (x) { return x.id; }).indexOf(it.id);
      h += '<span class="item__edit-btns">';
      h += '<span class="reorder"><button type="button" class="btn btn--small reorder__btn" data-action="item-up" data-focus-key="iup:' + id + '"' + (pos <= 0 ? ' disabled' : '') + ' aria-label="' + escapeHtml(it.name) + ' 위로">▲</button>';
      h += '<button type="button" class="btn btn--small reorder__btn" data-action="item-down" data-focus-key="idown:' + id + '"' + (pos >= siblings.length - 1 ? ' disabled' : '') + ' aria-label="' + escapeHtml(it.name) + ' 아래로">▼</button></span>';
      h += '<button type="button" class="btn btn--small" data-action="open-item-edit" data-focus-key="iedit:' + id + '" aria-label="' + escapeHtml(it.name) + ' 수정">수정</button>';
      h += '<button type="button" class="btn btn--small btn--danger" data-action="delete-item" data-focus-key="del:' + id + '" aria-label="' + escapeHtml(it.name) + ' 삭제">삭제</button>';
      h += '</span></div></li>';
      return h;
    }
    var cls = 'item item--edit' + (it.done ? ' is-done' : '') + (it.excluded ? ' is-excluded' : '');
    var html = '<li class="' + cls + '" data-item-id="' + id + '">';
    html += '<div class="item__edit-grid">';

    html += '<div class="field"><label for="name-' + id + '">이름' + badges + '</label>';
    html += '<input type="text" id="name-' + id + '" data-field="name" data-focus-key="name:' + id + '" value="' + escapeHtml(it.name) + '" maxlength="60" required></div>';

    html += '<div class="field"><label for="qty-' + id + '">금액</label>' + priceFieldHtml(it, id, 'qty:' + id) + '</div>';

    html += '<div class="field"><label for="memo-' + id + '">메모 (선택)</label>';
    html += '<input type="text" id="memo-' + id + '" data-field="memo" data-focus-key="memo:' + id + '" value="' + escapeHtml(it.memo) + '" maxlength="200" placeholder="예: 출발 직전에 챙기기, 병원 제공, 보호자 담당"></div>';

    html += '<p class="field-error" data-error hidden></p>';

    html += '<div class="item__actions">';
    html += '<div class="field"><label class="visually-hidden" for="move-' + id + '">분류 이동</label>';
    html += '<select id="move-' + id + '" data-action="move-item" data-focus-key="move:' + id + '" aria-label="' + escapeHtml(it.name) + ' 분류 이동">';
    state.categories.forEach(function (c) {
      html += '<option value="' + escapeHtml(c.id) + '"' + (c.id === it.categoryId ? ' selected' : '') + '>' + escapeHtml(c.name) + (c.id === it.categoryId ? ' (현재)' : '') + '</option>';
    });
    html += '</select></div>';
    html += '<button type="button" class="btn btn--small" data-action="toggle-excluded" data-focus-key="excl:' + id + '">' + (it.excluded ? '다시 포함' : '준비 대상에서 제외') + '</button>';
    html += '<button type="button" class="btn btn--small btn--danger" data-action="delete-item" data-focus-key="del:' + id + '" aria-label="' + escapeHtml(it.name) + ' 삭제">삭제</button>';
    html += '<button type="button" class="btn btn--small btn--primary" data-action="close-item-edit" data-focus-key="iclose:' + id + '">완료</button>';
    html += '</div>';

    html += '</div></li>';
    return html;
  }

  /* ---------- 진료 메모 ---------- */
  function sortedNotes() {
    return state.notes.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1; // newest first; '' (no date) last
      return 0;
    });
  }

  function formatNoteDate(d) {
    if (!d) return '날짜 없음';
    var parts = d.split('-');
    return parts[0] + '년 ' + parseInt(parts[1], 10) + '월 ' + parseInt(parts[2], 10) + '일';
  }

  function noteFormHtml(note) {
    var isNew = !note;
    var id = isNew ? 'new' : escapeHtml(note.id);
    var html = '<form class="note-form" data-note-form="' + id + '">';
    html += '<div class="field-row"><div class="field"><label for="note-date-' + id + '">진료 날짜</label>';
    html += '<input type="date" id="note-date-' + id + '" name="date" data-focus-key="note-date:' + id + '" value="' + escapeHtml(isNew ? todayStamp() : note.date) + '"></div>';
    html += '<div class="field"><label for="note-title-' + id + '">제목 (선택)</label>';
    html += '<input type="text" id="note-title-' + id + '" name="title" data-focus-key="note-title:' + id + '" value="' + escapeHtml(isNew ? '' : note.title) + '" maxlength="60" placeholder="예: 32주 정기검진"></div></div>';
    html += '<div class="field"><label for="note-body-' + id + '">내용</label>';
    html += '<textarea id="note-body-' + id + '" name="body" data-focus-key="note-body:' + id + '" rows="6" maxlength="' + NOTE_MAX + '" placeholder="선생님 말씀, 검사 결과, 다음 진료 일정 등을 한 줄씩 적어 두세요.">' + escapeHtml(isNew ? '' : note.body) + '</textarea></div>';
    html += '<p class="field-error" data-error hidden></p>';
    html += '<div class="note-form__actions"><button type="submit" class="btn btn--primary">' + (isNew ? '메모 저장' : '수정 저장') + '</button>';
    html += '<button type="button" class="btn" data-action="cancel-note">취소</button></div>';
    html += '</form>';
    return html;
  }

  function renderNotes() {
    var list = $('#notes-list');
    var notes = sortedNotes();
    var html = '';
    if (ui.noteForm === 'new') html += '<li class="note note--editing">' + noteFormHtml(null) + '</li>';
    if (notes.length === 0 && ui.noteForm !== 'new') {
      html += '<li class="notes-empty">아직 진료 메모가 없습니다. ‘일지 쓰기’를 눌러 첫 기록을 남겨 보세요.</li>';
    }
    notes.forEach(function (n) {
      if (ui.noteForm === n.id) {
        html += '<li class="note note--editing" data-note-id="' + escapeHtml(n.id) + '">' + noteFormHtml(n) + '</li>';
        return;
      }
      html += '<li class="note" data-note-id="' + escapeHtml(n.id) + '">';
      html += '<div class="note__head"><div class="note__meta"><span class="note__date">' + escapeHtml(formatNoteDate(n.date)) + '</span>';
      if (n.title) html += '<span class="note__title">' + escapeHtml(n.title) + '</span>';
      html += '</div><div class="note__actions">';
      html += '<button type="button" class="btn btn--small" data-action="edit-note" data-focus-key="note-edit:' + escapeHtml(n.id) + '" aria-label="' + escapeHtml(formatNoteDate(n.date)) + ' 메모 수정">수정</button>';
      html += '<button type="button" class="btn btn--small btn--danger" data-action="delete-note" data-focus-key="note-del:' + escapeHtml(n.id) + '" aria-label="' + escapeHtml(formatNoteDate(n.date)) + ' 메모 삭제">삭제</button>';
      html += '</div></div>';
      if (n.body) html += '<p class="note__body">' + escapeHtml(n.body) + '</p>';
      html += '</li>';
    });
    list.innerHTML = html;
    $('#notes-count').textContent = notes.length ? notes.length + '개' : '';
    $('#add-note-btn').hidden = ui.noteForm === 'new';
  }

  function readNoteForm(form) {
    var date = form.elements.date.value;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
    var title = form.elements.title.value.trim().slice(0, 60);
    var body = form.elements.body.value.replace(/\r\n?/g, '\n').trim().slice(0, NOTE_MAX);
    return { date: date, title: title, body: body };
  }

  function submitNoteForm(form) {
    var v = readNoteForm(form);
    var err = $('[data-error]', form);
    if (!v.title && !v.body) {
      err.textContent = '내용이나 제목 중 하나는 입력해야 합니다.';
      err.hidden = false;
      form.elements.body.focus();
      return;
    }
    var key = form.dataset.noteForm;
    if (key === 'new') {
      state.notes.push({ id: uid(), date: v.date, title: v.title, body: v.body });
      ui.noteForm = null;
      commit();
      act('note', '일지 ‘' + (v.title || formatNoteDate(v.date)) + '’ 작성');
      showToast('일지를 저장했습니다.');
      var addBtn = $('#add-note-btn');
      if (addBtn) addBtn.focus();
    } else {
      var note = null;
      for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === key) note = state.notes[i];
      if (!note) { ui.noteForm = null; render(); return; }
      note.date = v.date; note.title = v.title; note.body = v.body;
      ui.noteForm = null;
      commit();
      act('note', '일지 ‘' + (v.title || formatNoteDate(v.date)) + '’ 수정');
      showToast('일지를 수정했습니다.');
      var editBtn = document.querySelector('[data-focus-key="note-edit:' + key + '"]');
      if (editBtn) editBtn.focus();
    }
  }

  function deleteNote(id) {
    var idx = -1;
    for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === id) idx = i;
    if (idx < 0) return;
    var note = state.notes[idx];
    if (!window.confirm('‘' + formatNoteDate(note.date) + (note.title ? ' · ' + note.title : '') + '’ 메모를 삭제할까요?')) return;
    state.notes.splice(idx, 1);
    if (ui.noteForm === id) ui.noteForm = null;
    commit();
    act('note', '일지 ‘' + (note.title || formatNoteDate(note.date)) + '’ 삭제');
    showToast('일지를 삭제했습니다.', function () {
      state.notes.splice(Math.min(idx, state.notes.length), 0, note);
      commit();
      showToast('삭제를 취소했습니다.');
    });
  }

  /* ---------- 택일 정보 (GPT / Claude) ---------- */
  function activePickKey() {
    return ui.picksActive === 'claude' ? 'claude' : 'gpt';
  }

  function renderPickTabs() {
    var bar = $('#pick-tabs');
    if (!bar) return;
    var active = activePickKey();
    bar.innerHTML = PICK_KEYS.map(function (key) {
      var filled = !!(state.picks && state.picks[key]);
      var on = key === active;
      return '<button type="button" role="tab" class="category-tab' + (on ? ' is-active' : '') + '" data-action="pick-subtab" data-pick-key="' + key + '" data-focus-key="picktab:' + key + '" aria-selected="' + (on ? 'true' : 'false') + '" aria-controls="pick-' + key + '" tabindex="' + (on ? '0' : '-1') + '">' +
        '<span class="category-tab__name">' + pickLabel(key) + '</span>' +
        (filled ? '<span class="category-tab__count">작성됨</span>' : '') + '</button>';
    }).join('');
  }

  function renderPicks() {
    renderPickTabs();
    var active = activePickKey();
    PICK_KEYS.forEach(function (key) {
      var card = document.querySelector('[data-pick="' + key + '"]');
      if (!card) return;
      card.hidden = key !== active; // only the active pick block is shown
      var body = $('.pick__body', card);
      var editBtn = $('[data-action="edit-pick"]', card);
      var text = (state.picks && state.picks[key]) || '';
      if (ui.picksEdit === key) {
        editBtn.hidden = true;
        body.innerHTML = '<form class="pick-form" data-pick-form="' + key + '">' +
          '<label class="visually-hidden" for="pick-input-' + key + '">' + pickLabel(key) + '이(가) 알려준 택일 정보</label>' +
          '<textarea id="pick-input-' + key + '" rows="12" maxlength="' + PICK_MAX + '" data-focus-key="pick-input:' + key + '" placeholder="' + pickLabel(key) + '에게 받은 택일 정보를 붙여넣으세요.">' + escapeHtml(text) + '</textarea>' +
          '<div class="note-form__actions"><button type="submit" class="btn btn--primary btn--small">저장</button>' +
          '<button type="button" class="btn btn--small" data-action="cancel-pick">취소</button></div></form>';
        return;
      }
      editBtn.hidden = false;
      editBtn.textContent = text ? '수정' : '붙여넣기';
      body.innerHTML = text
        ? '<div class="pick__text">' + escapeHtml(text) + '</div>'
        : '<p class="pick__empty">' + pickLabel(key) + '에게 받은 택일 정보를 여기에 붙여넣으세요.</p>';
    });
  }

  function setActivePick(key) {
    if (PICK_KEYS.indexOf(key) === -1 || key === activePickKey()) return;
    ui.picksActive = key;
    ui.picksEdit = null;
    saveUiPrefs();
    renderPicks();
  }

  function savePick(key, text) {
    if (PICK_KEYS.indexOf(key) === -1) return;
    if (!state.picks) state.picks = emptyPicks();
    state.picks[key] = cleanPickText(text);
    ui.picksEdit = null;
    commit();
    act('pick', pickLabel(key) + ' 택일 메모 ' + (state.picks[key] ? '수정' : '비움'));
    showToast(state.picks[key] ? (pickLabel(key) + ' 택일 정보를 저장했습니다.') : (pickLabel(key) + ' 택일 정보를 비웠습니다.'));
    var eb = document.querySelector('[data-pick="' + key + '"] [data-action="edit-pick"]');
    if (eb) eb.focus();
  }

  /* ---------- 택일 후보 + 작명 노트 (연계) ---------- */
  function findDate(id) { for (var i = 0; i < state.dates.length; i++) if (state.dates[i].id === id) return state.dates[i]; return null; }
  function findName(id) { for (var i = 0; i < state.names.length; i++) if (state.names[i].id === id) return state.names[i]; return null; }

  function dateHeadline(d) {
    var parts = [];
    if (d.date) parts.push(formatNoteDate(d.date));
    if (d.time) parts.push(d.time);
    return parts.join(' ') || '날짜 미정';
  }
  function namesForDate(dateId) { return state.names.filter(function (n) { return n.dateIds.indexOf(dateId) !== -1; }); }

  function dateFormHtml(d) {
    var isNew = !d;
    var id = isNew ? 'new' : escapeHtml(d.id);
    var h = '<form class="date-form" data-date-form="' + id + '">';
    h += '<div class="field-row"><div class="field"><label for="date-d-' + id + '">날짜</label>';
    h += '<input type="date" id="date-d-' + id + '" name="date" data-focus-key="date-d:' + id + '" value="' + escapeHtml(isNew ? '' : d.date) + '"></div>';
    h += '<div class="field"><label for="date-t-' + id + '">시간 (선택)</label>';
    h += '<input type="text" id="date-t-' + id + '" name="time" data-focus-key="date-t:' + id + '" value="' + escapeHtml(isNew ? '' : d.time) + '" maxlength="' + DATE_TIME_MAX + '" placeholder="예: 오전 10시"></div></div>';
    h += '<div class="field"><label for="date-l-' + id + '">라벨 (선택)</label>';
    h += '<input type="text" id="date-l-' + id + '" name="label" data-focus-key="date-l:' + id + '" value="' + escapeHtml(isNew ? '' : d.label) + '" maxlength="' + DATE_LABEL_MAX + '" placeholder="예: 1순위, 철학관 추천"></div>';
    h += '<div class="field"><label for="date-m-' + id + '">메모 (선택)</label>';
    h += '<textarea id="date-m-' + id + '" name="memo" rows="3" maxlength="' + DATE_MEMO_MAX + '" data-focus-key="date-m:' + id + '" placeholder="사주 풀이, 병원 가능 여부 등">' + escapeHtml(isNew ? '' : d.memo) + '</textarea></div>';
    h += '<p class="field-error" data-error hidden></p>';
    h += '<div class="note-form__actions"><button type="submit" class="btn btn--primary btn--small">' + (isNew ? '택일 후보 저장' : '수정 저장') + '</button>';
    h += '<button type="button" class="btn btn--small" data-action="cancel-date">취소</button></div></form>';
    return h;
  }

  function datesSorted() {
    return state.dates.slice().sort(function (a, b) {
      var ad = a.date || '9999-99-99', bd = b.date || '9999-99-99';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return state.dates.indexOf(a) - state.dates.indexOf(b);
    });
  }

  function renderDates() {
    var list = $('#date-list');
    if (!list) return;
    var html = '';
    if (ui.dateEdit === 'new') html += '<li class="datecard datecard--editing">' + dateFormHtml(null) + '</li>';
    if (!state.dates.length && ui.dateEdit !== 'new') {
      html += '<li class="datecard-empty">아직 택일 후보가 없습니다. ‘후보 추가’로 날짜를 등록하면 작명 노트의 이름과 연결할 수 있어요.</li>';
    }
datesSorted().forEach(function (d) {
      if (ui.dateEdit === d.id) { html += '<li class="datecard datecard--editing" data-date-id="' + escapeHtml(d.id) + '">' + dateFormHtml(d) + '</li>'; return; }
      var linked = namesForDate(d.id);
      html += '<li class="datecard" data-date-id="' + escapeHtml(d.id) + '">';
      html += '<div class="datecard__head"><div class="datecard__meta"><span class="datecard__date">' + escapeHtml(dateHeadline(d)) + '</span>';
      if (d.label) html += '<span class="badge badge--label">' + escapeHtml(d.label) + '</span>';
      html += '</div><div class="datecard__actions">';
      html += '<button type="button" class="btn btn--small" data-action="edit-date" data-focus-key="date-edit:' + escapeHtml(d.id) + '">수정</button>';
      html += '<button type="button" class="btn btn--small btn--danger" data-action="delete-date">삭제</button></div></div>';
      if (d.memo) html += '<p class="datecard__memo">' + escapeHtml(d.memo) + '</p>';
      html += '<div class="linkrow"><span class="linkrow__label">연결된 이름</span>';
      if (linked.length) html += linked.map(function (n) { return '<span class="chip">' + escapeHtml(n.name) + (n.favorite ? ' ★' : '') + '</span>'; }).join('');
      else html += '<span class="linkrow__empty">없음 — 작명 노트에서 이름을 이 택일에 연결하세요</span>';
      html += '</div></li>';
    });
    list.innerHTML = html;
    var addBtn = $('#add-date-btn');
    if (addBtn) addBtn.hidden = ui.dateEdit === 'new';
  }

  function readDateForm(form) {
    var date = form.elements.date.value;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
    return {
      date: date,
      time: form.elements.time.value.trim().slice(0, DATE_TIME_MAX),
      label: form.elements.label.value.trim().slice(0, DATE_LABEL_MAX),
      memo: form.elements.memo.value.replace(/\r\n?/g, '\n').trim().slice(0, DATE_MEMO_MAX)
    };
  }

  function submitDateForm(form) {
    var v = readDateForm(form);
    var err = $('[data-error]', form);
    if (!v.date) { err.textContent = '날짜를 선택하세요.'; err.hidden = false; var di = $('input[name="date"]', form); if (di) di.focus(); return; }
    var key = form.dataset.dateForm;
    if (key === 'new') {
      state.dates.push({ id: uid(), date: v.date, time: v.time, label: v.label, memo: v.memo });
      ui.dateEdit = null; commit(); act('date', '택일 후보 ‘' + (v.label || formatNoteDate(v.date)) + '’ 추가'); showToast('택일 후보를 저장했습니다.');
      var ab = $('#add-date-btn'); if (ab) ab.focus();
    } else {
      var d = findDate(key);
      if (!d) { ui.dateEdit = null; render(); return; }
      d.date = v.date; d.time = v.time; d.label = v.label; d.memo = v.memo;
      ui.dateEdit = null; commit(); act('date', '택일 후보 ‘' + (v.label || formatNoteDate(v.date)) + '’ 수정'); showToast('택일 후보를 수정했습니다.');
    }
  }

  function deleteDate(id) {
    var idx = -1; for (var i = 0; i < state.dates.length; i++) if (state.dates[i].id === id) idx = i;
    if (idx < 0) return;
    var d = state.dates[idx];
    var linked = namesForDate(id);
    var msg = '‘' + dateHeadline(d) + (d.label ? ' · ' + d.label : '') + '’ 택일 후보를 삭제할까요?' + (linked.length ? '\n연결된 이름 ' + linked.length + '개에서 이 택일 연결이 해제됩니다.' : '');
    if (!window.confirm(msg)) return;
    var affected = linked.map(function (n) { return n.id; });
    state.dates.splice(idx, 1);
    state.names.forEach(function (n) { n.dateIds = n.dateIds.filter(function (x) { return x !== id; }); });
    if (ui.dateEdit === id) ui.dateEdit = null;
    commit();
    act('date', '택일 후보 ‘' + (d.label || dateHeadline(d)) + '’ 삭제');
    showToast('택일 후보를 삭제했습니다.', function () {
      state.dates.splice(Math.min(idx, state.dates.length), 0, d);
      affected.forEach(function (nid) { var n = findName(nid); if (n && n.dateIds.indexOf(id) === -1) n.dateIds.push(id); });
      commit(); showToast('삭제를 취소했습니다.');
    });
  }

  /* ---- 작명 노트 ---- */
  function namesSorted() {
    return state.names.slice().sort(function (a, b) {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      return state.names.indexOf(a) - state.names.indexOf(b);
    });
  }

  function hanjaRowHtml(h) {
    h = h || { chars: '', meaning: '' };
    return '<div class="hanja-row">' +
      '<input type="text" class="hanja-row__chars" value="' + escapeHtml(h.chars) + '" maxlength="' + HANJA_CHARS_MAX + '" placeholder="한자 (예: 舒俊)" aria-label="한자">' +
      '<input type="text" class="hanja-row__meaning" value="' + escapeHtml(h.meaning) + '" maxlength="' + HANJA_MEANING_MAX + '" placeholder="풀이 (예: 舒 펼 서 · 俊 준걸 준)" aria-label="한자 풀이">' +
      '<button type="button" class="hanja-row__del" data-action="remove-hanja" aria-label="이 한자 후보 삭제">×</button></div>';
  }

  function nameFormHtml(n) {
    var isNew = !n;
    var id = isNew ? 'new' : escapeHtml(n.id);
    var hanja = isNew ? [{ chars: '', meaning: '' }] : (n.hanja.length ? n.hanja : [{ chars: '', meaning: '' }]);
    var h = '<form class="name-form" data-name-form="' + id + '">';
    h += '<div class="field"><label for="name-n-' + id + '">이름 (한글)</label>';
    h += '<input type="text" id="name-n-' + id + '" name="name" data-focus-key="name-n:' + id + '" value="' + escapeHtml(isNew ? '' : n.name) + '" maxlength="' + NAME_MAX + '" placeholder="예: 서준" required></div>';
    h += '<label class="chk"><input type="checkbox" name="favorite"' + (!isNew && n.favorite ? ' checked' : '') + '> 즐겨찾기 (★로 위에 고정)</label>';
    h += '<fieldset class="subfield"><legend>한자 풀이 후보</legend><div class="hanja-rows" data-hanja-rows>';
    h += hanja.map(hanjaRowHtml).join('');
    h += '</div><button type="button" class="btn btn--small" data-action="add-hanja">+ 한자 후보 추가</button></fieldset>';
    h += '<div class="field"><label for="name-m-' + id + '">메모 (선택)</label>';
    h += '<textarea id="name-m-' + id + '" name="memo" rows="3" maxlength="' + NAME_MEMO_MAX + '" placeholder="뜻·느낌·유래 등">' + escapeHtml(isNew ? '' : n.memo) + '</textarea></div>';
    h += '<fieldset class="subfield"><legend>연결할 택일 후보</legend>';
    if (state.dates.length) {
      h += '<div class="date-links">' + state.dates.map(function (d) {
        var checked = !isNew && n.dateIds.indexOf(d.id) !== -1;
        return '<label class="chk chk--chip"><input type="checkbox" name="dateId" value="' + escapeHtml(d.id) + '"' + (checked ? ' checked' : '') + '> ' + escapeHtml(dateHeadline(d) + (d.label ? ' · ' + d.label : '')) + '</label>';
      }).join('') + '</div>';
    } else {
      h += '<p class="subfield__hint">택일 탭에서 택일 후보를 먼저 추가하면 여기에서 연결할 수 있습니다.</p>';
    }
    h += '</fieldset>';
    h += '<p class="field-error" data-error hidden></p>';
    h += '<div class="note-form__actions"><button type="submit" class="btn btn--primary btn--small">' + (isNew ? '이름 저장' : '수정 저장') + '</button>';
    h += '<button type="button" class="btn btn--small" data-action="cancel-name">취소</button></div></form>';
    return h;
  }

  function renderNames() {
    var list = $('#name-list');
    if (!list) return;
    var html = '';
    if (ui.nameEdit === 'new') html += '<li class="namecard namecard--editing">' + nameFormHtml(null) + '</li>';
    if (!state.names.length && ui.nameEdit !== 'new') {
      html += '<li class="datecard-empty">아직 이름 후보가 없습니다. ‘이름 추가’로 한글 이름과 한자 풀이 후보를 적어 보세요.</li>';
    }
    namesSorted().forEach(function (n) {
      if (ui.nameEdit === n.id) { html += '<li class="namecard namecard--editing" data-name-id="' + escapeHtml(n.id) + '">' + nameFormHtml(n) + '</li>'; return; }
      html += '<li class="namecard' + (n.favorite ? ' is-fav' : '') + '" data-name-id="' + escapeHtml(n.id) + '">';
      html += '<div class="namecard__head">';
      html += '<button type="button" class="star" data-action="toggle-fav" aria-pressed="' + (n.favorite ? 'true' : 'false') + '" aria-label="' + escapeHtml(n.name) + ' 즐겨찾기">' + (n.favorite ? '★' : '☆') + '</button>';
      html += '<span class="namecard__name">' + escapeHtml(n.name) + '</span>';
      html += '<div class="namecard__actions"><button type="button" class="btn btn--small" data-action="edit-name" data-focus-key="name-edit:' + escapeHtml(n.id) + '">수정</button>';
      html += '<button type="button" class="btn btn--small btn--danger" data-action="delete-name">삭제</button></div></div>';
      if (n.hanja.length) {
        html += '<ul class="hanja-list">' + n.hanja.map(function (h) {
          return '<li class="hanja">' + (h.chars ? '<span class="hanja__chars">' + escapeHtml(h.chars) + '</span>' : '') + (h.meaning ? '<span class="hanja__meaning">' + escapeHtml(h.meaning) + '</span>' : '') + '</li>';
        }).join('') + '</ul>';
      }
      if (n.memo) html += '<p class="namecard__memo">' + escapeHtml(n.memo) + '</p>';
      html += '<div class="linkrow"><span class="linkrow__label">연결된 택일</span>';
      var linked = n.dateIds.map(findDate).filter(Boolean);
      if (linked.length) html += linked.map(function (d) { return '<span class="chip">' + escapeHtml(dateHeadline(d) + (d.label ? ' · ' + d.label : '')) + '</span>'; }).join('');
      else html += '<span class="linkrow__empty">없음</span>';
      html += '</div></li>';
    });
    list.innerHTML = html;
    var addBtn = $('#add-name-btn');
    if (addBtn) addBtn.hidden = ui.nameEdit === 'new';
  }

  function readNameForm(form) {
    var hanja = [];
    Array.prototype.forEach.call(form.querySelectorAll('.hanja-row'), function (row) {
      var chars = row.querySelector('.hanja-row__chars').value.trim().slice(0, HANJA_CHARS_MAX);
      var meaning = row.querySelector('.hanja-row__meaning').value.trim().slice(0, HANJA_MEANING_MAX);
      if (chars || meaning) hanja.push({ id: uid(), chars: chars, meaning: meaning });
    });
    var dateIds = [];
    Array.prototype.forEach.call(form.querySelectorAll('input[name="dateId"]:checked'), function (cb) {
      if (findDate(cb.value)) dateIds.push(cb.value);
    });
    return { name: form.elements.name.value.trim().slice(0, NAME_MAX), favorite: form.elements.favorite.checked, memo: form.elements.memo.value.replace(/\r\n?/g, '\n').trim().slice(0, NAME_MEMO_MAX), hanja: hanja, dateIds: dateIds };
  }

  function submitNameForm(form) {
    var v = readNameForm(form);
    var err = $('[data-error]', form);
    if (!v.name) { err.textContent = '한글 이름을 입력하세요.'; err.hidden = false; form.elements.name.focus(); return; }
    var key = form.dataset.nameForm;
    if (key === 'new') {
      state.names.push({ id: uid(), name: v.name, favorite: v.favorite, memo: v.memo, hanja: v.hanja, dateIds: v.dateIds });
      ui.nameEdit = null; commit(); act('name', '이름 후보 ‘' + v.name + '’ 추가'); showToast('이름 후보를 저장했습니다.');
      var ab = $('#add-name-btn'); if (ab) ab.focus();
    } else {
      var n = findName(key);
      if (!n) { ui.nameEdit = null; render(); return; }
      n.name = v.name; n.favorite = v.favorite; n.memo = v.memo; n.hanja = v.hanja; n.dateIds = v.dateIds;
      ui.nameEdit = null; commit(); act('name', '이름 후보 ‘' + v.name + '’ 수정'); showToast('이름 후보를 수정했습니다.');
    }
  }

  function toggleNameFav(id) {
    var n = findName(id); if (!n) return;
    n.favorite = !n.favorite; commit();
    act('name', '이름 후보 ‘' + n.name + '’ ' + (n.favorite ? '★ 즐겨찾기' : '즐겨찾기 해제'));
  }

  function deleteName(id) {
    var idx = -1; for (var i = 0; i < state.names.length; i++) if (state.names[i].id === id) idx = i;
    if (idx < 0) return;
    var n = state.names[idx];
    if (!window.confirm('‘' + n.name + '’ 이름 후보를 삭제할까요?')) return;
    state.names.splice(idx, 1);
    if (ui.nameEdit === id) ui.nameEdit = null;
    commit();
    act('name', '이름 후보 ‘' + n.name + '’ 삭제');
    showToast('이름 후보를 삭제했습니다.', function () {
      state.names.splice(Math.min(idx, state.names.length), 0, n);
      commit(); showToast('삭제를 취소했습니다.');
    });
  }

  /* ---------- 홈 (개요) ---------- */
  function renderHome() {
    if (!$('#view-home')) return;
    var p = computeProgress(state.items);
    var txt = progressText(p);
    $('#home-progress-text').innerHTML = progressHtml(p);
    $('#home-progress-fill').style.width = p.percent + '%';
    $('#home-progress-bar').setAttribute('aria-valuenow', String(p.percent));
    $('#home-progress-bar').setAttribute('aria-valuetext', txt);
    $('#home-cats').innerHTML = state.categories.map(function (cat) {
      var cp = computeProgress(itemsOf(cat.id));
      return '<li><button type="button" class="home-cat" data-action="go-category" data-category-id="' + escapeHtml(cat.id) + '">' +
        '<span class="home-cat__name">' + (cat.icon ? escapeHtml(cat.icon) + ' ' : '') + escapeHtml(cat.name) + '</span>' +
        '<span class="home-cat__bar"><span style="width:' + cp.percent + '%"></span></span>' +
        '<span class="home-cat__num">' + (cp.total ? cp.done + '/' + cp.total : '0') + '</span></button></li>';
    }).join('');
    var sum = $('#supports-summary');
    if (sum) {
      var n = state.supports.length;
      if (!n) sum.textContent = '받을 수 있는 지원을 정리하고 신청 상태를 관리하세요';
      else {
        var rec = state.supports.filter(function (x) { return x.status === 'received'; }).length;
        var app = state.supports.filter(function (x) { return x.status === 'applied'; }).length;
        sum.textContent = n + '개 항목 · 받음 ' + rec + ' · 신청함 ' + app;
      }
    }
  }

  /* ---------- D-day ---------- */
  function ddayText(due) {
    if (!due) return '';
    var parts = due.split('-');
    var target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var now = new Date(); var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((target - today) / 86400000);
    if (diff === 0) return 'D-Day';
    return diff > 0 ? 'D-' + diff : 'D+' + Math.abs(diff);
  }
  function renderDday() {
    var pill = $('#dday-pill');
    if (!pill) return;
    var t = ddayText(state.dueDate);
    pill.hidden = !t;
    if (t) {
      pill.textContent = '👶🏻 ' + t;
      pill.title = '출산 예정일 ' + formatNoteDate(state.dueDate);
    }
  }

  /* ---------- 메모 (목록) ---------- */
  var memoTimers = {};
  function findMemo(id) { for (var i = 0; i < state.memos.length; i++) if (state.memos[i].id === id) return state.memos[i]; return null; }
  function memosSorted() { return state.memos.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }); }
  function memoStamp(t) { return t ? relTime(t) : ''; }
  function renderMemo() {
    // 홈 카드: 최신 메모 미리보기
    var prev = $('#memo-preview'); var cnt = $('#memo-count');
    if (prev) {
      var list = memosSorted();
      if (!list.length) prev.innerHTML = '<p class="memo-empty">아직 메모가 없습니다. ‘새 메모’로 적어 두면 여기서 바로 보입니다.</p>';
      else prev.innerHTML = list.slice(0, 3).map(function (m) {
        var t = m.text.trim(); var first = t.split('\n')[0]; var more = t.split('\n').length > 1;
        return '<button type="button" class="memo-preview__item" data-action="open-memo" data-memo-id="' + escapeHtml(m.id) + '"><span class="memo-preview__text">' + escapeHtml(first.slice(0, 80)) + (more || first.length > 80 ? '…' : '') + '</span><span class="memo-preview__time">' + escapeHtml(memoStamp(m.updated)) + '</span></button>';
      }).join('');
      if (cnt) cnt.textContent = list.length ? list.length + '개' : '';
    }
    // 메모 화면
    var box = $('#memo-list'); if (!box) return;
    var items = memosSorted();
    if (!items.length) { box.innerHTML = '<li class="datecard-empty">메모가 없습니다. ‘새 메모’를 눌러 적어 보세요. 입력하면 자동 저장되고 가족과 공유됩니다.</li>'; return; }
    box.innerHTML = items.map(function (m) {
      return '<li class="memo-item" data-memo-id="' + escapeHtml(m.id) + '">' +
        '<textarea class="memo-item__text" data-focus-key="memo:' + escapeHtml(m.id) + '" rows="3" maxlength="' + MEMO_MAX + '" aria-label="메모 내용" placeholder="내용을 입력하세요">' + escapeHtml(m.text) + '</textarea>' +
        '<div class="memo-item__foot"><span class="memo-item__time" data-memo-time>' + escapeHtml(m.updated ? '수정 ' + memoStamp(m.updated) : '') + '</span>' +
        '<button type="button" class="btn btn--small btn--danger" data-action="delete-memo" aria-label="이 메모 삭제">삭제</button></div></li>';
    }).join('');
    if (ui.memoFocus) {
      var ta = document.querySelector('[data-focus-key="memo:' + ui.memoFocus + '"]');
      ui.memoFocus = null;
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }
  }
  function newMemo() {
    var m = { id: uid(), text: '', updated: Date.now() };
    state.memos.unshift(m);
    ui.memoFocus = m.id;
    if (ui.view !== 'memos') setView('memos'); else renderMemo();
  }
  function saveMemoText(id, value, final) {
    var m = findMemo(id); if (!m) return;
    var v = String(value).replace(/\r\n?/g, '\n').slice(0, MEMO_MAX);
    if (final && !v.trim()) { // empty on leaving → remove silently
      state.memos = state.memos.filter(function (x) { return x.id !== id; });
      commit(); return;
    }
    if (v === m.text) return;
    var wasEmpty = !m.text.trim();
    m.text = v; m.updated = Date.now();
    saveState();
    var li = document.querySelector('.memo-item[data-memo-id="' + id + '"] [data-memo-time]');
    if (li) li.textContent = '저장됨 ' + timeStamp();
    if (final) { act('memo', wasEmpty ? '메모 추가' : '메모 수정'); renderMemo(); }
  }
  function deleteMemo(id) {
    var idx = -1; for (var i = 0; i < state.memos.length; i++) if (state.memos[i].id === id) idx = i;
    if (idx < 0) return;
    var m = state.memos[idx];
    if (m.text.trim() && !window.confirm('이 메모를 삭제할까요?')) return;
    state.memos.splice(idx, 1); commit();
    if (m.text.trim()) { act('memo', '메모 삭제'); showToast('메모를 삭제했습니다.', function () { state.memos.splice(Math.min(idx, state.memos.length), 0, m); commit(); showToast('삭제를 취소했습니다.'); }); }
  }

  /* ---------- 변경 기록(알림) ---------- */
  // 이름을 정하지 않은 기기는 기기마다 다른 자동 이름을 쓴다(둘 다 '나'면 서로의 변경을 구분할 수 없다).
  function autoName() {
    if (!ui.autoName) { ui.autoName = '가족' + Math.random().toString(36).slice(2, 5).toUpperCase(); saveUiPrefs(); }
    return ui.autoName;
  }
  function myName() { return ui.deviceName || autoName(); }
  function ensureDeviceName() {
    if (ui.deviceName) return;
    var n = window.prompt('변경 기록에 표시할 내 이름을 입력하세요 (예: 남편, 아내)', '');
    if (n && n.trim()) { ui.deviceName = n.trim().slice(0, 12); saveUiPrefs(); renderSettings(); }
    else showToast('이름을 정하지 않아 ‘' + autoName() + '’으로 표시됩니다. 설정에서 바꿀 수 있습니다.');
  }
  function act(kind, text) {
    var S = window.ChecklistSync;
    if (!S || !S.getState().roomId) return;
    try { S.logActivity({ kind: kind, text: text }); } catch (e) { /* activity is best-effort */ }
  }
  function unreadActivityCount() {
    var me = myName();
    return ui.activity.filter(function (a) { return a.t > ui.lastSeenActivity && a.who !== me; }).length;
  }
  function markActivitySeen(rerender) {
    var maxT = 0;
    ui.activity.forEach(function (a) { if (a.t > maxT) maxT = a.t; });
    if (maxT > ui.lastSeenActivity) { ui.lastSeenActivity = maxT; saveUiPrefs(); if (rerender) render(); }
  }
  function relTime(t) {
    var d = Date.now() - t;
    if (d < 60000) return '방금';
    if (d < 3600000) return Math.floor(d / 60000) + '분 전';
    if (d < 86400000) return Math.floor(d / 3600000) + '시간 전';
    var dt = new Date(t); return (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + timeStampOf(dt);
  }
  function renderActivity() {
    var list = $('#activity-list');
    if (!list) return;
    var S = window.ChecklistSync;
    var st = S ? S.getState() : null;
    var clearBtn = $('#activity-clear');
    if (!st || !st.roomId) {
      list.innerHTML = '<li class="activity-empty">가족 공유를 연결하면 서로의 변경 내용이 여기에 표시됩니다.</li>';
      if (clearBtn) clearBtn.hidden = true;
      return;
    }
    var me = myName();
    var items = ui.activity.slice().sort(function (a, b) { return b.t - a.t; }).slice(0, 30);
    if (!items.length) { list.innerHTML = '<li class="activity-empty">아직 변경 기록이 없습니다.</li>'; if (clearBtn) clearBtn.hidden = true; return; }
    var base = Math.min(ui.seenBase || 0, ui.lastSeenActivity);
    var fresh = items.filter(function (a) { return a.t > base && a.who !== me; }).length;
    if (clearBtn) clearBtn.hidden = fresh === 0;
    list.innerHTML = items.map(function (a) {
      var unread = a.t > base && a.who !== me;
      return '<li class="activity' + (unread ? ' is-unread' : '') + '"><span class="activity__who">' + escapeHtml(a.who || '누군가') + '</span>' +
        '<span class="activity__text">' + escapeHtml(a.text || '') + '</span><span class="activity__time">' + escapeHtml(relTime(a.t)) + '</span></li>';
    }).join('');
  }
  var activityInitialized = false;
  function setActivity(list) {
    var prevMax = 0;
    ui.activity.forEach(function (a) { if (a.t > prevMax) prevMax = a.t; });
    ui.activity = (list || []).filter(function (a) { return a && typeof a.t === 'number'; });
    if (activityInitialized && ui.toastRemote) {
      var me = myName();
      var fresh = ui.activity.filter(function (a) { return a.t > prevMax && a.who !== me; });
      if (fresh.length && document.visibilityState === 'visible') {
        var last = fresh.sort(function (a, b) { return b.t - a.t; })[0];
        showToast((last.who || '가족') + ' · ' + last.text + (fresh.length > 1 ? ' 외 ' + (fresh.length - 1) + '건' : ''));
      }
    }
    activityInitialized = true;
    if (ui.view === 'home' && document.visibilityState === 'visible') markActivitySeen(false);
    renderActivity();
    renderPrimaryTabs();
  }

  /* ---------- 설정 ---------- */
  function renderSettings() {
    var dn = $('#device-name'); if (dn && document.activeElement !== dn) { dn.value = ui.deviceName; dn.placeholder = ui.deviceName ? '예: 남편, 아내' : '예: 남편, 아내 (지금은 ' + autoName() + ')'; }
    var dd = $('#due-date'); if (dd && document.activeElement !== dd) dd.value = state.dueDate || '';
    var tr = $('#toast-remote'); if (tr) tr.checked = ui.toastRemote;
  }

  /* ---------- 정부 지원 체크리스트 ---------- */
  function findSupport(id) { for (var i = 0; i < state.supports.length; i++) if (state.supports[i].id === id) return state.supports[i]; return null; }
  function supportFormHtml(sp) {
    var isNew = !sp; var id = isNew ? 'new' : escapeHtml(sp.id);
    var v = function (k) { return isNew ? '' : escapeHtml(sp[k] || ''); };
    var h = '<form class="support-form" data-support-form="' + id + '">';
    h += '<div class="field"><label for="sp-title-' + id + '">지원 이름</label><input type="text" id="sp-title-' + id + '" name="title" data-focus-key="sp-title:' + id + '" value="' + v('title') + '" maxlength="60" placeholder="예: 첫만남이용권" required></div>';
    h += '<div class="field"><label for="sp-target-' + id + '">대상·조건</label><input type="text" id="sp-target-' + id + '" name="target" value="' + v('target') + '" maxlength="300" placeholder="누가 받을 수 있는지"></div>';
    h += '<div class="field"><label for="sp-benefit-' + id + '">지원 내용</label><textarea id="sp-benefit-' + id + '" name="benefit" rows="2" maxlength="500" placeholder="금액·바우처·기간 등">' + v('benefit') + '</textarea></div>';
    h += '<div class="field"><label for="sp-howto-' + id + '">신청 방법·유의사항</label><textarea id="sp-howto-' + id + '" name="howto" rows="2" maxlength="500" placeholder="어디서, 무엇을 준비해서, 주의할 점">' + v('howto') + '</textarea></div>';
    h += '<div class="field-row"><div class="field"><label for="sp-deadline-' + id + '">신청 기한</label><input type="date" id="sp-deadline-' + id + '" name="deadline" value="' + v('deadline') + '"></div>';
    h += '<div class="field"><label for="sp-status-' + id + '">상태</label><select id="sp-status-' + id + '" name="status">' + SUPPORT_STATUS.map(function (k) { return '<option value="' + k + '"' + (!isNew && sp.status === k ? ' selected' : '') + '>' + SUPPORT_STATUS_LABEL[k] + '</option>'; }).join('') + '</select></div></div>';
    h += '<div class="field"><label for="sp-link-' + id + '">공식 링크</label><input type="url" id="sp-link-' + id + '" name="link" value="' + v('link') + '" maxlength="300" placeholder="https://www.bokjiro.go.kr/ 등" inputmode="url"></div>';
    h += '<div class="field"><label for="sp-memo-' + id + '">메모</label><textarea id="sp-memo-' + id + '" name="memo" rows="2" maxlength="500">' + v('memo') + '</textarea></div>';
    h += '<p class="field-error" data-error hidden></p>';
    h += '<div class="note-form__actions"><button type="submit" class="btn btn--primary btn--small">' + (isNew ? '항목 저장' : '수정 저장') + '</button><button type="button" class="btn btn--small" data-action="cancel-support">취소</button></div></form>';
    return h;
  }
  function safeHref(u) {
    return /^https?:\/\//i.test(u) ? u : '';
  }
  function renderSupports() {
    var list = $('#support-list'); if (!list) return;
    var stats = $('#supports-stats');
    var counts = { todo: 0, applied: 0, received: 0, na: 0 };
    state.supports.forEach(function (x) { counts[x.status] = (counts[x.status] || 0) + 1; });
    if (stats) stats.innerHTML = state.supports.length ? SUPPORT_STATUS.map(function (k) { return '<span class="sp-stat sp-stat--' + k + '">' + SUPPORT_STATUS_LABEL[k] + ' ' + counts[k] + '</span>'; }).join('') : '';
    var cnt = $('#supports-count'); if (cnt) cnt.textContent = state.supports.length ? state.supports.length + '개' : '';
    var html = '';
    if (ui.supportEdit === 'new') html += '<li class="support support--editing">' + supportFormHtml(null) + '</li>';
    if (!state.supports.length && ui.supportEdit !== 'new') {
      html += '<li class="datecard-empty">아직 항목이 없습니다. ‘항목 추가’로 첫만남이용권, 부모급여, 출산휴가 같은 지원을 하나씩 정리해 보세요.<br><small>각 항목에 대상·지원 내용·신청 방법·기한·공식 링크·상태(확인 전→신청함→받음)를 적을 수 있습니다.</small></li>';
    }
    var order = { todo: 0, applied: 1, received: 2, na: 3 };
    state.supports.slice().sort(function (a, b) { return order[a.status] - order[b.status]; }).forEach(function (sp) {
      if (ui.supportEdit === sp.id) { html += '<li class="support support--editing" data-support-id="' + escapeHtml(sp.id) + '">' + supportFormHtml(sp) + '</li>'; return; }
      var href = safeHref(sp.link);
      html += '<li class="support support--' + sp.status + '" data-support-id="' + escapeHtml(sp.id) + '">';
      html += '<div class="support__head"><div class="support__meta"><span class="support__title">' + escapeHtml(sp.title) + '</span><span class="sp-stat sp-stat--' + sp.status + '">' + SUPPORT_STATUS_LABEL[sp.status] + '</span>';
      if (sp.deadline) html += '<span class="badge badge--label">기한 ' + escapeHtml(formatNoteDate(sp.deadline)) + '</span>';
      html += '</div><div class="support__actions"><button type="button" class="btn btn--small" data-action="edit-support" data-focus-key="sp-edit:' + escapeHtml(sp.id) + '">수정</button><button type="button" class="btn btn--small btn--danger" data-action="delete-support">삭제</button></div></div>';
      if (sp.target) html += '<p class="support__row"><b>대상</b>' + escapeHtml(sp.target) + '</p>';
      if (sp.benefit) html += '<p class="support__row"><b>내용</b>' + escapeHtml(sp.benefit) + '</p>';
      if (sp.howto) html += '<p class="support__row"><b>신청</b>' + escapeHtml(sp.howto) + '</p>';
      if (sp.memo) html += '<p class="support__row"><b>메모</b>' + escapeHtml(sp.memo) + '</p>';
      if (href) html += '<p class="support__row"><a class="support__link" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">공식 안내 열기 ↗</a></p>';
      html += '<div class="support__status"><label class="visually-hidden" for="sp-quick-' + escapeHtml(sp.id) + '">상태 바꾸기</label><select id="sp-quick-' + escapeHtml(sp.id) + '" data-action="quick-status">' + SUPPORT_STATUS.map(function (k) { return '<option value="' + k + '"' + (sp.status === k ? ' selected' : '') + '>' + SUPPORT_STATUS_LABEL[k] + '</option>'; }).join('') + '</select></div>';
      html += '</li>';
    });
    list.innerHTML = html;
    var addBtn = $('#add-support-btn'); if (addBtn) addBtn.hidden = ui.supportEdit === 'new';
  }
  function readSupportForm(form) {
    var g = function (n, max) { return (form.elements[n].value || '').replace(/\r\n?/g, '\n').trim().slice(0, max); };
    var dl = form.elements.deadline.value; if (dl && !/^\d{4}-\d{2}-\d{2}$/.test(dl)) dl = '';
    var st = form.elements.status.value; if (SUPPORT_STATUS.indexOf(st) === -1) st = 'todo';
    return { title: g('title', 60), target: g('target', 300), benefit: g('benefit', 500), howto: g('howto', 500), deadline: dl, link: g('link', 300), status: st, memo: g('memo', 500) };
  }
  function submitSupportForm(form) {
    var v = readSupportForm(form);
    var err = $('[data-error]', form);
    if (!v.title) { err.textContent = '지원 이름을 입력하세요.'; err.hidden = false; form.elements.title.focus(); return; }
    var key = form.dataset.supportForm;
    if (key === 'new') {
      state.supports.push({ id: uid(), title: v.title, target: v.target, benefit: v.benefit, howto: v.howto, deadline: v.deadline, link: v.link, status: v.status, memo: v.memo });
      ui.supportEdit = null; commit(); act('support', '지원 항목 ‘' + v.title + '’ 추가'); showToast('지원 항목을 저장했습니다.');
    } else {
      var sp = findSupport(key); if (!sp) { ui.supportEdit = null; render(); return; }
      Object.keys(v).forEach(function (k) { sp[k] = v[k]; });
      ui.supportEdit = null; commit(); act('support', '지원 항목 ‘' + v.title + '’ 수정'); showToast('지원 항목을 수정했습니다.');
    }
  }
  function deleteSupport(id) {
    var idx = -1; for (var i = 0; i < state.supports.length; i++) if (state.supports[i].id === id) idx = i;
    if (idx < 0) return;
    var sp = state.supports[idx];
    if (!window.confirm('‘' + sp.title + '’ 항목을 삭제할까요?')) return;
    state.supports.splice(idx, 1); if (ui.supportEdit === id) ui.supportEdit = null;
    commit(); act('support', '지원 항목 ‘' + sp.title + '’ 삭제');
    showToast('지원 항목을 삭제했습니다.', function () { state.supports.splice(Math.min(idx, state.supports.length), 0, sp); commit(); showToast('삭제를 취소했습니다.'); });
  }

  function renderHighlightsStrip() {
    var strip = $('#highlights-strip'), body = $('#highlights-strip-body');
    if (!strip) return;
    var lines = state.highlights ? state.highlights.split('\n') : [];
    var show = ui.view !== 'home' && lines.length > 0;
    strip.hidden = !show;
    if (!show) { body.hidden = true; return; }
    $('#highlights-strip-text').textContent = lines[0];
    $('#highlights-strip-more').textContent = lines.length > 1 ? '외 ' + (lines.length - 1) + '개' : '';
    strip.setAttribute('aria-expanded', ui.stripOpen ? 'true' : 'false');
    strip.classList.toggle('is-open', ui.stripOpen);
    body.hidden = !ui.stripOpen;
    body.innerHTML = '<ul class="highlights-list">' + lines.map(function (l) { return '<li>' + escapeHtml(l) + '</li>'; }).join('') + '</ul>';
  }

  /* ---------- 꼭 기억하기 (상단 고정) ---------- */
  function renderHighlights() {
    var box = $('#highlights-body');
    var lines = state.highlights ? state.highlights.split('\n') : [];
    var editBtn = $('#highlights-edit-btn');
    var collapsed = ui.highlightsCollapsed && !ui.highlightEdit;
    var toggle = $('#highlights-toggle');
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    $('#highlights-count').textContent = lines.length ? lines.length + '개' : '';
    $('#highlights-toggle-label').textContent = collapsed ? '펼치기' : '접기';
    box.hidden = collapsed;
    $('#highlights').classList.toggle('is-collapsed', collapsed);
    if (ui.highlightEdit) {
      editBtn.hidden = true;
      box.innerHTML = '<form class="highlights-form" id="highlights-form">' +
        '<label for="highlights-input" class="visually-hidden">꼭 기억할 내용 (한 줄에 하나)</label>' +
        '<textarea id="highlights-input" rows="5" maxlength="' + HIGHLIGHT_MAX + '" data-focus-key="highlights-input" placeholder="한 줄에 하나씩 적으세요.\n예: 마스크 꼭 착용\n예: 다음 진료 태동검사">' + escapeHtml(state.highlights) + '</textarea>' +
        '<div class="note-form__actions"><button type="submit" class="btn btn--primary btn--small">저장</button>' +
        '<button type="button" class="btn btn--small" data-action="cancel-highlights">취소</button></div></form>';
      return;
    }
    editBtn.hidden = false;
    editBtn.textContent = lines.length ? '수정' : '추가';
    if (!lines.length) {
      box.innerHTML = '<p class="highlights-empty">진료 메모 중 꼭 기억할 내용을 여기에 적어 두면 항상 맨 위에 보입니다.</p>';
      return;
    }
    box.innerHTML = '<ul class="highlights-list">' + lines.map(function (l) {
      return '<li>' + escapeHtml(l) + '</li>';
    }).join('') + '</ul>';
  }

  function saveHighlights(text) {
    state.highlights = cleanHighlights(text);
    ui.highlightEdit = false;
    commit();
    act('highlight', '꼭 기억하기 ' + (state.highlights ? '수정' : '비움'));
    showToast(state.highlights ? '꼭 기억하기를 저장했습니다.' : '꼭 기억하기를 비웠습니다.');
    $('#highlights-edit-btn').focus();
  }

  /* ---------- toast / undo ---------- */
  function showToast(text, undoFn) {
    var toast = $('#toast');
    var undoBtn = $('#toast-undo');
    clearTimeout(ui.undoTimer);
    ui.pendingUndo = undoFn || null;
    $('#toast-text').textContent = text;
    undoBtn.hidden = !undoFn;
    toast.hidden = false;
    ui.undoTimer = setTimeout(hideToast, undoFn ? UNDO_MS : 3500);
  }

  function hideToast() {
    clearTimeout(ui.undoTimer);
    $('#toast').hidden = true;
    ui.pendingUndo = null;
  }

  /* ---------- actions ---------- */
  function commit() {
    saveState();
    render();
  }

  function addCategory(name) {
    var n = String(name || '').trim();
    if (!n) { showToast('분류 이름을 입력하세요.'); return false; }
    var newId = uid();
    state.categories.push({ id: newId, name: n.slice(0, 40), icon: '' });
    ui.activeCategory = newId;
    saveUiPrefs();
    commit();
    act('category', '분류 ‘' + n.slice(0, 40) + '’ 추가');
    return true;
  }

  function renameCategory(id, name, inputEl) {
    var cat = findCategory(id);
    if (!cat) return;
    var n = String(name || '').trim();
    if (!n) {
      inputEl.value = cat.name;
      showToast('분류 이름은 비워둘 수 없습니다. 이전 이름을 유지합니다.');
      return;
    }
    if (n === cat.name) return;
    var oldName = cat.name;
    cat.name = n.slice(0, 40);
    saveState();
    act('category', '분류 ‘' + oldName + '’ → ‘' + cat.name + '’ 이름 변경');
    // Targeted DOM update so focus and tab order are preserved.
    var card = inputEl.closest('[data-category-id]');
    if (card) {
      var h2 = $('h2', card);
      if (h2) h2.textContent = cat.name;
      var del = $('[data-action="delete-category"]', card);
      if (del) del.setAttribute('aria-label', '분류 ' + cat.name + ' 삭제');
      var bar = $('.progress-bar', card);
      if (bar) bar.setAttribute('aria-label', cat.name + ' 진행률');
    }
    var opts = document.querySelectorAll('select[data-action="move-item"] option[value="' + id + '"]');
    Array.prototype.forEach.call(opts, function (opt) {
      opt.textContent = cat.name + (opt.selected ? ' (현재)' : '');
    });
    showToast('분류 이름을 ‘' + cat.name + '’(으)로 변경했습니다.');
  }

  function setCategoryIcon(id, value) {
    var cat = findCategory(id);
    if (!cat) return;
    var icon = cleanIcon(value);
    if (icon === (cat.icon || '')) return;
    cat.icon = icon;
    saveState();
    // Keep the input and preset buttons in sync without a full re-render (focus stays put).
    var card = document.querySelector('.category[data-category-id="' + id + '"]');
    if (!card) return;
    var input = $('[data-action="set-icon"]', card);
    if (input && input.value !== icon) input.value = icon;
    Array.prototype.forEach.call(card.querySelectorAll('[data-action="pick-icon"]'), function (b) {
      var active = (b.dataset.icon || '') === icon;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function deleteCategory(id) {
    var cat = findCategory(id);
    if (!cat) return;
    var catItems = itemsOf(id);
    var msg = catItems.length > 0
      ? '‘' + cat.name + '’ 분류를 삭제하면 안에 있는 준비물 ' + catItems.length + '개도 함께 삭제됩니다. 삭제할까요?'
      : '‘' + cat.name + '’ 분류를 삭제할까요?';
    if (!window.confirm(msg)) return;
    var index = state.categories.indexOf(cat);
    state.categories.splice(index, 1);
    state.items = state.items.filter(function (it) { return it.categoryId !== id; });
    commit();
    act('category', '분류 ‘' + cat.name + '’ 삭제' + (catItems.length ? ' (준비물 ' + catItems.length + '개 포함)' : ''));
    showToast('‘' + cat.name + '’ 분류를 삭제했습니다.' + (catItems.length ? ' (준비물 ' + catItems.length + '개 포함)' : ''), function () {
      state.categories.splice(Math.min(index, state.categories.length), 0, cat);
      state.items = state.items.concat(catItems);
      commit();
      showToast('삭제를 취소했습니다.');
    });
  }

  // "수유 패드 2팩", "물티슈 x3", "젖병 3" → { name, qty, unit }
  function parseItemLine(line) {
    var t = String(line || '').replace(/^[\s\-•·*\d]*[.)]?\s*(?=\S)/, '').trim();
    t = t.replace(/^[-•·*]\s*/, '').trim();
    if (!t) return null;
    // 끝에 붙은 금액: "5,000", "5000원", "5천원", "1.5만원"
    var m = t.match(/^(.+?)[\s:]+((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:만|천)?\s*원?)$/);
    if (m && m[1].trim()) {
      var pp = parsePrice(m[2]);
      if (pp.ok) return { name: m[1].trim().slice(0, 60), price: pp.value };
    }
    return { name: t.slice(0, 60), price: null };
  }
  function addItem(categoryId, text) {
    var p = parseItemLine(text);
    if (!p) { showToast('준비물 이름을 입력하세요.'); return false; }
    if (!findCategory(categoryId)) return false;
    state.items.push({ id: uid(), categoryId: categoryId, name: p.name, price: p.price, memo: '', done: false, excluded: false });
    commit();
    act('add', '‘' + p.name + '’ 추가');
    showToast('‘' + p.name + '’ 추가' + (p.price !== null ? ' · ' + formatWon(p.price) : ''));
    return true;
  }
  function addItems(categoryId, text) {
    if (!findCategory(categoryId)) return 0;
    var added = [];
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var p = parseItemLine(line); if (!p) return;
      state.items.push({ id: uid(), categoryId: categoryId, name: p.name, price: p.price, memo: '', done: false, excluded: false });
      added.push(p.name);
    });
    if (!added.length) { showToast('추가할 준비물이 없습니다. 한 줄에 하나씩 적어 주세요.'); return 0; }
    commit();
    act('add', '준비물 ' + added.length + '개 추가 (' + added.slice(0, 3).join(', ') + (added.length > 3 ? ' 외' : '') + ')');
    return added.length;
  }
  // 한 분류의 준비물만 비우기(분류는 남김). 되돌리기 가능.
  function clearCategoryItems(id) {
    var cat = findCategory(id); if (!cat) return false;
    var removed = itemsOf(id);
    if (!removed.length) { showToast('‘' + cat.name + '’에는 삭제할 준비물이 없습니다.'); return false; }
    if (!window.confirm('‘' + cat.name + '’의 준비물 ' + removed.length + '개를 모두 삭제할까요? 분류는 남습니다.' + (window.ChecklistSync && window.ChecklistSync.getState().roomId ? '\n가족 공유 중이라 다른 기기에서도 함께 삭제됩니다.' : ''))) return false;
    state.items = state.items.filter(function (it) { return it.categoryId !== id; });
    ui.itemEdit = null; ui.qtyEdit = null;
    commit();
    act('delete', '‘' + cat.name + '’ 준비물 ' + removed.length + '개 삭제');
    showToast('‘' + cat.name + '’ 준비물 ' + removed.length + '개를 삭제했습니다.', function () {
      state.items = state.items.concat(removed); commit(); showToast('삭제를 취소했습니다.');
    });
    return true;
  }
  // 준비물 전체 비우기(분류·일지·택일·이름은 유지). 되돌리기 가능.
  function clearAllItems(auto) {
    var removed = state.items.slice();
    if (!removed.length) { if (!auto) showToast('비울 준비물이 없습니다.'); return false; }
    if (!auto) {
      var shared = !!(window.ChecklistSync && window.ChecklistSync.getState().roomId);
      var msg = '준비물 ' + removed.length + '개를 모두 삭제합니다. 분류·일지·택일·이름·메모는 그대로 둡니다.';
      if (shared) msg += '\n가족 공유 중이라 연결된 다른 기기에서도 함께 삭제됩니다.';
      msg += '\n계속하기 전에 JSON 백업 파일이 자동으로 저장됩니다. 삭제할까요?';
      if (!window.confirm(msg)) return false;
      try { exportJson(); } catch (e) { /* backup best-effort */ }
    }
    state.items = [];
    ui.itemEdit = null; ui.qtyEdit = null;
    commit();
    act('delete', (auto ? '기본 예시 준비물 ' : '준비물 ') + removed.length + '개 비움');
    showToast((auto ? '기본 예시 준비물 ' : '준비물 ') + removed.length + '개를 비웠습니다. 이제 직접 추가하세요.', function () {
      state.items = removed.concat(state.items); commit(); showToast('준비물을 되돌렸습니다.');
    });
    return true;
  }
  // 예전 버전이 채워 둔 예시 준비물을 한 번도 손대지 않았으면(체크·수량·메모·제외 없음) 자동으로 비운다.
  function isPristineTemplate(items) {
    if (items.length < 20) return false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!TEMPLATE_NAMES[it.name] || it.done || it.excluded || it.price !== null || it.memo) return false;
    }
    return true;
  }
  function clearTemplateItemsOnce() {
    if (ui.templateCleared) return;
    ui.templateCleared = true; saveUiPrefs();
    if (isPristineTemplate(state.items)) clearAllItems(true);
  }

  function deleteItem(id) {
    var it = findItem(id);
    if (!it) return;
    var index = state.items.indexOf(it);
    state.items.splice(index, 1);
    commit();
    act('delete', '‘' + it.name + '’ 삭제');
    showToast('‘' + it.name + '’ 항목을 삭제했습니다.', function () {
      if (!findCategory(it.categoryId)) {
        showToast('원래 분류가 없어 복구할 수 없습니다.');
        return;
      }
      state.items.splice(Math.min(index, state.items.length), 0, it);
      commit();
      act('add', '‘' + it.name + '’ 삭제 취소');
      showToast('삭제를 취소했습니다.');
    });
  }

  function toggleDone(id, checked) {
    var it = findItem(id);
    if (!it || it.excluded) return;
    it.done = !!checked;
    commit();
    act(it.done ? 'check' : 'uncheck', '‘' + it.name + '’ ' + (it.done ? '체크' : '체크 해제'));
  }

  function toggleExcluded(id) {
    var it = findItem(id);
    if (!it) return;
    it.excluded = !it.excluded;
    commit();
    act('edit', '‘' + it.name + '’ ' + (it.excluded ? '준비 대상에서 제외' : '다시 포함'));
    showToast(it.excluded ? '‘' + it.name + '’ 항목을 준비 대상에서 제외했습니다.' : '‘' + it.name + '’ 항목을 다시 포함했습니다.');
  }

  function moveCategoryDir(id, dir) {
    var i = -1; for (var k = 0; k < state.categories.length; k++) if (state.categories[k].id === id) i = k;
    var j = i + dir;
    if (i < 0 || j < 0 || j >= state.categories.length) return;
    var tmp = state.categories[i]; state.categories[i] = state.categories[j]; state.categories[j] = tmp;
    commit();
  }

  function moveItemDir(id, dir) {
    var it = findItem(id);
    if (!it) return;
    var sib = itemsOf(it.categoryId);
    var pos = sib.map(function (x) { return x.id; }).indexOf(id);
    var target = sib[pos + dir];
    if (!target) return;
    var gi = state.items.indexOf(it), gj = state.items.indexOf(target);
    var tmp = state.items[gi]; state.items[gi] = state.items[gj]; state.items[gj] = tmp;
    commit();
  }

  function resetToDefault() {
    var shared = !!(window.ChecklistSync && window.ChecklistSync.getState().roomId);
    var msg = '현재 기록(준비물·진료 메모·택일·이름 등)을 모두 지우고 기본 목록으로 초기화합니다.';
    if (shared) msg += '\n가족 공유 중이라 연결된 다른 기기에도 초기화가 반영됩니다.';
    msg += '\n계속하기 전에 JSON 백업 파일이 자동으로 저장됩니다. 초기화할까요?';
    if (!window.confirm(msg)) return;
    try { exportJson(); } catch (e) { /* backup best-effort */ }
    state = createDefaultState();
    ui.activeCategory = null; ui.search = ''; ui.view = 'checklist';
    ui.editMode = false; ui.itemEdit = null; ui.qtyEdit = null;
    var sb = $('#item-search'); if (sb) sb.value = '';
    var sc = $('#search-clear'); if (sc) sc.hidden = true;
    saveUiPrefs();
    commit();
    act('reset', '기본 목록으로 초기화함');
    showToast('기본 목록으로 초기화했습니다. 백업 파일이 저장되었습니다.');
  }

  function moveItem(id, categoryId) {
    var it = findItem(id);
    if (!it || !findCategory(categoryId) || it.categoryId === categoryId) return;
    it.categoryId = categoryId;
    ui.itemEdit = null;
    commit();
    act('edit', '‘' + it.name + '’ → ‘' + findCategory(categoryId).name + '’ 분류로 이동');
    showToast('‘' + it.name + '’ 항목을 ‘' + findCategory(categoryId).name + '’ 분류로 이동했습니다.');
  }

  // Field edits in edit mode: update state without a full re-render so focus/tab order is preserved.
  function updateItemField(id, field, inputEl, rowEl) {
    var it = findItem(id);
    if (!it) return;
    var errEl = $('[data-error]', rowEl);
    var setError = function (msg) {
      if (msg) { errEl.textContent = msg; errEl.hidden = false; }
      else { errEl.textContent = ''; errEl.hidden = true; }
    };
    switch (field) {
      case 'name': {
        var n = inputEl.value.trim();
        if (!n) { inputEl.value = it.name; setError('이름은 비워둘 수 없습니다. 이전 이름을 유지합니다.'); return; }
        it.name = n.slice(0, 60);
        setError('');
        break;
      }
      case 'price': {
        var pp = parsePrice(inputEl.value);
        if (!pp.ok) { inputEl.value = it.price === null ? '' : formatNumber(it.price); setError('금액은 비워두거나 숫자만 입력할 수 있습니다 (예: 5,000).'); return; }
        if (pp.value === it.price) { inputEl.value = pp.value === null ? '' : formatNumber(pp.value); setError(''); return; }
        it.price = pp.value;
        inputEl.value = pp.value === null ? '' : formatNumber(pp.value);
        setError('');
        break;
      }
      case 'memo':
        it.memo = inputEl.value.trim().slice(0, 200);
        break;
      default:
        return;
    }
    saveState();
    refreshProgress();
    if (field === 'name') act('edit', '‘' + it.name + '’ 이름 수정');
    else if (field === 'price') act('edit', '‘' + it.name + '’ 금액 ' + (qtyLabel(it) || '미입력') + '로 변경');
    else if (field === 'memo') act('edit', '‘' + it.name + '’ 메모 수정');
    var qtyBtn = $('.item__qty', rowEl);
    if (qtyBtn) {
      var label = qtyLabel(it);
      if (label) qtyBtn.textContent = label; else qtyBtn.innerHTML = '<span aria-hidden="true">＋</span>';
      qtyBtn.classList.toggle('item__qty--empty', !label);
      qtyBtn.setAttribute('aria-label', it.name + ' 금액 ' + (label || '미입력') + ', 누르면 수정');
    }
  }

  /* ---------- backup ---------- */
  function backupPayload(pretty) {
    return JSON.stringify({
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      categories: state.categories,
      items: state.items,
      notes: state.notes,
      highlights: state.highlights,
      picks: state.picks,
      dates: state.dates,
      names: state.names,
      dueDate: state.dueDate,
      memo: state.memo,
      memos: state.memos,
      supports: state.supports
    }, null, pretty ? 2 : 0);
  }

  function copyBackupText() {
    var text = backupPayload(false);
    var done = function () { showToast('백업 텍스트를 복사했습니다. 메신저 등으로 다른 기기에 보낸 뒤 ‘텍스트 붙여넣어 불러오기’에 붙여넣으세요.'); };
    var fail = function () {
      // Fallback: show the text so it can be selected and copied by hand.
      var panel = $('#paste-import');
      panel.hidden = false;
      var ta = $('#paste-import-text');
      ta.value = text;
      ta.focus();
      ta.select();
      showToast('자동 복사가 막혀 있어 텍스트를 표시했습니다. 전체 선택 후 복사하세요.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  function importJsonText(text, sourceLabel) {
    var parsed;
    try {
      parsed = JSON.parse(String(text || '').trim());
    } catch (e) {
      showToast('JSON 형식이 아닙니다. 기존 기록은 그대로 유지됩니다.');
      return false;
    }
    var result = normalizeState(parsed);
    if (!result.ok) {
      showToast('불러올 수 없는 ' + sourceLabel + '입니다: ' + result.error + ' 기존 기록은 그대로 유지됩니다.');
      return false;
    }
    var msg = '현재 목록(분류 ' + state.categories.length + '개, 준비물 ' + state.items.length + '개, 진료 메모 ' + state.notes.length + '개)을 ' + sourceLabel + ' 내용(분류 ' + result.data.categories.length + '개, 준비물 ' + result.data.items.length + '개, 진료 메모 ' + result.data.notes.length + '개)으로 교체합니다. 기존 기록은 사라집니다. 계속할까요?';
    if (!window.confirm(msg)) { showToast('불러오기를 취소했습니다.'); return false; }
    state = result.data;
    ui.itemEdit = null; ui.qtyEdit = null; ui.noteForm = null; ui.highlightEdit = false;
    hideToast();
    commit();
    act('import', sourceLabel + '을 불러와 목록을 교체함');
    showToast(sourceLabel + '을 불러왔습니다.');
    return true;
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  function exportJson() {
    var payload = backupPayload(true);
    var name = '출산가방-체크리스트-' + todayStamp() + '.json';
    var download = function () {
      var blob = new Blob([payload], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showToast('JSON 파일을 내보냈습니다.');
    };
    // 홈 화면 웹앱(특히 아이폰)은 파일 다운로드가 막히는 경우가 있어 공유 시트('파일에 저장')를 먼저 시도한다.
    if (isStandalone() && navigator.share && navigator.canShare && typeof File === 'function') {
      try {
        var file = new File([payload], name, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name }).then(function () { showToast('백업 파일을 내보냈습니다.'); }, function (e) {
            if (e && e.name === 'AbortError') return; // 사용자가 취소
            download();
          });
          return;
        }
      } catch (e) { /* fall back to download */ }
    }
    download();
  }

  function importJsonFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { showToast('파일을 읽지 못했습니다. 기존 기록은 그대로 유지됩니다.'); };
    reader.onload = function () { importJsonText(String(reader.result), '백업 파일'); };
    reader.readAsText(file);
  }

  /* ---------- 가족 공유 (sync.js 연동) ---------- */
  var pendingRemote = null;

  function isTyping() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if (el.readOnly || el.disabled) return false; // readonly share-link etc. must not block sync
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.type === 'button') return false;
    // Only editable fields inside an item/note/highlights editor should defer a remote update.
    return !!el.closest('.item--edit, .is-qty-editing, .note-form, #highlights-form, #add-category-form, .pick-form, .date-form, .name-form, .support-form, .memo-item, #view-settings');
  }

  function applyRemote(remoteState) {
    var result = normalizeState(remoteState);
    if (!result.ok) return false;
    if (JSON.stringify(result.data) === JSON.stringify(state)) return false;
    if (isTyping()) { pendingRemote = remoteState; return false; } // apply after the field is left
    pendingRemote = null;
    applyingRemote = true;
    try {
      state = result.data;
      // keep UI editors pointing at things that still exist
      if (ui.itemEdit && !findItem(ui.itemEdit)) ui.itemEdit = null;
      if (ui.qtyEdit && !findItem(ui.qtyEdit)) ui.qtyEdit = null;
      if (ui.noteForm && ui.noteForm !== 'new') {
        var still = state.notes.some(function (n) { return n.id === ui.noteForm; });
        if (!still) ui.noteForm = null;
      }
      saveState({ remote: true });
      render();
    } finally {
      applyingRemote = false;
    }
    // 방 참여 직후에는 구독(attach)이 applyRemote 뒤에 붙으므로, 비우기(=변경 전파)는 한 틱 뒤에 실행한다.
    setTimeout(clearTemplateItemsOnce, 0);
    return true;
  }

  document.addEventListener('focusout', function () {
    if (!pendingRemote) return;
    setTimeout(function () { if (pendingRemote && !isTyping()) applyRemote(pendingRemote); }, 0);
  });

  window.ChecklistApp = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    normalize: function (raw) { var r = normalizeState(raw); return r.ok ? r.data : null; },
    isPristine: function () { return !touched; },
    applyRemote: applyRemote,
    onChange: function (cb) { changeListeners.push(cb); },
    getDeviceName: myName,
    setActivity: setActivity
  };

  function syncStatusText(st) {
    switch (st.status) {
      case 'unconfigured': return '';
      case 'off': return '';
      case 'connecting': return '연결 중…';
      case 'online': return '가족 공유 중';
      case 'offline': return '오프라인 (연결되면 동기화)';
      case 'error': return '동기화 오류';
      default: return '';
    }
  }

  function renderSharePanel() {
    var panel = $('#share-panel');
    var body = $('#share-body');
    var badge = $('#sync-status');
    var S = window.ChecklistSync;
    var st = S ? S.getState() : { configured: false, status: 'unconfigured', roomId: null, link: '' };
    var pillText = syncStatusText(st);
    if (!pillText) pillText = st.configured ? '공유 연결하기' : '기기 저장';
    badge.textContent = pillText;
    badge.className = 'sync-pill' + (st.status === 'online' ? ' is-online' : st.status === 'error' ? ' is-error' : st.status === 'offline' ? ' is-offline' : st.configured ? ' is-off' : ' is-local');
    badge.hidden = false;
    renderHome();
    renderActivity();
    var html = '';
    if (!st.configured) {
      html += '<p class="share__text">가족 공유를 쓰려면 사이트에 Firebase 설정이 필요합니다. 아직 설정되어 있지 않아 기록은 이 기기에만 저장됩니다.</p>';
      html += '<p class="share__text">설정 방법은 README의 ‘가족 공유(동기화) 설정’을 참고하세요.</p>';
    } else if (st.roomId) {
      html += '<p class="share__text">이 기기는 아래 링크와 연결되어 있습니다. 같은 링크를 연 기기끼리 체크리스트·진료 메모·꼭 기억하기가 실시간으로 함께 바뀝니다.</p>';
      html += '<div class="share__linkrow"><label class="visually-hidden" for="share-link">공유 링크</label><input type="text" id="share-link" readonly value="' + escapeHtml(st.link) + '"><button type="button" class="btn btn--small" data-action="copy-link">링크 복사</button></div>';
      html += '<div class="share__linkrow"><label class="visually-hidden" for="share-code">공유 코드</label><input type="text" id="share-code" readonly value="' + escapeHtml(st.roomId) + '"><button type="button" class="btn btn--small" data-action="copy-code">코드 복사</button></div>';
      html += '<p class="share__text share__text--muted">📱 홈 화면에 추가한 웹앱은 카톡 링크를 눌러도 연결되지 않습니다(아이폰은 링크를 사파리에서 엽니다). 웹앱을 연 뒤 설정 → 가족 공유에 위 코드를 붙여넣고 ‘참여’를 누르세요.</p>';
      html += '<p class="share__status">상태: ' + escapeHtml(syncStatusText(st) || '대기') + (st.detail ? ' · ' + escapeHtml(st.detail) : '') + (st.lastSyncedAt ? ' · 마지막 동기화 ' + escapeHtml(timeStampOf(st.lastSyncedAt)) : '') + '</p>';
      html += '<p class="share__text share__text--muted">링크를 아는 사람은 누구나 볼 수 있으니 가족에게만 보내세요. 카카오톡 등으로 보내고 받은 기기에서 링크를 열면 바로 연결됩니다.</p>';
      html += '<div class="note-form__actions"><button type="button" class="btn btn--small btn--danger" data-action="leave-room">이 기기에서 공유 끊기</button></div>';
    } else {
      html += '<p class="share__text">공유 링크를 만들면 지금 이 기기의 목록이 서버에 올라가고, 그 링크를 연 다른 기기와 실시간으로 함께 바뀝니다. 로그인은 필요 없습니다.</p>';
      html += '<div class="note-form__actions"><button type="button" class="btn btn--primary btn--small" data-action="create-room">공유 링크 만들기</button></div>';
      html += '<p class="share__text" style="margin-top:10px">이미 받은 링크나 코드가 있다면 여기에 붙여넣으세요.</p>';
      html += '<form class="share__linkrow" data-action="join-room"><label class="visually-hidden" for="join-link">받은 공유 링크 또는 코드</label><input type="text" id="join-link" placeholder="공유 링크 또는 코드 붙여넣기" autocomplete="off" autocapitalize="off" autocorrect="off"><button type="submit" class="btn btn--small">참여</button></form>';
      html += '<p class="share__text share__text--muted">홈 화면 웹앱에서는 카톡 링크를 눌러도 연결되지 않으니, 링크(또는 코드)를 복사해 여기에 붙여넣고 참여하세요.</p>';
      if (st.status === 'error' && st.detail) html += '<p class="field-error">' + escapeHtml(st.detail) + '</p>';
      if (st.status === 'connecting') html += '<p class="share__status">연결 중…</p>';
    }
    body.innerHTML = html;
  }

  function timeStampOf(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function openSharePanel() {
    setView('settings');
    renderSharePanel();
    var panel = $('#share-panel');
    if (panel) {
      panel.scrollIntoView({ block: 'start' });
      var first = panel.querySelector('button[data-action], input');
      if (first) first.focus({ preventScroll: true });
    }
  }
  function closeMenu() { var m = $('#backup-menu'); if (m) m.open = false; }

  function bindShareEvents() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-action="open-share"], [data-action="open-settings"], [data-action="open-supports"], [data-action="go-home"]');
      if (!t) return;
      closeMenu();
      var a = t.dataset.action;
      if (a === 'open-share') openSharePanel();
      else if (a === 'open-settings') setView('settings');
      else if (a === 'open-supports') setView('supports');
      else if (a === 'go-home') setView('home');
    });
    $('#share-panel').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn || btn.tagName !== 'BUTTON') return;
      var S = window.ChecklistSync;
      switch (btn.dataset.action) {
        case 'create-room':
          ensureDeviceName();
          S.createRoom().then(function () { showToast('공유 링크를 만들었습니다. 링크를 복사해 가족에게 보내세요.'); }, function () { /* status shows the error */ });
          break;
        case 'copy-link':
        case 'copy-code': {
          var isCode = btn.dataset.action === 'copy-code';
          var linkEl = $(isCode ? '#share-code' : '#share-link');
          var text = linkEl.value;
          var done = function () { showToast(isCode ? '공유 코드를 복사했습니다. 웹앱의 설정 → 가족 공유에 붙여넣으세요.' : '공유 링크를 복사했습니다.'); };
          var fail = function () { linkEl.focus(); linkEl.select(); showToast('자동 복사가 막혀 있습니다. 직접 선택해 복사하세요.'); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail();
          break;
        }
        case 'leave-room':
          if (window.confirm('이 기기에서 공유를 끊을까요? 서버의 목록은 그대로 남고, 이 기기는 지금 내용을 따로 저장합니다.')) {
            S.leaveRoom();
            showToast('공유를 끊었습니다. 이 기기 기록은 그대로 유지됩니다.');
          }
          break;
      }
    });
    $('#share-panel').addEventListener('submit', function (e) {
      var form = e.target.closest('form[data-action="join-room"]');
      if (!form) return;
      e.preventDefault();
      var S = window.ChecklistSync;
      var id = S.extractRoomId($('#join-link').value);
      if (!id) { showToast('올바른 공유 링크나 코드가 아닙니다.'); return; }
      ensureDeviceName();
      S.joinRoom(id).then(function (joined) {
        if (joined) showToast('공유 링크에 참여했습니다.');
      }, function () { /* status shows the error */ });
    });
    if (window.ChecklistSync) window.ChecklistSync.onStatus(function () { renderSharePanel(); });
    renderSharePanel();

    var ptabs = $('#primary-tabs');
    if (ptabs) {
      ptabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.primary-tab');
        if (btn) setView(btn.dataset.view);
      });
      ptabs.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        setView(ui.view === 'checklist' ? 'notes' : 'checklist');
        var active = ptabs.querySelector('.primary-tab.is-active');
        if (active) active.focus();
      });
    }
  }

  /* ---------- event wiring ---------- */
  function goHome() {
    ui.view = 'checklist';
    if (state.categories.length) ui.activeCategory = state.categories[0].id;
    ui.filter = 'all';
    ui.editMode = false;
    ui.qtyEdit = null;
    ui.itemEdit = null;
    ui.picksEdit = null;
    ui.search = '';
    var homeSearch = $('#item-search'); if (homeSearch) homeSearch.value = '';
    var homeClear = $('#search-clear'); if (homeClear) homeClear.hidden = true;
    ui.noteForm = null;
    ui.highlightEdit = false;
    var fsel = $('#filter-select'); if (fsel) fsel.value = 'all';
    var addForm = $('#add-category-form'); if (addForm) addForm.hidden = true;
    var paste = $('#paste-import'); if (paste) paste.hidden = true;
    closeMenu();
    saveUiPrefs();
    render();
    window.scrollTo(0, 0);
  }

  function bindEvents() {
    $('#filter-group').addEventListener('change', function (e) {
      if (e.target.name === 'filter') { ui.filter = e.target.value; render(); }
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-edit-toggle]'), function (b) {
      b.addEventListener('click', function () {
        ui.editMode = !ui.editMode;
        ui.qtyEdit = null;
        ui.itemEdit = null;
        if (ui.editMode) { ui.search = ''; var si = $('#item-search'); if (si) si.value = ''; var sc = $('#search-clear'); if (sc) sc.hidden = true; }
        render();
      });
    });

    function openAddCategory(toggle) {
      var form = $('#add-category-form');
      form.hidden = toggle ? !form.hidden : false;
      if (!form.hidden) {
        $('#paste-import').hidden = true;
        $('#new-category-name').focus();
        form.scrollIntoView({ block: 'nearest' });
      }
    }
    var addCatBtn = $('#add-category-btn');
    if (addCatBtn) addCatBtn.addEventListener('click', function () { openAddCategory(true); });
    $('#category-tabs').addEventListener('click', function (e) {
      if (e.target.closest('[data-action="add-category-tab"]')) openAddCategory(false);
    });
    $('#add-category-cancel').addEventListener('click', function () {
      $('#add-category-form').hidden = true;
      $('#new-category-name').value = '';
      var back = $('#add-category-btn') || $('.category-tab--add'); if (back) back.focus();
    });
    $('#add-category-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#new-category-name');
      if (addCategory(input.value)) {
        input.value = '';
        $('#add-category-form').hidden = true;
        var back2 = $('#add-category-btn') || $('.category-tab--add'); if (back2) back2.focus();
      }
    });

    $('#export-btn').addEventListener('click', function () { closeMenu(); exportJson(); });
    $('#import-btn').addEventListener('click', function () { closeMenu(); $('#import-file').click(); });
    var searchToggle = $('#search-toggle');
    if (searchToggle) {
      searchToggle.addEventListener('click', function () {
        ui.searchOpen = !ui.searchOpen;
        if (!ui.searchOpen) { ui.search = ''; var si0 = $('#item-search'); if (si0) si0.value = ''; var sc0 = $('#search-clear'); if (sc0) sc0.hidden = true; }
        render();
        if (ui.searchOpen) { var si1 = $('#item-search'); if (si1) si1.focus(); }
      });
    }
    var homeView = $('#view-home');
    if (homeView) {
      homeView.addEventListener('click', function (e) {
        var b = e.target.closest('[data-action]');
        if (!b) return;
        switch (b.dataset.action) {
          case 'go-checklist': setView('checklist'); break;
          case 'go-category': ui.activeCategory = b.dataset.categoryId; setView('checklist'); break;
        }
      });
    }
    var strip = $('#highlights-strip');
    if (strip) strip.addEventListener('click', function () { ui.stripOpen = !ui.stripOpen; renderHighlightsStrip(); });

    // 메모: 목록형. 입력 중 자동 저장(0.6초), 벗어날 때 변경 기록
    var memosView = $('#view-memos');
    if (memosView) {
      memosView.addEventListener('input', function (e) {
        var ta = e.target.closest('.memo-item__text'); if (!ta) return;
        var id = ta.closest('[data-memo-id]').dataset.memoId;
        var tEl = ta.closest('.memo-item').querySelector('[data-memo-time]'); if (tEl) tEl.textContent = '입력 중…';
        clearTimeout(memoTimers[id]); memoTimers[id] = setTimeout(function () { saveMemoText(id, ta.value, false); }, 600);
      });
      memosView.addEventListener('focusout', function (e) {
        var ta = e.target.closest('.memo-item__text'); if (!ta) return;
        var id = ta.closest('[data-memo-id]').dataset.memoId;
        clearTimeout(memoTimers[id]); saveMemoText(id, ta.value, true);
      });
      // 앱 전환·화면 끔·탭 닫기: 0.6초 대기 중인 메모를 바로 저장한다(홈 화면 웹앱에서 blur가 오지 않는 경우 대비)
      var flushMemoTimers = function () {
        Object.keys(memoTimers).forEach(function (id) {
          if (!memoTimers[id]) return;
          clearTimeout(memoTimers[id]); memoTimers[id] = null;
          var ta = document.querySelector('.memo-item[data-memo-id="' + id + '"] .memo-item__text');
          if (ta) saveMemoText(id, ta.value, false);
        });
      };
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushMemoTimers(); });
      window.addEventListener('pagehide', flushMemoTimers);
      memosView.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-action]'); if (!b) return;
        if (b.dataset.action === 'new-memo') { newMemo(); return; }
        if (b.dataset.action === 'delete-memo') { deleteMemo(b.closest('[data-memo-id]').dataset.memoId); }
      });
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-action="open-memos"], [data-action="new-memo-home"], [data-action="open-memo"]');
      if (!t) return;
      if (t.dataset.action === 'new-memo-home') { newMemo(); return; }
      if (t.dataset.action === 'open-memo') { ui.memoFocus = t.dataset.memoId; }
      setView('memos');
    });
    var actClear = $('#activity-clear');
    if (actClear) actClear.addEventListener('click', function () { markActivitySeen(true); ui.seenBase = ui.lastSeenActivity; renderActivity(); });

    // 설정
    var dnInput = $('#device-name');
    if (dnInput) dnInput.addEventListener('change', function () { ui.deviceName = dnInput.value.trim().slice(0, 12); saveUiPrefs(); renderActivity(); renderPrimaryTabs(); showToast('이름을 저장했습니다.'); });
    var ddInput = $('#due-date');
    if (ddInput) ddInput.addEventListener('change', function () {
      var v = ddInput.value; if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) v = '';
      if (v === (state.dueDate || '')) return;
      state.dueDate = v; commit(); act('due', v ? '출산 예정일을 ' + formatNoteDate(v) + '로 설정' : '출산 예정일 지움');
      showToast(v ? '출산 예정일을 저장했습니다. ' + ddayText(v) : '출산 예정일을 지웠습니다.');
    });
    var trInput = $('#toast-remote');
    if (trInput) trInput.addEventListener('change', function () { ui.toastRemote = trInput.checked; saveUiPrefs(); });

    // 정부 지원
    var supView = $('#view-supports');
    if (supView) {
      supView.addEventListener('click', function (e) {
        var add = e.target.closest('#add-support-btn');
        if (add) { ui.supportEdit = 'new'; renderSupports(); var f = document.querySelector('[data-focus-key="sp-title:new"]'); if (f) f.focus(); return; }
        var btn = e.target.closest('button[data-action]'); if (!btn) return;
        var li = btn.closest('[data-support-id]');
        switch (btn.dataset.action) {
          case 'edit-support': ui.supportEdit = li.dataset.supportId; renderSupports(); var ff = document.querySelector('[data-focus-key="sp-title:' + li.dataset.supportId + '"]'); if (ff) ff.focus(); break;
          case 'cancel-support': ui.supportEdit = null; renderSupports(); var back = li ? document.querySelector('[data-focus-key="sp-edit:' + li.dataset.supportId + '"]') : $('#add-support-btn'); if (back) back.focus(); break;
          case 'delete-support': deleteSupport(li.dataset.supportId); break;
        }
      });
      supView.addEventListener('submit', function (e) {
        var form = e.target.closest('form[data-support-form]'); if (!form) return;
        e.preventDefault(); submitSupportForm(form);
      });
      supView.addEventListener('change', function (e) {
        var sel = e.target.closest('select[data-action="quick-status"]'); if (!sel) return;
        var li = sel.closest('[data-support-id]'); var sp = findSupport(li.dataset.supportId); if (!sp) return;
        if (SUPPORT_STATUS.indexOf(sel.value) === -1) return;
        sp.status = sel.value; commit(); act('support', '지원 항목 ‘' + sp.title + '’ 상태 → ' + SUPPORT_STATUS_LABEL[sp.status]);
      });
    }
    var searchInput = $('#item-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () { ui.search = searchInput.value; renderCategories(); $('#search-clear').hidden = !ui.search; });
      var clearBtn = $('#search-clear');
      if (clearBtn) clearBtn.addEventListener('click', function () { ui.search = ''; searchInput.value = ''; clearBtn.hidden = true; searchInput.focus(); renderCategories(); });
    }
    var clearItemsBtn = $('#clear-items-btn');
    if (clearItemsBtn) clearItemsBtn.addEventListener('click', function () { clearAllItems(false); });
    var clearItemsBtn2 = $('#clear-items-btn-2');
    if (clearItemsBtn2) clearItemsBtn2.addEventListener('click', function () { clearAllItems(false); });
    var clearCatBtn = $('#clear-category-btn');
    if (clearCatBtn) clearCatBtn.addEventListener('click', function () { var cid = activeCategoryId(); if (cid) clearCategoryItems(cid); });
    var resetBtn = $('#reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', function () { closeMenu(); resetToDefault(); });
    $('#copy-text-btn').addEventListener('click', function () { closeMenu(); copyBackupText(); });
    $('#paste-text-btn').addEventListener('click', function () {
      closeMenu();
      $('#add-category-form').hidden = true;
      var panel = $('#paste-import');
      panel.hidden = false;
      $('#paste-import-text').value = '';
      $('#paste-import-text').focus();
      panel.scrollIntoView({ block: 'nearest' });
    });
    $('#paste-import-cancel').addEventListener('click', function () {
      $('#paste-import').hidden = true;
      $('#paste-import-text').value = '';
      var pb = $('#paste-text-btn'); if (pb) pb.focus();
    });
    $('#paste-import').addEventListener('submit', function (e) {
      e.preventDefault();
      var text = $('#paste-import-text').value;
      if (!text.trim()) { showToast('붙여넣은 내용이 없습니다.'); return; }
      if (importJsonText(text, '백업 텍스트')) {
        $('#paste-import').hidden = true;
        $('#paste-import-text').value = '';
      }
    });
    $('#import-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      importJsonFile(file);
      e.target.value = '';
    });
    document.addEventListener('click', function (e) {
      var menu = $('#backup-menu');
      if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
    });

    $('#toast-undo').addEventListener('click', function () {
      var fn = ui.pendingUndo;
      hideToast();
      if (fn) fn();
    });
    $('#toast-close').addEventListener('click', hideToast);

    $('#category-tabs').addEventListener('click', function (e) {
      var tab = e.target.closest('[data-action="select-tab"]');
      if (!tab) return;
      setActiveCategory(tab.dataset.categoryId);
      var again = document.querySelector('[data-focus-key="tab:' + tab.dataset.categoryId + '"]');
      if (again) again.focus();
    });
    $('#category-tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var tabs = Array.prototype.slice.call(document.querySelectorAll('#category-tabs [role="tab"]'));
      var idx = tabs.indexOf(document.activeElement);
      if (idx < 0) return;
      e.preventDefault();
      var next = tabs[(idx + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setActiveCategory(next.dataset.categoryId);
      var again = document.querySelector('[data-focus-key="tab:' + next.dataset.categoryId + '"]');
      if (again) again.focus();
    });

    $('#highlights-toggle').addEventListener('click', toggleHighlightsCollapsed);

    $('#highlights-edit-btn').addEventListener('click', function () {
      if (ui.highlightsCollapsed) { ui.highlightsCollapsed = false; saveUiPrefs(); }
      ui.highlightEdit = true;
      renderHighlights();
      var ta = $('#highlights-input');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    });
    $('#highlights').addEventListener('submit', function (e) {
      if (e.target.id !== 'highlights-form') return;
      e.preventDefault();
      saveHighlights($('#highlights-input').value);
    });
    $('#highlights').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="cancel-highlights"]');
      if (!btn) return;
      ui.highlightEdit = false;
      renderHighlights();
      $('#highlights-edit-btn').focus();
    });
    $('#highlights').addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && e.target.id === 'highlights-input') {
        ui.highlightEdit = false;
        renderHighlights();
        $('#highlights-edit-btn').focus();
      }
    });

    var notesRoot = $('#view-notes');
    $('#add-note-btn').addEventListener('click', function () {
      ui.noteForm = 'new';
      renderNotes();
      var ta = document.querySelector('[data-focus-key="note-body:new"]');
      if (ta) ta.focus();
    });
    notesRoot.addEventListener('submit', function (e) {
      var form = e.target.closest('form[data-note-form]');
      if (!form) return;
      e.preventDefault();
      submitNoteForm(form);
    });
    notesRoot.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var li = btn.closest('[data-note-id]');
      switch (btn.dataset.action) {
        case 'cancel-note':
          ui.noteForm = null;
          renderNotes();
          var back = li ? document.querySelector('[data-focus-key="note-edit:' + li.dataset.noteId + '"]') : $('#add-note-btn');
          if (back) back.focus();
          break;
        case 'edit-note': ui.noteForm = li.dataset.noteId; renderNotes(); var ta = document.querySelector('[data-focus-key="note-body:' + li.dataset.noteId + '"]'); if (ta) ta.focus(); break;
        case 'delete-note': deleteNote(li.dataset.noteId); break;
      }
    });

    var picksRoot = $('#view-picks');
    if (picksRoot) {
      picksRoot.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        if (!e.target.closest('[data-action="pick-subtab"]')) return;
        e.preventDefault();
        setActivePick(activePickKey() === 'gpt' ? 'claude' : 'gpt');
        var again = document.querySelector('[data-focus-key="picktab:' + activePickKey() + '"]');
        if (again) again.focus();
      });
      picksRoot.addEventListener('click', function (e) {
        var subtab = e.target.closest('[data-action="pick-subtab"]');
        if (subtab) {
          setActivePick(subtab.dataset.pickKey);
          var again = document.querySelector('[data-focus-key="picktab:' + subtab.dataset.pickKey + '"]');
          if (again) again.focus();
          return;
        }
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var card = btn.closest('[data-pick]');
        var key = card && card.dataset.pick;
        if (btn.dataset.action === 'edit-pick') {
          ui.picksActive = key;
          ui.picksEdit = key;
          renderPicks();
          var ta = document.querySelector('[data-focus-key="pick-input:' + key + '"]');
          if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        } else if (btn.dataset.action === 'cancel-pick') {
          ui.picksEdit = null;
          renderPicks();
          var eb = document.querySelector('[data-pick="' + key + '"] [data-action="edit-pick"]');
          if (eb) eb.focus();
        }
      });
      picksRoot.addEventListener('submit', function (e) {
        var form = e.target.closest('form[data-pick-form]');
        if (!form) return;
        e.preventDefault();
        savePick(form.dataset.pickForm, form.querySelector('textarea').value);
      });
    }

    // 택일 후보 (view-picks) events
    var picksView = $('#view-picks');
    if (picksView) {
      picksView.addEventListener('click', function (e) {
        var add = e.target.closest('#add-date-btn');
        if (add) { ui.dateEdit = 'new'; renderDates(); var f = document.querySelector('[data-focus-key="date-d:new"]'); if (f) f.focus(); return; }
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var li = btn.closest('[data-date-id]');
        switch (btn.dataset.action) {
          case 'edit-date': ui.dateEdit = li.dataset.dateId; renderDates(); var ff = document.querySelector('[data-focus-key="date-d:' + li.dataset.dateId + '"]'); if (ff) ff.focus(); break;
          case 'cancel-date': var wasNew = !li; ui.dateEdit = null; renderDates(); var back = wasNew ? $('#add-date-btn') : document.querySelector('[data-focus-key="date-edit:' + li.dataset.dateId + '"]'); if (back) back.focus(); break;
          case 'delete-date': deleteDate(li.dataset.dateId); break;
        }
      });
      picksView.addEventListener('submit', function (e) {
        var form = e.target.closest('form[data-date-form]');
        if (!form) return;
        e.preventDefault();
        submitDateForm(form);
      });
    }

    // 작명 노트 (view-names) events
    var namesView = $('#view-names');
    if (namesView) {
      namesView.addEventListener('click', function (e) {
        var add = e.target.closest('#add-name-btn');
        if (add) { ui.nameEdit = 'new'; renderNames(); var f = document.querySelector('[data-focus-key="name-n:new"]'); if (f) f.focus(); return; }
        var addHanja = e.target.closest('[data-action="add-hanja"]');
        if (addHanja) {
          var rows = addHanja.closest('.name-form').querySelector('[data-hanja-rows]');
          var div = document.createElement('div');
          div.innerHTML = hanjaRowHtml(null);
          rows.appendChild(div.firstChild);
          var last = rows.querySelector('.hanja-row:last-child .hanja-row__chars');
          if (last) last.focus();
          return;
        }
        var rm = e.target.closest('[data-action="remove-hanja"]');
        if (rm) {
          var row = rm.closest('.hanja-row');
          var cont = row.parentNode;
          if (cont.querySelectorAll('.hanja-row').length > 1) row.remove();
          else { row.querySelector('.hanja-row__chars').value = ''; row.querySelector('.hanja-row__meaning').value = ''; }
          return;
        }
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var li = btn.closest('[data-name-id]');
        switch (btn.dataset.action) {
          case 'toggle-fav': toggleNameFav(li.dataset.nameId); break;
          case 'edit-name': ui.nameEdit = li.dataset.nameId; renderNames(); var nf = document.querySelector('[data-focus-key="name-n:' + li.dataset.nameId + '"]'); if (nf) nf.focus(); break;
          case 'cancel-name': var wasNew2 = !li; ui.nameEdit = null; renderNames(); var back2 = wasNew2 ? $('#add-name-btn') : document.querySelector('[data-focus-key="name-edit:' + li.dataset.nameId + '"]'); if (back2) back2.focus(); break;
          case 'delete-name': deleteName(li.dataset.nameId); break;
        }
      });
      namesView.addEventListener('submit', function (e) {
        var form = e.target.closest('form[data-name-form]');
        if (!form) return;
        e.preventDefault();
        submitNameForm(form);
      });
    }

    var root = $('#categories');

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn || btn.tagName !== 'BUTTON') return;
      var card = btn.closest('[data-category-id]');
      var row = btn.closest('[data-item-id]');
      switch (btn.dataset.action) {
        case 'delete-category': deleteCategory(card.dataset.categoryId); break;
        case 'sort-items': {
          var scid = card.dataset.categoryId;
          setSortMode(scid, btn.dataset.sort);
          renderCategories();
          var sb = document.querySelector('[data-focus-key="sort:' + scid + ':' + sortModeOf(scid) + '"]');
          if (sb) sb.focus();
          break;
        }
        case 'bulk-toggle': {
          var bcid = card.dataset.categoryId;
          ui.bulkOpen = ui.bulkOpen === bcid ? null : bcid;
          render();
          var bt = document.querySelector('[data-focus-key="' + (ui.bulkOpen ? 'bulk-text:' : 'bulk-toggle:') + bcid + '"]');
          if (bt) bt.focus();
          break;
        }
        case 'cat-up': moveCategoryDir(card.dataset.categoryId, -1); break;
        case 'cat-down': moveCategoryDir(card.dataset.categoryId, 1); break;
        case 'toggle-collapse': toggleCollapsed(card.dataset.categoryId); break;
        case 'pick-icon': setCategoryIcon(card.dataset.categoryId, btn.dataset.icon || ''); break;
        case 'delete-item': deleteItem(row.dataset.itemId); break;
        case 'item-up': { var uid_ = row.dataset.itemId; moveItemDir(uid_, -1); var fu = document.querySelector('[data-focus-key="iup:' + uid_ + '"]'); if (fu && !fu.disabled) fu.focus(); else { var du = document.querySelector('[data-focus-key="idown:' + uid_ + '"]'); if (du) du.focus(); } break; }
        case 'item-down': { var did_ = row.dataset.itemId; moveItemDir(did_, 1); var fd = document.querySelector('[data-focus-key="idown:' + did_ + '"]'); if (fd && !fd.disabled) fd.focus(); else { var uu = document.querySelector('[data-focus-key="iup:' + did_ + '"]'); if (uu) uu.focus(); } break; }
        case 'toggle-excluded': toggleExcluded(row.dataset.itemId); break;
        case 'open-item-edit': {
          var oid = row.dataset.itemId;
          ui.itemEdit = oid;
          render();
          var nameInput = document.querySelector('[data-focus-key="name:' + oid + '"]');
          if (nameInput) nameInput.focus();
          break;
        }
        case 'close-item-edit': {
          var ccid = row.dataset.itemId;
          ui.itemEdit = null;
          render();
          var editBtn = document.querySelector('[data-focus-key="iedit:' + ccid + '"]');
          if (editBtn) editBtn.focus();
          break;
        }
        case 'edit-qty': {
          var iid = row.dataset.itemId;
          ui.qtyEdit = ui.qtyEdit === iid ? null : iid;
          render();
          var target = document.querySelector('[data-focus-key="' + (ui.qtyEdit ? 'q-qty:' : 'qty-btn:') + iid + '"]');
          if (target) { target.focus(); if (ui.qtyEdit && target.select) target.select(); }
          break;
        }
        case 'close-qty': {
          var cid2 = row.dataset.itemId;
          ui.qtyEdit = null;
          render();
          var back = document.querySelector('[data-focus-key="qty-btn:' + cid2 + '"]');
          if (back) back.focus();
          break;
        }
      }
    });

    root.addEventListener('submit', function (e) {
      var bulk = e.target.closest('form[data-action="bulk-add"]');
      if (bulk) {
        e.preventDefault();
        var bcard = bulk.closest('[data-category-id]');
        var n = addItems(bcard.dataset.categoryId, $('textarea', bulk).value);
        if (n) {
          ui.bulkOpen = null; render();
          showToast('준비물 ' + n + '개를 추가했습니다.');
          var qi = document.querySelector('[data-focus-key="new-item:' + bcard.dataset.categoryId + '"]');
          if (qi) qi.focus();
        }
        return;
      }
      var form = e.target.closest('form[data-action="add-item"]');
      if (!form) return;
      e.preventDefault();
      var card = form.closest('[data-category-id]');
      var input = $('input[type="text"]', form);
      if (addItem(card.dataset.categoryId, input.value)) {
        var again = document.querySelector('[data-focus-key="new-item:' + card.dataset.categoryId + '"]');
        if (again) { again.value = ''; again.focus(); }
      }
    });
    // 여러 개 입력칸: Ctrl/⌘+Enter 로 바로 추가
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.closest('form[data-action="bulk-add"]')) {
        e.preventDefault();
        e.target.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });

    root.addEventListener('change', function (e) {
      var el = e.target;
      var row = el.closest('[data-item-id]');
      var card = el.closest('[data-category-id]');
      if (el.dataset.action === 'toggle-done') { toggleDone(row.dataset.itemId, el.checked); return; }
      if (el.dataset.action === 'move-item') { moveItem(row.dataset.itemId, el.value); return; }
      if (el.dataset.action === 'rename-category') { renameCategory(card.dataset.categoryId, el.value, el); return; }
      if (el.dataset.action === 'set-icon') { setCategoryIcon(card.dataset.categoryId, el.value); return; }
      if (el.dataset.field && row) { updateItemField(row.dataset.itemId, el.dataset.field, el, row); }
    });

    // 금액 칸: 입력하는 대로 쉼표를 넣는다 (5000 → 5,000)
    root.addEventListener('input', function (e) {
      if (e.target.matches('input[data-field="price"]')) formatPriceInput(e.target);
    });

    // Enter in an edit field should commit and not submit anything.
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('input[data-field], input[data-action="rename-category"], input[data-action="set-icon"]')) {
        e.preventDefault();
        e.target.blur();
        var qrow = e.target.closest('.is-qty-editing');
        if (qrow) {
          var doneBtn = $('[data-action="close-qty"]', qrow);
          if (doneBtn) doneBtn.click();
        }
      }
      if (e.key === 'Escape' && e.target.closest('.is-qty-editing')) {
        var esc = $('[data-action="close-qty"]', e.target.closest('.is-qty-editing'));
        if (esc) esc.click();
      }
    });
  }

  /* ---------- init ---------- */
  function init() {
    var loaded = loadState();
    state = loaded.state;
    loadUiPrefs();
    ui.seenBase = ui.lastSeenActivity;
    if (!uiPrefsFound) ui.view = 'home';
    if (ui.view === 'supports' || ui.view === 'memos') ui.view = 'home';
    bindEvents();
    if (loaded.fresh && storageOk) {
      saveState({ initial: true });
    } else if (!loaded.fresh) {
      touched = true;
      $('#save-status').textContent = '저장된 기록을 불러왔습니다';
    }
    render();
    var storedRoom = null;
    try { storedRoom = window.localStorage.getItem('birth-bag-checklist:room'); } catch (e) { /* ignore */ }
    if (!storedRoom && !/[?&]room=/.test(window.location.search)) clearTemplateItemsOnce();
    // sync.js is loaded after app.js; bind once it has had a chance to run.
    window.addEventListener('load', bindShareEvents);
  }

  /* ---------- 당겨서 새로고침 (홈 화면 웹앱 전용) ---------- */
  function setupPullToRefresh() {
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
    var forced = /[?&]ptr=1/.test(window.location.search);
    if (!standalone && !forced) return;
    var el = document.createElement('div');
    el.id = 'ptr'; el.className = 'ptr'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="ptr__icon">↓</span><span class="ptr__text">당겨서 새로고침</span>';
    document.body.appendChild(el);
    var startY = null, dist = 0, active = false, THRESH = 72;
    function reset() { active = false; dist = 0; startY = null; el.classList.remove('is-ready', 'is-visible', 'is-loading'); el.style.transform = ''; }
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || window.scrollY > 0 || isTyping()) return;
      startY = e.touches[0].clientY; active = true; dist = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!active) return;
      dist = e.touches[0].clientY - startY;
      if (dist <= 0 || window.scrollY > 0) { el.classList.remove('is-visible', 'is-ready'); return; }
      var d = Math.min(dist, 120);
      el.classList.add('is-visible');
      el.classList.toggle('is-ready', dist > THRESH);
      el.querySelector('.ptr__text').textContent = dist > THRESH ? '놓으면 새로고침' : '당겨서 새로고침';
      el.style.transform = 'translate(-50%, ' + (d * 0.5) + 'px)';
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (!active) return;
      if (dist > THRESH) {
        el.classList.add('is-loading'); el.querySelector('.ptr__text').textContent = '새로고침 중…';
        window.__ptrTriggered = true;
        if (!window.__ptrTest) setTimeout(function () { window.location.reload(); }, 150);
        else setTimeout(reset, 300);
        return;
      }
      reset();
    }, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); setupPullToRefresh(); });
  else { init(); setupPullToRefresh(); }
})();
