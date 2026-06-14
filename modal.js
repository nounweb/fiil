// modal.js — FIIL.kr 앱 모달 & 플로팅 버튼

function openAppModal() {
  // 모든 환경에서 새 탭으로 열기 (iframe GPS 차단 문제 해결)
  window.open('https://fiil.kr/webapp.html', '_blank');
}

function closeModal() {
  document.getElementById('appModal')?.classList.remove('show');
  document.body.style.overflow = '';
}

function closeAppModal(e) {
  if (e.target === document.getElementById('appModal')) closeModal();
}

function triggerCamera() {
  launchApp();
}

function launchApp() {
  const screen = document.getElementById('appLoadingScreen');
  const iframe = document.getElementById('appIframe');
  if (screen) screen.style.display = 'none';
  if (iframe) {
    iframe.style.display = 'block';
    if (!iframe.src || iframe.src === window.location.href || iframe.src === '') {
      iframe.src = 'https://gopang.net';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const iframe = document.getElementById('appIframe');
  if (iframe) iframe.addEventListener('load', () => {/* 로드 완료 */});
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
