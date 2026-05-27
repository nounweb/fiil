path = r'C:\Users\주피터\Downloads\fiil\webapp.html'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 1505 = index 1504 = 'function initGPS() {'
# 그 다음 줄(1505)에 gps_addr 처리 삽입
insert_idx = 1505

new_code = [
    '      // 고팡에서 GPS 주소 전달받은 경우 즉시 사용 (iframe GPS 재요청 불필요)\n',
    '      const _up = new URLSearchParams(location.search);\n',
    '      const _ga = _up.get("gps_addr");\n',
    '      if (_ga) {\n',
    '        gpsAddress = decodeURIComponent(_ga);\n',
    '        const gpsEl = document.getElementById("gpsVal");\n',
    '        const gpsSpEl = document.getElementById("gpsSpinner");\n',
    '        if (gpsEl) gpsEl.textContent = gpsAddress;\n',
    '        if (gpsSpEl) gpsSpEl.style.display = "none";\n',
    '        return;\n',
    '      }\n',
]

lines = lines[:insert_idx] + new_code + lines[insert_idx:]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('OK: gps_addr 처리 삽입 완료')
print('확인:', lines[1504].strip())
print('확인:', lines[1505].strip())
