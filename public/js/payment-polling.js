// public/js/payment-polling.js
// Diload khusus di halaman pembayaran via <%- scripts %>

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  const POLL_INTERVAL_MS = 3000;   // polling tiap 5 detik
  const MAX_POLL_ATTEMPTS = 72;    // 72 × 5s = 6 menit maks

  let pollTimer = null;
  let countdownTimer = null;
  let pollCount = 0;

  // ── Countdown Timer ──────────────────────────────────────────────────────
  /**
   * Mulai countdown dari waktu expired_at.
   * @param {string} expiredAt  - ISO date string dari Atlantic
   */
  window.startPaymentCountdown = function (expiredAt) {
    const expiry = new Date(expiredAt).getTime();
    const el = document.getElementById('countdown');
    if (!el) return;

    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      const remaining = expiry - Date.now();
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        el.textContent = '00:00';
        el.classList.add('text-red-400');
        showExpiredNotice();
        return;
      }
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

      // Warna merah saat < 2 menit
      if (remaining < 120000) el.classList.add('text-red-400');
    }, 1000);
  };

  // ── Status Polling ───────────────────────────────────────────────────────
  /**
   * Mulai polling status pembayaran ke server.
   * @param {string} orderId
   */
  window.startPaymentPolling = function (orderId) {
    if (!orderId) return;
    clearInterval(pollTimer);
    pollCount = 0;

    setPollingStatus('checking');

    pollTimer = setInterval(async () => {
      pollCount++;

      if (pollCount > MAX_POLL_ATTEMPTS) {
        clearInterval(pollTimer);
        setPollingStatus('timeout');
        return;
      }

      try {
        const res = await fetch('/api/payment/status/' + orderId);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        if (data.payment_status === 'success') {
          clearInterval(pollTimer);
          clearInterval(countdownTimer);
          setPollingStatus('success');
          showSuccessStep();
        } else {
          setPollingStatus('checking');
        }
      } catch (err) {
        console.warn('[payment-polling] fetch error:', err.message);
        setPollingStatus('error');
      }
    }, POLL_INTERVAL_MS);
  };

  // ── Stop Polling ─────────────────────────────────────────────────────────
  window.stopPaymentPolling = function () {
    clearInterval(pollTimer);
    clearInterval(countdownTimer);
  };

  // ── UI Helpers ───────────────────────────────────────────────────────────
  function setPollingStatus(state) {
    const el = document.getElementById('polling-status');
    if (!el) return;

    const states = {
      checking: {
        html: `<svg class="w-3.5 h-3.5 animate-spin text-indigo-400" fill="none" viewBox="0 0 24 24">
                 <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                 <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
               </svg>
               <span>Memeriksa status pembayaran...</span>`,
        cls: 'text-gray-500'
      },
      success: {
        html: `<svg class="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
               </svg>
               <span>Pembayaran dikonfirmasi!</span>`,
        cls: 'text-green-400'
      },
      error: {
        html: `<svg class="w-3.5 h-3.5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
               </svg>
               <span>Menghubungkan ulang...</span>`,
        cls: 'text-yellow-400'
      },
      timeout: {
        html: `<svg class="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
               </svg>
               <span>Waktu habis. <button onclick="location.reload()" class="underline hover:text-red-300">Muat ulang</button></span>`,
        cls: 'text-red-400'
      }
    };

    const s = states[state] || states.checking;
    el.className = `flex items-center justify-center gap-2 text-xs ${s.cls}`;
    el.innerHTML = s.html;
  }

  function showSuccessStep() {
    const qrStep = document.getElementById('step-qr');
    const successStep = document.getElementById('step-success');
    if (qrStep) qrStep.classList.add('hidden');
    if (successStep) {
      successStep.classList.remove('hidden');
      successStep.classList.add('modal-enter');
    }
    // Redirect otomatis setelah 3 detik
    setTimeout(() => {
      window.location.href = '/dashboard?paid=1';
    }, 3000);
  }

  function showExpiredNotice() {
    const el = document.getElementById('polling-status');
    if (el) {
      el.className = 'flex items-center justify-center gap-2 text-xs text-red-400';
      el.innerHTML = `<span>QR Code sudah kedaluwarsa. <a href="javascript:location.reload()" class="underline">Buat tagihan baru</a></span>`;
    }
    clearInterval(pollTimer);
  }

  // ── Manual retry button ──────────────────────────────────────────────────
  window.retryPolling = function (orderId) {
    pollCount = 0;
    window.startPaymentPolling(orderId);
  };

})();
