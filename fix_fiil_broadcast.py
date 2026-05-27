path = r'C:\Users\주피터\Downloads\fiil\webapp.html'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# window.__gwpInstance = gwp; 위치 찾기
for i, l in enumerate(lines):
    if 'window.__gwpInstance = gwp;' in l:
        print(f'위치: {i+1}')
        # 그 다음 줄에 BroadcastChannel 헬퍼 삽입
        insert = [
            '\n',
            '        // BroadcastChannel로 고팡에 결과 전달\n',
            '        window._gopangNotify = function(summary, pdvData) {\n',
            '          try {\n',
            '            const ch = new BroadcastChannel("gopang_gwp");\n',
            '            ch.postMessage({ type: "GWP_DONE", summary: summary, pdvData: pdvData });\n',
            '            setTimeout(function(){ ch.close(); }, 500);\n',
            '          } catch(e) {}\n',
            '        };\n',
        ]
        lines = lines[:i+1] + insert + lines[i+1:]
        print('OK: BroadcastChannel 헬퍼 삽입')
        break

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

# gwp.done() 호출 위치 확인
for i, l in enumerate(lines):
    if 'gwp.done(' in l:
        print(f'gwp.done 위치: {i+1}: {l.strip()}')
