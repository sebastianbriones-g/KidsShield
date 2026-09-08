// KidsShield - Parent Dashboard Application Logic

let currentDevice = {
  id: 'KID-PHONE-01',
  name: 'Teléfono de Mateo (Galaxy A34)',
  childName: 'Mateo',
  avatar: '👦',
  isOnline: true,
  battery: 78,
  lastSeen: new Date().toISOString(),
  isLocked: false,
  lockReason: 'Bloqueado por padres',
  parentPin: '1234',
  screenTimeTodayMinutes: 135,
  dailyLimitMinutes: 120,
  bedtimeEnabled: true,
  bedtimeStart: '21:30',
  bedtimeEnd: '07:00',
  currentActiveApp: 'com.zhiliaoapp.musically',
  currentActiveAppName: 'TikTok',
  blockedApps: [
    'com.roblox.client',
    'com.instagram.android'
  ],
  appCatalog: [
    { package: 'com.zhiliaoapp.musically', name: 'TikTok', category: 'Redes Sociales', icon: '📱', timeTodayMinutes: 65, isBlocked: false },
    { package: 'com.google.android.youtube', name: 'YouTube', category: 'Videos', icon: '▶️', timeTodayMinutes: 40, isBlocked: false },
    { package: 'com.whatsapp', name: 'WhatsApp', category: 'Mensajería', icon: '💬', timeTodayMinutes: 20, isBlocked: false },
    { package: 'com.roblox.client', name: 'Roblox', category: 'Juegos', icon: '🎮', timeTodayMinutes: 0, isBlocked: true },
    { package: 'com.instagram.android', name: 'Instagram', category: 'Redes Sociales', icon: '📸', timeTodayMinutes: 0, isBlocked: true },
    { package: 'com.duolingo', name: 'Duolingo', category: 'Educación', icon: '🦉', timeTodayMinutes: 10, isBlocked: false },
    { package: 'com.android.chrome', name: 'Google Chrome', category: 'Navegador', icon: '🌐', timeTodayMinutes: 0, isBlocked: false }
  ],
  activityLog: [
    { time: '22:15', type: 'warning', message: 'Mateo intentó abrir Roblox (Bloqueado)' },
    { time: '21:45', type: 'info', message: 'Tiempo total de pantalla superó las 2 horas' },
    { time: '20:10', type: 'alert', message: 'TikTok usado por más de 60 minutos continuos' },
    { time: '18:30', type: 'success', message: 'Mateo completó 10 min en Duolingo' }
  ]
};

let activeCategoryFilter = 'all';
let searchQuery = '';
let socket = null;

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

// Modals
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupWebSocket();
  fetchDeviceData();
  bindEvents();
  renderAll();
  startClock();
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
  renderHeader();
  renderHero();
  renderAppList();
  renderScheduleControls();
  renderSimulator();
  renderActivityFeed();
}

function renderHeader() {
  currentDeviceName.textContent = currentDevice.name;
  batteryStatus.textContent = `🔋 ${currentDevice.battery}%`;
  headerPinDisplay.textContent = currentDevice.parentPin;

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
  const used = currentDevice.screenTimeTodayMinutes;
  const limit = currentDevice.dailyLimitMinutes;
  statScreenTimeVal.textContent = formatMinutes(used);
  statScreenTimeLimit.textContent = `/ límite ${formatMinutes(limit)}`;

  const percent = Math.min(100, Math.round((used / limit) * 100));
  screenTimeProgressBar.style.width = `${percent}%`;

  if (used >= limit) {
    screenTimeProgressBar.className = 'progress-bar-fill progress-exceeded';
    limitStatusBadge.className = 'badge badge-warning';
    limitStatusBadge.textContent = '⚠️ Límite diario excedido';
  } else {
    screenTimeProgressBar.className = 'progress-bar-fill';
    limitStatusBadge.className = 'badge badge-accent';
    limitStatusBadge.textContent = `Restan ${formatMinutes(limit - used)}`;
  }

  // Active App
  const activeApp = currentDevice.appCatalog.find(a => a.package === currentDevice.currentActiveApp);
  if (activeApp) {
    activeAppIcon.textContent = activeApp.icon;
    activeAppName.textContent = activeApp.name;
    activeAppCategory.textContent = activeApp.category;
    activeAppDesc.textContent = `En uso continuo hoy: ${formatMinutes(activeApp.timeTodayMinutes)}`;

    if (activeApp.isBlocked) {
      btnQuickBlockActiveApp.textContent = '✅ Desbloquear App';
      btnQuickBlockActiveApp.style.background = 'rgba(16, 185, 129, 0.2)';
      btnQuickBlockActiveApp.style.color = '#34d399';
    } else {
      btnQuickBlockActiveApp.textContent = '⛔ Bloquear Esta App';
      btnQuickBlockActiveApp.style.background = 'rgba(239, 68, 68, 0.15)';
      btnQuickBlockActiveApp.style.color = '#f87171';
    }
  }

  // Bedtime
  toggleBedtime.checked = currentDevice.bedtimeEnabled;
  bedtimeTimeDisplay.textContent = `${currentDevice.bedtimeStart} - ${currentDevice.bedtimeEnd}`;
  bedtimeStartInput.value = currentDevice.bedtimeStart;
  bedtimeEndInput.value = currentDevice.bedtimeEnd;
}

function renderAppList() {
  appListContainer.innerHTML = '';

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
    const row = document.createElement('div');
    row.className = `app-row ${app.isBlocked ? 'is-blocked' : ''}`;
    row.innerHTML = `
      <div class="app-info-left">
        <div class="app-icon-badge">${app.icon}</div>
        <div class="app-text-group">
          <div class="app-title-line">
            <span class="app-name">${app.name}</span>
            <span class="app-tag">${app.category}</span>
          </div>
          <span class="app-time-sub">${app.isBlocked ? '🚫 Acceso restringido' : `⏱️ ${formatMinutes(app.timeTodayMinutes)} hoy`}</span>
        </div>
      </div>
      <div class="app-toggle-action">
        <button class="toggle-block-btn ${app.isBlocked ? 'btn-blocked' : 'btn-allowed'}" data-pkg="${app.package}">
          ${app.isBlocked ? '🚫 Bloqueada' : '✓ Permitida'}
        </button>
      </div>
    `;

    row.querySelector('.toggle-block-btn').addEventListener('click', () => {
      toggleAppBlock(app.package, !app.isBlocked);
    });

    appListContainer.appendChild(row);
  });
}

function renderScheduleControls() {
  dailyLimitRange.value = currentDevice.dailyLimitMinutes;
  dailyLimitValText.textContent = formatMinutes(currentDevice.dailyLimitMinutes);
}

function renderSimulator() {
  const activeApp = currentDevice.appCatalog.find(a => a.package === currentDevice.currentActiveApp);
  if (activeApp) {
    simAppBadge.textContent = `${activeApp.icon} ${activeApp.name}`;
  }

  const isBlockedApp = activeApp && activeApp.isBlocked;
  const isOverLimit = currentDevice.screenTimeTodayMinutes >= currentDevice.dailyLimitMinutes;
  const isLockedMaster = currentDevice.isLocked;

  if (isLockedMaster || isBlockedApp || isOverLimit) {
    simLockOverlay.classList.add('active');
    if (isLockedMaster) {
      simLockTitle.textContent = '🔒 Teléfono Pausado';
      simLockReason.textContent = currentDevice.lockReason || 'Bloqueado remotamente por tus padres.';
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

function renderActivityFeed() {
  activityFeedContainer.innerHTML = '';
  currentDevice.activityLog.forEach(item => {
    const el = document.createElement('div');
    el.className = `activity-item ${item.type || 'info'}`;
    el.innerHTML = `
      <span class="activity-time">${item.time}</span>
      <span class="activity-msg">${item.message}</span>
    `;
    activityFeedContainer.appendChild(el);
  });
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

// Event Bindings
function bindEvents() {
  // Master Lock
  btnMasterLock.addEventListener('click', () => {
    const newLockState = !currentDevice.isLocked;
    updateRemoteConfig({
      isLocked: newLockState,
      lockReason: newLockState ? 'Bloqueo inmediato solicitado por los padres' : ''
    });
    showToast(newLockState ? 'Teléfono del hijo bloqueado remotamente' : 'Teléfono del hijo desbloqueado', newLockState ? 'warning' : 'success');
  });

  // Quick block active app
  btnQuickBlockActiveApp.addEventListener('click', () => {
    const activeApp = currentDevice.appCatalog.find(a => a.package === currentDevice.currentActiveApp);
    if (activeApp) {
      toggleAppBlock(activeApp.package, !activeApp.isBlocked);
    }
  });

  // Bonus time
  btnAddBonusTime.addEventListener('click', () => {
    const newLimit = currentDevice.dailyLimitMinutes + 15;
    updateRemoteConfig({ dailyLimitMinutes: newLimit });
    showToast('Se otorgaron +15 minutos de tiempo de pantalla extra', 'success');
  });

  // Range slider
  dailyLimitRange.addEventListener('input', (e) => {
    const mins = parseInt(e.target.value, 10);
    dailyLimitValText.textContent = formatMinutes(mins);
  });

  dailyLimitRange.addEventListener('change', (e) => {
    const mins = parseInt(e.target.value, 10);
    updateRemoteConfig({ dailyLimitMinutes: mins });
    showToast(`Nuevo límite diario: ${formatMinutes(mins)}`, 'success');
  });

  // Bedtime toggle
  toggleBedtime.addEventListener('change', (e) => {
    updateRemoteConfig({ bedtimeEnabled: e.target.checked });
    showToast(e.target.checked ? 'Modo noche activado' : 'Modo noche desactivado', 'info');
  });

  // Save Schedule
  btnSaveSchedule.addEventListener('click', () => {
    updateRemoteConfig({
      bedtimeStart: bedtimeStartInput.value,
      bedtimeEnd: bedtimeEndInput.value
    });
    showToast('Horarios de descanso guardados correctamente', 'success');
  });

  // App Search
  appSearchInput.addEventListener('input', (e) => {
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
  btnSimUnlockPin.addEventListener('click', () => {
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

  // Modals
  btnShowSetupSteps.addEventListener('click', () => setupModal.classList.add('active'));
  btnCloseSetupModal.addEventListener('click', () => setupModal.classList.remove('active'));
  btnConfirmSteps.addEventListener('click', () => setupModal.classList.remove('active'));

  btnOpenPinModal.addEventListener('click', () => {
    newPinInput.value = currentDevice.parentPin;
    pinModal.classList.add('active');
  });
  btnClosePinModal.addEventListener('click', () => pinModal.classList.remove('active'));
  btnCancelPinModal.addEventListener('click', () => pinModal.classList.remove('active'));
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
}

// Toggle app block state
async function toggleAppBlock(packageName, isBlocked) {
  try {
    const res = await fetch(`/api/devices/${currentDevice.id}/toggle-app`, {
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
    const res = await fetch(`/api/devices/${currentDevice.id}/config`, {
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
async function fetchDeviceData() {
  try {
    const res = await fetch(`/api/devices/${currentDevice.id}`);
    if (res.ok) {
      currentDevice = await res.json();
      renderAll();
    }
  } catch (e) {
    console.log('Utilizando estado inicial predeterminado');
  }
}

// WebSocket live connection
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  try {
    socket = new WebSocket(wsUrl);
    socket.onopen = () => console.log('🟢 Conectado al canal en tiempo real KidsShield');
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'DEVICE_UPDATED' && data.payload.id === currentDevice.id) {
          currentDevice = data.payload;
          renderAll();
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
