// Klaseco Admin Dashboard (RFID Only)
const STORAGE_KEY = 'teacher_attendance_records'; // from tap page
const TEACHER_DB_KEY = 'teacher_db';              // managed here
const DEVICE_KEY = 'devices_state';
const LOG_KEY = 'system_logs';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ------------------- NAV ------------------- */
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.getAttribute('data-panel');
    $$('.panel').forEach(p => p.classList.remove('visible'));
    document.getElementById(id).classList.add('visible');
  });
});

/* ------------------- TOAST ------------------- */
let toastTimer;
function toast(msg, type = "info", timeout = 2500) {
  const t = document.getElementById("toast");
  if (!t) return;

  // reset
  t.className = "";
  t.innerHTML = "";

  // choose icon
  let icon = "";
  if (type === "success") icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === "error")   icon = '<i class="fa-solid fa-circle-xmark"></i>';
  if (type === "info")    icon = '<i class="fa-solid fa-circle-info"></i>';

  // apply type + message
  t.classList.add("show", type);
  t.innerHTML = `${icon} <span>${msg}</span>`;

  clearTimeout(toast._id);
  toast._id = setTimeout(() => {
    t.classList.remove("show");
  }, timeout);
}


/* ------------------- STORAGE ------------------- */
function loadRecords() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function saveRecords(x){ localStorage.setItem(STORAGE_KEY, JSON.stringify(x)); }

function loadTeacherDB(){ try { return JSON.parse(localStorage.getItem(TEACHER_DB_KEY) || '{}'); } catch { return {}; } }
function saveTeacherDB(db){ localStorage.setItem(TEACHER_DB_KEY, JSON.stringify(db)); }

function loadDevices(){ try { return JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}'); } catch { return {}; } }
function saveDevices(x){ localStorage.setItem(DEVICE_KEY, JSON.stringify(x)); }

function loadLogs(){ try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch { return []; } }
function saveLogs(x){ localStorage.setItem(LOG_KEY, JSON.stringify(x)); }
function logEvent(event, detail='') {
  const logs = loadLogs();
  logs.push({ ts: Date.now(), time: new Date().toLocaleString(), event, detail });
  saveLogs(logs);
}

/* ------------------- SEED TEACHERS ------------------- */
function ensureTeacherDB(){
  const db = loadTeacherDB();
  if (Object.keys(db).length === 0) {
    const seed = {
      "12345678": "Engr. Autor",
      "23456789": "Engr. Cañonero",
      "34567890": "Engr. Llamado",
      "45678901": "Engr. Lumayag",
      "45434536": "Engr. Degamo"
    };
    saveTeacherDB(seed);
    logEvent('Seed', 'Teacher DB initialized');
    return seed;
  }
  return db;
}

/* ------------------- DASHBOARD KPIs ------------------- */
function computeKPIs(){
  const todayKey = new Date().toLocaleDateString();
  const recs = loadRecords();
  const today = recs.filter(r => r.date === todayKey);

  const present = new Set(today.filter(r => r.status === 'Time In' || r.status === 'Time Out').map(r => r.name)).size;
  const timeIns = today.filter(r => r.status === 'Time In').length;

  const devices = loadDevices();
  const onCount = ['lights','fans','ac'].reduce((n,k)=> n + (devices[k] ? 1 : 0), 0);
  const auto = !!devices.auto;

  $('#kpiPresent').textContent = present;
  $('#kpiTimeIns').textContent = timeIns;
  $('#kpiDevicesOn').textContent = onCount;
  $('#kpiAutoMode').textContent = auto ? 'On' : 'Off';
}

/* ------------------- QUICK ACTIONS ------------------- */
$('#qaAllOff').addEventListener('click', () => {
  const dev = loadDevices();
  dev.lights = false; dev.fans = false; dev.ac = false;
  saveDevices(dev);
  computeKPIs();
  syncDeviceSwitches();
  logEvent('Devices', 'All OFF');
  toast('All devices turned OFF.');
});
$('#qaAutoMode').addEventListener('click', () => {
  const dev = loadDevices();
  dev.auto = !dev.auto;
  saveDevices(dev);
  computeKPIs();
  syncDeviceSwitches();
  logEvent('Automation', `Auto Mode ${dev.auto ? 'ON' : 'OFF'}`);
  toast(`Auto Mode ${dev.auto ? 'enabled' : 'disabled'}.`);
});
$('#qaExportToday').addEventListener('click', () => {
  exportCSV(true);
});

/* ------------------- ATTENDANCE ------------------- */
const attDate = $('#attDate');
const attTeacher = $('#attTeacher');
const attSearch = $('#attSearch');
const attTableBody = $('#attTable tbody');
$('#attReset').addEventListener('click', () => { attDate.value=''; attTeacher.value=''; attSearch.value=''; renderAttendance(); });
$('#attExport').addEventListener('click', () => exportCSV(false));

function uniqueDates(records) { return Array.from(new Set(records.map(r=>r.date))).sort((a,b)=> new Date(b)-new Date(a)); }
function uniqueTeachers(records) { return Array.from(new Set(records.map(r=>r.name))).sort(); }

function populateAttendanceFilters(){
  const recs = loadRecords();
  attDate.innerHTML = `<option value="">All dates</option>`;
  uniqueDates(recs).forEach(d => attDate.insertAdjacentHTML('beforeend', `<option value="${d}">${d}</option>`));

  const db = loadTeacherDB();
  const names = Array.from(new Set([...Object.values(db), ...uniqueTeachers(recs)])).sort();
  attTeacher.innerHTML = `<option value="">All teachers</option>` + names.map(n=>`<option value="${n}">${n}</option>`).join('');
}

function statusBadge(status){
  const cls = status === 'Time In' ? 'badge-in' : status === 'Time Out' ? 'badge-out' : 'badge-denied';
  return `<span class="badge ${cls}">${status}</span>`;
}

function renderAttendance(){
  const q = attSearch.value.trim().toLowerCase();
  const dateSel = attDate.value;
  const teacherSel = attTeacher.value;

  const all = loadRecords();
  const filtered = all.filter(r => {
    const a = !dateSel || r.date === dateSel;
    thetcher = r.name; // typo guard no-op
    const b = !teacherSel || r.name === teacherSel;
    const c = !q || (r.name?.toLowerCase().includes(q) || r.status?.toLowerCase().includes(q));
    return a && b && c;
  }).sort((a,b) => (b.ts ?? Date.parse(b.date)) - (a.ts ?? Date.parse(a.date)));

  attTableBody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.time || ''}</td>
      <td>${r.name || ''}</td>
      <td>${statusBadge(r.status || '')}</td>
      <td>${r.date || ''}</td>
    </tr>
  `).join('');
}
[attDate, attTeacher].forEach(el => el.addEventListener('change', renderAttendance));
attSearch.addEventListener('input', renderAttendance);

function exportCSV(todayOnly){
  const todayKey = new Date().toLocaleDateString();
  const all = loadRecords().sort((a,b) => (b.ts ?? Date.parse(b.date)) - (a.ts ?? Date.parse(a.date)));
  const rows = (todayOnly ? all.filter(r=>r.date===todayKey) : all);

  if (!rows.length) { toast('No records to export.'); return; }
  const lines = [['Time','Teacher','Status','Date'].join(',')].concat(
    rows.map(r => [r.time, r.name, r.status, r.date].map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(','))
  );
  const csv = lines.join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = `attendance_${todayOnly?'today_':''}${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV exported.');
}

/* ------------------- TEACHERS ------------------- */
// Elements
const tId = $('#tId'), tName = $('#tName'), tSave = $('#tSave'), tTableBody = $('#tTable tbody');

function renderTeacherTable(){
  const db = loadTeacherDB();
  const entries = Object.entries(db).sort((a,b)=> a[1].localeCompare(b[1]));

  if (!entries.length){
    tTableBody.innerHTML = `<tr><td colspan="3" class="center muted">No teachers yet.</td></tr>`;
    return;
  }

  tTableBody.innerHTML = entries.map(([id,name]) => `
    <tr>
      <td>${id}</td>
      <td>${name}</td>
      <td class="center">
        <button class="btn" data-edit="${id}"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
        <button class="btn danger" data-remove="${id}"><i class="fa-solid fa-user-minus"></i> Remove</button>
      </td>
    </tr>
  `).join('');
}

// Single delegated listener for Edit/Remove
tTableBody.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-edit]');
  const removeBtn = e.target.closest('[data-remove]');
  if (!editBtn && !removeBtn) return;

  const db = loadTeacherDB();

  // Edit
  if (editBtn){
    const id = editBtn.getAttribute('data-edit');
    tId.value = id;
    tName.value = db[id] || '';
    tId.focus();
    tSave.textContent = 'Update';
    toast('Loaded teacher for editing', 'info');
    return;
  }

  // Remove
  if (removeBtn){
    const id = removeBtn.getAttribute('data-remove');
    const name = db[id];
    if (!name) return;

    const doRemove = () => {
      delete db[id];
      saveTeacherDB(db);
      renderTeacherTable();
      logEvent('Teacher', `Removed ${name} (${id})`);
      toast('Teacher removed', 'success');
      // reset form if we were editing this id
      if (tId.value === id){ tId.value=''; tName.value=''; tSave.textContent='Add / Update'; }
    };

    if (window.Swal){
      Swal.fire({
        title: 'Remove teacher?',
        html: `<strong>${name}</strong><br><span class="muted">${id}</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-user-minus"></i> Remove',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        focusCancel: true
      }).then(res => { if (res.isConfirmed) doRemove(); });
    } else {
      if (confirm(`Remove teacher "${name}" (${id})?`)) doRemove();
    }
  }
});

// Save / Update
tSave.addEventListener('click', () => {
  const id = tId.value.trim();
  const name = tName.value.trim();

  if (!/^[0-9]{8}$/.test(id)) return toast('Teacher ID must be 8 digits.', 'error');
  if (!name) return toast('Please enter teacher name.', 'error');

  const db = loadTeacherDB();
  const exists = Object.prototype.hasOwnProperty.call(db, id);
  const doSave = () => {
    db[id] = name;
    saveTeacherDB(db);
    renderTeacherTable();
    logEvent('Teacher', `${exists ? 'Updated' : 'Saved'} ${name} (${id})`);
    toast(`Teacher ${exists ? 'updated' : 'saved'}`, 'success');
    tId.value=''; tName.value=''; tSave.textContent='Add / Update';
  };

  if (exists && db[id] !== name && window.Swal){
    Swal.fire({
      title: 'Overwrite existing?',
      html: `ID <strong>${id}</strong> is already assigned to <em>${db[id]}</em>.<br>Replace with <strong>${name}</strong>?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Overwrite',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1d4ed8',
      cancelButtonColor: '#64748b'
    }).then(res => { if (res.isConfirmed) doSave(); });
  } else if (exists && db[id] !== name){
    if (confirm(`ID ${id} already exists for "${db[id]}". Replace with "${name}"?`)) doSave();
  } else {
    doSave();
  }
});

// Optional: allow Enter key to save when in the name field
tName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tSave.click();
});


/* ------------------- DEVICES ------------------- */
const devLights = $('#devLights'), devFans = $('#devFans'), devAc = $('#devAc'), devAuto = $('#devAuto');

function syncDeviceSwitches(){
  const d = loadDevices();
  devLights.checked = !!d.lights;
  devFans.checked = !!d.fans;
  devAc.checked = !!d.ac;
  devAuto.checked = !!d.auto;
}
function updateDevices(){
  const d = loadDevices();
  d.lights = devLights.checked;
  d.fans = devFans.checked;
  d.ac = devAc.checked;
  d.auto = devAuto.checked;
  saveDevices(d);
  computeKPIs();
  logEvent('Devices', `L:${d.lights?'1':'0'} F:${d.fans?'1':'0'} AC:${d.ac?'1':'0'} Auto:${d.auto?'1':'0'}`);
}
[devLights,devFans,devAc,devAuto].forEach(el=> el.addEventListener('change', updateDevices));

/* ------------------- ENERGY (demo bars) ------------------- */
function buildEnergyBars(){
  // Simple demo: assume Lights=2, Fans=1.2, AC=6 kWh today depending on toggle state
  const d = loadDevices();
  const vals = {
    Lights: d.lights ? 2 : 0.7,
    Fans: d.fans ? 1.2 : 0.4,
    Aircon: d.ac ? 6 : 2.2
  };
  const max = Math.max(...Object.values(vals)) || 1;
  const colors = { Lights:'#2563eb', Fans:'#f59e0b', Aircon:'#7c3aed' };

  const wrap = $('#energyBars');
  wrap.innerHTML = '';
  Object.entries(vals).forEach(([label, val]) => {
    const pct = Math.round((val / max) * 100);
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = `
      <div class="label">${label}</div>
      <div class="track"><div class="fill" style="width:${pct}%; background:${colors[label]}"></div></div>
    `;
    wrap.appendChild(bar);
  });
}

/* ------------------- SYSTEM LOGS ------------------- */
const logTableBody = $('#logTable tbody');
function renderLogs(){
  const logs = loadLogs().slice(-200).reverse(); // last 200
  logTableBody.innerHTML = logs.map(l => `
    <tr>
      <td>${l.time}</td>
      <td>${l.event}</td>
      <td>${l.detail || ''}</td>
    </tr>
  `).join('');
}
$('#logsClear').addEventListener('click', () => {
  const logs = loadLogs(); // <- your existing function that loads logs
  if (!logs || logs.length === 0) {
    toast('No logs to clear', 'info');
    return;
  }

  if (window.Swal) {
    Swal.fire({
      title: 'Clear all logs?',
      text: 'This will permanently delete all system logs.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: '<i class="fa-solid fa-trash"></i> Clear Logs',
      cancelButtonText: 'Cancel'
    }).then(result => {
      if (result.isConfirmed) {
        localStorage.removeItem(LOG_KEY);
        renderLogs();
        toast('All logs cleared', 'success');
      }
    });
  } else {
    if (!confirm('Clear all system logs?')) return;
    localStorage.removeItem(LOG_KEY);
    renderLogs();
    toast('All logs cleared', 'success');
  }
});

function updateClock() {
  const now = new Date();
  const options = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  document.getElementById('clock').textContent = now.toLocaleTimeString([], options);
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  if (window.Swal) {
    Swal.fire({
      title: 'Logout?',
      text: 'You will be signed out of the dashboard.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: '<i class="fa-solid fa-right-from-bracket"></i> Logout'
    }).then(result => {
      if (result.isConfirmed) {
        // Replace this with your real logout logic
        toast('Logged out', 'success');
        window.location.href = 'login.html';
      }
    });
  } else {
    if (confirm('Logout from the dashboard?')) {
      toast('Logged out', 'success');
      window.location.href = 'login.html';
    }
  }
});

function updateClock() {
  const now = new Date();
  const options = {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  };
  document.getElementById('clock').textContent =
    now.toLocaleString([], options);
}
setInterval(updateClock, 1000);
updateClock();
setInterval(updateClock, 1000);
updateClock(); // initial run

const notifBtn = document.getElementById('notifBtn');
const notifDropdown = document.getElementById('notifDropdown');
const notifList = document.getElementById('notifList');
const clearNotifs = document.getElementById('clearNotifs');

// Toggle dropdown on bell click
notifBtn.addEventListener('click', () => {
  const dot = notifBtn.querySelector('.dot');
  notifDropdown.style.display = notifDropdown.style.display === 'block' ? 'none' : 'block';
  if (notifDropdown.style.display === 'block' && dot) dot.classList.remove('active');
});

// Close dropdown if click outside
document.addEventListener('click', (e) => {
  if (!notifDropdown.contains(e.target) && !notifBtn.contains(e.target)) {
    notifDropdown.style.display = 'none';
  }
});

// Append notification
function addNotification(message, type = 'error') {
  const li = document.createElement('li');
  li.innerHTML = `
    <span class="badge ${type === 'error' ? 'badge-out' : 'badge-in'}">${type}</span>
    <span>${message}</span>
  `;
  notifList.prepend(li);

  // show red dot
  const dot = notifBtn.querySelector('.dot');
  if (dot) dot.classList.add('active');
}

// Clear notifications
clearNotifs.addEventListener('click', () => {
  notifList.innerHTML = '';
  toast('Notifications cleared', 'info');
});

// Example usage: whenever a device fails
// addNotification("Aircon failed to turn OFF", "error");


/* ------------------- INIT ------------------- */
function init(){
  ensureTeacherDB();
  populateAttendanceFilters();
  renderAttendance();
  renderTeacherTable();
  syncDeviceSwitches();
  computeKPIs();
  buildEnergyBars();
  renderLogs();

  // Rebuild energy bars whenever device state changes
  [devLights,devFans,devAc].forEach(el => el.addEventListener('change', buildEnergyBars));
}
init();
