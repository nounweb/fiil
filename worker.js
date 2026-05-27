// ═══════════════════════════════════════════════════
// gopang-proxy — AI API 프록시
// Gemini 2.0 Flash Vision + DeepSeek V3 fallback
// 환경변수: Gemini, DEEPSEEK_API_KEY
// ═══════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://fiil.kr',
  'https://gopang.net',
  'https://nounweb.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const KAKAO_BASE   = 'https://dapi.kakao.com/v2/local/geo/coord2address.json';

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

    // ── /deepseek → DeepSeek 직접 호출 ─────────────
    if (pathname.startsWith('/deepseek')) {
      return await callDeepSeek(bodyText, env, corsHeaders);
    }

    // ── /gemini/{model} → Gemini + DeepSeek fallback ─
    if (pathname.startsWith('/gemini/')) {
      const model = pathname.replace('/gemini/', '').trim();
      if (!model) {
        return new Response(JSON.stringify({ error: 'model required' }), {
          status: 400, headers: corsHeaders,
        });
      }
      return await callGeminiWithFallback(model, bodyText, env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not Found', path: pathname }), {
      status: 404, headers: corsHeaders,
    });
  },
};

// ══════════════════════════════════════════════════
// Gemini → 실패 시 DeepSeek fallback
// ══════════════════════════════════════════════════
async function callGeminiWithFallback(model, bodyText, env, corsHeaders) {
  let geminiError = null;

  try {
    const geminiRes = await fetch(
      `${GEMINI_BASE}/${model}:generateContent?key=${env.Gemini}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyText }
    );
    const geminiData = await geminiRes.json();

    if (geminiRes.ok && geminiData.candidates?.[0]?.content) {
      return new Response(JSON.stringify(geminiData), { headers: corsHeaders });
    }
    geminiError = geminiData.error?.message || `HTTP ${geminiRes.status}`;
    console.error('[Gemini] 실패:', geminiError);
  } catch(e) {
    geminiError = e.message;
    console.error('[Gemini] 네트워크 오류:', e.message);
  }

  // DeepSeek fallback
  console.log('[Fallback] DeepSeek 전환. Gemini 오류:', geminiError);
  try {
    const geminiBody   = JSON.parse(bodyText);
    const parts        = geminiBody.contents?.[0]?.parts || [];
    const textPart     = parts.find(p => p.text)?.text || '';
    const imagePart    = parts.find(p => p.inline_data);
    const systemPrompt = geminiBody.system_instruction?.parts?.[0]?.text || '';

    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });

    if (imagePart?.inline_data) {
      messages.push({ role: 'user', content: [
        { type: 'image_url', image_url: {
          url: `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`
        }},
        { type: 'text', text: textPart || '이미지를 분석하여 JSON으로만 출력하라.' },
      ]});
    } else {
      messages.push({ role: 'user', content: textPart });
    }

    const dsRes  = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.1, max_tokens: 2048, stream: false }),
    });
    const dsData = await dsRes.json();
    if (!dsRes.ok) throw new Error(dsData.error?.message || `DeepSeek HTTP ${dsRes.status}`);

    const dsText = dsData.choices?.[0]?.message?.content || '{}';
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: dsText }], role: 'model' }, finishReason: 'STOP' }],
      _fallback: true, _fallback_to: 'deepseek-chat', _gemini_error: geminiError,
    }), { headers: corsHeaders });

  } catch(dsError) {
    console.error('[DeepSeek fallback] 실패:', dsError.message);
    return new Response(JSON.stringify({
      error: { message: `Gemini: ${geminiError} / DeepSeek: ${dsError.message}` }
    }), { status: 502, headers: corsHeaders });
  }
}

// ══════════════════════════════════════════════════
// DeepSeek 직접 호출
// ══════════════════════════════════════════════════
async function callDeepSeek(bodyText, env, corsHeaders) {
  try {
    const res  = await fetch(DEEPSEEK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
      body:    bodyText,
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || `HTTP ${res.status}` }), {
        status: res.status, headers: corsHeaders,
      });
    }
    return new Response(JSON.stringify(data), { headers: corsHeaders });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
  }
}

const ALLOWED_ORIGINS = [
  'https://fiil.kr',
  'https://gopang.net',
  'https://nounweb.github.io',
];

const GEMINI_BASE  = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';

    // ── CORS preflight ──────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  corsOrigin || 'null',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age':       '86400',
        },
      });
    }

    // ── 도메인 검증 ─────────────────────────────────
    if (!corsOrigin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url      = new URL(request.url);
    const bodyText = await request.text();
    const pathname = url.pathname; // /gemini/{model} 또는 /deepseek

    const corsHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': corsOrigin,
    };

    // ══════════════════════════════════════════════
    // 라우팅
    // ══════════════════════════════════════════════

    // ── /deepseek → DeepSeek 직접 호출 ─────────────
    if (pathname.startsWith('/deepseek')) {
      return await callDeepSeek(bodyText, env, corsHeaders);
    }

    // ── /gemini/{model} → Gemini 호출, 실패 시 DeepSeek fallback ──
    if (pathname.startsWith('/gemini/')) {
      const model = pathname.replace('/gemini/', '').trim();
      if (!model) {
        return new Response(JSON.stringify({ error: 'Bad Request: model required' }), {
          status: 400, headers: corsHeaders,
        });
      }
      return await callGeminiWithFallback(model, bodyText, env, corsHeaders);
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404, headers: corsHeaders,
    });
  },
};

// ══════════════════════════════════════════════════
// Gemini 호출 → 실패 시 DeepSeek fallback
// ══════════════════════════════════════════════════
async function callGeminiWithFallback(model, bodyText, env, corsHeaders) {
  let geminiError = null;

  try {
    const geminiRes = await fetch(
      `${GEMINI_BASE}/${model}:generateContent?key=${env.Gemini}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    bodyText,
      }
    );

    const geminiData = await geminiRes.json();

    // Gemini 성공 여부 확인
    if (geminiRes.ok && geminiData.candidates?.[0]?.content) {
      return new Response(JSON.stringify(geminiData), { headers: corsHeaders });
    }

    // Gemini 응답은 왔지만 오류 포함
    geminiError = geminiData.error?.message || `HTTP ${geminiRes.status}`;
    console.error('[Gemini] 실패:', geminiError);

  } catch (e) {
    geminiError = e.message;
    console.error('[Gemini] 네트워크 오류:', e.message);
  }

  // ── Gemini 실패 → DeepSeek fallback ──────────────
  console.log('[Fallback] DeepSeek으로 전환, Gemini 오류:', geminiError);

  try {
    // Gemini 요청 본문에서 텍스트/이미지 파싱
    const geminiBody   = JSON.parse(bodyText);
    const parts        = geminiBody.contents?.[0]?.parts || [];
    const textPart     = parts.find(p => p.text)?.text || '';
    const imagePart    = parts.find(p => p.inline_data);
    const systemPrompt = geminiBody.system_instruction?.parts?.[0]?.text || '';

    // DeepSeek 메시지 구성
    const messages = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // 이미지가 있으면 vision 형식으로 구성
    if (imagePart?.inline_data) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:${imagePart.inline_data.mime_type};base64,${imagePart.inline_data.data}`,
            },
          },
          { type: 'text', text: textPart || '이미지를 분석하여 JSON으로만 출력하라.' },
        ],
      });
    } else {
      messages.push({ role: 'user', content: textPart });
    }

    const dsBody = {
      model:       'deepseek-chat',
      messages,
      temperature: 0.1,
      max_tokens:  2048,
      stream:      false,
    };

    const dsRes  = await fetch(DEEPSEEK_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(dsBody),
    });

    const dsData = await dsRes.json();

    if (!dsRes.ok) {
      throw new Error(dsData.error?.message || `DeepSeek HTTP ${dsRes.status}`);
    }

    // DeepSeek 응답을 Gemini 형식으로 래핑 (클라이언트 호환성)
    const dsText = dsData.choices?.[0]?.message?.content || '{}';
    const wrapped = {
      candidates: [{
        content: { parts: [{ text: dsText }], role: 'model' },
        finishReason: 'STOP',
      }],
      _fallback:     true,
      _fallback_to:  'deepseek-chat',
      _gemini_error: geminiError,
    };

    return new Response(JSON.stringify(wrapped), { headers: corsHeaders });

  } catch (dsError) {
    console.error('[DeepSeek fallback] 실패:', dsError.message);
    return new Response(JSON.stringify({
      error: {
        message: `Gemini 실패: ${geminiError} / DeepSeek 실패: ${dsError.message}`,
        gemini_error:   geminiError,
        deepseek_error: dsError.message,
      },
    }), { status: 502, headers: corsHeaders });
  }
}

// ══════════════════════════════════════════════════
// DeepSeek 직접 호출
// ══════════════════════════════════════════════════
async function callDeepSeek(bodyText, env, corsHeaders) {
  try {
    const res  = await fetch(DEEPSEEK_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: bodyText,
    });

    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || `HTTP ${res.status}` }), {
        status: res.status, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify(data), { headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502, headers: corsHeaders,
    });
  }
}
