#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kiểm thử API website đăng nhập (chạy khi server đang chạy ở BASE)."""
import json
import sys
import urllib.request
import urllib.error
import http.cookiejar

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3101'

passed = []
failed = []

def check(name, cond, extra=''):
    if cond:
        passed.append(name)
        print('  PASS  %s' % name)
    else:
        failed.append(name)
        print('  FAIL  %s  %s' % (name, extra))

class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Không tự theo redirect — để kiểm tra mã 302 của máy chủ."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            NoRedirect(), urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, method, path, body=None, headers=None):
        url = BASE + path
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(url, data=data, method=method)
        r.add_header('Content-Type', 'application/json')
        if headers:
            for k, v in headers.items():
                r.add_header(k, v)
        try:
            with self.opener.open(r) as resp:
                raw = resp.read().decode()
                return resp.status, resp.headers, raw
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read().decode()

    def j(self, method, path, body=None):
        st, hd, raw = self.req(method, path, body)
        try:
            return st, json.loads(raw)
        except Exception:
            return st, {'_raw': raw}

anon = Client()
teacher = Client()
stuA = Client()
stuB = Client()

print('== 1. Trạng thái ban đầu ==')
st, j = anon.j('GET', '/api/auth/state')
check('state needsSetup=true', st == 200 and j.get('needsSetup') is True, str(j))
st, hd, raw = anon.req('GET', '/')
check('GET / chưa đăng nhập -> redirect /login', st in (301, 302) and '/login' in hd.get('Location', ''), str(st))
st, hd, raw = anon.req('GET', '/app/')
check('GET /app/ chưa đăng nhập -> redirect /login', st in (301, 302) and '/login' in hd.get('Location', ''), str(st))
st, hd, raw = anon.req('GET', '/login')
check('GET /login -> 200, có form đăng nhập', st == 200 and 'Đăng nhập lớp học' in raw, str(st))

print('== 2. Thiết lập giáo viên lần đầu ==')
st, j = anon.j('POST', '/api/auth/setup', {'username': 'giaovien', 'displayName': 'Giáo viên', 'password': 'MatKhauManh123'})
check('setup giáo viên 200', st == 200 and j.get('ok') is True, str(j))
st, j = anon.j('POST', '/api/auth/setup', {'username': 'gv2', 'displayName': 'GV2', 'password': 'MatKhauManh123'})
check('setup lần 2 -> 403 already_setup', st == 403 and j.get('error') == 'already_setup', str(j))
# anon đã đăng nhập bằng tài khoản giáo viên vừa tạo (cookie từ setup) -> dùng làm teacher
teacher = anon
st, j = teacher.j('GET', '/api/auth/me')
check('me = giáo viên', st == 200 and j['user']['role'] == 'teacher', str(j))

print('== 3. Tạo học viên ==')
st, j = teacher.j('POST', '/api/admin/students', {'username': 'hv01', 'displayName': 'Học viên 01', 'password': 'pass1234'})
check('tạo hv01 201', st == 201 and j.get('ok') is True, str(j))
stuA_id = j['student']['id']
st, j = teacher.j('POST', '/api/admin/students', {'username': 'hv02', 'displayName': 'Học viên 02', 'password': 'pass1234'})
check('tạo hv02 201', st == 201, str(j))
stuB_id = j['student']['id']
st, j = teacher.j('POST', '/api/admin/students', {'username': 'hv01', 'displayName': 'Trùng', 'password': 'pass1234'})
check('tạo trùng username -> 400', st == 400, str(j))

print('== 4. Đăng nhập học viên + bootstrap ==')
st, j = stuA.j('POST', '/api/auth/login', {'username': 'hv01', 'password': 'pass1234'})
check('hv01 đăng nhập 200', st == 200 and j['user']['role'] == 'student', str(j))
st, j = stuB.j('POST', '/api/auth/login', {'username': 'hv02', 'password': 'pass1234'})
check('hv02 đăng nhập 200', st == 200, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
check('bootstrap hv01: cases rỗng, drafts rỗng', st == 200 and j.get('cases') == {} and j.get('myDrafts') == [], str(j))

print('== 5. Học viên A lưu bài làm ==')
st, j = stuA.j('PUT', '/api/case/case6', {'state': {'msgs': 30, 'closeRate': 20}})
check('lưu số liệu case6', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('POST', '/api/case/case6/answer', {})
check('đánh dấu xem đáp án case6', st == 200, str(j))
st, j = stuA.j('PUT', '/api/case/case6/notes', {'notes': 'Ghi chú test của hv01'})
check('lưu ghi chú case6', st == 200, str(j))
st, j = stuA.j('PUT', '/api/campaign-override/case6', {'name': 'Camp test case 6', 'budgetAmt': '₫500.000'})
check('lưu override campaign case6', st == 200, str(j))
st, j = stuA.j('PUT', '/api/editor-draft', {'draft': {'advAud': False, 'locations': [{'name': 'Vietnam', 'mode': 'include', 'radius': ''}]}})
check('lưu bản nháp editor', st == 200, str(j))
st, j = stuA.j('POST', '/api/drafts', {'name': 'Camp test của A', 'objective': 'Sales', 'settings': {'adsetDraft': {'advAud': False}, 'lines': [['h1', '1. CHIẾN DỊCH'], ['body', 'Tên chiến dịch: Camp test của A']]}})
check('Publish -> tạo draft 201', st == 201 and j.get('ok') is True, str(j))
draft_id = j.get('id')

print('== 6. Bootstrap lại: dữ liệu còn theo tài khoản ==')
st, j = stuA.j('GET', '/api/bootstrap')
c6 = j.get('cases', {}).get('case6', {})
check('bootstrap thấy state case6', c6.get('state') == {'msgs': 30, 'closeRate': 20}, str(c6))
check('bootstrap thấy viewedAnswer', c6.get('viewedAnswer') is True, str(c6))
check('bootstrap thấy notes', c6.get('notes') == 'Ghi chú test của hv01', str(c6))
check('bootstrap thấy override', j.get('overrides', {}).get('case6') == {'name': 'Camp test case 6', 'budgetAmt': '₫500.000'}, str(j.get('overrides')))
check('bootstrap thấy editorDraft', j.get('editorDraft', {}).get('advAud') is False, str(j.get('editorDraft')))
check('bootstrap thấy 1 draft', len(j.get('myDrafts', [])) == 1 and j['myDrafts'][0]['name'] == 'Camp test của A', str(j.get('myDrafts')))

print('== 7. Giáo viên xem bài làm ==')
st, j = teacher.j('GET', '/api/admin/students')
rowA = [s for s in j.get('students', []) if s['username'] == 'hv01'][0]
check('tổng quan: hv01 1 case, 1 đáp án, 1 draft', rowA['casesDone'] == 1 and rowA['answersViewed'] == 1 and rowA['draftsCount'] == 1, str(rowA))
st, j = teacher.j('GET', '/api/admin/students/%d/work' % stuA_id)
check('xem bài làm hv01: đủ case + draft', st == 200 and len(j.get('cases', [])) == 1 and len(j.get('drafts', [])) == 1, str(j)[:300])
check('bài làm có ghi chú', j['cases'][0]['notes'] == 'Ghi chú test của hv01', str(j['cases']))

print('== 8. Phân quyền: học viên không xem được bài người khác ==')
st, j = stuB.j('GET', '/api/admin/students/%d/work' % stuA_id)
check('hv02 xem bài hv01 -> 403', st == 403, str(st))
st, j = stuB.j('POST', '/api/admin/students', {'username': 'hv03', 'displayName': 'X', 'password': 'pass1234'})
check('hv02 tạo học viên -> 403', st == 403, str(st))
st, j = stuB.j('GET', '/api/drafts')
check('hv02 chỉ thấy draft của mình (rỗng)', st == 200 and j.get('drafts') == [], str(j))
st, j = stuB.j('GET', '/api/admin/students')
check('hv02 liệt kê học viên -> 403', st == 403, str(st))

print('== 9. Thông báo ==')
st, j = teacher.j('POST', '/api/admin/announcements', {'title': 'Nhắc lịch nộp bài', 'body': 'Các bạn nộp bài tập tuần này trước thứ 6 nhé.'})
check('giáo viên tạo thông báo 201', st == 201, str(j))
ann_id = j.get('id')
st, j = stuB.j('POST', '/api/admin/announcements', {'title': 'X', 'body': 'Y'})
check('hv02 tạo thông báo -> 403', st == 403, str(st))
st, j = stuA.j('GET', '/api/announcements')
check('hv01 thấy 1 thông báo chưa đọc', st == 200 and j.get('unreadCount') == 1, str(j))
st, j = stuA.j('POST', '/api/announcements/%d/read' % ann_id, {})
check('hv01 đánh dấu đã đọc', st == 200, str(j))
st, j = stuA.j('GET', '/api/announcements')
check('hv01 unreadCount về 0', j.get('unreadCount') == 0, str(j))
st, j = stuB.j('GET', '/api/announcements')
check('hv02 vẫn chưa đọc (1)', j.get('unreadCount') == 1, str(j))

print('== 10. Vô hiệu hoá / kích hoạt lại ==')
st, j = teacher.j('POST', '/api/admin/students/%d/set-active' % stuA_id, {'active': False})
check('vô hiệu hoá hv01', st == 200 and j.get('active') is False, str(j))
st, j = stuA.j('POST', '/api/auth/login', {'username': 'hv01', 'password': 'pass1234'})
check('hv01 bị vô hiệu hoá -> đăng nhập 403', st == 403 and j.get('error') == 'account_disabled', str(j))
st, j = stuA.j('GET', '/api/auth/me')
check('phiên cũ của hv01 bị vô hiệu (401)', st == 401, str(st))
st, j = teacher.j('POST', '/api/admin/students/%d/set-active' % stuA_id, {'active': True})
check('kích hoạt lại hv01', st == 200 and j.get('active') is True, str(j))
st, j = stuA.j('POST', '/api/auth/login', {'username': 'hv01', 'password': 'pass1234'})
check('hv01 đăng nhập lại được', st == 200, str(j))

print('== 11. Đặt lại mật khẩu ==')
st, j = teacher.j('POST', '/api/admin/students/%d/reset-password' % stuA_id, {'password': 'moiPass99'})
check('reset mật khẩu hv01', st == 200, str(j))
st, j = stuA.j('POST', '/api/auth/login', {'username': 'hv01', 'password': 'pass1234'})
check('mật khẩu cũ không vào được', st == 401, str(st))
st, j = stuA.j('POST', '/api/auth/login', {'username': 'hv01', 'password': 'moiPass99'})
check('mật khẩu mới vào được', st == 200, str(j))

print('== 12. Trang app + admin (phân quyền trang) ==')
st, hd, raw = stuA.req('GET', '/app/')
check('hv01 mở /app/ -> 200, có bridge + TEST ENVIRONMENT', st == 200 and 'bridge.js' in raw and 'TEST ENVIRONMENT' in raw, str(st)[:200])
st, hd, raw = stuA.req('GET', '/app/bridge.js')
check('bridge.js tải được', st == 200 and '__srvSaveCase' in raw, str(st)[:200])
st, hd, raw = stuB.req('GET', '/admin')
check('hv02 mở /admin -> chuyển về /app/', st in (301, 302) and '/app/' in hd.get('Location', ''), str(st))
st, hd, raw = teacher.req('GET', '/admin')
check('giáo viên mở /admin -> 200', st == 200 and 'Quản trị lớp học' in raw, str(st)[:200])
st, j = teacher.j('GET', '/api/admin/export')
check('export JSON sao lưu', st == 200 and 'students' in j and len(j['students']) == 2, str(j)[:200])

print('== 13. Giáo viên tự đổi mật khẩu ==')
st, j = stuA.j('POST', '/api/teacher/change-password', {'currentPassword': 'pass1234', 'newPassword': 'moiPass99'})
check('học viên đổi mật khẩu giáo viên -> 403', st == 403, str(j))
st, j = teacher.j('POST', '/api/teacher/change-password', {'currentPassword': 'sai', 'newPassword': 'GvMoiManh99'})
check('mật khẩu hiện tại sai -> 400', st == 400 and j.get('error') == 'wrong_current_password', str(j))
st, j = teacher.j('POST', '/api/teacher/change-password', {'currentPassword': 'MatKhauManh123', 'newPassword': 'MatKhauManh123'})
check('mật khẩu mới trùng cũ -> 400', st == 400 and j.get('error') == 'same_password', str(j))
st, j = teacher.j('POST', '/api/teacher/change-password', {'currentPassword': 'MatKhauManh123', 'newPassword': 'GvMoiManh99'})
check('đổi mật khẩu giáo viên 200', st == 200 and j.get('ok') is True, str(j))
st, j = teacher.j('POST', '/api/auth/login', {'username': 'giaovien', 'password': 'MatKhauManh123'})
check('mật khẩu giáo viên cũ không vào được', st == 401, str(j))
st, j = teacher.j('POST', '/api/auth/login', {'username': 'giaovien', 'password': 'GvMoiManh99'})
check('mật khẩu giáo viên mới vào được', st == 200 and j['user']['role'] == 'teacher', str(j))


print('== 14. Audiences (Custom + Lookalike, lưu riêng theo tài khoản) ==')
anon2 = Client()
aud_custom = {'id': 'aud1', 'name': 'Khách đã mua — 2026', 'type': 'custom', 'source': 'Customer list', 'columns': [{'col': 'email', 'as': 'email'}, {'col': 'phone', 'as': 'phone'}], 'rows': 200, 'created': '16/11/2026'}
aud_lal = {'id': 'aud2', 'name': 'Lookalike — Khách đã mua — 2026', 'type': 'lookalike', 'source': 'Khách đã mua — 2026', 'pct': 1, 'rows': 980000, 'created': '16/11/2026'}
st, j = anon2.j('PUT', '/api/audiences', {'audiences': [aud_custom]})
check('chưa đăng nhập lưu audiences -> 401', st == 401, str(st))
st, j = stuA.j('PUT', '/api/audiences', {'audiences': 'khong-phai-mang'})
check('audiences không phải mảng -> 400', st == 400 and j.get('error') == 'bad_audiences', str(j))
st, j = stuA.j('PUT', '/api/audiences', {'audiences': [{'id': 'x', 'name': 'Sai', 'type': 'saved', 'source': '', 'rows': 0, 'created': ''}]})
check('type ngoài custom/lookalike -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/audiences', {'audiences': [dict(aud_custom, hack='x')]})
check('key lạ trong tệp -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/audiences', {'audiences': [dict(aud_custom, name='N' * 201)]})
check('tên quá 200 ký tự -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/audiences', {'audiences': [dict(aud_custom, id='a%d' % i) for i in range(51)]})
check('quá 50 tệp -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/audiences', {'audiences': [aud_custom, aud_lal]})
check('hv01 lưu 1 Custom + 1 Lookalike 200', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
check('bootstrap hv01 thấy đủ 2 tệp', st == 200 and len(j.get('audiences', [])) == 2 and j['audiences'][0]['name'] == 'Khách đã mua — 2026' and j['audiences'][1]['type'] == 'lookalike' and j['audiences'][1]['pct'] == 1, str(j.get('audiences')))
st, j = stuB.j('GET', '/api/bootstrap')
check('hv02 không thấy tệp của hv01 (rỗng)', st == 200 and j.get('audiences') == [], str(j.get('audiences')))
st, j = stuA.j('PUT', '/api/audiences', {'audiences': []})
check('lưu mảng rỗng xoá hết 200', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
check('bootstrap hv01 sau xoá thấy []', st == 200 and j.get('audiences') == [], str(j.get('audiences')))

print('== 15. Trạng thái bảng + phiên bản nhật ký đã xem ==')
rs = {'overrides': {'c1': {'name': 'Camp đổi tên', 'active': False}}, 'mine': [{'tab': 'campaigns', 'row': {'id': 'dup-abc', 'name': 'Copy of Camp A', 'objective': 'Sales', 'active': False, 'budget': '₫400,000', 'budgetSub': 'Daily budget', 'm': {}, 'mine': True}}], 'deleted': ['samp1']}
st, j = anon2.j('PUT', '/api/row-state', {'state': rs})
check('chưa đăng nhập lưu row-state -> 401', st == 401, str(st))
st, j = stuA.j('PUT', '/api/row-state', {'state': 'khong-phai-object'})
check('row-state không phải object -> 400', st == 400 and j.get('error') == 'bad_row_state', str(j))
st, j = stuA.j('PUT', '/api/row-state', {'state': {'overrides': {'x': {'name': 'N' * 201}}}})
check('tên ghi đè quá 200 ký tự -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/row-state', {'state': {'mine': [{'tab': 'sai', 'row': {'id': 'd1', 'name': 'X'}}]}})
check('tab ngoài campaigns/adsets/ads -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/row-state', {'state': rs})
check('hv01 lưu row-state 200', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
check('bootstrap hv01 thấy row-state', st == 200 and j.get('rowState', {}).get('overrides', {}).get('c1', {}).get('name') == 'Camp đổi tên' and len(j['rowState']['mine']) == 1 and j['rowState']['deleted'] == ['samp1'], str(j.get('rowState')))
st, j = stuB.j('GET', '/api/bootstrap')
check('hv02 không thấy row-state của hv01 (mặc định rỗng)', st == 200 and j.get('rowState') == {'overrides': {}, 'mine': [], 'deleted': []}, str(j.get('rowState')))
st, j = anon2.j('PUT', '/api/seen-version', {'version': 'v2.0.3'})
check('chưa đăng nhập lưu seen-version -> 401', st == 401, str(st))
st, j = stuA.j('PUT', '/api/seen-version', {'version': ''})
check('version rỗng -> 400', st == 400 and j.get('error') == 'bad_version', str(j))
st, j = stuA.j('PUT', '/api/seen-version', {'version': 'V' * 51})
check('version quá 50 ký tự -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/seen-version', {'version': 'v2.0.3'})
check('hv01 lưu seen-version 200', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
check('bootstrap hv01 thấy seenVersion', st == 200 and j.get('seenVersion') == 'v2.0.3', str(j.get('seenVersion')))
st, j = stuB.j('GET', '/api/bootstrap')
check('hv02 chưa xem phiên bản nào (rỗng)', st == 200 and j.get('seenVersion') == '', str(j.get('seenVersion')))

print('== 16. Giới hạn đăng nhập sai ==')
bad = Client()
for i in range(5):
    st, j = bad.j('POST', '/api/auth/login', {'username': 'hv02', 'password': 'sai'})
check('5 lần sai -> 401', st == 401, str(st))
st, j = bad.j('POST', '/api/auth/login', {'username': 'hv02', 'password': 'sai'})
check('lần 6 -> 429 too_many_attempts', st == 429 and j.get('error') == 'too_many_attempts', str(j))

print('== 17. Trạng thái hiển thị bảng — Customise columns (lưu riêng theo tài khoản) ==')
cs = {'custom': [{'id': 'cp1', 'name': 'Theo dõi CPA', 'cols': ['on', 'name', 'results', 'cpr', 'spend']}], 'view': {'preset': 'custom:cp1', 'cols': None, 'attr': '7-day click', 'fmt': [{'id': 'fr1', 'col': 'cpr', 'op': 'gt', 'threshold': 10000, 'color': 'red'}]}}
st, j = anon2.j('PUT', '/api/col-state', {'state': cs})
check('chưa đăng nhập lưu col-state -> 401', st == 401, str(st))
st, j = stuA.j('PUT', '/api/col-state', {'state': 'khong-phai-object'})
check('col-state không phải object -> 400', st == 400 and j.get('error') == 'bad_col_state', str(j))
st, j = stuA.j('PUT', '/api/col-state', {'state': {'custom': [{'id': 'x', 'name': 'N' * 101, 'cols': ['on', 'name', 'results']}]}})
check('tên preset quá 100 ký tự -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/col-state', {'state': {'custom': [{'id': 'x', 'name': 'X', 'cols': ['on', 'name', 'cot-khong-co']}]}})
check('key cột không hợp lệ -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/col-state', {'state': {'view': {'preset': 'custom:khong-co'}}})
check('preset riêng không tồn tại -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/col-state', {'state': {'view': {'attr': '30-day click'}}})
check('attribution setting ngoài danh sách -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/col-state', {'state': {'view': {'fmt': [{'id': 'f', 'col': 'cpr', 'op': '!=', 'threshold': 1, 'color': 'red'}]}}})
check('điều kiện tô màu ngoài gt/lt -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/col-state', {'state': cs})
check('hv01 lưu col-state 200', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
got = j.get('colState', {})
check('bootstrap hv01 thấy preset riêng + attr + quy tắc', st == 200 and len(got.get('custom', [])) == 1 and got['custom'][0]['name'] == 'Theo dõi CPA' and got.get('view', {}).get('preset') == 'custom:cp1' and got['view'].get('attr') == '7-day click' and len(got['view'].get('fmt', [])) == 1 and got['view']['fmt'][0]['threshold'] == 10000, str(got))
st, j = stuB.j('GET', '/api/bootstrap')
check('hv02 không thấy col-state của hv01 (mặc định)', st == 200 and j.get('colState') == {'custom': [], 'view': {'preset': 'performance', 'cols': None, 'attr': None, 'fmt': []}}, str(j.get('colState')))
st, j = stuA.j('PUT', '/api/col-state', {'state': {'custom': [], 'view': {'preset': 'performance', 'cols': None, 'attr': None, 'fmt': []}}})
check('hv01 đặt lại mặc định 200', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
check('bootstrap hv01 sau đặt lại thấy mặc định', st == 200 and j.get('colState', {}).get('custom') == [] and j['colState']['view']['preset'] == 'performance', str(j.get('colState')))

print('== 18. Bài nộp case (nộp lại thay bản cũ, lưu riêng theo tài khoản) ==')
sub6 = {
  'caseId': 'case6',
  'caseTitle': 'Case 6 — Đồ ngủ: tin nhắn rẻ mà 22 tin chỉ chốt được 2 đơn',
  'source': 'editor',
  'submittedAt': '2026-11-16T03:10:00.000Z',
  'submittedAtVN': '16/11/2026 10:10',
  'objective': 'Engagement',
  'campName': 'Case 6 — Đồ ngủ',
  'adsetName': 'Nhóm Đồ ngủ',
  'adName': 'Quảng cáo Đồ ngủ',
  'budget': {'amount': 277442, 'raw': '₫ 277,442 VND', 'type': 'Daily budget', 'unitNote': 'số tiền đã nhập trong editor'},
  'target': {'display': '', 'locations': [{'name': 'Vietnam', 'mode': 'include', 'radius': ''}], 'ageMin': 22, 'ageMax': 40, 'minAge': '18', 'gender': 'Women', 'langs': [], 'interests': ['Thời trang (Fashion)'], 'narrow': [], 'excludeInterests': [], 'inclAud': [], 'exclAud': [], 'advantageAudience': True},
  'placements': {'mode': 'advantage', 'platforms': ['Facebook', 'Instagram', 'Messenger', 'Audience Network', 'Threads'], 'devices': 'All devices', 'os': 'All operating systems', 'wifiOnly': False},
  'optim': {'event': 'Maximise number of conversations', 'costControl': 'none', 'costAmount': '', 'bidStrategy': 'Highest volume', 'bidAmount': '', 'attrSetting': '7-day click · 1-day view'},
  'creative': {'format': 'Single image or video', 'mode': 'new', 'primary': 'Đồ ngủ lụa mềm, mặc là mê', 'headline': 'Đồ ngủ lụa cao cấp', 'description': '', 'cta': 'Send message', 'demoPost': None},
  'caseInputs': {'msgs': 22, 'rate': 20, 'cost': 12611, 'aov': 350000, 'cogs': 40},
  'result': {'rows': [{'key': 'objective', 'label': 'Objective', 'student': 'Engagement', 'teacher': 'Engagement', 'verdict': 'ok', 'note': 'Khớp.'}], 'okCount': 5, 'total': 5},
}
st, j = anon2.j('PUT', '/api/submissions', {'submissions': {'case6': sub6}})
check('chưa đăng nhập nộp bài -> 401', st == 401, str(st))
st, j = stuA.j('PUT', '/api/submissions', {'submissions': 'khong-phai-object'})
check('submissions không phải object -> 400', st == 400 and j.get('error') == 'bad_submissions', str(j))
st, j = stuA.j('PUT', '/api/submissions', {'submissions': {'case99': dict(sub6, caseId='case99')}})
check('caseId ngoài case1–case15 -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/submissions', {'submissions': {'case6': dict(sub6, caseId='case7')}})
check('caseId không khớp key -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/submissions', {'submissions': {'case6': {k: v for k, v in sub6.items() if k != 'submittedAt'}}})
check('thiếu submittedAt -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/submissions', {'submissions': {'case%d' % i: dict(sub6, caseId='case%d' % i) for i in range(1, 17)}})
check('quá 15 case -> 400', st == 400, str(j))
st, j = stuA.j('PUT', '/api/submissions', {'submissions': {'case6': sub6}})
check('hv01 nộp bài case6 200', st == 200 and j.get('ok') is True, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
got_sub = j.get('submissions', {})
check('bootstrap hv01 thấy bài nộp case6 đủ trường', st == 200 and got_sub.get('case6', {}).get('caseTitle', '').startswith('Case 6') and got_sub['case6']['budget']['amount'] == 277442 and got_sub['case6']['result']['okCount'] == 5 and got_sub['case6']['result']['total'] == 5, str(got_sub)[:300])
st, j = stuB.j('GET', '/api/bootstrap')
check('hv02 không thấy bài nộp của hv01 (rỗng)', st == 200 and j.get('submissions') == {}, str(j.get('submissions')))
sub6b = dict(sub6)
sub6b['budget'] = {'amount': 300000, 'raw': '₫ 300,000 VND', 'type': 'Daily budget', 'unitNote': 'số tiền đã nhập trong editor'}
sub6b['submittedAt'] = '2026-11-16T03:20:00.000Z'
sub6b['submittedAtVN'] = '16/11/2026 10:20'
st, j = stuA.j('PUT', '/api/submissions', {'submissions': {'case6': sub6b}})
check('hv01 nộp lại case6 với ngân sách khác 200', st == 200, str(j))
st, j = stuA.j('GET', '/api/bootstrap')
check('bootstrap chỉ giữ bản mới (300000), vẫn 1 case', st == 200 and len(j.get('submissions', {})) == 1 and j['submissions']['case6']['budget']['amount'] == 300000 and j['submissions']['case6']['submittedAtVN'] == '16/11/2026 10:20', str(j.get('submissions'))[:300])
st, j = stuA.j('GET', '/api/admin/students/%d/work' % stuA_id)
check('hv01 xem bài làm qua API admin -> 403', st == 403, str(st))
st, j = teacher.j('GET', '/api/admin/students/%d/work' % stuA_id)
ws = j.get('submissions', {}).get('case6', {})
check('giáo viên xem bài làm thấy bài nộp case6', st == 200 and ws.get('caseTitle', '').startswith('Case 6') and ws.get('submittedAtVN') == '16/11/2026 10:20' and ws.get('result', {}).get('okCount') == 5 and ws['result']['total'] == 5 and ws['budget']['amount'] == 300000, str(ws)[:300])
st, j = teacher.j('GET', '/api/admin/students')
rowA2 = [s for s in j.get('students', []) if s['username'] == 'hv01'][0]
check('tổng quan: hv01 submissionsCount = 1', rowA2.get('submissionsCount') == 1, str(rowA2))

print()
print('KẾT QUẢ: %d PASS, %d FAIL' % (len(passed), len(failed)))
if failed:
    print('FAIL: ' + ', '.join(failed))
    sys.exit(1)
