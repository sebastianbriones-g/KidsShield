
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

// Dedicated Map State (Tab: Mapas & Geocercas)
let dedicatedLeafletMap = null;
let dedicatedMarker = null;
let dedicatedCircle = null;
let dedicatedGeofencesLayers = [];
let dedicatedRoutePolyline = null;
let dedicatedRouteMarkers = [];
let isAudioRecordingRequested = false;
let autoScreenshotTimer = null;
let isLivePaused = false;
let isOverLimit = false;
let activeTimelineAppFilter = 'ALL';
let activeTimelineTypeFilter = 'all';
let currentView = 'portal';

function isCurrentTimeInBedtimeClient(startStr, endStr) {
  if (!startStr || !endStr) return false;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  const startMin = (startH || 0) * 60 + (startM || 0);
  const endMin = (endH || 0) * 60 + (endM || 0);

  if (startMin <= endMin) {
    return currentMinutes >= startMin && currentMinutes < endMin;
  } else {
    // Horario nocturno que cruza la medianoche (ej: 18:00 a 07:00)
    return currentMinutes >= startMin || currentMinutes < endMin;
  }
}

function getFriendlyDeviceSerial(dev) {
  if (!dev) return 'S/N: KS-PROTECTED';
  if (dev.serialNumber) return `S/N: ${dev.serialNumber}`;
  const idStr = String(dev.id || '01');
  const numPart = idStr.replace(/\D/g, '') || '84';
  const modelCode = (dev.model || 'KS').split(' ')[0].substring(0, 3).toUpperCase();
  return `S/N: KS-${modelCode}-0${numPart}A`;
}

// Sound & Date Filter State
let notificationSoundEnabled = localStorage.getItem('kidsshield_sound_enabled') !== 'false';
let selectedMultimediaDate = 'all'; // 'all', 'today', 'yesterday', or 'YYYY-MM-DD'
let selectedHistoryDate = 'today'; // 'all', 'today', 'yesterday', or 'YYYY-MM-DD'
let selectedAppUsageDate = 'today'; // 'today', 'yesterday', or 'YYYY-MM-DD'
let selectedKeystrokesDate = 'today'; // 'today', 'yesterday', 'all', or 'YYYY-MM-DD'
let keystrokesFilterApp = 'all';
let keystrokesSearchQuery = '';
let editingGeofenceId = null;

function matchesDateFilter(timestampOrDate, filterValue) {
  if (!filterValue || filterValue === 'all') return true;
  if (!timestampOrDate) return false;
  const d = new Date(timestampOrDate);
  if (isNaN(d.getTime())) return false;

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const itemYear = d.getFullYear();
  const itemMonth = String(d.getMonth() + 1).padStart(2, '0');
  const itemDay = String(d.getDate()).padStart(2, '0');
  const itemDateStr = `${itemYear}-${itemMonth}-${itemDay}`;

  if (filterValue === 'today') {
    return itemDateStr === todayStr;
  }

  if (filterValue === 'yesterday') {
    const yest = new Date(Date.now() - 86400000);
    const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
    return itemDateStr === yestStr;
  }

  return itemDateStr === filterValue;
}
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
    if (adminAuthToken) {
      try { await initAdminAuth(); } catch (e) { console.error('[Init] Error in initAdminAuth:', e); }
      try { await initGoogleAuth(); } catch (e) { console.error('[Init] Error in initGoogleAuth:', e); }
      try { await loadSubscriptionInfo(); } catch (e) { console.error('[Init] Error in loadSubscriptionInfo:', e); }
      try { await loadDevicesList(); } catch (e) { console.error('[Init] Error in loadDevicesList:', e); }
      try { await checkUrlResetToken(); } catch (e) { console.error('[Init] Error in checkUrlResetToken:', e); }
      try { renderAll(); } catch (e) { console.error('[Init] Error in renderAll:', e); }
    } else {
      setAdminLoggedOutUI();
    }
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
  if (typeof currentDashboardView !== 'undefined' && currentDashboardView === 'map') {
    initDedicatedMap();
  }
  renderActivityFeed();
  renderHistoryTab();
  fetchAndRenderAppUsage(selectedAppUsageDate);
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

  const usedHeader = currentDevice.screenTimeTodayMinutes || 0;
  const limitHeader = currentDevice.dailyLimitMinutes || 120;
  const hasNoTimeHeader = limitHeader > 0 && usedHeader >= limitHeader;
  const isBedtimeActiveHeader = Boolean(currentDevice.bedtimeEnabled) && isCurrentTimeInBedtimeClient(currentDevice.bedtimeStart, currentDevice.bedtimeEnd);
  const isMasterLocked = Boolean(currentDevice.isLocked) || hasNoTimeHeader || isBedtimeActiveHeader;

  if (isMasterLocked) {
    btnMasterLock.classList.add('is-locked');
    masterLockIcon.textContent = '🔓';
    masterLockText.textContent = hasNoTimeHeader ? 'Desbloquear (+15 min)' : 'Desbloquear Teléfono';
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

  const hasNoTime = limit > 0 && used >= limit;
  const isBedtimeActive = Boolean(currentDevice.bedtimeEnabled) && isCurrentTimeInBedtimeClient(currentDevice.bedtimeStart, currentDevice.bedtimeEnd);
  const isDeviceLocked = Boolean(currentDevice.isLocked) || hasNoTime || isBedtimeActive;

  if (isBedtimeActive) {
    screenTimeProgressBar.className = 'progress-bar-fill progress-exceeded';
    limitStatusBadge.className = 'badge badge-warning';
    limitStatusBadge.textContent = '🌙 Horario Nocturno (Bloqueado)';
  } else if (used === 0) {
    screenTimeProgressBar.className = 'progress-bar-fill';
    limitStatusBadge.className = 'badge badge-accent';
    limitStatusBadge.textContent = '🟢 Sin uso hoy';
  } else if (hasNoTime) {
    screenTimeProgressBar.className = 'progress-bar-fill progress-exceeded';
    limitStatusBadge.className = 'badge badge-warning';
    limitStatusBadge.textContent = '🔒 Tiempo agotado (Bloqueado)';
  } else {
    screenTimeProgressBar.className = 'progress-bar-fill';
    limitStatusBadge.className = 'badge badge-accent';
    limitStatusBadge.textContent = `Restan ${formatMinutes(limit - used)}`;
  }

  // Botón Directo de Bloquear / Desbloquear en Tiempo de Pantalla
  const btnHeroLock = document.getElementById('btnHeroScreenTimeLock');
  const heroLockIcon = document.getElementById('heroScreenTimeLockIcon');
  const heroLockText = document.getElementById('heroScreenTimeLockText');
  if (btnHeroLock && heroLockIcon && heroLockText) {
    if (isDeviceLocked) {
      btnHeroLock.className = 'btn-hero-lock is-locked';
      heroLockIcon.textContent = '🔓';
      heroLockText.textContent = hasNoTime ? 'Desbloquear (+15 min de uso)' : (isBedtimeActive ? 'Desbloquear Teléfono' : 'Desbloquear Teléfono');
    } else {
      btnHeroLock.className = 'btn-hero-lock is-unlocked';
      heroLockIcon.textContent = '🔒';
      heroLockText.textContent = 'Bloquear Teléfono Ahora';
    }
  }

  // Active App
  const activeApp = (currentDevice.appCatalog || []).find(a => a.package === currentDevice.currentActiveApp);
  if (activeApp) {
    activeAppIcon.textContent = activeApp.icon || '📱';
    activeAppName.textContent = activeApp.name;
    activeAppCategory.textContent = activeApp.category || 'Aplicación';

    // Tiempo real medido por el sistema Android (UsageStatsManager)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const minutesSinceMidnight = Math.max(1, Math.floor((Date.now() - startOfToday.getTime()) / 60000));

    let currentUsageMinutes = typeof activeApp.timeTodayMinutes === 'number' ? activeApp.timeTodayMinutes : 0;
    if (currentUsageMinutes === 0 && currentDevice.isOnline && currentDevice.currentActiveApp) {
      currentUsageMinutes = 1; // Acaba de abrirse
    }
    // Límite estricto: el tiempo en uso HOY nunca puede superar los minutos transcurridos del día actual
    currentUsageMinutes = Math.min(currentUsageMinutes, minutesSinceMidnight, 1440);
    activeAppDesc.textContent = `En uso hoy: ${formatMinutes(currentUsageMinutes)}`;

    btnQuickBlockActiveApp.disabled = false;
    btnQuickBlockActiveApp.style.opacity = '1';
    btnQuickBlockActiveApp.style.cursor = 'pointer';

    if (activeApp.isBlocked) {
      btnQuickBlockActiveApp.textContent = '✅ Desbloquear App';
      btnQuickBlockActiveApp.style.background = 'rgba(16, 185, 129, 0.2)';
      btnQuickBlockActiveApp.style.color = '#34d399';
    } else {
      btnQuickBlockActiveApp.textContent = '⛔ Bloquear Esta App';
      btnQuickBlockActiveApp.style.background = 'rgba(239, 68, 68, 0.2)';
      btnQuickBlockActiveApp.style.color = '#f87171';
    }
  } else {
    activeAppIcon.textContent = '📱';
    activeAppName.textContent = currentDevice.currentActiveAppName || (currentDevice.isOnline ? 'En pantalla de inicio / Reposo' : 'Sin aplicación activa');
    activeAppCategory.textContent = currentDevice.isOnline ? 'Sistema' : 'En espera';
    if (currentDevice.currentActiveAppName && currentDevice.isOnline) {
      activeAppDesc.textContent = `En uso hoy: 1m (activa ahora)`;
    } else {
      activeAppDesc.textContent = currentDevice.isOnline ? 'El teléfono no tiene ninguna aplicación en primer plano' : 'Esperando actividad en el teléfono móvil';
    }

    btnQuickBlockActiveApp.disabled = true;
    btnQuickBlockActiveApp.textContent = '⛔ Bloquear Esta App';
    btnQuickBlockActiveApp.style.opacity = '0.5';
    btnQuickBlockActiveApp.style.cursor = 'not-allowed';
  }

  // Bedtime
  if (toggleBedtime) toggleBedtime.checked = Boolean(currentDevice.bedtimeEnabled);
  const toggleBedtimeSchedule = document.getElementById('toggleBedtimeSchedule');
  if (toggleBedtimeSchedule) toggleBedtimeSchedule.checked = Boolean(currentDevice.bedtimeEnabled);
  if (bedtimeTimeDisplay) bedtimeTimeDisplay.textContent = `${currentDevice.bedtimeStart || '21:30'} - ${currentDevice.bedtimeEnd || '07:00'}`;
  if (bedtimeStartInput) bedtimeStartInput.value = currentDevice.bedtimeStart || '21:30';
  if (bedtimeEndInput) bedtimeEndInput.value = currentDevice.bedtimeEnd || '07:00';
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
    const isSystemApp = (app.category && app.category.toLowerCase().includes('sistema')) || app.isSystem || (app.package && (app.package.startsWith('com.android') || app.package.startsWith('com.google.android')));
    const cat = (app.category || '').toLowerCase().trim();
    const filter = (activeCategoryFilter || 'all').toLowerCase().trim();

    let matchesCat = (filter === 'all');
    if (!matchesCat) {
      if (filter === 'sistema') {
        matchesCat = isSystemApp || cat.includes('sistema');
      } else if (filter === 'juegos') {
        matchesCat = cat.includes('juego') || cat.includes('game');
      } else if (filter === 'redes sociales') {
        matchesCat = cat.includes('social') || cat.includes('red');
      } else if (filter === 'videos') {
        matchesCat = cat.includes('video') || cat.includes('entreten') || cat.includes('youtube') || cat.includes('netflix') || cat.includes('tiktok') || cat.includes('streaming');
      } else if (filter === 'navegación web' || filter === 'web') {
        matchesCat = cat.includes('navega') || cat.includes('web') || (app.name && (app.name.toLowerCase().includes('chrome') || app.name.toLowerCase().includes('browser')));
      } else if (filter === 'educación') {
        matchesCat = cat.includes('educa') || cat.includes('aprende');
      } else if (filter === 'comunicación') {
        matchesCat = cat.includes('comunica') || cat.includes('chat') || cat.includes('mensaj') || (app.name && (app.name.toLowerCase().includes('whatsapp') || app.name.toLowerCase().includes('telegram')));
      } else if (filter === 'utilidades') {
        matchesCat = cat.includes('utili') || cat.includes('herram') || cat.includes('tool');
      } else {
        matchesCat = cat === filter;
      }
    }

    const matchesSearch = !searchQuery ||
                          app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

  const usedMinutes = currentDevice.screenTimeTodayMinutes || 0;
  const limitMinutes = currentDevice.dailyLimitMinutes || 120;
  const isTimeDepleted = limitMinutes > 0 && usedMinutes >= limitMinutes;
  const isDeviceEffectivelyLocked = Boolean(currentDevice.isLocked) || isTimeDepleted;

  if (isDeviceEffectivelyLocked) {
    const lockedBanner = document.createElement('div');
    lockedBanner.className = 'device-locked-banner';
    lockedBanner.style.cssText = 'background: rgba(239, 68, 68, 0.16); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; color: #fca5a5; font-size: 0.84rem; display: flex; align-items: center; gap: 8px;';
    lockedBanner.innerHTML = isTimeDepleted 
      ? '<span>⌛</span><span><strong>Límite Diario Agotado:</strong> Todas las aplicaciones están restringidas por tiempo de pantalla agotado.</span>'
      : '<span>🔒</span><span><strong>Dispositivo Bloqueado:</strong> Todas las aplicaciones están restringidas por el control parental.</span>';
    appListContainer.appendChild(lockedBanner);
  }

  filtered.forEach(app => {
    const appLimit = (currentDevice.appLimits && currentDevice.appLimits[app.package]) || 0;
    const isLimitExceeded = appLimit > 0 && app.timeTodayMinutes >= appLimit;
    const isEffectiveBlocked = isDeviceEffectivelyLocked || app.isBlocked || isLimitExceeded;

    const row = document.createElement('div');
    row.className = `app-row ${isEffectiveBlocked ? 'is-blocked' : ''}`;

    let timeSub = `⏱️ ${formatMinutes(app.timeTodayMinutes)} hoy`;
    if (isTimeDepleted) {
      timeSub = '🔒 Bloqueada (Tiempo agotado)';
    } else if (currentDevice.isLocked) {
      timeSub = '🔒 Bloqueada (Dispositivo bloqueado)';
    } else if (app.isBlocked) {
      timeSub = '🚫 Acceso bloqueado';
    } else if (isLimitExceeded) {
      timeSub = '⌛ Límite individual agotado';
    }

    let btnText = '✓ Permitida';
    let btnClass = 'btn-allowed';
    if (isDeviceEffectivelyLocked) {
      btnText = '🔒 Bloqueada';
      btnClass = 'btn-blocked';
    } else if (app.isBlocked) {
      btnText = '🚫 Bloqueada';
      btnClass = 'btn-blocked';
    }

    const appCatNorm = (app.category || '').toLowerCase();

    row.innerHTML = `
      <div class="app-info-left">
        <div class="app-icon-badge">${app.icon}</div>
        <div class="app-text-group">
          <div class="app-title-line">
            <span class="app-name">${app.name}</span>
            <span class="app-tag-badge">${app.category || 'Utilidades'}</span>
            ${appLimit > 0 ? `<span class="app-limit-badge ${isLimitExceeded ? 'exceeded' : ''}">⏱️ Límite: ${appLimit}m</span>` : ''}
          </div>
          <span class="app-time-sub">${timeSub}</span>
        </div>
      </div>
      <div class="app-item-actions">
        <div class="app-control-field">
          <label class="app-field-label">Categoría</label>
          <select class="app-category-select" data-pkg="${app.package}" title="Cambiar categoría de la app">
            <option value="Juegos" ${appCatNorm.includes('juego') ? 'selected' : ''}>🎮 Juegos</option>
            <option value="Redes Sociales" ${appCatNorm.includes('social') || appCatNorm.includes('red') ? 'selected' : ''}>📱 Redes</option>
            <option value="Videos" ${appCatNorm.includes('video') || appCatNorm.includes('entreten') ? 'selected' : ''}>🎬 Videos</option>
            <option value="Navegación Web" ${appCatNorm.includes('navega') || appCatNorm.includes('web') ? 'selected' : ''}>🌐 Web</option>
            <option value="Educación" ${appCatNorm.includes('educa') ? 'selected' : ''}>🎓 Educación</option>
            <option value="Comunicación" ${appCatNorm.includes('comunica') || appCatNorm.includes('mensaj') ? 'selected' : ''}>💬 Comunicación</option>
            <option value="Utilidades" ${appCatNorm.includes('utili') ? 'selected' : ''}>📁 Utilidades</option>
            <option value="Sistema" ${appCatNorm.includes('sistema') ? 'selected' : ''}>⚙️ Sistema</option>
          </select>
        </div>
        <div class="app-control-field">
          <label class="app-field-label">Límite Diario</label>
          <select class="app-limit-select" data-pkg="${app.package}" title="Fijar límite diario para esta aplicación">
            <option value="0" ${!appLimit ? 'selected' : ''}>Sin límite</option>
            <option value="15" ${appLimit === 15 ? 'selected' : ''}>15 min</option>
            <option value="30" ${appLimit === 30 ? 'selected' : ''}>30 min</option>
            <option value="45" ${appLimit === 45 ? 'selected' : ''}>45 min</option>
            <option value="60" ${appLimit === 60 ? 'selected' : ''}>1 hora</option>
            <option value="90" ${appLimit === 90 ? 'selected' : ''}>1.5 horas</option>
            <option value="120" ${appLimit === 120 ? 'selected' : ''}>2 horas</option>
          </select>
        </div>
        <button class="toggle-block-btn ${btnClass}" data-pkg="${app.package}">
          ${btnText}
        </button>
      </div>
    `;

    row.querySelector('.toggle-block-btn').addEventListener('click', () => {
      toggleAppBlock(app.package, !app.isBlocked);
    });

    row.querySelector('.app-category-select').addEventListener('change', async (e) => {
      const newCat = e.target.value;
      try {
        const res = await apiFetch(`/api/devices/${currentDevice.id}/app-category`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageName: app.package, category: newCat })
        });
        if (res.ok) {
          app.category = newCat;
          if (newCat.includes('Sistema')) app.icon = '⚙️';
          showToast(`Categoría de ${app.name} cambiada a ${newCat}`, 'success');
          renderAppList();
        } else {
          showToast('No se pudo guardar la categoría', 'danger');
        }
      } catch (err) {
        showToast('Error de conexión', 'danger');
      }
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
  if (!currentDevice) return;
  if (dailyLimitRange) dailyLimitRange.value = currentDevice.dailyLimitMinutes || 120;
  if (dailyLimitValText) dailyLimitValText.textContent = formatMinutes(currentDevice.dailyLimitMinutes || 120);
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
  if (!currentVideoClip.isPlaying && simVideoClipOverlay) {
    simVideoClipOverlay.style.display = 'none';
  }
  if (simLiveScreenImg) {
    if (currentDevice.lastScreenshot) {
      simLiveScreenImg.src = currentDevice.lastScreenshot.startsWith('data:') 
        ? currentDevice.lastScreenshot 
        : 'data:image/jpeg;base64,' + currentDevice.lastScreenshot;
      simLiveScreenImg.style.display = 'block';
      if (simNormalScreen) simNormalScreen.style.display = 'none';

      if (simScreenshotStatusText && currentDevice.lastScreenshotTime) {
        const d = new Date(currentDevice.lastScreenshotTime);
        const now = new Date();
        const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
        const diffMin = Math.floor(diffSec / 60);
        const isToday = d.toDateString() === now.toDateString();
        const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        if (diffSec < 120 && isToday) {
          simScreenshotStatusText.innerHTML = `🟢 Transmisión en vivo: <strong>${timeStr}</strong> <span style="font-size:0.75rem; color:#a7f3d0;">(hace ${diffSec}s)</span>`;
          simScreenshotStatusText.style.color = '#34d399';
        } else if (isToday) {
          simScreenshotStatusText.innerHTML = `🟡 Última captura hoy: <strong>${timeStr}</strong> <span style="font-size:0.75rem; color:#fde68a;">(hace ${diffMin} min)</span>`;
          simScreenshotStatusText.style.color = '#fbbf24';
        } else {
          const dateStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
          simScreenshotStatusText.innerHTML = `⚪ Captura archivada: <strong>${dateStr}, ${timeStr}</strong>`;
          simScreenshotStatusText.style.color = '#94a3b8';
        }
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
  const liveStatusBadge = document.getElementById('liveStatusBadge');
  if (isBlockedApp || isOverLimit || currentDevice.isLocked) {
    if (liveStatusBadge) {
      if (isAppLimitExceeded) {
        liveStatusBadge.textContent = '⌛ Límite App';
        liveStatusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        liveStatusBadge.style.color = '#f87171';
      } else if (isBlockedApp) {
        liveStatusBadge.textContent = '🚫 App Prohibida';
        liveStatusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        liveStatusBadge.style.color = '#f87171';
      } else {
        liveStatusBadge.textContent = '🔒 Límite Agotado';
        liveStatusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        liveStatusBadge.style.color = '#f87171';
      }
    }
    if (simLockOverlay) simLockOverlay.classList.remove('active');
  } else {
    if (liveStatusBadge) {
      liveStatusBadge.textContent = (typeof isLiveStreamingPaused !== 'undefined' && isLiveStreamingPaused) ? '⏸️ Pausado' : '🟢 En Vivo';
      liveStatusBadge.style.background = '';
      liveStatusBadge.style.color = '';
    }
    if (simLockOverlay) simLockOverlay.classList.remove('active');
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
          leafletMap = L.map('mapLeaflet', { zoomControl: true }).setView([-33.4489, -70.6693], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
          }).addTo(leafletMap);
        }
        if (areGeofencesVisible) {
          fetchAndRenderGeofences();
        }
        if (typeof setupMapClickListener === 'function') {
          setupMapClickListener(leafletMap);
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
    if (typeof setupMapClickListener === 'function') {
      setupMapClickListener(leafletMap);
    }
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
  } catch (err) {
    console.error('Error inicializando mapa Leaflet', err);
  }
}

function renderTimelineAppChips() {
  const chipsContainer = document.getElementById('timelineAppFilterChips') || document.getElementById('timelineFilterChips');
  const dropdown = document.getElementById('selectTimelineAppDropdown');
  if (!chipsContainer) return;
  chipsContainer.innerHTML = '';

  if (!currentDevice) return;

  // Recopilar apps únicas del catálogo y del registro de actividad
  const appsMap = new Map();
  if (currentDevice.appCatalog) {
    currentDevice.appCatalog.forEach(a => {
      appsMap.set(a.package, {
        name: a.name,
        icon: a.icon || '📱',
        package: a.package,
        minutes: a.timeTodayMinutes || 0
      });
    });
  }

  if (currentDevice.activityLog) {
    currentDevice.activityLog.forEach(item => {
      if (item.package) {
        if (!appsMap.has(item.package)) {
          appsMap.set(item.package, {
            name: item.appName || item.package,
            icon: '📱',
            package: item.package,
            minutes: 0
          });
        }
      }
    });
  }

  const allApps = Array.from(appsMap.values());
  // Ordenar por minutos hoy descendente
  allApps.sort((a, b) => b.minutes - a.minutes);

  // Top 3 apps para chips rápidos
  const topApps = allApps.slice(0, 3);
  const remainingApps = allApps.slice(3);

  // Chip 1: 'Todas las Apps'
  const btnAll = document.createElement('button');
  btnAll.className = `app-chip-pill ${activeTimelineAppFilter === 'ALL' ? 'active' : ''}`;
  btnAll.innerHTML = `<span>🌐 Todas</span>`;
  btnAll.addEventListener('click', () => {
    activeTimelineAppFilter = 'ALL';
    if (dropdown) dropdown.value = 'ALL';
    renderTimelineAppChips();
    renderActivityFeed();
  });
  chipsContainer.appendChild(btnAll);

  // Chips para las Top 3 apps más utilizadas
  topApps.forEach(app => {
    const btn = document.createElement('button');
    btn.className = `app-chip-pill ${activeTimelineAppFilter === app.package ? 'active' : ''}`;
    btn.innerHTML = `<span>${app.icon} ${app.name}</span>`;
    btn.addEventListener('click', () => {
      activeTimelineAppFilter = app.package;
      if (dropdown) dropdown.value = app.package;
      renderTimelineAppChips();
      renderActivityFeed();
    });
    chipsContainer.appendChild(btn);
  });

  // Si hay una app activa seleccionada del dropdown que no está en las top 3, mostrar chip activo para ella
  const isSelectedInTop = topApps.some(a => a.package === activeTimelineAppFilter);
  if (activeTimelineAppFilter !== 'ALL' && !isSelectedInTop) {
    const activeAppObj = allApps.find(a => a.package === activeTimelineAppFilter);
    if (activeAppObj) {
      const btnActive = document.createElement('button');
      btnActive.className = 'app-chip-pill active';
      btnActive.innerHTML = `<span>${activeAppObj.icon} ${activeAppObj.name} ✕</span>`;
      btnActive.title = 'Quitar filtro de esta aplicación';
      btnActive.addEventListener('click', () => {
        activeTimelineAppFilter = 'ALL';
        if (dropdown) dropdown.value = 'ALL';
        renderTimelineAppChips();
        renderActivityFeed();
      });
      chipsContainer.appendChild(btnActive);
    }
  }

  // Poblar dropdown con todas las aplicaciones ordenadas alfabéticamente
  if (dropdown) {
    const sortedAlpha = [...allApps].sort((a, b) => a.name.localeCompare(b.name));
    let optionsHtml = `<option value="ALL" ${activeTimelineAppFilter === 'ALL' ? 'selected' : ''}>🔍 Más aplicaciones (${allApps.length})...</option>`;
    sortedAlpha.forEach(app => {
      optionsHtml += `<option value="${app.package}" ${activeTimelineAppFilter === app.package ? 'selected' : ''}>${app.icon} ${app.name}</option>`;
    });
    dropdown.innerHTML = optionsHtml;

    if (!dropdown._hasChangeListener) {
      dropdown._hasChangeListener = true;
      dropdown.addEventListener('change', (e) => {
        activeTimelineAppFilter = e.target.value;
        renderTimelineAppChips();
        renderActivityFeed();
      });
    }
  }
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
    // 1. Filtro por Aplicación
    const matchesApp = (activeTimelineAppFilter === 'ALL') || (item.package === activeTimelineAppFilter || item.appName === activeTimelineAppFilter);
    if (!matchesApp) return false;

    // 2. Filtro por Tipo de Evento
    if (activeTimelineTypeFilter === 'all') return true;
    const type = (item.type || '').toLowerCase();
    const msg = (item.message || '').toLowerCase();
    if (activeTimelineTypeFilter === 'warning') {
      return type === 'warning' || type === 'blocked' || msg.includes('bloque') || msg.includes('límite') || msg.includes('agotado');
    }
    if (activeTimelineTypeFilter === 'info') {
      return type === 'info' || type === 'open' || type === 'app_open' || msg.includes('abrió') || msg.includes('inició');
    }
    if (activeTimelineTypeFilter === 'alert') {
      return type === 'alert' || type === 'gps_alert' || type === 'danger' || msg.includes('alerta') || msg.includes('geocerca') || msg.includes('peligro');
    }
    return true;
  });

  if (filtered.length === 0) {
    activityFeedContainer.innerHTML = `
      <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
        No hay eventos registrados con estos filtros activos.
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
  const used = currentDevice.screenTimeTodayMinutes || 0;
  const current = currentDevice.dailyLimitMinutes || 120;
  const newLimit = Math.min(720, Math.max(current + 15, used > current ? used + 15 : current + 15));
  currentDevice.dailyLimitMinutes = newLimit;

  const payload = { dailyLimitMinutes: newLimit };
  const hasRemaining = used < newLimit;
  if (hasRemaining) {
    currentDevice.isLocked = false;
    currentDevice.lockReason = '';
    payload.isLocked = false;
    payload.lockReason = '';
    updateLockUI(false);
    devicesList.forEach(d => {
      if (d.id === currentDevice.id) {
        d.isLocked = false;
        d.dailyLimitMinutes = newLimit;
        d.lockReason = '';
      }
    });
    renderFamilyOverviewCards();
  }

  updateRemoteConfig(payload);
  renderHero();
  renderScheduleControls();
  renderAppList();
  const cardDaily = document.getElementById('cardDailyTimeLimitText');
  if (cardDaily) cardDaily.textContent = formatMinutes(newLimit);
  showToast(`Límite aumentado a ${formatMinutes(newLimit)}${hasRemaining ? ' • Dispositivo desbloqueado' : ''}`, 'success');
}

function increaseDailyLimit30m() {
  if (!currentDevice) {
    showToast('No hay dispositivo vinculado', 'warning');
    return;
  }
  const used = currentDevice.screenTimeTodayMinutes || 0;
  const current = currentDevice.dailyLimitMinutes || 120;
  const newLimit = Math.min(720, Math.max(current + 30, used > current ? used + 30 : current + 30));
  currentDevice.dailyLimitMinutes = newLimit;

  const payload = { dailyLimitMinutes: newLimit };
  const hasRemaining = used < newLimit;
  if (hasRemaining) {
    currentDevice.isLocked = false;
    currentDevice.lockReason = '';
    payload.isLocked = false;
    payload.lockReason = '';
    updateLockUI(false);
    devicesList.forEach(d => {
      if (d.id === currentDevice.id) {
        d.isLocked = false;
        d.dailyLimitMinutes = newLimit;
        d.lockReason = '';
      }
    });
    renderFamilyOverviewCards();
  }

  updateRemoteConfig(payload);
  renderHero();
  renderScheduleControls();
  renderAppList();
  const cardDaily = document.getElementById('cardDailyTimeLimitText');
  if (cardDaily) cardDaily.textContent = formatMinutes(newLimit);
  showToast(`⚡ Límite aumentado a ${formatMinutes(newLimit)} (+30m)${hasRemaining && payload.isLocked === false ? ' • Dispositivo desbloqueado' : ''}`, 'success');
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
    keystrokes: 'tabViewKeystrokes',
    settings: 'tabViewSettings',
    reports: 'tabViewReports'
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
    fetchAndRenderAppUsage(selectedAppUsageDate);
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
  } else if (viewId === 'keystrokes') {
    syncChildContextSelectors();
    fetchAndRenderKeystrokes(selectedKeystrokesDate);
  } else if (viewId === 'reports') {
    syncChildContextSelectors();
    initMonthlyReportsView();
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
function openUnlinkDeviceModal(targetDevId = null) {
  if (targetDevId) {
    onDeviceSelected(targetDevId);
  }
  if (!currentDevice) {
    showToast('No hay dispositivo seleccionado para desvincular.', 'warning');
    return;
  }
  const modal = document.getElementById('modalUnlinkDevice');
  const nameDisplay = document.getElementById('modalUnlinkDeviceName');
  if (nameDisplay) {
    nameDisplay.textContent = `${currentDevice.childName || currentDevice.name || 'Dispositivo'} • ${currentDevice.name || ''} (${currentDevice.id})`;
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
      }
      renderDeviceSelector();
      renderFamilyOverviewCards();
      renderFamilyChildrenCards();
      syncChildContextSelectors();
      const familyDevicesUsageText = document.getElementById('familyDevicesUsageText');
      if (familyDevicesUsageText) {
        const sub = (typeof currentSubscription !== 'undefined' && currentSubscription) ? currentSubscription : { maxDevices: 5 };
        familyDevicesUsageText.textContent = `${devicesList.length} / ${sub.maxDevices || 5} permitidos`;
      }
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

    const isTablet = dev.deviceType === 'tablet';
    const typeBadge = isTablet ? '📟 Tablet' : '📱 Celular';
    const isConnected = Boolean(isOnline || dev.hasConnected);
    const isPending = !isConnected && (typeof dev.name === 'string' && dev.name.startsWith('Esperando conexión'));
    let cleanDevName = dev.name;
    if (isPending) {
      cleanDevName = `⏳ Esperando conexión (${typeBadge})`;
    } else {
      if (!cleanDevName || cleanDevName.startsWith('Esperando conexión')) {
        cleanDevName = dev.model || 'Dispositivo Conectado';
      }
      cleanDevName = `${typeBadge} • ${cleanDevName}`;
    }
    const childDisplayName = dev.childName || (dev.id === 'KID-PHONE-01' ? 'Seba' : (dev.name || 'Hijo'));

    return `
      <div class="child-overview-card ${isSelected ? 'is-active-device' : ''}" id="overviewCard-${dev.id}" onclick="onDeviceSelected('${dev.id}')" style="cursor: pointer; position: relative; transition: all 0.25s ease; ${isSelected ? 'border: 2px solid #818cf8; box-shadow: 0 0 16px rgba(99, 102, 241, 0.35); background: rgba(99, 102, 241, 0.08);' : ''}">
        ${isSelected ? '<div style="position: absolute; top: -10px; right: 14px; background: #6366f1; color: #fff; font-size: 0.68rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; box-shadow: 0 2px 8px rgba(99,102,241,0.5); z-index: 2;">👁️ Supervisando ahora</div>' : ''}
        <div class="card-child-header">
          <div class="child-info-group">
            <div class="child-avatar-badge">${dev.avatar || (isTablet ? '📟' : '👦')}</div>
            <div>
              <h4 class="child-name-text">${childDisplayName}</h4>
              <p class="child-device-model">${cleanDevName} • <span style="color: #94a3b8; font-size: 0.74rem;">${getFriendlyDeviceSerial(dev)}</span></p>
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
          <button class="btn-card-view-screen" onclick="event.stopPropagation(); selectAndFocusScreen('${dev.id}')" style="${isSelected ? 'width: 100%; flex: 1;' : ''}">
            ${isSelected ? '👁️ Viendo en Vivo' : '👁️ Ver Pantalla'}
          </button>
          ${!isSelected ? `
          <button class="btn-card-quick-lock ${isLocked ? 'is-locked' : 'is-unlocked'}" onclick="event.stopPropagation(); toggleDeviceLockById('${dev.id}')">
            ${isLocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
          </button>
          ` : ''}
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem;">
          <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); selectAndGoSettings('${dev.id}')" style="font-size: 0.74rem; padding: 4px 8px;" title="Ajustes y límites de este dispositivo">
            ⚙️ Configurar
          </button>
          <button class="btn btn-danger-outline btn-sm" onclick="event.stopPropagation(); openUnlinkForDevice('${dev.id}')" style="font-size: 0.74rem; padding: 4px 8px;" title="Desvincular y liberar teléfono">
            🗑️ Desvincular
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

function updateLockUI(isLocked) {
  const used = (currentDevice && currentDevice.screenTimeTodayMinutes) || 0;
  const limit = (currentDevice && currentDevice.dailyLimitMinutes) || 120;
  const hasNoTime = limit > 0 && used >= limit;
  const effectiveLocked = Boolean(isLocked) || hasNoTime;

  if (btnMasterLock && masterLockIcon && masterLockText) {
    if (effectiveLocked) {
      btnMasterLock.classList.add('is-locked');
      masterLockIcon.textContent = '🔓';
      masterLockText.textContent = hasNoTime ? 'Desbloquear (+15 min)' : 'Desbloquear Teléfono';
    } else {
      btnMasterLock.classList.remove('is-locked');
      masterLockIcon.textContent = '🔒';
      masterLockText.textContent = 'Bloquear Teléfono Ahora';
    }
  }

  // Sincronizar botón directo en tarjeta Tiempo de Pantalla
  const btnHeroLock = document.getElementById('btnHeroScreenTimeLock');
  const heroLockIcon = document.getElementById('heroScreenTimeLockIcon');
  const heroLockText = document.getElementById('heroScreenTimeLockText');
  if (btnHeroLock && heroLockIcon && heroLockText) {
    if (effectiveLocked) {
      btnHeroLock.className = 'btn-hero-lock is-locked';
      heroLockIcon.textContent = '🔓';
      heroLockText.textContent = hasNoTime ? 'Desbloquear (+15 min de uso)' : 'Desbloquear Teléfono';
    } else {
      btnHeroLock.className = 'btn-hero-lock is-unlocked';
      heroLockIcon.textContent = '🔒';
      heroLockText.textContent = 'Bloquear Teléfono Ahora';
    }
  }

  if (currentDevice) {
    currentDevice.isLocked = isLocked;
  }
  renderSimulator();
}

async function toggleDeviceLockById(devId) {
  const targetId = devId || (currentDevice && currentDevice.id) || (devicesList[0] && devicesList[0].id);
  if (!targetId) {
    showToast('No hay dispositivo disponible para bloquear', 'warning');
    return;
  }

  try {
    const dev = devicesList.find(d => d.id === targetId);
    const used = (dev && dev.screenTimeTodayMinutes) || (currentDevice && currentDevice.screenTimeTodayMinutes) || 0;
    const limit = (dev && dev.dailyLimitMinutes) || (currentDevice && currentDevice.dailyLimitMinutes) || 120;
    const hasNoTime = limit > 0 && used >= limit;
    const isCurrentlyLocked = Boolean((dev && dev.isLocked) || (currentDevice && currentDevice.isLocked) || hasNoTime);

    // Si está bloqueado (ya sea por toggle manual o porque se le agotó el tiempo), al pulsar se DESBLOQUEA
    const newLock = !isCurrentlyLocked;
    let extraLimit = null;

    // Si se desbloquea y el menor no tiene tiempo disponible,
    // garantizamos que pueda usar el móvil otorgando +15 min sobre lo usado hoy
    if (!newLock && hasNoTime) {
      extraLimit = Math.max(limit + 15, used + 15);
      if (dev) dev.dailyLimitMinutes = extraLimit;
      if (currentDevice && currentDevice.id === targetId) {
        currentDevice.dailyLimitMinutes = extraLimit;
      }
    }

    // Actualización optimista inmediata
    if (dev) {
      dev.isLocked = newLock;
      if (!newLock) dev.lockReason = '';
    }
    if (currentDevice && currentDevice.id === targetId) {
      currentDevice.isLocked = newLock;
      if (!newLock) currentDevice.lockReason = '';
      updateLockUI(newLock);
      renderHero();
      renderScheduleControls();
      renderAppList();
    }
    renderFamilyOverviewCards();
    if (document.getElementById('tabViewFamily') && !document.getElementById('tabViewFamily').classList.contains('hidden')) {
      renderFamilyChildrenCards();
    }

    const payload = { 
      isLocked: newLock, 
      lockReason: newLock ? 'Bloqueo inmediato solicitado por los padres' : '' 
    };
    if (extraLimit) payload.dailyLimitMinutes = extraLimit;

    const res = await apiFetch(`/api/devices/${targetId}/toggle-lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      const actualLock = (data && typeof data.isLocked === 'boolean') ? data.isLocked : newLock;
      if (dev) {
        dev.isLocked = actualLock;
        if (data && data.dailyLimitMinutes) dev.dailyLimitMinutes = data.dailyLimitMinutes;
        if (!actualLock) dev.lockReason = '';
      }
      if (currentDevice && currentDevice.id === targetId) {
        currentDevice.isLocked = actualLock;
        if (data && data.dailyLimitMinutes) currentDevice.dailyLimitMinutes = data.dailyLimitMinutes;
        if (!actualLock) currentDevice.lockReason = '';
        updateLockUI(actualLock);
        renderHero();
        renderScheduleControls();
        renderAppList();
      }
      renderFamilyOverviewCards();
      if (document.getElementById('tabViewFamily') && !document.getElementById('tabViewFamily').classList.contains('hidden')) {
        renderFamilyChildrenCards();
      }
      showToast(
        actualLock 
          ? `🔒 ${dev ? (dev.childName || dev.name) : 'Dispositivo'} bloqueado con éxito` 
          : `🔓 ${dev ? (dev.childName || dev.name) : 'Dispositivo'} desbloqueado con éxito${extraLimit ? ' (+15 min de uso otorgados)' : ''}`, 
        actualLock ? 'warning' : 'success'
      );
    } else {
      // Fallback a través del endpoint de configuración remota
      const fallbackPayload = {
        isLocked: newLock,
        lockReason: newLock ? 'Bloqueo inmediato solicitado por los padres' : ''
      };
      if (extraLimit) fallbackPayload.dailyLimitMinutes = extraLimit;
      await updateRemoteConfig(fallbackPayload);
      showToast(`🔒 Dispositivo ${newLock ? 'bloqueado' : 'desbloqueado'} con éxito`, newLock ? 'warning' : 'success');
    }
  } catch (err) {
    console.error('Error cambiando bloqueo, aplicando respaldo:', err);
    try {
      const dev = devicesList.find(d => d.id === targetId);
      const fallbackLock = dev ? dev.isLocked : true;
      await updateRemoteConfig({
        isLocked: fallbackLock,
        lockReason: fallbackLock ? 'Bloqueo inmediato solicitado por los padres' : ''
      });
      showToast(`🔒 Dispositivo actualizado con éxito`, 'info');
    } catch (fallbackErr) {
      showToast('Error al cambiar bloqueo. Verifica la conexión.', 'danger');
    }
  }
}
window.toggleDeviceLockById = toggleDeviceLockById;

// ----------------------------------------------------------------
// Tab 2: Mi Familia (Gestión y 3 Accesos Directos Obligatorios)
// ----------------------------------------------------------------
function renderFamilyTab() {
  const familyIdDisplay = document.getElementById('familyIdDisplay');
  const familyOwnerName = document.getElementById('familyOwnerName');
  const familyOwnerEmail = document.getElementById('familyOwnerEmail');
  const familyDevicesUsageText = document.getElementById('familyDevicesUsageText');
  const familyPlanBadge = document.getElementById('familyPlanBadge');

  const famName = (adminUser && adminUser.name) ? `Familia ${adminUser.name.split(' ')[0]}` : 'Familia Protegida';
  if (familyIdDisplay) familyIdDisplay.textContent = famName;
  if (familyOwnerName) familyOwnerName.textContent = (adminUser && adminUser.name) || 'Administrador Familiar';
  if (familyOwnerEmail) familyOwnerEmail.textContent = (adminUser && adminUser.email) || 'contacto@familia.local';

  const sub = (typeof currentSubscription !== 'undefined' && currentSubscription) ? currentSubscription : { plan: 'family_total', maxDevices: 10 };
  const maxDevs = sub.maxDevices || 10;
  const count = (devicesList && Array.isArray(devicesList)) ? devicesList.length : 0;
  if (familyDevicesUsageText) familyDevicesUsageText.textContent = `${count} / ${maxDevs} permitidos`;

  const planName = (sub.plan === 'free') 
    ? 'Plan Gratuito' 
    : (sub.plan === 'family_total') 
      ? 'Familia Total VIP 💎' 
      : 'Familiar Pro ⚡';
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

    const isTablet = dev.deviceType === 'tablet';
    const typeBadge = isTablet ? '📟 Tablet' : '📱 Celular';
    const isConnected = Boolean(isOnline || dev.hasConnected);
    const isPending = !isConnected && (typeof dev.name === 'string' && dev.name.startsWith('Esperando conexión'));
    let cleanDevName = dev.name;
    if (isPending) {
      cleanDevName = `⏳ Esperando conexión (${typeBadge})`;
    } else {
      if (!cleanDevName || cleanDevName.startsWith('Esperando conexión')) {
        cleanDevName = dev.model || 'Dispositivo Conectado';
      }
      cleanDevName = `${typeBadge} • ${cleanDevName}`;
    }
    const childDisplayName = dev.childName || (dev.id === 'KID-PHONE-01' ? 'Seba' : (dev.name || 'Hijo'));

    return `
      <div class="child-family-card ${isSelected ? 'is-active-device' : ''}" id="familyChildCard-${dev.id}">
        <div class="family-card-top">
          <div class="family-card-profile">
            <div class="family-card-avatar">${dev.avatar || (isTablet ? '📟' : '👦')}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <h4 class="family-card-name">${childDisplayName}</h4>
                <button type="button" class="btn-icon-edit" onclick="openEditChildModal('${dev.id}')" title="Modificar nombre o dispositivo" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 6px; padding: 2px 6px; font-size: 0.72rem; color: #a5b4fc; cursor: pointer;">
                  ✏️ Editar
                </button>
              </div>
              <p class="family-card-devname">${cleanDevName} • <span style="color: #94a3b8; font-size: 0.74rem;">${getFriendlyDeviceSerial(dev)}</span></p>
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

        <!-- Acciones Secundarias (Editar, QR y Desvincular) -->
        <div class="family-card-aux-row">
          <button class="btn btn-outline btn-sm" onclick="openEditChildModal('${dev.id}')" style="font-size: 0.78rem;">
            ✏️ Modificar Perfil
          </button>
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
  openUnlinkDeviceModal(devId);
}

// ----------------------------------------------------------------
// Edición de Perfil de Hijo y Dispositivo (Mi Familia)
// ----------------------------------------------------------------
let selectedEditAvatar = '👦';

function openEditChildModal(devId) {
  const dev = devicesList.find(d => d.id === devId) || currentDevice;
  if (!dev) return;

  const modal = document.getElementById('modalEditChildProfile');
  if (!modal) return;

  const hiddenId = document.getElementById('editChildDeviceId');
  const inputName = document.getElementById('inputEditChildName');
  const inputDevice = document.getElementById('inputEditDeviceName');
  const radioCelular = document.getElementById('editTypeCelular');
  const radioTablet = document.getElementById('editTypeTablet');

  if (hiddenId) hiddenId.value = dev.id;

  const defaultChildName = dev.childName || (dev.id === 'KID-PHONE-01' ? 'Seba' : (dev.name || 'Hijo'));
  if (inputName) inputName.value = defaultChildName;
  if (inputDevice) {
    let devClean = dev.name || '';
    if (devClean.startsWith('Esperando conexión')) devClean = dev.model || '';
    inputDevice.value = devClean;
  }

  if (dev.deviceType === 'tablet') {
    if (radioTablet) radioTablet.checked = true;
  } else {
    if (radioCelular) radioCelular.checked = true;
  }

  selectedEditAvatar = dev.avatar || (dev.deviceType === 'tablet' ? '📟' : '👦');
  const avatarBtns = document.querySelectorAll('#editChildAvatarPicker .avatar-option-btn');
  avatarBtns.forEach(btn => {
    if (btn.getAttribute('data-avatar') === selectedEditAvatar) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  modal.classList.add('active');
}

function closeEditChildModal() {
  const modal = document.getElementById('modalEditChildProfile');
  if (modal) modal.classList.remove('active');
}

async function saveChildProfile() {
  const devId = document.getElementById('editChildDeviceId')?.value;
  if (!devId) return;

  const childName = document.getElementById('inputEditChildName')?.value.trim();
  const deviceName = document.getElementById('inputEditDeviceName')?.value.trim();
  const isTablet = document.getElementById('editTypeTablet')?.checked;
  const deviceType = isTablet ? 'tablet' : 'celular';
  const avatar = selectedEditAvatar || '👦';

  if (!childName) {
    showToast('Ingresa el nombre del hijo/a', 'warning');
    return;
  }

  try {
    const res = await apiFetch(`/api/devices/${devId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childName,
        name: deviceName || undefined,
        deviceType,
        avatar
      })
    });

    if (res.ok) {
      const data = await res.json();
      const updated = data.device;
      const idx = devicesList.findIndex(d => d.id === devId);
      if (idx !== -1) {
        devicesList[idx] = { ...devicesList[idx], ...updated };
      }
      if (currentDevice && currentDevice.id === devId) {
        currentDevice = { ...currentDevice, ...updated };
      }

      closeEditChildModal();
      renderFamilyChildrenCards();
      renderFamilyOverviewCards();
      renderHeader();
      renderChildContextSelects();
      showToast(`✅ Perfil de "${childName}" actualizado con éxito`, 'success');
    } else {
      showToast('Error al guardar cambios de perfil', 'danger');
    }
  } catch (err) {
    console.error('Error guardando perfil de hijo:', err);
    showToast('Error de conexión al guardar cambios', 'danger');
  }
}

// ----------------------------------------------------------------
// Selección de Punto en el Mapa para Lugares y Geocercas
// ----------------------------------------------------------------
let tempGeofenceMarker = null;

function setupMapClickListener(mapInstance) {
  if (!mapInstance || mapInstance._hasClickGeofenceListener) return;
  mapInstance._hasClickGeofenceListener = true;

  mapInstance.on('click', function(e) {
    if (!e || !e.latlng) return;
    const lat = Number(e.latlng.lat.toFixed(6));
    const lng = Number(e.latlng.lng.toFixed(6));

    if (tempGeofenceMarker) {
      try {
        if (dedicatedLeafletMap) dedicatedLeafletMap.removeLayer(tempGeofenceMarker);
        if (leafletMap) leafletMap.removeLayer(tempGeofenceMarker);
      } catch (err) {}
      tempGeofenceMarker = null;
    }

    const popupHtml = `
      <div style="font-family: inherit; min-width: 190px; text-align: center; padding: 6px 4px;">
        <div style="font-weight: 700; color: #0f172a; font-size: 0.92rem; margin-bottom: 4px;">📍 Punto Seleccionado</div>
        <div style="font-size: 0.76rem; color: #475569; margin-bottom: 8px; line-height: 1.3;">
          Lat: <strong>${lat}</strong><br>Lng: <strong>${lng}</strong>
        </div>
        <button id="btnCreateGeoAtClick" class="btn btn-primary btn-sm" style="font-size: 0.78rem; width: 100%; padding: 5px 8px; cursor: pointer; border-radius: 6px;">
          ➕ Establecer Geocerca Aquí
        </button>
      </div>
    `;

    tempGeofenceMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'custom-pin-point',
        html: '<div style="background: #4f46e5; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 2.5px solid white; box-shadow: 0 4px 14px rgba(0,0,0,0.4); cursor: pointer;">📍</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 34]
      })
    }).addTo(mapInstance).bindPopup(popupHtml).openPopup();

    setTimeout(() => {
      const btn = document.getElementById('btnCreateGeoAtClick');
      if (btn) {
        btn.onclick = () => {
          openGeofenceManagerWithCoords(lat, lng);
        };
      }
    }, 120);
  });
}

function openGeofenceManagerWithCoords(lat, lng) {
  const modal = document.getElementById('modalGeofenceManager');
  if (!modal) return;
  const latInput = document.getElementById('inputGeofenceLat');
  const lngInput = document.getElementById('inputGeofenceLng');
  const nameInput = document.getElementById('inputGeofenceName');
  if (latInput) latInput.value = lat;
  if (lngInput) lngInput.value = lng;
  if (nameInput) {
    nameInput.value = 'Lugar Seguro 📍';
  }
  modal.classList.add('active');
  showToast(`Punto seleccionado: Lat ${lat}, Lng ${lng}. Asigna un nombre a la geocerca.`, 'info');
}

// ----------------------------------------------------------------
// Captura Automática Periódica (Multimedia: Foto, Video 5s, Audio)
// ----------------------------------------------------------------
let autoCaptureTimer = null;
let autoCaptureCountdownTimer = null;
let autoCaptureSecondsLeft = 0;
let sequenceStateToggle = false;

function toggleAutoCapture() {
  if (autoCaptureTimer) {
    stopAutoCapture();
  } else {
    startAutoCapture();
  }
}

function startAutoCapture() {
  if (!currentDevice) {
    showToast('Selecciona un dispositivo primero', 'warning');
    return;
  }
  const typeSelect = document.getElementById('autoCaptureTypeSelect');
  const intervalSelect = document.getElementById('autoCaptureIntervalSelect');
  const type = typeSelect ? typeSelect.value : 'photo';
  const intervalSeconds = intervalSelect ? parseInt(intervalSelect.value, 10) : 60;

  const btnText = document.getElementById('btnAutoCaptureText');
  const btnIcon = document.getElementById('btnAutoCaptureIcon');
  const liveBadge = document.getElementById('autoCaptureLiveBadge');
  const statusMsg = document.getElementById('autoCaptureStatusMsg');
  const toggleBtn = document.getElementById('btnToggleAutoCapture');

  if (toggleBtn) {
    toggleBtn.classList.remove('btn-primary');
    toggleBtn.classList.add('btn-danger');
    toggleBtn.style.background = '#ef4444';
  }
  if (btnText) btnText.textContent = 'Detener Auto';
  if (btnIcon) btnIcon.textContent = '⏹';
  if (liveBadge) {
    liveBadge.textContent = 'ACTIVA';
    liveBadge.style.background = 'rgba(239, 68, 68, 0.2)';
    liveBadge.style.color = '#f87171';
  }

  // Disparar la primera captura de inmediato
  executeAutoCaptureStep(type);

  autoCaptureSecondsLeft = intervalSeconds;
  updateCountdownStatus(statusMsg, type, autoCaptureSecondsLeft);

  if (autoCaptureCountdownTimer) clearInterval(autoCaptureCountdownTimer);
  autoCaptureCountdownTimer = setInterval(() => {
    autoCaptureSecondsLeft--;
    if (autoCaptureSecondsLeft <= 0) {
      autoCaptureSecondsLeft = intervalSeconds;
      executeAutoCaptureStep(type);
    }
    updateCountdownStatus(statusMsg, type, autoCaptureSecondsLeft);
  }, 1000);

  autoCaptureTimer = true;
  showToast(`🔄 Captura automática iniciada cada ${intervalSeconds}s (${type})`, 'success');
}

function updateCountdownStatus(statusEl, type, seconds) {
  if (!statusEl) return;
  const typeNames = {
    photo: '📸 Fotos',
    video: '🎥 Videos de 5s',
    audio: '🎙️ Audios de 5s',
    sequence: '🔄 Secuencia (Foto + Audio)'
  };
  statusEl.innerHTML = `<span style="color: #34d399; font-weight: 600;">● Ejecutando (${typeNames[type] || type}):</span> próxima captura en <strong>${seconds}s</strong>`;
}

function stopAutoCapture() {
  if (autoCaptureCountdownTimer) {
    clearInterval(autoCaptureCountdownTimer);
    autoCaptureCountdownTimer = null;
  }
  autoCaptureTimer = null;

  const btnText = document.getElementById('btnAutoCaptureText');
  const btnIcon = document.getElementById('btnAutoCaptureIcon');
  const liveBadge = document.getElementById('autoCaptureLiveBadge');
  const statusMsg = document.getElementById('autoCaptureStatusMsg');
  const toggleBtn = document.getElementById('btnToggleAutoCapture');

  if (toggleBtn) {
    toggleBtn.classList.remove('btn-danger');
    toggleBtn.classList.add('btn-primary');
    toggleBtn.style.background = '';
  }
  if (btnText) btnText.textContent = 'Iniciar Auto';
  if (btnIcon) btnIcon.textContent = '▶';
  if (liveBadge) {
    liveBadge.textContent = 'Inactiva';
    liveBadge.style.background = 'rgba(148, 163, 184, 0.2)';
    liveBadge.style.color = 'var(--text-muted)';
  }
  if (statusMsg) {
    statusMsg.textContent = 'Programa capturas automáticas constantes sin intervención manual';
  }
  showToast('Captura automática periódica detenida', 'info');
}

function executeAutoCaptureStep(type) {
  if (!currentDevice) return;
  if (type === 'photo') {
    requestScreenshotNow();
  } else if (type === 'video') {
    requestVideo5s();
  } else if (type === 'audio') {
    requestAudio5s();
  } else if (type === 'sequence') {
    if (!sequenceStateToggle) {
      requestScreenshotNow();
    } else {
      requestAudio5s();
    }
    sequenceStateToggle = !sequenceStateToggle;
  }
  setTimeout(() => {
    if (typeof fetchAndRenderMultimediaGallery === 'function') {
      fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
    }
  }, 2500);
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

  if (!mapContainer || typeof L === 'undefined') return;

  // Si el contenedor fue reinicializado en el DOM, limpiar _leaflet_id para evitar error Leaflet
  if (mapContainer._leaflet_id && !dedicatedLeafletMap) {
    mapContainer._leaflet_id = null;
    mapContainer.innerHTML = '';
  }

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
    const hasValidCoords = loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number';
    const lat = hasValidCoords ? loc.latitude : -33.4489;
    const lng = hasValidCoords ? loc.longitude : -70.6693;
    const accuracy = (loc && loc.accuracy) || 15;

    if (hasValidCoords) {
      if (addressEl) addressEl.textContent = `📍 ${loc.address || 'Ubicación satelital en vivo'}`;
      if (lastUpdateEl && loc.lastUpdated) {
        const d = new Date(loc.lastUpdated);
        lastUpdateEl.textContent = `Último reporte: ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      }
    } else {
      if (addressEl) addressEl.textContent = '📍 Esperando primera coordenada satelital GPS...';
      if (lastUpdateEl) lastUpdateEl.textContent = 'Sin señal satelital aún';
    }

    try {
      if (!dedicatedLeafletMap) {
        dedicatedLeafletMap = L.map('mapLeafletDedicated', { zoomControl: true }).setView([lat, lng], hasValidCoords ? 15 : 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(dedicatedLeafletMap);

        if (hasValidCoords) {
          dedicatedMarker = L.marker([lat, lng]).addTo(dedicatedLeafletMap)
            .bindPopup(`<b>${currentDevice.childName || currentDevice.name}</b><br>Ubicación GPS en vivo`)
            .openPopup();

          dedicatedCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.15
          }).addTo(dedicatedLeafletMap);
        }
      } else {
        dedicatedLeafletMap.setView([lat, lng], hasValidCoords ? 15 : 12);
        if (hasValidCoords) {
          if (!dedicatedMarker) {
            dedicatedMarker = L.marker([lat, lng]).addTo(dedicatedLeafletMap);
          } else {
            dedicatedMarker.setLatLng([lat, lng]);
          }
          dedicatedMarker.setPopupContent(`<b>${currentDevice.childName || currentDevice.name}</b><br>Ubicación GPS en vivo`);

          if (!dedicatedCircle) {
            dedicatedCircle = L.circle([lat, lng], {
              radius: accuracy,
              color: '#10b981',
              fillColor: '#10b981',
              fillOpacity: 0.15
            }).addTo(dedicatedLeafletMap);
          } else {
            dedicatedCircle.setLatLng([lat, lng]);
            dedicatedCircle.setRadius(accuracy);
          }
        }
      }

      // Reajustar dimensiones ante transiciones de pestaña
      [50, 150, 300, 600].forEach(ms => {
        setTimeout(() => {
          if (dedicatedLeafletMap) dedicatedLeafletMap.invalidateSize();
        }, ms);
      });

      // Dibujar geocercas en el mapa dedicado
      if (areGeofencesVisible && typeof fetchAndRenderGeofences === 'function') {
        fetchAndRenderGeofences();
      }
      if (isRouteHistoryVisible && typeof fetchAndRenderRouteHistory === 'function') {
        fetchAndRenderRouteHistory();
      }
      // Permitir hacer clic en cualquier punto del mapa para establecer geocerca
      if (dedicatedLeafletMap && typeof setupMapClickListener === 'function') {
        setupMapClickListener(dedicatedLeafletMap);
      }
    } catch (e) {
      console.error('[Map] Error inicializando mapa dedicado:', e);
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

  let filtered = multimediaItems.filter(item => matchesDateFilter(item.timestamp, selectedMultimediaDate));
  if (filter === 'image') filtered = filtered.filter(item => item.type === 'image');
  if (filter === 'video') filtered = filtered.filter(item => item.type === 'video');
  if (filter === 'audio') filtered = filtered.filter(item => item.type === 'audio');

  if (filtered.length === 0) {
    let dateLabel = selectedMultimediaDate === 'today' ? 'de hoy' : (selectedMultimediaDate === 'yesterday' ? 'de ayer' : (selectedMultimediaDate === 'all' ? '' : `del día ${selectedMultimediaDate}`));
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.08);">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">📂</div>
        <h4 style="color: #fff; margin: 0 0 6px 0;">No hay elementos multimedia ${dateLabel}</h4>
        <p style="color: var(--text-muted); font-size: 0.84rem; margin: 0;">Prueba seleccionando otro día o pulsando "Todos".</p>
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
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-outline btn-sm" style="padding: 3px 10px; font-size: 0.75rem;" onclick="openMediaPreviewByIndex(${idx})">
              ${isImg ? '🔍 Ver' : isVid ? '▶️ Reproducir' : '🔊 Escuchar'}
            </button>
            <button class="btn btn-outline btn-sm" style="padding: 3px 8px; font-size: 0.75rem; color: #f87171; border-color: rgba(239, 68, 68, 0.4);" onclick="deleteMultimediaItemClick('${item.id}')" title="Eliminar registro">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteMultimediaItemClick = async function(mediaId) {
  if (!currentDevice) return;
  if (!confirm('¿Deseas eliminar este registro multimedia permanentemente?')) return;
  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/multimedia/${encodeURIComponent(mediaId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      multimediaItems = multimediaItems.filter(m => m.id !== mediaId);
      const box = document.getElementById('multimediaPreviewBox');
      if (box) box.style.display = 'none';
      renderMultimediaGrid(activeMultimediaFilter || 'all');
      showToast('Archivo multimedia eliminado correctamente', 'success');
    } else {
      showToast('No se pudo eliminar el archivo', 'danger');
    }
  } catch (err) {
    console.error('Error eliminando multimedia:', err);
    showToast('Error de conexión', 'danger');
  }
};

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
let activeHistoryTabFilter = 'all';
let cachedLocationHistory = null;
let lastLocationHistoryFetch = 0;

function calculateDistanceMetersClient(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseLogTimeToTimestamp(timeStr) {
  if (!timeStr) return 0;
  if (timeStr.includes('T') || timeStr.includes('-')) {
    const t = new Date(timeStr).getTime();
    if (!isNaN(t)) return t;
  }
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    const d = new Date();
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2] || 0, 10), 0);
    return d.getTime();
  }
  return 0;
}

async function fetchLocationHistoryForHistoryTab() {
  if (!currentDevice) return [];
  const now = Date.now();
  if (cachedLocationHistory && (now - lastLocationHistoryFetch < 8000)) {
    return cachedLocationHistory;
  }
  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/location-history`);
    if (res.ok) {
      const data = await res.json();
      cachedLocationHistory = Array.isArray(data) ? data : [];
      lastLocationHistoryFetch = now;
      return cachedLocationHistory;
    }
  } catch (e) {
    console.error('Error obteniendo historial GPS para la pestaña de historial:', e);
  }
  return cachedLocationHistory || [];
}

function switchMonitoringView(viewName) {
  if (typeof switchDashboardView === 'function') {
    switchDashboardView(viewName);
  } else {
    const navBtn = document.querySelector(`.sidebar-nav-item[data-view="${viewName}"]`) || document.getElementById('sidebarNavMap');
    if (navBtn) navBtn.click();
  }
}
window.switchMonitoringView = switchMonitoringView;

function viewLocationOnMap(lat, lng, label) {
  switchMonitoringView('map');
  setTimeout(() => {
    const mapInstance = (typeof dedicatedLeafletMap !== 'undefined' && dedicatedLeafletMap) ? dedicatedLeafletMap : (typeof leafletMap !== 'undefined' ? leafletMap : null);
    if (mapInstance) {
      mapInstance.setView([lat, lng], 17);
      if (typeof L !== 'undefined') {
        L.popup()
          .setLatLng([lat, lng])
          .setContent(`<strong>📍 Registro Histórico GPS</strong><br>${label ? `Hora: ${label}<br>` : ''}<small>Lat: ${Number(lat).toFixed(5)}, Lng: ${Number(lng).toFixed(5)}</small>`)
          .openOn(mapInstance);
      }
    }
  }, 300);
}
window.viewLocationOnMap = viewLocationOnMap;

function setupHistoryTabFilters() {
  const filterPills = document.querySelectorAll('#historyTabFilterPills .filter-pill');
  filterPills.forEach(btn => {
    btn.addEventListener('click', () => {
      filterPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeHistoryTabFilter = btn.dataset.type || 'all';
      renderHistoryTab();
    });
  });
}

function setupDateFilterListeners() {
  // 1. Multimedia Date Filters
  const mediaBtnToday = document.getElementById('btnMediaDateToday');
  const mediaBtnYesterday = document.getElementById('btnMediaDateYesterday');
  const mediaBtnAll = document.getElementById('btnMediaDateAll');
  const mediaInputDate = document.getElementById('inputMediaDate');
  const mediaBtns = [mediaBtnToday, mediaBtnYesterday, mediaBtnAll];

  function setMediaDateActive(activeBtn, dateValue) {
    mediaBtns.forEach(b => { if (b) b.classList.remove('active'); });
    if (activeBtn) activeBtn.classList.add('active');
    selectedMultimediaDate = dateValue;
    if (typeof fetchAndRenderMultimediaGallery === 'function') {
      renderMultimediaGrid(activeMultimediaFilter || 'all');
    }
  }

  if (mediaBtnToday) {
    mediaBtnToday.addEventListener('click', () => {
      if (mediaInputDate) mediaInputDate.value = '';
      setMediaDateActive(mediaBtnToday, 'today');
    });
  }
  if (mediaBtnYesterday) {
    mediaBtnYesterday.addEventListener('click', () => {
      if (mediaInputDate) mediaInputDate.value = '';
      setMediaDateActive(mediaBtnYesterday, 'yesterday');
    });
  }
  if (mediaBtnAll) {
    mediaBtnAll.addEventListener('click', () => {
      if (mediaInputDate) mediaInputDate.value = '';
      setMediaDateActive(mediaBtnAll, 'all');
    });
  }
  if (mediaInputDate) {
    mediaInputDate.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        mediaBtns.forEach(b => { if (b) b.classList.remove('active'); });
        selectedMultimediaDate = val;
        if (typeof fetchAndRenderMultimediaGallery === 'function') {
          renderMultimediaGrid(activeMultimediaFilter || 'all');
        }
      }
    });
  }

  // 2. History Date Filters
  const histBtnToday = document.getElementById('btnHistoryDateToday');
  const histBtnYesterday = document.getElementById('btnHistoryDateYesterday');
  const histBtnAll = document.getElementById('btnHistoryDateAll');
  const histInputDate = document.getElementById('inputHistoryDate');
  const histBtns = [histBtnToday, histBtnYesterday, histBtnAll];

  function setHistDateActive(activeBtn, dateValue) {
    histBtns.forEach(b => { if (b) b.classList.remove('active'); });
    if (activeBtn) activeBtn.classList.add('active');
    selectedHistoryDate = dateValue;
    renderHistoryTab();
  }

  if (histBtnToday) {
    histBtnToday.addEventListener('click', () => {
      if (histInputDate) histInputDate.value = '';
      setHistDateActive(histBtnToday, 'today');
    });
  }
  if (histBtnYesterday) {
    histBtnYesterday.addEventListener('click', () => {
      if (histInputDate) histInputDate.value = '';
      setHistDateActive(histBtnYesterday, 'yesterday');
    });
  }
  if (histBtnAll) {
    histBtnAll.addEventListener('click', () => {
      if (histInputDate) histInputDate.value = '';
      setHistDateActive(histBtnAll, 'all');
    });
  }
  if (histInputDate) {
    histInputDate.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val) {
        histBtns.forEach(b => { if (b) b.classList.remove('active'); });
        selectedHistoryDate = val;
        renderHistoryTab();
      }
    });
  }
}

function setupSoundSettingsListeners() {
  const toggleSound = document.getElementById('settingsToggleSoundNotifications');
  const btnTestSound = document.getElementById('btnTestNotificationSound');

  if (toggleSound) {
    toggleSound.checked = notificationSoundEnabled;
    toggleSound.addEventListener('change', (e) => {
      notificationSoundEnabled = Boolean(e.target.checked);
      localStorage.setItem('kidsshield_sound_enabled', notificationSoundEnabled ? 'true' : 'false');
      if (notificationSoundEnabled) {
        showToast('🔊 Sonido de notificaciones activado', 'success');
        playAlertSound(true);
      } else {
        showToast('🔇 Sonido de notificaciones silenciado', 'info');
      }
    });
  }

  if (btnTestSound) {
    btnTestSound.addEventListener('click', () => {
      playAlertSound(true);
      showToast('🔔 Probando sonido de alerta...', 'info');
    });
  }
}

// ----------------------------------------------------------------
// Historial de Tiempo de Uso de Aplicaciones por Fecha
// ----------------------------------------------------------------
async function fetchAndRenderAppUsage(date = 'today') {
  selectedAppUsageDate = date;
  const container = document.getElementById('appUsageListContainer');
  if (!container) return;

  if (!currentDevice) {
    container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Sin dispositivo seleccionado</div>`;
    return;
  }

  const childName = currentDevice.childName || currentDevice.name || 'este menor';
  container.innerHTML = `
    <div style="text-align: center; padding: 20px 14px; color: var(--text-muted);">
      <div style="font-size: 1.4rem; margin-bottom: 4px;">⏳</div>
      <p style="font-size: 0.8rem; margin: 0;">Consultando aplicaciones de ${childName}...</p>
    </div>
  `;

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/app-usage?date=${encodeURIComponent(date)}`);
    if (res.ok) {
      const data = await res.json();
      const apps = data.apps || [];
      const totalMins = data.totalScreenTimeMinutes || 0;

      if (apps.length === 0 || totalMins === 0) {
        let dateLabel = date === 'today' ? 'de hoy' : (date === 'yesterday' ? 'de ayer' : `del ${date}`);
        container.innerHTML = `
          <div style="text-align: center; padding: 24px 16px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px dashed rgba(255,255,255,0.08);">
            <div style="font-size: 2rem; margin-bottom: 6px;">📱</div>
            <p style="color: #cbd5e1; font-size: 0.88rem; margin: 0 0 4px 0;">Sin uso registrado ${dateLabel}</p>
            <p style="color: var(--text-muted); font-size: 0.78rem; margin: 0;">${childName} no tiene aplicaciones abiertas en esta fecha o el teléfono estuvo en reposo.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = apps.filter(a => a.timeMinutes > 0).map(a => {
        const percent = totalMins > 0 ? Math.min(100, Math.round((a.timeMinutes / totalMins) * 100)) : 0;
        const hasLimit = a.limitMinutes > 0;
        const isOverLimit = hasLimit && a.timeMinutes >= a.limitMinutes;
        const barColor = isOverLimit ? '#ef4444' : (a.isBlocked ? '#f87171' : '#6366f1');

        return `
          <div class="app-usage-row" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.3rem;">${a.icon || '📱'}</span>
                <div>
                  <span style="font-weight: 600; font-size: 0.9rem; color: #fff;">${a.name}</span>
                  <span style="font-size: 0.74rem; color: var(--text-muted); margin-left: 6px;">${a.category || 'App'}</span>
                </div>
              </div>
              <div style="text-align: right;">
                <span style="font-weight: 700; font-size: 0.88rem; color: ${isOverLimit ? '#f87171' : '#a5b4fc'};">${formatMinutes(a.timeMinutes)}</span>
                ${hasLimit ? `<div style="font-size: 0.72rem; color: ${isOverLimit ? '#f87171' : '#94a3b8'};">Límite: ${formatMinutes(a.limitMinutes)} ${isOverLimit ? '(Agotado)' : ''}</div>` : ''}
              </div>
            </div>
            <!-- Barra de progreso visual -->
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden;">
              <div style="width: ${percent}%; height: 100%; background: ${barColor}; border-radius: 999px; transition: width 0.4s ease;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error cargando app-usage:', err);
    container.innerHTML = `<div style="text-align: center; padding: 16px; color: #f87171; font-size: 0.85rem;">Error al cargar tiempo de apps</div>`;
  }
}

// ----------------------------------------------------------------
// Registro de Teclado, Búsquedas y Mensajes (Keylogger Ético)
// ----------------------------------------------------------------
let keystrokesCache = [];

async function fetchAndRenderKeystrokes(date = 'today') {
  selectedKeystrokesDate = date;
  const container = document.getElementById('keystrokesListContainer');
  if (!container) return;

  if (!currentDevice) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);"><span style="font-size: 2rem;">⌨️</span><br>Sin dispositivo seleccionado</div>`;
    return;
  }

  container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);"><span style="font-size: 1.5rem;">⏳</span><br>Cargando registros de texto...</div>`;

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/keystrokes?date=${encodeURIComponent(date)}`);
    if (res.ok) {
      const data = await res.json();
      keystrokesCache = data.entries || [];
      renderKeystrokesList();
    } else {
      container.innerHTML = `<div style="text-align: center; padding: 30px; color: #f87171;">No se pudieron consultar los registros de teclado</div>`;
    }
  } catch (err) {
    console.error('Error cargando keystrokes:', err);
    container.innerHTML = `<div style="text-align: center; padding: 30px; color: #f87171;">Error al consultar registros de teclado</div>`;
  }
}

function renderKeystrokesList() {
  const container = document.getElementById('keystrokesListContainer');
  if (!container) return;

  let filtered = keystrokesCache;

  // Filtro de app
  if (keystrokesFilterApp && keystrokesFilterApp !== 'all') {
    filtered = filtered.filter(item => {
      const pkg = (item.package || '').toLowerCase();
      const app = (item.appName || '').toLowerCase();
      return pkg.includes(keystrokesFilterApp) || app.includes(keystrokesFilterApp);
    });
  }

  // Filtro de búsqueda
  if (keystrokesSearchQuery) {
    const q = keystrokesSearchQuery.toLowerCase();
    filtered = filtered.filter(item => (item.text || '').toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    let dateLabel = selectedKeystrokesDate === 'today' ? 'de hoy' : (selectedKeystrokesDate === 'yesterday' ? 'de ayer' : (selectedKeystrokesDate === 'all' ? '' : `del día ${selectedKeystrokesDate}`));
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.08);">
        <div style="font-size: 2.5rem; margin-bottom: 10px;">⌨️</div>
        <h4 style="color: #fff; margin: 0 0 6px 0;">No hay textos registrados ${dateLabel}</h4>
        <p style="color: var(--text-muted); font-size: 0.84rem; margin: 0;">Los textos que el menor escriba en redes sociales, WhatsApp o búsquedas aparecerán aquí en tiempo real.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(item => {
    const isAlert = Boolean(item.isAlert);
    const borderStyle = isAlert ? 'border: 1px solid rgba(239, 68, 68, 0.45); background: rgba(239, 68, 68, 0.06);' : 'border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.025);';

    let appIcon = '📱';
    const pkgLower = (item.package || '').toLowerCase();
    if (pkgLower.includes('whatsapp')) appIcon = '💬';
    else if (pkgLower.includes('instagram')) appIcon = '📸';
    else if (pkgLower.includes('chrome') || pkgLower.includes('browser')) appIcon = '🌐';
    else if (pkgLower.includes('youtube')) appIcon = '🎬';
    else if (pkgLower.includes('tiktok')) appIcon = '🎵';

    return `
      <div class="keystroke-card" style="border-radius: 10px; padding: 12px 14px; ${borderStyle}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.1rem;">${appIcon}</span>
            <span style="font-weight: 600; font-size: 0.86rem; color: #f1f5f9;">${item.appName || 'Aplicación'}</span>
            ${isAlert ? `<span style="font-size: 0.72rem; background: rgba(239, 68, 68, 0.25); color: #fca5a5; padding: 2px 8px; border-radius: 4px; font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.35);">⚠️ Alerta de Riesgo</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.76rem; color: var(--text-muted);">${item.time || ''} • ${item.date || ''}</span>
            <button class="btn btn-outline btn-sm" style="padding: 2px 6px; font-size: 0.72rem; color: #f87171; border-color: rgba(239, 68, 68, 0.35); cursor: pointer;" onclick="deleteKeystrokeItemClick('${item.id}')" title="Eliminar este texto">
              🗑️
            </button>
          </div>
        </div>
        <div style="background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 8px; font-size: 0.88rem; color: #fff; line-height: 1.4; word-break: break-word;">
          "${item.text}"
        </div>
        ${isAlert && item.alertCategory ? `<div style="font-size: 0.74rem; color: #f87171; margin-top: 5px;">🚨 Motivo: ${item.alertCategory}</div>` : ''}
      </div>
    `;
  }).join('');
}

window.deleteKeystrokeItemClick = async function(keyId) {
  if (!currentDevice) return;
  if (!confirm('¿Eliminar este registro de texto?')) return;
  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/keystrokes/${encodeURIComponent(keyId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      keystrokesCache = keystrokesCache.filter(k => k.id !== keyId);
      renderKeystrokesList();
      showToast('Registro de texto eliminado', 'success');
    } else {
      showToast('No se pudo eliminar el registro', 'danger');
    }
  } catch (err) {
    showToast('Error de conexión al eliminar', 'danger');
  }
};

function setupAppUsageAndKeystrokesListeners() {
  // 1. App Usage Date Listeners
  const btnAppToday = document.getElementById('btnAppUsageToday');
  const btnAppYesterday = document.getElementById('btnAppUsageYesterday');
  const inputAppDate = document.getElementById('inputAppUsageDate');
  const appBtns = [btnAppToday, btnAppYesterday];

  function setAppUsageActive(btn, dateVal) {
    appBtns.forEach(b => { if (b) b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    fetchAndRenderAppUsage(dateVal);
  }

  if (btnAppToday) {
    btnAppToday.addEventListener('click', () => {
      if (inputAppDate) inputAppDate.value = '';
      setAppUsageActive(btnAppToday, 'today');
    });
  }
  if (btnAppYesterday) {
    btnAppYesterday.addEventListener('click', () => {
      if (inputAppDate) inputAppDate.value = '';
      setAppUsageActive(btnAppYesterday, 'yesterday');
    });
  }
  if (inputAppDate) {
    inputAppDate.addEventListener('change', (e) => {
      if (e.target.value) {
        appBtns.forEach(b => { if (b) b.classList.remove('active'); });
        fetchAndRenderAppUsage(e.target.value);
      }
    });
  }

  // 2. Keystrokes Listeners
  const btnKeyToday = document.getElementById('btnKeyDateToday');
  const btnKeyYesterday = document.getElementById('btnKeyDateYesterday');
  const btnKeyAll = document.getElementById('btnKeyDateAll');
  const inputKeyDate = document.getElementById('inputKeyDate');
  const keyBtns = [btnKeyToday, btnKeyYesterday, btnKeyAll];

  function setKeyDateActive(btn, dateVal) {
    keyBtns.forEach(b => { if (b) b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    fetchAndRenderKeystrokes(dateVal);
  }

  if (btnKeyToday) {
    btnKeyToday.addEventListener('click', () => {
      if (inputKeyDate) inputKeyDate.value = '';
      setKeyDateActive(btnKeyToday, 'today');
    });
  }
  if (btnKeyYesterday) {
    btnKeyYesterday.addEventListener('click', () => {
      if (inputKeyDate) inputKeyDate.value = '';
      setKeyDateActive(btnKeyYesterday, 'yesterday');
    });
  }
  if (btnKeyAll) {
    btnKeyAll.addEventListener('click', () => {
      if (inputKeyDate) inputKeyDate.value = '';
      setKeyDateActive(btnKeyAll, 'all');
    });
  }
  if (inputKeyDate) {
    inputKeyDate.addEventListener('change', (e) => {
      if (e.target.value) {
        keyBtns.forEach(b => { if (b) b.classList.remove('active'); });
        fetchAndRenderKeystrokes(e.target.value);
      }
    });
  }

  const searchKeyInput = document.getElementById('inputKeySearch');
  if (searchKeyInput) {
    searchKeyInput.addEventListener('input', (e) => {
      keystrokesSearchQuery = e.target.value.trim();
      renderKeystrokesList();
    });
  }

  const selectKeyApp = document.getElementById('selectKeyAppFilter');
  if (selectKeyApp) {
    selectKeyApp.addEventListener('change', (e) => {
      keystrokesFilterApp = e.target.value;
      renderKeystrokesList();
    });
  }

  const btnKeyClearAll = document.getElementById('btnKeyClearAll');
  if (btnKeyClearAll) {
    btnKeyClearAll.addEventListener('click', async () => {
      if (!currentDevice) return;
      if (!confirm('¿Estás seguro de que deseas vaciar todos los textos y búsquedas capturados de este menor?')) return;
      try {
        const res = await apiFetch(`/api/devices/${currentDevice.id}/keystrokes`, { method: 'DELETE' });
        if (res.ok) {
          keystrokesCache = [];
          renderKeystrokesList();
          showToast('Registro de textos vaciado con éxito', 'success');
        } else {
          showToast('No se pudo vaciar el registro', 'danger');
        }
      } catch (err) {
        showToast('Error de conexión al vaciar textos', 'danger');
      }
    });
  }
}

async function renderHistoryTab() {
  const feed = document.getElementById('historyTabActivityFeed');
  if (!feed) return;

  if (!currentDevice) {
    feed.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <span style="font-size: 2rem;">🕒</span><br>Sin dispositivo seleccionado
      </div>
    `;
    return;
  }

  // 1. Eventos estándar
  const standardLogs = (currentDevice.activityLog || []).map(item => ({
    ...item,
    sortTimestamp: item.sortTimestamp || item.timestamp || parseLogTimeToTimestamp(item.time)
  }));

  // 2. Obtener historial GPS
  const gpsRaw = await fetchLocationHistoryForHistoryTab();
  const sortedGpsDesc = [...gpsRaw].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Muestrear puntos GPS para no saturar la vista si estuvo detenido
  const sampledGps = [];
  let lastGps = null;
  for (const loc of sortedGpsDesc) {
    if (!loc.latitude || !loc.longitude) continue;
    if (!lastGps) {
      sampledGps.push(loc);
      lastGps = loc;
    } else {
      const dist = calculateDistanceMetersClient(loc.latitude, loc.longitude, lastGps.latitude, lastGps.longitude);
      const timeDiff = Math.abs(new Date(loc.timestamp).getTime() - new Date(lastGps.timestamp).getTime());
      if (dist >= 15 || timeDiff >= 120000) {
        sampledGps.push(loc);
        lastGps = loc;
      }
    }
  }

  const gpsLogs = sampledGps.map(loc => {
    const d = loc.timestamp ? new Date(loc.timestamp) : new Date();
    const timeStr = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const lat = Number(loc.latitude).toFixed(5);
    const lng = Number(loc.longitude).toFixed(5);
    const acc = Math.round(loc.accuracy || 10);
    const addr = loc.address && !loc.address.includes('satelital') ? loc.address : 'Ubicación GPS Satelital';
    return {
      time: timeStr,
      type: 'gps',
      appName: '📍 GPS y Ubicación',
      package: 'system.gps',
      message: `${addr} • Lat: ${lat}, Lng: ${lng} (±${acc}m)`,
      latitude: loc.latitude,
      longitude: loc.longitude,
      sortTimestamp: d.getTime()
    };
  });

  // 3. Unificar y ordenar cronológicamente inverso
  const unified = [...standardLogs, ...gpsLogs].sort((a, b) => (b.sortTimestamp || 0) - (a.sortTimestamp || 0));

  if (unified.length === 0) {
    feed.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted);">
        <span style="font-size: 2rem;">🕒</span><br>Sin actividad registrada en este dispositivo
      </div>
    `;
    return;
  }

  // 3.5 Filtrar según fecha seleccionada (Opción 1: Hoy, Ayer, Todos o Fecha específica)
  const dateFiltered = unified.filter(item => matchesDateFilter(item.sortTimestamp || item.timestamp, selectedHistoryDate));

  // 4. Filtrar según píldora seleccionada: 'all', 'blocked', 'app_open', 'alert', 'gps'
  const filtered = dateFiltered.filter(item => {
    if (activeHistoryTabFilter === 'all') return true;
    const type = (item.type || '').toLowerCase();
    const msg = (item.message || '').toLowerCase();

    const isBlock = type === 'blocked' || type === 'warning' || type.includes('block') ||
                    type.includes('limit') || type.includes('locked') ||
                    msg.includes('límite') || msg.includes('bloque') || msg.includes('descanso');

    const isOpen = type === 'app_open' || (type === 'info' && msg.includes('abrió')) || msg.includes('abrió');

    const isGps = type === 'gps' || type.includes('gps') || type.includes('location') ||
                  msg.includes('gps') || msg.includes('ubicación') || msg.includes('geocerca');

    const isAlert = (type === 'alert' || type === 'danger' || type.includes('alert') ||
                    type.includes('uninstall') || msg.includes('alerta') || msg.includes('⚠️') || msg.includes('🚨')) && !isGps;

    if (activeHistoryTabFilter === 'blocked' || activeHistoryTabFilter === 'warning') {
      return isBlock;
    }
    if (activeHistoryTabFilter === 'app_open' || activeHistoryTabFilter === 'info') {
      return isOpen;
    }
    if (activeHistoryTabFilter === 'alert') {
      return isAlert;
    }
    if (activeHistoryTabFilter === 'gps') {
      return isGps;
    }
    return true;
  });

  if (filtered.length === 0) {
    let filterLabel = 'este filtro';
    if (activeHistoryTabFilter === 'blocked') filterLabel = '🛑 Bloqueos';
    else if (activeHistoryTabFilter === 'app_open') filterLabel = '🚀 Aperturas';
    else if (activeHistoryTabFilter === 'alert') filterLabel = '⚠️ Alertas';
    else if (activeHistoryTabFilter === 'gps') filterLabel = '📍 GPS y Ubicación';

    let dateText = selectedHistoryDate === 'today' ? 'de hoy' : (selectedHistoryDate === 'yesterday' ? 'de ayer' : (selectedHistoryDate === 'all' ? '' : `del día ${selectedHistoryDate}`));
    feed.innerHTML = `
      <div style="text-align: center; padding: 36px 16px; color: var(--text-muted); font-size: 0.88rem;">
        No hay registros ${dateText} para ${filterLabel}. Prueba seleccionando otro día o pulsando "Todos".
      </div>
    `;
    return;
  }

  feed.innerHTML = filtered.map(item => {
    const type = (item.type || '').toLowerCase();
    const msg = (item.message || '').toLowerCase();

    const isBlock = type === 'blocked' || type === 'warning' || type.includes('block') ||
                    type.includes('limit') || type.includes('locked') ||
                    msg.includes('límite') || msg.includes('bloque') || msg.includes('descanso');

    const isOpen = type === 'app_open' || (type === 'info' && msg.includes('abrió')) || msg.includes('abrió');

    const isGps = type === 'gps' || type.includes('gps') || type.includes('location') || msg.includes('ubicación') || msg.includes('geocerca');

    const isAlert = (type === 'alert' || type === 'danger' || type.includes('alert') ||
                    type.includes('uninstall') || msg.includes('alerta') || msg.includes('⚠️') || msg.includes('🚨')) && !isGps;

    let icon = 'ℹ️';
    let itemClass = 'info';
    if (isGps) {
      icon = '📍';
      itemClass = 'gps';
    } else if (isBlock) {
      icon = '🛑';
      itemClass = 'warning';
    } else if (isOpen) {
      icon = '🚀';
      itemClass = 'info';
    } else if (isAlert) {
      icon = '⚠️';
      itemClass = 'alert';
    }

    const hasCoords = typeof item.latitude === 'number' && typeof item.longitude === 'number';

    return `
      <div class="activity-feed-item ${itemClass}" style="display: flex; gap: 12px; padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); align-items: flex-start;">
        <span style="font-size: 1.3rem; line-height: 1.2;">${icon}</span>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="color: #fff; font-size: 0.88rem;">${item.appName || item.package || 'Sistema'}</strong>
            <span style="font-size: 0.74rem; color: var(--text-muted);">${item.time || ''}</span>
          </div>
          <p style="color: #cbd5e1; font-size: 0.82rem; margin: 4px 0 0 0; line-height: 1.35;">${item.message || ''}</p>
          ${hasCoords ? `
            <button type="button" class="btn-history-map-link" onclick="viewLocationOnMap(${item.latitude}, ${item.longitude}, '${item.time || ''}')" style="margin-top: 6px; font-size: 0.74rem; padding: 3px 8px; border-radius: 6px; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); cursor: pointer; background: rgba(56, 189, 248, 0.1); display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s ease;">
              🗺️ Ver en Mapa
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // 5. Cargar desglose de uso de aplicaciones para la fecha de historial seleccionada
  fetchAndRenderHistoryAppUsage(selectedHistoryDate);
}

async function fetchAndRenderHistoryAppUsage(date = 'today') {
  const container = document.getElementById('historyAppUsageListContainer');
  if (!container) return;

  if (!currentDevice) {
    container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">Sin dispositivo seleccionado</div>`;
    return;
  }

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/app-usage?date=${encodeURIComponent(date)}`);
    if (res.ok) {
      const data = await res.json();
      const apps = data.apps || [];
      const totalMins = data.totalScreenTimeMinutes || 0;

      if (apps.length === 0 || totalMins === 0) {
        let dateLabel = date === 'today' ? 'de hoy' : (date === 'yesterday' ? 'de ayer' : (date === 'all' ? '' : `del día ${date}`));
        container.innerHTML = `
          <div style="text-align: center; padding: 24px 16px; background: rgba(255,255,255,0.02); border-radius: 10px; border: 1px dashed rgba(255,255,255,0.08);">
            <div style="font-size: 1.8rem; margin-bottom: 4px;">📱</div>
            <p style="color: #cbd5e1; font-size: 0.88rem; margin: 0 0 4px 0;">Sin uso de aplicaciones registrado ${dateLabel}</p>
            <p style="color: var(--text-muted); font-size: 0.78rem; margin: 0;">No se abrieron aplicaciones en esta fecha o el teléfono estuvo en reposo.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = apps.filter(a => a.timeMinutes > 0).map(a => {
        const percent = totalMins > 0 ? Math.min(100, Math.round((a.timeMinutes / totalMins) * 100)) : 0;
        const hasLimit = a.limitMinutes > 0;
        const isOverLimit = hasLimit && a.timeMinutes >= a.limitMinutes;
        const barColor = isOverLimit ? '#ef4444' : (a.isBlocked ? '#f87171' : '#6366f1');

        return `
          <div class="app-usage-row" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 1.3rem;">${a.icon || '📱'}</span>
                <div>
                  <span style="font-weight: 600; font-size: 0.9rem; color: #fff;">${a.name}</span>
                  <span style="font-size: 0.74rem; color: var(--text-muted); margin-left: 6px;">${a.category || 'App'}</span>
                </div>
              </div>
              <div style="text-align: right;">
                <span style="font-weight: 700; font-size: 0.88rem; color: ${isOverLimit ? '#f87171' : '#a5b4fc'};">${formatMinutes(a.timeMinutes)}</span>
                ${hasLimit ? `<div style="font-size: 0.72rem; color: ${isOverLimit ? '#f87171' : '#94a3b8'};">Límite: ${formatMinutes(a.limitMinutes)} ${isOverLimit ? '(Agotado)' : ''}</div>` : ''}
              </div>
            </div>
            <!-- Barra de progreso visual -->
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden;">
              <div style="width: ${percent}%; height: 100%; background: ${barColor}; border-radius: 999px; transition: width 0.4s ease;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error cargando app-usage en historial:', err);
    container.innerHTML = `<div style="text-align: center; padding: 16px; color: #f87171; font-size: 0.85rem;">Error al consultar tiempo de apps</div>`;
  }
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
  if (gpsInterval) gpsInterval.value = currentDevice.gpsIntervalSeconds || 600;

  const settingsAudioDuration = document.getElementById('settingsAudioDuration');
  const settingsVideoDuration = document.getElementById('settingsVideoDuration');
  if (settingsAudioDuration) settingsAudioDuration.value = String(currentDevice.audioClipDurationSeconds || 5);
  if (settingsVideoDuration) settingsVideoDuration.value = String(currentDevice.videoClipDurationSeconds || 5);
  updateMediaDurationLabels();

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
// PESTAÑA: INFORMES MENSUALES DE USO Y BIENESTAR DIGITAL
// =========================================================================
let selectedReportMonth = null;
let selectedReportYear = null;
let currentMonthlyReportData = null;

function initMonthlyReportsView() {
  populateReportMonthSelector();
  fetchAndRenderMonthlyReport();
}

function populateReportMonthSelector() {
  const select = document.getElementById('reportsMonthSelect');
  if (!select) return;

  const now = new Date();
  const currentM = now.getMonth() + 1;
  const currentY = now.getFullYear();

  if (!selectedReportMonth) selectedReportMonth = currentM;
  if (!selectedReportYear) selectedReportYear = currentY;

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  select.innerHTML = '';
  // Generar opciones para los últimos 6 meses
  for (let i = 0; i < 6; i++) {
    const d = new Date(currentY, (currentM - 1) - i, 1);
    const mNum = d.getMonth() + 1;
    const yNum = d.getFullYear();
    const opt = document.createElement('option');
    opt.value = `${yNum}-${mNum}`;
    opt.textContent = `${monthNames[d.getMonth()]} ${yNum}${i === 0 ? ' (Mes Actual)' : ''}`;
    if (mNum === selectedReportMonth && yNum === selectedReportYear) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  if (!select._hasReportsChangeListener) {
    select._hasReportsChangeListener = true;
    select.addEventListener('change', (e) => {
      const parts = e.target.value.split('-');
      selectedReportYear = parseInt(parts[0], 10);
      selectedReportMonth = parseInt(parts[1], 10);
      fetchAndRenderMonthlyReport();
    });
  }
}

async function fetchAndRenderMonthlyReport() {
  const contentArea = document.getElementById('monthlyReportContentArea');
  if (!contentArea) return;

  if (!currentDevice) {
    contentArea.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
        <div style="font-size: 2.8rem; margin-bottom: 12px;">📑</div>
        <h3 style="color: #fff; font-size: 1.1rem; margin-bottom: 6px;">Selecciona un hijo o dispositivo</h3>
        <p style="font-size: 0.85rem; max-width: 400px; margin: 0 auto; line-height: 1.5;">
          Elige un menor en el selector superior para generar su informe ejecutivo mensual.
        </p>
      </div>
    `;
    return;
  }

  const now = new Date();
  const reqYear = selectedReportYear || now.getFullYear();
  const reqMonth = selectedReportMonth || (now.getMonth() + 1);

  try {
    const res = await apiFetch(`/api/reports/monthly?deviceId=${encodeURIComponent(currentDevice.id)}&year=${reqYear}&month=${reqMonth}`);
    if (!res.ok) {
      throw new Error(`Error del servidor (${res.status})`);
    }
    const data = await res.json();
    currentMonthlyReportData = data;

    // Encabezado
    const avatarEl = document.getElementById('reportChildAvatar');
    if (avatarEl) avatarEl.textContent = data.avatar || currentDevice.avatar || '👦';

    const titleEl = document.getElementById('reportChildTitle');
    if (titleEl) titleEl.textContent = `Informe de Actividad Digital: ${data.childName}`;

    const subtitleEl = document.getElementById('reportPeriodSubtitle');
    if (subtitleEl) subtitleEl.textContent = `Período: ${data.periodLabel} • Dispositivo: ${getFriendlyDeviceSerial(currentDevice)}`;

    // 4 KPIs
    const kpiTotal = document.getElementById('reportKpiTotalTime');
    if (kpiTotal) kpiTotal.textContent = data.totalHoursFormatted;

    const kpiAvg = document.getElementById('reportKpiDailyAvg');
    if (kpiAvg) kpiAvg.textContent = data.dailyAverageFormatted;

    const kpiDays = document.getElementById('reportKpiActiveDays');
    if (kpiDays) kpiDays.textContent = `${data.activeDays} días`;

    const kpiAlerts = document.getElementById('reportKpiAlerts');
    if (kpiAlerts) {
      kpiAlerts.textContent = String(data.securityAlertsCount || 0);
      kpiAlerts.style.color = (data.securityAlertsCount > 0) ? '#f87171' : '#10b981';
    }

    // Colores temáticos por categoría
    const categoryColors = {
      'Juegos': 'linear-gradient(90deg, #8b5cf6, #a78bfa)',
      'Redes Sociales': 'linear-gradient(90deg, #ec4899, #f472b6)',
      'Videos': 'linear-gradient(90deg, #ef4444, #f87171)',
      'Navegación Web': 'linear-gradient(90deg, #3b82f6, #60a5fa)',
      'Educación': 'linear-gradient(90deg, #10b981, #34d399)',
      'Comunicación': 'linear-gradient(90deg, #06b6d4, #22d3ee)',
      'Utilidades': 'linear-gradient(90deg, #64748b, #94a3b8)',
      'Sistema': 'linear-gradient(90deg, #475569, #64748b)'
    };

    const categoryIcons = {
      'Juegos': '🎮',
      'Redes Sociales': '📱',
      'Videos': '🎬',
      'Navegación Web': '🌐',
      'Educación': '🎓',
      'Comunicación': '💬',
      'Utilidades': '📁',
      'Sistema': '⚙️'
    };

    // Desglose de Categorías
    const catContainer = document.getElementById('reportCategoryBreakdownList');
    if (catContainer) {
      if (!data.categoryBreakdown || data.categoryBreakdown.length === 0 || data.totalMinutes === 0) {
        catContainer.innerHTML = '<div style="color: #94a3b8; font-size: 0.84rem; padding: 12px 0;">Sin uso de pantalla registrado en este período.</div>';
      } else {
        catContainer.innerHTML = data.categoryBreakdown.filter(c => c.minutes > 0).map(cat => {
          const barColor = categoryColors[cat.category] || 'linear-gradient(90deg, #6366f1, #8b5cf6)';
          const icon = categoryIcons[cat.category] || '📁';
          return `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; justify-content: space-between; font-size: 0.82rem;">
                <span style="font-weight: 600; color: #f1f5f9;">${icon} ${cat.category}</span>
                <span style="color: #94a3b8;">${Math.floor(cat.minutes / 60)}h ${cat.minutes % 60}m <strong style="color: #e2e8f0; margin-left: 6px;">(${cat.percentage}%)</strong></span>
              </div>
              <div class="report-cat-progress-bar">
                <div class="report-cat-progress-fill" style="background: ${barColor}; width: ${cat.percentage}%;"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Top Apps
    const topAppsContainer = document.getElementById('reportTopAppsList');
    if (topAppsContainer) {
      if (!data.topApps || data.topApps.length === 0) {
        topAppsContainer.innerHTML = '<div style="color: #94a3b8; font-size: 0.84rem; padding: 12px 0;">Sin aplicaciones utilizadas este mes.</div>';
      } else {
        topAppsContainer.innerHTML = data.topApps.map((app, idx) => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 1.4rem;">${app.icon || '📱'}</span>
              <div>
                <div style="font-weight: 700; color: #fff; font-size: 0.88rem;">${app.name}</div>
                <div style="font-size: 0.74rem; color: #94a3b8;">${app.category}</div>
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 700; color: #38bdf8; font-size: 0.88rem;">${Math.floor(app.minutes / 60)}h ${app.minutes % 60}m</div>
              <div style="font-size: 0.72rem; color: #64748b;">${app.percentage}% del total</div>
            </div>
          </div>
        `).join('');
      }
    }

    // Observaciones e Insights
    const insightsContainer = document.getElementById('reportInsightsList');
    if (insightsContainer) {
      if (!data.insights || data.insights.length === 0) {
        insightsContainer.innerHTML = '<li style="color: #cbd5e1; font-size: 0.84rem;">El uso se encuentra en niveles normales y estables.</li>';
      } else {
        insightsContainer.innerHTML = data.insights.map(ins => `
          <li style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.5;">${ins}</li>
        `).join('');
      }
    }

    // Registro de Alertas y Eventos
    const securityContainer = document.getElementById('reportSecurityEventsList');
    if (securityContainer) {
      if (!data.securityAlerts || data.securityAlerts.length === 0) {
        securityContainer.innerHTML = `
          <div style="color: #34d399; font-size: 0.84rem; padding: 10px; background: rgba(16,185,129,0.08); border-radius: 8px; border: 1px solid rgba(16,185,129,0.2);">
            ✅ Ningún incidente de riesgo o alerta crítica registrada en este mes.
          </div>
        `;
      } else {
        securityContainer.innerHTML = data.securityAlerts.map(ev => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(239,68,68,0.06); border-radius: 8px; border: 1px solid rgba(239,68,68,0.18); font-size: 0.82rem;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>🚨</span>
              <span style="color: #fca5a5;">${ev.message}</span>
            </div>
            <span style="color: #94a3b8; font-size: 0.74rem;">${ev.date} ${ev.time}</span>
          </div>
        `).join('');
      }
    }

  } catch (err) {
    console.error('Error cargando informe mensual:', err);
    showToast('No se pudo cargar el informe mensual', 'danger');
  }
}

function printMonthlyReport() {
  if (!currentDevice) {
    showToast('Selecciona un dispositivo primero', 'warning');
    return;
  }
  window.print();
}

async function sendMonthlyReportEmailAction() {
  if (!currentDevice) {
    showToast('Selecciona un dispositivo primero', 'warning');
    return;
  }

  let defaultEmail = 'padres@kidsshield.local';
  try {
    const storedUser = localStorage.getItem('kidsshield_admin_user');
    if (storedUser) {
      const u = JSON.parse(storedUser);
      if (u && u.email) defaultEmail = u.email;
    } else if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
      defaultEmail = currentUser.email;
    }
  } catch (e) {}

  const recipient = prompt('Ingresa el correo electrónico donde deseas recibir el informe mensual:', defaultEmail);
  if (!recipient || !recipient.trim()) return;

  const targetEmail = recipient.trim();
  const now = new Date();
  const reqYear = selectedReportYear || now.getFullYear();
  const reqMonth = selectedReportMonth || (now.getMonth() + 1);

  showToast(`Enviando informe mensual a ${targetEmail}...`, 'info');

  try {
    const res = await apiFetch('/api/reports/monthly/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: currentDevice.id,
        year: reqYear,
        month: reqMonth,
        recipientEmail: targetEmail
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`✅ ${data.message}`, 'success');
      if (data.previewUrl) {
        console.log('[Reports] Vista previa del correo:', data.previewUrl);
        const openPreview = confirm(`¡Informe enviado con éxito a ${targetEmail}!\n\n¿Deseas abrir la vista previa web del correo ahora?`);
        if (openPreview) {
          window.open(data.previewUrl, '_blank');
        }
      }
    } else {
      showToast(data.error || 'Error enviando el correo', 'danger');
    }
  } catch (err) {
    console.error('Error enviando informe por correo:', err);
    showToast('Error de red al despachar el correo', 'danger');
  }
}

function setupMonthlyReportsListeners() {
  const btnPrint = document.getElementById('btnPrintMonthlyReport');
  if (btnPrint) btnPrint.addEventListener('click', printMonthlyReport);

  const btnSendEmail = document.getElementById('btnSendMonthlyReportEmail');
  if (btnSendEmail) btnSendEmail.addEventListener('click', sendMonthlyReportEmailAction);

  const btnRefresh = document.getElementById('btnRefreshMonthlyReport');
  if (btnRefresh) btnRefresh.addEventListener('click', fetchAndRenderMonthlyReport);
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

function setupTimelineEvents() {
  const typeFilterContainer = document.getElementById('timelineTypeFilter');
  if (typeFilterContainer) {
    typeFilterContainer.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        typeFilterContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTimelineTypeFilter = btn.dataset.type || 'all';
        renderActivityFeed();
      });
    });
  }
}

// Event Bindings
function bindEvents() {
  try {
  setupTimelineEvents();
  setupHistoryTabFilters();
  setupDateFilterListeners();
  setupSoundSettingsListeners();
  setupAppUsageAndKeystrokesListeners();
  setupMonthlyReportsListeners();
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

  const navTabReports = document.getElementById('navTabReports');
  if (navTabReports) navTabReports.addEventListener('click', () => switchDashboardView('reports'));

  const drawerLinkReports = document.getElementById('drawerLinkReports');
  if (drawerLinkReports) drawerLinkReports.addEventListener('click', () => switchDashboardView('reports'));

  const sidebarNavReports = document.getElementById('sidebarNavReports');
  if (sidebarNavReports) sidebarNavReports.addEventListener('click', () => switchDashboardView('reports'));

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

  // Sincronización y eventos de Día de Traza de Ruta
  const selectRouteHistoryDay = document.getElementById('selectRouteHistoryDay');
  const inputRouteHistoryDate = document.getElementById('inputRouteHistoryDate');
  const selectRouteHistoryDayHome = document.getElementById('selectRouteHistoryDayHome');
  const inputRouteHistoryDateHome = document.getElementById('inputRouteHistoryDateHome');

  function handleRouteDayChange(val, customDateVal) {
    let dateToFetch = val;
    if (val === 'custom') {
      dateToFetch = customDateVal || new Date().toISOString().slice(0, 10);
    }
    selectedRouteDate = dateToFetch;

    if (selectRouteHistoryDay) selectRouteHistoryDay.value = val;
    if (selectRouteHistoryDayHome) selectRouteHistoryDayHome.value = val;

    if (inputRouteHistoryDate) inputRouteHistoryDate.style.display = (val === 'custom') ? 'inline-block' : 'none';
    if (inputRouteHistoryDateHome) inputRouteHistoryDateHome.style.display = (val === 'custom') ? 'inline-block' : 'none';

    if (isRouteHistoryVisible) {
      fetchAndRenderRouteHistory(dateToFetch);
    } else {
      toggleRouteHistory();
    }
  }

  if (selectRouteHistoryDay) {
    selectRouteHistoryDay.addEventListener('change', (e) => {
      handleRouteDayChange(e.target.value, inputRouteHistoryDate?.value);
    });
  }
  if (selectRouteHistoryDayHome) {
    selectRouteHistoryDayHome.addEventListener('change', (e) => {
      handleRouteDayChange(e.target.value, inputRouteHistoryDateHome?.value);
    });
  }
  if (inputRouteHistoryDate) {
    inputRouteHistoryDate.addEventListener('change', (e) => {
      handleRouteDayChange('custom', e.target.value);
    });
  }
  if (inputRouteHistoryDateHome) {
    inputRouteHistoryDateHome.addEventListener('change', (e) => {
      handleRouteDayChange('custom', e.target.value);
    });
  }

  const btnMapTabGeofences = document.getElementById('btnMapTabGeofences');
  if (btnMapTabGeofences) btnMapTabGeofences.addEventListener('click', toggleGeofencesVisibility);

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
    'settingsDeviceSelect',
    'reportsDeviceSelect'
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

  ['inputGeofenceName', 'inputGeofenceLat', 'inputGeofenceLng'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        el.style.borderColor = '';
        el.style.boxShadow = '';
      });
    }
  });
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
      const iconSelect = document.getElementById('selectGeofenceIcon');
      if (iconSelect) iconSelect.value = catIcon;
      if (nameInput) {
        nameInput.value = catName;
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

  // Barra de Captura Automática Periódica
  const btnToggleAutoCapture = document.getElementById('btnToggleAutoCapture');
  if (btnToggleAutoCapture) {
    btnToggleAutoCapture.addEventListener('click', toggleAutoCapture);
  }

  // Modal: Editar Perfil de Hijo y Dispositivo
  const btnCloseEditChildModal = document.getElementById('btnCloseEditChildModal');
  if (btnCloseEditChildModal) btnCloseEditChildModal.addEventListener('click', closeEditChildModal);

  const btnCancelEditChild = document.getElementById('btnCancelEditChild');
  if (btnCancelEditChild) btnCancelEditChild.addEventListener('click', closeEditChildModal);

  const btnSaveChildProfile = document.getElementById('btnSaveChildProfile');
  if (btnSaveChildProfile) btnSaveChildProfile.addEventListener('click', saveChildProfile);

  const editAvatarPicker = document.getElementById('editChildAvatarPicker');
  if (editAvatarPicker) {
    editAvatarPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.avatar-option-btn');
      if (!btn) return;
      document.querySelectorAll('#editChildAvatarPicker .avatar-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedEditAvatar = btn.getAttribute('data-avatar') || '👦';
    });
  }

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
        const inBedtime = bedtimeEnabled && isCurrentTimeInBedtimeClient(bedtimeStart, bedtimeEnd);
        currentDevice.bedtimeEnabled = bedtimeEnabled;
        currentDevice.bedtimeStart = bedtimeStart;
        currentDevice.bedtimeEnd = bedtimeEnd;

        const payload = { bedtimeEnabled, bedtimeStart, bedtimeEnd };
        if (inBedtime) {
          currentDevice.isLocked = true;
          currentDevice.lockReason = 'Horario nocturno activo';
          payload.isLocked = true;
          payload.lockReason = 'Horario nocturno activo';
          showToast('🌙 Horario nocturno guardado • La hora actual cae en el horario, teléfono bloqueado', 'warning');
        } else if (currentDevice.lockReason && currentDevice.lockReason.includes('nocturno')) {
          currentDevice.isLocked = false;
          currentDevice.lockReason = '';
          payload.isLocked = false;
          payload.lockReason = '';
          showToast('✅ Horario nocturno guardado • Teléfono fuera de horario nocturno, desbloqueado', 'success');
        } else {
          showToast('✅ Horario nocturno guardado correctamente', 'success');
        }

        await updateRemoteConfig(payload);
        renderHero();
        renderHeader();
        renderScheduleControls();
        renderAppList();
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

  const btnSaveMediaDurationSettings = document.getElementById('btnSaveMediaDurationSettings');
  if (btnSaveMediaDurationSettings) {
    btnSaveMediaDurationSettings.addEventListener('click', async () => {
      const audioSec = parseInt(document.getElementById('settingsAudioDuration')?.value, 10) || 5;
      const videoSec = parseInt(document.getElementById('settingsVideoDuration')?.value, 10) || 5;
      if (currentDevice) {
        currentDevice.audioClipDurationSeconds = audioSec;
        currentDevice.videoClipDurationSeconds = videoSec;
        await updateRemoteConfig({ audioClipDurationSeconds: audioSec, videoClipDurationSeconds: videoSec });
        updateMediaDurationLabels();
        showToast(`✅ Duraciones configuradas: Audio (${audioSec}s), Video (${videoSec}s)`, 'success');
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
    toggleDeviceLockById(currentDevice.id);
  });

  // Botón Directo de Bloqueo / Desbloqueo en Tiempo de Pantalla
  const btnHeroScreenTimeLock = document.getElementById('btnHeroScreenTimeLock');
  if (btnHeroScreenTimeLock) btnHeroScreenTimeLock.addEventListener('click', () => {
    if (!currentDevice) {
      showToast('No hay ningún dispositivo seleccionado', 'warning');
      return;
    }
    toggleDeviceLockById(currentDevice.id);
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
    const used = currentDevice.screenTimeTodayMinutes || 0;
    const currentLimit = currentDevice.dailyLimitMinutes || 120;
    const newLimit = Math.max(currentLimit + 15, used + 15);
    currentDevice.dailyLimitMinutes = newLimit;

    const payload = { dailyLimitMinutes: newLimit };
    currentDevice.isLocked = false;
    currentDevice.lockReason = '';
    payload.isLocked = false;
    payload.lockReason = '';
    updateLockUI(false);
    devicesList.forEach(d => {
      if (d.id === currentDevice.id) {
        d.isLocked = false;
        d.dailyLimitMinutes = newLimit;
        d.lockReason = '';
      }
    });
    renderFamilyOverviewCards();

    updateRemoteConfig(payload);
    renderHero();
    renderScheduleControls();
    renderAppList();
    showToast(`Se otorgaron +15 minutos de tiempo de pantalla extra • Dispositivo desbloqueado`, 'success');
  });

  // Range slider
  if (dailyLimitRange) dailyLimitRange.addEventListener('input', (e) => {
    const mins = parseInt(e.target.value, 10);
    dailyLimitValText.textContent = formatMinutes(mins);
  });

  if (dailyLimitRange) dailyLimitRange.addEventListener('change', (e) => {
    const mins = parseInt(e.target.value, 10);
    currentDevice.dailyLimitMinutes = mins;

    const payload = { dailyLimitMinutes: mins };
    const hasRemaining = (currentDevice.screenTimeTodayMinutes || 0) < mins;
    if (hasRemaining && currentDevice.isLocked) {
      currentDevice.isLocked = false;
      currentDevice.lockReason = '';
      payload.isLocked = false;
      payload.lockReason = '';
      updateLockUI(false);
      devicesList.forEach(d => {
        if (d.id === currentDevice.id) {
          d.isLocked = false;
          d.dailyLimitMinutes = mins;
        }
      });
      renderFamilyOverviewCards();
    }

    updateRemoteConfig(payload);
    renderHero();
    renderScheduleControls();
    showToast(`Nuevo límite diario: ${formatMinutes(mins)}${hasRemaining && payload.isLocked === false ? ' • Dispositivo desbloqueado' : ''}`, 'success');
  });

  // Bedtime toggle (Resumen general y tarjeta unificada)
  const toggleBedtimeSchedule = document.getElementById('toggleBedtimeSchedule');
  const handleBedtimeToggleChange = (isChecked) => {
    if (!currentDevice) return;
    const startVal = bedtimeStartInput ? bedtimeStartInput.value : (currentDevice.bedtimeStart || '21:30');
    const endVal = bedtimeEndInput ? bedtimeEndInput.value : (currentDevice.bedtimeEnd || '07:00');
    const inBedtime = isChecked && isCurrentTimeInBedtimeClient(startVal, endVal);

    currentDevice.bedtimeEnabled = isChecked;
    currentDevice.bedtimeStart = startVal;
    currentDevice.bedtimeEnd = endVal;

    const payload = {
      bedtimeEnabled: isChecked,
      bedtimeStart: startVal,
      bedtimeEnd: endVal
    };

    if (inBedtime) {
      currentDevice.isLocked = true;
      currentDevice.lockReason = 'Horario nocturno activo';
      payload.isLocked = true;
      payload.lockReason = 'Horario nocturno activo';
      showToast('🌙 Horario nocturno activo en este momento • Teléfono bloqueado', 'warning');
    } else if (!isChecked && currentDevice.lockReason && currentDevice.lockReason.includes('nocturno')) {
      currentDevice.isLocked = false;
      currentDevice.lockReason = '';
      payload.isLocked = false;
      payload.lockReason = '';
      showToast('☀️ Modo noche desactivado • Teléfono desbloqueado', 'info');
    } else {
      showToast(isChecked ? 'Modo noche activado para el horario programado' : 'Modo noche desactivado', 'info');
    }

    if (toggleBedtime) toggleBedtime.checked = isChecked;
    if (toggleBedtimeSchedule) toggleBedtimeSchedule.checked = isChecked;
    updateRemoteConfig(payload);
    renderHero();
    renderHeader();
    renderScheduleControls();
    renderAppList();
  };

  if (toggleBedtime) {
    toggleBedtime.addEventListener('change', (e) => handleBedtimeToggleChange(e.target.checked));
  }
  if (toggleBedtimeSchedule) {
    toggleBedtimeSchedule.addEventListener('change', (e) => handleBedtimeToggleChange(e.target.checked));
  }

  // Save Schedule en tarjeta unificada
  if (btnSaveSchedule) btnSaveSchedule.addEventListener('click', () => {
    if (!currentDevice) return;
    const startVal = bedtimeStartInput.value || '21:30';
    const endVal = bedtimeEndInput.value || '07:00';
    const isChecked = toggleBedtimeSchedule ? toggleBedtimeSchedule.checked : Boolean(currentDevice.bedtimeEnabled);
    const inBedtime = isChecked && isCurrentTimeInBedtimeClient(startVal, endVal);

    currentDevice.bedtimeEnabled = isChecked;
    currentDevice.bedtimeStart = startVal;
    currentDevice.bedtimeEnd = endVal;

    const payload = {
      bedtimeEnabled: isChecked,
      bedtimeStart: startVal,
      bedtimeEnd: endVal
    };

    if (inBedtime) {
      currentDevice.isLocked = true;
      currentDevice.lockReason = 'Horario nocturno activo';
      payload.isLocked = true;
      payload.lockReason = 'Horario nocturno activo';
      showToast('🌙 La hora actual cae en el horario nocturno • Teléfono bloqueado de inmediato', 'warning');
    } else if (currentDevice.lockReason && currentDevice.lockReason.includes('nocturno')) {
      currentDevice.isLocked = false;
      currentDevice.lockReason = '';
      payload.isLocked = false;
      payload.lockReason = '';
      showToast('☀️ Teléfono fuera de horario nocturno • Desbloqueado', 'info');
    } else {
      showToast('Horarios de descanso guardados correctamente', 'success');
    }

    if (toggleBedtime) toggleBedtime.checked = isChecked;
    if (toggleBedtimeSchedule) toggleBedtimeSchedule.checked = isChecked;
    updateRemoteConfig(payload);
    renderHero();
    renderHeader();
    renderScheduleControls();
    renderAppList();
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
      const used = currentDevice.screenTimeTodayMinutes || 0;
      const limit = currentDevice.dailyLimitMinutes || 120;
      const hasNoTime = limit > 0 && used >= limit;
      const payload = { isLocked: false, lockReason: '' };
      if (hasNoTime) {
        payload.dailyLimitMinutes = Math.max(limit + 15, used + 15);
        currentDevice.dailyLimitMinutes = payload.dailyLimitMinutes;
      }
      currentDevice.isLocked = false;
      currentDevice.lockReason = '';
      updateLockUI(false);
      updateRemoteConfig(payload);
      simPinInput.value = '';
      renderHero();
      renderScheduleControls();
      renderAppList();
      showToast('Desbloqueado con PIN de padres en el dispositivo' + (hasNoTime ? ' (+15 min de uso otorgados)' : ''), 'success');
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
  if (!adminAuthToken) {
    devicesList = [];
    currentDevice = null;
    renderDeviceSelector();
    return;
  }

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
  closeVideoClipOverlay();
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
  if (typeof currentDashboardView !== 'undefined' && currentDashboardView === 'map') {
    initDedicatedMap();
  }
  if (typeof currentDashboardView !== 'undefined' && currentDashboardView === 'reports') {
    fetchAndRenderMonthlyReport();
  }
  if (currentDevice && adminAuthToken) {
    renderFamilyOverviewCards();
    showToast(`Supervisando ahora: ${currentDevice.childName || currentDevice.name}`, 'info');
  }
}

function openAddDeviceModal() {
  const childInput = document.getElementById('inputNewDeviceChildName');
  const typeInput = document.getElementById('inputNewDeviceType');
  const avatarInput = document.getElementById('inputNewDeviceAvatar');
  if (childInput) childInput.value = '';
  if (typeInput) typeInput.value = 'celular';
  if (avatarInput) avatarInput.value = '👦';
  if (modalAddDevice) modalAddDevice.classList.add('active');
}

async function createNewDevice() {
  const childInput = document.getElementById('inputNewDeviceChildName');
  const typeInput = document.getElementById('inputNewDeviceType');
  const avatarInput = document.getElementById('inputNewDeviceAvatar');

  const childName = childInput ? childInput.value.trim() : '';
  const deviceType = typeInput ? typeInput.value : 'celular';
  const avatar = avatarInput ? avatarInput.value : '👦';

  if (!childName) {
    showToast('Por favor ingresa el nombre de tu hijo o hija.', 'warning');
    return;
  }

  try {
    const res = await apiFetch('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childName, avatar, deviceType })
    });
    if (res.ok) {
      const data = await res.json();
      const createdDevice = data.device || {};
      const newId = createdDevice.id;
      if (modalAddDevice) modalAddDevice.classList.remove('active');
      showToast(`Perfil de "${childName}" creado con éxito. El nombre y modelo del equipo se detectará al conectar el ${deviceType === 'tablet' ? 'tablet' : 'celular'}.`, 'success');
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
  const vidSec = currentDevice.videoClipDurationSeconds || 5;
  if (btnCaptureVideoText) btnCaptureVideoText.textContent = `Grabando ${vidSec}s...`;
  if (btnCaptureVideoIcon) btnCaptureVideoIcon.textContent = '⏳';
  showToast(`🎥 Solicitando clip de video en vivo (${vidSec}s) al móvil...`, 'info');

  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/request-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: vidSec })
    });
    if (res.ok) {
      console.log(`Petición de clip de video de ${vidSec} segundos enviada`);
      [2000, 4000, 6500, 9000].forEach(ms => {
        setTimeout(() => {
          if (typeof fetchAndRenderMultimediaGallery === 'function') {
            fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
          }
        }, ms);
      });
    }
  } catch (err) {
    console.error('Error solicitando video', err);
    showToast('Error al solicitar video', 'danger');
  } finally {
    setTimeout(() => {
      if (btnCaptureVideoText && btnCaptureVideoText.textContent.includes('Grabando')) {
        btnCaptureVideoText.textContent = `Video (${vidSec}s)`;
        if (btnCaptureVideoIcon) btnCaptureVideoIcon.textContent = '🎥';
      }
    }, (vidSec + 5) * 1000);
  }
}

function handleNewVideoClip(frames, intervalMs = 500) {
  if (!frames || !frames.length) return;

  if (currentDevice) {
    currentDevice.isOnline = true;
    currentDevice.lastSeen = new Date().toISOString();
    renderHeader();
    renderFamilyOverviewCards();
  }

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

  const audSec = currentDevice.audioClipDurationSeconds || 5;
  const btnCaptureAudioText = document.getElementById('btnCaptureAudioText');
  const btnCaptureAudioIcon = document.getElementById('btnCaptureAudioIcon');
  const btnAudioActionText = document.getElementById('btnAudioActionText');
  const btnAudioActionIcon = document.getElementById('btnAudioActionIcon');
  const audioVisualizerBox = document.getElementById('audioVisualizerBox');
  const audioStatusText = document.getElementById('audioStatusText');

  if (btnCaptureAudioText) btnCaptureAudioText.textContent = `Grabando ${audSec}s...`;
  if (btnCaptureAudioIcon) btnCaptureAudioIcon.textContent = '⏳';
  if (btnAudioActionText) btnAudioActionText.textContent = `Grabando (${audSec}s)...`;
  if (btnAudioActionIcon) btnAudioActionIcon.textContent = '⏳';

  if (audioVisualizerBox) {
    audioVisualizerBox.classList.add('recording');
    audioVisualizerBox.classList.remove('playing');
  }
  if (audioStatusText) {
    audioStatusText.innerHTML = `🎙️ <strong>Grabando audio ambiente en el móvil de ${currentDevice.childName || currentDevice.name}...</strong> Esperando transmisión (${audSec}s).`;
  }

  showToast(`🎙️ Solicitando ${audSec} segundos de audio ambiente en vivo...`, 'info');

  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/request-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: audSec })
    });
    if (res.ok) {
      console.log(`Petición de audio ambiental de ${audSec} segundos enviada`);
      [2000, 4000, 6500, 9000].forEach(ms => {
        setTimeout(() => {
          if (typeof fetchAndRenderMultimediaGallery === 'function') {
            fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
          }
        }, ms);
      });
    }
  } catch (err) {
    console.error('Error solicitando audio ambiental', err);
    showToast('Error al solicitar audio ambiental', 'danger');
  } finally {
    // Timeout de reseteo si no responde
    setTimeout(() => {
      if (isAudioRecordingRequested) {
        isAudioRecordingRequested = false;
        if (btnCaptureAudioText) btnCaptureAudioText.textContent = `Audio (${audSec}s)`;
        if (btnCaptureAudioIcon) btnCaptureAudioIcon.textContent = '🎙️';
        if (btnAudioActionText) btnAudioActionText.textContent = `Escuchar en Directo (${audSec}s)`;
        if (btnAudioActionIcon) btnAudioActionIcon.textContent = '🎙️';
        if (audioVisualizerBox) audioVisualizerBox.classList.remove('recording');
        if (audioStatusText && !audioStatusText.innerHTML.includes('Reproduciendo')) {
          audioStatusText.textContent = `Micrófono listo. Pulsa el botón para solicitar ${audSec} segundos de audio.`;
        }
      }
    }, (audSec + 7) * 1000);
  }
}

function handleNewAudioClip(audioBase64, duration = 5, timestamp) {
  isAudioRecordingRequested = false;

  if (currentDevice) {
    currentDevice.isOnline = true;
    currentDevice.lastSeen = timestamp || new Date().toISOString();
    renderHeader();
    renderFamilyOverviewCards();
  }

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
  if (!leafletMap && !dedicatedLeafletMap) return;
  if (!currentDevice) return;

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/geofences`);
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

  dedicatedGeofencesLayers.forEach(layer => {
    if (dedicatedLeafletMap) dedicatedLeafletMap.removeLayer(layer);
  });
  dedicatedGeofencesLayers = [];
}

function getGeofenceIcon(geo) {
  if (geo.icon && geo.icon.trim()) return geo.icon.trim();
  const emojiMatch = (geo.name || '').match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
  if (emojiMatch) return emojiMatch[0];
  const lower = (geo.name || '').toLowerCase();
  if (lower.includes('colegio') || lower.includes('escuela')) return '🏫';
  if (lower.includes('casa') || lower.includes('hogar')) return '🏠';
  if (lower.includes('deporte') || lower.includes('cancha') || lower.includes('club') || lower.includes('futbol')) return '⚽';
  if (lower.includes('abuelo') || lower.includes('abuela')) return '👵';
  if (lower.includes('parque') || lower.includes('plaza')) return '🌳';
  if (lower.includes('biblioteca')) return '📚';
  if (lower.includes('mall') || lower.includes('tienda') || lower.includes('comercial')) return '🛒';
  return '📍';
}

function getGeofenceCleanName(geo, icon) {
  let name = (geo.name || 'Lugar Seguro').trim();
  if (icon) {
    name = name.replace(icon, '').trim();
  }
  return name || 'Lugar Seguro';
}

function renderGeofencesOnMap(geofences) {
  clearGeofencesFromMap();
  if (!areGeofencesVisible || !Array.isArray(geofences)) return;

  geofences.forEach(geo => {
    const isSchool = geo.name.toLowerCase().includes('colegio') || geo.name.toLowerCase().includes('escuela');
    const isHome = geo.name.toLowerCase().includes('casa') || geo.name.toLowerCase().includes('hogar');
    const color = isSchool ? '#3b82f6' : (isHome ? '#10b981' : '#f59e0b');
    const icon = getGeofenceIcon(geo);
    const cleanName = getGeofenceCleanName(geo, icon);
    const badgeType = isSchool ? 'type-school' : (isHome ? 'type-home' : 'type-other');

    const badgeHtml = `
      <div class="geofence-map-badge ${badgeType}">
        <span class="geofence-map-badge-icon">${icon}</span>
        <span class="geofence-map-badge-label">${cleanName}</span>
      </div>
    `;
    const markerIcon = L.divIcon({
      className: 'geofence-map-badge-wrapper',
      html: badgeHtml,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });

    const popupContent = `
      <div style="min-width: 170px; padding: 4px 2px; color: #f8fafc;">
        <div style="font-weight: 700; font-size: 0.92rem; margin-bottom: 3px; color: #fff;">${icon} ${cleanName}</div>
        <div style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 4px;">Radio seguro: <strong>${geo.radiusMeters || 200}m</strong></div>
        <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 8px;">Alertas: Entrada y Salida</div>
        <div style="display: flex; gap: 6px; margin-top: 6px;">
          <button type="button" class="btn btn-xs" onclick="window.editGeofenceFromMap('${geo.id}')" style="padding: 4px 10px; font-size: 0.75rem; background: #6366f1; color: #fff; border: none; border-radius: 4px; cursor: pointer;">✏️ Modificar</button>
          <button type="button" class="btn btn-xs" onclick="window.deleteGeofenceItem('${geo.id}')" style="padding: 4px 10px; font-size: 0.75rem; background: #ef4444; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🗑️ Eliminar</button>
        </div>
      </div>
    `;

    // Dibujar en mapa de resumen
    if (leafletMap) {
      const circle = L.circle([geo.latitude, geo.longitude], {
        radius: geo.radiusMeters || 200,
        color: color,
        fillColor: color,
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '4, 4'
      }).addTo(leafletMap);

      const marker = L.marker([geo.latitude, geo.longitude], { icon: markerIcon }).addTo(leafletMap);

      circle.bindPopup(popupContent);
      marker.bindPopup(popupContent);
      leafletGeofencesLayers.push(circle);
      leafletGeofencesLayers.push(marker);
    }

    // Dibujar en mapa dedicado
    if (dedicatedLeafletMap) {
      const circleDedicated = L.circle([geo.latitude, geo.longitude], {
        radius: geo.radiusMeters || 200,
        color: color,
        fillColor: color,
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '4, 4'
      }).addTo(dedicatedLeafletMap);

      const markerDedicated = L.marker([geo.latitude, geo.longitude], { icon: markerIcon }).addTo(dedicatedLeafletMap);

      circleDedicated.bindPopup(popupContent);
      markerDedicated.bindPopup(popupContent);
      dedicatedGeofencesLayers.push(circleDedicated);
      dedicatedGeofencesLayers.push(markerDedicated);
    }
  });

  // Si no hay marcador de posición del dispositivo pero hay geocercas, centrar el mapa en la primera geocerca
  if (leafletMap && !leafletMarker && geofences.length > 0) {
    try {
      leafletMap.setView([geofences[0].latitude, geofences[0].longitude], 13);
    } catch (e) {}
  }
}

function toggleGeofencesVisibility() {
  areGeofencesVisible = !areGeofencesVisible;
  const btnToggleGeofences = document.getElementById('btnToggleGeofences');
  if (btnToggleGeofences) {
    btnToggleGeofences.style.opacity = areGeofencesVisible ? '1' : '0.6';
  }
  const btnMapTabGeofences = document.getElementById('btnMapTabGeofences');
  if (btnMapTabGeofences) {
    btnMapTabGeofences.style.opacity = areGeofencesVisible ? '1' : '0.6';
    btnMapTabGeofences.innerHTML = areGeofencesVisible ? '👁️ Ocultar Círculos' : '👁️ Círculos';
    btnMapTabGeofences.title = areGeofencesVisible ? 'Ocultar círculos de zonas seguras' : 'Mostrar círculos de zonas seguras';
  }
  if (areGeofencesVisible) {
    fetchAndRenderGeofences();
    showToast('🏫 Mostrando zonas seguras y geocercas en el mapa', 'info');
  } else {
    clearGeofencesFromMap();
    showToast('Zonas seguras ocultadas del mapa', 'info');
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

  // Precargar coordenadas si están disponibles y no estamos editando
  if (!editingGeofenceId) {
    const latInput = document.getElementById('inputGeofenceLat');
    const lngInput = document.getElementById('inputGeofenceLng');
    if (currentDevice.location && typeof currentDevice.location.latitude === 'number') {
      if (latInput) latInput.value = currentDevice.location.latitude;
      if (lngInput) lngInput.value = currentDevice.location.longitude;
    } else {
      if (latInput && !latInput.value) latInput.value = -33.4420;
      if (lngInput && !lngInput.value) lngInput.value = -70.6550;
    }
    const btnSave = document.getElementById('btnSaveGeofence');
    if (btnSave) btnSave.textContent = '➕ Guardar Lugar Seguro';
  }

  loadAndRenderGeofencesInModal();
  modal.classList.add('active');
}

function closeGeofenceManagerModal() {
  const modal = document.getElementById('modalGeofenceManager');
  if (modal) modal.classList.remove('active');
  editingGeofenceId = null;
  const btnSave = document.getElementById('btnSaveGeofence');
  if (btnSave) btnSave.textContent = '➕ Guardar Lugar Seguro';
}

function editGeofenceFromMap(geoId) {
  const geo = modalGeofencesList.find(g => String(g.id) === String(geoId));
  if (!geo) {
    // Si no está en cache, consultar y abrir
    apiFetch(`/api/devices/${currentDevice.id}/geofences`)
      .then(r => r.json())
      .then(list => {
        modalGeofencesList = list;
        const found = list.find(g => String(g.id) === String(geoId));
        if (found) fillGeofenceEditForm(found);
      });
    return;
  }
  fillGeofenceEditForm(geo);
}
window.editGeofenceFromMap = editGeofenceFromMap;

function fillGeofenceEditForm(geo) {
  editingGeofenceId = geo.id;
  openGeofenceManagerModal();

  const nameInput = document.getElementById('inputGeofenceName');
  const latInput = document.getElementById('inputGeofenceLat');
  const lngInput = document.getElementById('inputGeofenceLng');
  const radiusInput = document.getElementById('rangeGeofenceRadius');
  const radiusVal = document.getElementById('valGeofenceRadius');
  const iconSelect = document.getElementById('selectGeofenceIcon');
  const checkEntry = document.getElementById('checkGeofenceAlertEntry');
  const checkExit = document.getElementById('checkGeofenceAlertExit');
  const btnSave = document.getElementById('btnSaveGeofence');

  if (nameInput) nameInput.value = getGeofenceCleanName(geo, geo.icon);
  if (latInput) latInput.value = geo.latitude;
  if (lngInput) lngInput.value = geo.longitude;
  if (radiusInput) radiusInput.value = geo.radiusMeters || 200;
  if (radiusVal) radiusVal.textContent = `${geo.radiusMeters || 200}m`;
  if (iconSelect) iconSelect.value = geo.icon || '📍';
  if (checkEntry) checkEntry.checked = geo.alertOnEntry !== false;
  if (checkExit) checkExit.checked = geo.alertOnExit !== false;
  if (btnSave) btnSave.textContent = '💾 Guardar Modificación';

  showToast(`✏️ Editando: ${geo.name}`, 'info');
}

async function loadAndRenderGeofencesInModal() {
  const listContainer = document.getElementById('geofencesSavedList');
  if (!listContainer || !currentDevice) return;

  listContainer.innerHTML = '<div style="color: #94a3b8; font-size: 0.85rem; padding: 12px 0;">Cargando lugares...</div>';

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/geofences`);
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
    const icon = getGeofenceIcon(geo);
    const cleanName = getGeofenceCleanName(geo, icon);
    
    return `
      <div class="geofence-saved-item" id="geoItem-${geo.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; margin-bottom: 8px;">
        <div class="geofence-item-meta" style="display: flex; align-items: center; gap: 10px;">
          <div class="geofence-item-icon" style="font-size: 1.4rem;">${icon}</div>
          <div>
            <h5 class="geofence-item-name" style="margin: 0; font-size: 0.9rem; color: #fff;">${icon} ${cleanName}</h5>
            <p class="geofence-item-sub" style="margin: 2px 0 0 0; font-size: 0.76rem; color: var(--text-muted);">Radio: ${geo.radiusMeters || 200}m • Coords: ${Number(geo.latitude).toFixed(4)}, ${Number(geo.longitude).toFixed(4)}</p>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn btn-secondary-outline btn-sm" onclick="editGeofenceFromMap('${geo.id}')" title="Modificar este lugar seguro" style="padding: 4px 8px; font-size: 0.78rem;">
            ✏️ Modificar
          </button>
          <button type="button" class="btn btn-danger-outline btn-sm" onclick="deleteGeofenceItem('${geo.id}')" title="Eliminar lugar seguro" style="padding: 4px 8px; font-size: 0.78rem;">
            🗑️ Eliminar
          </button>
        </div>
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

  // Limpiar estilos de error previos
  [nameInput, latInput, lngInput].forEach(input => {
    if (input) {
      input.style.borderColor = '';
      input.style.boxShadow = '';
    }
  });

  const name = nameInput ? nameInput.value.trim() : '';
  const rawLat = latInput ? latInput.value.trim() : '';
  const rawLng = lngInput ? lngInput.value.trim() : '';
  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);
  const radius = parseInt(radiusInput ? radiusInput.value : 250, 10);
  const alertOnEntry = checkEntry ? checkEntry.checked : true;
  const alertOnExit = checkExit ? checkExit.checked : true;

  let hasMissingField = false;

  // Validación de campo: Nombre
  if (!name) {
    if (nameInput) {
      nameInput.style.borderColor = '#ef4444';
      nameInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.35)';
      nameInput.focus();
    }
    showToast('⚠️ Falta ingresar el Nombre del Lugar Seguro (ej: Colegio, Casa)', 'warning');
    hasMissingField = true;
  }

  // Validación de campos: Latitud y Longitud
  const isLatInvalid = !rawLat || isNaN(lat);
  const isLngInvalid = !rawLng || isNaN(lng);

  if (isLatInvalid || isLngInvalid) {
    if (isLatInvalid && latInput) {
      latInput.style.borderColor = '#ef4444';
      latInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.35)';
    }
    if (isLngInvalid && lngInput) {
      lngInput.style.borderColor = '#ef4444';
      lngInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.35)';
    }
    if (!hasMissingField) {
      if (isLatInvalid && latInput) latInput.focus();
      else if (isLngInvalid && lngInput) lngInput.focus();
      showToast('⚠️ Faltan las coordenadas GPS. Haz clic en el mapa o pulsa "Usar Posición Actual"', 'warning');
    }
    hasMissingField = true;
  }

  if (hasMissingField) return;

  try {
    const iconSelect = document.getElementById('selectGeofenceIcon');
    const icon = iconSelect ? iconSelect.value : '📍';

    const geoId = editingGeofenceId || `GEO-${Date.now()}`;
    const payload = {
      id: geoId,
      name,
      icon,
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
      const actionMsg = editingGeofenceId ? 'modificado' : 'guardado';
      showToast(`✅ Lugar seguro "${name}" ${actionMsg} con éxito`, 'success');
      if (nameInput) nameInput.value = '';
      if (latInput) latInput.value = '';
      if (lngInput) lngInput.value = '';
      editingGeofenceId = null;
      const btnSave = document.getElementById('btnSaveGeofence');
      if (btnSave) btnSave.textContent = '➕ Guardar Lugar Seguro';

      if (tempGeofenceMarker) {
        try {
          if (dedicatedLeafletMap) dedicatedLeafletMap.removeLayer(tempGeofenceMarker);
          if (leafletMap) leafletMap.removeLayer(tempGeofenceMarker);
        } catch (e) {}
        tempGeofenceMarker = null;
      }

      await loadAndRenderGeofencesInModal();
      if (typeof fetchAndRenderGeofences === 'function') {
        fetchAndRenderGeofences();
      }

      // Cerrar la pestaña / modal automáticamente tras guardar
      closeGeofenceManagerModal();
    } else {
      showToast('Error al guardar el lugar. Revisa los datos.', 'danger');
    }
  } catch (err) {
    console.error('Error guardando geocerca:', err);
    showToast('Error de conexión al guardar el lugar', 'danger');
  }
}

async function deleteGeofenceItem(geoId) {
  if (!currentDevice) return;

  const itemEl = document.getElementById(`geoItem-${geoId}`);
  if (itemEl) {
    itemEl.style.opacity = '0.35';
    itemEl.style.pointerEvents = 'none';
  }

  try {
    const res = await apiFetch(`/api/devices/${currentDevice.id}/geofences/${encodeURIComponent(geoId)}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      if (itemEl) itemEl.remove();
      if (Array.isArray(modalGeofencesList)) {
        modalGeofencesList = modalGeofencesList.filter(g => String(g.id) !== String(geoId));
        renderGeofencesListInModal(modalGeofencesList);
      }
      showToast('🗑️ Lugar eliminado correctamente', 'info');

      if (typeof fetchAndRenderGeofences === 'function') {
        fetchAndRenderGeofences();
      }
    } else {
      if (itemEl) {
        itemEl.style.opacity = '1';
        itemEl.style.pointerEvents = 'auto';
      }
      showToast('Error al eliminar el lugar', 'danger');
    }
  } catch (err) {
    console.error('Error eliminando geocerca:', err);
    if (itemEl) {
      itemEl.style.opacity = '1';
      itemEl.style.pointerEvents = 'auto';
    }
    showToast('Error de conexión al eliminar', 'danger');
  }
}
window.deleteGeofenceItem = deleteGeofenceItem;

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
    'reportsDeviceSelect',
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

// Variable global de día seleccionado para la traza
let selectedRouteDate = 'today';

function updateMediaDurationLabels() {
  const audSec = currentDevice?.audioClipDurationSeconds || 5;
  const vidSec = currentDevice?.videoClipDurationSeconds || 5;

  const btnCaptureVideoText = document.getElementById('btnCaptureVideoText');
  if (btnCaptureVideoText && !btnCaptureVideoText.textContent.includes('Grabando')) {
    btnCaptureVideoText.textContent = `Video (${vidSec}s)`;
  }

  const btnCaptureAudioText = document.getElementById('btnCaptureAudioText');
  if (btnCaptureAudioText && !btnCaptureAudioText.textContent.includes('Grabando')) {
    btnCaptureAudioText.textContent = `Audio (${audSec}s)`;
  }

  const btnAudioActionText = document.getElementById('btnAudioActionText');
  if (btnAudioActionText && !btnAudioActionText.textContent.includes('Grabando')) {
    btnAudioActionText.textContent = `Escuchar en Directo (${audSec}s)`;
  }

  const btnMultiTabCaptureVideo = document.getElementById('btnMultiTabCaptureVideo');
  if (btnMultiTabCaptureVideo) btnMultiTabCaptureVideo.textContent = `🎥 Grabar Video (${vidSec}s)`;

  const btnMultiTabCaptureAudio = document.getElementById('btnMultiTabCaptureAudio');
  if (btnMultiTabCaptureAudio) btnMultiTabCaptureAudio.textContent = `🎙️ Escuchar Audio (${audSec}s)`;
}

// Route History Tracking (GPS Path)
function toggleRouteHistory() {
  isRouteHistoryVisible = !isRouteHistoryVisible;
  const btnRouteHistoryText = document.getElementById('btnRouteHistoryText');
  const btnMapTabRouteHistory = document.getElementById('btnMapTabRouteHistory');

  if (isRouteHistoryVisible) {
    if (routeHistoryPanel) routeHistoryPanel.style.display = 'block';
    if (btnRouteHistoryText) btnRouteHistoryText.textContent = 'Ocultar Ruta';
    if (btnMapTabRouteHistory) btnMapTabRouteHistory.textContent = '🗺️ Ocultar Ruta';
    fetchAndRenderRouteHistory();
    showToast('🗺️ Trazando línea de ruta histórica del dispositivo', 'info');
  } else {
    if (routeHistoryPanel) routeHistoryPanel.style.display = 'none';
    if (btnRouteHistoryText) btnRouteHistoryText.textContent = 'Trazar Ruta';
    if (btnMapTabRouteHistory) btnMapTabRouteHistory.textContent = '🗺️ Trazar Ruta';
    clearRouteHistoryFromMap();
  }
}

async function fetchAndRenderRouteHistory(dateOverride) {
  if (!currentDevice) return;
  const dateParam = dateOverride || selectedRouteDate || 'today';

  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/location-history?date=${encodeURIComponent(dateParam)}&limit=1000`);
    if (res.ok) {
      const history = await res.json();
      renderRouteHistoryOnMap(history, dateParam);
      return;
    }
  } catch (err) {
    console.error('Error al obtener historial de ruta GPS', err);
  }

  // Fallback si no hay historial aún: crear un punto con la posición actual
  if ((dateParam === 'today' || dateParam === new Date().toISOString().slice(0, 10)) && currentDevice.location && currentDevice.location.latitude) {
    renderRouteHistoryOnMap([currentDevice.location], dateParam);
  } else {
    renderRouteHistoryOnMap([], dateParam);
  }
}

function clearRouteHistoryFromMap() {
  if (leafletRoutePolyline && leafletMap) {
    leafletMap.removeLayer(leafletRoutePolyline);
    leafletRoutePolyline = null;
  }
  leafletRouteMarkers.forEach(m => leafletMap && leafletMap.removeLayer(m));
  leafletRouteMarkers = [];

  if (dedicatedRoutePolyline && dedicatedLeafletMap) {
    dedicatedLeafletMap.removeLayer(dedicatedRoutePolyline);
    dedicatedRoutePolyline = null;
  }
  dedicatedRouteMarkers.forEach(m => dedicatedLeafletMap && dedicatedLeafletMap.removeLayer(m));
  dedicatedRouteMarkers = [];
}

function renderRouteHistoryOnMap(points, dateLabel = 'today') {
  clearRouteHistoryFromMap();
  const dayName = dateLabel === 'today' ? 'hoy' : dateLabel === 'yesterday' ? 'ayer' : dateLabel;

  if (!points || !points.length) {
    if (routeHistoryItemsList) {
      routeHistoryItemsList.innerHTML = `<div style="color: var(--text-muted); font-size: 0.78rem;">No hay registros de ruta GPS para ${dayName}.</div>`;
    }
    if (routePointsCountBadge) routePointsCountBadge.textContent = '0 posiciones';
    return;
  }

  // Calcular distancia total aproximada
  let totalDistMeters = 0;
  for (let i = 1; i < points.length; i++) {
    if (typeof points[i-1].latitude === 'number' && typeof points[i].latitude === 'number') {
      totalDistMeters += calculateDistanceMetersClient(points[i-1].latitude, points[i-1].longitude, points[i].latitude, points[i].longitude);
    }
  }
  const distStr = totalDistMeters >= 1000 ? `${(totalDistMeters / 1000).toFixed(2)} km` : `${Math.round(totalDistMeters)} m`;

  if (routePointsCountBadge) {
    routePointsCountBadge.textContent = `${points.length} puntos (${distStr})`;
  }

  const validPoints = points.filter(p => typeof p.latitude === 'number' && typeof p.longitude === 'number');
  const latlngs = validPoints.map(p => [p.latitude, p.longitude]);

  if (latlngs.length >= 2 && typeof L !== 'undefined') {
    const startPoint = latlngs[0];
    const endPoint = latlngs[latlngs.length - 1];
    const startTimeStr = validPoints[0].timestamp ? new Date(validPoints[0].timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    const endTimeStr = validPoints[validPoints.length - 1].timestamp ? new Date(validPoints[validPoints.length - 1].timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';

    // Trazar en mapa de resumen
    if (leafletMap) {
      leafletRoutePolyline = L.polyline(latlngs, {
        color: '#10b981',
        weight: 4,
        opacity: 0.9,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(leafletMap);

      const startMarker = L.circleMarker(startPoint, {
        radius: 7,
        fillColor: '#3b82f6',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(leafletMap).bindPopup(`<b>🏁 Inicio del día (${dayName})</b><br>${startTimeStr ? 'Hora: ' + startTimeStr : ''}`);
      leafletRouteMarkers.push(startMarker);

      const endMarker = L.circleMarker(endPoint, {
        radius: 7,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(leafletMap).bindPopup(`<b>📍 Fin / Posición final</b><br>${endTimeStr ? 'Hora: ' + endTimeStr : ''}`);
      leafletRouteMarkers.push(endMarker);

      leafletMap.fitBounds(leafletRoutePolyline.getBounds(), { padding: [30, 30] });
    }

    // Trazar en mapa dedicado
    if (dedicatedLeafletMap) {
      dedicatedRoutePolyline = L.polyline(latlngs, {
        color: '#10b981',
        weight: 4,
        opacity: 0.9,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(dedicatedLeafletMap);

      const startMarkerDed = L.circleMarker(startPoint, {
        radius: 7,
        fillColor: '#3b82f6',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(dedicatedLeafletMap).bindPopup(`<b>🏁 Inicio del día (${dayName})</b><br>${startTimeStr ? 'Hora: ' + startTimeStr : ''}`);
      dedicatedRouteMarkers.push(startMarkerDed);

      const endMarkerDed = L.circleMarker(endPoint, {
        radius: 7,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 1
      }).addTo(dedicatedLeafletMap).bindPopup(`<b>📍 Fin / Posición final</b><br>${endTimeStr ? 'Hora: ' + endTimeStr : ''}`);
      dedicatedRouteMarkers.push(endMarkerDed);

      dedicatedLeafletMap.fitBounds(dedicatedRoutePolyline.getBounds(), { padding: [30, 30] });
    }
  }

  // Renderizar la lista de puntos en el panel
  if (routeHistoryItemsList) {
    routeHistoryItemsList.innerHTML = '';
    const reversed = [...points].reverse(); // Más recientes primero
    reversed.slice(0, 15).forEach((pt) => {
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

  // Actualizar indicador de cuota de dispositivos en Mi Familia
  const familyDevicesUsageText = document.getElementById('familyDevicesUsageText');
  if (familyDevicesUsageText) {
    const count = (devicesList && Array.isArray(devicesList)) ? devicesList.length : 0;
    const maxDevs = currentSubscription.maxDevices || 5;
    familyDevicesUsageText.textContent = `${count} / ${maxDevs} permitidos`;
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
      renderFamilyTab();
      renderFamilyOverviewCards();
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

  if (adminFamilyIdBadge) adminFamilyIdBadge.textContent = '🛡️ Familia Protegida';

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
  authenticateWebSocket();
  loadDevicesList().then(() => {
    renderAll();
    fetchAndRenderGeofences();
  });
}

function setAdminLoggedOutUI() {
  if (adminLoggedOutSection) adminLoggedOutSection.style.display = 'block';
  if (adminLoggedInSection) adminLoggedInSection.style.display = 'none';

  // Limpiar dispositivos y estado activo de supervisión
  devicesList = [];
  currentDevice = null;
  localStorage.removeItem('kidsshield_active_device_id');
  renderDeviceSelector();
  renderNoDeviceState();

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

// WebSocket live connection con autenticación multi-familia
function authenticateWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN && adminAuthToken) {
    socket.send(JSON.stringify({ type: 'AUTH_PARENT', token: adminAuthToken }));
  }
}

function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  try {
    socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      console.log('🟢 Conectado al canal en tiempo real KidsShield');
      authenticateWebSocket();
    };
    socket.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'AUTH_SUCCESS') {
          console.log(`[WS] ✅ Conexión autenticada para la familia: ${data.payload?.familyId}`);
          return;
        }

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
          renderFamilyOverviewCards();
          renderFamilyChildrenCards();
          if (!isOnline) {
            showToast(message || `⚠️ Conexión perdida con ${dev?.name || id}. Posible desinstalación o sin red.`, 'warning');
            playAlertSound();
            triggerWebNotification('⚠️ Dispositivo Desconectado', message || `Se perdió la conexión con ${dev?.name || id}.`);
          }
        } else if (data.type === 'DEVICE_DELETED') {
          const deletedId = data.payload?.id;
          showToast(`Dispositivo ${deletedId || ''} fue desvinculado y liberado`, 'info');
          devicesList = devicesList.filter(d => d.id !== deletedId);
          if (currentDevice && currentDevice.id === deletedId) {
            if (devicesList.length > 0) {
              onDeviceSelected(devicesList[0].id);
            } else {
              currentDevice = null;
              localStorage.removeItem('kidsshield_active_device_id');
              renderNoDeviceState();
            }
          }
          renderDeviceSelector();
          renderFamilyOverviewCards();
          renderFamilyChildrenCards();
          syncChildContextSelectors();
          const familyDevicesUsageText = document.getElementById('familyDevicesUsageText');
          if (familyDevicesUsageText) {
            const sub = (typeof currentSubscription !== 'undefined' && currentSubscription) ? currentSubscription : { maxDevices: 5 };
            familyDevicesUsageText.textContent = `${devicesList.length} / ${sub.maxDevices || 5} permitidos`;
          }
        } else if (data.type === 'EVENT_RECORDED' && currentDevice && data.payload.id === currentDevice.id) {
          if (!currentDevice.activityLog) currentDevice.activityLog = [];
          currentDevice.activityLog.unshift(data.payload.event);
          if (currentDevice.activityLog.length > 50) currentDevice.activityLog.pop();
          renderActivityFeed();
          renderHistoryTab();
          playAlertSound();
          if (data.payload.event.type === 'blocked' || data.payload.event.type === 'warning' || data.payload.event.type === 'gps_alert') {
            triggerWebNotification('⚠️ Alerta KidsShield', data.payload.event.message);
          }
        } else if (data.type === 'CONFIG_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          Object.assign(currentDevice, data.payload.config);
          renderHero();
        } else if (data.type === 'SUBSCRIPTION_UPDATED') {
          if (data.payload) {
            currentSubscription.plan = data.payload.plan;
            currentSubscription.maxDevices = data.payload.maxDevices;
            updateSubscriptionUI();
            renderFamilyTab();
            renderFamilyOverviewCards();
          }
        } else if (data.type === 'DEVICE_CREATED' || data.type === 'DEVICES_UPDATED') {
          const newId = data.payload?.id;
          await loadDevicesList(newId || (currentDevice ? currentDevice.id : null));
          renderFamilyOverviewCards();
          renderFamilyChildrenCards();
          syncChildContextSelectors();
          if (currentDashboardView === 'devices') {
            renderDevicesTab();
          }
          if (data.type === 'DEVICE_CREATED') {
            showToast(`📱 ¡Nuevo dispositivo conectado: ${data.payload?.name || 'Teléfono del Menor'}!`, 'success');
            playAlertSound();
          }
        } else if (data.type === 'SCREENSHOT_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          closeVideoClipOverlay();
          currentDevice.isOnline = true;
          currentDevice.lastSeen = data.payload.timestamp || new Date().toISOString();
          renderHeader();
          renderFamilyOverviewCards();
          if (!isLivePaused) {
            currentDevice.lastScreenshot = data.payload.imageBase64 || data.payload.screenshot;
            currentDevice.lastScreenshotTime = data.payload.timestamp;
            renderSimulator();
          }
          if (typeof fetchAndRenderMultimediaGallery === 'function') {
            fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
          }

          const btnText = document.getElementById('btnCaptureScreenText');
          const btnIcon = document.getElementById('btnCaptureScreenIcon');
          if (btnText) btnText.textContent = 'Capturar';
          if (btnIcon) btnIcon.textContent = '📸';

          playAlertSound();
          showToast('📸 ¡Captura de pantalla recibida!', 'success');
        } else if (data.type === 'VIDEO_CLIP_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          handleNewVideoClip(data.payload.frames, data.payload.intervalMs || 500);
          if (typeof fetchAndRenderMultimediaGallery === 'function') {
            fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
          }
        } else if ((data.type === 'AUDIO_CLIP_UPDATED' || data.type === 'AUDIO_CLIP_READY') && currentDevice && data.payload.id === currentDevice.id) {
          handleNewAudioClip(data.payload.audioBase64, data.payload.duration || 5, data.payload.timestamp);
          if (typeof fetchAndRenderMultimediaGallery === 'function') {
            fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
          }
        } else if (data.type === 'MULTIMEDIA_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          if (typeof fetchAndRenderMultimediaGallery === 'function') {
            fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
          }
        } else if (data.type === 'GEOFENCE_UPDATED' || data.type === 'GEOFENCE_DELETED') {
          fetchAndRenderGeofences();
        } else if (data.type === 'LOCATION_UPDATED' && currentDevice && data.payload.id === currentDevice.id) {
          currentDevice.location = data.payload.location;
          currentDevice.isOnline = true;
          currentDevice.lastSeen = new Date().toISOString();
          renderHeader();
          renderFamilyOverviewCards();
          renderMap();
          if (typeof currentDashboardView !== 'undefined' && currentDashboardView === 'map') {
            initDedicatedMap();
          }
          if (isRouteHistoryVisible) {
            fetchAndRenderRouteHistory();
          }

          const btnLocationText = document.getElementById('btnRefreshLocationText');
          const btnLocationIcon = document.getElementById('btnRefreshLocationIcon');
          if (btnLocationText) btnLocationText.textContent = 'Actualizar';
          if (btnLocationIcon) btnLocationIcon.textContent = '🔄';

          if (isManualLocationRequest) {
            showToast('📍 Ubicación GPS actualizada en el mapa', 'success');
            isManualLocationRequest = false;
          }
        } else if (data.type === 'KEYSTROKE_ALERT') {
          const entry = data.payload?.entry || {};
          const targetDevId = data.payload?.deviceId;
          playAlertSound();
          triggerWebNotification('🚨 Alerta de Teclado KidsShield', `Texto riesgoso detectado en ${entry.appName || 'app'}: "${entry.text || ''}"`);
          showToast(`🚨 Alerta en ${entry.appName || 'dispositivo'}: ${entry.alertCategory || 'palabra sospechosa'} detectada`, 'danger');
          if (currentDevice && targetDevId === currentDevice.id) {
            if (currentDashboardView === 'keystrokes') {
              fetchAndRenderKeystrokes(selectedKeystrokesDate);
            }
          }
        } else if (data.type === 'KEYSTROKE_LOGGED') {
          const targetDevId = data.payload?.deviceId;
          if (currentDevice && targetDevId === currentDevice.id) {
            if (currentDashboardView === 'keystrokes') {
              fetchAndRenderKeystrokes(selectedKeystrokesDate);
            }
          }
        } else if (data.type === 'PUSH_NOTIFICATION') {
          triggerWebNotification(data.payload.title || 'Alerta KidsShield', data.payload.body || 'Evento de seguridad detectado');
          showToast(data.payload.body, data.payload.type === 'alert' ? 'danger' : 'warning');
          renderHistoryTab();
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

// Sondeo y actualización en vivo del historial cuando la pestaña está visible
setInterval(() => {
  const historyTab = document.getElementById('tabViewHistory');
  if (historyTab && !historyTab.classList.contains('hidden') && currentDevice) {
    renderHistoryTab();
  }
}, 4000);

// Request immediate screenshot from child device
async function requestScreenshotNow() {
  if (!currentDevice) {
    showToast('No hay ningún dispositivo vinculado actualmente.', 'warning');
    openPairingQrModal();
    return;
  }
  closeVideoClipOverlay();
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
      currentDevice.isOnline = true;
      currentDevice.lastSeen = new Date().toISOString();
      renderHeader();
      renderFamilyOverviewCards();
      console.log('Petición de captura transmitida al servidor');

      // Refresco inmediato y diferido de la galería multimedia
      [800, 1800, 3200, 5000].forEach(ms => {
        setTimeout(() => {
          if (typeof fetchAndRenderMultimediaGallery === 'function') {
            fetchAndRenderMultimediaGallery(activeMultimediaFilter || 'all');
          }
        }, ms);
      });
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
function playAlertSound(force = false) {
  if (!force && !notificationSoundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
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
