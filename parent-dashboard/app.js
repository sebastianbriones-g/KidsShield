
// Safe event listener helper to prevent crashes if DOM elements are missing
function safeAddEvent(target, event, handler) {
  try {
    const el = (typeof target === 'string') ? document.getElementById(target) : target;
    if (el && typeof el.addEventListener === 'function') {
      el.addEventListener(event, handler);
    }
  } catch (err) {
    console.warn('[SafeListener] Warning attaching event to:', target, err);
  }
}

// KidsShield - Parent Dashboard Application Logic

let devicesList = [];
let currentDevice = null;


let activeCategoryFilter = 'all';
let searchQuery = '';
let socket = null;
let leafletMap = null;
let leafletMarker = null;
let leafletCircle = null;
let leafletRoutePolyline = null;
let leafletRouteMarkers = [];
let isRouteHistoryVisible = false;
let leafletGeofencesLayers = [];
let areGeofencesVisible = true;
let isAudioRecordingRequested = false;
let autoScreenshotTimer = null;
let isLivePaused = false;
let activeTimelineAppFilter = 'ALL';
let currentView = 'portal';

// Video Clip 5s State
let currentVideoClip = {
  frames: [],
  intervalMs: 500,
  currentIndex: 0,
  isPlaying: false,
  playTimer: null
};

// Admin Session State
let adminUser = null;
let adminAuthToken = localStorage.getItem('kidsshield_admin_token') || null;

// Authenticated fetch wrapper for administrative requests
async function apiFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (adminAuthToken) {
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) options.headers.set('Authorization', `Bearer ${adminAuthToken}`);
    } else if (Array.isArray(options.headers)) {
      options.headers.push(['Authorization', `Bearer ${adminAuthToken}`]);
    } else {
      if (!options.headers['Authorization']) options.headers['Authorization'] = `Bearer ${adminAuthToken}`;
    }
  }
  return fetch(url, options);
}

// DOM Elements
const currentDeviceName = document.getElementById('currentDeviceName');
const batteryStatus = document.getElementById('batteryStatus');
const lastSeenStatus = document.getElementById('lastSeenStatus');
const btnMasterLock = document.getElementById('btnMasterLock');
const masterLockIcon = document.getElementById('masterLockIcon');
const masterLockText = document.getElementById('masterLockText');
const headerPinDisplay = document.getElementById('headerPinDisplay');

const statScreenTimeVal = document.getElementById('statScreenTimeVal');
const statScreenTimeLimit = document.getElementById('statScreenTimeLimit');
const screenTimeProgressBar = document.getElementById('screenTimeProgressBar');
const limitStatusBadge = document.getElementById('limitStatusBadge');
const btnAddBonusTime = document.getElementById('btnAddBonusTime');

const activeAppIcon = document.getElementById('activeAppIcon');
const activeAppName = document.getElementById('activeAppName');
const activeAppDesc = document.getElementById('activeAppDesc');
const activeAppCategory = document.getElementById('activeAppCategory');
const btnQuickBlockActiveApp = document.getElementById('btnQuickBlockActiveApp');

const bedtimeTimeDisplay = document.getElementById('bedtimeTimeDisplay');
const toggleBedtime = document.getElementById('toggleBedtime');
const bedtimeStartInput = document.getElementById('bedtimeStartInput');
const bedtimeEndInput = document.getElementById('bedtimeEndInput');
const btnSaveSchedule = document.getElementById('btnSaveSchedule');

const dailyLimitRange = document.getElementById('dailyLimitRange');
const dailyLimitValText = document.getElementById('dailyLimitValText');

const appSearchInput = document.getElementById('appSearchInput');
const appListContainer = document.getElementById('appListContainer');
const categoryFilter = document.getElementById('categoryFilter');

const activityFeedContainer = document.getElementById('activityFeedContainer');

// Simulator Elements
const simPhoneScreen = document.getElementById('simPhoneScreen');
const simClock = document.getElementById('simClock');
const simLockOverlay = document.getElementById('simLockOverlay');
const simLockTitle = document.getElementById('simLockTitle');
const simLockReason = document.getElementById('simLockReason');
const simAppBadge = document.getElementById('simAppBadge');
const simPinInput = document.getElementById('simPinInput');
const btnSimUnlockPin = document.getElementById('btnSimUnlockPin');

// Modals & New Features DOM Elements
const setupModal = document.getElementById('setupModal');
const btnShowSetupSteps = document.getElementById('btnShowSetupSteps');
const btnCloseSetupModal = document.getElementById('btnCloseSetupModal');
const btnConfirmSteps = document.getElementById('btnConfirmSteps');

const pinModal = document.getElementById('pinModal');
const btnOpenPinModal = document.getElementById('btnOpenPinModal');
const btnClosePinModal = document.getElementById('btnClosePinModal');
const btnCancelPinModal = document.getElementById('btnCancelPinModal');
const btnSavePin = document.getElementById('btnSavePin');
const newPinInput = document.getElementById('newPinInput');

// Multi-Device DOM
const deviceSelectorDropdown = document.getElementById('deviceSelectorDropdown');
const btnOpenAddDeviceModal = document.getElementById('btnOpenAddDeviceModal');
const btnOpenPairingQrModal = document.getElementById('btnOpenPairingQrModal');
const modalAddDevice = document.getElementById('modalAddDevice');
const btnCloseAddDeviceModal = document.getElementById('btnCloseAddDeviceModal');
const btnCancelAddDevice = document.getElementById('btnCancelAddDevice');
const btnSubmitAddDevice = document.getElementById('btnSubmitAddDevice');
const inputNewDeviceId = document.getElementById('inputNewDeviceId');
const inputNewDeviceName = document.getElementById('inputNewDeviceName');
const inputNewDeviceModel = document.getElementById('inputNewDeviceModel');
const inputNewDevicePin = document.getElementById('inputNewDevicePin');

// Pairing QR Modal DOM
const modalPairingQr = document.getElementById('modalPairingQr');
const btnClosePairingQrModal = document.getElementById('btnClosePairingQrModal');
const btnDonePairingQr = document.getElementById('btnDonePairingQr');
const btnCopyPairingPayload = document.getElementById('btnCopyPairingPayload');
const qrCodeImg = document.getElementById('qrCodeImg');
const qrCodeCanvas = document.getElementById('qrCodeCanvas');
const qrModalDeviceName = document.getElementById('qrModalDeviceName');
const qrModalDeviceId = document.getElementById('qrModalDeviceId');
const qrModalServerUrl = document.getElementById('qrModalServerUrl');
const qrModalDevicePin = document.getElementById('qrModalDevicePin');

// 5s Video Clip DOM
const btnCaptureVideo5s = document.getElementById('btnCaptureVideo5s');
const btnCaptureVideoText = document.getElementById('btnCaptureVideoText');
const btnCaptureVideoIcon = document.getElementById('btnCaptureVideoIcon');
const simVideoClipOverlay = document.getElementById('simVideoClipOverlay');
const simVideoClipFrame = document.getElementById('simVideoClipFrame');
const btnPlayPauseClip = document.getElementById('btnPlayPauseClip');
const clipTimelineSlider = document.getElementById('clipTimelineSlider');
const clipTimeText = document.getElementById('clipTimeText');
const btnCloseVideoClip = document.getElementById('btnCloseVideoClip');

// Route History DOM
const btnToggleRouteHistory = document.getElementById('btnToggleRouteHistory');
const routeHistoryPanel = document.getElementById('routeHistoryPanel');
const routeHistoryItemsList = document.getElementById('routeHistoryItemsList');
const routePointsCountBadge = document.getElementById('routePointsCountBadge');

// Admin Auth DOM
const btnAdminProfile = document.getElementById('btnAdminProfile');
const modalAdminLogin = document.getElementById('modalAdminLogin');
const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');
const btnCloseAdminModalFooter = document.getElementById('btnCloseAdminModalFooter');
const adminLoggedOutSection = document.getElementById('adminLoggedOutSection');
const adminLoggedInSection = document.getElementById('adminLoggedInSection');
const btnLoginWithGoogle = document.getElementById('btnLoginWithGoogle');
const btnRegisterWithGoogle = document.getElementById('btnRegisterWithGoogle');
const btnAdminLogout = document.getElementById('btnAdminLogout');
const adminProfileName = document.getElementById('adminProfileName');
const adminProfileEmail = document.getElementById('adminProfileEmail');
const adminProfileImg = document.getElementById('adminProfileImg');
const adminProfileAvatarFallback = document.getElementById('adminProfileAvatarFallback');
const adminNameText = document.getElementById('adminNameText');
const adminProfilePlanText = document.getElementById('adminProfilePlanText');
const adminProfileDeviceLimitText = document.getElementById('adminProfileDeviceLimitText');
const adminFamilyIdBadge = document.getElementById('adminFamilyIdBadge');

// Google Auth DOM Controls
const btnDemoGoogleLogin = document.getElementById('btnDemoGoogleLogin');
const btnToggleGcpConfig = document.getElementById('btnToggleGcpConfig');
const gcpConfigPanel = document.getElementById('gcpConfigPanel');
const inputGoogleClientId = document.getElementById('inputGoogleClientId');
const btnSaveGoogleClientId = document.getElementById('btnSaveGoogleClientId');
const googleStatusBadge = document.getElementById('googleStatusBadge');
const googleOfficialButtonWrapper = document.getElementById('googleOfficialButtonWrapper');

// Family Auth Tabs & Forms DOM
const tabBtnLogin = document.getElementById('tabBtnLogin');
const tabBtnRegister = document.getElementById('tabBtnRegister');
const formLoginTab = document.getElementById('formLoginTab');
const formRegisterTab = document.getElementById('formRegisterTab');
const loginEmailInput = document.getElementById('loginEmailInput');
const loginPasswordInput = document.getElementById('loginPasswordInput');
const btnSubmitEmailLogin = document.getElementById('btnSubmitEmailLogin');
const regNameInput = document.getElementById('regNameInput');
const regEmailInput = document.getElementById('regEmailInput');
const regPasswordInput = document.getElementById('regPasswordInput');
const btnSubmitRegister = document.getElementById('btnSubmitRegister');

// SaaS Subscription & Monetization DOM
const headerPlanName = document.getElementById('headerPlanName');
const btnOpenSubscriptionModal = document.getElementById('btnOpenSubscriptionModal');
const modalSubscription = document.getElementById('modalSubscription');
const btnCloseSubscriptionModal = document.getElementById('btnCloseSubscriptionModal');
const btnCloseSubscriptionModalFooter = document.getElementById('btnCloseSubscriptionModalFooter');
const btnAdminOpenSubscriptionModal = document.getElementById('btnAdminOpenSubscriptionModal');
const btnSelectPlanFree = document.getElementById('btnSelectPlanFree');
const btnSelectPlanPro = document.getElementById('btnSelectPlanPro');
const btnSelectPlanFamilyTotal = document.getElementById('btnSelectPlanFamilyTotal');

let currentSubscription = { plan: 'pro', maxDevices: 5, status: 'active' };

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  try {
    setupWebSocket();
    try { bindEvents(); } catch (e) { console.error('[Init] Error in bindEvents:', e); }
    try { await initAdminAuth(); } catch (e) { console.error('[Init] Error in initAdminAuth:', e); }
    try { await initGoogleAuth(); } catch (e) { console.error('[Init] Error in initGoogleAuth:', e); }
    try { await loadSubscriptionInfo(); } catch (e) { console.error('[Init] Error in loadSubscriptionInfo:', e); }
    try { await loadDevicesList(); } catch (e) { console.error('[Init] Error in loadDevicesList:', e); }
    try { await checkUrlResetToken(); } catch (e) { console.error('[Init] Error in checkUrlResetToken:', e); }
    try { renderAll(); } catch (e) { console.error('[Init] Error in renderAll:', e); }
    startClock();
  } catch (globalInitErr) {
    console.error('[Init] Fatal startup error caught:', globalInitErr);
  }
});

// Format minutes into "Xh Ym"
function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h 00m`;
  return `${m}m`;
}

// Render everything based on state
function renderAll() {
  if (!currentDevice) {
    renderNoDeviceState();
    return;
  }
  renderHeader();
  renderHero();
  renderAppList();
  renderScheduleControls();
  renderSimulator();
  renderMap();
  renderActivityFeed();
}

// Render empty / waiting state when no device is linked
function renderNoDeviceState() {
  // Header
  const onlineIndicator = document.getElementById('onlineIndicator');
  const onlineText = document.getElementById('onlineText');
  const lastSeenStatus = document.getElementById('lastSeenStatus');
  const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
  const headerPinDisplay = document.getElementById('headerPinDisplay');

  if (onlineIndicator) onlineIndicator.className = 'status-indicator offline';
  if (onlineText) onlineText.textContent = 'Sin dispositivo';
  if (batteryStatus) batteryStatus.textContent = '🔋 --%';
  if (lastSeenStatus) lastSeenStatus.textContent = 'Sin dispositivo vinculado';
  if (headerPinDisplay) headerPinDisplay.textContent = '----';
  if (pairingCodeDisplay) pairingCodeDisplay.textContent = 'KID-PHONE-01';

  if (btnMasterLock) {
    btnMasterLock.classList.remove('is-locked');
    masterLockIcon.textContent = '🔒';
    masterLockText.textContent = 'Sin Dispositivo';
    btnMasterLock.disabled = true;
    btnMasterLock.style.opacity = '0.5';
    btnMasterLock.style.cursor = 'not-allowed';
  }

  // Hero
  if (statScreenTimeVal) statScreenTimeVal.textContent = '0m';
  if (statScreenTimeLimit) statScreenTimeLimit.textContent = '/ sin dispositivo';
  if (screenTimeProgressBar) {
    screenTimeProgressBar.style.width = '0%';
    screenTimeProgressBar.className = 'progress-bar-fill';
  }
  if (limitStatusBadge) {
    limitStatusBadge.className = 'badge';
    limitStatusBadge.style.background = 'rgba(255,255,255,0.08)';
    limitStatusBadge.style.color = 'var(--text-secondary)';
    limitStatusBadge.textContent = '⚪ Sin dispositivo vinculado';
  }

  // Active App
  if (activeAppIcon) activeAppIcon.textContent = '📱';
  if (activeAppName) activeAppName.textContent = 'Sin dispositivo vinculado';
  if (activeAppCategory) {
    activeAppCategory.textContent = 'En espera';
  }
  if (activeAppDesc) activeAppDesc.textContent = 'Haz clic en "➕ Dispositivo" o "🔗 Vincular QR" para supervisar';
  if (btnQuickBlockActiveApp) {
    btnQuickBlockActiveApp.disabled = true;
    btnQuickBlockActiveApp.style.opacity = '0.5';
    btnQuickBlockActiveApp.style.cursor = 'not-allowed';
    btnQuickBlockActiveApp.textContent = '⛔ Bloquear App';
  }

  // App List
  if (appListContainer) {
    appListContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
        <div style="font-size: 2.5rem; margin-bottom: 12px; opacity: 0.7;">📲</div>
        <h4 style="color: #fff; margin-bottom: 6px;">Sin dispositivo vinculado</h4>
        <p style="font-size: 0.85rem; max-width: 380px; margin: 0 auto 16px auto; color: var(--text-muted);">
          Para visualizar y gestionar las aplicaciones instaladas, vincula el teléfono móvil del menor usando el código QR o el botón ➕ Dispositivo.
        </p>
        <button class="btn btn-primary btn-sm" id="btnEmptyStatePairQr" style="margin: 0 auto; padding: 8px 16px;">
          🔗 Vincular Teléfono con Código QR
        </button>
      </div>
    `;
    const btnEmptyStatePairQr = document.getElementById('btnEmptyStatePairQr');
    if (btnEmptyStatePairQr) {
      btnEmptyStatePairQr.addEventListener('click', openPairingQrModal);
    }
  }

  // Simulator
  const simBatteryStatus = document.getElementById('simBatteryStatus');
  const simNormalScreen = document.getElementById('simNormalScreen');
  const simScreenshotStatusText = document.getElementById('simScreenshotStatusText');
  if (simClock) simClock.textContent = '--:--';
  if (simBatteryStatus) simBatteryStatus.textContent = '🔋 --%';
  if (simNormalScreen) {
    simNormalScreen.innerHTML = `
      <div style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; color: var(--text-secondary);">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(99,102,241,0.15); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; margin-bottom: 14px; border: 1px dashed rgba(99,102,241,0.4);">
          📱
        </div>
        <h4 style="color: #fff; margin-bottom: 6px; font-size: 0.95rem;">Sin dispositivo</h4>
        <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; margin-bottom: 14px;">
          Escanea el código QR desde la APK KidsShield en el móvil para ver la pantalla en vivo.
        </p>
        <button class="btn btn-secondary btn-sm" id="btnSimEmptyStatePairQr" style="font-size: 0.76rem; padding: 6px 12px;">
          Ver Código QR
        </button>
      </div>
    `;
    const btnSimEmptyStatePairQr = document.getElementById('btnSimEmptyStatePairQr');
    if (btnSimEmptyStatePairQr) {
      btnSimEmptyStatePairQr.addEventListener('click', openPairingQrModal);
    }
  }
  if (simScreenshotStatusText) simScreenshotStatusText.textContent = 'Sin dispositivo vinculado';

  // Map
  const mapAddressText = document.getElementById('mapAddressText');
  const mapGpsBadge = document.getElementById('mapGpsBadge');
  const mapCoordsText = document.getElementById('mapCoordsText');
  const mapAccuracyText = document.getElementById('mapAccuracyText');
  if (mapAddressText) mapAddressText.textContent = '📍 No hay dispositivo vinculado actualmente';
  if (mapGpsBadge) {
    mapGpsBadge.textContent = 'Sin GPS';
    mapGpsBadge.className = 'badge';
    mapGpsBadge.style.background = 'rgba(255,255,255,0.1)';
  }
  if (mapCoordsText) mapCoordsText.textContent = 'Vincula un teléfono para rastrear su posición en tiempo real';
  if (mapAccuracyText) mapAccuracyText.textContent = 'Sin señal satelital';

  // Mic card
  const micDeviceStatus = document.getElementById('micDeviceStatus');
  const btnTriggerAudioRecord = document.getElementById('btnTriggerAudioRecord');
  if (micDeviceStatus) micDeviceStatus.textContent = 'Sin dispositivo vinculado';
  if (btnTriggerAudioRecord) {
    btnTriggerAudioRecord.disabled = true;
    btnTriggerAudioRecord.style.opacity = '0.5';
    btnTriggerAudioRecord.style.cursor = 'not-allowed';
  }

  // Activity feed
  if (activityFeedContainer) {
    activityFeedContainer.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
        No hay registros de actividad. Vincula un dispositivo para recibir eventos y alertas en tiempo real.
      </div>
    `;
  }
}


function renderHeader() {
  if (currentDeviceName) currentDeviceName.textContent = currentDevice.name;

  const onlineIndicator = document.getElementById('onlineIndicator');
  const onlineText = document.getElementById('onlineText');
  const lastSeenStatus = document.getElementById('lastSeenStatus');

  if (currentDevice.isOnline) {
    if (onlineIndicator) onlineIndicator.className = 'status-indicator online';
    if (onlineText) onlineText.textContent = 'En línea';
    if (batteryStatus) batteryStatus.textContent = (currentDevice.battery !== null && currentDevice.battery !== undefined) ? `🔋 ${currentDevice.battery}%` : '🔋 --%';
    if (lastSeenStatus) lastSeenStatus.textContent = 'Conectado ahora';
  } else {
    if (onlineIndicator) {
      onlineIndicator.className = currentDevice.lastSeen ? 'status-indicator disconnected' : 'status-indicator offline';
    }
    if (onlineText) {
      onlineText.textContent = currentDevice.lastSeen ? 'Desconectado (Conexión perdida)' : 'Esperando conexión';
    }
    if (batteryStatus) batteryStatus.textContent = currentDevice.battery ? `🔋 ${currentDevice.battery}%` : '🔋 --%';
    if (lastSeenStatus) {
      lastSeenStatus.textContent = currentDevice.lastSeen ? `Última conexión: ${new Date(currentDevice.lastSeen).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Sin sincronizar aún';
    }
  }

  if (headerPinDisplay) headerPinDisplay.textContent = currentDevice.parentPin;
  
  const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
  if (pairingCodeDisplay) pairingCodeDisplay.textContent = currentDevice.id;

  if (currentDevice.isLocked) {
    btnMasterLock.classList.add('is-locked');
    masterLockIcon.textContent = '🔓';
    masterLockText.textContent = 'Desbloquear Teléfono';
  } else {
    btnMasterLock.classList.remove('is-locked');
    masterLockIcon.textContent = '🔒';
    masterLockText.textContent = 'Bloquear Teléfono Ahora';
  }
}

function renderHero() {
  // Screentime
  const used = currentDevice.screenTimeTodayMinutes || 0;
  const limit = currentDevice.dailyLimitMinutes || 120;
  statScreenTimeVal.textContent = used > 0 ? formatMinutes(used) : '0m';
  statScreenTimeLimit.textContent = `/ límite ${formatMinutes(limit)}`;

  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  screenTimeProgressBar.style.width = `${percent}%`;

  if (used === 0) {
    screenTimeProgressBar.className = 'progress-bar-fill';
    limitStatusBadge.className = 'badge badge-accent';
    limitStatusBadge.textContent = '🟢 Sin uso hoy';
  } else if (used >= limit) {
    screenTimeProgressBar.className = 'progress-bar-fill progress-exceeded';
    limitStatusBadge.className = 'badge badge-warning';
    limitStatusBadge.textContent = '⚠️ Límite diario excedido';
  } else {
    screenTimeProgressBar.className = 'progress-bar-fill';
    limitStatusBadge.className = 'badge badge-accent';
    limitStatusBadge.textContent = `Restan ${formatMinutes(limit - used)}`;
  }

  // Active App
  const activeApp = (currentDevice.appCatalog || []).find(a => a.package === currentDevice.currentActiveApp);
  if (activeApp) {
    activeAppIcon.textContent = activeApp.icon || '📱';
    activeAppName.textContent = activeApp.name;
    activeAppCategory.textContent = activeApp.category || 'Aplicación';
    activeAppDesc.textContent = `En uso hoy: ${formatMinutes(activeApp.timeTodayMinutes || 0)}`;

    btnQuickBlockActiveApp.disabled = false;
    btnQuickBlockActiveApp.style.opacity = '1';
    btnQuickBlockActiveApp.style.cursor = 'pointer';

    if (activeApp.isBlocked) {
      btnQuickBlockActiveApp.textContent = '✅ Desbloquear App';
      btnQuickBlockActiveApp.style.background = 'rgba(16, 185, 129, 0.2)';
      btnQuickBlockActiveApp.style.color = '#34d399';
    } else {
      btnQuickBlockActiveApp.textContent = '⛔ Bloquear Esta App';
      btnQuickBlockActiveApp.style.background = 'rgba(239, 68, 68, 0.15)';
      btnQuickBlockActiveApp.style.color = '#f87171';
    }
  } else {
    activeAppIcon.textContent = '📱';
    activeAppName.textContent = currentDevice.currentActiveAppName || (currentDevice.isOnline ? 'En pantalla de inicio / Reposo' : 'Sin aplicación activa');
    activeAppCategory.textContent = currentDevice.isOnline ? 'Sistema' : 'En espera';
    activeAppDesc.textContent = currentDevice.isOnline ? 'El teléfono no tiene ninguna aplicación en primer plano' : 'Esperando actividad en el teléfono móvil';

    btnQuickBlockActiveApp.disabled = true;
    btnQuickBlockActiveApp.textContent = '⛔ Bloquear Esta App';
    btnQuickBlockActiveApp.style.opacity = '0.5';
    btnQuickBlockActiveApp.style.cursor = 'not-allowed';
  }

  // Bedtime
  toggleBedtime.checked = Boolean(currentDevice.bedtimeEnabled);
  bedtimeTimeDisplay.textContent = `${currentDevice.bedtimeStart || '21:30'} - ${currentDevice.bedtimeEnd || '07:00'}`;
  bedtimeStartInput.value = currentDevice.bedtimeStart || '21:30';
  bedtimeEndInput.value = currentDevice.bedtimeEnd || '07:00';
}

function renderAppList() {
  appListContainer.innerHTML = '';

  if (!currentDevice.appCatalog || currentDevice.appCatalog.length === 0) {
    appListContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 16px; color: var(--text-secondary);">
        <div style="font-size: 2.2rem; margin-bottom: 8px;">📱</div>
        <div style="font-weight: 600; color: #fff; font-size: 0.95rem; margin-bottom: 4px;">Esperando sincronización de aplicaciones</div>
        <p style="font-size: 0.8rem; color: var(--text-muted); max-width: 360px; margin: 0 auto; line-height: 1.4;">
          Las aplicaciones instaladas en el teléfono del menor aparecerán aquí una vez que el dispositivo se sincronice.
        </p>
      </div>
    `;
    return;
  }

  const filtered = currentDevice.appCatalog.filter(app => {
    const matchesCat = activeCategoryFilter === 'all' || app.category === activeCategoryFilter;
    const matchesSearch = app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          app.package.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  if (filtered.length === 0) {
    appListContainer.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.88rem;">
        No se encontraron aplicaciones con ese filtro.
      </div>
    `;
    return;
  }

  filtered.forEach(app => {
    const appLimit = (currentDevice.appLimits && currentDevice.appLimits[app.package]) || 0;
    const isLimitExceeded = appLimit > 0 && app.timeTodayMinutes >= appLimit;

    const row = document.createElement('div');
    row.className = `app-row ${app.isBlocked || isLimitExceeded ? 'is-blocked' : ''}`;
    row.innerHTML = `
      <div class="app-info-left">
        <div class="app-icon-badge">${app.icon}</div>
        <div class="app-text-group">
          <div class="app-title-line">
            <span class="app-name">${app.name}</span>
            <span class="app-tag">${app.category}</span>
            ${appLimit > 0 ? `<span class="app-limit-badge ${isLimitExceeded ? 'exceeded' : ''}">⏱️ Límite: ${appLimit}m</span>` : ''}
          </div>
          <span class="app-time-sub">${app.isBlocked ? '🚫 Acceso bloqueado' : (isLimitExceeded ? '⌛ Límite individual agotado' : `⏱️ ${formatMinutes(app.timeTodayMinutes)} hoy`)}</span>
        </div>
      </div>
      <div class="app-item-actions">
        <select class="app-limit-select" data-pkg="${app.package}" title="Fijar límite diario para esta aplicación">
          <option value="0" ${!appLimit ? 'selected' : ''}>Sin límite</option>
          <option value="15" ${appLimit === 15 ? 'selected' : ''}>15 min</option>
          <option value="30" ${appLimit === 30 ? 'selected' : ''}>30 min</option>
          <option value="45" ${appLimit === 45 ? 'selected' : ''}>45 min</option>
          <option value="60" ${appLimit === 60 ? 'selected' : ''}>1 hora</option>
          <option value="90" ${appLimit === 90 ? 'selected' : ''}>1.5 horas</option>
          <option value="120" ${appLimit === 120 ? 'selected' : ''}>2 horas</option>
        </select>
        <button class="toggle-block-btn ${app.isBlocked ? 'btn-blocked' : 'btn-allowed'}" data-pkg="${app.package}">
          ${app.isBlocked ? '🚫 Bloqueada' : '✓ Permitida'}
        </button>
      </div>
    `;

    row.querySelector('.toggle-block-btn').addEventListener('click', () => {
      toggleAppBlock(app.package, !app.isBlocked);
    });

    row.querySelector('.app-limit-select').addEventListener('change', (e) => {
      const limitVal = parseInt(e.target.value, 10);
      if (!currentDevice.appLimits) currentDevice.appLimits = {};
      if (limitVal > 0) {
        currentDevice.appLimits[app.package] = limitVal;
      } else {
        delete currentDevice.appLimits[app.package];
      }
      updateRemoteConfig({ appLimits: currentDevice.appLimits });
      showToast(`Límite para ${app.name}: ${limitVal > 0 ? limitVal + ' min' : 'Sin límite'}`, 'info');
    });

    appListContainer.appendChild(row);
  });
}

function renderScheduleControls() {
  dailyLimitRange.value = currentDevice.dailyLimitMinutes;
  dailyLimitValText.textContent = formatMinutes(currentDevice.dailyLimitMinutes);
}

function renderSimulator() {
  const activeApp = (currentDevice.appCatalog || []).find(a => a.package === currentDevice.currentActiveApp);
  const simAppBadge = document.getElementById('simAppBadge');
  const simAppTimeBadge = document.getElementById('simAppTimeBadge');
  const simNormalScreen = document.getElementById('simNormalScreen');

  if (activeApp) {
    if (simAppBadge) simAppBadge.textContent = `${activeApp.icon || '📱'} ${activeApp.name}`;
    if (simAppTimeBadge) simAppTimeBadge.textContent = `${formatMinutes(activeApp.timeTodayMinutes || 0)} hoy`;
    if (simNormalScreen) {
      simNormalScreen.innerHTML = `
        <div class="sim-active-header">
          <span class="sim-app-badge">${activeApp.icon || '📱'} ${activeApp.name}</span>
          <span class="sim-time-badge">${formatMinutes(activeApp.timeTodayMinutes || 0)} hoy</span>
        </div>
        <div class="sim-fake-app-view">
          <div class="sim-video-placeholder">
            <div class="sim-play-icon">▶</div>
            <span>${activeApp.name}</span>
          </div>
        </div>
      `;
    }
  } else {
    if (simAppBadge) simAppBadge.textContent = '📱 En espera';
    if (simAppTimeBadge) simAppTimeBadge.textContent = '0m hoy';
    if (simNormalScreen) {
      simNormalScreen.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; padding: 24px; color: #94a3b8;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📱</div>
          <div style="font-weight: 600; color: #f1f5f9; font-size: 0.9rem; margin-bottom: 4px;">Pantalla en Reposo</div>
          <div style="font-size: 0.72rem; color: #64748b; line-height: 1.4; max-width: 170px;">
            Pulsa "Capturar" o "Video" arriba para ver la pantalla en tiempo real
          </div>
        </div>
      `;
    }
  }

  const simBatteryStatus = document.getElementById('simBatteryStatus');
  if (simBatteryStatus) {
    simBatteryStatus.textContent = (currentDevice.battery !== null && currentDevice.battery !== undefined) ? `🔋 ${currentDevice.battery}%` : '🔋 --%';
  }

  // Real Screenshot Projection
  const simLiveScreenImg = document.getElementById('simLiveScreenImg');
  const simScreenshotStatusText = document.getElementById('simScreenshotStatusText');
  if (simLiveScreenImg) {
    if (currentDevice.lastScreenshot) {
      simLiveScreenImg.src = currentDevice.lastScreenshot.startsWith('data:') 
        ? currentDevice.lastScreenshot 
        : 'data:image/jpeg;base64,' + currentDevice.lastScreenshot;
      simLiveScreenImg.style.display = 'block';
      if (simNormalScreen) simNormalScreen.style.display = 'none';

      if (simScreenshotStatusText && currentDevice.lastScreenshotTime) {
        const d = new Date(currentDevice.lastScreenshotTime);
        simScreenshotStatusText.innerHTML = `✅ Última captura en vivo: <strong>${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>`;
        simScreenshotStatusText.style.color = '#34d399';
      }
    } else {
      simLiveScreenImg.style.display = 'none';
      if (simNormalScreen) simNormalScreen.style.display = 'flex';
      if (simScreenshotStatusText) {
        simScreenshotStatusText.textContent = 'Última captura: Esperando primera transmisión del móvil...';
        simScreenshotStatusText.style.color = 'var(--text-muted)';
      }
    }
  }

  const appLimit = (activeApp && currentDevice.appLimits) ? currentDevice.appLimits[activeApp.package] : 0;
  const isAppLimitExceeded = appLimit > 0 && activeApp && (activeApp.timeTodayMinutes || 0) >= appLimit;
  const isBlockedApp = activeApp && (activeApp.isBlocked || isAppLimitExceeded);
  const isOverLimit = (currentDevice.screenTimeTodayMinutes || 0) >= (currentDevice.dailyLimitMinutes || 120);
  const isLockedMaster = currentDevice.isLocked;

  if (isLockedMaster || isBlockedApp || isOverLimit) {
    simLockOverlay.classList.add('active');
    if (isLockedMaster) {
      simLockTitle.textContent = '🔒 Teléfono Pausado';
      simLockReason.textContent = currentDevice.lockReason || 'Bloqueado remotamente por tus padres.';
    } else if (isAppLimitExceeded) {
      simLockTitle.textContent = '⌛ Límite de App Agotado';
      simLockReason.textContent = `Has alcanzado el límite diario de ${appLimit} min en ${activeApp.name}.`;
    } else if (isBlockedApp) {
      simLockTitle.textContent = '🚫 Aplicación Prohibida';
      simLockReason.textContent = `El uso de ${activeApp.name} ha sido restringido por tus padres.`;
    } else if (isOverLimit) {
      simLockTitle.textContent = '⌛ Tiempo Agotado';
      simLockReason.textContent = 'Has alcanzado el límite diario permitido de tiempo de pantalla.';
    }
  } else {
    simLockOverlay.classList.remove('active');
  }
}

function renderMap() {
  const loc = currentDevice.location;
  const addressEl = document.getElementById('locationAddressText');
  const lastUpdatedEl = document.getElementById('locationLastUpdatedText');
  const accuracyBadge = document.getElementById('locationAccuracyBadge');
  const mapContainer = document.getElementById('mapLeaflet');

  if (!loc || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
    if (addressEl) addressEl.textContent = '📍 Esperando primera coordenada GPS del dispositivo...';
    if (lastUpdatedEl) lastUpdatedEl.textContent = 'Sin señal satelital aún';
    if (accuracyBadge) accuracyBadge.textContent = 'Esperando GPS';

    if (mapContainer && typeof L !== 'undefined') {
      try {
        if (!leafletMap) {
          leafletMap = L.map('mapLeaflet', { zoomControl: true }).setView([-33.4489, -70.6693], 12);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
          }).addTo(leafletMap);
        }
        setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
      } catch (e) {}
    }
    return;
  }

  const lat = loc.latitude;
  const lng = loc.longitude;
  const accuracy = loc.accuracy || 15;

  if (addressEl && loc.address) addressEl.textContent = `📍 ${loc.address}`;

  if (lastUpdatedEl && loc.lastUpdated) {
    const d = new Date(loc.lastUpdated);
    lastUpdatedEl.textContent = `Actualizado: ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  }

  if (accuracyBadge) accuracyBadge.textContent = `GPS Activo (±${Math.round(accuracy)}m)`;

  if (!mapContainer || typeof L === 'undefined') return;

  try {
    if (!leafletMap) {
      leafletMap = L.map('mapLeaflet', { zoomControl: true }).setView([lat, lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(leafletMap);

      leafletMarker = L.marker([lat, lng]).addTo(leafletMap)
        .bindPopup(`<b>${currentDevice.name}</b><br>Ubicación actual`)
        .openPopup();

      leafletCircle = L.circle([lat, lng], {
        radius: accuracy,
        color: '#6366f1',
        fillColor: '#6366f1',
        fillOpacity: 0.15
      }).addTo(leafletMap);
    } else {
      if (!leafletMarker) {
        leafletMarker = L.marker([lat, lng]).addTo(leafletMap);
      } else {
        leafletMarker.setLatLng([lat, lng]);
      }
      leafletMarker.setPopupContent(`<b>${currentDevice.name}</b><br>Ubicación actual`);

      if (!leafletCircle) {
        leafletCircle = L.circle([lat, lng], {
          radius: accuracy,
          color: '#6366f1',
          fillColor: '#6366f1',
          fillOpacity: 0.15
        }).addTo(leafletMap);
      } else {
        leafletCircle.setLatLng([lat, lng]);
        leafletCircle.setRadius(accuracy);
      }

      leafletMap.panTo([lat, lng]);
    }

    if (areGeofencesVisible) {
      fetchAndRenderGeofences();
    }
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
  } catch (err) {
    console.error('Error inicializando mapa Leaflet', err);
  }
}

function renderTimelineAppChips() {
  const chipsContainer = document.getElementById('timelineFilterChips');
  if (!chipsContainer) return;
  chipsContainer.innerHTML = '';

  if (!currentDevice) return;

  // Recopilar apps únicas del catálogo y del registro de actividad
  const appsMap = new Map();
  if (currentDevice.appCatalog) {
    currentDevice.appCatalog.forEach(a => {
      appsMap.set(a.package, { name: a.name, icon: a.icon || '📱', package: a.package });
    });
  }

  if (currentDevice.activityLog) {
    currentDevice.activityLog.forEach(item => {
      if (item.package && !appsMap.has(item.package)) {
        appsMap.set(item.package, {
          name: item.appName || item.package,
          icon: '📱',
          package: item.package
        });
      }
    });
  }

  // Chip 'Todas las Apps'
  const btnAll = document.createElement('button');
  btnAll.className = `timeline-chip ${activeTimelineAppFilter === 'ALL' ? 'active' : ''}`;
  btnAll.innerHTML = `<span>🌐</span><span>Todas las Apps</span>`;
  btnAll.addEventListener('click', () => {
    activeTimelineAppFilter = 'ALL';
    renderTimelineAppChips();
    renderActivityFeed();
  });
  chipsContainer.appendChild(btnAll);

  // Chips por cada aplicación detectada
  appsMap.forEach(app => {
    const btn = document.createElement('button');
    btn.className = `timeline-chip ${activeTimelineAppFilter === app.package ? 'active' : ''}`;
    btn.innerHTML = `<span>${app.icon}</span><span>${app.name}</span>`;
    btn.addEventListener('click', () => {
      activeTimelineAppFilter = app.package;
      renderTimelineAppChips();
      renderActivityFeed();
    });
    chipsContainer.appendChild(btn);
  });
}

function renderActivityFeed() {
  if (!activityFeedContainer) return;
  activityFeedContainer.innerHTML = '';

  renderTimelineAppChips();

  if (!currentDevice || !currentDevice.activityLog || currentDevice.activityLog.length === 0) {
    activityFeedContainer.innerHTML = `
      <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-size: 0.84rem;">
        <div style="font-size: 1.8rem; margin-bottom: 8px;">⏳</div>
        Esperando primeros eventos del dispositivo en tiempo real.
      </div>
    `;
    return;
  }

  const filtered = currentDevice.activityLog.filter(item => {
    if (activeTimelineAppFilter === 'ALL') return true;
    return item.package === activeTimelineAppFilter || item.appName === activeTimelineAppFilter;
  });

  if (filtered.length === 0) {
    activityFeedContainer.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
        No hay eventos registrados para esta aplicación todavía.
      </div>
    `;
    return;
  }

  filtered.forEach(item => {
    const el = document.createElement('div');
    el.className = `activity-item ${item.type || 'info'}`;

    let appBadgeHtml = '';
    if (item.appName || item.package) {
      const isBlocked = item.type === 'blocked' || item.type === 'warning';
      const isGps = item.type === 'gps_alert';
      const badgeClass = isGps ? 'log-app-badge app-gps' : (isBlocked ? 'log-app-badge app-blocked' : 'log-app-badge');
      const icon = isGps ? '📍' : (isBlocked ? '🚫' : '📱');
      appBadgeHtml = `<span class="${badgeClass}">${icon} ${item.appName || item.package}</span>`;
    }

    el.innerHTML = `
      <span class="activity-time">${item.time || ''}</span>
      <span class="activity-msg">${appBadgeHtml}${item.message}</span>
    `;
    activityFeedContainer.appendChild(el);
  });
}
// Screen Time Quick Controls (-15m / +15m)
function decreaseDailyLimit15m() {
  if (!currentDevice) {
    showToast('No hay dispositivo vinculado', 'warning');
    return;
  }
  const current = currentDevice.dailyLimitMinutes || 120;
  const newLimit = Math.max(15, current - 15);
  if (newLimit === current) {
    showToast('El límite mínimo es de 15 minutos', 'warning');
    return;
  }
  currentDevice.dailyLimitMinutes = newLimit;
  updateRemoteConfig({ dailyLimitMinutes: newLimit });
  renderHero();
  renderScheduleControls();
  const cardDaily = document.getElementById('cardDailyTimeLimitText');
  if (cardDaily) cardDaily.textContent = formatMinutes(newLimit);
  showToast(`Límite reducido a ${formatMinutes(newLimit)}`, 'info');
}

function increaseDailyLimit15m() {
  if (!currentDevice) {
    showToast('No hay dispositivo vinculado', 'warning');
    return;
  }
  const current = currentDevice.dailyLimitMinutes || 120;
  const newLimit = Math.min(720, current + 15);
  currentDevice.dailyLimitMinutes = newLimit;
  updateRemoteConfig({ dailyLimitMinutes: newLimit });
  renderHero();
  renderScheduleControls();
  const cardDaily = document.getElementById('cardDailyTimeLimitText');
  if (cardDaily) cardDaily.textContent = formatMinutes(newLimit);
  showToast(`Límite aumentado a ${formatMinutes(newLimit)}`, 'success');
}

function increaseDailyLimit30m() {
  if (!currentDevice) {
    showToast('No hay dispositivo vinculado', 'warning');
    return;
  }
  const current = currentDevice.dailyLimitMinutes || 120;
  const newLimit = Math.min(720, current + 30);
  currentDevice.dailyLimitMinutes = newLimit;
  updateRemoteConfig({ dailyLimitMinutes: newLimit });
  renderHero();
  renderScheduleControls();
  const cardDaily = document.getElementById('cardDailyTimeLimitText');
  if (cardDaily) cardDaily.textContent = formatMinutes(newLimit);
  showToast(`⚡ Límite aumentado a ${formatMinutes(newLimit)} (+30m)`, 'success');
}

// Live Screenshot Pause / Resume
function toggleLiveScreenshotPause() {
  if (!currentDevice) {
    showToast('No hay dispositivo vinculado', 'warning');
    return;
  }
  isLivePaused = !isLivePaused;
  currentDevice.isLivePaused = isLivePaused;
  updateRemoteConfig({ isLivePaused });
  renderLivePauseState();
  showToast(isLivePaused ? '⏸️ Capturas en vivo pausadas' : '▶️ Capturas en vivo reanudadas', isLivePaused ? 'warning' : 'success');
}

function renderLivePauseState() {
  const btn = document.getElementById('btnTogglePauseLive') || document.getElementById('btnToggleLivePause');
  const icon = document.getElementById('btnPauseLiveIcon') || document.getElementById('livePauseBtnIcon');
  const text = document.getElementById('btnPauseLiveText') || document.getElementById('livePauseBtnText');
  const overlay = document.getElementById('livePausedOverlay');

  if (isLivePaused) {
    if (btn) {
      btn.className = 'btn btn-sm btn-outline btn-paused';
      btn.style.background = 'rgba(239, 68, 68, 0.2)';
      btn.style.borderColor = 'rgba(239, 68, 68, 0.5)';
      btn.style.color = '#fca5a5';
    }
    if (icon) icon.textContent = '▶️';
    if (text) text.textContent = 'Reanudar';
    if (overlay) overlay.style.display = 'flex';
  } else {
    if (btn) {
      btn.className = 'btn btn-sm btn-outline';
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
    if (icon) icon.textContent = '⏸️';
    if (text) text.textContent = 'Pausar';
    if (overlay) overlay.style.display = 'none';
  }
}

// Global Dashboard Modular Navigation
let currentDashboardView = 'overview';

function switchDashboardView(viewId, targetAnchorId = null) {
  currentDashboardView = viewId;

  // Si estábamos en el portal, cambiar a la vista de monitoreo
  if (currentView !== 'monitoring') {
    switchView('monitoring');
  }

  // Actualizar estado activo en botones del sidebar, drawer y tabs
  const allNavButtons = document.querySelectorAll('.dashboard-sidebar .sidebar-nav-item, .desktop-nav-tabs .nav-tab-btn, .drawer-nav .drawer-nav-item');
  allNavButtons.forEach(btn => {
    if (btn.dataset.view === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Ocultar todas las pestañas modulares
  const tabViews = document.querySelectorAll('.monitoring-tab-view');
  tabViews.forEach(view => {
    view.classList.add('hidden');
    view.style.display = 'none';
  });

  const activeViewMap = {
    overview: 'tabViewOverview',
    family: 'tabViewFamily',
    plan: 'tabViewPlan',
    devices: 'tabViewDevices',
    map: 'tabViewMap',
    multimedia: 'tabViewMultimedia',
    history: 'tabViewHistory',
    settings: 'tabViewSettings'
  };

  const targetElemId = activeViewMap[viewId] || 'tabViewOverview';
  const targetElem = document.getElementById(targetElemId);
  if (targetElem) {
    targetElem.classList.remove('hidden');
    targetElem.style.display = 'block';
  }

  // Disparar renderizados específicos según la vista seleccionada
  if (viewId === 'overview') {
    renderFamilyOverviewCards();
    syncChildContextSelectors();
    if (targetAnchorId) {
      setTimeout(() => {
        const el = document.getElementById(targetAnchorId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } else if (viewId === 'family') {
    renderFamilyTab();
    updateSubscriptionUI();
  } else if (viewId === 'devices') {
    renderDevicesTab();
  } else if (viewId === 'map') {
    initDedicatedMap();
    syncChildContextSelectors();
    if (typeof fetchAndRenderGeofences === 'function') {
      fetchAndRenderGeofences();
    }
  } else if (viewId === 'multimedia') {
    syncChildContextSelectors();
    fetchAndRenderMultimediaGallery();
  } else if (viewId === 'history') {
    syncChildContextSelectors();
    renderHistoryTab();
  } else if (viewId === 'settings') {
    const isBillingActive = document.getElementById('subtabBtnBillingConfig')?.classList.contains('active');
    if (isBillingActive) {
      switchSettingsSubtab('billing');
    } else {
      switchSettingsSubtab('devices');
    }
  }

  closeMobileDrawer();
}

// Multi-Page View Navigation (Page 1: Portal vs Page 2: Monitoring)
function switchView(viewName, targetAnchorId = null) {
  const viewPortal = document.getElementById('viewPortal');
  const viewMonitoring = document.getElementById('viewMonitoring');
  const navTabPortal = document.getElementById('navTabPortal');
  const navTabMonitoring = document.getElementById('navTabMonitoring');
  const drawerLinkPortal = document.getElementById('drawerLinkPortal');
  const drawerLinkMonitoring = document.getElementById('drawerLinkMonitoring');

  currentView = viewName;

  if (viewName === 'portal') {
    if (viewPortal) {
      viewPortal.classList.remove('hidden');
      viewPortal.style.display = 'block';
    }
    if (viewMonitoring) {
      viewMonitoring.classList.add('hidden');
      viewMonitoring.style.display = 'none';
    }
    if (navTabPortal) navTabPortal.classList.add('active');
    if (navTabMonitoring) navTabMonitoring.classList.remove('active');
    if (drawerLinkPortal) drawerLinkPortal.classList.add('active');
    if (drawerLinkMonitoring) drawerLinkMonitoring.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    if (viewPortal) {
      viewPortal.classList.add('hidden');
      viewPortal.style.display = 'none';
    }
    if (viewMonitoring) {
      viewMonitoring.classList.remove('hidden');
      viewMonitoring.style.display = 'block';
    }
    if (navTabPortal) navTabPortal.classList.remove('active');
    if (navTabMonitoring) navTabMonitoring.classList.add('active');
    if (drawerLinkPortal) drawerLinkPortal.classList.remove('active');
    if (drawerLinkMonitoring) drawerLinkMonitoring.classList.add('active');

    setTimeout(() => {
      if (leafletMap) {
        leafletMap.invalidateSize();
      } else {
        renderMap();
      }
    }, 200);

    if (targetAnchorId) {
      setTimeout(() => {
        const el = document.getElementById(targetAnchorId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
  closeMobileDrawer();
}

function openMobileDrawer() {
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileDrawerBackdrop');
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
}

function closeMobileDrawer() {
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileDrawerBackdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

// Unlink Device Modal & API
function openUnlinkDeviceModal() {
  if (!currentDevice) {
    showToast('No hay dispositivo activo para desvincular.', 'warning');
    return;
  }
  const modal = document.getElementById('modalUnlinkDevice');
  const nameDisplay = document.getElementById('modalUnlinkDeviceName');
  if (nameDisplay) {
    nameDisplay.textContent = `${currentDevice.name} (${currentDevice.id})`;
  }
  if (modal) modal.classList.add('open');
}

function closeUnlinkDeviceModal() {
  const modal = document.getElementById('modalUnlinkDevice');
  if (modal) modal.classList.remove('open');
}

async function confirmUnlinkDevice() {
  if (!currentDevice) return;
  const devId = currentDevice.id;
  try {
    const res = await apiFetch(`/api/devices/${devId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(`Dispositivo ${devId} desvinculado con éxito`, 'warning');
      closeUnlinkDeviceModal();
      devicesList = devicesList.filter(d => d.id !== devId);
      if (devicesList.length > 0) {
        onDeviceSelected(devicesList[0].id);
      } else {
        currentDevice = null;
        localStorage.removeItem('kidsshield_active_device_id');
        renderNoDeviceState();
        switchView('portal');
      }
      renderDeviceSelector();
    } else {
      showToast('Error al desvincular el dispositivo', 'danger');
    }
  } catch (err) {
    console.error('Error desvinculando dispositivo', err);
    showToast('Error de conexión al desvincular', 'danger');
  }
}

// Live Clock in Simulator
function startClock() {
  function updateTime() {
    const now = new Date();
    simClock.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  updateTime();
  setInterval(updateTime, 30000);
}

// ----------------------------------------------------------------
// Tab 1: Resumen General Multi-Dispositivo
// ----------------------------------------------------------------
function renderFamilyOverviewCards() {
  const container = document.getElementById('familyOverviewCardsGrid');
  if (!container) return;

  if (!devicesList || devicesList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 30px; background: rgba(255,255,255,0.02); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
        <div style="font-size: 2rem; margin-bottom: 8px;">📱</div>
        <h4 style="color: #fff; margin: 0 0 4px 0;">No hay dispositivos vinculados aún</h4>
        <p style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 12px;">Agrega a tu primer hijo para comenzar la supervisión en vivo.</p>
        <button class="btn btn-primary btn-sm" onclick="openAddDeviceModal()">➕ Agregar Hijo o Hija</button>
      </div>
    `;
    return;
  }

  container.innerHTML = devicesList.map(dev => {
    const isSelected = currentDevice && currentDevice.id === dev.id;
    const isOnline = Boolean(dev.isOnline);
    const batt = typeof dev.battery === 'number' ? `${dev.battery}%` : '--%';
    const todayMins = dev.timeTodayMinutes || 0;
    const limitMins = dev.dailyLimitMinutes || 120;
    const pct = Math.min(100, Math.round((todayMins / limitMins) * 100));
    const activeApp = dev.activeApp ? dev.activeApp.name : 'En reposo / Pantalla de inicio';
    const activeAppIcon = dev.activeApp ? (dev.activeApp.icon || '📱') : '📱';
    const isLocked = Boolean(dev.isLocked);

    return `
      <div class="child-overview-card ${isSelected ? 'is-active-device' : ''}" id="overviewCard-${dev.id}">
        <div class="card-child-header">
          <div class="child-info-group">
            <div class="child-avatar-badge">${dev.avatar || '👦'}</div>
            <div>
              <h4 class="child-name-text">${dev.childName || dev.name || 'Hijo'}</h4>
              <p class="child-device-model">${dev.name || 'Teléfono'} • <span style="font-family: monospace;">${dev.id}</span></p>
            </div>
          </div>
          <span class="status-indicator ${isOnline ? 'online' : 'offline'}">
            <span class="status-dot"></span> <span>${isOnline ? 'En Línea' : 'Desconectado'}</span>
          </span>
        </div>

        <div class="card-child-meta-row">
          <span>🔋 Batería: <strong>${batt}</strong></span>
          <span>${isLocked ? '🔒 Bloqueado' : '🟢 Desbloqueado'}</span>
        </div>

        <div class="card-child-progress-box">
          <div class="card-progress-labels">
            <span>⏱️ Tiempo Hoy: <strong>${todayMins}m / ${limitMins}m</strong></span>
            <span style="color: ${pct >= 100 ? '#ef4444' : '#34d399'}; font-weight: 700;">${pct}%</span>
          </div>
          <div class="card-progress-bar">
            <div class="card-progress-fill" style="width: ${pct}%;"></div>
          </div>
        </div>

        <div class="card-active-app-row">
          <span>App activa:</span>
          <span class="card-app-pill">${activeAppIcon} ${activeApp}</span>
        </div>

        <div class="card-actions-row">
          <button class="btn-card-view-screen" onclick="selectAndFocusScreen('${dev.id}')">
            ${isSelected ? '👁️ Viendo en Vivo' : '👁️ Ver Pantalla'}
          </button>
          <button class="btn-card-quick-lock ${isLocked ? 'is-locked' : 'is-unlocked'}" onclick="toggleDeviceLockById('${dev.id}')">
            ${isLocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function selectAndFocusScreen(devId) {
  onDeviceSelected(devId);
  renderFamilyOverviewCards();
  const screenEl = document.getElementById('summaryHero') || document.querySelector('.live-supervision-section');
  if (screenEl) {
    screenEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function toggleDeviceLockById(devId) {
  try {
    const dev = devicesList.find(d => d.id === devId);
    const newLock = dev ? !dev.isLocked : true;
    const res = await apiFetch(`/api/devices/${devId}/toggle-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isLocked: newLock })
    });
    if (res.ok) {
      if (dev) dev.isLocked = newLock;
      if (currentDevice && currentDevice.id === devId) {
        currentDevice.isLocked = newLock;
        updateLockUI(newLock);
      }
      renderFamilyOverviewCards();
      if (document.getElementById('tabViewFamily') && !document.getElementById('tabViewFamily').classList.contains('hidden')) {
        renderFamilyChildrenCards();
      }
      showToast(`Dispositivo ${newLock ? 'bloqueado' : 'desbloqueado'} con éxito`, 'info');
    }
  } catch (err) {
    console.error('Error cambiando bloqueo:', err);
  }
}

// ----------------------------------------------------------------
// Tab 2: Mi Familia (Gestión y 3 Accesos Directos Obligatorios)
// ----------------------------------------------------------------
function renderFamilyTab() {
  const familyIdDisplay = document.getElementById('familyIdDisplay');
  const familyOwnerName = document.getElementById('familyOwnerName');
  const familyOwnerEmail = document.getElementById('familyOwnerEmail');
  const familyDevicesUsageText = document.getElementById('familyDevicesUsageText');
  const familyPlanBadge = document.getElementById('familyPlanBadge');

  const famId = (adminUser && adminUser.familyId) || 'FAM-DEFAULT-01';
  if (familyIdDisplay) familyIdDisplay.textContent = famId;
  if (familyOwnerName) familyOwnerName.textContent = (adminUser && adminUser.name) || 'Administrador Familiar';
  if (familyOwnerEmail) familyOwnerEmail.textContent = (adminUser && adminUser.email) || 'contacto@familia.local';

  const maxDevs = (familySubscription && familySubscription.maxDevices) || 5;
  const count = devicesList.length;
  if (familyDevicesUsageText) familyDevicesUsageText.textContent = `${count} / ${maxDevs} permitidos`;

  const planName = (familySubscription && familySubscription.plan) ? (familySubscription.plan === 'free' ? 'Plan Gratuito' : familySubscription.plan === 'family_total' ? 'Familia Total VIP 👑' : 'Familiar Pro ⚡') : 'Familiar Pro ⚡';
  if (familyPlanBadge) familyPlanBadge.textContent = planName;

  // Actualizar sidebar info
  const sidebarFamilyName = document.getElementById('sidebarFamilyName');
  if (sidebarFamilyName) {
    sidebarFamilyName.textContent = (adminUser && adminUser.name) ? `Familia ${adminUser.name.split(' ')[0]}` : 'Mi Familia';
  }
  const sidebarFamilyPlan = document.getElementById('sidebarFamilyPlan');
  if (sidebarFamilyPlan) {
    sidebarFamilyPlan.textContent = planName;
  }

  // Renderizar las tarjetas con los 3 accesos directos obligatorios
  renderFamilyChildrenCards();
}

function renderFamilyChildrenCards() {
  const container = document.getElementById('familyChildrenCardsGrid');
  if (!container) return;

  if (!devicesList || devicesList.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 36px 20px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.1);">
        <div style="font-size: 2.4rem; margin-bottom: 10px;">👨‍👩‍👧‍👦</div>
        <h4 style="color: #fff; margin: 0 0 6px 0;">Aún no has agregado hijos o dispositivos</h4>
        <p style="color: #94a3b8; font-size: 0.85rem; max-width: 420px; margin: 0 auto 16px auto;">
          Agrega a tu hijo o hija para asignarle un teléfono móvil y comenzar a supervisar su ubicación, aplicaciones y multimedia.
        </p>
        <button class="btn btn-primary btn-sm" onclick="openAddDeviceModal()">➕ Agregar Hijo o Hija</button>
      </div>
    `;
    return;
  }

  container.innerHTML = devicesList.map(dev => {
    const isSelected = currentDevice && currentDevice.id === dev.id;
    const isOnline = Boolean(dev.isOnline);
    const batt = typeof dev.battery === 'number' ? `${dev.battery}%` : '--%';
    const lastSeen = dev.lastSeen ? new Date(dev.lastSeen).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'Sin reporte';

    return `
      <div class="child-family-card ${isSelected ? 'is-active-device' : ''}" id="familyChildCard-${dev.id}">
        <div class="family-card-top">
          <div class="family-card-profile">
            <div class="family-card-avatar">${dev.avatar || '👦'}</div>
            <div>
              <h4 class="family-card-name">${dev.childName || dev.name || 'Hijo'}</h4>
              <p class="family-card-devname">${dev.name || 'Teléfono'} • <span style="font-family: monospace;">${dev.id}</span></p>
            </div>
          </div>
          <span class="status-indicator ${isOnline ? 'online' : 'offline'}">
            <span class="status-dot"></span> <span>${isOnline ? 'En Línea' : 'Desconectado'}</span>
          </span>
        </div>

        <div class="family-card-metrics">
          <span>🔋 Batería: <strong>${batt}</strong></span>
          <span>🕒 Visto: <strong>${lastSeen}</strong></span>
          <span>Estado: <strong>${dev.isLocked ? '🔒 Bloqueado' : '🟢 Activo'}</strong></span>
          <span>GPS: <strong>${dev.gpsEnabled !== false ? '🛰️ Habilitado' : '⚪ Inactivo'}</strong></span>
        </div>

        <!-- 3 Accesos Directos Obligatorios -->
        <div class="family-card-shortcuts-row">
          <button class="btn-family-shortcut btn-shortcut-map" onclick="selectAndGoMap('${dev.id}')" title="Ver ubicación y geocercas en mapa satelital">
            <span class="shortcut-icon">📍</span>
            <span>Ver en Mapa</span>
          </button>
          <button class="btn-family-shortcut btn-shortcut-multi" onclick="selectAndGoMultimedia('${dev.id}')" title="Ver capturas, videos y audios">
            <span class="shortcut-icon">🎬</span>
            <span>Ver Multimedia</span>
          </button>
          <button class="btn-family-shortcut btn-shortcut-config" onclick="selectAndGoSettings('${dev.id}')" title="Ajustar límites, GPS y horarios">
            <span class="shortcut-icon">⚙️</span>
            <span>Configurar</span>
          </button>
        </div>

        <!-- Acciones Secundarias (QR y Desvincular) -->
        <div class="family-card-aux-row">
          <button class="btn btn-secondary btn-sm" onclick="openPairingQrForDevice('${dev.id}')" style="font-size: 0.78rem;">
            🔗 Código QR
          </button>
          <button class="btn btn-danger-outline btn-sm" onclick="openUnlinkForDevice('${dev.id}')" style="font-size: 0.78rem;">
            🗑️ Desvincular
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function selectAndGoMap(devId) {
  onDeviceSelected(devId);
  switchDashboardView('map');
}

function selectAndGoMultimedia(devId) {
  onDeviceSelected(devId);
  switchDashboardView('multimedia');
}

function selectAndGoSettings(devId) {
  onDeviceSelected(devId);
  switchDashboardView('settings');
  if (typeof switchSettingsSubtab === 'function') {
    switchSettingsSubtab('devices');
  }
}

function openPairingQrForDevice(devId) {
  onDeviceSelected(devId);
  openPairingQrModal();
}

function openUnlinkForDevice(devId) {
  onDeviceSelected(devId);
  openUnlinkDeviceModal();
}

// ----------------------------------------------------------------
// Tab 4: Dispositivos (Mantenido para compatibilidad)
// ----------------------------------------------------------------
function renderDevicesTab() {
  renderFamilyChildrenCards();
}

function selectAndGoOverview(devId) {
  onDeviceSelected(devId);
  switchDashboardView('overview');
}

// ----------------------------------------------------------------
// Tab 5: Mapa Dedicado y Desactivación Remota de GPS
// ----------------------------------------------------------------
function initDedicatedMap() {
  const mapContainer = document.getElementById('mapLeafletDedicated');
  const toggleGps = document.getElementById('toggleGpsTrackingRemote');
  const labelToggle = document.getElementById('labelGpsRemoteToggle');
  const selectFreq = document.getElementById('selectGpsFrequency');
  const addressEl = document.getElementById('mapDedicatedAddressText');
  const lastUpdateEl = document.getElementById('mapDedicatedLastUpdate');

  if (currentDevice) {
    if (toggleGps) {
      toggleGps.checked = currentDevice.gpsTrackingEnabled !== false;
      if (labelToggle) {
        labelToggle.textContent = toggleGps.checked ? 'GPS Habilitado' : 'GPS Desactivado';
        labelToggle.style.color = toggleGps.checked ? '#34d399' : '#f87171';
      }
    }
    if (selectFreq) {
      selectFreq.value = currentDevice.gpsIntervalSeconds || 30;
    }

    const loc = currentDevice.location;
    if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      if (addressEl) addressEl.textContent = `📍 ${loc.address || 'Ubicación satelital en vivo'}`;
      if (lastUpdateEl && loc.lastUpdated) {
        const d = new Date(loc.lastUpdated);
        lastUpdateEl.textContent = `Último reporte: ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      }

      if (mapContainer && typeof L !== 'undefined') {
        try {
          if (!dedicatedLeafletMap) {
            dedicatedLeafletMap = L.map('mapLeafletDedicated', { zoomControl: true }).setView([loc.latitude, loc.longitude], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
              maxZoom: 19,
              attribution: '&copy; OpenStreetMap'
            }).addTo(dedicatedLeafletMap);

            dedicatedMarker = L.marker([loc.latitude, loc.longitude]).addTo(dedicatedLeafletMap)
              .bindPopup(`<b>${currentDevice.name}</b><br>Ubicación GPS en vivo`)
              .openPopup();
          } else {
            dedicatedLeafletMap.setView([loc.latitude, loc.longitude], 15);
            if (dedicatedMarker) {
              dedicatedMarker.setLatLng([loc.latitude, loc.longitude]);
            }
          }
          setTimeout(() => { if (dedicatedLeafletMap) dedicatedLeafletMap.invalidateSize(); }, 200);
        } catch (e) {
          console.error('[Map] Error inicializando mapa dedicado:', e);
        }
      }
    } else {
      if (addressEl) addressEl.textContent = '📍 Esperando primera coordenada satelital GPS...';
      if (mapContainer && typeof L !== 'undefined') {
        try {
          if (!dedicatedLeafletMap) {
            dedicatedLeafletMap = L.map('mapLeafletDedicated', { zoomControl: true }).setView([-33.4489, -70.6693], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(dedicatedLeafletMap);
          }
          setTimeout(() => { if (dedicatedLeafletMap) dedicatedLeafletMap.invalidateSize(); }, 200);
        } catch (e) {}
      }
    }
  }
}

async function toggleGpsRemoteTracking(enabled) {
  if (!currentDevice) {
    showToast('No hay dispositivo activo para configurar GPS', 'warning');
    return;
  }
  currentDevice.gpsTrackingEnabled = enabled;
  await updateRemoteConfig({ gpsTrackingEnabled: enabled });
  const label = document.getElementById('labelGpsRemoteToggle');
  if (label) {
    label.textContent = enabled ? 'GPS Habilitado' : 'GPS Desactivado';
    label.style.color = enabled ? '#34d399' : '#f87171';
  }
  const settingsToggle = document.getElementById('settingsToggleGps');
  if (settingsToggle) settingsToggle.checked = enabled;
  showToast(enabled ? '🛰️ Rastreo GPS Activado en el teléfono' : '🚫 Rastreo GPS Desactivado remotamente', enabled ? 'success' : 'warning');
}

// ----------------------------------------------------------------
// Tab 6: Capturas y Multimedia (Fotos, Videos 5s, Audios con Fecha y Hora)
// ----------------------------------------------------------------
let multimediaItems = [];

async function fetchAndRenderMultimediaGallery(filter = 'all') {
  activeMultimediaFilter = filter;
  const container = document.getElementById('multimediaGridContainer');
  if (!container) return;

  if (!currentDevice) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">Sin dispositivo seleccionado</div>`;
    return;
  }

  container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);"><span style="font-size: 1.5rem;">⏳</span><br>Cargando historial multimedia...</div>`;

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/multimedia`);
    if (res.ok) {
      const data = await res.json();
      multimediaCache = {
        screenshots: data.screenshots || [],
        videos: data.videos || [],
        audios: data.audios || []
      };

      // Unificar todos los items cronológicamente
      let allItems = [
        ...multimediaCache.screenshots,
        ...multimediaCache.videos,
        ...multimediaCache.audios
      ];

      // Ordenar por fecha descendente
      allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      multimediaItems = allItems;

      renderMultimediaGrid(filter);
    } else {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f87171;">No se pudo cargar el historial multimedia</div>`;
    }
  } catch (err) {
    console.error('Error cargando multimedia:', err);
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #f87171;">Error al consultar multimedia</div>`;
  }
}

function renderMultimediaGrid(filter = 'all') {
  const container = document.getElementById('multimediaGridContainer');
  if (!container) return;

  let filtered = multimediaItems;
  if (filter === 'image') filtered = multimediaItems.filter(item => item.type === 'image');
  if (filter === 'video') filtered = multimediaItems.filter(item => item.type === 'video');
  if (filter === 'audio') filtered = multimediaItems.filter(item => item.type === 'audio');

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.08);">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">📂</div>
        <h4 style="color: #fff; margin: 0 0 6px 0;">No hay elementos en esta categoría</h4>
        <p style="color: var(--text-muted); font-size: 0.84rem; margin: 0;">Usa los botones superiores para capturar fotos, grabar videos o escuchar audios en vivo.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map((item, idx) => {
    const isImg = item.type === 'image';
    const isVid = item.type === 'video';
    const isAud = item.type === 'audio';

    const typeBadge = isImg ? '📸 Captura' : isVid ? '🎥 Video (5s)' : '🎙️ Audio (5s)';
    const typeColor = isImg ? '#38bdf8' : isVid ? '#c084fc' : '#34d399';

    // Generar vista previa en la tarjeta
    let previewHtml = '';
    if (isImg) {
      previewHtml = `
        <div style="height: 140px; overflow: hidden; border-radius: 8px; background: #000; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="openMediaPreviewByIndex(${idx})">
          <img src="${item.url}" style="width: 100%; height: 100%; object-fit: cover;" alt="Captura">
        </div>
      `;
    } else if (isVid) {
      const firstFrame = item.frames && item.frames.length ? item.frames[0] : '';
      const frameSrc = firstFrame.startsWith('data:') ? firstFrame : (firstFrame ? 'data:image/jpeg;base64,' + firstFrame : '');
      previewHtml = `
        <div style="height: 140px; position: relative; overflow: hidden; border-radius: 8px; background: #000; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="openMediaPreviewByIndex(${idx})">
          ${frameSrc ? `<img src="${frameSrc}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.85;" alt="Video">` : `<span style="font-size: 2rem;">🎥</span>`}
          <div style="position: absolute; width: 44px; height: 44px; background: rgba(0,0,0,0.65); border: 2px solid #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: #fff;">
            ▶
          </div>
        </div>
      `;
    } else {
      previewHtml = `
        <div style="height: 140px; border-radius: 8px; background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.05)); border: 1px solid rgba(16,185,129,0.25); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer;" onclick="openMediaPreviewByIndex(${idx})">
          <div style="font-size: 2.2rem; margin-bottom: 4px;">🎙️</div>
          <span style="font-size: 0.78rem; color: #34d399; font-weight: 600;">Escuchar Audio (5s)</span>
        </div>
      `;
    }

    return `
      <div class="multimedia-item-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.74rem; font-weight: 700; color: ${typeColor}; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">
            ${typeBadge}
          </span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">
            ${item.timeFormatted || ''}
          </span>
        </div>

        ${previewHtml}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px; font-size: 0.76rem; color: var(--text-secondary);">
          <span>📅 ${item.dateFormatted || 'Hoy'}</span>
          <button class="btn btn-outline btn-sm" style="padding: 3px 10px; font-size: 0.75rem;" onclick="openMediaPreviewByIndex(${idx})">
            ${isImg ? '🔍 Ver' : isVid ? '▶️ Reproducir' : '🔊 Escuchar'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function openMediaPreviewByIndex(index) {
  const item = multimediaItems[index];
  if (!item) return;

  const box = document.getElementById('multimediaPreviewBox');
  const title = document.getElementById('previewMediaTitle');
  const content = document.getElementById('previewMediaContent');
  if (!box || !title || !content) return;

  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth' });

  if (item.type === 'image') {
    title.textContent = `📸 Captura de Pantalla - ${item.dateFormatted} a las ${item.timeFormatted}`;
    content.innerHTML = `
      <div style="max-width: 600px; margin: 0 auto;">
        <img src="${item.url}" alt="Captura ampliada" style="width: 100%; max-height: 480px; object-fit: contain; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1);">
      </div>
    `;
  } else if (item.type === 'video') {
    title.textContent = `🎥 Clip de Video (5s) - ${item.dateFormatted} a las ${item.timeFormatted}`;
    const frames = item.frames || [];
    currentVideoClip.frames = frames;
    currentVideoClip.intervalMs = item.intervalMs || 500;
    currentVideoClip.currentIndex = 0;

    content.innerHTML = `
      <div style="max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 10px;">
        <img id="mediaPreviewVideoFrame" src="${frames[0] ? (frames[0].startsWith('data:') ? frames[0] : 'data:image/jpeg;base64,' + frames[0]) : ''}" style="width: 100%; max-height: 420px; object-fit: contain; border-radius: 10px; background: #000; border: 1px solid rgba(255,255,255,0.1);" alt="Video Frame">
        <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
          <button id="btnMediaPreviewPlay" class="btn btn-primary btn-sm" onclick="togglePlayPreviewVideo()">⏸ Pausar</button>
          <input type="range" id="mediaPreviewSlider" min="0" max="${Math.max(0, frames.length - 1)}" value="0" style="flex: 1;" oninput="onSlidePreviewVideo(this.value)">
          <span id="mediaPreviewTime" style="font-size: 0.85rem; color: #fff; font-family: monospace;">0.0s</span>
        </div>
      </div>
    `;

    playPreviewVideo();
  } else if (item.type === 'audio') {
    title.textContent = `🎙️ Audio Ambiental (5s) - ${item.dateFormatted} a las ${item.timeFormatted}`;
    content.innerHTML = `
      <div style="max-width: 500px; width: 100%; margin: 0 auto; padding: 20px; background: rgba(16,185,129,0.08); border-radius: 12px; border: 1px solid rgba(16,185,129,0.25); display: flex; flex-direction: column; align-items: center; gap: 12px;">
        <div style="font-size: 3rem;">🎙️</div>
        <div style="color: #34d399; font-weight: 600; font-size: 1rem;">Grabación Ambiental del Menor</div>
        <audio src="${item.audioBase64}" controls autoplay style="width: 100%; max-width: 420px;"></audio>
      </div>
    `;
  }
}

let previewVideoTimer = null;
let previewVideoIndex = 0;
let previewVideoPlaying = false;

function playPreviewVideo() {
  if (previewVideoTimer) clearInterval(previewVideoTimer);
  previewVideoPlaying = true;
  const btn = document.getElementById('btnMediaPreviewPlay');
  if (btn) btn.textContent = '⏸ Pausar';

  previewVideoTimer = setInterval(() => {
    if (!currentVideoClip.frames.length) return;
    previewVideoIndex++;
    if (previewVideoIndex >= currentVideoClip.frames.length) {
      previewVideoIndex = 0;
    }
    updatePreviewVideoFrame(previewVideoIndex);
  }, currentVideoClip.intervalMs || 500);
}

function pausePreviewVideo() {
  if (previewVideoTimer) {
    clearInterval(previewVideoTimer);
    previewVideoTimer = null;
  }
  previewVideoPlaying = false;
  const btn = document.getElementById('btnMediaPreviewPlay');
  if (btn) btn.textContent = '▶ Reproducir';
}

function togglePlayPreviewVideo() {
  if (previewVideoPlaying) {
    pausePreviewVideo();
  } else {
    playPreviewVideo();
  }
}

function onSlidePreviewVideo(val) {
  pausePreviewVideo();
  previewVideoIndex = parseInt(val, 10);
  updatePreviewVideoFrame(previewVideoIndex);
}

function updatePreviewVideoFrame(idx) {
  const img = document.getElementById('mediaPreviewVideoFrame');
  const slider = document.getElementById('mediaPreviewSlider');
  const timeText = document.getElementById('mediaPreviewTime');

  if (img && currentVideoClip.frames[idx]) {
    const f = currentVideoClip.frames[idx];
    img.src = f.startsWith('data:') ? f : 'data:image/jpeg;base64,' + f;
  }
  if (slider) slider.value = idx;
  if (timeText) {
    const secs = ((idx * (currentVideoClip.intervalMs || 500)) / 1000).toFixed(1);
    timeText.textContent = `${secs}s`;
  }
}

// ----------------------------------------------------------------
// Tab 7: Historial Completo
// ----------------------------------------------------------------
function renderHistoryTab() {
  const feed = document.getElementById('historyTabActivityFeed');
  if (!feed) return;

  if (!currentDevice || !currentDevice.activityLog || currentDevice.activityLog.length === 0) {
    feed.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <span style="font-size: 2rem;">🕒</span><br>Sin actividad registrada en este dispositivo
      </div>
    `;
    return;
  }

  feed.innerHTML = currentDevice.activityLog.map(item => {
    const type = item.type || 'info';
    let icon = 'ℹ️';
    if (type === 'blocked' || type === 'warning') {
      icon = '🛑';
    } else if (type === 'alert') {
      icon = '⚠️';
    } else if (type === 'app_open') {
      icon = '🚀';
    }

    return `
      <div class="activity-feed-item ${type}" style="display: flex; gap: 12px; padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <span style="font-size: 1.3rem;">${icon}</span>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #fff; font-size: 0.88rem;">${item.appName || item.package || 'Sistema'}</strong>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${item.time || ''}</span>
          </div>
          <p style="color: #cbd5e1; font-size: 0.82rem; margin: 3px 0 0 0;">${item.message || ''}</p>
        </div>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------------------
// Tab 8: Configuraciones del Dispositivo
// ----------------------------------------------------------------
function renderSettingsTab() {
  if (!currentDevice) return;

  const toggleGps = document.getElementById('settingsToggleGps');
  const toggleGpsText = document.getElementById('settingsToggleGpsText');
  const gpsInterval = document.getElementById('settingsGpsInterval');
  const limitRange = document.getElementById('settingsDailyLimitRange');
  const limitBadge = document.getElementById('settingsDailyLimitBadge');
  const toggleBedtime = document.getElementById('settingsToggleBedtime');
  const toggleBedtimeText = document.getElementById('settingsToggleBedtimeText');
  const bedtimeStart = document.getElementById('settingsBedtimeStart');
  const bedtimeEnd = document.getElementById('settingsBedtimeEnd');
  const parentPin = document.getElementById('settingsParentPinInput');

  if (toggleGps) {
    toggleGps.checked = currentDevice.gpsTrackingEnabled !== false;
    if (toggleGpsText) {
      toggleGpsText.textContent = toggleGps.checked ? 'Activado' : 'Desactivado';
      toggleGpsText.style.color = toggleGps.checked ? '#34d399' : '#f87171';
    }
  }
  if (gpsInterval) gpsInterval.value = currentDevice.gpsIntervalSeconds || 30;

  if (limitRange) {
    limitRange.value = currentDevice.dailyLimitMinutes || 120;
    if (limitBadge) limitBadge.textContent = `${limitRange.value} min (${Math.floor(limitRange.value/60)}h ${limitRange.value%60}m)`;
  }

  if (toggleBedtime) {
    toggleBedtime.checked = Boolean(currentDevice.bedtimeEnabled);
    if (toggleBedtimeText) {
      toggleBedtimeText.textContent = toggleBedtime.checked ? 'Habilitado' : 'Deshabilitado';
      toggleBedtimeText.style.color = toggleBedtime.checked ? '#a78bfa' : '#94a3b8';
    }
  }
  if (bedtimeStart) bedtimeStart.value = currentDevice.bedtimeStart || '21:30';
  if (bedtimeEnd) bedtimeEnd.value = currentDevice.bedtimeEnd || '07:00';
  if (parentPin) parentPin.value = currentDevice.parentPin || '1234';
}

// =========================================================================
// GESTIÓN DE SUB-APARTADOS EN CONFIGURACIÓN (1. DISPOSITIVOS / 2. PAGO Y PLAN)
// =========================================================================
function setupSettingsSubtabs() {
  const btnDevices = document.getElementById('subtabBtnDevicesConfig');
  const btnBilling = document.getElementById('subtabBtnBillingConfig');

  if (btnDevices) {
    btnDevices.addEventListener('click', (e) => {
      e.preventDefault();
      switchSettingsSubtab('devices');
    });
  }

  if (btnBilling) {
    btnBilling.addEventListener('click', (e) => {
      e.preventDefault();
      switchSettingsSubtab('billing');
    });
  }
}

function switchSettingsSubtab(subtab) {
  const btnDevices = document.getElementById('subtabBtnDevicesConfig');
  const btnBilling = document.getElementById('subtabBtnBillingConfig');
  const secDevices = document.getElementById('settingsDevicesSection');
  const secBilling = document.getElementById('settingsBillingSection');

  if (!btnDevices || !btnBilling || !secDevices || !secBilling) return;

  if (subtab === 'devices') {
    btnDevices.classList.add('active');
    btnDevices.setAttribute('aria-selected', 'true');
    btnBilling.classList.remove('active');
    btnBilling.setAttribute('aria-selected', 'false');

    secDevices.classList.add('active');
    secDevices.style.display = 'block';
    secBilling.classList.remove('active');
    secBilling.style.display = 'none';

    syncChildContextSelectors();
    renderSettingsTab();
  } else if (subtab === 'billing') {
    btnBilling.classList.add('active');
    btnBilling.setAttribute('aria-selected', 'true');
    btnDevices.classList.remove('active');
    btnDevices.setAttribute('aria-selected', 'false');

    secBilling.classList.add('active');
    secBilling.style.display = 'block';
    secDevices.classList.remove('active');
    secDevices.style.display = 'none';

    loadBillingAndPaymentDetails();
  }
}

window.switchSettingsSubtab = switchSettingsSubtab;
window.goToBillingSettings = function() {
  switchDashboardView('settings');
  switchSettingsSubtab('billing');
};

// Event Bindings
function bindEvents() {
  try {
  // Modular Navigation Tabs (Desktop & Drawer)
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) {
        switchDashboardView(view);
      }
    });
  });

  const brandLogoBtn = document.getElementById('brandLogoBtn');
  if (brandLogoBtn) brandLogoBtn.addEventListener('click', () => switchView('portal'));

  // Compatibilidad con botones de navegación heredados
  const navTabPortal = document.getElementById('navTabPortal');
  if (navTabPortal) navTabPortal.addEventListener('click', () => switchView('portal'));

  const navTabMonitoring = document.getElementById('navTabMonitoring');
  if (navTabMonitoring) navTabMonitoring.addEventListener('click', () => switchDashboardView('overview'));

  const navTabApps = document.getElementById('navTabApps');
  if (navTabApps) navTabApps.addEventListener('click', () => switchDashboardView('overview', 'sectionAppsColumn'));

  const navTabGps = document.getElementById('navTabGps');
  if (navTabGps) navTabGps.addEventListener('click', () => switchDashboardView('map'));

  const navTabTimeline = document.getElementById('navTabTimeline');
  if (navTabTimeline) navTabTimeline.addEventListener('click', () => switchDashboardView('history'));

  const navTabLogout = document.getElementById('navTabLogout');
  if (navTabLogout) navTabLogout.addEventListener('click', logoutAdmin);

  // Mobile Drawer Navigation
  const btnMobileMenu = document.getElementById('btnMobileMenu');
  if (btnMobileMenu) btnMobileMenu.addEventListener('click', openMobileDrawer);

  const drawerCloseBtn = document.getElementById('drawerCloseBtn') || document.getElementById('btnCloseMobileDrawer');
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', closeMobileDrawer);

  const mobileDrawerBackdrop = document.getElementById('mobileDrawerBackdrop');
  if (mobileDrawerBackdrop) mobileDrawerBackdrop.addEventListener('click', closeMobileDrawer);

  const drawerBtnLogout = document.getElementById('drawerBtnLogout');
  if (drawerBtnLogout) {
    drawerBtnLogout.addEventListener('click', () => {
      closeMobileDrawer();
      logoutAdmin();
    });
  }

  // Live Screenshot Pause / Resume
  const btnTogglePauseLive = document.getElementById('btnTogglePauseLive') || document.getElementById('btnToggleLivePause');
  if (btnTogglePauseLive) btnTogglePauseLive.addEventListener('click', toggleLiveScreenshotPause);

  // Pestaña Dispositivos: Botones de acción
  const btnDevicesTabAdd = document.getElementById('btnDevicesTabAdd');
  if (btnDevicesTabAdd) btnDevicesTabAdd.addEventListener('click', openAddDeviceModal);

  const btnDevicesTabQr = document.getElementById('btnDevicesTabQr');
  if (btnDevicesTabQr) btnDevicesTabQr.addEventListener('click', openPairingQrModal);

  // Pestaña Mapa: Controles de GPS
  const toggleGpsTrackingRemote = document.getElementById('toggleGpsTrackingRemote');
  if (toggleGpsTrackingRemote) {
    toggleGpsTrackingRemote.addEventListener('change', (e) => {
      toggleGpsRemoteTracking(e.target.checked);
    });
  }

  const selectGpsFrequency = document.getElementById('selectGpsFrequency');
  if (selectGpsFrequency) {
    selectGpsFrequency.addEventListener('change', async (e) => {
      const intervalSec = parseInt(e.target.value, 10) || 30;
      if (currentDevice) {
        currentDevice.gpsIntervalSeconds = intervalSec;
        await updateRemoteConfig({ gpsIntervalSeconds: intervalSec });
        showToast(`⏱️ Frecuencia GPS actualizada a ${intervalSec} segundos`, 'success');
      }
    });
  }

  const btnMapTabRefreshLocation = document.getElementById('btnMapTabRefreshLocation');
  if (btnMapTabRefreshLocation) btnMapTabRefreshLocation.addEventListener('click', requestLocationNow);

  const btnMapTabRouteHistory = document.getElementById('btnMapTabRouteHistory');
  if (btnMapTabRouteHistory) btnMapTabRouteHistory.addEventListener('click', toggleRouteHistory);

  const btnMapTabGeofences = document.getElementById('btnMapTabGeofences');
  if (btnMapTabGeofences) btnMapTabGeofences.addEventListener('click', () => {
    fetchAndRenderGeofences();
    showToast('Geocercas actualizadas en el mapa', 'info');
  });

  // Sidebar Navigation (Opción 2)
  const sidebarNavItems = document.querySelectorAll('.dashboard-sidebar .sidebar-nav-item');
  sidebarNavItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchDashboardView(view);
    });
  });

  const sidebarBtnLogout = document.getElementById('sidebarBtnLogout');
  if (sidebarBtnLogout) {
    sidebarBtnLogout.addEventListener('click', logoutAdmin);
  }

  // Selectores contextuales de hijo sincronizados
  const contextSelectors = [
    'overviewLiveDeviceSelect',
    'mapDeviceSelect',
    'multimediaDeviceSelect',
    'historyDeviceSelect',
    'settingsDeviceSelect'
  ];
  contextSelectors.forEach(id => {
    const sel = document.getElementById(id);
    if (sel) {
      sel.addEventListener('change', (e) => {
        onDeviceSelected(e.target.value);
      });
    }
  });

  // Botones Agregar Hijo/a en Resumen y Mi Familia
  const btnOverviewAddChild = document.getElementById('btnOverviewAddChild');
  if (btnOverviewAddChild) btnOverviewAddChild.addEventListener('click', openAddDeviceModal);

  const btnFamilyAddChild = document.getElementById('btnFamilyAddChild');
  if (btnFamilyAddChild) btnFamilyAddChild.addEventListener('click', openAddDeviceModal);

  // Gestor Interactivo de Geocercas y Lugares Seguros
  const btnOpenGeofenceModal = document.getElementById('btnOpenGeofenceManagerModal');
  if (btnOpenGeofenceModal) btnOpenGeofenceModal.addEventListener('click', openGeofenceManagerModal);

  const btnCloseGeofenceModal = document.getElementById('btnCloseGeofenceModal');
  if (btnCloseGeofenceModal) btnCloseGeofenceModal.addEventListener('click', closeGeofenceManagerModal);

  const btnCloseGeofenceModalFooter = document.getElementById('btnCloseGeofenceModalFooter');
  if (btnCloseGeofenceModalFooter) btnCloseGeofenceModalFooter.addEventListener('click', closeGeofenceManagerModal);

  const btnSaveGeofence = document.getElementById('btnSaveGeofence');
  if (btnSaveGeofence) btnSaveGeofence.addEventListener('click', saveNewGeofence);

  const btnUseCurLocGeofence = document.getElementById('btnUseCurrentDeviceLocationForGeofence');
  if (btnUseCurLocGeofence) {
    btnUseCurLocGeofence.addEventListener('click', () => {
      if (currentDevice && currentDevice.location && typeof currentDevice.location.latitude === 'number') {
        const latInput = document.getElementById('inputGeofenceLat');
        const lngInput = document.getElementById('inputGeofenceLng');
        if (latInput) latInput.value = currentDevice.location.latitude;
        if (lngInput) lngInput.value = currentDevice.location.longitude;
        showToast('🎯 Coordenadas actuales del teléfono aplicadas', 'info');
      } else {
        alert('El dispositivo aún no ha transmitido coordenadas GPS. Ingresa las coordenadas manualmente.');
      }
    });
  }

  const rangeGeofenceRadius = document.getElementById('rangeGeofenceRadius');
  if (rangeGeofenceRadius) {
    rangeGeofenceRadius.addEventListener('input', (e) => {
      const badge = document.getElementById('geofenceRadiusBadge');
      if (badge) badge.textContent = `${e.target.value} metros`;
    });
  }

  // Botones de Categorías Rápidas de Geocercas
  const catButtons = document.querySelectorAll('#geofenceQuickCategories .btn-geofence-cat');
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const catName = btn.dataset.name || 'Lugar Seguro';
      const catIcon = btn.dataset.icon || '📍';
      const nameInput = document.getElementById('inputGeofenceName');
      if (nameInput) {
        nameInput.value = `${catName} ${catIcon}`;
      }
    });
  });

  // Pestaña Multimedia: Filtros y Acciones
  const btnFilterMediaAll = document.getElementById('btnFilterMediaAll');
  const btnFilterMediaPhotos = document.getElementById('btnFilterMediaPhotos');
  const btnFilterMediaVideos = document.getElementById('btnFilterMediaVideos');
  const btnFilterMediaAudios = document.getElementById('btnFilterMediaAudios');

  function setMediaFilterActive(btn, filter) {
    [btnFilterMediaAll, btnFilterMediaPhotos, btnFilterMediaVideos, btnFilterMediaAudios].forEach(b => b?.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderMultimediaGrid(filter);
  }

  if (btnFilterMediaAll) btnFilterMediaAll.addEventListener('click', () => setMediaFilterActive(btnFilterMediaAll, 'all'));
  if (btnFilterMediaPhotos) btnFilterMediaPhotos.addEventListener('click', () => setMediaFilterActive(btnFilterMediaPhotos, 'image'));
  if (btnFilterMediaVideos) btnFilterMediaVideos.addEventListener('click', () => setMediaFilterActive(btnFilterMediaVideos, 'video'));
  if (btnFilterMediaAudios) btnFilterMediaAudios.addEventListener('click', () => setMediaFilterActive(btnFilterMediaAudios, 'audio'));

  const btnCloseMediaPreview = document.getElementById('btnCloseMediaPreview');
  if (btnCloseMediaPreview) {
    btnCloseMediaPreview.addEventListener('click', () => {
      pausePreviewVideo();
      const box = document.getElementById('multimediaPreviewBox');
      if (box) box.style.display = 'none';
    });
  }

  const btnMultiTabCapturePhoto = document.getElementById('btnMultiTabCapturePhoto');
  if (btnMultiTabCapturePhoto) btnMultiTabCapturePhoto.addEventListener('click', requestScreenshotNow);

  const btnMultiTabCaptureVideo = document.getElementById('btnMultiTabCaptureVideo');
  if (btnMultiTabCaptureVideo) btnMultiTabCaptureVideo.addEventListener('click', requestVideo5s);

  const btnMultiTabCaptureAudio = document.getElementById('btnMultiTabCaptureAudio');
  if (btnMultiTabCaptureAudio) btnMultiTabCaptureAudio.addEventListener('click', requestAudio5s);

  // Pestaña Configuraciones: Guardado de Ajustes
  const btnSaveGpsSettings = document.getElementById('btnSaveGpsSettings');
  if (btnSaveGpsSettings) {
    btnSaveGpsSettings.addEventListener('click', async () => {
      const enabled = document.getElementById('settingsToggleGps')?.checked ?? true;
      const intervalSec = parseInt(document.getElementById('settingsGpsInterval')?.value, 10) || 30;
      if (currentDevice) {
        currentDevice.gpsTrackingEnabled = enabled;
        currentDevice.gpsIntervalSeconds = intervalSec;
        await updateRemoteConfig({ gpsTrackingEnabled: enabled, gpsIntervalSeconds: intervalSec });
        showToast('✅ Configuración de GPS guardada correctamente', 'success');
      }
    });
  }

  const settingsDailyLimitRange = document.getElementById('settingsDailyLimitRange');
  const settingsDailyLimitBadge = document.getElementById('settingsDailyLimitBadge');
  if (settingsDailyLimitRange) {
    settingsDailyLimitRange.addEventListener('input', (e) => {
      const mins = parseInt(e.target.value, 10);
      if (settingsDailyLimitBadge) {
        settingsDailyLimitBadge.textContent = `${mins} min (${Math.floor(mins/60)}h ${mins%60}m)`;
      }
    });
  }

  const btnSaveDailyLimitSettings = document.getElementById('btnSaveDailyLimitSettings');
  if (btnSaveDailyLimitSettings) {
    btnSaveDailyLimitSettings.addEventListener('click', async () => {
      const mins = parseInt(document.getElementById('settingsDailyLimitRange')?.value, 10) || 120;
      if (currentDevice) {
        currentDevice.dailyLimitMinutes = mins;
        await updateRemoteConfig({ dailyLimitMinutes: mins });
        renderHero();
        showToast(`✅ Límite diario actualizado a ${mins} minutos`, 'success');
      }
    });
  }

  const settingsToggleBedtime = document.getElementById('settingsToggleBedtime');
  const settingsToggleBedtimeText = document.getElementById('settingsToggleBedtimeText');
  if (settingsToggleBedtime) {
    settingsToggleBedtime.addEventListener('change', (e) => {
      if (settingsToggleBedtimeText) {
        settingsToggleBedtimeText.textContent = e.target.checked ? 'Habilitado' : 'Deshabilitado';
        settingsToggleBedtimeText.style.color = e.target.checked ? '#a78bfa' : '#94a3b8';
      }
    });
  }

  const btnSaveBedtimeSettings = document.getElementById('btnSaveBedtimeSettings');
  if (btnSaveBedtimeSettings) {
    btnSaveBedtimeSettings.addEventListener('click', async () => {
      const bedtimeEnabled = document.getElementById('settingsToggleBedtime')?.checked ?? false;
      const bedtimeStart = document.getElementById('settingsBedtimeStart')?.value || '21:30';
      const bedtimeEnd = document.getElementById('settingsBedtimeEnd')?.value || '07:00';
      if (currentDevice) {
        currentDevice.bedtimeEnabled = bedtimeEnabled;
        currentDevice.bedtimeStart = bedtimeStart;
        currentDevice.bedtimeEnd = bedtimeEnd;
        await updateRemoteConfig({ bedtimeEnabled, bedtimeStart, bedtimeEnd });
        showToast('✅ Horario nocturno guardado correctamente', 'success');
      }
    });
  }

  const btnSaveParentPinSettings = document.getElementById('btnSaveParentPinSettings');
  if (btnSaveParentPinSettings) {
    btnSaveParentPinSettings.addEventListener('click', async () => {
      const pin = (document.getElementById('settingsParentPinInput')?.value || '').trim();
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        showToast('El PIN debe tener exactamente 4 dígitos numéricos', 'warning');
        return;
      }
      if (currentDevice) {
        currentDevice.parentPin = pin;
        await updateRemoteConfig({ parentPin: pin });
        const headerPinDisplay = document.getElementById('headerPinDisplay');
        if (headerPinDisplay) headerPinDisplay.textContent = pin;
        showToast('✅ PIN parental actualizado con éxito', 'success');
      }
    });
  }

  // Portal CTA Buttons
  const btnPortalGoMonitoring = document.getElementById('btnPortalGoMonitoring');
  if (btnPortalGoMonitoring) btnPortalGoMonitoring.addEventListener('click', () => switchView('monitoring'));

  const btnPortalOpenMonitoringFromCard = document.getElementById('btnPortalOpenMonitoringFromCard');
  if (btnPortalOpenMonitoringFromCard) btnPortalOpenMonitoringFromCard.addEventListener('click', () => switchView('monitoring'));

  const btnPortalScrollPlans = document.getElementById('btnPortalScrollPlans');
  if (btnPortalScrollPlans) {
    btnPortalScrollPlans.addEventListener('click', () => {
      const plans = document.getElementById('portalPricingSection');
      if (plans) plans.scrollIntoView({ behavior: 'smooth' });
    });
  }

  const btnPortalLogout = document.getElementById('btnPortalLogout');
  if (btnPortalLogout) btnPortalLogout.addEventListener('click', logoutAdmin);

  // Portal Auth Tabs
  const portalTabLogin = document.getElementById('portalTabLogin');
  const portalTabRegister = document.getElementById('portalTabRegister');
  const portalLoginForm = document.getElementById('portalLoginForm');
  const portalRegisterForm = document.getElementById('portalRegisterForm');

  function switchToLoginTab(prefillEmail = '') {
    if (portalTabLogin && portalTabRegister) {
      portalTabLogin.classList.add('active');
      portalTabRegister.classList.remove('active');
      if (portalLoginForm) portalLoginForm.style.display = 'block';
      if (portalRegisterForm) portalRegisterForm.style.display = 'none';
      if (prefillEmail) {
        const loginEmail = document.getElementById('portalLoginEmail');
        if (loginEmail) {
          loginEmail.value = prefillEmail;
          document.getElementById('portalLoginPassword')?.focus();
        }
      }
    }
  }

  function switchToRegisterTab() {
    if (portalTabLogin && portalTabRegister) {
      portalTabRegister.classList.add('active');
      portalTabLogin.classList.remove('active');
      if (portalLoginForm) portalLoginForm.style.display = 'none';
      if (portalRegisterForm) portalRegisterForm.style.display = 'block';
    }
  }

  if (portalTabLogin && portalTabRegister) {
    portalTabLogin.addEventListener('click', () => switchToLoginTab());
    portalTabRegister.addEventListener('click', () => switchToRegisterTab());
  }

  // Pre-validation: Check if email already exists on typing in register form
  const portalRegEmail = document.getElementById('portalRegEmail');
  let emailPreCheckTimer = null;
  if (portalRegEmail) {
    portalRegEmail.addEventListener('input', () => {
      clearTimeout(emailPreCheckTimer);
      const email = portalRegEmail.value.trim().toLowerCase();
      const feedbackEl = document.getElementById('portalRegEmailFeedback');
      if (!email || !email.includes('@') || !email.includes('.')) {
        if (feedbackEl) feedbackEl.innerHTML = '';
        portalRegEmail.classList.remove('input-warning-border', 'input-error-border');
        return;
      }

      emailPreCheckTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.exists) {
              portalRegEmail.classList.add('input-warning-border');
              if (feedbackEl) {
                feedbackEl.className = 'input-feedback-msg warning';
                feedbackEl.innerHTML = `⚠️ Ya existe una cuenta con este correo. <a href="#" id="linkSwitchToLoginQuick" style="color: #6366f1; font-weight: 700; text-decoration: underline;">Iniciar Sesión aquí</a>`;
                document.getElementById('linkSwitchToLoginQuick')?.addEventListener('click', (ev) => {
                  ev.preventDefault();
                  switchToLoginTab(email);
                });
              }
            } else {
              portalRegEmail.classList.remove('input-warning-border', 'input-error-border');
              if (feedbackEl) {
                feedbackEl.className = 'input-feedback-msg success';
                feedbackEl.textContent = '✓ Correo disponible para registrar';
              }
            }
          }
        } catch (e) {}
      }, 500);
    });
  }

  const btnPortalSubmitLogin = document.getElementById('btnPortalSubmitLogin');
  if (btnPortalSubmitLogin) {
    btnPortalSubmitLogin.addEventListener('click', async () => {
      const email = document.getElementById('portalLoginEmail')?.value.trim();
      const password = document.getElementById('portalLoginPassword')?.value;
      if (!email || !password) {
        showToast('Ingresa tu correo y contraseña.', 'warning');
        return;
      }
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (res.ok) {
          const data = await res.json();
          adminAuthToken = data.token;
          adminUser = data.user;
          localStorage.setItem('kidsshield_admin_token', adminAuthToken);
          setAdminLoggedInUI(adminUser);
          showToast(`¡Bienvenido/a ${adminUser.name}!`, 'success');
        } else {
          const err = await res.json();
          showToast(err.error || 'Error al iniciar sesión', 'danger');
        }
      } catch (e) {
        showToast('Error de conexión con el servidor', 'danger');
      }
    });
  }

  // Forgot Password Event Bindings
  const btnOpenForgotPassword = document.getElementById('btnOpenForgotPassword');
  if (btnOpenForgotPassword) btnOpenForgotPassword.addEventListener('click', openForgotPasswordModal);

  const btnModalOpenForgotPassword = document.getElementById('btnModalOpenForgotPassword');
  if (btnModalOpenForgotPassword) btnModalOpenForgotPassword.addEventListener('click', openForgotPasswordModal);

  const btnCloseForgotModal = document.getElementById('btnCloseForgotModal');
  if (btnCloseForgotModal) btnCloseForgotModal.addEventListener('click', closeForgotPasswordModal);

  const btnCloseForgotModalFooter = document.getElementById('btnCloseForgotModalFooter');
  if (btnCloseForgotModalFooter) btnCloseForgotModalFooter.addEventListener('click', closeForgotPasswordModal);

  const btnSubmitForgotPassword = document.getElementById('btnSubmitForgotPassword');
  if (btnSubmitForgotPassword) btnSubmitForgotPassword.addEventListener('click', submitForgotPassword);

  const btnBackToLoginFromForgot = document.getElementById('btnBackToLoginFromForgot');
  if (btnBackToLoginFromForgot) btnBackToLoginFromForgot.addEventListener('click', backToLoginFromForgot);

  const forgotEmailInput = document.getElementById('forgotEmailInput');
  if (forgotEmailInput) {
    forgotEmailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitForgotPassword();
    });
  }

  // Reset Password Event Bindings
  const btnCloseResetModal = document.getElementById('btnCloseResetModal');
  if (btnCloseResetModal) btnCloseResetModal.addEventListener('click', closeResetPasswordModal);

  const btnCloseResetModalFooter = document.getElementById('btnCloseResetModalFooter');
  if (btnCloseResetModalFooter) btnCloseResetModalFooter.addEventListener('click', closeResetPasswordModal);

  const btnSubmitResetPassword = document.getElementById('btnSubmitResetPassword');
  if (btnSubmitResetPassword) btnSubmitResetPassword.addEventListener('click', submitResetPassword);

  const btnToggleResetPasswordView = document.getElementById('btnToggleResetPasswordView');
  if (btnToggleResetPasswordView) btnToggleResetPasswordView.addEventListener('click', toggleResetPasswordVisibility);

  const btnGoLoginAfterReset = document.getElementById('btnGoLoginAfterReset');
  if (btnGoLoginAfterReset) {
    btnGoLoginAfterReset.addEventListener('click', () => {
      closeResetPasswordModal();
      switchView('portal', 'portalAuthCard');
    });
  }

  const resetConfirmPassword = document.getElementById('resetConfirmPassword');
  if (resetConfirmPassword) {
    resetConfirmPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitResetPassword();
    });
  }

  const btnPortalSubmitRegister = document.getElementById('btnPortalSubmitRegister');
  if (btnPortalSubmitRegister) {
    btnPortalSubmitRegister.addEventListener('click', async () => {
      const name = document.getElementById('portalRegName')?.value.trim();
      const email = document.getElementById('portalRegEmail')?.value.trim();
      const password = document.getElementById('portalRegPassword')?.value;
      if (!name || !email || !password) {
        showToast('Por favor completa todos los campos de registro.', 'warning');
        return;
      }
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        if (res.ok) {
          const data = await res.json();
          adminAuthToken = data.token;
          adminUser = data.user;
          localStorage.setItem('kidsshield_admin_token', adminAuthToken);
          setAdminLoggedInUI(adminUser);
          showToast('🎉 ¡Familia registrada con éxito! Prueba Pro activa.', 'success');
        } else {
          const err = await res.json();
          if (res.status === 409 || err.alreadyExists) {
            showToast('⚠️ Esta cuenta ya existe. Te redirigimos al inicio de sesión...', 'warning');
            setTimeout(() => {
              switchToLoginTab(email);
            }, 1000);
          } else {
            showToast(err.error || 'Error al registrar la cuenta', 'danger');
          }
        }
      } catch (e) {
        showToast('Error de conexión con el servidor', 'danger');
      }
    });
  }

  // Inline Screen Time Stepper (-15m / +15m)
  const btnDecreaseLimit = document.getElementById('btnDecreaseLimit');
  if (btnDecreaseLimit) btnDecreaseLimit.addEventListener('click', decreaseDailyLimit15m);

  const btnIncreaseLimit = document.getElementById('btnIncreaseLimit');
  if (btnIncreaseLimit) btnIncreaseLimit.addEventListener('click', increaseDailyLimit15m);

  const btnIncreaseLimit30 = document.getElementById('btnIncreaseLimit30');
  if (btnIncreaseLimit30) btnIncreaseLimit30.addEventListener('click', increaseDailyLimit30m);

  // Live Screenshot Pause / Resume
  const btnToggleLivePause = document.getElementById('btnToggleLivePause');
  if (btnToggleLivePause) btnToggleLivePause.addEventListener('click', toggleLiveScreenshotPause);

  const btnOverlayResumeLive = document.getElementById('btnOverlayResumeLive');
  if (btnOverlayResumeLive) btnOverlayResumeLive.addEventListener('click', toggleLiveScreenshotPause);

  // Unlink Device Modal
  const btnUnlinkDevice = document.getElementById('btnUnlinkDevice');
  if (btnUnlinkDevice) btnUnlinkDevice.addEventListener('click', openUnlinkDeviceModal);

  const btnCloseUnlinkDeviceModal = document.getElementById('btnCloseUnlinkDeviceModal');
  if (btnCloseUnlinkDeviceModal) btnCloseUnlinkDeviceModal.addEventListener('click', closeUnlinkDeviceModal);

  const btnCancelUnlinkDevice = document.getElementById('btnCancelUnlinkDevice');
  if (btnCancelUnlinkDevice) btnCancelUnlinkDevice.addEventListener('click', closeUnlinkDeviceModal);

  const btnConfirmUnlinkDevice = document.getElementById('btnConfirmUnlinkDevice');
  if (btnConfirmUnlinkDevice) btnConfirmUnlinkDevice.addEventListener('click', confirmUnlinkDevice);

  // Master Lock
  if (btnMasterLock) btnMasterLock.addEventListener('click', () => {
    if (!currentDevice) {
      showToast('No hay ningún dispositivo seleccionado', 'warning');
      return;
    }
    const newLockState = !currentDevice.isLocked;
    updateRemoteConfig({
      isLocked: newLockState,
      lockReason: newLockState ? 'Bloqueo inmediato solicitado por los padres' : ''
    });
    showToast(newLockState ? 'Teléfono del hijo bloqueado remotamente' : 'Teléfono del hijo desbloqueado', newLockState ? 'warning' : 'success');
  });

  // Quick block active app
  if (btnQuickBlockActiveApp) btnQuickBlockActiveApp.addEventListener('click', () => {
    if (!currentDevice || !currentDevice.appCatalog) return;
    const activeApp = currentDevice.appCatalog.find(a => a.package === currentDevice.currentActiveApp);
    if (activeApp) {
      toggleAppBlock(activeApp.package, !activeApp.isBlocked);
    }
  });

  // Bonus time
  if (btnAddBonusTime) btnAddBonusTime.addEventListener('click', () => {
    if (!currentDevice) return;
    const newLimit = currentDevice.dailyLimitMinutes + 15;
    updateRemoteConfig({ dailyLimitMinutes: newLimit });
    showToast('Se otorgaron +15 minutos de tiempo de pantalla extra', 'success');
  });

  // Range slider
  if (dailyLimitRange) dailyLimitRange.addEventListener('input', (e) => {
    const mins = parseInt(e.target.value, 10);
    dailyLimitValText.textContent = formatMinutes(mins);
  });

  if (dailyLimitRange) dailyLimitRange.addEventListener('change', (e) => {
    const mins = parseInt(e.target.value, 10);
    updateRemoteConfig({ dailyLimitMinutes: mins });
    showToast(`Nuevo límite diario: ${formatMinutes(mins)}`, 'success');
  });

  // Bedtime toggle
  if (toggleBedtime) toggleBedtime.addEventListener('change', (e) => {
    updateRemoteConfig({ bedtimeEnabled: e.target.checked });
    showToast(e.target.checked ? 'Modo noche activado' : 'Modo noche desactivado', 'info');
  });

  // Save Schedule
  if (btnSaveSchedule) btnSaveSchedule.addEventListener('click', () => {
    updateRemoteConfig({
      bedtimeStart: bedtimeStartInput.value,
      bedtimeEnd: bedtimeEndInput.value
    });
    showToast('Horarios de descanso guardados correctamente', 'success');
  });

  // App Search
  if (appSearchInput) appSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderAppList();
  });

  // Category filter pills
  categoryFilter.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryFilter.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategoryFilter = btn.dataset.filter;
      renderAppList();
    });
  });

  // Simulator unlock with PIN
  if (btnSimUnlockPin) btnSimUnlockPin.addEventListener('click', () => {
    const entered = simPinInput.value.trim();
    if (entered === currentDevice.parentPin) {
      updateRemoteConfig({ isLocked: false });
      simPinInput.value = '';
      showToast('Desbloqueado con PIN de padres en el dispositivo', 'success');
    } else {
      showToast('PIN incorrecto. Intenta de nuevo.', 'danger');
      simPinInput.value = '';
    }
  });

  // Edit device name
  const btnEditDeviceName = document.getElementById('btnEditDeviceName');
  if (btnEditDeviceName) {
    btnEditDeviceName.addEventListener('click', () => {
      const newName = prompt('Ingresa el nombre o modelo de este dispositivo:', currentDevice.name);
      if (newName && newName.trim()) {
        updateRemoteConfig({ name: newName.trim() });
        showToast('Nombre del dispositivo actualizado', 'success');
      }
    });
  }

  // Capture Screenshot Now
  const btnCaptureScreenNow = document.getElementById('btnCaptureScreenNow');
  if (btnCaptureScreenNow) {
    btnCaptureScreenNow.addEventListener('click', requestScreenshotNow);
  }

  // Refresh GPS Location Now
  const btnRefreshLocation = document.getElementById('btnRefreshLocation');
  if (btnRefreshLocation) {
    btnRefreshLocation.addEventListener('click', requestLocationNow);
  }

  // Toggle Auto-Screenshot every 8s
  const toggleAutoScreenshot = document.getElementById('toggleAutoScreenshot');
  if (toggleAutoScreenshot) {
    toggleAutoScreenshot.addEventListener('change', (e) => {
      if (e.target.checked) {
        requestScreenshotNow();
        autoScreenshotTimer = setInterval(requestScreenshotNow, 8000);
        showToast('Captura automática activada (cada 8s)', 'info');
      } else {
        if (autoScreenshotTimer) {
          clearInterval(autoScreenshotTimer);
          autoScreenshotTimer = null;
        }
        showToast('Captura automática desactivada', 'info');
      }
    });
  }

  // Toggle Browser Push Alerts & Sound
  const btnToggleAlertNotifications = document.getElementById('btnToggleAlertNotifications');
  if (btnToggleAlertNotifications) {
    btnToggleAlertNotifications.addEventListener('click', async () => {
      if (!('Notification' in window)) {
        alert('Este navegador no tiene soporte nativo para notificaciones.');
        return;
      }
      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          btnToggleAlertNotifications.classList.add('btn-alert-active');
          const txt = document.getElementById('alertNotifText');
          if (txt) txt.textContent = 'Alertas Activas';
          playAlertSound();
          triggerWebNotification('KidsShield Conectado', 'Las alertas sonoras y notificaciones en vivo están activadas.');
          showToast('Notificaciones y alertas activadas con éxito', 'success');
        } else {
          showToast('Permiso de notificaciones denegado', 'warning');
        }
      } catch (err) {
        console.error('Error solicitando permisos de notificación', err);
      }
    });
  }

  // Modals & Navigation
  if (btnShowSetupSteps && setupModal) btnShowSetupSteps.addEventListener('click', () => setupModal.classList.add('active'));
  if (btnCloseSetupModal && setupModal) btnCloseSetupModal.addEventListener('click', () => setupModal.classList.remove('active'));
  if (btnConfirmSteps && setupModal) btnConfirmSteps.addEventListener('click', () => setupModal.classList.remove('active'));

  if (btnOpenPinModal && pinModal) {
    btnOpenPinModal.addEventListener('click', () => {
      if (newPinInput) newPinInput.value = (currentDevice && currentDevice.parentPin) ? currentDevice.parentPin : '1234';
      pinModal.classList.add('active');
    });
  }
  if (btnClosePinModal && pinModal) btnClosePinModal.addEventListener('click', () => pinModal.classList.remove('active'));
  if (btnCancelPinModal && pinModal) btnCancelPinModal.addEventListener('click', () => pinModal.classList.remove('active'));
  btnSavePin.addEventListener('click', () => {
    const val = newPinInput.value.trim();
    if (val.length === 4 && /^\d+$/.test(val)) {
      updateRemoteConfig({ parentPin: val });
      pinModal.classList.remove('active');
      showToast('PIN de seguridad actualizado', 'success');
    } else {
      alert('Por favor ingresa un PIN numérico de 4 dígitos.');
    }
  });

  // Multi-Device Selector & Management
  if (deviceSelectorDropdown) {
    deviceSelectorDropdown.addEventListener('change', (e) => {
      onDeviceSelected(e.target.value);
    });
  }

  if (btnOpenAddDeviceModal) {
    btnOpenAddDeviceModal.addEventListener('click', () => {
      inputNewDeviceId.value = `KID-PHONE-0${(devicesList.length + 1) || 2}`;
      inputNewDeviceName.value = '';
      inputNewDeviceModel.value = '';
      inputNewDevicePin.value = '1234';
      modalAddDevice.classList.add('active');
    });
  }

  if (btnCloseAddDeviceModal) btnCloseAddDeviceModal.addEventListener('click', () => modalAddDevice.classList.remove('active'));
  if (btnCancelAddDevice) btnCancelAddDevice.addEventListener('click', () => modalAddDevice.classList.remove('active'));
  if (btnSubmitAddDevice) btnSubmitAddDevice.addEventListener('click', createNewDevice);

  // Pairing QR Modal
  if (btnOpenPairingQrModal) {
    btnOpenPairingQrModal.addEventListener('click', openPairingQrModal);
  }
  if (btnClosePairingQrModal) btnClosePairingQrModal.addEventListener('click', () => modalPairingQr.classList.remove('active'));
  if (btnDonePairingQr) btnDonePairingQr.addEventListener('click', () => modalPairingQr.classList.remove('active'));
  if (btnCopyPairingPayload) {
    btnCopyPairingPayload.addEventListener('click', copyPairingPayload);
  }

  // 5-Second Video Clip
  if (btnCaptureVideo5s) {
    btnCaptureVideo5s.addEventListener('click', requestVideo5s);
  }
  if (btnPlayPauseClip) {
    btnPlayPauseClip.addEventListener('click', togglePlayVideoClip);
  }
  if (clipTimelineSlider) {
    clipTimelineSlider.addEventListener('input', (e) => {
      pauseVideoClip();
      showVideoClipFrame(parseInt(e.target.value, 10));
    });
  }
  if (btnCloseVideoClip) {
    btnCloseVideoClip.addEventListener('click', closeVideoClipOverlay);
  }

  // Route History & Geofences
  if (btnToggleRouteHistory) {
    btnToggleRouteHistory.addEventListener('click', toggleRouteHistory);
  }
  const btnToggleGeofences = document.getElementById('btnToggleGeofences');
  if (btnToggleGeofences) {
    btnToggleGeofences.addEventListener('click', toggleGeofencesVisibility);
  }

  // Live Ambient Audio (Micrófono)
  const btnCaptureAudio5s = document.getElementById('btnCaptureAudio5s');
  if (btnCaptureAudio5s) {
    btnCaptureAudio5s.addEventListener('click', requestAudio5s);
  }
  const btnTriggerAudioRecord = document.getElementById('btnTriggerAudioRecord');
  if (btnTriggerAudioRecord) {
    btnTriggerAudioRecord.addEventListener('click', requestAudio5s);
  }

  // Admin Profile & User Auth
  if (btnAdminProfile) {
    btnAdminProfile.addEventListener('click', () => {
      initGoogleAuth();
      modalAdminLogin.classList.add('active');
    });
  }
  const btnBannerOpenLogin = document.getElementById('btnBannerOpenLogin');
  if (btnBannerOpenLogin) {
    btnBannerOpenLogin.addEventListener('click', () => {
      initGoogleAuth();
      modalAdminLogin.classList.add('active');
    });
  }
  if (btnCloseAdminModal) btnCloseAdminModal.addEventListener('click', () => modalAdminLogin.classList.remove('active'));
  if (btnCloseAdminModalFooter) btnCloseAdminModalFooter.addEventListener('click', () => modalAdminLogin.classList.remove('active'));
  if (btnLoginWithGoogle) btnLoginWithGoogle.addEventListener('click', () => triggerGoogleAuth(false));
  if (btnRegisterWithGoogle) btnRegisterWithGoogle.addEventListener('click', () => triggerGoogleAuth(true));
  if (btnAdminLogout) btnAdminLogout.addEventListener('click', logoutAdmin);

  // Auth Tabs (Login vs Register)
  if (tabBtnLogin && tabBtnRegister) {
    tabBtnLogin.addEventListener('click', () => {
      tabBtnLogin.classList.add('active');
      tabBtnLogin.style.background = 'var(--primary)';
      tabBtnLogin.style.color = '#fff';
      tabBtnRegister.classList.remove('active');
      tabBtnRegister.style.background = 'transparent';
      tabBtnRegister.style.color = 'var(--text-secondary)';
      if (formLoginTab) formLoginTab.style.display = 'block';
      if (formRegisterTab) formRegisterTab.style.display = 'none';
    });
    tabBtnRegister.addEventListener('click', () => {
      tabBtnRegister.classList.add('active');
      tabBtnRegister.style.background = 'var(--primary)';
      tabBtnRegister.style.color = '#fff';
      tabBtnLogin.classList.remove('active');
      tabBtnLogin.style.background = 'transparent';
      tabBtnLogin.style.color = 'var(--text-secondary)';
      if (formLoginTab) formLoginTab.style.display = 'none';
      if (formRegisterTab) formRegisterTab.style.display = 'block';
    });
  }

  // Email Login & Registration Handlers
  if (btnSubmitEmailLogin) {
    btnSubmitEmailLogin.addEventListener('click', loginWithEmailPassword);
  }
  if (btnSubmitRegister) {
    btnSubmitRegister.addEventListener('click', registerFamilyAccount);
  }
  const btnSubmitEmailReg = document.getElementById('btnSubmitEmailRegister');
  if (btnSubmitEmailReg) {
    btnSubmitEmailReg.addEventListener('click', registerFamilyAccount);
  }

  // Subscription Modal Trigger & Handlers
  if (btnOpenSubscriptionModal) {
    btnOpenSubscriptionModal.addEventListener('click', () => {
      loadSubscriptionInfo();
      modalSubscription.classList.add('active');
    });
  }
  if (btnAdminOpenSubscriptionModal) {
    btnAdminOpenSubscriptionModal.addEventListener('click', () => {
      modalAdminLogin.classList.remove('active');
      loadSubscriptionInfo();
      modalSubscription.classList.add('active');
    });
  }
  if (btnCloseSubscriptionModal) {
    btnCloseSubscriptionModal.addEventListener('click', () => modalSubscription.classList.remove('active'));
  }
  if (btnCloseSubscriptionModalFooter) {
    btnCloseSubscriptionModalFooter.addEventListener('click', () => modalSubscription.classList.remove('active'));
  }

  // Plan Selection buttons
  if (btnSelectPlanFree) {
    btnSelectPlanFree.addEventListener('click', () => changeSubscriptionPlan('free'));
  }
  if (btnSelectPlanPro) {
    btnSelectPlanPro.addEventListener('click', () => changeSubscriptionPlan('pro'));
  }
  if (btnSelectPlanFamilyTotal) {
    btnSelectPlanFamilyTotal.addEventListener('click', () => changeSubscriptionPlan('family_total'));
  }

  // Mejorar Plan triggers
  const openSub = () => {
    loadSubscriptionInfo();
    if (modalSubscription) modalSubscription.classList.add('active');
  };
  const sidebarBtnUpgradePlan = document.getElementById('sidebarBtnUpgradePlan');
  if (sidebarBtnUpgradePlan) sidebarBtnUpgradePlan.addEventListener('click', openSub);
  const btnFamilyUpgradePlan = document.getElementById('btnFamilyUpgradePlan');
  if (btnFamilyUpgradePlan) btnFamilyUpgradePlan.addEventListener('click', openSub);
  const btnSettingsUpgradePlan = document.getElementById('btnSettingsUpgradePlan');
  if (btnSettingsUpgradePlan) btnSettingsUpgradePlan.addEventListener('click', openSub);

  // Billing & Card Modal triggers
  const modalUpdateCard = document.getElementById('modalUpdateCard');
  const btnOpenUpdateCardModal = document.getElementById('btnOpenUpdateCardModal');
  if (btnOpenUpdateCardModal) {
    btnOpenUpdateCardModal.addEventListener('click', () => {
      if (modalUpdateCard) modalUpdateCard.classList.add('active');
    });
  }
  const btnCloseUpdateCardModal = document.getElementById('btnCloseUpdateCardModal');
  if (btnCloseUpdateCardModal) {
    btnCloseUpdateCardModal.addEventListener('click', () => {
      if (modalUpdateCard) modalUpdateCard.classList.remove('active');
    });
  }
  const btnCancelUpdateCard = document.getElementById('btnCancelUpdateCard');
  if (btnCancelUpdateCard) {
    btnCancelUpdateCard.addEventListener('click', () => {
      if (modalUpdateCard) modalUpdateCard.classList.remove('active');
    });
  }
  const btnSaveCardDetails = document.getElementById('btnSaveCardDetails');
  if (btnSaveCardDetails) {
    btnSaveCardDetails.addEventListener('click', handleSaveCardDetails);
  }

  // Toggle Auto-Renew Switch
  const toggleAutoRenewSwitch = document.getElementById('toggleAutoRenewSwitch');
  if (toggleAutoRenewSwitch) {
    toggleAutoRenewSwitch.addEventListener('change', handleToggleAutoRenew);
  }

  // GCP Config Listeners
  if (btnToggleGcpConfig) {
    btnToggleGcpConfig.addEventListener('click', () => {
      if (gcpConfigPanel) {
        gcpConfigPanel.style.display = gcpConfigPanel.style.display === 'none' ? 'block' : 'none';
      }
    });
  }
  if (btnSaveGoogleClientId) {
    btnSaveGoogleClientId.addEventListener('click', saveCustomGoogleClientId);
  }

  const btnCloseGoogleSetup = document.getElementById('btnCloseGoogleSetup');
  if (btnCloseGoogleSetup) {
    btnCloseGoogleSetup.addEventListener('click', () => {
      const setupPanel = document.getElementById('googleSetupPanel');
      if (setupPanel) setupPanel.style.display = 'none';
    });
  }

  const btnSaveGoogleClientIdModal = document.getElementById('btnSaveGoogleClientIdModal');
  if (btnSaveGoogleClientIdModal) {
    btnSaveGoogleClientIdModal.addEventListener('click', saveGoogleClientIdFromModal);
  }

  // Inicializar subtabs de Configuración
  setupSettingsSubtabs();
  } catch (bindErr) {
    console.error('[Events] Error in bindEvents:', bindErr);
  }
}

// Multi-Device Functions
async function loadDevicesList(selectedIdToSet) {
  try {
    const res = await apiFetch('/api/devices');
    if (res.ok) {
      devicesList = await res.json();
      renderDeviceSelector(selectedIdToSet);
      return;
    }
  } catch (e) {
    console.warn('Error al cargar lista de dispositivos remota', e);
  }

  devicesList = [];
  renderDeviceSelector(selectedIdToSet);
}

function renderDeviceSelector(selectedIdToSet) {
  if (!deviceSelectorDropdown) return;
  deviceSelectorDropdown.innerHTML = '';

  if (!devicesList || devicesList.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '📱 Sin dispositivo';
    deviceSelectorDropdown.appendChild(opt);
    currentDevice = null;
    renderNoDeviceState();
    return;
  }

  const savedId = localStorage.getItem('kidsshield_active_device_id');
  const targetId = selectedIdToSet || savedId || (devicesList[0] ? devicesList[0].id : null);

  devicesList.forEach(dev => {
    const opt = document.createElement('option');
    opt.value = dev.id;
    opt.textContent = `${dev.name || dev.childName || 'Dispositivo'} (${dev.id})`;
    if (dev.id === targetId) {
      opt.selected = true;
    }
    deviceSelectorDropdown.appendChild(opt);
  });

  const activeFound = devicesList.find(d => d.id === targetId) || devicesList[0];
  if (activeFound) {
    onDeviceSelected(activeFound.id, false);
  } else {
    currentDevice = null;
    renderNoDeviceState();
  }
}

async function onDeviceSelected(deviceId, updateDropdown = true) {
  if (!deviceId) {
    currentDevice = null;
    renderNoDeviceState();
    syncChildContextSelectors();
    return;
  }
  localStorage.setItem('kidsshield_active_device_id', deviceId);
  if (updateDropdown && deviceSelectorDropdown) {
    deviceSelectorDropdown.value = deviceId;
  }
  await fetchDeviceData(deviceId);
  syncChildContextSelectors();
  if (isRouteHistoryVisible) {
    fetchAndRenderRouteHistory();
  }
  if (currentDevice) {
    renderFamilyOverviewCards();
    showToast(`Supervisando ahora: ${currentDevice.childName || currentDevice.name}`, 'info');
  }
}

function openAddDeviceModal() {
  const nameInput = document.getElementById('inputNewDeviceName');
  const childInput = document.getElementById('inputNewDeviceChildName');
  const avatarInput = document.getElementById('inputNewDeviceAvatar');
  if (nameInput) nameInput.value = '';
  if (childInput) childInput.value = '';
  if (avatarInput) avatarInput.value = '👦';
  if (modalAddDevice) modalAddDevice.classList.add('active');
}

async function createNewDevice() {
  const nameInput = document.getElementById('inputNewDeviceName');
  const childInput = document.getElementById('inputNewDeviceChildName');
  const avatarInput = document.getElementById('inputNewDeviceAvatar');

  const rawName = nameInput ? nameInput.value.trim() : '';
  const rawChild = childInput ? childInput.value.trim() : '';
  const avatar = avatarInput ? avatarInput.value : '👦';

  if (!rawName && !rawChild) {
    alert('Por favor ingresa un nombre para el teléfono o menor a supervisar.');
    return;
  }

  const name = rawName || `Teléfono de ${rawChild}`;
  const childName = rawChild || rawName;

  try {
    const res = await apiFetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, childName, avatar })
    });
    if (res.ok) {
      const data = await res.json();
      const createdDevice = data.device || {};
      const newId = createdDevice.id;
      if (modalAddDevice) modalAddDevice.classList.remove('active');
      showToast(`Dispositivo "${name}" registrado con éxito`, 'success');
      await loadDevicesList(newId);
      await openPairingQrModal(newId);
    } else {
      const err = await res.json();
      if (err.requiresUpgrade) {
        showToast(err.error, 'warning');
        loadSubscriptionInfo();
        if (modalSubscription) modalSubscription.classList.add('active');
      } else {
        alert(`Error al registrar dispositivo: ${err.error || 'Intente nuevamente'}`);
      }
    }
  } catch (err) {
    console.error('Error registrando dispositivo', err);
    showToast('Error de conexión al registrar dispositivo', 'danger');
  }
}

// Pairing QR Modal Functions
async function openPairingQrModal(deviceIdParam) {
  let targetDevice = null;
  if (deviceIdParam && typeof deviceIdParam === 'string') {
    targetDevice = devicesList.find(d => d.id === deviceIdParam) || currentDevice;
  } else {
    targetDevice = currentDevice || (devicesList && devicesList[0]) || null;
  }

  const deviceId = (targetDevice && targetDevice.id) ? targetDevice.id : (deviceIdParam || 'KID-PHONE-01');
  const deviceName = targetDevice ? (targetDevice.name || targetDevice.childName) : `Dispositivo (${deviceId})`;
  const parentPin = (targetDevice && targetDevice.parentPin) ? targetDevice.parentPin : '1234';

  let serverHost = window.location.hostname;
  let serverPort = window.location.port || '3000';
  let fullServerUrl = `${window.location.protocol}//${serverHost}:${serverPort}`;

  if (qrModalDeviceName) qrModalDeviceName.textContent = deviceName;
  if (qrModalDeviceId) qrModalDeviceId.textContent = deviceId;
  if (qrModalServerUrl) qrModalServerUrl.textContent = fullServerUrl;
  if (qrModalDevicePin) qrModalDevicePin.textContent = parentPin;

  const payload = {
    type: 'KIDSSHIELD_PAIRING',
    serverUrl: fullServerUrl,
    deviceId: deviceId,
    pin: parentPin
  };
  const payloadString = JSON.stringify(payload);

  // 1. Generación inmediata en cliente con librería QRCode si está disponible
  let clientQrReady = false;
  if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
    try {
      const dataUrl = await QRCode.toDataURL(payloadString, {
        width: 240,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      if (qrCodeImg) {
        qrCodeImg.src = dataUrl;
        qrCodeImg.style.display = 'block';
        clientQrReady = true;
      }
    } catch (qrErr) {
      console.warn('Fallback a servidor para QR:', qrErr);
    }
  }

  // 2. Consulta al servidor para obtener datos oficiales e IP de red local
  try {
    const res = await fetch(`/api/devices/${deviceId}/pairing-info`);
    if (res.ok) {
      const info = await res.json();
      if (info.serverUrl) {
        fullServerUrl = info.serverUrl;
        if (qrModalServerUrl) qrModalServerUrl.textContent = fullServerUrl;
      }
      if (info.deviceName && qrModalDeviceName) qrModalDeviceName.textContent = info.deviceName;
      if (info.parentPin && qrModalDevicePin) qrModalDevicePin.textContent = info.parentPin;
      if (info.qrDataUrl && qrCodeImg) {
        qrCodeImg.src = info.qrDataUrl;
        qrCodeImg.style.display = 'block';
      }
    } else if (!clientQrReady && qrCodeImg) {
      qrCodeImg.src = `/api/devices/${deviceId}/qr.png?t=${Date.now()}`;
      qrCodeImg.style.display = 'block';
    }
  } catch (e) {
    if (!clientQrReady && qrCodeImg) {
      qrCodeImg.src = `/api/devices/${deviceId}/qr.png?t=${Date.now()}`;
      qrCodeImg.style.display = 'block';
    }
  }

  if (modalPairingQr) modalPairingQr.classList.add('active');
}

function copyPairingPayload() {
  const deviceId = (currentDevice && currentDevice.id) ? currentDevice.id : 'KID-PHONE-01';
  let serverHost = window.location.hostname;
  let serverPort = window.location.port || '3000';
  let fullServerUrl = `${window.location.protocol}//${serverHost}:${serverPort}`;

  const payload = {
    type: 'KIDSSHIELD_PAIRING',
    serverUrl: fullServerUrl,
    deviceId: deviceId,
    pin: (currentDevice && currentDevice.parentPin) ? currentDevice.parentPin : '1234'
  };

  navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    .then(() => showToast('📋 Datos de vinculación copiados al portapapeles', 'success'))
    .catch(() => showToast('No se pudo copiar automáticamente', 'warning'));
}

// 5-Second Video Clip Capture & Player
async function requestVideo5s() {
  if (!currentDevice) {
    showToast('No hay ningún dispositivo vinculado actualmente.', 'warning');
    openPairingQrModal();
    return;
  }
  if (btnCaptureVideoText) btnCaptureVideoText.textContent = 'Grabando 5s...';
  if (btnCaptureVideoIcon) btnCaptureVideoIcon.textContent = '⏳';
  showToast('🎥 Solicitando ráfaga de video de 5s al móvil...', 'info');

  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/request-video`, { method: 'POST' });
    if (res.ok) {
      console.log('Petición de clip de video de 5 segundos enviada');
    }
  } catch (err) {
    console.error('Error solicitando video de 5 segundos', err);
    showToast('Error al solicitar video', 'danger');
  } finally {
    setTimeout(() => {
      if (btnCaptureVideoText && btnCaptureVideoText.textContent === 'Grabando 5s...') {
        btnCaptureVideoText.textContent = 'Video (5s)';
        if (btnCaptureVideoIcon) btnCaptureVideoIcon.textContent = '🎥';
      }
    }, 10000);
  }
}

function handleNewVideoClip(frames, intervalMs = 500) {
  if (!frames || !frames.length) return;

  currentVideoClip.frames = frames;
  currentVideoClip.intervalMs = intervalMs;
  currentVideoClip.currentIndex = 0;

  if (clipTimelineSlider) {
    clipTimelineSlider.max = frames.length - 1;
    clipTimelineSlider.value = 0;
  }

  showVideoClipFrame(0);
  if (simVideoClipOverlay) {
    simVideoClipOverlay.style.display = 'flex';
  }

  playVideoClip();

  if (btnCaptureVideoText) btnCaptureVideoText.textContent = 'Video (5s)';
  if (btnCaptureVideoIcon) btnCaptureVideoIcon.textContent = '🎥';

  playAlertSound();
  showToast(`🎥 ¡Clip de video de 5s recibido (${frames.length} fotogramas)!`, 'success');
}

function showVideoClipFrame(index) {
  if (!currentVideoClip.frames.length) return;
  const clamped = Math.max(0, Math.min(index, currentVideoClip.frames.length - 1));
  currentVideoClip.currentIndex = clamped;

  const frameData = currentVideoClip.frames[clamped];
  if (simVideoClipFrame) {
    simVideoClipFrame.src = frameData.startsWith('data:') ? frameData : 'data:image/jpeg;base64,' + frameData;
  }
  if (clipTimelineSlider) clipTimelineSlider.value = clamped;
  if (clipTimeText) {
    const secs = ((clamped * currentVideoClip.intervalMs) / 1000).toFixed(1);
    clipTimeText.textContent = `${secs}s`;
  }
}

function playVideoClip() {
  pauseVideoClip();
  currentVideoClip.isPlaying = true;
  if (btnPlayPauseClip) btnPlayPauseClip.textContent = '⏸';

  currentVideoClip.playTimer = setInterval(() => {
    let next = currentVideoClip.currentIndex + 1;
    if (next >= currentVideoClip.frames.length) {
      next = 0; // Loop replay
    }
    showVideoClipFrame(next);
  }, currentVideoClip.intervalMs || 500);
}

function pauseVideoClip() {
  currentVideoClip.isPlaying = false;
  if (currentVideoClip.playTimer) {
    clearInterval(currentVideoClip.playTimer);
    currentVideoClip.playTimer = null;
  }
  if (btnPlayPauseClip) btnPlayPauseClip.textContent = '▶';
}

function togglePlayVideoClip() {
  if (currentVideoClip.isPlaying) {
    pauseVideoClip();
  } else {
    playVideoClip();
  }
}

function closeVideoClipOverlay() {
  pauseVideoClip();
  if (simVideoClipOverlay) simVideoClipOverlay.style.display = 'none';
}

// ----------------------------------------------------------------
// Live Ambient Audio (Micrófono Ambiental) Functions
// ----------------------------------------------------------------
async function requestAudio5s() {
  if (!currentDevice) {
    showToast('No hay ningún dispositivo vinculado para escuchar.', 'warning');
    openPairingQrModal();
    return;
  }
  if (isAudioRecordingRequested) {
    showToast('Ya se está solicitando una grabación de audio...', 'warning');
    return;
  }
  isAudioRecordingRequested = true;

  const btnCaptureAudioText = document.getElementById('btnCaptureAudioText');
  const btnCaptureAudioIcon = document.getElementById('btnCaptureAudioIcon');
  const btnAudioActionText = document.getElementById('btnAudioActionText');
  const btnAudioActionIcon = document.getElementById('btnAudioActionIcon');
  const audioVisualizerBox = document.getElementById('audioVisualizerBox');
  const audioStatusText = document.getElementById('audioStatusText');

  if (btnCaptureAudioText) btnCaptureAudioText.textContent = 'Grabando 5s...';
  if (btnCaptureAudioIcon) btnCaptureAudioIcon.textContent = '⏳';
  if (btnAudioActionText) btnAudioActionText.textContent = 'Grabando (5s)...';
  if (btnAudioActionIcon) btnAudioActionIcon.textContent = '⏳';

  if (audioVisualizerBox) {
    audioVisualizerBox.classList.add('recording');
    audioVisualizerBox.classList.remove('playing');
  }
  if (audioStatusText) {
    audioStatusText.innerHTML = '🎙️ <strong>Grabando audio ambiente en el móvil de ' + (currentDevice.childName || currentDevice.name) + '...</strong> Esperando transmisión (5s).';
  }

  showToast('🎙️ Solicitando 5 segundos de audio ambiente en vivo...', 'info');

  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/request-audio`, { method: 'POST' });
    if (res.ok) {
      console.log('Petición de audio ambiental de 5 segundos enviada');
    }
  } catch (err) {
    console.error('Error solicitando audio ambiental', err);
    showToast('Error al solicitar audio ambiental', 'danger');
  } finally {
    // Timeout de reseteo si no responde en 12 segundos
    setTimeout(() => {
      if (isAudioRecordingRequested) {
        isAudioRecordingRequested = false;
        if (btnCaptureAudioText) btnCaptureAudioText.textContent = 'Audio (5s)';
        if (btnCaptureAudioIcon) btnCaptureAudioIcon.textContent = '🎙️';
        if (btnAudioActionText) btnAudioActionText.textContent = 'Escuchar en Directo (5s)';
        if (btnAudioActionIcon) btnAudioActionIcon.textContent = '🎙️';
        if (audioVisualizerBox) audioVisualizerBox.classList.remove('recording');
        if (audioStatusText && !audioStatusText.innerHTML.includes('Reproduciendo')) {
          audioStatusText.textContent = 'Micrófono listo. Pulsa el botón para solicitar 5 segundos de audio.';
        }
      }
    }, 12000);
  }
}

function handleNewAudioClip(audioBase64, duration = 5, timestamp) {
  isAudioRecordingRequested = false;

  const btnCaptureAudioText = document.getElementById('btnCaptureAudioText');
  const btnCaptureAudioIcon = document.getElementById('btnCaptureAudioIcon');
  const btnAudioActionText = document.getElementById('btnAudioActionText');
  const btnAudioActionIcon = document.getElementById('btnAudioActionIcon');
  const audioVisualizerBox = document.getElementById('audioVisualizerBox');
  const audioStatusText = document.getElementById('audioStatusText');
  const audioAmbientPlayer = document.getElementById('audioAmbientPlayer');
  const audioLastReceivedTime = document.getElementById('audioLastReceivedTime');

  if (btnCaptureAudioText) btnCaptureAudioText.textContent = 'Audio (5s)';
  if (btnCaptureAudioIcon) btnCaptureAudioIcon.textContent = '🎙️';
  if (btnAudioActionText) btnAudioActionText.textContent = 'Escuchar en Directo (5s)';
  if (btnAudioActionIcon) btnAudioActionIcon.textContent = '🎙️';

  if (audioVisualizerBox) {
    audioVisualizerBox.classList.remove('recording');
  }

  if (audioAmbientPlayer && audioBase64) {
    audioAmbientPlayer.src = audioBase64;
    audioAmbientPlayer.style.display = 'block';

    audioAmbientPlayer.onplay = () => {
      if (audioVisualizerBox) audioVisualizerBox.classList.add('playing');
    };
    audioAmbientPlayer.onpause = () => {
      if (audioVisualizerBox) audioVisualizerBox.classList.remove('playing');
    };
    audioAmbientPlayer.onended = () => {
      if (audioVisualizerBox) audioVisualizerBox.classList.remove('playing');
      if (audioStatusText) {
        audioStatusText.innerHTML = '✅ Reproducción finalizada. Pulsa el botón para escuchar de nuevo.';
      }
    };

    audioAmbientPlayer.play().catch(e => {
      console.log('Autoplay de audio requirió interacción del usuario', e);
    });
  }

  if (audioStatusText) {
    audioStatusText.innerHTML = '▶ <strong>Reproduciendo audio ambiental en directo (' + duration + ' segundos).</strong>';
  }
  if (audioLastReceivedTime) {
    const timeDisplay = timestamp ? new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    audioLastReceivedTime.textContent = 'Último audio recibido: ' + timeDisplay;
  }

  playAlertSound();
  showToast('🎙️ ¡Audio ambiental recibido con éxito! Reproduciendo...', 'success');
}

// ----------------------------------------------------------------
// Geofences Management (Colegio, Casa, Parques)
// ----------------------------------------------------------------
async function fetchAndRenderGeofences() {
  if (!leafletMap) return;

  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/geofences`);
    if (res.ok) {
      const geofences = await res.json();
      renderGeofencesOnMap(geofences);
    }
  } catch (err) {
    console.error('Error cargando geocercas:', err);
  }
}

function clearGeofencesFromMap() {
  leafletGeofencesLayers.forEach(layer => {
    if (leafletMap) leafletMap.removeLayer(layer);
  });
  leafletGeofencesLayers = [];
}

function renderGeofencesOnMap(geofences) {
  clearGeofencesFromMap();
  if (!areGeofencesVisible || !leafletMap || !Array.isArray(geofences)) return;

  geofences.forEach(geo => {
    const isSchool = geo.name.toLowerCase().includes('colegio') || geo.name.toLowerCase().includes('escuela');
    const isHome = geo.name.toLowerCase().includes('casa') || geo.name.toLowerCase().includes('hogar');
    const color = isSchool ? '#3b82f6' : (isHome ? '#10b981' : '#f59e0b');

    const circle = L.circle([geo.latitude, geo.longitude], {
      radius: geo.radiusMeters || 200,
      color: color,
      fillColor: color,
      fillOpacity: 0.18,
      weight: 2,
      dashArray: '4, 4'
    }).addTo(leafletMap);

    circle.bindPopup(`<b>${geo.name}</b><br>Radio seguro: ${geo.radiusMeters}m<br><span style="font-size:0.75rem; color:#94a3b8;">Alertas activas: Entrada y Salida</span>`);

    leafletGeofencesLayers.push(circle);
  });
}

function toggleGeofencesVisibility() {
  areGeofencesVisible = !areGeofencesVisible;
  const btnToggleGeofences = document.getElementById('btnToggleGeofences');
  if (btnToggleGeofences) {
    btnToggleGeofences.style.opacity = areGeofencesVisible ? '1' : '0.6';
  }
  if (areGeofencesVisible) {
    fetchAndRenderGeofences();
    showToast('🏫 Mostrando zonas seguras y geocercas en el mapa', 'info');
  } else {
    clearGeofencesFromMap();
    showToast('Zonas seguras ocultadas', 'info');
  }
}

// ----------------------------------------------------------------
// Gestor Interactivo de Lugares y Geocercas (Escuela, Casa, Familiares)
// ----------------------------------------------------------------
let modalGeofencesList = [];

function openGeofenceManagerModal() {
  if (!currentDevice) {
    showToast('Selecciona primero un dispositivo para definir lugares seguros', 'warning');
    return;
  }
  const modal = document.getElementById('modalGeofenceManager');
  if (!modal) return;

  // Precargar coordenadas si están disponibles
  const latInput = document.getElementById('inputGeofenceLat');
  const lngInput = document.getElementById('inputGeofenceLng');
  if (currentDevice.location && typeof currentDevice.location.latitude === 'number') {
    if (latInput) latInput.value = currentDevice.location.latitude;
    if (lngInput) lngInput.value = currentDevice.location.longitude;
  } else {
    if (latInput && !latInput.value) latInput.value = -33.4420;
    if (lngInput && !lngInput.value) lngInput.value = -70.6550;
  }

  loadAndRenderGeofencesInModal();
  modal.classList.add('active');
}

function closeGeofenceManagerModal() {
  const modal = document.getElementById('modalGeofenceManager');
  if (modal) modal.classList.remove('active');
}

async function loadAndRenderGeofencesInModal() {
  const listContainer = document.getElementById('geofencesSavedList');
  if (!listContainer || !currentDevice) return;

  listContainer.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 12px 0;">Cargando lugares...</div>';

  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/geofences`);
    if (res.ok) {
      modalGeofencesList = await res.json();
      renderGeofencesListInModal(modalGeofencesList);
      if (areGeofencesVisible && leafletMap) {
        renderGeofencesOnMap(modalGeofencesList);
      }
    }
  } catch (err) {
    console.error('Error cargando lista de geocercas:', err);
    listContainer.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Error al cargar geocercas</div>';
  }
}

function renderGeofencesListInModal(geofences) {
  const listContainer = document.getElementById('geofencesSavedList');
  if (!listContainer) return;

  if (!geofences || geofences.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 10px; color: #94a3b8; font-size: 0.85rem;">
        No hay lugares guardados para este teléfono aún. Completa el formulario arriba para agregar Escuela, Casa u otros lugares.
      </div>
    `;
    return;
  }

  listContainer.innerHTML = geofences.map(geo => {
    const isSchool = geo.name.toLowerCase().includes('colegio') || geo.name.toLowerCase().includes('escuela');
    const isHome = geo.name.toLowerCase().includes('casa') || geo.name.toLowerCase().includes('hogar');
    const icon = isSchool ? '🏫' : (isHome ? '🏠' : (geo.name.includes('⚽') ? '⚽' : (geo.name.includes('👵') ? '👵' : '📍')));
    
    return `
      <div class="geofence-saved-item" id="geoItem-${geo.id}">
        <div class="geofence-item-meta">
          <div class="geofence-item-icon">${icon}</div>
          <div>
            <h5 class="geofence-item-name">${geo.name}</h5>
            <p class="geofence-item-sub">Radio: ${geo.radiusMeters || 200}m • Coords: ${Number(geo.latitude).toFixed(4)}, ${Number(geo.longitude).toFixed(4)}</p>
          </div>
        </div>
        <button class="btn btn-danger-outline btn-sm" onclick="deleteGeofenceItem('${geo.id}')" title="Eliminar lugar seguro">
          🗑️ Eliminar
        </button>
      </div>
    `;
  }).join('');
}

async function saveNewGeofence() {
  if (!currentDevice) return;

  const nameInput = document.getElementById('inputGeofenceName');
  const latInput = document.getElementById('inputGeofenceLat');
  const lngInput = document.getElementById('inputGeofenceLng');
  const radiusInput = document.getElementById('rangeGeofenceRadius');
  const checkEntry = document.getElementById('checkGeofenceAlertEntry');
  const checkExit = document.getElementById('checkGeofenceAlertExit');

  const name = nameInput ? nameInput.value.trim() : '';
  const lat = parseFloat(latInput ? latInput.value : 0);
  const lng = parseFloat(lngInput ? lngInput.value : 0);
  const radius = parseInt(radiusInput ? radiusInput.value : 250, 10);
  const alertOnEntry = checkEntry ? checkEntry.checked : true;
  const alertOnExit = checkExit ? checkExit.checked : true;

  if (!name) {
    alert('Por favor ingresa un nombre para el lugar seguro (ej: Colegio, Casa)');
    return;
  }
  if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
    alert('Por favor ingresa coordenadas GPS válidas o pulsa "🎯 Usar Posición Actual"');
    return;
  }

  try {
    const payload = {
      id: `GEO-${Date.now()}`,
      name,
      latitude: lat,
      longitude: lng,
      radiusMeters: radius,
      alertOnEntry,
      alertOnExit
    };

    const res = await apiFetch(`/api/devices/${currentDevice.id}/geofences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast(`Lugar seguro "${name}" guardado con éxito`, 'success');
      if (nameInput) nameInput.value = '';
      await loadAndRenderGeofencesInModal();
      if (typeof fetchAndRenderGeofences === 'function') {
        fetchAndRenderGeofences();
      }
    } else {
      alert('Error al guardar el lugar. Revisa los datos.');
    }
  } catch (err) {
    console.error('Error guardando geocerca:', err);
    alert('Error de conexión al guardar el lugar.');
  }
}

async function deleteGeofenceItem(geoId) {
  if (!currentDevice) return;
  if (!confirm('¿Deseas eliminar este lugar seguro?')) return;

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/geofences/${geoId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      showToast('Lugar eliminado correctamente', 'info');
      await loadAndRenderGeofencesInModal();
      if (typeof fetchAndRenderGeofences === 'function') {
        fetchAndRenderGeofences();
      }
    }
  } catch (err) {
    console.error('Error eliminando geocerca:', err);
  }
}

// ----------------------------------------------------------------
// Sincronización de Selectores Contextuales de Hijo
// ----------------------------------------------------------------
function syncChildContextSelectors() {
  const selectIds = [
    'overviewLiveDeviceSelect',
    'mapDeviceSelect',
    'multimediaDeviceSelect',
    'historyDeviceSelect',
    'settingsDeviceSelect',
    'deviceSelectorDropdown'
  ];

  selectIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    const currentVal = currentDevice ? currentDevice.id : '';
    el.innerHTML = '';

    if (!devicesList || devicesList.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '📱 Sin dispositivos vinculados';
      el.appendChild(opt);
      return;
    }

    devicesList.forEach(dev => {
      const opt = document.createElement('option');
      opt.value = dev.id;
      const statusIcon = dev.isOnline ? '🟢' : '⚪';
      opt.textContent = `${dev.avatar || '📱'} ${dev.childName || dev.name} (${statusIcon})`;
      if (dev.id === currentVal) opt.selected = true;
      el.appendChild(opt);
    });

    el.value = currentVal;
  });

  const viewerName = document.getElementById('currentViewerChildName');
  if (viewerName && currentDevice) {
    viewerName.textContent = currentDevice.childName || currentDevice.name || 'Hijo';
  }
}

// Route History Tracking (GPS Path)
function toggleRouteHistory() {
  isRouteHistoryVisible = !isRouteHistoryVisible;
  const btnRouteHistoryText = document.getElementById('btnRouteHistoryText');

  if (isRouteHistoryVisible) {
    if (routeHistoryPanel) routeHistoryPanel.style.display = 'block';
    if (btnRouteHistoryText) btnRouteHistoryText.textContent = 'Ocultar Ruta';
    fetchAndRenderRouteHistory();
    showToast('🗺️ Trazando línea de ruta histórica del dispositivo', 'info');
  } else {
    if (routeHistoryPanel) routeHistoryPanel.style.display = 'none';
    if (btnRouteHistoryText) btnRouteHistoryText.textContent = 'Trazar Ruta';
    clearRouteHistoryFromMap();
  }
}

async function fetchAndRenderRouteHistory() {
  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/location-history`);
    if (res.ok) {
      const history = await res.json();
      renderRouteHistoryOnMap(history);
      return;
    }
  } catch (err) {
    console.error('Error al obtener historial de ruta GPS', err);
  }

  // Fallback si no hay historial aún: crear un punto con la posición actual
  if (currentDevice.location && currentDevice.location.latitude) {
    renderRouteHistoryOnMap([currentDevice.location]);
  }
}

function clearRouteHistoryFromMap() {
  if (leafletRoutePolyline && leafletMap) {
    leafletMap.removeLayer(leafletRoutePolyline);
    leafletRoutePolyline = null;
  }
  leafletRouteMarkers.forEach(m => leafletMap && leafletMap.removeLayer(m));
  leafletRouteMarkers = [];
}

function renderRouteHistoryOnMap(points) {
  clearRouteHistoryFromMap();
  if (!points || !points.length) {
    if (routeHistoryItemsList) {
      routeHistoryItemsList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.78rem;">No hay registros de ruta previos para hoy.</div>';
    }
    if (routePointsCountBadge) routePointsCountBadge.textContent = '0 posiciones';
    return;
  }

  if (routePointsCountBadge) {
    routePointsCountBadge.textContent = `${points.length} puntos registrados`;
  }

  const latlngs = points
    .filter(p => typeof p.latitude === 'number' && typeof p.longitude === 'number')
    .map(p => [p.latitude, p.longitude]);

  if (latlngs.length >= 2 && leafletMap && typeof L !== 'undefined') {
    // Trazar línea de ruta en verde esmeralda con guiones dinámicos
    leafletRoutePolyline = L.polyline(latlngs, {
      color: '#10b981',
      weight: 4,
      opacity: 0.85,
      dashArray: '6, 8',
      lineCap: 'round'
    }).addTo(leafletMap);

    // Marcador de Inicio de Ruta
    const startPoint = latlngs[0];
    const startMarker = L.circleMarker(startPoint, {
      radius: 6,
      fillColor: '#60a5fa',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(leafletMap).bindPopup('🏁 Inicio de recorrido');
    leafletRouteMarkers.push(startMarker);

    // Ajustar zoom para mostrar la ruta completa
    leafletMap.fitBounds(leafletRoutePolyline.getBounds(), { padding: [30, 30] });
  }

  // Renderizar la lista de puntos en el panel
  if (routeHistoryItemsList) {
    routeHistoryItemsList.innerHTML = '';
    const reversed = [...points].reverse(); // Más recientes primero
    reversed.slice(0, 10).forEach((pt, idx) => {
      const item = document.createElement('div');
      item.className = 'route-point-item';
      const timeStr = pt.timestamp ? new Date(pt.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'Reciente';
      item.innerHTML = `
        <span class="route-point-time">⏱️ ${timeStr}</span>
        <span class="route-point-coord">${pt.address || `${pt.latitude.toFixed(4)}, ${pt.longitude.toFixed(4)}`}</span>
      `;
      routeHistoryItemsList.appendChild(item);
    });
  }
}

// Administrator Authentication & Session Management
async function initAdminAuth() {
  if (!adminAuthToken) {
    setAdminLoggedOutUI();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${adminAuthToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      adminUser = data.user;
      setAdminLoggedInUI(adminUser);
      return;
    }
  } catch (err) {
    console.warn('Error validando token de administrador', err);
  }

  logoutAdmin();
}

let googleAuthConfig = { isGoogleConfigured: false, googleClientId: '' };

// Trigger Google Authentication (Login or Register)
async function triggerGoogleAuth(isRegister = false) {
  // If official Google Identity Services is configured with a valid Client ID
  if (googleAuthConfig.isGoogleConfigured && googleAuthConfig.googleClientId && window.google && window.google.accounts && window.google.accounts.id) {
    try {
      window.google.accounts.id.initialize({
        client_id: googleAuthConfig.googleClientId,
        callback: (response) => window.handleGoogleLoginCallback(response, isRegister),
        auto_prompt: false
      });
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          console.log('[Google Auth] GIS prompt skipped/closed:', notification.getNotDisplayedReason ? notification.getNotDisplayedReason() : notification);
        }
      });
      return;
    } catch (gErr) {
      console.warn('[Google Auth] Error inicializando prompt nativo de Google:', gErr);
    }
  }

  // Si no está configurado el Client ID de Google Cloud todavía:
  const setupPanel = document.getElementById('googleSetupPanel');
  if (setupPanel) {
    setupPanel.style.display = 'block';
    const input = document.getElementById('inputGoogleClientIdModal');
    if (input) input.focus();
  }

  showToast('ℹ️ Para usar Google con tu cuenta real (@gmail.com), ingresa tu Google Client ID o regístrate directamente abajo con tu correo y contraseña.', 'info');
}

// Save Google Client ID from Auth Modal
async function saveGoogleClientIdFromModal() {
  const input = document.getElementById('inputGoogleClientIdModal');
  const clientId = input ? input.value.trim() : '';
  if (!clientId || !clientId.includes('.apps.googleusercontent.com')) {
    showToast('Ingresa un Client ID de Google válido (debe terminar en .apps.googleusercontent.com)', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/google-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId })
    });
    if (res.ok) {
      const data = await res.json();
      googleAuthConfig.isGoogleConfigured = true;
      googleAuthConfig.googleClientId = data.googleClientId;
      showToast('✅ ¡Google Client ID guardado con éxito! Abriendo Google...', 'success');
      const setupPanel = document.getElementById('googleSetupPanel');
      if (setupPanel) setupPanel.style.display = 'none';
      await initGoogleAuth();
      triggerGoogleAuth(false);
    } else {
      showToast('Error al guardar el Google Client ID', 'danger');
    }
  } catch (err) {
    console.error('Error guardando Client ID:', err);
    showToast('Error de conexión al guardar Client ID', 'danger');
  }
}

// Initialize Google Sign-in dynamically
async function initGoogleAuth() {
  try {
    const res = await fetch('/api/auth/config');
    if (res.ok) {
      const config = await res.json();
      googleAuthConfig = config;
      if (inputGoogleClientId && config.googleClientId) {
        inputGoogleClientId.value = config.googleClientId;
      }
      if (config.isGoogleConfigured && config.googleClientId) {
        if (googleStatusBadge) {
          googleStatusBadge.textContent = 'Google Activo';
          googleStatusBadge.className = 'badge badge-accent';
        }

        const renderGisButtons = () => {
          if (!window.google || !window.google.accounts || !window.google.accounts.id) return false;

          const wrapperLogin = document.getElementById('googleOfficialButtonWrapperLogin');
          const wrapperRegister = document.getElementById('googleOfficialButtonWrapperRegister');
          if (wrapperLogin) wrapperLogin.style.display = 'flex';
          if (wrapperRegister) wrapperRegister.style.display = 'flex';
          if (btnLoginWithGoogle) btnLoginWithGoogle.style.display = 'none';
          if (btnRegisterWithGoogle) btnRegisterWithGoogle.style.display = 'none';

          window.google.accounts.id.initialize({
            client_id: config.googleClientId,
            callback: (response) => window.handleGoogleLoginCallback(response, false),
            auto_prompt: false
          });
          const mountLogin = document.getElementById('googleButtonMountLogin');
          if (mountLogin) {
            mountLogin.innerHTML = '';
            window.google.accounts.id.renderButton(mountLogin, {
              theme: 'filled_blue',
              size: 'large',
              text: 'sign_in_with',
              shape: 'rectangular',
              width: 320
            });
          }
          const mountRegister = document.getElementById('googleButtonMountRegister');
          if (mountRegister) {
            mountRegister.innerHTML = '';
            window.google.accounts.id.renderButton(mountRegister, {
              theme: 'filled_blue',
              size: 'large',
              text: 'signup_with',
              shape: 'rectangular',
              width: 320
            });
          }
          return true;
        };

        if (!renderGisButtons()) {
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (renderGisButtons() || attempts > 20) {
              clearInterval(interval);
            }
          }, 250);
        }
      } else {
        if (googleStatusBadge) {
          googleStatusBadge.textContent = 'Requiere Client ID';
          googleStatusBadge.className = 'badge badge-warning';
        }
        const wrapperLogin = document.getElementById('googleOfficialButtonWrapperLogin');
        const wrapperRegister = document.getElementById('googleOfficialButtonWrapperRegister');
        if (wrapperLogin) wrapperLogin.style.display = 'none';
        if (wrapperRegister) wrapperRegister.style.display = 'none';
        if (btnLoginWithGoogle) btnLoginWithGoogle.style.display = 'flex';
        if (btnRegisterWithGoogle) btnRegisterWithGoogle.style.display = 'flex';
      }
    }
  } catch (err) {
    console.warn('Error cargando configuración de Google Auth', err);
  }
}

// Save Custom Google Client ID
async function saveCustomGoogleClientId() {
  const clientId = inputGoogleClientId ? inputGoogleClientId.value.trim() : '';
  if (!clientId) {
    alert('Ingresa un Client ID de Google válido.');
    return;
  }
  try {
    const res = await fetch('/api/auth/google-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId })
    });
    if (res.ok) {
      showToast('Client ID de Google guardado correctamente', 'success');
      await initGoogleAuth();
    } else {
      showToast('Error guardando Client ID', 'danger');
    }
  } catch (err) {
    console.error('Error guardando Client ID', err);
    showToast('Error de conexión', 'danger');
  }
}

// Google Identity Services Login / Register Callback
window.handleGoogleLoginCallback = async function(response, isRegister = false) {
  if (!response || !response.credential) return;

  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential, isRegister })
    });
    if (res.ok) {
      const data = await res.json();
      adminAuthToken = data.token;
      adminUser = data.user;
      localStorage.setItem('kidsshield_admin_token', adminAuthToken);
      if (data.subscription) {
        currentSubscription = data.subscription;
        updateSubscriptionUI();
      } else {
        await loadSubscriptionInfo();
      }
      setAdminLoggedInUI(adminUser, currentSubscription);
      showToast(data.message || `¡Bienvenido/a ${adminUser.name}!`, 'success');
      modalAdminLogin.classList.remove('active');
    } else {
      const err = await res.json();
      showToast(`Error al autenticar con Google: ${err.error || 'Credencial inválida'}`, 'danger');
    }
  } catch (err) {
    console.error('Error en callback de Google', err);
    showToast('Error de autenticación Google', 'danger');
  }
};

function logoutAdmin() {
  adminAuthToken = null;
  adminUser = null;
  localStorage.removeItem('kidsshield_admin_token');
  setAdminLoggedOutUI();
  showToast('Sesión cerrada correctamente', 'info');
}

// Email & Password Login
async function loginWithEmailPassword() {
  const email = loginEmailInput ? loginEmailInput.value.trim() : '';
  const password = loginPasswordInput ? loginPasswordInput.value : '';

  if (!email || !password) {
    showToast('Por favor ingresa tu correo y contraseña.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (res.ok) {
      const data = await res.json();
      adminAuthToken = data.token;
      adminUser = data.user;
      localStorage.setItem('kidsshield_admin_token', adminAuthToken);
      setAdminLoggedInUI(adminUser, data.subscription);
      showToast(`¡Bienvenido/a de nuevo, ${adminUser.name}!`, 'success');
      modalAdminLogin.classList.remove('active');
    } else {
      const err = await res.json();
      showToast(err.error || 'Credenciales incorrectas. Verifica tu correo y contraseña.', 'danger');
    }
  } catch (err) {
    console.error('Error al iniciar sesión con email', err);
    showToast('Error de conexión con el servidor', 'danger');
  }
}

// Register Family Account (Email & Password)
async function registerFamilyAccount() {
  const name = regNameInput ? regNameInput.value.trim() : '';
  const email = regEmailInput ? regEmailInput.value.trim() : '';
  const password = regPasswordInput ? regPasswordInput.value : '';

  if (!name || !email || !password) {
    showToast('Por favor completa todos los campos del formulario.', 'warning');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('Ingresa un correo electrónico válido (ej: nombre@dominio.com).', 'warning');
    return;
  }

  if (password.length < 8) {
    showToast('Por seguridad, la contraseña debe tener al menos 8 caracteres.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    if (res.ok) {
      const data = await res.json();
      adminAuthToken = data.token;
      adminUser = data.user;
      localStorage.setItem('kidsshield_admin_token', adminAuthToken);
      await loadSubscriptionInfo();
      setAdminLoggedInUI(adminUser);
      showToast(`🎉 ¡Familia registrada con éxito! Prueba Pro de 14 días activa.`, 'success');
      modalAdminLogin.classList.remove('active');
    } else {
      const err = await res.json();
      showToast(err.error || 'Error al registrar cuenta. Intente nuevamente.', 'danger');
    }
  } catch (err) {
    console.error('Error al registrar familia', err);
    showToast('Error de conexión al registrar', 'danger');
  }
}

// ----------------------------------------------------------------
// Forgot Password & Reset Password Management
// ----------------------------------------------------------------
let activeResetToken = null;

function openForgotPasswordModal() {
  const modal = document.getElementById('modalForgotPassword');
  const emailInput = document.getElementById('forgotEmailInput');
  const formBox = document.getElementById('forgotFormContainer');
  const successBox = document.getElementById('forgotSuccessContainer');
  const previewBox = document.getElementById('forgotEmailPreviewBox');

  if (formBox) formBox.style.display = 'block';
  if (successBox) successBox.style.display = 'none';
  if (previewBox) previewBox.style.display = 'none';

  const loginEmail = document.getElementById('portalLoginEmail')?.value.trim();
  if (emailInput) {
    emailInput.value = loginEmail || '';
    setTimeout(() => emailInput.focus(), 150);
  }

  if (modalAdminLogin) modalAdminLogin.classList.remove('active');
  if (modal) modal.classList.add('active');
}

function closeForgotPasswordModal() {
  const modal = document.getElementById('modalForgotPassword');
  if (modal) modal.classList.remove('active');
}

function backToLoginFromForgot() {
  closeForgotPasswordModal();
  switchView('portal', 'portalAuthCard');
  const loginEmail = document.getElementById('portalLoginEmail');
  const forgotEmail = document.getElementById('forgotEmailInput');
  if (loginEmail && forgotEmail && forgotEmail.value) {
    loginEmail.value = forgotEmail.value;
  }
}

async function submitForgotPassword() {
  const emailInput = document.getElementById('forgotEmailInput');
  const submitBtn = document.getElementById('btnSubmitForgotPassword');
  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    showToast('Ingresa tu correo electrónico.', 'warning');
    if (emailInput) emailInput.focus();
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showToast('Ingresa un correo electrónico con formato válido.', 'warning');
    if (emailInput) emailInput.focus();
    return;
  }

  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Enviando correo...</span>';
  }

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      const formBox = document.getElementById('forgotFormContainer');
      const successBox = document.getElementById('forgotSuccessContainer');
      const msgEl = document.getElementById('forgotSuccessMessage');
      const previewBox = document.getElementById('forgotEmailPreviewBox');
      const previewLink = document.getElementById('linkOpenEmailPreview');
      const simBtn = document.getElementById('btnSimulateResetLink');

      if (formBox) formBox.style.display = 'none';
      if (successBox) successBox.style.display = 'block';
      if (msgEl && data.message) msgEl.textContent = data.message;

      if (data.previewUrl) {
        if (previewBox) previewBox.style.display = 'block';
        if (previewLink) previewLink.href = data.previewUrl;
      }

      if (data.resetUrl) {
        const match = data.resetUrl.match(/reset_token=([^&]+)/);
        const extractedToken = match ? match[1] : null;
        if (simBtn && extractedToken) {
          simBtn.onclick = () => {
            closeForgotPasswordModal();
            openResetPasswordModal(extractedToken, email);
          };
        }
      }

      showToast('✉️ Correo de recuperación enviado', 'success');
    } else {
      showToast(data.error || 'No se pudo enviar el correo de recuperación', 'danger');
    }
  } catch (err) {
    console.error('Error enviando correo de recuperación:', err);
    showToast('Error de conexión al enviar el correo', 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }
}

function openResetPasswordModal(token, emailHint = '') {
  activeResetToken = token;
  const modal = document.getElementById('modalResetPassword');
  const emailDisplay = document.getElementById('resetTargetEmailDisplay');
  const formBox = document.getElementById('resetFormContainer');
  const successBox = document.getElementById('resetSuccessContainer');
  const newPassInput = document.getElementById('resetNewPassword');
  const confirmPassInput = document.getElementById('resetConfirmPassword');

  if (emailDisplay) emailDisplay.textContent = emailHint || 'Tu cuenta familiar';
  if (newPassInput) newPassInput.value = '';
  if (confirmPassInput) confirmPassInput.value = '';
  if (formBox) formBox.style.display = 'block';
  if (successBox) successBox.style.display = 'none';

  if (modal) modal.classList.add('active');
  if (newPassInput) setTimeout(() => newPassInput.focus(), 150);
}

function closeResetPasswordModal() {
  const modal = document.getElementById('modalResetPassword');
  if (modal) modal.classList.remove('active');
  activeResetToken = null;
}

async function submitResetPassword() {
  if (!activeResetToken) {
    showToast('El token de restablecimiento es inválido o no existe.', 'warning');
    return;
  }

  const newPassInput = document.getElementById('resetNewPassword');
  const confirmPassInput = document.getElementById('resetConfirmPassword');
  const submitBtn = document.getElementById('btnSubmitResetPassword');

  const password = newPassInput ? newPassInput.value : '';
  const confirmPassword = confirmPassInput ? confirmPassInput.value : '';

  if (!password) {
    showToast('Ingresa la nueva contraseña.', 'warning');
    if (newPassInput) newPassInput.focus();
    return;
  }

  if (password.length < 8) {
    showToast('La nueva contraseña debe tener al menos 8 caracteres.', 'warning');
    if (newPassInput) newPassInput.focus();
    return;
  }

  if (password !== confirmPassword) {
    showToast('Las contraseñas no coinciden. Verifica e intenta nuevamente.', 'warning');
    if (confirmPassInput) confirmPassInput.focus();
    return;
  }

  const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ Guardando nueva contraseña...</span>';
  }

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: activeResetToken, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      const formBox = document.getElementById('resetFormContainer');
      const successBox = document.getElementById('resetSuccessContainer');
      if (formBox) formBox.style.display = 'none';
      if (successBox) successBox.style.display = 'block';

      // Prellenar el login con el correo actualizado
      const loginEmail = document.getElementById('portalLoginEmail');
      if (loginEmail && data.email) {
        loginEmail.value = data.email;
      }

      // Limpiar el parámetro de la URL sin recargar
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      showToast('🎉 ¡Contraseña restablecida con éxito!', 'success');
    } else {
      showToast(data.error || 'Error al restablecer la contraseña', 'danger');
    }
  } catch (err) {
    console.error('Error al restablecer contraseña:', err);
    showToast('Error de conexión con el servidor', 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnHtml;
    }
  }
}

function toggleResetPasswordVisibility() {
  const input = document.getElementById('resetNewPassword');
  const btn = document.getElementById('btnToggleResetPasswordView');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btn) btn.textContent = '🙈';
  } else {
    input.type = 'password';
    if (btn) btn.textContent = '👁️';
  }
}

async function checkUrlResetToken() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('reset_token');
    if (!token) return;

    console.log('[Auth] 🔑 Token de recuperación detectado en la URL:', token);

    const res = await fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
    const data = await res.json();

    if (res.ok && data.valid) {
      openResetPasswordModal(token, data.email);
      showToast(`Bienvenido/a ${data.userName || ''}. Define tu nueva contraseña.`, 'info');
    } else {
      showToast(data.error || 'El enlace de recuperación ha expirado o no es válido.', 'warning');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  } catch (e) {
    console.warn('Error verificando token desde URL:', e);
  }
}

// Load Subscription & Plans Info
async function loadSubscriptionInfo() {
  try {
    const headers = {};
    if (adminAuthToken) headers['Authorization'] = `Bearer ${adminAuthToken}`;

    const res = await fetch('/api/subscription', { headers });
    if (res.ok) {
      const data = await res.json();
      currentSubscription = data.currentSubscription || { plan: 'pro', maxDevices: 5 };
      updateSubscriptionUI();
    }
  } catch (err) {
    console.warn('Error cargando información de suscripción', err);
  }
}

function updateSubscriptionUI() {
  const plan = currentSubscription.plan || 'pro';
  const planNames = {
    'free': 'Plan Gratuito',
    'pro': 'Familiar Pro ⚡',
    'family_total': 'Familia Total VIP 💎'
  };

  const displayName = planNames[plan] || 'Familiar Pro ⚡';

  if (headerPlanName) {
    headerPlanName.textContent = displayName;
  }
  if (adminProfilePlanText) {
    adminProfilePlanText.textContent = displayName;
  }
  if (adminProfileDeviceLimitText) {
    adminProfileDeviceLimitText.textContent = `Hasta ${currentSubscription.maxDevices || 5} dispositivos`;
  }

  // Actualizar tarjeta de familia en Sidebar
  const sidebarFamilyPlan = document.getElementById('sidebarFamilyPlan');
  const sidebarBtnUpgradePlan = document.getElementById('sidebarBtnUpgradePlan');

  if (sidebarFamilyPlan) {
    sidebarFamilyPlan.textContent = displayName;
    sidebarFamilyPlan.className = 'sidebar-family-plan-badge';
    if (plan === 'family_total') {
      sidebarFamilyPlan.classList.add('plan-vip');
    } else if (plan === 'pro') {
      sidebarFamilyPlan.classList.add('plan-pro');
    } else {
      sidebarFamilyPlan.classList.add('plan-free');
    }
  }

  if (sidebarBtnUpgradePlan) {
    sidebarBtnUpgradePlan.className = 'sidebar-btn-upgrade';
    if (plan === 'free') {
      sidebarBtnUpgradePlan.innerHTML = '⚡ Mejorar';
      sidebarBtnUpgradePlan.title = 'Mejora a Familiar Pro para más dispositivos y video';
      sidebarBtnUpgradePlan.classList.add('btn-upgrade-highlight');
      sidebarBtnUpgradePlan.style.display = 'inline-flex';
    } else if (plan === 'pro') {
      sidebarBtnUpgradePlan.innerHTML = '⭐ Subir a VIP';
      sidebarBtnUpgradePlan.title = 'Mejora a Familia Total VIP (10 dispositivos y geocercas ilimitadas)';
      sidebarBtnUpgradePlan.classList.add('btn-upgrade-highlight');
      sidebarBtnUpgradePlan.style.display = 'inline-flex';
    } else {
      sidebarBtnUpgradePlan.innerHTML = 'Gestionar';
      sidebarBtnUpgradePlan.title = 'Administrar suscripción VIP';
      sidebarBtnUpgradePlan.style.display = 'inline-flex';
    }
  }

  // Actualizar vista Mi Familia
  const familyPlanBadge = document.getElementById('familyPlanBadge');
  if (familyPlanBadge) {
    familyPlanBadge.textContent = displayName;
  }

  const btnFamilyUpgradePlan = document.getElementById('btnFamilyUpgradePlan');
  if (btnFamilyUpgradePlan) {
    if (plan === 'free') {
      btnFamilyUpgradePlan.textContent = '⚡ Mejorar Plan';
      btnFamilyUpgradePlan.style.display = 'inline-block';
    } else if (plan === 'pro') {
      btnFamilyUpgradePlan.textContent = '⭐ Mejorar a VIP';
      btnFamilyUpgradePlan.style.display = 'inline-block';
    } else {
      btnFamilyUpgradePlan.style.display = 'none';
    }
  }

  // Actualizar sección de Configuraciones -> Facturación
  const billingPlanBadge = document.getElementById('billingPlanBadge');
  if (billingPlanBadge) {
    billingPlanBadge.textContent = displayName;
  }

  const billingDevicesQuotaText = document.getElementById('billingDevicesQuotaText');
  if (billingDevicesQuotaText) {
    billingDevicesQuotaText.textContent = `Hasta ${currentSubscription.maxDevices || 5} teléfonos o tablets`;
  }

  // Highlight active plan in modal
  const allCards = [
    { card: document.getElementById('cardPlanFree'), btn: btnSelectPlanFree, planId: 'free' },
    { card: document.getElementById('cardPlanPro'), btn: btnSelectPlanPro, planId: 'pro' },
    { card: document.getElementById('cardPlanFamilyTotal'), btn: btnSelectPlanFamilyTotal, planId: 'family_total' }
  ];

  allCards.forEach(item => {
    if (!item.card || !item.btn) return;
    if (item.planId === plan) {
      item.btn.textContent = '✓ Plan Activo';
      item.btn.className = 'btn btn-plan-select btn-plan-active';
    } else {
      item.btn.className = item.planId === 'pro' ? 'btn btn-primary btn-plan-select' : 'btn btn-outline btn-plan-select';
      item.btn.textContent = item.planId === 'free' ? 'Cambiar a Gratuito' : item.planId === 'pro' ? 'Elegir Familiar Pro' : 'Elegir Familia Total';
    }
  });

  // Cargar detalles de facturación si existe la sección
  loadBillingAndPaymentDetails();
}

// Cargar información de tarjeta bancaria, facturación y auto_renew
async function loadBillingAndPaymentDetails() {
  try {
    const headers = {};
    if (adminAuthToken) headers['Authorization'] = `Bearer ${adminAuthToken}`;
    const res = await fetch('/api/subscription/billing', { headers });
    if (!res.ok) return;
    const data = await res.json();
    
    if (data.paymentDetails) {
      const { cardLast4, cardBrand, cardExp, cardHolder, autoRenew } = data.paymentDetails;
      
      const cardBrandBadge = document.getElementById('creditCardBrandBadge');
      if (cardBrandBadge) cardBrandBadge.textContent = (cardBrand || 'Visa').toUpperCase();
      
      const cardNumberDisplay = document.getElementById('creditCardNumberDisplay');
      if (cardNumberDisplay) cardNumberDisplay.textContent = `•••• •••• •••• ${cardLast4 || '4242'}`;
      
      const cardHolderDisplay = document.getElementById('creditCardHolderDisplay');
      if (cardHolderDisplay) cardHolderDisplay.textContent = cardHolder || 'Sebastián Briones';
      
      const cardExpDisplay = document.getElementById('creditCardExpDisplay');
      if (cardExpDisplay) cardExpDisplay.textContent = cardExp || '12/28';
      
      const paymentSummary = document.getElementById('billingPaymentSummaryText');
      if (paymentSummary) paymentSummary.textContent = `${cardBrand || 'Visa'} terminada en •••• ${cardLast4 || '4242'}`;
      
      const autoRenewSwitch = document.getElementById('toggleAutoRenewSwitch');
      if (autoRenewSwitch) autoRenewSwitch.checked = Boolean(autoRenew);
      
      const autoRenewDesc = document.getElementById('autoRenewStatusDesc');
      if (autoRenewDesc) {
        autoRenewDesc.textContent = autoRenew 
          ? 'Activa (Próximo cobro automático el 11/10/2026)' 
          : 'Pausada (Tu servicio se mantendrá activo hasta fin de ciclo sin cobros automáticos)';
        autoRenewDesc.style.color = autoRenew ? '#34d399' : '#f87171';
      }
    }

    if (data.invoices && Array.isArray(data.invoices)) {
      renderBillingInvoices(data.invoices);
    }
  } catch (e) {
    console.warn('Error cargando detalles de facturación:', e);
  }
}

function renderBillingInvoices(invoices) {
  const container = document.getElementById('billingInvoicesList');
  if (!container) return;
  
  if (invoices.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 6px 0;">Sin pagos registrados aún.</div>';
    return;
  }

  container.innerHTML = invoices.map(inv => `
    <div class="invoice-item-row">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.1rem;">🧾</span>
        <div>
          <div style="font-weight: 600; color: #fff;">${inv.description}</div>
          <div style="font-size: 0.75rem; color: #94a3b8;">${inv.date} • ${inv.id} • ${inv.paymentMethod}</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-weight: 700; color: #38bdf8;">${inv.amount}</span>
        <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 0.72rem;">✓ ${inv.status}</span>
        <button type="button" class="btn btn-outline btn-sm" onclick="showToast('Comprobante ${inv.id} descargado en PDF', 'info')" style="padding: 4px 8px; font-size: 0.72rem;">
          📄 Recibo
        </button>
      </div>
    </div>
  `).join('');
}

async function handleToggleAutoRenew(e) {
  const isChecked = e.target.checked;
  const autoRenewDesc = document.getElementById('autoRenewStatusDesc');
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (adminAuthToken) headers['Authorization'] = `Bearer ${adminAuthToken}`;
    const res = await fetch('/api/subscription/auto-renew', {
      method: 'POST',
      headers,
      body: JSON.stringify({ autoRenew: isChecked })
    });
    if (res.ok) {
      if (autoRenewDesc) {
        autoRenewDesc.textContent = isChecked 
          ? 'Activa (Próximo cobro automático el 11/10/2026)' 
          : 'Pausada (Tu servicio se mantendrá activo hasta fin de ciclo sin cobros automáticos)';
        autoRenewDesc.style.color = isChecked ? '#34d399' : '#f87171';
      }
      showToast(isChecked ? 'Renovación automática activada' : 'Renovación automática pausada', isChecked ? 'success' : 'warning');
    } else {
      e.target.checked = !isChecked;
      showToast('Error al actualizar estado de renovación', 'danger');
    }
  } catch (err) {
    e.target.checked = !isChecked;
    showToast('Error de conexión', 'danger');
  }
}

async function handleSaveCardDetails() {
  const holderInput = document.getElementById('inputCardHolder');
  const numberInput = document.getElementById('inputCardNumber');
  const expInput = document.getElementById('inputCardExp');
  const cvcInput = document.getElementById('inputCardCvc');

  const holder = holderInput ? holderInput.value.trim() : 'Sebastián Briones';
  const number = numberInput ? numberInput.value.trim() : '';
  const exp = expInput ? expInput.value.trim() : '';

  if (!number || number.replace(/\s+/g, '').length < 13) {
    alert('Por favor ingresa un número de tarjeta válido (mínimo 13 a 16 dígitos)');
    return;
  }
  if (!exp || !exp.includes('/')) {
    alert('Por favor ingresa una fecha de expiración válida con formato MM/AA (ej: 12/28)');
    return;
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (adminAuthToken) headers['Authorization'] = `Bearer ${adminAuthToken}`;
    const res = await fetch('/api/subscription/card', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cardNumber: number,
        cardExp: exp,
        cardCvc: cvcInput ? cvcInput.value.trim() : '123',
        cardHolder: holder
      })
    });
    if (res.ok) {
      const modal = document.getElementById('modalUpdateCard');
      if (modal) modal.classList.remove('active');
      showToast('Tarjeta bancaria actualizada con éxito', 'success');
      await loadBillingAndPaymentDetails();
    } else {
      const err = await res.json();
      alert(`Error al guardar tarjeta: ${err.error || 'Intente nuevamente'}`);
    }
  } catch (e) {
    showToast('Error de conexión al actualizar tarjeta', 'danger');
  }
}

// Change Subscription Plan (SaaS Monetization)
async function changeSubscriptionPlan(newPlan) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (adminAuthToken) headers['Authorization'] = `Bearer ${adminAuthToken}`;

    const res = await fetch('/api/subscription/change-plan', {
      method: 'POST',
      headers,
      body: JSON.stringify({ plan: newPlan })
    });
    if (res.ok) {
      const data = await res.json();
      currentSubscription.plan = data.plan;
      currentSubscription.maxDevices = data.maxDevices;
      updateSubscriptionUI();
      modalSubscription.classList.remove('active');
      showToast(`⭐ ¡Plan actualizado a ${newPlan === 'family_total' ? 'Familia Total VIP' : newPlan === 'pro' ? 'Familiar Pro' : 'Plan Gratuito'}!`, 'success');
    } else {
      showToast('Error al actualizar el plan', 'danger');
    }
  } catch (err) {
    console.error('Error al cambiar plan', err);
    showToast('Error de conexión', 'danger');
  }
}

function setAdminLoggedInUI(user, sub) {
  if (adminLoggedOutSection) adminLoggedOutSection.style.display = 'none';
  if (adminLoggedInSection) adminLoggedInSection.style.display = 'block';

  // Portal View Auth Card sync
  const portalUserLoggedInBox = document.getElementById('portalUserLoggedInBox');
  const portalLoggedOutBox = document.getElementById('portalLoggedOutBox');
  const portalWelcomeName = document.getElementById('portalWelcomeName');
  const portalWelcomeEmail = document.getElementById('portalWelcomeEmail');
  const portalDevicesCountText = document.getElementById('portalDevicesCountText');
  const portalAvatarDisplay = document.getElementById('portalAvatarDisplay');

  if (portalUserLoggedInBox) portalUserLoggedInBox.style.display = 'block';
  if (portalLoggedOutBox) portalLoggedOutBox.style.display = 'none';
  if (portalWelcomeName) portalWelcomeName.textContent = `¡Hola, ${user.name || 'Familia'}!`;
  if (portalWelcomeEmail) portalWelcomeEmail.textContent = user.email || '';
  if (portalDevicesCountText) portalDevicesCountText.textContent = `${devicesList.length} dispositivo(s) vinculado(s)`;

  const authBannerPrompt = document.getElementById('authBannerPrompt');
  if (authBannerPrompt) authBannerPrompt.style.display = 'none';

  if (adminProfileName) adminProfileName.textContent = user.name || 'Administrador Principal';
  if (adminProfileEmail) adminProfileEmail.textContent = user.email || 'admin@kidsshield.local';
  if (adminNameText) {
    const firstName = (user.name || user.email || 'Mi Cuenta').split(' ')[0];
    adminNameText.textContent = firstName;
  }
  const avatarUrl = user.picture || (user.avatar && (user.avatar.startsWith('http://') || user.avatar.startsWith('https://') || user.avatar.startsWith('data:')) ? user.avatar : null);

  if (portalAvatarDisplay) {
    if (avatarUrl) {
      portalAvatarDisplay.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
    } else {
      portalAvatarDisplay.textContent = user.avatar || '👨‍💼';
    }
  }

  const adminAvatarIcon = document.getElementById('adminAvatarIcon');
  if (adminAvatarIcon) {
    if (avatarUrl) {
      adminAvatarIcon.innerHTML = `<img src="${avatarUrl}" alt="Avatar" class="admin-avatar-img" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover; vertical-align: middle; border: 1.5px solid #818cf8; display: inline-block;">`;
    } else {
      adminAvatarIcon.textContent = user.avatar || '👨‍💼';
    }
  }

  if (btnAdminProfile) {
    btnAdminProfile.classList.remove('logged-out');
    btnAdminProfile.title = `Cuenta activa: ${user.name || user.email}`;
  }

  if (adminFamilyIdBadge) adminFamilyIdBadge.textContent = user.familyId || 'FAM-DEFAULT-01';

  if (sub) {
    currentSubscription = sub;
    updateSubscriptionUI();
  }

  if (avatarUrl && adminProfileImg) {
    adminProfileImg.src = avatarUrl;
    adminProfileImg.style.display = 'block';
    if (adminProfileAvatarFallback) adminProfileAvatarFallback.style.display = 'none';
  } else {
    if (adminProfileImg) adminProfileImg.style.display = 'none';
    if (adminProfileAvatarFallback) {
      adminProfileAvatarFallback.style.display = 'flex';
      adminProfileAvatarFallback.textContent = user.avatar || '👨‍💼';
    }
  }

  // Mantener solo el menú lateral (Sidebar Opción 2), sin menú superior
  const desktopNav = document.querySelector('.desktop-nav-tabs');
  if (desktopNav) desktopNav.style.display = 'none';

  const drawerBtnLogout = document.getElementById('drawerBtnLogout');
  if (drawerBtnLogout) drawerBtnLogout.style.display = 'block';
  const drawerBtnAuth = document.getElementById('drawerBtnAuth');
  if (drawerBtnAuth) drawerBtnAuth.style.display = 'none';

  const drawerUserName = document.getElementById('drawerUserName');
  if (drawerUserName) drawerUserName.textContent = user.name || 'Titular de Familia';
  const drawerUserEmail = document.getElementById('drawerUserEmail');
  if (drawerUserEmail) drawerUserEmail.textContent = user.email || '';

  if (modalAdminLogin) modalAdminLogin.classList.remove('active');

  // Conmutar a la vista de monitoreo y resumen general
  switchView('monitoring');
  switchDashboardView('overview');
}

function setAdminLoggedOutUI() {
  if (adminLoggedOutSection) adminLoggedOutSection.style.display = 'block';
  if (adminLoggedInSection) adminLoggedInSection.style.display = 'none';

  // Portal View Auth Card sync
  const portalUserLoggedInBox = document.getElementById('portalUserLoggedInBox');
  const portalLoggedOutBox = document.getElementById('portalLoggedOutBox');
  if (portalUserLoggedInBox) portalUserLoggedInBox.style.display = 'none';
  if (portalLoggedOutBox) portalLoggedOutBox.style.display = 'block';

  const authBannerPrompt = document.getElementById('authBannerPrompt');
  if (authBannerPrompt) authBannerPrompt.style.display = 'flex';

  if (adminNameText) adminNameText.textContent = 'Iniciar Sesión';
  const adminAvatarIcon = document.getElementById('adminAvatarIcon');
  if (adminAvatarIcon) adminAvatarIcon.innerHTML = '🔐';

  if (btnAdminProfile) {
    btnAdminProfile.classList.add('logged-out');
    btnAdminProfile.title = 'Iniciar sesión o registrar tu cuenta familiar';
  }

  // Ocultar menú superior si no hay sesión iniciada
  const desktopNav = document.querySelector('.desktop-nav-tabs');
  if (desktopNav) desktopNav.style.display = 'none';

  const drawerBtnLogout = document.getElementById('drawerBtnLogout');
  if (drawerBtnLogout) drawerBtnLogout.style.display = 'none';
  const drawerBtnAuth = document.getElementById('drawerBtnAuth');
  if (drawerBtnAuth) drawerBtnAuth.style.display = 'block';

  const drawerUserName = document.getElementById('drawerUserName');
  if (drawerUserName) drawerUserName.textContent = 'Invitado';
  const drawerUserEmail = document.getElementById('drawerUserEmail');
  if (drawerUserEmail) drawerUserEmail.textContent = 'Sin sesión iniciada';

  // Mostrar el portal de inicio/login
  switchView('portal');
}

// Toggle app block state
async function toggleAppBlock(packageName, isBlocked) {
  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/toggle-app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: packageName, isBlocked })
    });
    if (res.ok) {
      const data = await res.json();
      currentDevice = data.device;
      renderAll();
      showToast(`${packageName} ${isBlocked ? 'bloqueada' : 'desbloqueada'}`, isBlocked ? 'warning' : 'success');
      return;
    }
  } catch (e) {
    console.warn('Servidor local no disponible, aplicando cambio en memoria local');
  }

  // Local fallback
  const app = currentDevice.appCatalog.find(a => a.package === packageName);
  if (app) {
    app.isBlocked = isBlocked;
    if (isBlocked && !currentDevice.blockedApps.includes(packageName)) {
      currentDevice.blockedApps.push(packageName);
    } else if (!isBlocked) {
      currentDevice.blockedApps = currentDevice.blockedApps.filter(p => p !== packageName);
    }
    currentDevice.activityLog.unshift({
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      type: isBlocked ? 'warning' : 'info',
      message: `${app.name} fue ${isBlocked ? 'bloqueada' : 'desbloqueada'}`
    });
    renderAll();
    showToast(`${app.name} ${isBlocked ? 'bloqueada' : 'desbloqueada'}`, isBlocked ? 'warning' : 'success');
  }
}

// Update remote configuration
async function updateRemoteConfig(patch) {
  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (res.ok) {
      const data = await res.json();
      currentDevice = data.device;
      renderAll();
      return;
    }
  } catch (e) {
    console.warn('Servidor local no responde, aplicando cambios en memoria');
  }

  // Local fallback
  Object.assign(currentDevice, patch);
  renderAll();
}

// Fetch device data from server
async function fetchDeviceData(deviceId = currentDevice.id) {
  try {
    const res = await apiFetch(`/api/devices/${deviceId}`);
    if (res.ok) {
      currentDevice = await res.json();
      renderAll();
    }
  } catch (e) {
    console.log('Utilizando estado local del dispositivo');
  }
}

// WebSocket live connection
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  try {
    socket = new WebSocket(wsUrl);
    socket.onopen = () => console.log('🟢 Conectado al canal en tiempo real KidsShield');
    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'DEVICE_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          currentDevice = data.payload;
          renderAll();
        } else if (data.type === 'DEVICE_STATUS_CHANGED') {
          const { id, isOnline, message, lastSeen } = data.payload || {};
          const dev = devicesList.find(d => d.id === id);
          if (dev) {
            dev.isOnline = isOnline;
            if (lastSeen) dev.lastSeen = lastSeen;
          }
          if (currentDevice && currentDevice.id === id) {
            currentDevice.isOnline = isOnline;
            if (lastSeen) currentDevice.lastSeen = lastSeen;
            renderHeader();
            renderHero();
          }
          if (!isOnline) {
            showToast(message || `⚠️ Conexión perdida con ${dev?.name || id}. Posible desinstalación o sin red.`, 'warning');
            playAlertSound();
            triggerWebNotification('⚠️ Dispositivo Desconectado', message || `Se perdió la conexión con ${dev?.name || id}.`);
          }
        } else if (data.type === 'DEVICE_DELETED') {
          showToast(`Dispositivo ${data.payload?.id || ''} fue desvinculado`, 'info');
          devicesList = devicesList.filter(d => d.id !== data.payload?.id);
          if (currentDevice && currentDevice.id === data.payload?.id) {
            currentDevice = null;
            localStorage.removeItem('kidsshield_active_device_id');
            renderNoDeviceState();
            switchView('portal');
          }
          renderDeviceSelector();
        } else if (data.type === 'EVENT_RECORDED' && currentDevice && data.payload.id === currentDevice.id) {
          if (!currentDevice.activityLog) currentDevice.activityLog = [];
          currentDevice.activityLog.unshift(data.payload.event);
          if (currentDevice.activityLog.length > 50) currentDevice.activityLog.pop();
          renderActivityFeed();
          playAlertSound();
          if (data.payload.event.type === 'blocked' || data.payload.event.type === 'gps_alert') {
            triggerWebNotification('⚠️ Alerta KidsShield', data.payload.event.message);
          }
        } else if (data.type === 'CONFIG_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          Object.assign(currentDevice, data.payload.config);
          renderHero();
        } else if (data.type === 'DEVICE_CREATED' || data.type === 'DEVICES_UPDATED') {
          const newId = data.payload?.id;
          await loadDevicesList(newId || (currentDevice ? currentDevice.id : null));
          if (currentDashboardView === 'devices') {
            renderDevicesTab();
          }
          if (data.type === 'DEVICE_CREATED') {
            showToast(`📱 ¡Nuevo dispositivo conectado: ${data.payload?.name || 'Teléfono del Menor'}!`, 'success');
            playAlertSound();
          }
        } else if (data.type === 'SCREENSHOT_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          if (!isLivePaused) {
            currentDevice.lastScreenshot = data.payload.imageBase64 || data.payload.screenshot;
            currentDevice.lastScreenshotTime = data.payload.timestamp;
            renderSimulator();
          }

          const btnText = document.getElementById('btnCaptureScreenText');
          const btnIcon = document.getElementById('btnCaptureScreenIcon');
          if (btnText) btnText.textContent = 'Capturar';
          if (btnIcon) btnIcon.textContent = '📸';

          playAlertSound();
          showToast('📸 ¡Captura de pantalla recibida!', 'success');
        } else if (data.type === 'VIDEO_CLIP_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          handleNewVideoClip(data.payload.frames, data.payload.intervalMs || 500);
        } else if ((data.type === 'AUDIO_CLIP_UPDATED' || data.type === 'AUDIO_CLIP_READY') && currentDevice && data.payload.id === currentDevice.id) {
          handleNewAudioClip(data.payload.audioBase64, data.payload.duration || 5, data.payload.timestamp);
        } else if (data.type === 'GEOFENCE_UPDATED' || data.type === 'GEOFENCE_DELETED') {
          fetchAndRenderGeofences();
        } else if (data.type === 'LOCATION_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          currentDevice.location = data.payload.location;
          renderMap();
          if (isRouteHistoryVisible) {
            fetchAndRenderRouteHistory();
          }

          const btnLocationText = document.getElementById('btnRefreshLocationText');
          const btnLocationIcon = document.getElementById('btnRefreshLocationIcon');
          if (btnLocationText) btnLocationText.textContent = 'Actualizar';
          if (btnLocationIcon) btnLocationIcon.textContent = '🔄';

          showToast('📍 Ubicación GPS actualizada en el mapa', 'success');
        } else if (data.type === 'PUSH_NOTIFICATION') {
          triggerWebNotification(data.payload.title || 'Alerta KidsShield', data.payload.body || 'Evento de seguridad detectado');
          showToast(data.payload.body, data.payload.type === 'alert' ? 'danger' : 'warning');
        }
      } catch (err) {
        console.error('Error parseando socket payload', err);
      }
    };
    socket.onclose = () => {
      console.log('Reconectando socket en 5s...');
      setTimeout(setupWebSocket, 5000);
    };
  } catch (e) {
    console.log('Modo standalone activo');
  }
}

// Request immediate screenshot from child device
async function requestScreenshotNow() {
  if (!currentDevice) {
    showToast('No hay ningún dispositivo vinculado actualmente.', 'warning');
    openPairingQrModal();
    return;
  }
  const btnText = document.getElementById('btnCaptureScreenText');
  const btnIcon = document.getElementById('btnCaptureScreenIcon');
  const statusText = document.getElementById('simScreenshotStatusText');
  try {
    if (btnText) btnText.textContent = 'Solicitando...';
    if (btnIcon) btnIcon.textContent = '⏳';
    if (statusText) {
      statusText.innerHTML = '📡 Solicitando captura al móvil... Esperando transmisión.';
      statusText.style.color = '#60a5fa';
    }
    showToast('📸 Solicitando captura de pantalla al dispositivo...', 'info');

    const res = await fetch(`/api/devices/${currentDevice.id}/request-screenshot`, { method: 'POST' });
    if (res.ok) {
      console.log('Petición de captura transmitida al servidor');
    }
  } catch (err) {
    console.error('Error al solicitar captura', err);
    showToast('Error al solicitar captura', 'danger');
  } finally {
    setTimeout(() => {
      if (btnText && btnText.textContent === 'Solicitando...') {
        btnText.textContent = 'Capturar';
        if (btnIcon) btnIcon.textContent = '📸';
      }
    }, 8000);
  }
}

// Request immediate GPS location from child device
async function requestLocationNow() {
  if (!currentDevice) {
    showToast('No hay ningún dispositivo vinculado actualmente.', 'warning');
    openPairingQrModal();
    return;
  }
  const btnText = document.getElementById('btnRefreshLocationText');
  const btnIcon = document.getElementById('btnRefreshLocationIcon');
  try {
    if (btnText) btnText.textContent = 'Consultando...';
    if (btnIcon) btnIcon.textContent = '⏳';
    showToast('📡 Solicitando posición satelital en vivo...', 'info');

    const res = await fetch(`/api/devices/${currentDevice.id}/request-location`, { method: 'POST' });
    if (res.ok) {
      console.log('Petición de ubicación GPS enviada');
    }
  } catch (err) {
    console.error('Error al solicitar ubicación GPS', err);
    showToast('Error al solicitar coordenadas GPS', 'danger');
  } finally {
    setTimeout(() => {
      if (btnText && btnText.textContent === 'Consultando...') {
        btnText.textContent = 'Actualizar';
        if (btnIcon) btnIcon.textContent = '🔄';
      }
    }, 8000);
  }
}

// Audio synthesizer for parent alerts
function playAlertSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn('Audio alert error', e);
  }
}

// Trigger native OS / browser notification
function triggerWebNotification(title, body) {
  playAlertSound();
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236366f1"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
      });
    } catch (e) {
      console.warn('Notification error', e);
    }
  }
}

// Toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
