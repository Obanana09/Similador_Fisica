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

// Run launcher
init();