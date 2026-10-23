/*!
 * 墨阅 · 轻量 Markdown 渲染器
 * 零依赖，只输出经过转义的安全 HTML（不执行原始 HTML）。
 */
(function (global) {
  'use strict';

  var HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return HTML_ESCAPES[ch];
    });
  }

  function normalize(source) {
    return String(source == null ? '' : source)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, '    ');
  }

  function isBlank(line) {
    return /^\s*$/.test(line);
  }

  function leadingSpaces(line) {
    var match = line.match(/^ */);
    return match ? match[0].length : 0;
  }

  function extractFrontmatter(source) {
    var meta = {};
    var body = source;
    if (!/^---[ \t]*\n/.test(source)) {
      return { meta: meta, body: body };
    }

    var lines = source.split('\n');
    var end = -1;
    for (var i = 1; i < lines.length; i += 1) {
      if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
        end = i;
        break;
      }
    }
    if (end < 0) {
      return { meta: meta, body: body };
    }

    lines.slice(1, end).forEach(function (line) {
      var match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!match) return;
      var value = match[2].trim();
      if (/^(['"]).*\1$/.test(value)) {
        value = value.slice(1, -1);
      }
      meta[match[1].toLowerCase()] = value;
    });

    body = lines.slice(end + 1).join('\n');
    return { meta: meta, body: body };
  }

  function plainInline(source) {
    return String(source == null ? '' : source)
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`+([^`]*)`+/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/[*_~=#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeUrl(raw, kind) {
    var url = String(raw == null ? '' : raw).trim().replace(/^<(.*)>$/, '$1');
    if (!url) return '';

    var compact = url.replace(/[\u0000-\u0020\u007F]+/g, '');
    var scheme = compact.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
    if (scheme) {
      var name = scheme[1].toLowerCase();
      if (name === 'http' || name === 'https' || name === 'mailto' || name === 'tel') {
        return url;
      }
      if (kind === 'image' && /^data:image\/(?:png|jpe?g|gif|webp|avif);/i.test(compact)) {
        return url;
      }
      return '';
    }

    return url;
  }

  function makeLink(url, labelHtml, title) {
    var href = safeUrl(url);
    if (!href) return labelHtml;
    var external = /^https?:\/\//i.test(href);
    var attrs = ' href="' + escapeHtml(href) + '"';
    if (title) attrs += ' title="' + escapeHtml(title) + '"';
    if (external) attrs += ' target="_blank" rel="noopener noreferrer"';
    return '<a' + attrs + '>' + labelHtml + '</a>';
  }

  function makeImage(url, alt, title) {
    var src = safeUrl(url, 'image');
    if (!src) return escapeHtml(alt);
    var altText = escapeHtml(plainInline(alt) || '图片');
    var attrs = ' src="' + escapeHtml(src) + '" alt="' + altText + '" loading="lazy" decoding="async"';
    if (title) attrs += ' title="' + escapeHtml(title) + '"';
    return '<img' + attrs + '>';
  }

  function renderInline(source, depth) {
    depth = depth || 0;
    var store = [];

    function token(html) {
      store.push(html);
      return '\uE000' + (store.length - 1) + '\uE001';
    }

    var text = String(source == null ? '' : source);

    // 行内代码先抽出来，避免里面的符号被继续解析。
    text = text.replace(/(`+)([\s\S]*?)\1/g, function (all, ticks, code) {
      var value = code.replace(/\n/g, ' ');
      if (/^ .* $/.test(value) && !/^  +$/.test(value)) {
        value = value.slice(1, -1);
      }
      return token('<code>' + escapeHtml(value) + '</code>');
    });

    // 反斜杠转义。
    text = text.replace(/\\([\\`*_[\]{}()#+\-.!>~|])/g, function (all, ch) {
      return token(escapeHtml(ch));
    });

    // 自动链接。
    text = text.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, function (all, url) {
      var label = url.replace(/^mailto:/, '');
      return token(makeLink(url, escapeHtml(label), ''));
    });

    // 图片在链接之前处理。
    text = text.replace(/!\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+["']([^"']*)["'])?\s*\)/g, function (all, alt, url, title) {
      return token(makeImage(url, alt, title));
    });

    // 行内链接。
    if (depth < 4) {
      text = text.replace(/\[([^\]]+)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+["']([^"']*)["'])?\s*\)/g, function (all, label, url, title) {
        return token(makeLink(url, renderInline(label, depth + 1), title));
      });
    }

    text = escapeHtml(text);

    // 强调、删除线、高亮。
    text = text
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([\s\S]+?)__/g, '<strong>$1</strong>')
      .replace(/~~([\s\S]+?)~~/g, '<del>$1</del>')
      .replace(/==([\s\S]+?)==/g, '<mark>$1</mark>')
      .replace(/(^|[^\w*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w_])_([^_\n]+?)_(?![\w_])/g, '$1<em>$2</em>');

    // 硬换行：行尾两个空格，或反斜杠换行。
    text = text
      .replace(/ {2,}\n/g, '<br>\n')
      .replace(/\\\n/g, '<br>\n');

    return text.replace(/\uE000(\d+)\uE001/g, function (all, index) {
      return store[Number(index)] || '';
    });
  }

  function slugify(text) {
    var slug = String(text || '')
      .toLowerCase()
      .replace(/[“”"'‘’]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 56);
    return slug || 'section';
  }

  function addHeading(level, raw, ctx) {
    var label = plainInline(raw) || '未命名章节';
    var base = 'sec-' + slugify(label);
    var id = base;
    var suffix = 2;
    while (ctx.usedIds.has(id)) {
      id = base + '-' + suffix;
      suffix += 1;
    }
    ctx.usedIds.add(id);
    ctx.headings.push({ level: level, text: label, id: id });
    return '<h' + level + ' id="' + escapeHtml(id) + '">' +
      renderInline(raw) +
      '<a class="heading-anchor" href="#' + escapeHtml(id) + '" title="复制链接" aria-label="复制此章节的链接">#</a>' +
      '</h' + level + '>';
  }

  function codeBlock(code, info) {
    var lang = String(info || '').split(/\s+/)[0].replace(/[^\w#+.-]/g, '').slice(0, 24);
    var label = lang ? escapeHtml(lang) : 'text';
    var langClass = lang ? ' class="language-' + escapeHtml(lang) + '"' : '';
    return '<div class="code-block">' +
      '<div class="code-head"><span class="code-lang">' + label + '</span>' +
      '<button class="code-copy" type="button">复制</button></div>' +
      '<pre><code' + langClass + '>' + escapeHtml(code) + '</code></pre>' +
      '</div>';
  }

  function splitTableRow(line) {
    var source = line.trim();
    if (source.charAt(0) === '|') source = source.slice(1);
    if (source.charAt(source.length - 1) === '|' && source.charAt(source.length - 2) !== '\\') {
      source = source.slice(0, -1);
    }

    var cells = [];
    var current = '';
    var inCode = false;
    for (var i = 0; i < source.length; i += 1) {
      var ch = source.charAt(i);
      if (ch === '\\' && source.charAt(i + 1) === '|') {
        current += '|';
        i += 1;
      } else if (ch === '`') {
        inCode = !inCode;
        current += ch;
      } else if (ch === '|' && !inCode) {
        cells.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  }

  function isTableStart(lines, index) {
    if (index + 1 >= lines.length) return false;
    if (lines[index].indexOf('|') < 0) return false;
    var delimiter = splitTableRow(lines[index + 1]);
    if (!delimiter.length) return false;
    return delimiter.every(function (cell) {
      return /^:?-{1,}:?$/.test(cell.trim());
    });
  }

  function renderTable(headers, aligns, rows) {
    var columnCount = Math.max(headers.length, aligns.length);
    var headHtml = '';
    for (var c = 0; c < columnCount; c += 1) {
      var align = aligns[c] || '';
      headHtml += '<th' + (align ? ' style="text-align:' + align + '"' : '') + '>' +
        renderInline(headers[c] || '') + '</th>';
    }

    var bodyHtml = rows.map(function (row) {
      var cells = '';
      for (var j = 0; j < columnCount; j += 1) {
        var cellAlign = aligns[j] || '';
        cells += '<td' + (cellAlign ? ' style="text-align:' + cellAlign + '"' : '') + '>' +
          renderInline(row[j] || '') + '</td>';
      }
      return '<tr>' + cells + '</tr>';
    }).join('');

    return '<div class="table-wrap"><table><thead><tr>' + headHtml + '</tr></thead>' +
      '<tbody>' + bodyHtml + '</tbody></table></div>';
  }

  var LIST_RE = /^(\s*)([-+*]|\d{1,9}[.)])(\s+)(.*)$/;

  function matchListItem(line) {
    var match = line.match(LIST_RE);
    if (!match) return null;
    return {
      indent: match[1].length,
      marker: match[2],
      spaces: match[3],
      text: match[4],
      type: /^\d/.test(match[2]) ? 'ol' : 'ul',
      number: parseInt(match[2], 10) || 1
    };
  }

  function isHr(line) {
    return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(line);
  }

  function startsBlock(line, nextLine) {
    if (/^ {0,3}(#{1,6})[ \t]+/.test(line)) return true;
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true;
    if (/^ {0,3}>/.test(line)) return true;
    if (isHr(line)) return true;
    if (/^ {4}/.test(line)) return true;
    var item = matchListItem(line);
    if (item && item.indent <= 3) return true;
    if (nextLine && line.indexOf('|') >= 0) {
      var delimiter = splitTableRow(nextLine);
      if (delimiter.length && delimiter.every(function (cell) {
        return /^:?-{1,}:?$/.test(cell.trim());
      })) return true;
    }
    return false;
  }

  function parseList(lines, start, ctx, level) {
    level = level || 1;
    var first = matchListItem(lines[start]);
    var baseIndent = first.indent;
    var ordered = first.type === 'ol';
    var listStart = first.number;
    var items = [];
    var loose = false;
    var i = start;

    while (i < lines.length) {
      var marker = matchListItem(lines[i]);
      if (!marker || marker.indent !== baseIndent || (marker.type === 'ol') !== ordered) {
        break;
      }

      var contentIndent = baseIndent + marker.marker.length + marker.spaces.length;
      var itemLines = [marker.text];
      i += 1;

      while (i < lines.length) {
        var line = lines[i];

        if (isBlank(line)) {
          var j = i + 1;
          while (j < lines.length && isBlank(lines[j])) j += 1;
          if (j < lines.length) {
            var afterBlank = matchListItem(lines[j]);
            var afterIndent = leadingSpaces(lines[j]);
            if ((afterBlank && afterBlank.indent === baseIndent && (afterBlank.type === 'ol') === ordered) || afterIndent > baseIndent) {
              itemLines.push('');
              loose = true;
              i += 1;
              continue;
            }
          }
          break;
        }

        var nextItem = matchListItem(line);
        if (nextItem && nextItem.indent === baseIndent) {
          break;
        }

        var indent = leadingSpaces(line);
        if (indent > baseIndent) {
          itemLines.push(line.slice(Math.min(contentIndent, indent)));
          i += 1;
          continue;
        }

        // 列表项里的惰性续行。
        if (!startsBlock(line) && itemLines[itemLines.length - 1] !== '') {
          itemLines.push(line.replace(/^\s+/, ''));
          i += 1;
          continue;
        }

        break;
      }

      items.push(itemLines);
    }

    var hasTask = false;
    var itemHtml = items.map(function (linesOfItem) {
      var working = linesOfItem.slice();
      var firstText = -1;
      for (var k = 0; k < working.length; k += 1) {
        if (!isBlank(working[k])) {
          firstText = k;
          break;
        }
      }

      var task = null;
      if (firstText >= 0) {
        var taskMatch = working[firstText].match(/^\[([ xX])\]\s*(.*)$/);
        if (taskMatch) {
          task = taskMatch[1].toLowerCase() === 'x';
          hasTask = true;
          working[firstText] = taskMatch[2];
        }
      }

      var body = parseBlocks(working, ctx, level);
      if (task === null) {
        return '<li>' + body + '</li>';
      }

      return '<li class="task-item">' +
        '<span class="task-box' + (task ? ' is-done' : '') + '" role="img" aria-label="' +
        (task ? '已完成' : '未完成') + '">' + (task ? '✓' : '') + '</span>' +
        '<div class="task-content">' + body + '</div></li>';
    }).join('');

    var classes = [];
    if (!loose) classes.push('tight');
    if (hasTask) classes.push('has-tasks');
    // 病态深度的列表不再继续增加缩进，避免把卡片撑出屏幕。
    if (level > 8) classes.push('deep-nest');
    var classAttr = classes.length ? ' class="' + classes.join(' ') + '"' : '';

    if (ordered) {
      return {
        html: '<ol' + classAttr + (listStart !== 1 ? ' start="' + listStart + '"' : '') + '>' + itemHtml + '</ol>',
        next: i
      };
    }
    return { html: '<ul' + classAttr + '>' + itemHtml + '</ul>', next: i };
  }

  function parseBlocks(lines, ctx, listLevel) {
    listLevel = listLevel || 0;
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (isBlank(line)) {
        i += 1;
        continue;
      }

      // 围栏代码块。
      var fence = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/);
      if (fence) {
        var fenceChar = fence[1].charAt(0);
        var fenceLength = fence[1].length;
        var info = fence[2] || '';
        var codeLines = [];
        i += 1;
        while (i < lines.length) {
          var close = lines[i].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
          if (close && close[1].charAt(0) === fenceChar && close[1].length >= fenceLength) {
            i += 1;
            break;
          }
          codeLines.push(lines[i]);
          i += 1;
        }
        out.push(codeBlock(codeLines.join('\n'), info));
        continue;
      }

      // ATX 标题。
      var heading = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/);
      if (heading) {
        var headingText = (heading[2] || '').replace(/[ \t]+#+[ \t]*$/, '').trim();
        out.push(addHeading(heading[1].length, headingText, ctx));
        i += 1;
        continue;
      }

      // 分割线。
      if (isHr(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      // 引用块 / GitHub 风格提示。
      if (/^ {0,3}>/.test(line)) {
        var quoteLines = [];
        while (i < lines.length) {
          var quote = lines[i].match(/^ {0,3}>[ \t]?(.*)$/);
          if (quote) {
            quoteLines.push(quote[1]);
            i += 1;
            continue;
          }
          if (isBlank(lines[i])) {
            var lookahead = i + 1;
            while (lookahead < lines.length && isBlank(lines[lookahead])) lookahead += 1;
            if (lookahead < lines.length && /^ {0,3}>/.test(lines[lookahead])) {
              quoteLines.push('');
              i += 1;
              continue;
            }
          }
          break;
        }

        var calloutTypes = {
          NOTE: { label: '笔记', icon: '✎' },
          TIP: { label: '小技巧', icon: '✦' },
          IMPORTANT: { label: '重要', icon: '!' },
          WARNING: { label: '注意', icon: '△' },
          CAUTION: { label: '警告', icon: '⚠' }
        };
        var calloutType = null;
        var calloutTitle = '';
        var firstLineIndex = -1;
        for (var q = 0; q < quoteLines.length; q += 1) {
          if (!isBlank(quoteLines[q])) {
            firstLineIndex = q;
            break;
          }
        }
        if (firstLineIndex >= 0) {
          var calloutMatch = quoteLines[firstLineIndex].match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
          if (calloutMatch) {
            calloutType = calloutMatch[1].toUpperCase();
            calloutTitle = calloutMatch[2].trim();
            quoteLines.splice(firstLineIndex, 1);
          }
        }

        var quoteBody = parseBlocks(quoteLines, ctx, listLevel);
        if (calloutType) {
          var infoBox = calloutTypes[calloutType];
          var titleHtml = calloutTitle ? renderInline(calloutTitle) : infoBox.label;
          out.push('<div class="callout callout-' + calloutType.toLowerCase() + '">' +
            '<div class="callout-head"><span class="callout-icon" aria-hidden="true">' + infoBox.icon + '</span>' +
            '<span>' + titleHtml + '</span></div>' +
            '<div class="callout-body">' + quoteBody + '</div></div>');
        } else {
          out.push('<blockquote>' + quoteBody + '</blockquote>');
        }
        continue;
      }

      // 表格。
      if (isTableStart(lines, i)) {
        var headers = splitTableRow(lines[i]);
        var delimiterCells = splitTableRow(lines[i + 1]);
        var aligns = delimiterCells.map(function (cell) {
          var value = cell.trim();
          if (/^:.*:$/.test(value)) return 'center';
          if (/:$/.test(value)) return 'right';
          if (/^:/.test(value)) return 'left';
          return '';
        });
        i += 2;
        var rows = [];
        while (i < lines.length && !isBlank(lines[i]) && lines[i].indexOf('|') >= 0) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        out.push(renderTable(headers, aligns, rows));
        continue;
      }

      // 缩进代码块。
      if (/^ {4}/.test(line)) {
        var indented = [];
        while (i < lines.length) {
          if (/^ {4}/.test(lines[i])) {
            indented.push(lines[i].slice(4));
            i += 1;
          } else if (isBlank(lines[i])) {
            var nextCode = i + 1;
            while (nextCode < lines.length && isBlank(lines[nextCode])) nextCode += 1;
            if (nextCode < lines.length && /^ {4}/.test(lines[nextCode])) {
              indented.push('');
              i += 1;
            } else {
              break;
            }
          } else {
            break;
          }
        }
        out.push(codeBlock(indented.join('\n'), ''));
        continue;
      }

      // 列表。
      var listMarker = matchListItem(line);
      if (listMarker && listMarker.indent <= 3) {
        var list = parseList(lines, i, ctx, listLevel + 1);
        out.push(list.html);
        i = list.next;
        continue;
      }

      // Setext 标题：标题 / ===
      if (i + 1 < lines.length && line.trim() && !startsBlock(line)) {
        var underline = lines[i + 1].match(/^ {0,3}(=+|-+)[ \t]*$/);
        if (underline) {
          var setextLevel = underline[1].charAt(0) === '=' ? 1 : 2;
          out.push(addHeading(setextLevel, line.trim(), ctx));
          i += 2;
          continue;
        }
      }

      // 段落。
      var paragraph = [line.replace(/^\s+/, '')];
      i += 1;
      while (i < lines.length) {
        if (isBlank(lines[i])) break;
        if (startsBlock(lines[i], i + 1 < lines.length ? lines[i + 1] : '')) break;
        paragraph.push(lines[i].replace(/^\s+/, ''));
        i += 1;
      }
      out.push('<p>' + renderInline(paragraph.join('\n')) + '</p>');
    }

    return out.join('\n');
  }

  function render(source) {
    var normalized = normalize(source);
    var front = extractFrontmatter(normalized);
    var ctx = { headings: [], usedIds: new Set() };
    var html = parseBlocks(front.body.split('\n'), ctx);
    return {
      html: html,
      headings: ctx.headings,
      meta: front.meta
    };
  }

  function inspect(source) {
    var normalized = normalize(source);
    var front = extractFrontmatter(normalized);
    var title = front.meta.title || '';
    if (!title) {
      var atx = front.body.match(/^ {0,3}#[ \t]+(.+)$/m);
      if (atx) {
        title = plainInline(atx[1].replace(/[ \t]+#+[ \t]*$/, ''));
      } else {
        var setext = front.body.match(/^ {0,3}(.+)\n {0,3}=+[ \t]*$/m);
        if (setext) title = plainInline(setext[1]);
      }
    }
    return { title: title, meta: front.meta, body: front.body };
  }

  function plainText(source) {
    var normalized = normalize(source);
    var front = extractFrontmatter(normalized);
    return front.body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/`[^`\n]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^ {0,3}(#{1,6}|>|[-+*]|\d+[.)])\s+/gm, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/[*_~=|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function countText(source) {
    var text = plainText(source);
    var cjk = (text.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length;
    var words = (text.replace(/[\u3400-\u9FFF\uF900-\uFAFF]/g, ' ').match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
    return {
      chars: text.length,
      cjk: cjk,
      words: words,
      minutes: Math.max(1, Math.round((cjk + words * 1.7) / 320))
    };
  }

  global.MiniMarkdown = {
    render: render,
    inspect: inspect,
    plainText: plainText,
    countText: countText,
    escapeHtml: escapeHtml
  };
})(window);
