// nav.js — FIIL.kr 모바일 햄버거 메뉴

function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburger');
  menu.classList.toggle('open');
  const spans = btn.querySelectorAll('span');
  if (menu.classList.contains('open')) {
    spans[0].style.transform = 'translateY(7px) rotate(45deg)';
    spans[1].style.opacity   = '0';
    spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
  } else {
    spans[0].style.transform = '';
    spans[1].style.opacity   = '1';
    spans[2].style.transform = '';
  }
}

function closeMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const btn  = document.getElementById('hamburger');
  menu.classList.remove('open');
  const spans = btn.querySelectorAll('span');
  spans[0].style.transform = '';
  spans[1].style.opacity   = '1';
  spans[2].style.transform = '';
}
