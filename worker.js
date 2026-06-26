// ═══════════════════════════════════════════════════
// drone-proxy — fiil 전용 AI API 프록시 (gopang-proxy와 별개)
// Gemini 2.0 Flash Vision (단독 호출)
// 환경변수: Gemini
// v2.0: Gemini→DeepSeek 자동 폴백 제거. 사진 분석은 Gemini만 사용하며,
//       실패 시 클라이언트(webapp.html)가 관리자 설정 DeepSeek 키로
//       텍스트 전용 폴백을 직접 처리한다(Cloudflare 경유하지 않음).
// ═══════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://fiil.kr',
  'https://gopang.net',
  'https://nounweb.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const KAKAO_BASE  = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    // origin이 없거나(direct) 허용 목록이면 통과
    const corsOrigin = ALLOWED_ORIGINS.some(o => origin.startsWith(o))
      ? origin
      : (origin === '' ? '' : null);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  corsOrigin ?? 'null',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age':       '86400',
        },
      });
    }

    // 도메인 검증 (origin 있는 경우만)
    if (corsOrigin === null) {
      return new Response(JSON.stringify({ error: 'Forbidden', origin }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin || '*',
    };

    const url      = new URL(request.url);
    const pathname = url.pathname;

    // ── /geocode?lat=&lng= → 카카오 역지오코딩 ──────
    if (pathname.startsWith('/geocode')) {
      const lat = url.searchParams.get('lat');
      const lng = url.searchParams.get('lng');
      if (!lat || !lng) {
        return new Response(JSON.stringify({ error: 'lat, lng required' }), {
          status: 400, headers: corsHeaders,
        });
      }
      try {
        const res = await fetch(
          `${KAKAO_BASE}?x=${lng}&y=${lat}&input_coord=WGS84`,
          { headers: { 'Authorization': `KakaoAK ${env.KAKAO_REST_KEY}` } }
        );
        const data = await res.json();
        return new Response(JSON.stringify(data), { headers: corsHeaders });
      } catch(e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 502, headers: corsHeaders,
        });
      }
    }

    // POST만 허용 (이하)
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405, headers: corsHeaders,
      });
    }

    const bodyText = await request.text();

    // ── /gemini/{model} → Gemini 단독 호출 (폴백 없음) ─
    if (pathname.startsWith('/gemini/')) {
      const model = pathname.replace('/gemini/', '').trim();
      if (!model) {
        return new Response(JSON.stringify({ error: 'model required' }), {
          status: 400, headers: corsHeaders,
        });
      }
      return await callGemini(model, bodyText, env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not Found', path: pathname }), {
      status: 404, headers: corsHeaders,
    });
  },
};

// ══════════════════════════════════════════════════
// Gemini 호출 (단독) — 실패해도 그대로 오류를 반환한다.
// 폴백은 더 이상 여기서 처리하지 않음 — webapp.html이 처리.
// ══════════════════════════════════════════════════
async function callGemini(model, bodyText, env, corsHeaders) {
  try {
    const geminiRes = await fetch(
      `${GEMINI_BASE}/${model}:generateContent?key=${env.Gemini}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyText }
    );
    const geminiData = await geminiRes.json();

    if (geminiRes.ok && geminiData.candidates?.[0]?.content) {
      return new Response(JSON.stringify(geminiData), { headers: corsHeaders });
    }

    const geminiError = geminiData.error?.message || `HTTP ${geminiRes.status}`;
    console.error('[Gemini] 실패:', geminiError);
    return new Response(JSON.stringify({ error: { message: geminiError } }), {
      status: geminiRes.status || 502, headers: corsHeaders,
    });
  } catch (e) {
    console.error('[Gemini] 네트워크 오류:', e.message);
    return new Response(JSON.stringify({ error: { message: e.message } }), {
      status: 502, headers: corsHeaders,
    });
  }
}
