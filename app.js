/* 출산가방 체크리스트 - vanilla JS, localStorage only */
(function () {
  'use strict';

  var STORAGE_KEY = 'birth-bag-checklist';
  var UI_KEY = 'birth-bag-checklist:ui';
  var DATA_VERSION = 1;
  var UNIT_PRESETS = ['개', '벌', '팩', '장', '쌍', '세트'];
  var UNDO_MS = 8000;
  var ICON_PRESETS = ['👶', '🤱', '🧳', '🍼', '🧸', '🏥', '🎒', '🧴', '👕', '📄', '✨'];
  var ICON_MAX = 16; // UTF-16 code units; enough for one multi-codepoint emoji

  function defaultIconFor(name) {
    for (var i = 0; i < DEFAULT_TEMPLATE.length; i++) {
      if (DEFAULT_TEMPLATE[i].name === name) return DEFAULT_TEMPLATE[i].icon;
    }
    return '';
  }

  function cleanIcon(value) {
    return String(value == null ? '' : value).replace(/\s+/g, '').slice(0, ICON_MAX);
  }

  var DEFAULT_TEMPLATE = [
    { name: '아기 용품', icon: '👶', items: ['젖병', '젖꼭지', '젖병 세정 도구', '아기 손수건', '아기 배냇저고리', '속싸개', '겉싸개', '손싸개', '발싸개', '아기 모자', '아기 양말', '기저귀 발진 크림', '체온계', '바구니 카시트', '아기 세탁세제', '아기 물티슈', '아기 면봉', '아기 보습 제품', '아기 기저귀'] },
    { name: '산모 용품', icon: '🤱', items: ['산모 수첩', '신분증', '손목 보호대', '발목 보호대', '돌돌이 양말', '임산부 레깅스', '가디건', '압박 스타킹', '유축기', '유축기 깔때기', '초유 저장팩', '수유 패드', '수유 브라 또는 나시', '산모 패드', '산모 팬티', '입는 생리대', '생리대 오버나이트 또는 대형', '유두 보호 크림', '튼살 크림', '철분제 및 기타 영양제', '슬리퍼', '굽은 빨대', '텀블러 또는 종이컵', '비데 물티슈'] },
    { name: '기타', icon: '🧳', items: ['노트북', '충전기', '태블릿', '수건', '무형광 세탁망', '각티슈', '물티슈', '세면도구', '양치도구', '기초 화장품', '네임펜', '메모지', '가위', '여분 지퍼백', '머리끈 또는 머리띠', '손톱깎이', '멀티탭', '보호자 의류', '보호자 침구'] }
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
  function createDefaultState() {
    var categories = [];
    var items = [];
    DEFAULT_TEMPLATE.forEach(function (cat) {
      var cid = uid();
      categories.push({ id: cid, name: cat.name, icon: cat.icon });
      cat.items.forEach(function (name) {
        items.push({ id: uid(), categoryId: cid, name: name, qty: null, unit: '', memo: '', done: false, excluded: false });
      });
    });
    return { version: DATA_VERSION, categories: categories, items: items };
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
      else if (typeof c.icon === 'string') icon = cleanIcon(c.icon);
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
      var q = null;
      if (it.qty !== null && it.qty !== undefined && it.qty !== '') {
        var pq = parseQty(it.qty);
        if (!pq.ok) return { ok: false, error: '"' + iname + '" 항목의 수량이 올바르지 않습니다.' };
        q = pq.value;
      }
      items.push({
        id: iid,
        categoryId: it.categoryId,
        name: iname.slice(0, 60),
        qty: q,
        unit: typeof it.unit === 'string' ? it.unit.trim().slice(0, 10) : '',
        memo: typeof it.memo === 'string' ? it.memo.trim().slice(0, 200) : '',
        done: it.done === true,
        excluded: it.excluded === true
      });
    }
    return { ok: true, migrated: migrated, data: { version: DATA_VERSION, categories: categories, items: items } };
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

  function saveState() {
    var statusEl = $('#save-status');
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
      statusEl.textContent = '자동 저장됨 ' + timeStamp();
      statusEl.classList.remove('is-error');
      hideStorageWarning();
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
  var ui = { filter: 'all', editMode: false, pendingUndo: null, undoTimer: null, collapsed: {} };

  function loadUiPrefs() {
    try {
      var raw = window.localStorage.getItem(UI_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.collapsed && typeof parsed.collapsed === 'object') {
        ui.collapsed = parsed.collapsed;
      }
    } catch (e) { /* UI preferences are optional */ }
  }

  function saveUiPrefs() {
    try {
      var keep = {};
      state.categories.forEach(function (c) { if (ui.collapsed[c.id]) keep[c.id] = true; });
      ui.collapsed = keep;
      window.localStorage.setItem(UI_KEY, JSON.stringify({ collapsed: ui.collapsed }));
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
    var total = 0, done = 0, excluded = 0;
    items.forEach(function (it) {
      if (it.excluded) { excluded++; return; }
      total++;
      if (it.done) done++;
    });
    var percent = 0;
    if (total > 0) {
      percent = done === total ? 100 : Math.min(99, Math.floor((done / total) * 100));
    }
    return { total: total, done: done, excluded: excluded, percent: percent };
  }

  function progressText(p) {
    if (p.total === 0) {
      return p.excluded > 0 ? '준비 항목 없음 · 제외 ' + p.excluded + '개' : '준비 항목 없음';
    }
    var t = p.done + '/' + p.total + '개 완료 · ' + p.percent + '%';
    if (p.excluded > 0) t += ' · 제외 ' + p.excluded + '개';
    return t;
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
    if (catItems.length === 0) return '준비물이 없습니다. 아래에서 추가해 보세요.';
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

  function render() {
    var activeKey = focusKeyOf(document.activeElement);
    renderOverall();
    renderCategories();
    $('#edit-mode-toggle').setAttribute('aria-pressed', ui.editMode ? 'true' : 'false');
    $('#edit-mode-toggle').textContent = ui.editMode ? '편집 완료' : '편집 모드';
    if (activeKey) {
      var target = document.querySelector('[data-focus-key="' + activeKey + '"]');
      if (target) target.focus({ preventScroll: true });
    }
  }

  function renderOverall() {
    var p = computeProgress(state.items);
    $('#overall-progress-text').textContent = progressText(p);
    $('#overall-progress-fill').style.width = p.percent + '%';
    $('#overall-progress-bar').setAttribute('aria-valuenow', String(p.percent));
    $('#overall-progress-bar').setAttribute('aria-valuetext', progressText(p));
  }

  function refreshProgress() {
    renderOverall();
    state.categories.forEach(function (cat) {
      var card = document.querySelector('[data-category-id="' + cat.id + '"]');
      if (!card) return;
      var p = computeProgress(itemsOf(cat.id));
      $('.progress-text', card).textContent = progressText(p);
      $('.progress-bar__fill', card).style.width = p.percent + '%';
      $('.progress-bar', card).setAttribute('aria-valuenow', String(p.percent));
      $('.progress-bar', card).setAttribute('aria-valuetext', progressText(p));
    });
  }

  function renderCategories() {
    var root = $('#categories');
    if (state.categories.length === 0) {
      root.innerHTML = '<div class="empty-state"><p>분류가 없습니다.</p><p>상단의 <strong>분류 추가</strong> 버튼으로 다시 시작할 수 있어요.</p></div>';
      return;
    }
    root.innerHTML = state.categories.map(renderCategory).join('');
  }

  function renderCategory(cat) {
    var catItems = itemsOf(cat.id);
    var p = computeProgress(catItems);
    var visible = catItems.filter(matchesFilter);
    var titleId = 'cat-title-' + cat.id;
    var collapsed = !ui.editMode && !!ui.collapsed[cat.id];
    var bodyId = 'cat-body-' + cat.id;
    var html = '<section class="category' + (collapsed ? ' is-collapsed' : '') + '" data-category-id="' + escapeHtml(cat.id) + '" aria-labelledby="' + titleId + '">';
    html += '<div class="category__head">';
    if (ui.editMode) {
      html += '<label class="visually-hidden" for="cat-icon-' + escapeHtml(cat.id) + '">분류 아이콘</label>';
      html += '<input type="text" class="category__icon-input" id="cat-icon-' + escapeHtml(cat.id) + '" data-action="set-icon" data-focus-key="cat-icon:' + escapeHtml(cat.id) + '" value="' + escapeHtml(cat.icon || '') + '" maxlength="' + ICON_MAX + '" placeholder="아이콘" autocomplete="off">';
      html += '<label class="visually-hidden" for="cat-name-' + escapeHtml(cat.id) + '">분류 이름</label>';
      html += '<input type="text" class="category__title-input" id="cat-name-' + escapeHtml(cat.id) + '" data-action="rename-category" data-focus-key="cat-name:' + escapeHtml(cat.id) + '" value="' + escapeHtml(cat.name) + '" maxlength="40" aria-labelledby="' + titleId + '">';
      html += '<h2 id="' + titleId + '" class="visually-hidden">' + escapeHtml(cat.name) + '</h2>';
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

    html += '<div class="category__progress"><p class="progress-text">' + escapeHtml(progressText(p)) + '</p>';
    html += '<div class="progress-bar" role="progressbar" aria-label="' + escapeHtml(cat.name) + ' 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.percent + '" aria-valuetext="' + escapeHtml(progressText(p)) + '"><div class="progress-bar__fill" style="width:' + p.percent + '%"></div></div></div>';

    html += '<div class="category__body" id="' + bodyId + '"' + (collapsed ? ' hidden' : '') + '>';
    if (visible.length === 0) {
      html += '<p class="items-empty">' + escapeHtml(emptyMessage(catItems)) + '</p>';
    } else {
      html += '<ul class="items">' + visible.map(ui.editMode ? renderItemEdit : renderItemView).join('') + '</ul>';
    }

    html += '<form class="inline-form add-item-form" data-action="add-item">';
    html += '<label class="visually-hidden" for="new-item-' + escapeHtml(cat.id) + '">' + escapeHtml(cat.name) + '에 추가할 준비물 이름</label>';
    html += '<input type="text" id="new-item-' + escapeHtml(cat.id) + '" data-focus-key="new-item:' + escapeHtml(cat.id) + '" placeholder="준비물 이름" maxlength="60" autocomplete="off">';
    html += '<button type="submit" class="btn">추가</button>';
    html += '</form>';
    html += '</div>';
    html += '</section>';
    return html;
  }

  function renderItemView(it) {
    var cls = 'item' + (it.done ? ' is-done' : '') + (it.excluded ? ' is-excluded' : '');
    var meta = [];
    if (it.qty !== null) meta.push('수량 ' + it.qty + (it.unit ? it.unit : ''));
    else if (it.unit) meta.push('단위 ' + it.unit);
    var html = '<li class="' + cls + '" data-item-id="' + escapeHtml(it.id) + '">';
    html += '<div class="item__row">';
    html += '<label class="item__check">';
    html += '<input type="checkbox" data-action="toggle-done" data-focus-key="check:' + escapeHtml(it.id) + '"' + (it.done ? ' checked' : '') + (it.excluded ? ' disabled' : '') + ' aria-label="' + escapeHtml(it.name) + ' 가방에 담기 완료">';
    html += '<span class="item__body">';
    html += '<span class="item__name">' + escapeHtml(it.name) + '</span>';
    if (it.excluded) html += '<span class="badge badge--excluded">제외</span>';
    else if (it.done) html += '<span class="badge badge--done">완료</span>';
    if (meta.length) html += '<span class="item__meta">' + escapeHtml(meta.join(' · ')) + '</span>';
    if (it.memo) html += '<span class="item__memo">' + escapeHtml(it.memo) + '</span>';
    html += '</span></label>';
    if (it.excluded) {
      html += '<button type="button" class="btn btn--small" data-action="toggle-excluded" data-focus-key="excl:' + escapeHtml(it.id) + '" aria-label="' + escapeHtml(it.name) + ' 다시 포함">다시 포함</button>';
    }
    html += '</div></li>';
    return html;
  }

  function renderItemEdit(it) {
    var id = escapeHtml(it.id);
    var cls = 'item item--edit' + (it.done ? ' is-done' : '') + (it.excluded ? ' is-excluded' : '');
    var isCustom = it.unit && UNIT_PRESETS.indexOf(it.unit) === -1;
    var html = '<li class="' + cls + '" data-item-id="' + id + '">';
    html += '<div class="item__edit-grid">';

    html += '<div class="field"><label for="name-' + id + '">이름' + (it.excluded ? ' <span class="badge badge--excluded">제외됨</span>' : '') + (it.done && !it.excluded ? ' <span class="badge badge--done">완료</span>' : '') + '</label>';
    html += '<input type="text" id="name-' + id + '" data-field="name" data-focus-key="name:' + id + '" value="' + escapeHtml(it.name) + '" maxlength="60" required></div>';

    html += '<div class="field-row field-row--unit">';
    html += '<div class="field"><label for="qty-' + id + '">필요 수량</label>';
    html += '<input type="number" id="qty-' + id + '" data-field="qty" data-focus-key="qty:' + id + '" value="' + (it.qty === null ? '' : it.qty) + '" min="1" step="1" inputmode="numeric" placeholder="미입력"></div>';
    html += '<div class="field"><label for="unit-' + id + '">단위</label>';
    html += '<select id="unit-' + id + '" data-field="unit-select" data-focus-key="unit:' + id + '">';
    html += '<option value=""' + (!it.unit ? ' selected' : '') + '>선택 안 함</option>';
    UNIT_PRESETS.forEach(function (u) {
      html += '<option value="' + escapeHtml(u) + '"' + (it.unit === u ? ' selected' : '') + '>' + escapeHtml(u) + '</option>';
    });
    html += '<option value="__custom__"' + (isCustom ? ' selected' : '') + '>직접 입력</option>';
    html += '</select></div>';
    html += '</div>';

    html += '<div class="field"' + (isCustom ? '' : ' hidden') + ' data-custom-unit><label for="unit-custom-' + id + '">단위 직접 입력</label>';
    html += '<input type="text" id="unit-custom-' + id + '" data-field="unit-custom" data-focus-key="unitc:' + id + '" value="' + (isCustom ? escapeHtml(it.unit) : '') + '" maxlength="10" placeholder="예: 통, 병"></div>';

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
    html += '</div>';

    html += '</div></li>';
    return html;
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
    state.categories.push({ id: uid(), name: n.slice(0, 40), icon: '' });
    commit();
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
    cat.name = n.slice(0, 40);
    saveState();
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
    var card = document.querySelector('[data-category-id="' + id + '"]');
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
    showToast('‘' + cat.name + '’ 분류를 삭제했습니다.' + (catItems.length ? ' (준비물 ' + catItems.length + '개 포함)' : ''), function () {
      state.categories.splice(Math.min(index, state.categories.length), 0, cat);
      state.items = state.items.concat(catItems);
      commit();
      showToast('삭제를 취소했습니다.');
    });
  }

  function addItem(categoryId, name) {
    var n = String(name || '').trim();
    if (!n) { showToast('준비물 이름을 입력하세요.'); return false; }
    if (!findCategory(categoryId)) return false;
    state.items.push({ id: uid(), categoryId: categoryId, name: n.slice(0, 60), qty: null, unit: '', memo: '', done: false, excluded: false });
    commit();
    return true;
  }

  function deleteItem(id) {
    var it = findItem(id);
    if (!it) return;
    var index = state.items.indexOf(it);
    state.items.splice(index, 1);
    commit();
    showToast('‘' + it.name + '’ 항목을 삭제했습니다.', function () {
      if (!findCategory(it.categoryId)) {
        showToast('원래 분류가 없어 복구할 수 없습니다.');
        return;
      }
      state.items.splice(Math.min(index, state.items.length), 0, it);
      commit();
      showToast('삭제를 취소했습니다.');
    });
  }

  function toggleDone(id, checked) {
    var it = findItem(id);
    if (!it || it.excluded) return;
    it.done = !!checked;
    commit();
  }

  function toggleExcluded(id) {
    var it = findItem(id);
    if (!it) return;
    it.excluded = !it.excluded;
    commit();
    showToast(it.excluded ? '‘' + it.name + '’ 항목을 준비 대상에서 제외했습니다.' : '‘' + it.name + '’ 항목을 다시 포함했습니다.');
  }

  function moveItem(id, categoryId) {
    var it = findItem(id);
    if (!it || !findCategory(categoryId) || it.categoryId === categoryId) return;
    it.categoryId = categoryId;
    commit();
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
      case 'qty': {
        var pq = parseQty(inputEl.value);
        if (!pq.ok) { inputEl.value = it.qty === null ? '' : it.qty; setError('수량은 비워두거나 1 이상의 정수만 입력할 수 있습니다.'); return; }
        it.qty = pq.value;
        inputEl.value = pq.value === null ? '' : pq.value;
        setError('');
        break;
      }
      case 'unit-select': {
        var customWrap = $('[data-custom-unit]', rowEl);
        var customInput = $('[data-field="unit-custom"]', rowEl);
        if (inputEl.value === '__custom__') {
          customWrap.hidden = false;
          it.unit = customInput.value.trim().slice(0, 10);
          customInput.focus();
        } else {
          customWrap.hidden = true;
          it.unit = inputEl.value;
        }
        break;
      }
      case 'unit-custom':
        it.unit = inputEl.value.trim().slice(0, 10);
        break;
      case 'memo':
        it.memo = inputEl.value.trim().slice(0, 200);
        break;
      default:
        return;
    }
    saveState();
    refreshProgress();
  }

  /* ---------- backup ---------- */
  function exportJson() {
    var payload = JSON.stringify({
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      categories: state.categories,
      items: state.items
    }, null, 2);
    var blob = new Blob([payload], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '출산가방-체크리스트-' + todayStamp() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('JSON 파일을 내보냈습니다.');
  }

  function importJsonFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { showToast('파일을 읽지 못했습니다. 기존 기록은 그대로 유지됩니다.'); };
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (e) {
        showToast('JSON 형식이 아닙니다. 기존 기록은 그대로 유지됩니다.');
        return;
      }
      var result = normalizeState(parsed);
      if (!result.ok) {
        showToast('불러올 수 없는 파일입니다: ' + result.error + ' 기존 기록은 그대로 유지됩니다.');
        return;
      }
      var msg = '현재 목록(분류 ' + state.categories.length + '개, 준비물 ' + state.items.length + '개)을 파일 내용(분류 ' + result.data.categories.length + '개, 준비물 ' + result.data.items.length + '개)으로 교체합니다. 기존 기록은 사라집니다. 계속할까요?';
      if (!window.confirm(msg)) { showToast('불러오기를 취소했습니다.'); return; }
      state = result.data;
      hideToast();
      commit();
      showToast('백업 파일을 불러왔습니다.');
    };
    reader.readAsText(file);
  }

  /* ---------- event wiring ---------- */
  function bindEvents() {
    $('#filter-group').addEventListener('change', function (e) {
      if (e.target.name === 'filter') { ui.filter = e.target.value; render(); }
    });

    $('#edit-mode-toggle').addEventListener('click', function () {
      ui.editMode = !ui.editMode;
      render();
    });

    $('#add-category-btn').addEventListener('click', function () {
      var form = $('#add-category-form');
      form.hidden = !form.hidden;
      if (!form.hidden) $('#new-category-name').focus();
    });
    $('#add-category-cancel').addEventListener('click', function () {
      $('#add-category-form').hidden = true;
      $('#new-category-name').value = '';
      $('#add-category-btn').focus();
    });
    $('#add-category-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('#new-category-name');
      if (addCategory(input.value)) {
        input.value = '';
        $('#add-category-form').hidden = true;
        $('#add-category-btn').focus();
      }
    });

    $('#export-btn').addEventListener('click', function () { $('#backup-menu').open = false; exportJson(); });
    $('#import-btn').addEventListener('click', function () { $('#backup-menu').open = false; $('#import-file').click(); });
    $('#import-file').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      importJsonFile(file);
      e.target.value = '';
    });
    document.addEventListener('click', function (e) {
      var menu = $('#backup-menu');
      if (menu.open && !menu.contains(e.target)) menu.open = false;
    });

    $('#toast-undo').addEventListener('click', function () {
      var fn = ui.pendingUndo;
      hideToast();
      if (fn) fn();
    });
    $('#toast-close').addEventListener('click', hideToast);

    var root = $('#categories');

    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn || btn.tagName !== 'BUTTON') return;
      var card = btn.closest('[data-category-id]');
      var row = btn.closest('[data-item-id]');
      switch (btn.dataset.action) {
        case 'delete-category': deleteCategory(card.dataset.categoryId); break;
        case 'toggle-collapse': toggleCollapsed(card.dataset.categoryId); break;
        case 'pick-icon': setCategoryIcon(card.dataset.categoryId, btn.dataset.icon || ''); break;
        case 'delete-item': deleteItem(row.dataset.itemId); break;
        case 'toggle-excluded': toggleExcluded(row.dataset.itemId); break;
      }
    });

    root.addEventListener('submit', function (e) {
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

    // Enter in an edit field should commit and not submit anything.
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('input[data-field], input[data-action="rename-category"], input[data-action="set-icon"]')) {
        e.preventDefault();
        e.target.blur();
      }
    });
  }

  /* ---------- init ---------- */
  function init() {
    var loaded = loadState();
    state = loaded.state;
    loadUiPrefs();
    bindEvents();
    if (loaded.fresh && storageOk) {
      saveState();
    } else if (!loaded.fresh) {
      $('#save-status').textContent = '저장된 기록을 불러왔습니다';
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
