// public/js/admin.js
// Diload di semua halaman admin (via layout/admin.ejs)

(function () {
  'use strict';

  // ── Mobile Sidebar Toggle ────────────────────────────────────────────────
  const sidebar = document.getElementById('sidebar');
  const overlay = document.createElement('div');

  if (sidebar) {
    overlay.className = 'fixed inset-0 bg-black/50 z-30 lg:hidden hidden backdrop-blur-sm';
    overlay.id = 'sidebar-overlay';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', closeSidebar);

    // Intercept hamburger button
    const hamburger = document.querySelector('[onclick*="sidebar"]');
    if (hamburger) {
      hamburger.removeAttribute('onclick');
      hamburger.addEventListener('click', toggleSidebar);
    }
  }

  function toggleSidebar() {
    const isOpen = !sidebar.classList.contains('-translate-x-full');
    isOpen ? closeSidebar() : openSidebar();
  }

  function openSidebar() {
    sidebar?.classList.remove('-translate-x-full');
    overlay?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar?.classList.add('-translate-x-full');
    overlay?.classList.add('hidden');
    document.body.style.overflow = '';
  }

  // Close on ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });

  // ── Confirm destructive actions ──────────────────────────────────────────
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', (e) => {
      const msg = el.dataset.confirm || 'Apakah Anda yakin?';
      if (!confirm(msg)) e.preventDefault();
    });
  });

  // ── Auto-submit filter forms ─────────────────────────────────────────────
  document.querySelectorAll('[data-auto-submit]').forEach(el => {
    el.addEventListener('change', () => el.closest('form')?.submit());
  });

  // ── Table row click → navigate ───────────────────────────────────────────
  document.querySelectorAll('tr[data-href]').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return; // don't override links/buttons
      window.location.href = row.dataset.href;
    });
  });

  // ── Active sidebar link ──────────────────────────────────────────────────
  // (handled by EJS template conditionals, but add fallback here)
  const path = window.location.pathname;
  document.querySelectorAll('#sidebar nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href && path.startsWith(href) && href !== '/admin') {
      link.classList.add('bg-indigo-600', 'text-white');
      link.classList.remove('text-gray-400', 'hover:bg-gray-800');
    }
  });

  // ── Copy-to-clipboard for order IDs ─────────────────────────────────────
  document.querySelectorAll('[data-copy]').forEach(el => {
    el.addEventListener('click', async () => {
      const text = el.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        const orig = el.textContent;
        el.textContent = 'Disalin!';
        el.classList.add('text-green-400');
        setTimeout(() => {
          el.textContent = orig;
          el.classList.remove('text-green-400');
        }, 1500);
      } catch (_) { /* ignore */ }
    });
  });

  // ── Toast auto-dismiss ───────────────────────────────────────────────────
  const toast = document.getElementById('toast');
  if (toast) {
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // ── Bulk select (pesanan table) ──────────────────────────────────────────
  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = selectAll.checked;
      });
      updateBulkBar();
    });

    document.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', updateBulkBar);
    });
  }

  function updateBulkBar() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    const bar = document.getElementById('bulk-bar');
    const count = document.getElementById('bulk-count');
    if (!bar) return;
    if (checked.length > 0) {
      bar.classList.remove('hidden');
      if (count) count.textContent = checked.length;
    } else {
      bar.classList.add('hidden');
    }
  }

  // ── Stats card hover glow ────────────────────────────────────────────────
  document.querySelectorAll('.stats-card').forEach(card => {
    card.addEventListener('mouseenter', () => card.classList.add('glow-indigo'));
    card.addEventListener('mouseleave', () => card.classList.remove('glow-indigo'));
  });

  // ── Status badge color map (for dynamic updates) ─────────────────────────
  window.getStatusBadgeClass = function (status) {
    const map = {
      menunggu_pembayaran: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      antrian:             'bg-blue-500/20 text-blue-400 border-blue-500/30',
      dikerjakan:          'bg-orange-500/20 text-orange-400 border-orange-500/30',
      selesai:             'bg-green-500/20 text-green-400 border-green-500/30',
    };
    return map[status] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  window.getStatusLabel = function (status, queueNumber) {
    const labels = {
      menunggu_pembayaran: 'Menunggu Pembayaran',
      antrian:             'Antrian',
      dikerjakan:          'Dikerjakan',
      selesai:             'Selesai',
    };
    const label = labels[status] || status;
    return label + (status === 'antrian' && queueNumber ? ` #${queueNumber}` : '');
  };

  // ── Format helpers (global for admin pages) ──────────────────────────────
  window.formatRupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');
  window.formatDate = (iso) =>
    new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

})();
