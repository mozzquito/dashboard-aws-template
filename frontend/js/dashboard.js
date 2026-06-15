if (!localStorage.getItem('token')) window.location.href = 'index.html';
const IS_ADMIN = localStorage.getItem('role') === 'admin';

function toggle(id) {
  const el = document.getElementById(id + 'Table');
  const arrow = document.getElementById(id + 'Arrow');
  if (el.style.display === 'none') {
    el.style.display = '';
    arrow.textContent = '▼';
  } else {
    el.style.display = 'none';
    arrow.textContent = '▶';
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  window.location.href = 'index.html';
}

function stateBadge(state) {
  const styles = {
    running: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    stopped: 'bg-red-500/20 text-red-400 border-red-500/30',
    available: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    stopping: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    starting: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };
  const s = styles[state] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  const dot = state === 'running' || state === 'available' || state === 'active' ? 'pulse-dot' : '';
  return `<span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${s}"><span class="w-1.5 h-1.5 rounded-full bg-current ${dot}"></span>${state}</span>`;
}

function actionBtn(label, variant, onclick) {
  if (!IS_ADMIN) return '';
  const styles = {
    start: 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border-emerald-600/30',
    stop: 'bg-red-600/20 hover:bg-red-600/40 text-red-400 border-red-600/30',
    invoke: 'bg-brand-600/20 hover:bg-brand-600/40 text-brand-100 border-brand-600/30',
  };
  return `<button onclick="${onclick}" class="text-xs px-3 py-1.5 rounded-lg border transition-all ${styles[variant]}">${label}</button>`;
}

function statsCard(icon, label, running, total, color) {
  return `<div class="bg-gray-900/60 backdrop-blur border border-gray-700/30 rounded-xl p-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-${color}-500/20 rounded-xl flex items-center justify-center">${icon}</div>
      <div>
        <p class="text-xs text-gray-400">${label}</p>
        <p class="text-xl font-bold">${running}<span class="text-sm text-gray-500">/${total}</span></p>
      </div>
    </div>
  </div>`;
}

async function loadStatus() {
  document.getElementById('lastUpdate').textContent = '⏳ Updating...';
  const data = await getStatus();

  // Stats
  const ec2Running = data.ec2.filter(i => i.state === 'running').length;
  const ecsRunning = data.ecs.filter(s => s.running > 0).length;
  const rdsAvail = data.rds.filter(r => r.status === 'available').length;
  document.getElementById('statsBar').innerHTML =
    statsCard('🖥️', 'EC2 Running', ec2Running, data.ec2.length, 'orange') +
    statsCard('🐳', 'ECS Active', ecsRunning, data.ecs.length, 'blue') +
    statsCard('🗄️', 'RDS Available', rdsAvail, data.rds.length, 'green') +
    statsCard('λ', 'Lambda', '—', '—', 'yellow');

  // EC2
  document.getElementById('ec2Count').textContent = `${ec2Running}/${data.ec2.length} running`;
  document.getElementById('ec2Table').innerHTML = `<table class="w-full text-sm">
    <thead><tr class="text-gray-500 text-xs uppercase tracking-wider"><th class="px-6 py-3 text-left">Name</th><th class="px-6 py-3 text-left">Instance ID</th><th class="px-6 py-3 text-left">Type</th><th class="px-6 py-3 text-left">State</th><th class="px-6 py-3 text-left">Actions</th></tr></thead>
    <tbody>${data.ec2.map(i => `<tr class="table-row border-t border-gray-800/50">
      <td class="px-6 py-3 font-medium">${i.name}</td>
      <td class="px-6 py-3 text-gray-400 font-mono text-xs">${i.id}</td>
      <td class="px-6 py-3 text-gray-400 text-xs">${i.type || '—'}</td>
      <td class="px-6 py-3">${stateBadge(i.state)}</td>
      <td class="px-6 py-3 flex gap-2">${actionBtn('▶ Start', 'start', `doEC2('${i.id}','start')`)} ${actionBtn('⏹ Stop', 'stop', `doEC2('${i.id}','stop')`)}</td>
    </tr>`).join('')}</tbody></table>`;

  // ECS — group by cluster
  document.getElementById('ecsCount').textContent = `${ecsRunning}/${data.ecs.length} active`;
  const ecsClusters = {};
  data.ecs.forEach(s => { (ecsClusters[s.cluster] = ecsClusters[s.cluster] || []).push(s); });
  document.getElementById('ecsTable').innerHTML = Object.entries(ecsClusters).map(([cluster, services]) => `
    <div class="border-t border-gray-800/50 first:border-t-0">
      <div class="px-6 py-2 bg-gray-800/30 flex items-center gap-2">
        <span class="text-xs font-semibold text-brand-100/80 uppercase tracking-wider">${cluster}</span>
        <span class="text-xs text-gray-500">(${services.filter(s=>s.running>0).length}/${services.length} active)</span>
      </div>
      <table class="w-full text-sm">
        <tbody>${services.map(s => `<tr class="table-row border-t border-gray-800/30">
          <td class="px-6 py-3 font-medium">${s.name}</td>
          <td class="px-6 py-3">${stateBadge(s.running > 0 ? 'running' : 'stopped')} <span class="text-gray-500 text-xs ml-1">${s.running}/${s.desired}</span></td>
          <td class="px-6 py-3 flex gap-2">${actionBtn('▶ Start', 'start', `doECS('${s.cluster}','${s.name}','start')`)} ${actionBtn('⏹ Stop', 'stop', `doECS('${s.cluster}','${s.name}','stop')`)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`).join('');

  // RDS
  document.getElementById('rdsCount').textContent = `${rdsAvail}/${data.rds.length} available`;
  document.getElementById('rdsTable').innerHTML = `<table class="w-full text-sm">
    <thead><tr class="text-gray-500 text-xs uppercase tracking-wider"><th class="px-6 py-3 text-left">Cluster</th><th class="px-6 py-3 text-left">Status</th><th class="px-6 py-3 text-left">Actions</th></tr></thead>
    <tbody>${data.rds.map(r => `<tr class="table-row border-t border-gray-800/50">
      <td class="px-6 py-3 font-medium">${r.id}</td>
      <td class="px-6 py-3">${stateBadge(r.status)}</td>
      <td class="px-6 py-3 flex gap-2">${actionBtn('▶ Start', 'start', `doRDS('${r.id}','start')`)} ${actionBtn('⏹ Stop', 'stop', `doRDS('${r.id}','stop')`)}</td>
    </tr>`).join('')}</tbody></table>`;

  document.getElementById('lastUpdate').textContent = `✓ ${new Date().toLocaleTimeString('th-TH')}`;

  // Lambda
  const lambdas = await listLambda();
  document.getElementById('lambdaCount').textContent = `${lambdas.length} functions`;
  document.getElementById('statsBar').innerHTML = document.getElementById('statsBar').innerHTML.replace('—</span><span class="text-sm text-gray-500">/—', `${lambdas.length}</span><span class="text-sm text-gray-500">/${lambdas.length}`);
  document.getElementById('lambdaTable').innerHTML = `<table class="w-full text-sm">
    <thead><tr class="text-gray-500 text-xs uppercase tracking-wider"><th class="px-6 py-3 text-left">Function</th><th class="px-6 py-3 text-left">Runtime</th><th class="px-6 py-3 text-left">State</th><th class="px-6 py-3 text-left">Actions</th></tr></thead>
    <tbody>${lambdas.map(f => `<tr class="table-row border-t border-gray-800/50">
      <td class="px-6 py-3 font-medium font-mono text-xs">${f.name}</td>
      <td class="px-6 py-3 text-gray-400">${f.runtime || '—'}</td>
      <td class="px-6 py-3">${stateBadge(f.state?.toLowerCase() || 'active')}</td>
      <td class="px-6 py-3">${actionBtn('▶ Invoke', 'invoke', `doLambda('${f.name}')`)}</td>
    </tr>`).join('')}</tbody></table>`;
}

async function doEC2(id, action) {
  if (!confirm(`${action.toUpperCase()} EC2: ${id}?`)) return;
  await ec2Action(id, action);
  setTimeout(loadStatus, 2000);
}

async function doECS(cluster, service, action) {
  if (!confirm(`${action.toUpperCase()} ECS: ${service}?`)) return;
  await ecsAction(cluster, service, action);
  setTimeout(loadStatus, 2000);
}

async function doRDS(id, action) {
  if (!confirm(`${action.toUpperCase()} RDS: ${id}?`)) return;
  await apiCall('/rds/action', 'POST', { id, action });
  setTimeout(loadStatus, 3000);
}

async function doLambda(name) {
  const payloadStr = prompt(`Invoke ${name}\nPayload JSON:`, '{}');
  if (payloadStr === null) return;
  try {
    const payload = JSON.parse(payloadStr || '{}');
    const res = await invokeLambda(name, payload);
    alert(`Status: ${res.status}\n\n${JSON.stringify(res.result, null, 2)}`);
  } catch { alert('Invalid JSON'); }
}

loadStatus();
setInterval(loadStatus, 30000);

async function loadCodeBuild() {
  const projects = await apiCall('/codebuild/projects');
  document.getElementById('codebuildCount').textContent = `${projects.length} projects`;
  if (!projects.length) {
    document.getElementById('codebuildTable').innerHTML = '<p class="text-gray-500">No projects found</p>';
    return;
  }
  document.getElementById('codebuildTable').innerHTML = `
    <table class="w-full text-sm">
      <thead><tr class="text-gray-500 text-xs uppercase tracking-wider">
        <th class="px-6 py-3 text-left">Project</th>
        <th class="px-6 py-3 text-left">Source</th>
        <th class="px-6 py-3 text-left">Actions</th>
      </tr></thead>
      <tbody>${projects.map(p => `<tr class="table-row border-t border-gray-800/50">
        <td class="px-6 py-3 font-medium font-mono text-xs">
          <button onclick="loadBuildHistory('${p.name}', this)" class="text-brand-100 hover:underline">${p.name}</button>
        </td>
        <td class="px-6 py-3 text-gray-400 text-xs">${p.source}</td>
        <td class="px-6 py-3 flex gap-2">
          <button onclick="loadBuildHistory('${p.name}', this)" class="text-xs px-3 py-1.5 rounded-lg border bg-gray-700/30 hover:bg-gray-700/60 border-gray-600/30 transition-all">📋 History</button>
          ${IS_ADMIN ? `<button onclick="startBuild('${p.name}')" class="text-xs px-3 py-1.5 rounded-lg border bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border-purple-600/30 transition-all">▶ Start Build</button>` : ''}
        </td>
      </tr>
      <tr id="history-${p.name}" class="hidden"><td colspan="3" class="px-6 pb-4"><div id="history-content-${p.name}" class="text-gray-400 text-xs mt-2"></div></td></tr>
      `).join('')}</tbody>
    </table>`;
}

async function loadBuildHistory(project) {
  const row = document.getElementById(`history-${project}`);
  const content = document.getElementById(`history-content-${project}`);
  if (!row.classList.contains('hidden')) { row.classList.add('hidden'); return; }
  content.textContent = 'Loading...';
  row.classList.remove('hidden');
  const builds = await apiCall(`/codebuild/history?project=${encodeURIComponent(project)}`);
  if (!builds.length) { content.innerHTML = '<span class="text-gray-500">No builds found</span>'; return; }
  const statusColor = { SUCCEEDED: 'text-emerald-400', FAILED: 'text-red-400', IN_PROGRESS: 'text-amber-400', STOPPED: 'text-gray-400' };
  content.innerHTML = `<table class="w-full"><thead><tr class="text-gray-500 uppercase"><th class="py-1 text-left">Build ID</th><th class="py-1 text-left">Status</th><th class="py-1 text-left">Started</th><th class="py-1 text-left">Initiator</th></tr></thead>
    <tbody>${builds.map(b => `<tr class="border-t border-gray-800/30">
      <td class="py-1.5 font-mono">${b.id}</td>
      <td class="py-1.5 ${statusColor[b.status] || 'text-gray-400'}">${b.status}</td>
      <td class="py-1.5 text-gray-400">${b.startTime ? new Date(b.startTime).toLocaleString('th-TH') : '—'}</td>
      <td class="py-1.5 text-gray-400">${b.initiator || '—'}</td>
    </tr>`).join('')}</tbody></table>`;
}

async function startBuild(project) {
  if (!confirm(`Start build: ${project}?`)) return;
  const res = await apiCall('/codebuild/start', 'POST', { project });
  alert(`Build started!\nID: ${res.buildId}`);
  setTimeout(() => loadBuildHistory(project), 3000);
}

loadCodeBuild();

if (IS_ADMIN) {
  document.getElementById('registerLink').innerHTML =
    '<a href="register.html" class="bg-gray-800 hover:bg-gray-700 border border-gray-700/50 px-4 py-2 rounded-lg text-sm transition-all">+ User</a>' +
    '<a href="users.html" class="bg-gray-800 hover:bg-gray-700 border border-gray-700/50 px-4 py-2 rounded-lg text-sm transition-all">👥 Users</a>';
}
