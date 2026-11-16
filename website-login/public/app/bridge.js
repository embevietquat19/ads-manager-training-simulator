'use strict';
/**
 * bridge.js — Cầu nối giữa bản mô phỏng (file HTML tĩnh) và API máy chủ.
 *
 * File này được nạp sau các script chính của trang mô phỏng. Nó:
 *  - Tải toàn bộ dữ liệu riêng của học viên đang đăng nhập (/api/bootstrap):
 *    số liệu case, đáp án đã xem, ghi chú, campaign đã sửa, bản nháp editor,
 *    tệp Audiences do học viên tạo, chiến dịch nháp đã Publish, thông báo + số chưa đọc.
 *  - Cung cấp các hàm window.__srv* mà các đoạn mã đã patch trong trang gọi
 *    tới mỗi khi học viên chỉnh số liệu / xem đáp án / ghi chú / Publish.
 *  - Thêm chiến dịch nháp của học viên vào bảng Campaigns, chuông thông báo
 *    thật (thay cho toast mẫu), chip tên tài khoản + nút Đăng xuất / Quản trị.
 *
 * Mọi dữ liệu riêng đều lưu trên máy chủ theo tài khoản — không còn localStorage.
 */
(function () {
  var srv = (window.__srv = {
    user: null,
    caseStates: {}, // caseId -> {field: value}
    caseViewed: {}, // caseId -> true
    caseNotes: {}, // caseId -> string
    overrides: {}, // caseId -> {name, budgetAmt}
    editorDraft: {},
    audiences: [], // tệp Custom / Lookalike do học viên tạo (chỉ metadata)
    audiencesReady: false, // true khi bootstrap đã nạp xong danh sách từ máy chủ
    myDrafts: [],
    announcements: [],
    unreadCount: 0,
  });

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function api(method, path, body) {
    var opts = {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts)
      .then(function (r) {
        if (r.status === 401) {
          location.href = '/login';
          throw new Error('unauthorized');
        }
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .catch(function (e) {
        if (e && e.message === 'unauthorized') throw e;
        return { ok: false, error: 'network' };
      });
  }

  function debounce(fn, ms) {
    var t = null;
    var lastArgs = null;
    var lastThis = null;
    return function () {
      lastArgs = arguments;
      lastThis = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(lastThis, lastArgs);
      }, ms);
    };
  }

  // ---- Lưu số liệu case (ghi đè toàn bộ state của case) ----
  window.__srvSaveCase = debounce(function (caseId, state) {
    if (!caseId) return;
    try {
      srv.caseStates[caseId] = JSON.parse(JSON.stringify(state));
    } catch (e) {}
    api('PUT', '/api/case/' + encodeURIComponent(caseId), {
      state: state,
    });
  }, 600);

  // ---- Đánh dấu đã xem đáp án gợi ý ----
  window.__srvMarkAnswer = function (caseId) {
    if (!caseId || srv.caseViewed[caseId]) return;
    srv.caseViewed[caseId] = true;
    api('POST', '/api/case/' + encodeURIComponent(caseId) + '/answer', {});
  };

  // ---- Lưu ghi chú trong case ----
  window.__srvSaveNotes = debounce(function (caseId, notes) {
    if (!caseId) return;
    srv.caseNotes[caseId] = notes;
    api('PUT', '/api/case/' + encodeURIComponent(caseId) + '/notes', {
      notes: notes,
    });
  }, 800);

  // ---- Lưu tên / ngân sách sửa ở campaign của case (gộp nhiều lần sửa) ----
  var pendingOverrides = {};
  var overrideTimers = {};
  window.__srvSaveOverride = function (caseId, patch) {
    if (!caseId) return;
    pendingOverrides[caseId] = Object.assign(
      pendingOverrides[caseId] || {},
      patch
    );
    clearTimeout(overrideTimers[caseId]);
    overrideTimers[caseId] = setTimeout(function () {
      var p = pendingOverrides[caseId];
      delete pendingOverrides[caseId];
      var cur = srv.overrides[caseId] || {};
      var merged = Object.assign({}, cur, p);
      srv.overrides[caseId] = merged;
      api('PUT', '/api/campaign-override/' + encodeURIComponent(caseId), merged);
    }, 700);
  };

  // ---- Lưu bản nháp trình chỉnh sửa đang làm dở ----
  window.__srvSaveDraft = debounce(function (draft) {
    try {
      srv.editorDraft = JSON.parse(JSON.stringify(draft));
    } catch (e) {}
    api('PUT', '/api/editor-draft', { draft: draft });
  }, 800);

  // ---- Lưu danh sách Audiences do học viên tạo (chỉ metadata, không có nội dung file) ----
  // Edge case: học viên tạo tệp trước khi bootstrap nạp xong thì audLoad() trả []
  // và lần lưu đầu có thể ghi đè (xoá) danh sách cũ trên máy chủ. Xử lý: khi
  // bootstrap chưa xong, chỉ giữ bản lưu chờ (pendingAudiences) mà KHÔNG PUT;
  // bootstrap xong sẽ gộp bản chờ vào danh sách máy chủ (trùng id thì bản chờ
  // thắng) rồi mới PUT danh sách đã gộp lên. Nhờ đó tệp tạo sớm không bị mất
  // và cũng không xoá mất tệp cũ.
  var pendingAudiences = null;
  window.__srvSaveAudiences = debounce(function (list) {
    var copy = [];
    try {
      copy = JSON.parse(JSON.stringify(list || []));
    } catch (e) {
      copy = [];
    }
    if (!srv.audiencesReady) {
      pendingAudiences = copy;
      return;
    }
    srv.audiences = copy;
    api('PUT', '/api/audiences', { audiences: copy });
  }, 600);

  // ---- Publish (mô phỏng) trong editor -> lưu chiến dịch nháp theo tài khoản ----
  window.__srvPublishDraft = function (objective, adsetDraft, lines) {
    var cn = document.getElementById('campNameInput');
    var name =
      (cn && cn.value) || 'New ' + (objective || '') + ' campaign';
    var settings = { adsetDraft: adsetDraft || {}, lines: lines || [] };
    api('POST', '/api/drafts', {
      name: name,
      objective: objective || '',
      settings: settings,
    }).then(function (r) {
      if (r && r.ok) {
        var row = mineRow(r.id, name, objective, settings);
        if (window.__srvAddDraftRow) window.__srvAddDraftRow(row);
        if (window.toast)
          window.toast(
            'Đã lưu bản nháp “' + name + '” theo tài khoản của bạn trên máy chủ.'
          );
      }
    });
  };

  function mineRow(id, name, objective, settings) {
    var budget = '';
    try {
      var b =
        settings && settings.adsetDraft && settings.adsetDraft.budgetAmt;
      if (b !== undefined && b !== null && String(b) !== '') budget = String(b);
    } catch (e) {}
    return {
      id: 'mine-' + id,
      name: name,
      objective: objective || '',
      active: false,
      budget: budget || '—',
      budgetSub: 'Nháp của bạn',
      ends: 'Ongoing',
      bid: 'Highest volume',
      schedule: 'Ongoing',
      adsetName: '—',
      m: {},
      mine: true,
      settings: settings || {},
    };
  }

  // ---- Topbar: chip tài khoản + nút Quản trị (giáo viên) + Đăng xuất ----
  function injectTopbar() {
    var actions = document.querySelector('.top-actions');
    if (!actions || !srv.user) return;
    var chip = document.createElement('span');
    chip.className = 'updated';
    chip.style.fontWeight = '600';
    chip.style.color = '#1C1E21';
    chip.textContent =
      srv.user.displayName +
      ' (' +
      (srv.user.role === 'teacher' ? 'Giáo viên' : 'Học viên') +
      ')';
    actions.appendChild(chip);
    if (srv.user.role === 'teacher') {
      var adminBtn = document.createElement('button');
      adminBtn.className = 'tbtn';
      adminBtn.textContent = 'Quản trị lớp học';
      adminBtn.onclick = function () {
        location.href = '/admin';
      };
      actions.appendChild(adminBtn);
    }
    var outBtn = document.createElement('button');
    outBtn.className = 'tbtn';
    outBtn.textContent = 'Đăng xuất';
    outBtn.onclick = function () {
      api('POST', '/api/auth/logout', {}).then(function () {
        location.href = '/login';
      });
    };
    actions.appendChild(outBtn);
  }

  // ---- Thông báo: chuông thật + thanh thông báo mới + panel danh sách ----
  function renderAnnouncements() {
    var bell = document.querySelector('button[title="Notifications"]');
    if (bell) {
      var dot = bell.querySelector('.bdot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'bdot';
        bell.appendChild(dot);
      }
      dot.textContent = String(srv.unreadCount || 0);
      dot.style.display = srv.unreadCount ? '' : 'none';
      bell.onclick = function () {
        toggleAnnPanel();
      };
    }
    var unread = srv.announcements.filter(function (a) {
      return !a.read;
    });
    var banner = document.getElementById('testBanner');
    if (banner && unread.length && !document.getElementById('srvAnnBar')) {
      var bar = document.createElement('div');
      bar.id = 'srvAnnBar';
      bar.style.cssText =
        'background:#FFF8E1;border:1px solid #FFE082;border-radius:8px;padding:10px 14px;margin:10px 12px 0;font-size:13.5px';
      bar.innerHTML =
        '<b>📢 Thông báo mới từ giảng viên:</b> ' +
        escHtml(unread[0].title) +
        ' — ' +
        escHtml(String(unread[0].body || '').slice(0, 160)) +
        ' <a href="#" id="srvAnnMore">Xem tất cả</a>' +
        '<button id="srvAnnHide" style="float:right;border:0;background:none;cursor:pointer;font-size:15px" aria-label="Ẩn">✕</button>';
      banner.parentNode.insertBefore(bar, banner.nextSibling);
      document.getElementById('srvAnnMore').onclick = function (e) {
        e.preventDefault();
        toggleAnnPanel();
      };
      document.getElementById('srvAnnHide').onclick = function () {
        bar.remove();
      };
    }
  }

  function toggleAnnPanel() {
    var p = document.getElementById('srvAnnPanel');
    if (p) {
      p.remove();
      return;
    }
    p = document.createElement('div');
    p.id = 'srvAnnPanel';
    p.style.cssText =
      'position:fixed;top:60px;right:16px;z-index:9999;width:380px;max-width:92vw;max-height:70vh;overflow:auto;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:14px;font-size:13.5px';
    var h =
      '<div style="display:flex;justify-content:space-between;align-items:center"><b>Thông báo của giảng viên</b><button id="srvAnnClose" style="border:0;background:none;font-size:16px;cursor:pointer">✕</button></div>';
    if (!srv.announcements.length)
      h += '<p style="color:#65676B">Chưa có thông báo nào.</p>';
    srv.announcements.forEach(function (a) {
      h +=
        '<div style="border-top:1px solid #eee;padding:10px 0' +
        (a.read ? '' : ';background:#FFF8E1') +
        '"><b>' +
        escHtml(a.title) +
        '</b><div style="color:#65676B;font-size:12px">' +
        escHtml(a.createdAt || '') +
        '</div><div style="white-space:pre-wrap;margin-top:4px">' +
        escHtml(a.body) +
        '</div></div>';
    });
    p.innerHTML = h;
    document.body.appendChild(p);
    document.getElementById('srvAnnClose').onclick = function () {
      p.remove();
    };
    // Mở panel = đã đọc hết các thông báo chưa đọc.
    srv.announcements
      .filter(function (a) {
        return !a.read;
      })
      .forEach(function (a) {
        api('POST', '/api/announcements/' + a.id + '/read', {}).then(
          function () {
            a.read = true;
          }
        );
      });
    srv.unreadCount = 0;
    var dot = document.querySelector(
      'button[title="Notifications"] .bdot'
    );
    if (dot) dot.style.display = 'none';
    var bar = document.getElementById('srvAnnBar');
    if (bar) bar.remove();
  }

  // ---- Khởi động: tải dữ liệu riêng rồi khôi phục vào trang ----
  function bootstrap() {
    api('GET', '/api/bootstrap').then(function (data) {
      if (!data || !data.ok) {
        location.href = '/login';
        return;
      }
      srv.user = data.user;
      Object.keys(data.cases || {}).forEach(function (cid) {
        var c = data.cases[cid] || {};
        srv.caseStates[cid] = c.state || {};
        srv.caseViewed[cid] = !!c.viewedAnswer;
        srv.caseNotes[cid] = c.notes || '';
      });
      srv.overrides = data.overrides || {};
      srv.editorDraft = data.editorDraft || {};
      srv.audiences = Array.isArray(data.audiences) ? data.audiences : [];
      srv.audiencesReady = true;
      // Gộp bản lưu chờ (nếu học viên tạo tệp trước khi bootstrap xong) rồi
      // đẩy danh sách đã gộp lên máy chủ — xem ghi chú ở __srvSaveAudiences.
      if (pendingAudiences) {
        var merged = srv.audiences.slice();
        pendingAudiences.forEach(function (a) {
          var idx = -1;
          for (var i = 0; i < merged.length; i++) {
            if (merged[i] && merged[i].id === a.id) {
              idx = i;
              break;
            }
          }
          if (idx >= 0) merged[idx] = a;
          else merged.push(a);
        });
        pendingAudiences = null;
        srv.audiences = merged;
        api('PUT', '/api/audiences', { audiences: merged });
      }
      srv.myDrafts = data.myDrafts || [];
      srv.announcements = data.announcements || [];
      srv.unreadCount = data.unreadCount || 0;

      // Khôi phục bản nháp editor đang làm dở (qua draftSet của trang).
      if (window.draftSet) {
        Object.keys(srv.editorDraft).forEach(function (k) {
          try {
            window.draftSet(k, srv.editorDraft[k]);
          } catch (e) {}
        });
      }
      // Đưa các chiến dịch nháp đã Publish vào bảng Campaigns.
      srv.myDrafts.forEach(function (d) {
        if (window.__srvAddDraftRow) {
          try {
            window.__srvAddDraftRow(
              mineRow(d.id, d.name, d.objective, d.settings || {})
            );
          } catch (e) {}
        }
      });
      injectTopbar();
      renderAnnouncements();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
