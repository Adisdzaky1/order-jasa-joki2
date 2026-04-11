// public/js/main.js
// Dijalankan di semua halaman user (via layout/main.ejs)

(function () {
  'use strict';

  // ── Mobile Menu Toggle ───────────────────────────────────────────────────
  const menuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });

    // Tutup saat klik di luar
    document.addEventListener('click', (e) => {
      if (!menuBtn.contains(e.target) && !mobileMenu.contains(e.target)) {
        mobileMenu.classList.add('hidden');
      }
    });
  }

  // ── Navbar Auth State ────────────────────────────────────────────────────
  // Cek cookie fb_token (hanya cek keberadaan, verifikasi ada di server)
  function hasCookie(name) {
    return document.cookie.split(';').some(c => c.trim().startsWith(name + '='));
  }

  const navAuth = document.getElementById('nav-auth');
  if (navAuth) {
    if (hasCookie('fb_token')) {
      // User sudah login → tampilkan link Dashboard + Logout
      navAuth.innerHTML = `
        <a href="/dashboard"
           class="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
          Dashboard
        </a>
        <button onclick="logout()"
                class="px-4 py-2 text-sm border border-gray-700 hover:border-red-500/50 text-gray-400
                       hover:text-red-400 font-medium rounded-xl transition-colors">
          Keluar
        </button>`;
    }
    // Jika belum login, tombol Masuk & Daftar sudah ada dari HTML navbar.ejs
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  window.logout = async function () {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (_) { /* ignore */ }
    window.location.href = '/login';
  };

  // ── Active Nav Link ──────────────────────────────────────────────────────
  const path = window.location.pathname;
  document.querySelectorAll('nav a[href], #mobile-menu a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href !== '/' && path.startsWith(href)) {
      link.classList.add('text-white', 'bg-gray-800');
      link.classList.remove('text-gray-400');
    } else if (href === '/' && path === '/') {
      link.classList.add('text-white');
      link.classList.remove('text-gray-400');
    }
  });

  // ── Auto-dismiss alert divs ──────────────────────────────────────────────
  document.querySelectorAll('[data-auto-dismiss]').forEach(el => {
    const delay = parseInt(el.dataset.autoDismiss) || 4000;
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, delay);
  });

  // ── Smooth scroll for anchor links ───────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        mobileMenu?.classList.add('hidden');
      }
    });
  });

  // ── Ripple effect on buttons ─────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button, a.btn-ripple');
    if (!btn || btn.disabled) return;
    const r = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(r.width, r.height);
    ripple.style.cssText = `
      position:absolute; border-radius:50%; background:rgba(255,255,255,0.15);
      width:${size}px; height:${size}px;
      left:${e.clientX - r.left - size/2}px;
      top:${e.clientY - r.top - size/2}px;
      pointer-events:none; animation:ripple-anim 0.5s ease-out forwards;`;
    const prevPosition = btn.style.position;
    if (!prevPosition || prevPosition === 'static') btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  });

  // Inject ripple keyframe once
  if (!document.getElementById('ripple-style')) {
    const style = document.createElement('style');
    style.id = 'ripple-style';
    style.textContent = `@keyframes ripple-anim{from{opacity:1;transform:scale(0)}to{opacity:0;transform:scale(2)}}`;
    document.head.appendChild(style);
  }

  // ── Format rupiah helper (global) ────────────────────────────────────────
  window.formatRupiah = (n) =>
    'Rp ' + Number(n).toLocaleString('id-ID');

  // ── Copy to clipboard helper (global) ────────────────────────────────────
  window.copyToClipboard = async (text, btn) => {
    try {
      await navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.textContent = 'Disalin!';
      setTimeout(() => btn.textContent = orig, 1500);
    } catch (_) { /* Clipboard not available */ }
  };

})();
