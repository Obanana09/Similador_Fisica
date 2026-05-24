// ==================== STATE ====================
let currentMotion = 'MRU';
let animId = null;
let simTime = 0;
let simRunning = false;
let simData = { t:[], x:[], v:[], a:[] };
let simStopped = false;
let stopTime = null;
let stopPos = null;
const DT = 0.033; // ~30fps step
const g = 9.8;

// Charts
let chartPos, chartVel, chartAcc;

// Canvas
const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// ==================== INIT ====================
function init() {
  initCharts();
  setMotion('MRU');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const w = canvas.parentElement.clientWidth;
  canvas.width = w;
  drawIdleCanvas();
}

// ==================== MOTION SWITCH ====================
function setMotion(type) {
  currentMotion = type;
  resetSim();
  if (camState.active) {
    clearMeasurePoints();
    updateCamHints();
  }

  document.querySelectorAll('.motion-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-'+type).classList.add('active');

  ['MRU','MRUV','CAIDA','PARABOLICO'].forEach(m => {
    document.getElementById('ctrl-'+m).style.display = m === type ? 'block' : 'none';
  });

  const titles = { MRU:'Movimiento Rectilíneo Uniforme', MRUV:'Movimiento Rectilíneo Uniformemente Variado', CAIDA:'Caída Libre', PARABOLICO:'Tiro Parabólico' };
  const badgeColors = { MRU:'rgba(96,165,250,0.15);border:1px solid rgba(96,165,250,0.3);color:#60a5fa', MRUV:'rgba(34,211,160,0.15);border:1px solid rgba(34,211,160,0.3);color:#22d3a0', CAIDA:'rgba(248,113,113,0.15);border:1px solid rgba(248,113,113,0.3);color:#f87171', PARABOLICO:'rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:#f59e0b' };
  document.getElementById('canvas-title').textContent = titles[type];
  document.getElementById('motion-badge').style.cssText = 'background:'+badgeColors[type];
  document.getElementById('motion-badge').textContent = type === 'PARABOLICO' ? 'PARABÓLICO' : type;

  updateEquations(type);
  drawIdleCanvas();
}

function updateParams() {
  const ids = {
    'v0-mru':'v0-mru-val','x0-mru':'x0-mru-val',
    'v0-mruv':'v0-mruv-val','a-mruv':'a-mruv-val','x0-mruv':'x0-mruv-val',
    'h0-caida':'h0-caida-val','v0-caida':'v0-caida-val',
    'v0-par':'v0-par-val','ang-par':'ang-par-val','y0-par':'y0-par-val'
  };
  const units = {
    'v0-mru':'m/s','x0-mru':'m',
    'v0-mruv':'m/s','a-mruv':'m/s²','x0-mruv':'m',
    'h0-caida':'m','v0-caida':'m/s',
    'v0-par':'m/s','ang-par':'°','y0-par':'m'
  };
  for (const [id, valId] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) document.getElementById(valId).textContent = el.value + ' ' + units[id];
  }
  if (simRunning) { resetSim(); }
  drawIdleCanvas();
}

// ==================== PARAMS GETTER ====================
function getParams() {
  const p = {};
  switch(currentMotion) {
    case 'MRU':
      p.v = parseFloat(document.getElementById('v0-mru').value);
      p.x0 = parseFloat(document.getElementById('x0-mru').value);
      p.a = 0;
      p.dur = parseFloat(document.getElementById('dur-mru').value);
      break;
    case 'MRUV':
      p.v0 = parseFloat(document.getElementById('v0-mruv').value);
      p.a = parseFloat(document.getElementById('a-mruv').value);
      p.x0 = parseFloat(document.getElementById('x0-mruv').value);
      p.dur = parseFloat(document.getElementById('dur-mruv').value);
      break;
    case 'CAIDA':
      p.y0 = parseFloat(document.getElementById('h0-caida').value);
      p.v0 = parseFloat(document.getElementById('v0-caida').value);
      p.a = g;
      p.dur = parseFloat(document.getElementById('dur-caida').value);
      break;
    case 'PARABOLICO':
      p.v0 = parseFloat(document.getElementById('v0-par').value);
      p.ang = parseFloat(document.getElementById('ang-par').value) * Math.PI / 180;
      p.y0 = parseFloat(document.getElementById('y0-par').value);
      p.dur = parseFloat(document.getElementById('dur-par').value);
      p.vx = p.v0 * Math.cos(p.ang);
      p.vy0 = p.v0 * Math.sin(p.ang);
      break;
  }
  return p;
}

// ==================== SIMULATION ====================
function startSim() {
  if (simRunning) return;
  simRunning = true;
  simTime = 0;
  simStopped = false;
  stopTime = null;
  stopPos = null;
  simData = { t:[], x:[], v:[], a:[], y:[], vx:[], vy:[] };
  document.getElementById('status-dot').style.background = 'var(--green)';
  document.getElementById('status-text').textContent = 'Simulando...';
  clearCharts();
  loop();
}

function resetSim() {
  if (animId) cancelAnimationFrame(animId);
  simRunning = false;
  simTime = 0;
  simStopped = false;
  stopTime = null;
  stopPos = null;
  simData = { t:[], x:[], v:[], a:[], y:[], vx:[], vy:[] };
  document.getElementById('status-dot').style.background = 'var(--text3)';
  document.getElementById('status-text').textContent = 'Listo para simular';
  document.getElementById('time-display').textContent = 't = 0.00 s';
  updateMetrics(0,0,0,0);
  clearCharts();
  document.getElementById('valid-tbody').innerHTML = '';
  drawIdleCanvas();
}

function loop() {
  if (!simRunning) return;
  simTime += DT;

  const p = getParams();
  let x, v, a, y = 0, vx = 0, vy = 0;

  switch(currentMotion) {
    case 'MRU':
      x = p.x0 + p.v * simTime;
      v = p.v;
      a = 0;
      if (simTime >= p.dur) { endSim(); return; }
      break;
    case 'MRUV':
      a = p.a;
      x = p.x0 + p.v0 * simTime + 0.5 * p.a * simTime * simTime;
      v = p.v0 + p.a * simTime;
      if (p.a < 0 && p.v0 > 0 && v <= 0 && !simStopped) {
        simStopped = true;
        stopTime = -p.v0 / p.a;
        stopPos = p.x0 + p.v0 * stopTime + 0.5 * p.a * stopTime * stopTime;
        document.getElementById('status-text').textContent =
          'v = 0 en t = ' + stopTime.toFixed(2) + ' s — objeto retrocediendo';
      }
      if (simTime >= p.dur) { endSim(); return; }
      break;
    case 'CAIDA':
      y = p.y0 - (p.v0 * simTime + 0.5 * g * simTime * simTime);
      v = p.v0 + g * simTime;
      a = g;
      x = simTime * 40; 
      if (simTime >= p.dur || y <= 0) { y = Math.max(y, 0); endSim(); return; }
      break;
    case 'PARABOLICO':
      vx = p.vx;
      vy = p.vy0 - g * simTime;
      x = p.vx * simTime;
      y = p.y0 + p.vy0 * simTime - 0.5 * g * simTime * simTime;
      v = Math.sqrt(vx*vx + vy*vy);
      a = g;
      if (simTime >= p.dur || (y < 0 && simTime > 0.2)) { y = Math.max(y, 0); endSim(); return; }
      break;
  }

  if (simData.t.length < 300) {
    simData.t.push(+simTime.toFixed(2));
    simData.x.push(+(currentMotion==='CAIDA' ? (p.y0 - (p.v0*simTime + 0.5*g*simTime*simTime)) : x).toFixed(2));
    simData.v.push(+v.toFixed(2));
    simData.a.push(+a.toFixed(2));
    if (currentMotion === 'PARABOLICO') {
      simData.y.push(+y.toFixed(2));
      simData.vx.push(+vx.toFixed(2));
      simData.vy.push(+vy.toFixed(2));
    }
    updateCharts();
  }

  document.getElementById('time-display').textContent = 't = ' + simTime.toFixed(2) + ' / ' + p.dur.toFixed(0) + ' s';
  updateMetrics(currentMotion === 'CAIDA' ? (p.y0 - (p.v0*simTime + 0.5*g*simTime*simTime)) : x, v, a, simTime);
  drawAnimation(x, y, v, a, vx, vy);
  buildValidation();

  animId = requestAnimationFrame(loop);
}

function endSim() {
  simRunning = false;
  document.getElementById('status-dot').style.background = 'var(--amber)';
  if (simStopped && stopTime !== null) {
    document.getElementById('status-text').textContent =
      'Completada — objeto detenido en t = ' + stopTime.toFixed(2) + ' s';
  } else {
    document.getElementById('status-text').textContent = 'Simulación completada';
  }
  buildValidation();
}

// ==================== DRAW ANIMATION ====================
function drawIdleCanvas() {
  const p = getParams();
  drawAnimation(currentMotion==='CAIDA'?0:p.x0||0, currentMotion==='CAIDA'?p.y0||80:0, 0, 0, 0, 0, true);
}

function drawAnimation(x, y, v, a, vx, vy, idle=false) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke(); }
  for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(W,i); ctx.stroke(); }

  switch(currentMotion) {
    case 'MRU': drawMRU(x, v, idle); break;
    case 'MRUV': drawMRUV(x, v, a, idle); break;
    case 'CAIDA': drawCaida(y, v, idle); break;
    case 'PARABOLICO': drawParabolico(x, y, v, vx, vy, idle); break;
  }
}

function drawMRU(x, v, idle) {
  const W = canvas.width, H = canvas.height;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, H-40); ctx.lineTo(W, H-40); ctx.stroke();

  for (let i = 0; i < W; i += 60) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(i, H-42, 30, 4);
  }

  const maxX = 500, px = (x / maxX) * (W - 80) + 40;
  if (!idle && simData.t.length > 1) {
    ctx.strokeStyle = 'rgba(96,165,250,0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    simData.x.forEach((xi, i) => {
      const px2 = (xi / maxX) * (W - 80) + 40;
      i === 0 ? ctx.moveTo(px2, H-40) : ctx.lineTo(px2, H-40);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const ox = Math.min(px, W - 50), oy = H - 40;
  drawCar(ox, oy, v);

  if (!idle && v > 0) {
    const arrowLen = Math.min(v * 3, 100);
    ctx.strokeStyle = '#60a5fa';
    ctx.fillStyle = '#60a5fa';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ox + 20, oy - 25); ctx.lineTo(ox + 20 + arrowLen, oy - 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox + 20 + arrowLen, oy - 25); ctx.lineTo(ox + 10 + arrowLen, oy - 30); ctx.lineTo(ox + 10 + arrowLen, oy - 20); ctx.fill();
    ctx.font = '12px JetBrains Mono';
    ctx.fillText('v = ' + v.toFixed(1) + ' m/s', ox + 20, oy - 35);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '12px JetBrains Mono';
  ctx.fillText('x = ' + (idle?0:x).toFixed(1) + ' m', 12, 20);
}

function drawCar(cx, cy, v) {
  const spd = Math.abs(v);
  ctx.save();
  ctx.translate(cx, cy);
  if (v < -0.1) ctx.scale(-1, 1);

  const grad = ctx.createLinearGradient(0, -38, 0, -4);
  grad.addColorStop(0, '#6c63ff');
  grad.addColorStop(1, '#4a42cc');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(-24, -38, 48, 22, 4); ctx.fill();

  ctx.fillStyle = '#8b85ff';
  ctx.beginPath(); ctx.roundRect(-14, -52, 28, 16, [4,4,0,0]); ctx.fill();

  ctx.fillStyle = 'rgba(150,220,255,0.5)';
  ctx.fillRect(-10, -50, 20, 12);

  [-16, 14].forEach(wx => {
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(wx, -4, 8, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#555';
    ctx.beginPath(); ctx.arc(wx, -4, 5, 0, Math.PI*2); ctx.fill();
    if (spd > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const angle = simTime * spd * 3;
      ctx.moveTo(wx + Math.cos(angle)*4, -4 + Math.sin(angle)*4);
      ctx.lineTo(wx + Math.cos(angle+Math.PI)*4, -4 + Math.sin(angle+Math.PI)*4);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawMRUV(x, v, a, idle) {
  const W = canvas.width, H = canvas.height;
  const p = getParams();

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, H-40); ctx.lineTo(W, H-40); ctx.stroke();

  // Escala dinámica: calcula el rango de x visto hasta ahora
  let xLo, xHi;
  if (idle || simData.x.length === 0) {
    xLo = (p.x0 || 0) - 20;
    xHi = (p.x0 || 0) + 80;
  } else {
    let xMin = p.x0 || 0, xMax = p.x0 || 0;
    for (let i = 0; i < simData.x.length; i++) {
      if (simData.x[i] < xMin) xMin = simData.x[i];
      if (simData.x[i] > xMax) xMax = simData.x[i];
    }
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    const range = Math.max(xMax - xMin, 50);
    xLo = xMin - range * 0.15;
    xHi = xMax + range * 0.15;
  }
  const toSX = xi => 40 + ((xi - xLo) / (xHi - xLo)) * (W - 80);
  const px = idle ? toSX(p.x0 || 0) : Math.max(20, Math.min(toSX(x), W - 20));

  // Marcador de origen (x = 0)
  const ox = toSX(0);
  if (ox >= 30 && ox <= W - 30) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, H - 46); ctx.lineTo(ox, H - 34); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText('0', ox, H - 22);
    ctx.textAlign = 'left';
  }

  // Rastro de posición
  if (!idle && simData.x.length > 1) {
    simData.x.forEach((xi, i) => {
      if (i === 0) return;
      const px1 = toSX(simData.x[i-1]);
      const px2 = toSX(xi);
      const frac = i / simData.x.length;
      ctx.strokeStyle = `rgba(34,211,160,${0.1 + frac * 0.5})`;
      ctx.lineWidth = 1.5 + frac * 2;
      ctx.beginPath(); ctx.moveTo(px1, H-40); ctx.lineTo(px2, H-40); ctx.stroke();
    });
  }

  // Flecha de aceleración
  if (!idle && Math.abs(a) > 0.1) {
    const aLen = Math.min(Math.abs(a) * 5, 80);
    const aDir = a > 0 ? 1 : -1;
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(px + 20, H - 65); ctx.lineTo(px + 20 + aDir * aLen, H - 65); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 20 + aDir * aLen, H - 65); ctx.lineTo(px + 20 + aDir * (aLen - 10), H - 70); ctx.lineTo(px + 20 + aDir * (aLen - 10), H - 60); ctx.fill();
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('a = ' + a.toFixed(1) + ' m/s²', px + 20, H - 75);
  }

  // Flecha de velocidad (apunta a la izquierda cuando v < 0)
  if (!idle && Math.abs(v) > 0.1) {
    const vLen = Math.min(Math.abs(v) * 2.5, 90);
    const vDir = v >= 0 ? 1 : -1;
    ctx.strokeStyle = '#22d3a0';
    ctx.fillStyle = '#22d3a0';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(px + 20, H - 90); ctx.lineTo(px + 20 + vDir * vLen, H - 90); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 20 + vDir * vLen, H - 90); ctx.lineTo(px + 20 + vDir * (vLen-10), H - 95); ctx.lineTo(px + 20 + vDir * (vLen-10), H - 85); ctx.fill();
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('v = ' + v.toFixed(1) + ' m/s', px + 20, H - 100);
  }

  drawCar(px, H-40, v);

  // Marcador del punto de inversión (donde v = 0)
  if (simStopped && stopPos !== null && !idle) {
    const spx = toSX(stopPos);
    if (spx >= 20 && spx <= W - 20) {
      ctx.strokeStyle = 'rgba(245,158,11,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(spx, H - 58); ctx.lineTo(spx, H - 30); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f59e0b';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText('v=0', spx, H - 62);
      ctx.fillText('t=' + stopTime.toFixed(1) + 's', spx, H - 50);
      ctx.textAlign = 'left';
    }
  }

  // Barra de progreso temporal
  if (!idle) {
    const progress = Math.min(simTime / p.dur, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, H - 5, W, 5);
    ctx.fillStyle = simStopped ? '#f59e0b' : '#22d3a0';
    ctx.fillRect(0, H - 5, W * progress, 5);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '12px JetBrains Mono';
  ctx.fillText('x = ' + (idle ? (p.x0 || 0) : x).toFixed(1) + ' m', 12, 20);
}

function drawCaida(y, v, idle) {
  const W = canvas.width, H = canvas.height;
  const p = getParams();
  const maxY = p.y0;
  const groundY = H - 30;
  const ballY = idle ? (groundY - (p.y0 / maxY) * (groundY - 40)) : (groundY - (Math.max(y, 0) / maxY) * (groundY - 40));
  const cx = W / 2;

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(cx + 60, groundY - (p.y0 / maxY) * (groundY - 40), 30, (p.y0 / maxY) * (groundY - 40));
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(cx + 65, groundY - (p.y0 / maxY) * (groundY - 40) + i * 20 + 5, 8, 10);
    ctx.fillRect(cx + 77, groundY - (p.y0 / maxY) * (groundY - 40) + i * 20 + 5, 8, 10);
  }

  for (let h = 0; h <= maxY; h += 20) {
    const ypos = groundY - (h / maxY) * (groundY - 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3,5]);
    ctx.beginPath(); ctx.moveTo(20, ypos); ctx.lineTo(W - 20, ypos); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(h + ' m', 4, ypos + 4);
  }

  ctx.fillStyle = 'rgba(34,211,160,0.15)';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = 'var(--green)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

  if (!idle && simData.x.length > 1) {
    ctx.strokeStyle = 'rgba(248,113,113,0.3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3,3]);
    ctx.beginPath();
    simData.t.forEach((ti, i) => {
      const yi_data = p.y0 - (p.v0 * ti + 0.5 * g * ti * ti);
      const py = groundY - (Math.max(yi_data, 0) / maxY) * (groundY - 40);
      i === 0 ? ctx.moveTo(cx, py) : ctx.lineTo(cx, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!idle && v > 1) {
    const vLen = Math.min(v * 2, 60);
    ctx.strokeStyle = '#f87171';
    ctx.fillStyle = '#f87171';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx + 20, ballY); ctx.lineTo(cx + 20, ballY + vLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 20, ballY + vLen); ctx.lineTo(cx + 15, ballY + vLen - 10); ctx.lineTo(cx + 25, ballY + vLen - 10); ctx.fill();
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('v = ' + v.toFixed(1) + ' m/s', cx + 28, ballY + vLen/2);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('g = 9.8 m/s²', cx - 90, ballY + 16);
  }

  const speed = Math.min(v / 30, 1);
  ctx.shadowColor = `rgba(248,113,113,${0.3 + speed * 0.5})`;
  ctx.shadowBlur = 10 + speed * 20;
  const ballR = 16 - speed * 4;
  const ballGrad = ctx.createRadialGradient(cx - 4, ballY - 4, 2, cx, ballY, ballR);
  ballGrad.addColorStop(0, '#ff9999');
  ballGrad.addColorStop(1, '#cc3333');
  ctx.fillStyle = ballGrad;
  ctx.beginPath(); ctx.arc(cx, ballY, ballR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '12px JetBrains Mono';
  ctx.fillText('y = ' + (idle?p.y0:Math.max(y,0)).toFixed(1) + ' m', 12, 20);
}

function drawParabolico(x, y, v, vx, vy, idle) {
  const W = canvas.width, H = canvas.height;
  const p = getParams();
  const groundY = H - 30;

  ctx.fillStyle = 'rgba(34,211,160,0.1)';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = 'rgba(34,211,160,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();

  const T_flight = (2 * p.vy0) / g + (p.y0 > 0 ? Math.sqrt(2*p.y0/g)*2 : 0);
  const maxRange = p.vx * (2 * p.vy0 / g) * 1.1 || 100;
  const maxHeight = p.y0 + (p.vy0 * p.vy0) / (2 * g);
  const scaleX = (W - 80) / Math.max(maxRange, 10);
  const scaleY = (groundY - 40) / Math.max(maxHeight * 1.2, 10);

  const toScreenX = rx => 40 + rx * scaleX;
  const toScreenY = ry => groundY - ry * scaleY;

  ctx.strokeStyle = 'rgba(245,158,11,0.25)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  for (let t = 0; t <= T_flight + 0.5; t += 0.05) {
    const rx = p.vx * t;
    const ry = p.y0 + p.vy0 * t - 0.5 * g * t * t;
    if (ry < 0) break;
    const sx = toScreenX(rx), sy = toScreenY(ry);
    t === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (idle || simTime < 0.5) {
    const ang = p.ang;
    const angleLen = 60;
    const startX = toScreenX(0), startY = toScreenY(p.y0);
    ctx.strokeStyle = 'rgba(245,158,11,0.7)';
    ctx.fillStyle = 'rgba(245,158,11,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX + Math.cos(ang) * angleLen, startY - Math.sin(ang) * angleLen); ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX + 70, startY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(245,158,11,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(startX, startY, 28, -ang, 0); ctx.stroke();

    ctx.font = 'bold 13px Space Grotesk';
    ctx.fillText('θ = ' + Math.round(p.ang * 180 / Math.PI) + '°', startX + 32, startY - 8);
  }

  if (!idle && simData.t.length > 1) {
    ctx.lineWidth = 2;
    for (let i = 1; i < simData.t.length; i++) {
      const t0 = simData.t[i-1], t1 = simData.t[i];
      const x0 = p.vx * t0, y0 = p.y0 + p.vy0 * t0 - 0.5 * g * t0 * t0;
      const x1 = p.vx * t1, y1 = p.y0 + p.vy0 * t1 - 0.5 * g * t1 * t1;
      const frac = i / simData.t.length;
      ctx.strokeStyle = `rgba(167,139,250,${0.2 + frac * 0.7})`;
      ctx.beginPath();
      ctx.moveTo(toScreenX(x0), toScreenY(Math.max(y0,0)));
      ctx.lineTo(toScreenX(x1), toScreenY(Math.max(y1,0)));
      ctx.stroke();
    }
  }

  const bx = idle ? toScreenX(0) : toScreenX(x);
  const by = idle ? toScreenY(p.y0) : toScreenY(Math.max(y, 0));

  if (!idle) {
    const vxLen = Math.min(Math.abs(vx) * 1.5, 70);
    ctx.strokeStyle = '#60a5fa';
    ctx.fillStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + vxLen, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + vxLen, by); ctx.lineTo(bx + vxLen - 8, by - 5); ctx.lineTo(bx + vxLen - 8, by + 5); ctx.fill();
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('vx=' + vx.toFixed(0), bx + vxLen/2 - 10, by - 6);

    const vyLen = Math.min(Math.abs(vy) * 1.5, 70);
    const vyDir = vy >= 0 ? -1 : 1;
    ctx.strokeStyle = '#22d3a0';
    ctx.fillStyle = '#22d3a0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + vyDir * vyLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, by + vyDir * vyLen); ctx.lineTo(bx - 5, by + vyDir * (vyLen - 8)); ctx.lineTo(bx + 5, by + vyDir * (vyLen - 8)); ctx.fill();
    ctx.fillText('vy=' + vy.toFixed(0), bx + 6, by + vyDir * vyLen/2);
  }

  ctx.shadowColor = 'rgba(167,139,250,0.5)';
  ctx.shadowBlur = 15;
  const pGrad = ctx.createRadialGradient(bx - 4, by - 4, 2, bx, by, 14);
  pGrad.addColorStop(0, '#c4b5fd'); pGrad.addColorStop(1, '#7c3aed');
  ctx.fillStyle = pGrad;
  ctx.beginPath(); ctx.arc(bx, by, 14, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  if (!idle) {
    const hmax = p.y0 + (p.vy0 * p.vy0) / (2 * g);
    const xmax = p.vx * p.vy0 / g;
    ctx.strokeStyle = 'rgba(245,158,11,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(toScreenX(xmax), toScreenY(hmax)); ctx.lineTo(toScreenX(xmax), groundY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('H=' + hmax.toFixed(1)+'m', toScreenX(xmax) + 4, toScreenY(hmax) - 4);
  }

  if (!idle && y <= 0 && simTime > 0.5) {
    ctx.strokeStyle = 'rgba(34,211,160,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(40, groundY + 12); ctx.lineTo(bx, groundY + 12); ctx.stroke();
    ctx.fillStyle = '#22d3a0';
    ctx.font = '11px JetBrains Mono';
    ctx.fillText('R = ' + x.toFixed(1) + ' m', 40 + (bx-40)/2 - 30, groundY + 26);
  }
}

// ==================== METRICS ====================
function updateMetrics(x, v, a, t) {
  document.getElementById('metric-pos').innerHTML = x.toFixed(2) + '<span class="metric-unit">m</span>';
  document.getElementById('metric-vel').innerHTML = v.toFixed(2) + '<span class="metric-unit">m/s</span>';
  document.getElementById('metric-acc').innerHTML = a.toFixed(2) + '<span class="metric-unit">m/s²</span>';
  document.getElementById('metric-time').innerHTML = t.toFixed(2) + '<span class="metric-unit">s</span>';
}

// ==================== CHARTS ====================
const chartOpts = (label, color) => ({
  type: 'line',
  data: { labels:[], datasets:[{ label, data:[], borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, backgroundColor: color.replace(')', ',0.08)').replace('rgb','rgba') }] },
  options: {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5a5a70', font: { size: 10 }, maxTicksLimit: 6 } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#5a5a70', font: { size: 10 }, maxTicksLimit: 5 } }
    }
  }
});

function initCharts() {
  chartPos = new Chart(document.getElementById('chartPos'), chartOpts('Posición', 'rgb(96,165,250)'));
  chartVel = new Chart(document.getElementById('chartVel'), chartOpts('Velocidad', 'rgb(34,211,160)'));
  chartAcc = new Chart(document.getElementById('chartAcc'), chartOpts('Aceleración', 'rgb(245,158,11)'));
}

function clearCharts() {
  [chartPos, chartVel, chartAcc].forEach(c => {
    c.data.labels = []; c.data.datasets[0].data = []; c.update('none');
  });
}

function updateCharts() {
  const labels = simData.t.map(t => t.toFixed(1));
  chartPos.data.labels = labels;
  chartPos.data.datasets[0].data = simData.x;
  chartVel.data.labels = labels;
  chartVel.data.datasets[0].data = simData.v;
  chartAcc.data.labels = labels;
  chartAcc.data.datasets[0].data = simData.a;
  chartPos.update('none'); chartVel.update('none'); chartAcc.update('none');
}

// ==================== EQUATIONS ====================
function updateEquations(type) {
  const eqMap = {
    MRU: [
      { f: 'x = x₀ + v·t', l: 'Posición' },
      { f: 'v = constante', l: 'Velocidad' },
      { f: 'a = 0', l: 'Aceleración' }
    ],
    MRUV: [
      { f: 'x = x₀ + v₀t + ½at²', l: 'Posición' },
      { f: 'v = v₀ + at', l: 'Velocidad' },
      { f: 'v² = v₀² + 2aΔx', l: 'Torricelli' },
      { f: 'a = constante', l: 'Aceleración' }
    ],
    CAIDA: [
      { f: 'y = y₀ - ½gt²', l: 'Posición (v₀=0)' },
      { f: 'v = gt', l: 'Velocidad' },
      { f: 'g = 9.8 m/s²', l: 'Gravedad' },
      { f: 't = √(2y₀/g)', l: 'Tiempo caída' }
    ],
    PARABOLICO: [
      { f: 'x = v₀cos(θ)·t', l: 'Posición X' },
      { f: 'y = y₀+v₀sin(θ)t-½gt²', l: 'Posición Y' },
      { f: 'vₓ = v₀cos(θ)', l: 'Velocidad X' },
      { f: 'vᵧ = v₀sin(θ)-gt', l: 'Velocidad Y' },
      { f: 'H = v₀²sin²(θ)/2g', l: 'Altura máxima' },
      { f: 'R = v₀²sin(2θ)/g', l: 'Alcance' }
    ]
  };
  const eqs = eqMap[type] || [];
  document.getElementById('eq-list').innerHTML = eqs.map(e => `<div class="eq"><span>${e.f}</span><small>${e.l}</small></div>`).join('');
  document.getElementById('eq-sidebar').innerHTML = eqs.map(e =>
    `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent2)">${e.f}<br><span style="font-size:9px;color:var(--text3);font-family:sans-serif">${e.l}</span></div>`
  ).join('');
}

// ==================== VALIDATION ====================
function buildValidation() {
  const p = getParams();
  const checkTimes = [0.5, 1.0, 1.5, 2.0, 3.0];
  let rows = '';
  checkTimes.forEach(t => {
    if (simData.t.length < 2) return;
    let xTheo, vTheo;
    switch(currentMotion) {
      case 'MRU': xTheo = p.x0 + p.v * t; vTheo = p.v; break;
      case 'MRUV': xTheo = p.x0 + p.v0 * t + 0.5 * p.a * t * t; vTheo = p.v0 + p.a * t; break;
      case 'CAIDA': xTheo = Math.max(0, p.y0 - (p.v0 * t + 0.5 * g * t * t)); vTheo = p.v0 + g * t; break;
      case 'PARABOLICO': xTheo = p.vx * t; vTheo = Math.sqrt(p.vx*p.vx + Math.pow(p.vy0 - g*t, 2)); break;
    }

    const idx = simData.t.findIndex(st => st >= t - 0.05);
    if (idx < 0) return;
    const xSim = simData.x[idx] !== undefined ? simData.x[idx] : null;
    const vSim = simData.v[idx] !== undefined ? simData.v[idx] : null;
    if (xSim === null) return;

    const errX = xTheo !== 0 ? Math.abs((xSim - xTheo) / xTheo * 100) : 0;
    const errClass = errX < 2 ? 'ok' : errX < 5 ? 'warn' : '';
    const errSymbol = errX < 2 ? '✓' : errX < 5 ? '⚠' : '✗';

    rows += `<tr>
      <td>${t.toFixed(1)} s</td>
      <td>${xTheo.toFixed(2)} m</td>
      <td>${xSim.toFixed(2)} m</td>
      <td class="${errClass}">${errX.toFixed(2)}%</td>
      <td>${vTheo.toFixed(2)} m/s</td>
      <td>${vSim.toFixed(2)} m/s</td>
      <td class="${errClass}">${errSymbol} ${errX < 2 ? 'Correcto' : errX < 5 ? 'Aceptable' : 'Error'}</td>
    </tr>`;
  });
  document.getElementById('valid-tbody').innerHTML = rows;
}

// ==================== CAMERA MODE ====================
const camState = {
  active: false,
  stream: null,
  video: document.getElementById('camVideo'),
  animFrameId: null,
  calibMode: false,
  calibPoints: [],
  pxPerMeter: null,
  measuring: false,
  measurePoints: [],
  lastAnalysis: null,
};

function toggleCamera() {
  if (camState.active) {
    stopCamera();
  } else {
    startCamera();
  }
}

async function startCamera() {
  try {
    camState.stream = await navigator.mediaDevices.getUserMedia({ video: true });
    camState.video.srcObject = camState.stream;
    await camState.video.play();
  } catch (e) {
    alert('No se pudo acceder a la cámara: ' + e.message);
    return;
  }

  camState.active = true;
  camState.calibMode = false;
  camState.calibPoints = [];
  camState.pxPerMeter = null;
  camState.measuring = false;
  camState.measurePoints = [];

  // Pause any running simulation
  if (simRunning) resetSim();

  document.getElementById('btn-cam').classList.add('cam-active');
  document.getElementById('btn-cam').textContent = '⏹ Cámara';
  document.getElementById('cam-panel').style.display = 'block';
  document.getElementById('btn-measure').disabled = true;
  resetCamUI();

  canvas.addEventListener('click', handleCamClick);
  startCamLoop();
}

function stopCamera() {
  camState.active = false;
  camState.calibMode = false;
  camState.measuring = false;

  if (camState.animFrameId) {
    cancelAnimationFrame(camState.animFrameId);
    camState.animFrameId = null;
  }
  if (camState.stream) {
    camState.stream.getTracks().forEach(t => t.stop());
    camState.stream = null;
  }

  canvas.removeEventListener('click', handleCamClick);

  document.getElementById('btn-cam').classList.remove('cam-active');
  document.getElementById('btn-cam').textContent = '📷 Cámara';
  document.getElementById('cam-panel').style.display = 'none';

  drawIdleCanvas();
}

function startCamLoop() {
  function loop() {
    if (!camState.active) return;
    drawCameraFrame();
    camState.animFrameId = requestAnimationFrame(loop);
  }
  camState.animFrameId = requestAnimationFrame(loop);
}

function drawCameraFrame() {
  const W = canvas.width, H = canvas.height;
  ctx.drawImage(camState.video, 0, 0, W, H);

  drawCalibOverlay();
  drawMeasureOverlay();

  // Status indicator
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, 130, 22);
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.arc(20, 19, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '11px JetBrains Mono';
  ctx.fillText('LIVE', 30, 23);

  if (camState.calibMode) {
    const remaining = 2 - camState.calibPoints.length;
    ctx.fillStyle = 'rgba(245,158,11,0.85)';
    ctx.fillRect(8, 34, 200, 22);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 11px Space Grotesk';
    ctx.fillText(remaining === 2 ? 'Haz clic en punto A' : 'Haz clic en punto B', 14, 50);
  }

  if (camState.measuring) {
    ctx.fillStyle = 'rgba(34,211,160,0.85)';
    ctx.fillRect(8, 34, 200, 22);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 11px Space Grotesk';
    ctx.fillText('Midiendo — haz clic en el objeto', 14, 50);
  }
}

function drawCalibOverlay() {
  const pts = camState.calibPoints;
  if (pts.length === 0) return;

  const ax = pts[0].x;
  const ay = pts[0].y;
  drawPoint(ax, ay, '#fbbf24', 'A');

  if (pts.length === 2) {
    const bx = pts[1].x;
    const by = pts[1].y;
    drawPoint(bx, by, '#60a5fa', 'B');

    // Line A-B
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);

    // Distance label at midpoint
    const mx = (ax + bx) / 2, my = (ay + by) / 2 - 10;
    const distCm = parseFloat(document.getElementById('cam-real-dist').value) || 50;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(mx - 28, my - 12, 56, 17);
    ctx.fillStyle = '#22d3a0';
    ctx.font = 'bold 11px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(distCm + ' cm', mx, my);
    ctx.textAlign = 'left';
  }
}

function drawMeasureOverlay() {
  const pts = camState.measurePoints;
  if (pts.length === 0) return;

  const colors = ['#f87171','#fb923c','#fbbf24','#a3e635','#34d399','#22d3ee','#60a5fa','#a78bfa','#f472b6'];
  const ppm = camState.pxPerMeter;

  // Draw fitted curve first (behind the click points)
  if (pts.length >= 3 && ppm && camState.lastAnalysis) {
    const r = camState.lastAnalysis;
    const τmax = (pts[pts.length-1].t - pts[0].t) / 1000;
    const steps = 60;

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    let started = false;

    for (let i = 0; i <= steps; i++) {
      const τ = τmax * i / steps;
      let cx, cy;

      if (r.type === 'MRUV') {
        const s_m = r.fit.a*τ*τ + r.fit.b*τ + r.fit.c;
        const s_px = s_m * ppm;
        cx = pts[0].x + r.ux * s_px;
        cy = pts[0].y + r.uy * s_px;
      } else if (r.type === 'CAIDA') {
        const h_m = r.fit.a*τ*τ + r.fit.b*τ + r.fit.c;
        cx = pts[0].x;
        cy = pts[0].y + h_m * ppm;
      } else if (r.type === 'PARABOLICO') {
        const x_m = r.fitX.a*τ + r.fitX.b;
        const y_m = r.fitY.a*τ*τ + r.fitY.b*τ + r.fitY.c;
        cx = pts[0].x + x_m * ppm;
        cy = pts[0].y + y_m * ppm;
      } else {
        break; // MRU: no curve needed, line from first to last suffices
      }

      started ? ctx.lineTo(cx, cy) : (ctx.moveTo(cx, cy), started = true);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw connecting lines and points
  for (let i = 0; i < pts.length; i++) {
    const px = pts[i].x, py = pts[i].y;
    const col = colors[i % colors.length];

    if (i > 0) {
      const px0 = pts[i-1].x, py0 = pts[i-1].y;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(px0, py0); ctx.lineTo(px, py); ctx.stroke();
      ctx.setLineDash([]);

      if (ppm && currentMotion === 'MRU') {
        const v = segmentSpeed(pts[i-1], pts[i]);
        const mx = (px0 + px) / 2, my = (py0 + py) / 2 - 8;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(mx - 24, my - 11, 52, 15);
        ctx.fillStyle = col;
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(v.toFixed(2) + ' m/s', mx, my);
        ctx.textAlign = 'left';
      }
    }

    drawPoint(px, py, col, String(i + 1));
  }
}

function drawPoint(x, y, color, label) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.font = 'bold 10px Space Grotesk';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function handleCamClick(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (camState.calibMode) {
    camState.calibPoints.push({ x, y });
    updateCalibUI();
    if (camState.calibPoints.length >= 2) {
      camState.calibMode = false;
      finalizeCalibration();
    }
    return;
  }

  if (camState.measuring) {
    camState.measurePoints.push({ x, y, t: Date.now() });
    updateMeasureResults();
  }
}

function startCalibration() {
  if (!camState.active) return;
  camState.calibMode = true;
  camState.calibPoints = [];
  camState.pxPerMeter = null;
  document.getElementById('btn-measure').disabled = true;
  updateCalibUI();
}

function finalizeCalibration() {
  const pts = camState.calibPoints;
  const dx = pts[1].x - pts[0].x;
  const dy = pts[1].y - pts[0].y;
  const distPx = Math.sqrt(dx * dx + dy * dy);
  const distCm = parseFloat(document.getElementById('cam-real-dist').value) || 50;
  const distM = distCm / 100;
  camState.pxPerMeter = distPx / distM;

  const scaleEl = document.getElementById('cam-scale-text');
  scaleEl.textContent = 'Escala: ' + camState.pxPerMeter.toFixed(1) + ' px/m';
  scaleEl.className = 'cam-scale-text scale-ready';

  document.getElementById('btn-measure').disabled = false;
  updateCalibUI();
}

function updateCalibUI() {
  const pts = camState.calibPoints;
  const aLbl = document.getElementById('cam-pt-a-lbl');
  const bLbl = document.getElementById('cam-pt-b-lbl');

  if (pts.length === 0) {
    aLbl.textContent = 'A: sin marcar';
    aLbl.className = 'cam-point-label point-a';
    bLbl.textContent = 'B: sin marcar';
    bLbl.className = 'cam-point-label point-b';
  } else if (pts.length === 1) {
    aLbl.textContent = 'A: ✓ marcado';
    aLbl.className = 'cam-point-label point-done';
    bLbl.textContent = 'B: en espera…';
    bLbl.className = 'cam-point-label point-b';
  } else {
    aLbl.textContent = 'A: ✓ marcado';
    aLbl.className = 'cam-point-label point-done';
    bLbl.textContent = 'B: ✓ marcado';
    bLbl.className = 'cam-point-label point-done';
  }
}

function toggleMeasure() {
  if (!camState.pxPerMeter) return;
  camState.measuring = !camState.measuring;
  const btn = document.getElementById('btn-measure');
  btn.textContent = camState.measuring ? '■ Detener' : '▶ Iniciar medición';
  btn.style.borderColor = camState.measuring ? 'rgba(248,113,113,0.5)' : '';
  btn.style.color = camState.measuring ? 'var(--coral)' : '';
}

function clearMeasurePoints() {
  camState.measurePoints = [];
  camState.lastAnalysis = null;
  camState.measuring = false;
  const btn = document.getElementById('btn-measure');
  btn.textContent = '▶ Iniciar medición';
  btn.style.borderColor = '';
  btn.style.color = '';
  const minPts = { MRU: 2, MRUV: 3, CAIDA: 3, PARABOLICO: 3 };
  document.getElementById('cam-point-count').textContent =
    `Puntos: 0 (mín. ${minPts[currentMotion] || 2})`;
  document.getElementById('cam-result-box').innerHTML =
    '<div style="font-size:11px;color:var(--text3)">Sin datos</div>';
  clearCharts();
}

function segmentSpeed(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distPx = Math.sqrt(dx * dx + dy * dy);
  const distM = distPx / camState.pxPerMeter;
  const dt = (p2.t - p1.t) / 1000;
  return dt > 0 ? distM / dt : 0;
}

function updateMeasureResults() {
  const pts = camState.measurePoints;
  const minPts = { MRU: 2, MRUV: 3, CAIDA: 3, PARABOLICO: 3 };
  const needed = minPts[currentMotion] || 2;
  document.getElementById('cam-point-count').textContent =
    `Puntos: ${pts.length} (mín. ${needed})`;
  renderCamResults(pts);
}

// ---- Math helpers ----
function solve3x3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let maxRow = col;
    for (let row = col + 1; row < 3; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) continue;
    for (let row = col + 1; row < 3; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= 3; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = M[i][3];
    for (let j = i + 1; j < 3; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i] || 1;
  }
  return x;
}

function fitLinear(ts, xs) {
  const n = ts.length, t0 = ts[0];
  const τ = ts.map(t => t - t0);
  let s1 = 0, s2 = 0, sx = 0, stx = 0;
  for (let i = 0; i < n; i++) { s1 += τ[i]; s2 += τ[i]*τ[i]; sx += xs[i]; stx += τ[i]*xs[i]; }
  const det = s2*n - s1*s1;
  if (Math.abs(det) < 1e-12) return { a: 0, b: sx / n, r2: 0 };
  const a = (stx*n - sx*s1) / det;
  const b = (s2*sx - s1*stx) / det;
  const mean = sx / n;
  let ss_res = 0, ss_tot = 0;
  for (let i = 0; i < n; i++) {
    ss_res += (xs[i] - (a*τ[i] + b)) ** 2;
    ss_tot += (xs[i] - mean) ** 2;
  }
  return { a, b, r2: ss_tot > 0 ? 1 - ss_res / ss_tot : 1 };
}

function fitQuadratic(ts, xs) {
  const n = ts.length, t0 = ts[0];
  const τ = ts.map(t => t - t0);
  let s1=0,s2=0,s3=0,s4=0, sx=0,st1x=0,st2x=0;
  for (let i = 0; i < n; i++) {
    const t=τ[i], x=xs[i];
    s1+=t; s2+=t*t; s3+=t*t*t; s4+=t*t*t*t;
    sx+=x; st1x+=t*x; st2x+=t*t*x;
  }
  const [qa, qb, qc] = solve3x3([[s4,s3,s2],[s3,s2,s1],[s2,s1,n]], [st2x,st1x,sx]);
  const mean = sx / n;
  let ss_res = 0, ss_tot = 0;
  for (let i = 0; i < n; i++) {
    ss_res += (xs[i] - (qa*τ[i]*τ[i] + qb*τ[i] + qc)) ** 2;
    ss_tot += (xs[i] - mean) ** 2;
  }
  return { a: qa, b: qb, c: qc, r2: ss_tot > 0 ? 1 - ss_res / ss_tot : 1 };
}

// ---- Analysis per motion type ----
function getTimesSeconds(pts) {
  return pts.map(p => (p.t - pts[0].t) / 1000);
}

function analyzeMRU(pts) {
  const speeds = [];
  for (let i = 1; i < pts.length; i++) speeds.push(segmentSpeed(pts[i-1], pts[i]));
  const mean = speeds.reduce((a,b)=>a+b,0) / speeds.length;
  const variance = speeds.reduce((a,b)=>a+(b-mean)**2,0) / speeds.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean * 100 : 0;
  return { speeds, mean, cv };
}

function analyzeMRUV(pts) {
  const τ = getTimesSeconds(pts);
  // Project onto dominant direction (first → last)
  const dx = pts[pts.length-1].x - pts[0].x;
  const dy = pts[pts.length-1].y - pts[0].y;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;
  const ux = dx/len, uy = dy/len;
  const s = pts.map(p => {
    const px = p.x - pts[0].x, py = p.y - pts[0].y;
    return (px*ux + py*uy) / camState.pxPerMeter; // meters along direction
  });
  const fit = fitQuadratic(τ, s);
  return {
    accel: 2 * fit.a,         // m/s²
    v0: fit.b,                // m/s
    r2: fit.r2,
    fit, τ, s,
    ux, uy                    // direction unit vector (canvas pixels)
  };
}

function analyzeCAIDA(pts) {
  const τ = getTimesSeconds(pts);
  // Use vertical component (canvas Y increases downward = falling)
  const h = pts.map(p => (p.y - pts[0].y) / camState.pxPerMeter); // meters fallen
  const fit = fitQuadratic(τ, h);
  const g_meas = 2 * fit.a;
  const g_err = Math.abs((g_meas - 9.8) / 9.8 * 100);
  return { g_meas, v0: fit.b, r2: fit.r2, g_err, fit, τ, h };
}

function analyzePARABOLICO(pts) {
  const τ = getTimesSeconds(pts);
  const px = pts.map(p => (p.x - pts[0].x) / camState.pxPerMeter); // m horizontal
  const py = pts.map(p => (p.y - pts[0].y) / camState.pxPerMeter); // m vertical (down+)
  const fitX = fitLinear(τ, px);
  const fitY = fitQuadratic(τ, py);
  const vx = fitX.a;               // m/s horizontal
  const vy0_canvas = fitY.b;       // m/s downward initial (canvas direction)
  // In physics vy0 is upward: if fitY.b < 0 object was going up initially
  const vy0_phys = -fitY.b;        // upward initial vertical speed
  const g_meas = 2 * fitY.a;       // m/s²
  const g_err = Math.abs((g_meas - 9.8) / 9.8 * 100);
  const v0 = Math.sqrt(vx*vx + vy0_phys*vy0_phys);
  const theta = Math.atan2(vy0_phys, vx) * 180 / Math.PI;
  return { vx, vy0: vy0_phys, g_meas, g_err, r2x: fitX.r2, r2y: fitY.r2, v0, theta, fitX, fitY, τ, px, py };
}

// ---- Results rendering ----
function camParamHTML(label, value, cls='') {
  return `<div class="cam-param"><div class="cam-param-label">${label}</div><div class="cam-param-val ${cls}">${value}</div></div>`;
}

function renderCamResults(pts) {
  const box = document.getElementById('cam-result-box');
  const minPts = { MRU: 2, MRUV: 3, CAIDA: 3, PARABOLICO: 3 };
  const needed = minPts[currentMotion] || 2;
  if (pts.length < needed) {
    box.innerHTML = `<div style="font-size:11px;color:var(--text3)">Se necesitan ≥${needed} puntos</div>`;
    return;
  }

  let html = '';
  let chartData = null;

  switch (currentMotion) {
    case 'MRU': {
      const r = analyzeMRU(pts);
      camState.lastAnalysis = { type: 'MRU', ...r };
      const badge = r.speeds.length < 2
        ? ['mru-none', 'Se necesitan ≥3 puntos']
        : r.cv < 15
          ? ['mru-ok', `✓ MRU confirmado — CV: ${r.cv.toFixed(1)}%`]
          : ['mru-warn', `⚠ No uniforme — CV: ${r.cv.toFixed(1)}%`];
      html = `
        <div class="cam-result-speed">${r.mean.toFixed(3)}<span>m/s</span></div>
        <div class="cam-result-mru ${badge[0]}">${badge[1]}</div>
        <div class="cam-result-segments">${r.speeds.map((v,i)=>`<span>${i+1}→${i+2}: ${v.toFixed(3)} m/s</span>`).join('')}</div>`;
      chartData = {
        vel: { labels: r.speeds.map((_,i)=>(i+1).toString()), data: r.speeds },
      };
      break;
    }
    case 'MRUV': {
      const r = analyzeMRUV(pts);
      camState.lastAnalysis = { type: 'MRUV', ...r };
      const fitOk = r.r2 > 0.9;
      const aStr = r.accel.toFixed(3);
      const v0Str = r.v0.toFixed(3);
      html = `
        <div class="cam-result-mru ${fitOk?'mru-ok':'mru-warn'}" style="margin-bottom:6px">
          ${fitOk ? '✓ MRUV confirmado' : '⚠ Ajuste bajo'} — R²: ${r.r2.toFixed(3)}
        </div>
        <div class="cam-param-grid">
          ${camParamHTML('Aceleración (a)', aStr + ' m/s²', fitOk?'good':'warn')}
          ${camParamHTML('Vel. inicial (v₀)', v0Str + ' m/s', 'cyan')}
          ${camParamHTML('R² ajuste', r.r2.toFixed(4), fitOk?'good':'warn')}
          ${camParamHTML('Puntos usados', pts.length)}
        </div>`;
      // Build chart data: position (s) vs τ, velocity (ds/dτ = 2aτ+b) vs τ
      const τDense = r.τ.map((_,i,a)=>a[0]+(a[a.length-1]-a[0])*i/(a.length-1||1));
      const sData = r.s;
      const vData = r.τ.map(t => 2*r.fit.a*t + r.fit.b);
      const aData = r.τ.map(() => r.accel);
      chartData = {
        pos: { labels: r.τ.map(t=>t.toFixed(2)), data: sData },
        vel: { labels: r.τ.map(t=>t.toFixed(2)), data: vData },
        acc: { labels: r.τ.map(t=>t.toFixed(2)), data: aData },
      };
      break;
    }
    case 'CAIDA': {
      const r = analyzeCAIDA(pts);
      camState.lastAnalysis = { type: 'CAIDA', ...r };
      const gOk = r.g_err < 25;
      html = `
        <div class="cam-result-mru ${gOk?'mru-ok':'mru-warn'}" style="margin-bottom:6px">
          ${gOk ? '✓ g confirmado' : '⚠ g fuera de rango'} — Error: ${r.g_err.toFixed(1)}%
        </div>
        <div class="cam-param-grid">
          ${camParamHTML('g medido', r.g_meas.toFixed(3) + ' m/s²', gOk?'good':'warn')}
          ${camParamHTML('g teórico', '9.800 m/s²', 'cyan')}
          ${camParamHTML('v₀ vertical', r.v0.toFixed(3) + ' m/s')}
          ${camParamHTML('R² ajuste', r.r2.toFixed(4), r.r2>0.9?'good':'warn')}
        </div>`;
      const vData = r.τ.map(t => r.fit.b + 2*r.fit.a*t);
      chartData = {
        pos: { labels: r.τ.map(t=>t.toFixed(2)), data: r.h },
        vel: { labels: r.τ.map(t=>t.toFixed(2)), data: vData },
        acc: { labels: r.τ.map(t=>t.toFixed(2)), data: r.τ.map(()=>r.g_meas) },
      };
      break;
    }
    case 'PARABOLICO': {
      const r = analyzePARABOLICO(pts);
      camState.lastAnalysis = { type: 'PARABOLICO', ...r };
      const fitOk = r.r2x > 0.85 && r.r2y > 0.85;
      const gOk = r.g_err < 30;
      html = `
        <div class="cam-result-mru ${fitOk?'mru-ok':'mru-warn'}" style="margin-bottom:6px">
          ${fitOk ? '✓ Parabólico confirmado' : '⚠ Ajuste bajo'} — R²ₓ:${r.r2x.toFixed(2)} R²ᵧ:${r.r2y.toFixed(2)}
        </div>
        <div class="cam-param-grid">
          ${camParamHTML('vₓ (horiz.)', r.vx.toFixed(3) + ' m/s', 'cyan')}
          ${camParamHTML('v₀ᵧ (vert.)', r.vy0.toFixed(3) + ' m/s', 'cyan')}
          ${camParamHTML('g medido', r.g_meas.toFixed(3) + ' m/s²', gOk?'good':'warn')}
          ${camParamHTML('v₀ total / θ', r.v0.toFixed(2)+'m/s / '+r.theta.toFixed(1)+'°')}
        </div>`;
      const vMag = r.τ.map(t => {
        const vy = r.fitY.b + 2*r.fitY.a*t;
        return Math.sqrt(r.vx*r.vx + vy*vy);
      });
      chartData = {
        pos: { labels: r.τ.map(t=>t.toFixed(2)), data: r.py.map(y=>-y) }, // flip Y to show height
        vel: { labels: r.τ.map(t=>t.toFixed(2)), data: vMag },
        acc: { labels: r.τ.map(t=>t.toFixed(2)), data: r.τ.map(()=>r.g_meas) },
      };
      break;
    }
  }

  box.innerHTML = html;

  // Update charts
  if (chartData) {
    if (chartData.pos) { chartPos.data.labels=chartData.pos.labels; chartPos.data.datasets[0].data=chartData.pos.data; chartPos.update('none'); }
    if (chartData.vel) { chartVel.data.labels=chartData.vel.labels; chartVel.data.datasets[0].data=chartData.vel.data; chartVel.update('none'); }
    if (chartData.acc) { chartAcc.data.labels=chartData.acc.labels; chartAcc.data.datasets[0].data=chartData.acc.data; chartAcc.update('none'); }
  }
}

function resetCamUI() {
  document.getElementById('cam-pt-a-lbl').textContent = 'A: sin marcar';
  document.getElementById('cam-pt-a-lbl').className = 'cam-point-label point-a';
  document.getElementById('cam-pt-b-lbl').textContent = 'B: sin marcar';
  document.getElementById('cam-pt-b-lbl').className = 'cam-point-label point-b';
  const scaleEl = document.getElementById('cam-scale-text');
  scaleEl.textContent = 'Escala: -- px/m';
  scaleEl.className = 'cam-scale-text';
  const minPts = { MRU: 2, MRUV: 3, CAIDA: 3, PARABOLICO: 3 };
  document.getElementById('cam-point-count').textContent =
    `Puntos: 0 (mín. ${minPts[currentMotion] || 2})`;
  document.getElementById('cam-result-box').innerHTML =
    '<div style="font-size:11px;color:var(--text3)">Sin datos</div>';
  camState.lastAnalysis = null;
  updateCamHints();
}

function updateCamHints() {
  const el = document.getElementById('cam-measure-hint');
  if (!el) return;
  const hints = {
    MRU: 'Mueve el objeto a velocidad constante. Haz clic en distintos instantes.',
    MRUV: 'Empuja el objeto para que acelere/desacelere. Necesitas ≥3 puntos.',
    CAIDA: 'Apunta la cámara de lado. Deja caer el objeto y haz clic en su posición. Necesitas ≥3 puntos.',
    PARABOLICO: 'Lanza el objeto con ángulo. Haz clic en su trayectoria. Necesitas ≥3 puntos.',
  };
  el.textContent = hints[currentMotion] || hints.MRU;
}

// Run launcher
init();