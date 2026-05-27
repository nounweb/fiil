/**
 * gwp-sdk.js — Gopang Widget Protocol SDK v2.1
 *
 * 변경사항 v2.1:
 *   - 새 탭 방식 전용: window.opener.postMessage() 사용 (cross-origin 지원)
 *   - isWidget static getter 추가 (gwp=1 파라미터로 판단)
 *   - BroadcastChannel 제거 (same-origin 제한으로 cross-port 불가)
 *   - iframe fallback 유지 (parent.postMessage)
 *
 * 사용법:
 *   <script src="https://gopang.net/gwp-sdk.js"></script>
 *   <script>
 *     const gwp = new GopangWidget({
 *       onInit({ token, context, gpsAddr, photoUrl, desc }) { ... },
 *       onInput(text, file) { ... },
 *     });
 *     gwp.ready({ title: 'K-Cleaner' });
 *     // 작업 완료 시
 *     gwp.done({ summary: '신고 완료', pdvData: { ... } });
 *   </script>
 */

(function(global) {
  'use strict';

  class GopangWidget {

    // gwp=1 파라미터로 위젯 모드 판단 — webapp.html에서 별도 체크 불필요
    static get isWidget() {
      return new URLSearchParams(location.search).get('gwp') === '1';
    }

    constructor(handlers) {
      this._handlers = handlers || {};
      this._params   = new URLSearchParams(location.search);

      // URL 파라미터 파싱
      this._token    = this._params.get('token')   || null;
      this._context  = this._params.get('ctx')     ? decodeURIComponent(this._params.get('ctx'))      : null;
      this._gpsAddr  = this._params.get('gps_addr')? decodeURIComponent(this._params.get('gps_addr')) : null;
      this._photoUrl = this._params.get('photo_url')|| null;
      this._desc     = this._params.get('desc')    ? decodeURIComponent(this._params.get('desc'))     : null;

      console.info('[GWP-SDK] v2.0 초기화. isWidget:', GopangWidget.isWidget);
    }

    // 서비스 준비 완료 신호 — 고팡에 title/placeholder 전달
    ready(options) {
      options = options || {};
      if (!GopangWidget.isWidget) return;

      // onInit 핸들러 호출 — URL 파라미터를 컨텍스트로 전달
      if (this._handlers.onInit) {
        this._handlers.onInit({
          token:    this._token,
          context:  this._context,
          gpsAddr:  this._gpsAddr,
          photoUrl: this._photoUrl,
          desc:     this._desc,
        });
      }

      this._post('GWP_READY', {
        title:       options.title       || document.title || '서비스',
        placeholder: options.placeholder || '메시지를 입력하세요.',
      });

      console.info('[GWP-SDK] ready() 완료:', options.title);
    }

    // 고팡에 메시지 버블 출력
    message(text) {
      if (!GopangWidget.isWidget) return;
      this._post('GWP_MESSAGE', { text: text });
    }

    // 작업 완료 보고 — 6하 원칙 pdvData 포함
    done(data) {
      if (!GopangWidget.isWidget) return;
      data = data || {};
      var pdv = data.pdvData || {};
      this._post('GWP_DONE', {
        summary: data.summary || '서비스 완료',
        pdvData: {
          who:   pdv.who   || this._token || null,
          when:  pdv.when  || new Date().toISOString(),
          where: pdv.where || this._gpsAddr || null,
          what:  pdv.what  || data.summary || null,
          how:   pdv.how   || 'text',
          why:   pdv.why   || null,
          data:  pdv.data  || {},
        },
      });
      console.info('[GWP-SDK] done() 전송:', data.summary);
    }

    // ── 내부 ─────────────────────────────────────────────────────
    _post(type, data) {
      var payload = Object.assign({ type: type }, data);
      // window.opener: 새 탭 방식 — cross-origin 허용
      if (window.opener) {
        var target = this._gopangOrigin || '*';
        try {
          window.opener.postMessage(payload, target);
          console.info('[GWP-SDK] → opener.postMessage:', type);
          return;
        } catch(e) {
          console.warn('[GWP-SDK] opener.postMessage 실패:', e.message);
        }
      }
      // fallback: iframe 방식
      try {
        var target2 = this._gopangOrigin || '*';
        parent.postMessage(payload, target2);
        console.info('[GWP-SDK] → parent.postMessage:', type);
      } catch(e) {
        console.warn('[GWP-SDK] postMessage 실패:', e.message);
      }
    }
  }

  global.GopangWidget = GopangWidget;

})(window);
