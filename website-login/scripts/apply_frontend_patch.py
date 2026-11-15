#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
apply_frontend_patch.py — Biến file export tĩnh của Ads Manager Training
Simulator thành trang app có đăng nhập (public/app/index.html).

Cách dùng:
    python3 scripts/apply_frontend_patch.py [đường_dẫn_file_export]
Mặc định dùng file export mới nhất:
    ../ads-manager-training-simulator/ads-manager-training-simulator.html

Script KHÔNG sửa file gốc — chỉ đọc rồi ghi ra public/app/index.html.
Mỗi patch đều kiểm tra khớp đúng 1 lần; nếu mẫu nào không khớp (do file
export đổi cấu trúc), script dừng và báo rõ patch nào lỗi — không ghi file
nửa vời. Chạy lại script mỗi khi có file export mới (nội dung Tối ưu &
Đề xuất, case... thay đổi) để tái tạo trang app từ bản mới nhất.
"""
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_SRC = os.path.join(
    ROOT, '..', 'ads-manager-training-simulator',
    'ads-manager-training-simulator.html')
OUT = os.path.join(ROOT, 'public', 'app', 'index.html')

PATCHES = []

def patch(name, old, new):
    PATCHES.append((name, old, new))

# ---------------------------------------------------------------- P1: nạp bản nháp editor từ máy chủ (qua bridge) thay vì localStorage
patch('adset-draft-load',
      "try{adsetDraft=JSON.parse(localStorage.getItem(ADSET_DRAFT_KEY)||'{}')}catch(e){adsetDraft={}}",
      "try{adsetDraft=(window.__srv&&window.__srv.editorDraft)||{}}catch(e){adsetDraft={}}")

# ---------------------------------------------------------------- P2: lưu bản nháp editor lên máy chủ
patch('draftSet-save',
      "try{localStorage.setItem(ADSET_DRAFT_KEY,JSON.stringify(adsetDraft))}catch(e){}",
      "try{if(window.__srvSaveDraft)window.__srvSaveDraft(adsetDraft)}catch(e){}")

# ---------------------------------------------------------------- P3: đọc số liệu case từ cache máy chủ
patch('loadCaseState',
      "function loadCaseState(c){\n"
      "  try{var raw=localStorage.getItem(caseKey(c.id));if(raw){var s=JSON.parse(raw);if(s&&typeof s==='object'){c.fields.forEach(function(f){if(s[f.k]===undefined)s[f.k]=f.def});return s}}}catch(e){}",
      "function loadCaseState(c){\n"
      "  try{var s=window.__srv&&window.__srv.caseStates?window.__srv.caseStates[c.id]:null;if(s&&typeof s==='object'){c.fields.forEach(function(f){if(s[f.k]===undefined)s[f.k]=f.def});return s}}catch(e){}")

# ---------------------------------------------------------------- P4: lưu số liệu case lên máy chủ
patch('saveCaseState',
      "function saveCaseState(){if(!curCase)return;try{localStorage.setItem(caseKey(curCase.id),JSON.stringify(caseState))}catch(e){}}",
      "function saveCaseState(){if(!curCase)return;try{if(window.__srvSaveCase)window.__srvSaveCase(curCase.id,caseState)}catch(e){}}")

# ---------------------------------------------------------------- P5: xem đáp án -> đánh dấu đã xem trên máy chủ
patch('toggleAnswer',
      "function toggleAnswer(btn){var b=document.getElementById('answerBox');var show=!b.classList.contains('show');b.classList.toggle('show',show);btn.textContent=show?'Ẩn đáp án gợi ý':'Xem đáp án gợi ý'}",
      "function toggleAnswer(btn){var b=document.getElementById('answerBox');var show=!b.classList.contains('show');b.classList.toggle('show',show);btn.textContent=show?'Ẩn đáp án gợi ý':'Xem đáp án gợi ý';if(show){try{if(window.__srvMarkAnswer&&curCase)window.__srvMarkAnswer(curCase.id)}catch(e){}}}")

# ------------------------------------------------- P6: thêm ô Ghi chú vào trang chi tiết case
patch('case-notes-card',
      "    +'<div class=\"pcard\"><h3>Câu hỏi thảo luận</h3>",
      "    +'<div class=\"pcard\"><h3>Ghi chú của bạn</h3><p style=\"margin:0 0 8px;font-size:13px;color:var(--text2)\">Ghi chú lưu riêng theo tài khoản của bạn trên máy chủ — giáo viên xem được khi chấm bài.</p><textarea id=\"caseNotes\" rows=\"3\" style=\"width:100%;padding:9px 10px;border:1px solid #CCD0D5;border-radius:8px;font-size:13.5px\" oninput=\"window.__srvSaveNotes(window.__curCase.id,this.value)\">'+esc(window.__srv&&window.__srv.caseNotes?window.__srv.caseNotes[curCase.id]||'':'')+'</textarea></div>'\n"
      "    +'<div class=\"pcard\"><h3>Câu hỏi thảo luận</h3>")

# ------------------------------------------- P7: campaign của case — đọc/ghi override từ máy chủ
patch('campcfg-load',
      "  var saved={};try{saved=JSON.parse(localStorage.getItem('campcfg-'+caseId)||'{}')}catch(e){}",
      "  var saved={};try{saved=(window.__srv&&window.__srv.overrides?window.__srv.overrides[caseId]:null)||{}}catch(e){}")
patch('campcfg-name',
      "if(cn){cn.value=campName;cn.oninput=function(){try{var s2=JSON.parse(localStorage.getItem('campcfg-'+caseId)||'{}');s2.name=cn.value;localStorage.setItem('campcfg-'+caseId,JSON.stringify(s2))}catch(e){}}}",
      "if(cn){cn.value=campName;cn.oninput=function(){try{if(window.__srvSaveOverride)window.__srvSaveOverride(caseId,{name:cn.value})}catch(e){}}}")
patch('campcfg-budget',
      "if(String(inp.value).indexOf('VND')>-1){inp.value=amt;inp.oninput=function(){try{var s3=JSON.parse(localStorage.getItem('campcfg-'+caseId)||'{}');s3.budgetAmt=inp.value;localStorage.setItem('campcfg-'+caseId,JSON.stringify(s3))}catch(e){}}}",
      "if(String(inp.value).indexOf('VND')>-1){inp.value=amt;inp.oninput=function(){try{if(window.__srvSaveOverride)window.__srvSaveOverride(caseId,{budgetAmt:inp.value})}catch(e){}}}")

# ------------------------------------------- P8: Publish trong editor -> lưu chiến dịch nháp lên máy chủ
patch('editorNext-publish',
      "  toast('Đã đăng (mô phỏng) — không có quảng cáo thật nào được chạy và không phát sinh chi phí.');",
      "  toast('Đã đăng (mô phỏng) — không có quảng cáo thật nào được chạy và không phát sinh chi phí.');\n"
      "  try{if(window.__srvPublishDraft)window.__srvPublishDraft(editorObjective,adsetDraft,collectEditorLines())}catch(e){}")

# ------------------------------------------- P9: mở lại bản nháp của học viên trong editor
patch('openEditorForSelected-mine',
      "    if(r&&r.caseId){openCaseCampaign(r.caseId,curTab==='campaigns'?0:(curTab==='adsets'?1:2));return}",
      "    if(r&&r.caseId){openCaseCampaign(r.caseId,curTab==='campaigns'?0:(curTab==='adsets'?1:2));return}\n"
      "    if(r&&r.mine&&r.settings&&r.settings.adsetDraft){adsetDraft=r.settings.adsetDraft;editorObjective=r.objective;openEditorForObjective(r.objective);var cnm=document.getElementById('campNameInput');if(cnm)cnm.value=r.name;document.getElementById('crumbCamp').textContent=r.name;document.getElementById('treeCampName').textContent=r.name;toast('Đang mở bản nháp của bạn: '+r.name+' — chỉnh xong bấm Publish để lưu lại.');return}")

# ------------------------------------------- P10: xuất Word cho chiến dịch nháp (dùng dòng đã lưu)
patch('doExportWord-mine',
      "    lines=lines.concat(collectRowLines(r));",
      "    lines=lines.concat((r.mine&&r.settings&&r.settings.lines&&r.settings.lines.length)?r.settings.lines:collectRowLines(r));")

# ------------------------------------------- P11: điền sẵn tên học viên vào hộp thoại xuất Word
patch('wordPrefill-row',
      "  wordCtx={type:'row',id:id};\n"
      "  document.getElementById('wordCampName').textContent=r.name;",
      "  wordCtx={type:'row',id:id};\n"
      "  document.getElementById('wordCampName').textContent=r.name;\n"
      "  var ws=document.getElementById('wordStudent');if(ws&&window.__srv&&window.__srv.user)ws.value=window.__srv.user.displayName;")
patch('wordPrefill-editor',
      "  wordCtx={type:'editor'};\n"
      "  var cn=document.getElementById('campNameInput');\n"
      "  document.getElementById('wordCampName').textContent=(cn&&cn.value)||('New '+editorObjective+' campaign');",
      "  wordCtx={type:'editor'};\n"
      "  var cn=document.getElementById('campNameInput');\n"
      "  document.getElementById('wordCampName').textContent=(cn&&cn.value)||('New '+editorObjective+' campaign');\n"
      "  var ws2=document.getElementById('wordStudent');if(ws2&&window.__srv&&window.__srv.user)ws2.value=window.__srv.user.displayName;")

# ------------------------------------------- P12: cầu nối cho bridge (thêm hàng nháp + case hiện tại)
patch('bridge-helpers',
      "/* Expose every handler referenced by inline on* attributes on window.",
      "/* Cầu nối bản đăng nhập (máy chủ): cho bridge thêm chiến dịch nháp của học viên vào bảng. */\n"
      "function __srvAddDraftRow(row){CAMPAIGNS.push(row);if(typeof renderTable==='function')renderTable();}\n"
      "Object.defineProperty(window,'__curCase',{configurable:true,get:function(){return curCase}});\n"
      "/* Expose every handler referenced by inline on* attributes on window.")
patch('bridge-export-names',
      "'doExportWord'];",
      "'doExportWord','__srvAddDraftRow'];")
patch('bridge-export-scope',
      "doExportWord:doExportWord};",
      "doExportWord:doExportWord,__srvAddDraftRow:__srvAddDraftRow};")

# ------------------------------------------- P13: đổi câu chữ localStorage -> lưu theo tài khoản
patch('text-case-intro',
      "chỉnh sửa và lưu riêng trên trình duyệt của từng người</strong> (localStorage)",
      "chỉnh sửa và lưu riêng theo tài khoản của từng người trên máy chủ</strong>")
patch('text-draft-state',
      "Dữ liệu chỉnh sửa lưu riêng trên trình duyệt này",
      "Dữ liệu chỉnh sửa lưu riêng theo tài khoản của bạn trên máy chủ")
patch('text-adset-comment',
      "/* ---- Ad set draft state: mọi lựa chọn ở bước Ad set lưu riêng trên trình duyệt này ---- */",
      "/* ---- Ad set draft state: mọi lựa chọn ở bước Ad set lưu riêng theo tài khoản trên máy chủ ---- */")
patch('text-case-sliders',
      "được lưu riêng trên trình duyệt này (localStorage) — học viên khác không bị ảnh hưởng.",
      "được lưu riêng theo tài khoản của bạn trên máy chủ — học viên khác không bị ảnh hưởng.")
patch('text-casecamp-toast',
      "thay đổi lưu riêng trên trình duyệt này.",
      "thay đổi lưu riêng theo tài khoản của bạn trên máy chủ.")
patch('text-reset-toast',
      "Đã khôi phục số liệu gốc của case này trên trình duyệt của bạn.",
      "Đã khôi phục số liệu gốc của case này trên tài khoản của bạn.")

# ------------------------------------------- P14: nạp bridge.js
patch('inject-bridge',
      "</script>\n</body>\n</html>",
      "</script>\n<script src=\"bridge.js\"></script>\n</body>\n</html>")


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    src = os.path.normpath(src)
    if not os.path.isfile(src):
        print('LỖI: không tìm thấy file export: ' + src)
        return 1
    with open(src, 'r', encoding='utf-8') as f:
        html = f.read()
    print('Nguồn: %s (%d bytes, %d dòng)' % (src, len(html.encode('utf-8')), html.count('\n') + 1))

    failed = []
    for name, old, new in PATCHES:
        n = html.count(old)
        if n != 1:
            failed.append((name, n))
            print('  [LỖI] %-28s khớp %d lần (cần đúng 1)' % (name, n))
            continue
        html = html.replace(old, new)
        print('  [OK]   %s' % name)
    if failed:
        print('\nDỪNG: %d patch không khớp — KHÔNG ghi file. Kiểm tra file export có đổi cấu trúc không.' % len(failed))
        return 2

    # Kiểm tra an toàn: không còn localStorage nào, bridge đã nạp, file đóng thẻ đúng.
    problems = []
    if 'localStorage' in html:
        problems.append('vẫn còn chuỗi localStorage trong file đầu ra')
    if '<script src="bridge.js"></script>' not in html:
        problems.append('thiếu thẻ nạp bridge.js')
    if not html.rstrip().endswith('</html>'):
        problems.append('file không kết thúc bằng </html>')
    if '__srvSaveCase' not in html or '__srvPublishDraft' not in html:
        problems.append('thiếu hàm cầu nối __srv*')
    if problems:
        print('\nDỪNG: kiểm tra an toàn lỗi: ' + '; '.join(problems))
        return 3

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print('\nXong: %s (%d bytes, %d dòng)' % (OUT, len(html.encode('utf-8')), html.count('\n') + 1))
    print('Trang app đã sẵn sàng tại public/app/index.html (mở qua máy chủ, yêu cầu đăng nhập).')
    return 0

if __name__ == '__main__':
    sys.exit(main())
