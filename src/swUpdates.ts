type UpdatePromptAction = () => void;

let updatePromptEl: HTMLElement | null = null;
let updatePromptAction: UpdatePromptAction | null = null;

function showUpdatePrompt(
  message = 'Dostepna jest nowa wersja. Kliknij, aby odswiezyc aplikacje.',
  action?: UpdatePromptAction
) {
  if (typeof document === 'undefined') return;
  updatePromptAction = action ?? null;

  const toast = document.getElementById('swUpdateToast') as HTMLElement | null;
  const toastText = document.getElementById('swUpdateText') as HTMLElement | null;
  const toastApply = document.getElementById('swUpdateBtn') as HTMLButtonElement | null;
  const toastDismiss = document.getElementById('swDismissBtn') as HTMLButtonElement | null;
  if (toast && toastText && toastApply && toastDismiss) {
    toastText.textContent = message;
    toast.style.display = 'block';
    toastApply.disabled = false;
    toastApply.textContent = 'Zastosuj';
    toastApply.onclick = () => {
      toastApply.disabled = true;
      toastApply.textContent = 'Aktualizuj...';
      if (updatePromptAction) {
        try {
          updatePromptAction();
        } catch (err) {
          window.location.reload();
        }
      } else {
        window.location.reload();
      }
    };
    toastDismiss.onclick = () => {
      toast.style.display = 'none';
      updatePromptEl = null;
      updatePromptAction = null;
    };
    updatePromptEl = toast;
    return;
  }

  if (updatePromptEl) {
    const textNode = updatePromptEl.querySelector('.update-banner__text');
    if (textNode) textNode.textContent = message;
    updatePromptEl.classList.add('update-banner--visible');
    return;
  }

  if (!document.body) return;

  const banner = document.createElement('div');
  banner.className = 'update-banner update-banner--visible';
  banner.style.cssText = `
    position:fixed;
    bottom:16px;
    right:16px;
    z-index:9999;
    display:flex;
    align-items:center;
    gap:12px;
    padding:12px 16px;
    border-radius:999px;
    background:rgba(17,24,39,0.95);
    color:#fff;
    box-shadow:0 10px 30px rgba(0,0,0,0.35);
    font-size:14px;
    line-height:1.4;
    max-width:90vw;
  `;

  const textSpan = document.createElement('span');
  textSpan.className = 'update-banner__text';
  textSpan.textContent = message;
  textSpan.style.flex = '1';
  banner.appendChild(textSpan);

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.textContent = 'Odswiez';
  reloadBtn.style.cssText = `
    background:#3b82f6;
    color:#fff;
    border:none;
    border-radius:999px;
    padding:6px 14px;
    font-weight:600;
    cursor:pointer;
  `;
  reloadBtn.addEventListener('click', () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = 'Ladowanie...';
    if (updatePromptAction) {
      try {
        updatePromptAction();
      } catch (err) {
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  });
  banner.appendChild(reloadBtn);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'x';
  closeBtn.setAttribute('aria-label', 'Zamknij');
  closeBtn.style.cssText = `
    background:transparent;
    border:none;
    color:inherit;
    font-size:18px;
    line-height:1;
    cursor:pointer;
  `;
  closeBtn.addEventListener('click', () => {
    banner.classList.remove('update-banner--visible');
    banner.style.opacity = '0';
    banner.style.pointerEvents = 'none';
    setTimeout(() => banner.remove(), 300);
    updatePromptEl = null;
    updatePromptAction = null;
  });
  banner.appendChild(closeBtn);

  document.body.appendChild(banner);
  updatePromptEl = banner;
}

export function initServiceWorkerUpdates() {
  if (typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  let reloadPending = false;
  let updateRequestedByUser = false;
  const pageWasControlled = !!navigator.serviceWorker.controller;

  const promptForUpdate = (worker: ServiceWorker) => {
    const message = navigator.onLine
      ? 'Dostepna jest nowa wersja. Kliknij, aby odswiezyc aplikacje.'
      : 'Dostepna jest nowa wersja. Gdy wroci internet, kliknij Odswiez.';
    showUpdatePrompt(message, () => {
      const triggerSkipWaiting = () => {
        updateRequestedByUser = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
        window.setTimeout(() => {
          if (reloadPending) return;
          if (!updateRequestedByUser) return;
          if (!navigator.onLine) return;
          reloadPending = true;
          window.location.reload();
        }, 3000);
      };
      if (navigator.onLine) {
        triggerSkipWaiting();
      } else {
        window.addEventListener(
          'online',
          () => {
            triggerSkipWaiting();
          },
          { once: true }
        );
      }
    });
  };

  const monitorRegistration = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting) {
      promptForUpdate(registration.waiting);
    }
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller || registration.waiting || pageWasControlled) {
            promptForUpdate(newWorker);
          }
        }
      });
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadPending) return;

    if (updateRequestedByUser) {
      if (!navigator.onLine) {
        showUpdatePrompt('Aktualizacja gotowa. Po powrocie internetu aplikacja odswiezy sie sama.');
        window.addEventListener(
          'online',
          () => {
            if (reloadPending) return;
            reloadPending = true;
            window.location.reload();
          },
          { once: true }
        );
        return;
      }
      reloadPending = true;
      window.location.reload();
      return;
    }

    showUpdatePrompt('Aktualizacja gotowa. Kliknij Odswiez, aby uruchomic nowa wersje.', () => {
      reloadPending = true;
      window.location.reload();
    });
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none', scope: '/' });
      registration.update().catch(() => {});
      monitorRegistration(registration);
    } catch (err) {
      // ignore
    }
  });
}
