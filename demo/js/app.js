/* 墨阅 · 应用逻辑 */
(function () {
  'use strict';

  var MD = window.MiniMarkdown;
  var STORAGE_KEY = 'moyue.state.v1';
  var DEFAULT_PREFS = {
    theme: 'light',
    fontStep: 0,
    sidebarCollapsed: false
  };
  var FONT_MIN = -2;
  var FONT_MAX = 3;
  var MAX_FILE_SIZE = 8 * 1024 * 1024;
  var SAMPLE_FALLBACK = '# 墨阅\n\n把 Markdown 放进来，慢慢读。';

  var state = {
    docs: [],
    activeId: null,
    prefs: Object.assign({}, DEFAULT_PREFS),
    hadSaved: false,
    ready: false,
    storageWarned: false,
    mobileOpen: false,
    headingEls: [],
    activeHeadingId: null,
    searchIndex: [],
    searchMatches: [],
    searchActive: -1,
    toastTimer: null,
    dragDepth: 0,
    scrollRaf: 0
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    els.app = $('app');
    els.sidebar = $('sidebar');
    els.sidebarBackdrop = $('sidebarBackdrop');
    els.docList = $('docList');
    els.docCount = $('docCount');
    els.openFileBtn = $('openFileBtn');
    els.pasteBtn = $('pasteBtn');
    els.fileInput = $('fileInput');
    els.sidebarToggle = $('sidebarToggle');
    els.docTitle = $('docTitle');
    els.docMeta = $('docMeta');
    els.searchBtn = $('searchBtn');
    els.fontDown = $('fontDown');
    els.fontUp = $('fontUp');
    els.themeBtn = $('themeBtn');
    els.printBtn = $('printBtn');
    els.readingProgress = $('readingProgress');
    els.scrollArea = $('scrollArea');
    els.readerShell = $('readerShell');
    els.article = $('article');
    els.docEnd = $('docEnd');
    els.tocPanel = $('tocPanel');
    els.emptyState = $('emptyState');
    els.emptyOpenBtn = $('emptyOpenBtn');
    els.emptySampleBtn = $('emptySampleBtn');
    els.backTop = $('backTop');
    els.dropOverlay = $('dropOverlay');
    els.searchDialog = $('searchDialog');
    els.searchInput = $('searchInput');
    els.searchResults = $('searchResults');
    els.searchCloseBtn = $('searchCloseBtn');
    els.pasteDialog = $('pasteDialog');
    els.pasteForm = $('pasteForm');
    els.pasteTitleInput = $('pasteTitleInput');
    els.pasteContent = $('pasteContent');
    els.pasteCloseBtn = $('pasteCloseBtn');
    els.pasteCancelBtn = $('pasteCancelBtn');
    els.toast = $('toast');
    els.toastMessage = $('toastMessage');
    els.toastAction = $('toastAction');
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'doc-' + window.crypto.randomUUID();
    }
    return 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function escapeHtml(value) {
    return MD.escapeHtml(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isMobile() {
    return window.matchMedia('(max-width: 980px)').matches;
  }

  function reduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(value || 0);
  }

  function formatCompact(value) {
    var number = Number(value) || 0;
    if (number >= 10000) {
      var wan = number / 10000;
      return (wan >= 10 ? Math.round(wan) : wan.toFixed(1).replace(/\.0$/, '')) + ' 万';
    }
    return formatNumber(number);
  }

  function stripExtension(name) {
    return String(name || '').replace(/\.[^.\\/]+$/, '');
  }

  function getDoc(id) {
    if (!id) return null;
    for (var i = 0; i < state.docs.length; i += 1) {
      if (state.docs[i].id === id) return state.docs[i];
    }
    return null;
  }

  function getActiveDoc() {
    return getDoc(state.activeId);
  }

  function createDocRecord(options) {
    var content = String(options.content == null ? '' : options.content);
    if (!content.trim()) return null;
    var name = String(options.name || 'untitled.md');
    var info = MD.inspect(content);
    var title = String(options.title || '').trim() || info.title || stripExtension(name) || '未命名文档';
    return {
      id: options.id || uid(),
      name: name,
      title: title.slice(0, 120),
      content: content,
      createdAt: Number(options.createdAt) || Date.now(),
      builtin: !!options.builtin,
      stats: MD.countText(content)
    };
  }

  function normalizeDoc(raw) {
    if (!raw || typeof raw.content !== 'string' || !raw.content.trim()) return null;
    return createDocRecord({
      id: raw.id ? String(raw.id) : '',
      name: raw.name ? String(raw.name) : 'untitled.md',
      title: raw.title ? String(raw.title) : '',
      content: raw.content,
      createdAt: raw.createdAt,
      builtin: raw.builtin
    });
  }

  function createSampleDoc() {
    var text = window.SAMPLE_MARKDOWN || SAMPLE_FALLBACK;
    return createDocRecord({
      name: 'welcome.md',
      content: text,
      title: '墨阅 · 使用手册',
      builtin: true
    });
  }

  function loadState() {
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      saved = null;
    }

    var domTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    var savedPrefs = saved && saved.prefs && typeof saved.prefs === 'object' ? saved.prefs : {};
    state.prefs = {
      theme: savedPrefs.theme === 'dark' || savedPrefs.theme === 'light' ? savedPrefs.theme : domTheme,
      fontStep: Number.isFinite(Number(savedPrefs.fontStep)) ? clamp(Math.round(Number(savedPrefs.fontStep)), FONT_MIN, FONT_MAX) : 0,
      sidebarCollapsed: !!savedPrefs.sidebarCollapsed
    };

    if (saved && Array.isArray(saved.docs)) {
      var seen = Object.create(null);
      saved.docs.forEach(function (raw) {
        var doc = normalizeDoc(raw);
        if (!doc) return;
        if (seen[doc.id]) doc.id = uid();
        seen[doc.id] = true;
        state.docs.push(doc);
      });
      state.hadSaved = true;
      state.activeId = getDoc(String(saved.activeId || '')) ? String(saved.activeId) : (state.docs[0] ? state.docs[0].id : null);
    } else {
      var sample = createSampleDoc();
      if (sample) {
        state.docs.push(sample);
        state.activeId = sample.id;
      }
      state.hadSaved = false;
    }
  }

  function persist() {
    if (!state.ready) return;
    var payload = {
      version: 1,
      activeId: state.activeId,
      prefs: {
        theme: state.prefs.theme,
        fontStep: state.prefs.fontStep,
        sidebarCollapsed: state.prefs.sidebarCollapsed
      },
      docs: state.docs.map(function (doc) {
        return {
          id: doc.id,
          name: doc.name,
          title: doc.title,
          content: doc.content,
          createdAt: doc.createdAt,
          builtin: !!doc.builtin
        };
      })
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      if (!state.storageWarned) {
        state.storageWarned = true;
        showToast('本地存储空间不足，这份文档暂时不会被自动保存。');
      }
    }
  }

  /* -------------------------------------------------------
     Theme / type / sidebar preferences
     ------------------------------------------------------- */

  function applyTheme(theme, shouldPersist) {
    var value = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    state.prefs.theme = value;
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', value === 'dark' ? '#131312' : '#f4efe5');
    els.themeBtn.setAttribute('aria-label', value === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    if (shouldPersist) persist();
  }

  function applyFont(step, shouldPersist) {
    var value = clamp(Math.round(Number(step) || 0), FONT_MIN, FONT_MAX);
    state.prefs.fontStep = value;
    document.documentElement.style.setProperty('--reading-size', (17 + value) + 'px');
    var hasDoc = !!getActiveDoc();
    els.fontDown.disabled = !hasDoc || value <= FONT_MIN;
    els.fontUp.disabled = !hasDoc || value >= FONT_MAX;
    els.fontDown.title = hasDoc ? '缩小字号 (' + (17 + value) + 'px)' : '缩小字号';
    els.fontUp.title = hasDoc ? '放大字号 (' + (17 + value) + 'px)' : '放大字号';
    if (shouldPersist) persist();
  }

  function applySidebar() {
    if (isMobile()) {
      els.app.classList.remove('sidebar-collapsed');
      els.app.classList.toggle('sidebar-open', state.mobileOpen);
    } else {
      els.app.classList.remove('sidebar-open');
      els.app.classList.toggle('sidebar-collapsed', !!state.prefs.sidebarCollapsed);
    }
  }

  function toggleSidebar() {
    if (isMobile()) {
      state.mobileOpen = !state.mobileOpen;
      applySidebar();
      return;
    }
    state.prefs.sidebarCollapsed = !state.prefs.sidebarCollapsed;
    applySidebar();
    persist();
  }

  function closeMobileSidebar() {
    if (!state.mobileOpen) return;
    state.mobileOpen = false;
    applySidebar();
  }

  /* -------------------------------------------------------
     Rendering
     ------------------------------------------------------- */

  function renderLibrary() {
    els.docCount.textContent = String(state.docs.length);

    if (!state.docs.length) {
      els.docList.innerHTML = '<div class="doc-empty">书架空了。<br>打开一份 Markdown，或者直接拖进来。</div>';
      return;
    }

    els.docList.innerHTML = state.docs.map(function (doc) {
      var active = doc.id === state.activeId;
      var stats = doc.stats || MD.countText(doc.content);
      var kind = doc.builtin ? '内置示例' : (doc.name.replace(/^.*[\\/]/, '').split('.').pop() || 'md').toUpperCase() + ' 文档';
      return '<div class="doc-item' + (active ? ' is-active' : '') + '">' +
        '<button class="doc-open" type="button" data-doc-id="' + escapeHtml(doc.id) + '"' +
        (active ? ' aria-current="true"' : '') + '>' +
        '<span class="doc-icon" aria-hidden="true"><svg class="icon"><use href="#i-file"></use></svg></span>' +
        '<span class="doc-text">' +
        '<span class="doc-title" title="' + escapeHtml(doc.title) + '">' + escapeHtml(doc.title) + '</span>' +
        '<span class="doc-sub">' + escapeHtml(kind) + ' · ' + formatCompact(stats.chars) + ' 字</span>' +
        '</span></button>' +
        '<button class="doc-remove" type="button" data-remove-id="' + escapeHtml(doc.id) + '" ' +
        'aria-label="从书架移除《' + escapeHtml(doc.title) + '》" title="从书架移除">' +
        '<svg class="icon" aria-hidden="true"><use href="#i-x"></use></svg></button>' +
        '</div>';
    }).join('');

    window.requestAnimationFrame(function () {
      var activeItem = els.docList.querySelector('.doc-item.is-active');
      if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderToc(headings) {
    state.headingEls = [];
    state.activeHeadingId = null;

    if (!headings.length) {
      els.tocPanel.hidden = true;
      els.tocPanel.innerHTML = '';
      els.readerShell.classList.add('no-toc');
      return;
    }

    els.readerShell.classList.remove('no-toc');

    var minLevel = headings.reduce(function (minimum, heading) {
      return Math.min(minimum, heading.level);
    }, 6);

    state.headingEls = headings.map(function (heading) {
      return document.getElementById(heading.id);
    }).filter(Boolean);

    els.tocPanel.hidden = false;
    els.tocPanel.innerHTML = '<div class="toc-head"><span>目录</span><span class="toc-count">' + headings.length + '</span></div>' +
      '<nav class="toc-nav">' + headings.map(function (heading) {
        var depth = clamp(heading.level - minLevel, 0, 4);
        return '<a class="toc-link" href="#' + escapeHtml(heading.id) + '" data-heading-id="' +
          escapeHtml(heading.id) + '" style="--depth:' + depth + '">' + escapeHtml(heading.text) + '</a>';
      }).join('') + '</nav>';
  }

  function renderDocument(options) {
    options = options || {};
    var doc = getActiveDoc();

    if (!doc) {
      renderEmpty();
      return;
    }

    var result = MD.render(doc.content);
    var stats = doc.stats || MD.countText(doc.content);

    els.emptyState.hidden = true;
    els.readerShell.hidden = false;
    els.article.innerHTML = result.html;
    els.article.classList.remove('is-entering');
    void els.article.offsetWidth;
    els.article.classList.add('is-entering');

    els.docEnd.hidden = false;
    els.docEnd.innerHTML = '<span class="end-rule"></span><span class="end-text">读到这里了</span><span class="end-rule"></span>';
    els.docTitle.textContent = doc.title;
    els.docTitle.title = doc.title;
    els.docMeta.textContent = doc.name + ' · ' + formatNumber(stats.chars) + ' 字 · 约 ' + stats.minutes + ' 分钟';
    els.docMeta.title = doc.name;
    document.title = doc.title + ' · 墨阅';

    renderToc(result.headings);
    state.searchIndex = [];
    state.searchMatches = [];
    state.searchActive = -1;

    els.scrollArea.scrollTop = 0;
    updateScrollUi();
    updateControls();
    applyFont(state.prefs.fontStep, false);

    window.requestAnimationFrame(function () {
      updateScrollUi();
      if (options.restoreHash && location.hash.length > 1) {
        var id = '';
        try {
          id = decodeURIComponent(location.hash.slice(1));
        } catch (error) {
          id = '';
        }
        if (id && document.getElementById(id)) {
          scrollToHeading(id, 'auto', false);
        } else {
          clearHash();
        }
      }
    });

    if (els.searchDialog.open) els.searchDialog.close();
  }

  function renderEmpty() {
    state.headingEls = [];
    state.activeHeadingId = null;
    els.readerShell.hidden = true;
    els.emptyState.hidden = false;
    els.docEnd.hidden = true;
    els.article.innerHTML = '';
    els.tocPanel.hidden = true;
    els.tocPanel.innerHTML = '';
    els.readerShell.classList.remove('no-toc');
    els.docTitle.textContent = '还没有打开文档';
    els.docTitle.title = '';
    els.docMeta.textContent = '打开或拖入一份 Markdown，开始阅读。';
    els.docMeta.title = '';
    document.title = '墨阅 · 一个 Markdown 小玩具';
    els.scrollArea.scrollTop = 0;
    updateScrollUi();
    updateControls();
  }

  function updateControls() {
    var hasDoc = !!getActiveDoc();
    els.searchBtn.disabled = !hasDoc;
    els.printBtn.disabled = !hasDoc;
    els.fontDown.disabled = !hasDoc || state.prefs.fontStep <= FONT_MIN;
    els.fontUp.disabled = !hasDoc || state.prefs.fontStep >= FONT_MAX;
  }

  /* -------------------------------------------------------
     Navigation and scroll
     ------------------------------------------------------- */

  function updateScrollUi() {
    if (!els.scrollArea) return;
    var hasDoc = !!getActiveDoc();
    var maximum = els.scrollArea.scrollHeight - els.scrollArea.clientHeight;
    var ratio = maximum > 0 ? clamp(els.scrollArea.scrollTop / maximum, 0, 1) : 0;
    els.readingProgress.style.transform = 'scaleX(' + ratio + ')';
    els.backTop.classList.toggle('is-visible', hasDoc && els.scrollArea.scrollTop > 520);

    if (!hasDoc || els.readerShell.hidden || !state.headingEls.length) {
      setActiveToc(null);
      return;
    }

    var threshold = els.scrollArea.getBoundingClientRect().top + 104;
    var current = null;
    for (var i = 0; i < state.headingEls.length; i += 1) {
      if (state.headingEls[i].getBoundingClientRect().top <= threshold) {
        current = state.headingEls[i];
      } else {
        break;
      }
    }
    setActiveToc(current ? current.id : null);
  }

  function setActiveToc(id) {
    if (state.activeHeadingId === id) return;
    state.activeHeadingId = id;
    var links = els.tocPanel.querySelectorAll('.toc-link');
    for (var i = 0; i < links.length; i += 1) {
      var link = links[i];
      var active = link.getAttribute('data-heading-id') === id;
      link.classList.toggle('is-active', active);
      if (active) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }

  function scheduleScrollUi() {
    if (state.scrollRaf) return;
    state.scrollRaf = window.requestAnimationFrame(function () {
      state.scrollRaf = 0;
      updateScrollUi();
    });
  }

  function scrollToHeading(id, behavior, updateHash) {
    var target = document.getElementById(id);
    if (!target) return;
    var top = els.scrollArea.scrollTop + target.getBoundingClientRect().top -
      els.scrollArea.getBoundingClientRect().top - 28;
    els.scrollArea.scrollTo({
      top: Math.max(0, top),
      behavior: behavior || (reduceMotion() ? 'auto' : 'smooth')
    });
    if (updateHash !== false) {
      try {
        history.replaceState(null, '', '#' + encodeURIComponent(id));
      } catch (error) {
        /* file:// 下某些浏览器会拒绝修改 history，不影响阅读。 */
      }
    }
  }

  function jumpToNode(node) {
    if (!node) return;
    var top = els.scrollArea.scrollTop + node.getBoundingClientRect().top -
      els.scrollArea.getBoundingClientRect().top - 88;
    els.scrollArea.scrollTo({
      top: Math.max(0, top),
      behavior: reduceMotion() ? 'auto' : 'smooth'
    });

    node.classList.remove('search-flash');
    void node.offsetWidth;
    node.classList.add('search-flash');
    if (node._flashTimer) window.clearTimeout(node._flashTimer);
    node._flashTimer = window.setTimeout(function () {
      node.classList.remove('search-flash');
    }, 1900);
  }

  function clearHash() {
    if (!location.hash) return;
    try {
      history.replaceState(null, '', location.href.split('#')[0]);
    } catch (error) {
      /* 忽略受限环境里的 history 异常。 */
    }
  }

  function setActive(id, shouldPersist) {
    if (!getDoc(id)) return;
    var changed = state.activeId !== id;
    state.activeId = id;
    renderLibrary();
    if (changed) {
      clearHash();
      renderDocument({ restoreHash: false });
    }
    closeMobileSidebar();
    if (changed && shouldPersist !== false) persist();
  }

  /* -------------------------------------------------------
     Documents
     ------------------------------------------------------- */

  function addDocuments(docs, message) {
    if (!docs.length) return;
    state.docs = docs.concat(state.docs);
    state.activeId = docs[0].id;
    clearHash();
    renderLibrary();
    renderDocument({ restoreHash: false });
    persist();
    closeMobileSidebar();
    if (message) showToast(message);
  }

  async function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    var accepted = [];
    var rejected = 0;

    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      var validName = /\.(md|markdown|mdown|mkd|txt)$/i.test(file.name);
      var validType = file.type && /^text\//i.test(file.type);
      if (!validName && !validType) {
        rejected += 1;
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast('《' + file.name + '》超过 8 MB，先不放进书架了。');
        continue;
      }

      try {
        var content = await file.text();
        if (!content.trim()) {
          showToast('《' + file.name + '》是空的。');
          continue;
        }

        var existing = state.docs.find(function (doc) {
          return doc.name === file.name && doc.content === content;
        });
        if (existing) {
          accepted.push(existing);
          continue;
        }

        var info = MD.inspect(content);
        var doc = createDocRecord({
          name: file.name,
          content: content,
          title: info.title || stripExtension(file.name)
        });
        if (doc) accepted.push(doc);
      } catch (error) {
        showToast('《' + file.name + '》读取失败，请再试一次。');
      }
    }

    if (!accepted.length) {
      if (rejected) showToast('这里只收 .md、.markdown 和 .txt 文件。');
      return;
    }

    var fresh = accepted.filter(function (doc) {
      return state.docs.indexOf(doc) < 0;
    });
    var alreadyThere = fresh.length === 0;

    if (fresh.length) {
      state.docs = fresh.concat(state.docs);
    }
    state.activeId = accepted[0].id;
    clearHash();
    renderLibrary();
    renderDocument({ restoreHash: false });
    persist();
    closeMobileSidebar();

    if (alreadyThere) {
      showToast('这份文档已经在书架里了。');
    } else if (fresh.length > 1) {
      showToast('已打开 ' + fresh.length + ' 份文档。');
    } else {
      showToast('已打开《' + fresh[0].title + '》。');
    }
  }

  function removeDocument(id) {
    var index = state.docs.findIndex(function (doc) {
      return doc.id === id;
    });
    if (index < 0) return;

    var doc = state.docs[index];
    var wasActive = state.activeId === doc.id;
    var previousActive = state.activeId;

    state.docs.splice(index, 1);
    if (wasActive) {
      state.activeId = state.docs[index] ? state.docs[index].id : (state.docs[index - 1] ? state.docs[index - 1].id : null);
      clearHash();
    }

    renderLibrary();
    if (wasActive) renderDocument({ restoreHash: false });
    persist();

    showToast('已从书架移除《' + doc.title + '》。', {
      label: '撤销',
      onAction: function () {
        var insertAt = Math.min(index, state.docs.length);
        state.docs.splice(insertAt, 0, doc);
        state.activeId = previousActive || doc.id;
        clearHash();
        renderLibrary();
        renderDocument({ restoreHash: false });
        persist();
        showToast('已把《' + doc.title + '》放回书架。');
      }
    });
  }

  function openPasteDialog() {
    if (els.searchDialog.open) els.searchDialog.close();
    els.pasteForm.reset();
    els.pasteDialog.showModal();
    window.setTimeout(function () {
      els.pasteContent.focus();
    }, 40);
  }

  function submitPaste() {
    var content = els.pasteContent.value;
    if (!content.trim()) {
      showToast('先粘贴一点 Markdown 内容吧。');
      els.pasteContent.focus();
      return;
    }

    var title = els.pasteTitleInput.value.trim();
    var doc = createDocRecord({
      name: 'pasted.md',
      content: content,
      title: title
    });
    if (!doc) return;

    state.docs.unshift(doc);
    state.activeId = doc.id;
    els.pasteDialog.close();
    clearHash();
    renderLibrary();
    renderDocument({ restoreHash: false });
    persist();
    closeMobileSidebar();
    showToast('已收进书架：《' + doc.title + '》。');
  }

  function restoreSample() {
    var existing = state.docs.find(function (doc) {
      return doc.builtin;
    });
    if (existing) {
      setActive(existing.id);
      showToast('示例已经在书架里。');
      return;
    }

    var sample = createSampleDoc();
    if (!sample) return;
    state.docs.unshift(sample);
    state.activeId = sample.id;
    clearHash();
    renderLibrary();
    renderDocument({ restoreHash: false });
    persist();
    showToast('示例已装回书架。');
  }

  /* -------------------------------------------------------
     Search
     ------------------------------------------------------- */

  function blockLabel(node) {
    if (/^H[1-6]$/.test(node.tagName)) return node.tagName;
    if (node.tagName === 'PRE') return 'CODE';
    if (node.tagName === 'TABLE') return 'TBL';
    return 'P';
  }

  function buildSearchIndex() {
    var nodes = els.article.querySelectorAll('h1,h2,h3,h4,h5,h6,p,pre,table');
    var items = [];
    var heading = '正文';

    for (var i = 0; i < nodes.length && items.length < 900; i += 1) {
      var node = nodes[i];
      if (node.closest('.code-head')) continue;
      var isHeading = /^H[1-6]$/.test(node.tagName);
      var text = (node.textContent || '');
      if (isHeading) {
        var headingClone = node.cloneNode(true);
        var headingAnchor = headingClone.querySelector('.heading-anchor');
        if (headingAnchor) headingAnchor.remove();
        text = headingClone.textContent || '';
      }
      text = text.replace(/\s+/g, ' ').trim();
      if (!text) continue;

      if (isHeading) heading = text;
      items.push({
        el: node,
        text: text,
        heading: isHeading ? '章节标题' : heading,
        label: blockLabel(node)
      });
    }

    state.searchIndex = items;
  }

  function initialSearchHtml() {
    return '<div class="search-empty"><strong>从文章里捞一句话</strong>搜索标题、段落或代码片段。<br>按 <kbd>Enter</kbd> 直接跳过去。</div>';
  }

  function setSearchActive(index) {
    var buttons = els.searchResults.querySelectorAll('.search-result');
    if (!buttons.length) {
      state.searchActive = -1;
      return;
    }
    state.searchActive = (index + buttons.length) % buttons.length;
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].classList.toggle('is-active', i === state.searchActive);
    }
    buttons[state.searchActive].scrollIntoView({ block: 'nearest' });
  }

  function renderSearchResults(query) {
    var value = String(query || '').trim();
    state.searchMatches = [];

    if (!value) {
      state.searchActive = -1;
      els.searchResults.innerHTML = initialSearchHtml();
      return;
    }

    var lower = value.toLocaleLowerCase();
    var matches = [];

    for (var i = 0; i < state.searchIndex.length && matches.length < 40; i += 1) {
      var item = state.searchIndex[i];
      var textLower = item.text.toLocaleLowerCase();
      var index = textLower.indexOf(lower);
      if (index < 0) continue;
      matches.push(item);
    }

    state.searchMatches = matches;

    if (!matches.length) {
      state.searchActive = -1;
      els.searchResults.innerHTML = '<div class="search-empty"><strong>没有找到「' + escapeHtml(value) + '」</strong>换个词试试，或者只输入两个字。</div>';
      return;
    }

    els.searchResults.innerHTML = matches.map(function (item, matchIndex) {
      var index = item.text.toLocaleLowerCase().indexOf(lower);
      var start = Math.max(0, index - 36);
      var end = Math.min(item.text.length, index + value.length + 58);
      var before = (start > 0 ? '…' : '') + item.text.slice(start, index);
      var hit = item.text.slice(index, index + value.length);
      var after = item.text.slice(index + value.length, end) + (end < item.text.length ? '…' : '');
      var snippet = escapeHtml(before) + '<mark>' + escapeHtml(hit) + '</mark>' + escapeHtml(after);
      return '<button class="search-result' + (matchIndex === 0 ? ' is-active' : '') + '" type="button" data-index="' + matchIndex + '">' +
        '<span class="result-badge" aria-hidden="true">' + item.label + '</span>' +
        '<span class="result-main"><span class="result-label">' + escapeHtml(item.heading) + '</span>' +
        '<span class="result-snippet">' + snippet + '</span></span>' +
        '<span class="result-enter" aria-hidden="true">↵</span></button>';
    }).join('');

    state.searchActive = 0;
  }

  function openSearch() {
    if (!getActiveDoc()) return;
    if (els.pasteDialog.open) return;
    if (els.searchDialog.open) {
      els.searchInput.focus();
      els.searchInput.select();
      return;
    }
    buildSearchIndex();
    els.searchInput.value = '';
    renderSearchResults('');
    els.searchDialog.showModal();
    window.setTimeout(function () {
      els.searchInput.focus();
    }, 30);
  }

  function jumpToSearchMatch(index) {
    var match = state.searchMatches[index];
    if (!match) return;
    els.searchDialog.close();
    window.requestAnimationFrame(function () {
      jumpToNode(match.el);
    });
  }

  /* -------------------------------------------------------
     Toast and clipboard
     ------------------------------------------------------- */

  function hideToast() {
    window.clearTimeout(state.toastTimer);
    state.toastTimer = null;
    els.toast.classList.remove('is-visible');
  }

  function showToast(message, action) {
    window.clearTimeout(state.toastTimer);
    els.toastMessage.textContent = message;

    if (action && action.label) {
      els.toastAction.hidden = false;
      els.toastAction.textContent = action.label;
      els.toastAction.onclick = function () {
        hideToast();
        if (typeof action.onAction === 'function') action.onAction();
      };
    } else {
      els.toastAction.hidden = true;
      els.toastAction.onclick = null;
    }

    els.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(hideToast, action ? 6500 : 3400);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* 继续尝试旧版复制方式。 */
    }

    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.left = '-9999px';
      area.style.top = '0';
      document.body.appendChild(area);
      area.select();
      var copied = document.execCommand('copy');
      document.body.removeChild(area);
      return copied;
    } catch (error) {
      return false;
    }
  }

  /* -------------------------------------------------------
     Events
     ------------------------------------------------------- */

  function bindEvents() {
    els.openFileBtn.addEventListener('click', function () {
      els.fileInput.click();
    });

    els.emptyOpenBtn.addEventListener('click', function () {
      els.fileInput.click();
    });

    els.emptySampleBtn.addEventListener('click', restoreSample);

    els.fileInput.addEventListener('change', function () {
      var files = els.fileInput.files;
      handleFiles(files);
      els.fileInput.value = '';
    });

    els.pasteBtn.addEventListener('click', openPasteDialog);
    els.pasteCloseBtn.addEventListener('click', function () {
      els.pasteDialog.close();
    });
    els.pasteCancelBtn.addEventListener('click', function () {
      els.pasteDialog.close();
    });
    els.pasteForm.addEventListener('submit', function (event) {
      event.preventDefault();
      submitPaste();
    });
    els.pasteDialog.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        els.pasteForm.requestSubmit();
      }
    });

    els.docList.addEventListener('click', function (event) {
      var remove = event.target.closest('[data-remove-id]');
      if (remove) {
        event.preventDefault();
        event.stopPropagation();
        removeDocument(remove.getAttribute('data-remove-id'));
        return;
      }
      var open = event.target.closest('[data-doc-id]');
      if (open) {
        setActive(open.getAttribute('data-doc-id'));
      }
    });

    els.sidebarToggle.addEventListener('click', toggleSidebar);
    els.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    els.themeBtn.addEventListener('click', function () {
      applyTheme(state.prefs.theme === 'dark' ? 'light' : 'dark', true);
    });

    els.fontDown.addEventListener('click', function () {
      applyFont(state.prefs.fontStep - 1, true);
    });
    els.fontUp.addEventListener('click', function () {
      applyFont(state.prefs.fontStep + 1, true);
    });

    els.printBtn.addEventListener('click', function () {
      if (!getActiveDoc()) return;
      if (els.searchDialog.open) els.searchDialog.close();
      if (els.pasteDialog.open) els.pasteDialog.close();
      window.print();
    });

    els.scrollArea.addEventListener('scroll', scheduleScrollUi, { passive: true });

    els.backTop.addEventListener('click', function () {
      els.scrollArea.scrollTo({
        top: 0,
        behavior: reduceMotion() ? 'auto' : 'smooth'
      });
    });

    els.article.addEventListener('click', function (event) {
      var copyButton = event.target.closest('.code-copy');
      if (copyButton) {
        var block = copyButton.closest('.code-block');
        var code = block ? block.querySelector('code') : null;
        if (!code) return;
        copyText(code.innerText || code.textContent || '').then(function (copied) {
          if (!copied) {
            showToast('复制失败，可以手动选中代码。');
            return;
          }
          var oldLabel = '复制';
          copyButton.textContent = '已复制 ✓';
          copyButton.classList.add('is-copied');
          if (copyButton._copyTimer) window.clearTimeout(copyButton._copyTimer);
          copyButton._copyTimer = window.setTimeout(function () {
            copyButton.textContent = oldLabel;
            copyButton.classList.remove('is-copied');
          }, 1500);
        });
        return;
      }

      var anchor = event.target.closest('.heading-anchor');
      if (anchor) {
        event.preventDefault();
        var anchorId = (anchor.getAttribute('href') || '').slice(1);
        if (!anchorId) return;
        scrollToHeading(anchorId, reduceMotion() ? 'auto' : 'smooth', true);
        var link = location.href.split('#')[0] + '#' + encodeURIComponent(anchorId);
        copyText(link).then(function (copied) {
          showToast(copied ? '章节链接已复制。' : '链接在这里：' + link);
        });
        return;
      }

      var linkNode = event.target.closest('a');
      if (linkNode) {
        var href = linkNode.getAttribute('href') || '';
        if (href.charAt(0) === '#') {
          event.preventDefault();
          var id = '';
          try {
            id = decodeURIComponent(href.slice(1));
          } catch (error) {
            id = '';
          }
          if (id) scrollToHeading(id, reduceMotion() ? 'auto' : 'smooth', true);
        } else if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(href) && linkNode.target !== '_blank') {
          event.preventDefault();
          showToast('这是一个相对链接，墨阅暂时打不开它。');
        }
      }
    });

    els.tocPanel.addEventListener('click', function (event) {
      var link = event.target.closest('.toc-link');
      if (!link) return;
      event.preventDefault();
      var id = link.getAttribute('data-heading-id');
      if (id) scrollToHeading(id, reduceMotion() ? 'auto' : 'smooth', true);
    });

    els.searchBtn.addEventListener('click', openSearch);
    els.searchCloseBtn.addEventListener('click', function () {
      els.searchDialog.close();
    });
    els.searchInput.addEventListener('input', function () {
      renderSearchResults(els.searchInput.value);
    });
    els.searchInput.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSearchActive(state.searchActive + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSearchActive(state.searchActive - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (state.searchMatches.length) jumpToSearchMatch(state.searchActive);
      }
    });
    els.searchResults.addEventListener('click', function (event) {
      var result = event.target.closest('.search-result');
      if (!result) return;
      jumpToSearchMatch(Number(result.getAttribute('data-index')));
    });
    els.searchResults.addEventListener('pointerover', function (event) {
      var result = event.target.closest('.search-result');
      if (!result) return;
      var index = Number(result.getAttribute('data-index'));
      if (index !== state.searchActive) setSearchActive(index);
    });

    [els.searchDialog, els.pasteDialog].forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
    });

    window.addEventListener('keydown', function (event) {
      var mod = event.ctrlKey || event.metaKey;
      var key = String(event.key || '').toLowerCase();
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;

      if (mod && key === 'o') {
        event.preventDefault();
        if (!els.pasteDialog.open && !els.searchDialog.open) els.fileInput.click();
        return;
      }

      if (mod && key === 'k') {
        event.preventDefault();
        openSearch();
        return;
      }

      if (mod && key === 'b' && !typing) {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      if (key === 'escape' && !els.searchDialog.open && !els.pasteDialog.open) {
        closeMobileSidebar();
      }

      if (event.key === '?' && !typing && !els.searchDialog.open && !els.pasteDialog.open) {
        showToast('快捷键：Ctrl+O 打开 · Ctrl+K 搜索 · Ctrl+B 侧栏');
      }
    });

    window.addEventListener('resize', function () {
      applySidebar();
      scheduleScrollUi();
    });

    window.addEventListener('dragenter', function (event) {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      state.dragDepth += 1;
      els.dropOverlay.classList.add('is-visible');
      els.dropOverlay.setAttribute('aria-hidden', 'false');
    });

    window.addEventListener('dragover', function (event) {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', function (event) {
      if (!hasFileDrag(event)) return;
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (!state.dragDepth) hideDropOverlay();
    });

    window.addEventListener('drop', function (event) {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      state.dragDepth = 0;
      hideDropOverlay();
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        handleFiles(event.dataTransfer.files);
      }
    });

    window.addEventListener('dragend', function () {
      state.dragDepth = 0;
      hideDropOverlay();
    });
  }

  function hasFileDrag(event) {
    if (!event.dataTransfer) return false;
    var types = event.dataTransfer.types;
    if (!types) return false;
    for (var i = 0; i < types.length; i += 1) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }

  function hideDropOverlay() {
    els.dropOverlay.classList.remove('is-visible');
    els.dropOverlay.setAttribute('aria-hidden', 'true');
  }

  /* -------------------------------------------------------
     Boot
     ------------------------------------------------------- */

  function init() {
    cacheElements();
    loadState();
    applyTheme(state.prefs.theme, false);
    applyFont(state.prefs.fontStep, false);
    applySidebar();
    renderLibrary();

    if (state.activeId && getActiveDoc()) {
      renderDocument({ restoreHash: true });
    } else {
      state.activeId = null;
      renderEmpty();
    }

    bindEvents();
    updateControls();

    state.ready = true;
    if (!state.hadSaved) persist();

    window.setTimeout(scheduleScrollUi, 80);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
