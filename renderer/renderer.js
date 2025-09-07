// Metronome with WebAudio scheduling
class Metronome {
  constructor(onBeat) {
    this.audioCtx = null;
    this.isRunning = false;
    this.bpm = 180;
    this.nextNoteTime = 0;
    this.lookahead = 25;
    this.scheduleAheadTime = 0.1;
    this.timerID = null;
    this.onBeat = onBeat;
    this.clickBuffer = null;
  }
  async initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      try {
        const res = await fetch("../assets/click.wav");
        if (res.ok) {
          const arr = await res.arrayBuffer();
          this.clickBuffer = await this.audioCtx.decodeAudioData(arr);
        }
      } catch (_) {}
    }
  }
  setBpm(bpm) {
    this.bpm = Math.max(20, Math.min(400, bpm | 0));
  }
  nextBeatTime(curr) {
    return curr + 60.0 / this.bpm;
  }
  scheduleClick(time) {
    if (!this.audioCtx) return;
    if (this.clickBuffer) {
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.clickBuffer;
      src.connect(this.audioCtx.destination);
      src.start(time);
    } else {
      const osc = this.audioCtx.createOscillator();
      const env = this.audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 1000;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.4, time + 0.001);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      osc.connect(env).connect(this.audioCtx.destination);
      osc.start(time);
      osc.stop(time + 0.06);
    }
  }
  scheduler() {
    while (
      this.nextNoteTime <
      this.audioCtx.currentTime + this.scheduleAheadTime
    ) {
      this.scheduleClick(this.nextNoteTime);
      this.onBeat?.(this.nextNoteTime);
      this.nextNoteTime = this.nextBeatTime(this.nextNoteTime);
    }
    this.timerID = setTimeout(() => this.scheduler(), this.lookahead);
  }
  async start(bpm) {
    await this.initAudio();
    this.setBpm(bpm);
    if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
    this.isRunning = true;
    this.nextNoteTime = this.audioCtx.currentTime + 0.1;
    this.scheduler();
  }
  async stop() {
    this.isRunning = false;
    if (this.timerID) clearTimeout(this.timerID);
    if (this.audioCtx) await this.audioCtx.suspend();
  }
}

class Session {
  constructor() {
    this.reset();
  }
  reset() {
    this.startedAt = null;
    this.endsAt = null;
    this.key1 = "z";
    this.key2 = "x";
    this.windowMs = 30;
    this.k1Count = 0;
    this.k2Count = 0;
    this.events = [];
    this.beats = [];
    this.alternations = 0;
    this.totalPresses = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.judgements = { 300: 0, 100: 0, 50: 0, miss: 0 };
  }
}

const els = {
  bpm: document.getElementById("bpm"),
  duration: document.getElementById("duration"),
  leftKey: document.getElementById("leftKey"),
  rightKey: document.getElementById("rightKey"),
  window: document.getElementById("window"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  k1Label: document.getElementById("k1Label"),
  k2Label: document.getElementById("k2Label"),
  k1Count: document.getElementById("k1Count"),
  k2Count: document.getElementById("k2Count"),
  acc: document.getElementById("acc"),
  alt: document.getElementById("alt"),
  timeLeft: document.getElementById("timeLeft"),
  combo: document.getElementById("combo"),
  maxCombo: document.getElementById("maxCombo"),
  j300: document.getElementById("j300"),
  j100: document.getElementById("j100"),
  j50: document.getElementById("j50"),
  jmiss: document.getElementById("jmiss"),
  summary: document.getElementById("summary"),
  exportBtn: document.getElementById("exportBtn"),
  dial: document.getElementById("dial"),
  needle: document.getElementById("needle"),
  beatLed: document.getElementById("beatLed"),
  offsetLine: document.getElementById("offsetLine"),
  offsetHist: document.getElementById("offsetHist"),
  openHistory: document.getElementById("openHistory"),
  clearHistory: document.getElementById("clearHistory"),
  historyBody: document.getElementById("historyBody"),
};

const session = new Session();
const metro = new Metronome(onBeat);
let rafId = null;

function loadPrefs() {
  const prefs = JSON.parse(localStorage.getItem("osuTapPrefs") || "{}");
  if (prefs.bpm) els.bpm.value = prefs.bpm;
  if (prefs.duration) els.duration.value = prefs.duration;
  if (prefs.key1) els.leftKey.value = prefs.key1;
  if (prefs.key2) els.rightKey.value = prefs.key2;
  if (prefs.windowMs) els.window.value = prefs.windowMs;
  if (prefs.w300) document.getElementById("w300").value = prefs.w300;
  if (prefs.w100) document.getElementById("w100").value = prefs.w100;
  if (prefs.w50) document.getElementById("w50").value = prefs.w50;
  updateKeyLabels();
}
loadPrefs();

function savePrefs() {
  localStorage.setItem(
    "osuTapPrefs",
    JSON.stringify({
      bpm: +els.bpm.value,
      duration: +els.duration.value,
      key1: els.leftKey.value || "z",
      key2: els.rightKey.value || "x",
      windowMs: +els.window.value,
      w300: +document.getElementById("w300").value,
      w100: +document.getElementById("w100").value,
      w50: +document.getElementById("w50").value,
    })
  );
}
function updateKeyLabels() {
  els.k1Label.textContent = (els.leftKey.value || "z").toUpperCase();
  els.k2Label.textContent = (els.rightKey.value || "x").toUpperCase();
}
[
  "bpm",
  "duration",
  "leftKey",
  "rightKey",
  "window",
  "w300",
  "w100",
  "w50",
].forEach((id) => {
  const n = document.getElementById(id);
  if (n)
    n.addEventListener("change", () => {
      updateKeyLabels();
      savePrefs();
    });
});

function getWindows() {
  return {
    w300: +document.getElementById("w300").value || 20,
    w100: +document.getElementById("w100").value || 50,
    w50: +document.getElementById("w50").value || 80,
  };
}

function onBeat(audioTime) {
  const tNow = performance.now();
  const ctxNow = metro.audioCtx?.currentTime ?? 0;
  const delta = (audioTime - ctxNow) * 1000;
  const beatAt = tNow + delta;
  session.beats.push(beatAt);
  els.beatLed.classList.add("on");
  setTimeout(() => els.beatLed.classList.remove("on"), 80);
  scoreUnscoredEvents();
}

function startRound() {
  session.reset();
  session.key1 = (els.leftKey.value || "z").toLowerCase();
  session.key2 = (els.rightKey.value || "x").toLowerCase();
  session.windowMs = +els.window.value || 30;
  const bpm = +els.bpm.value || 180;
  const durationSec = Math.max(5, +els.duration.value || 30);
  session.startedAt = performance.now();
  session.endsAt = session.startedAt + durationSec * 1000;
  els.summary.textContent = "";
  els.exportBtn.disabled = true;
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  window.osuTapAPI?.startPowerSaveBlocker?.();
  metro.start(bpm);
  loop();
}

function stopRound() {
  metro.stop();
  cancelAnimationFrame(rafId);
  els.startBtn.disabled = false;
  els.stopBtn.disabled = true;
  window.osuTapAPI?.stopPowerSaveBlocker?.();
  finalizeRound();
}

function loop() {
  const now = performance.now();
  if (now >= session.endsAt) {
    stopRound();
    return;
  }
  const msPerBeat = 60000 / (+els.bpm.value || 180);
  let last = session.beats.length
    ? session.beats[session.beats.length - 1]
    : now - (now % msPerBeat);
  const phase = Math.min(1, Math.max(0, (now - last) / msPerBeat));
  const angle = -90 + phase * 180;
  els.needle.style.transform = `translate(-50%,-100%) rotate(${angle}deg)`;
  els.k1Count.textContent = session.k1Count;
  els.k2Count.textContent = session.k2Count;
  els.combo.textContent = session.combo;
  els.maxCombo.textContent = session.maxCombo;
  const timeLeft = Math.max(0, Math.ceil((session.endsAt - now) / 1000));
  els.timeLeft.textContent = `${timeLeft}s`;

  const total = session.totalPresses;
  const hits =
    session.judgements[300] + session.judgements[100] + session.judgements[50];
  const acc = total ? hits / total : NaN;
  els.acc.textContent = isNaN(acc) ? "—" : `${(acc * 100).toFixed(1)}%`;
  const altRate = total <= 1 ? NaN : session.alternations / (total - 1);
  els.alt.textContent = isNaN(altRate) ? "—" : `${(altRate * 100).toFixed(1)}%`;

  els.j300.textContent = session.judgements[300];
  els.j100.textContent = session.judgements[100];
  els.j50.textContent = session.judgements[50];
  els.jmiss.textContent = session.judgements.miss;

  renderCharts();
  rafId = requestAnimationFrame(loop);
}

function findNearestBeat(t) {
  const beats = session.beats;
  if (!beats.length) return null;
  let lo = 0,
    hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  const b2 = beats[lo];
  const b1 = beats[lo - 1];
  if (b1 == null) return b2;
  if (b2 == null) return b1;
  return Math.abs(t - b1) <= Math.abs(t - b2) ? b1 : b2;
}

function judgeOffset(offset) {
  const { w300, w100, w50 } = getWindows();
  const abs = Math.abs(offset);
  if (abs <= w300) return 300;
  if (abs <= w100) return 100;
  if (abs <= w50) return 50;
  return "miss";
}

function scoreEvent(evt) {
  if (evt.scored) return;
  const beat = findNearestBeat(evt.t);
  if (!beat) return;
  const offset = evt.t - beat;
  const j = judgeOffset(offset);
  evt.scored = true;
  evt.offset = offset;
  evt.judge = j;
  if (j === 300) session.combo++;
  else session.combo = 0;
  session.maxCombo = Math.max(session.maxCombo, session.combo);
  session.judgements[j] = (session.judgements[j] || 0) + 1;
}

function scoreUnscoredEvents() {
  for (const evt of session.events) if (!evt.scored) scoreEvent(evt);
}

function finalizeRound() {
  scoreUnscoredEvents();
  const total = session.totalPresses;
  const hits =
    session.judgements[300] + session.judgements[100] + session.judgements[50];
  const acc = total ? hits / total : NaN;
  const altRate = total <= 1 ? NaN : session.alternations / (total - 1);
  const msPerBeat = 60000 / (+els.bpm.value || 180);
  const summary = {
    startedAt: new Date(
      performance.timeOrigin + session.startedAt
    ).toISOString(),
    durationSec: Math.round((session.endsAt - session.startedAt) / 1000),
    bpm: +els.bpm.value,
    keys: [session.key1, session.key2],
    counts: {
      [session.key1]: session.k1Count,
      [session.key2]: session.k2Count,
    },
    totalPresses: total,
    alternationRate: isNaN(altRate) ? null : +(altRate * 100).toFixed(1),
    accuracyPct: isNaN(acc) ? null : +(acc * 100).toFixed(1),
    msPerBeat,
    judgements: session.judgements,
    maxCombo: session.maxCombo,
    windows: getWindows(),
  };
  els.summary.textContent = JSON.stringify(summary, null, 2);
  els.exportBtn.disabled = false;
  renderCharts();
  window.osuTapAPI?.history
    ?.append(summary)
    .then(fillHistory)
    .catch((err) => console.error("[renderer] history.append failed", err));
}

// Input handling
let lastKey = null;
window.addEventListener("keydown", (ev) => {
  if (els.startBtn.disabled === false) return;
  const key = ev.key.toLowerCase();
  if (key !== session.key1 && key !== session.key2) return;
  ev.preventDefault();
  const t = performance.now();
  const evt = { t, key, scored: false };
  session.events.push(evt);
  if (key === session.key1) session.k1Count++;
  else session.k2Count++;
  session.totalPresses++;
  if (lastKey && lastKey !== key) session.alternations++;
  lastKey = key;
  scoreEvent(evt);
});

// Buttons
els.startBtn.addEventListener("click", startRound);
els.stopBtn.addEventListener("click", stopRound);
els.exportBtn.addEventListener("click", () => {
  const blob = new Blob([els.summary.textContent], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `osu-tap-summary-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
els.openHistory.addEventListener("click", () => {
  window.osuTapAPI?.history?.openFolder();
});
els.clearHistory.addEventListener("click", () => {
  window.osuTapAPI?.history?.clear().then(() => fillHistory([]));
});

// History table
function fillHistory(arr) {
  const rows = (arr || [])
    .slice()
    .reverse()
    .slice(0, 100)
    .map((item) => {
      const dt = new Date(item.startedAt);
      const j = item.judgements || { 300: 0, 100: 0, 50: 0, miss: 0 };
      const acc =
        item.accuracyPct == null
          ? "—"
          : item.accuracyPct.toFixed
          ? item.accuracyPct.toFixed(1)
          : item.accuracyPct;
      const alt =
        item.alternationRate == null
          ? "—"
          : item.alternationRate.toFixed
          ? item.alternationRate.toFixed(1)
          : item.alternationRate;
      return `<tr>
      <td>${dt.toLocaleString()}</td>
      <td>${item.bpm}</td>
      <td>${item.durationSec}</td>
      <td>${acc}</td>
      <td>${alt}</td>
      <td>${j[300]}/${j[100]}/${j[50]}/${j.miss}</td>
      <td>${item.maxCombo ?? 0}</td>
    </tr>`;
    })
    .join("");
  els.historyBody.innerHTML =
    rows ||
    '<tr><td colspan="7" style="color:var(--muted)">No history yet</td></tr>';
}
window.osuTapAPI?.history
  ?.get()
  .then(fillHistory)
  .catch((err) => {
    console.error("[renderer] history.get failed", err);
  });

// Charts
function setupHiDPICanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function renderCharts() {
  renderOffsetLine();
  renderOffsetHistogram();
}

function renderOffsetLine() {
  const canvas = els.offsetLine;
  if (!canvas) return;
  const ctx = setupHiDPICanvas(canvas);
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    midY = h / 2;
  ctx.strokeStyle = "#444";
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();
  const { w300, w100, w50 } = getWindows();
  const span = Math.max(100, w50 * 2.2);
  [
    [w50, "#2a2f45"],
    [w100, "#2a2f45"],
    [w300, "#2a2f45"],
  ].forEach(([ms, color]) => {
    ctx.strokeStyle = color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, midY - (ms / span) * midY);
    ctx.lineTo(w, midY - (ms / span) * midY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, midY + (ms / span) * midY);
    ctx.lineTo(w, midY + (ms / span) * midY);
    ctx.stroke();
    ctx.setLineDash([]);
  });
  const early = "#60a5fa",
    late = "#f59e0b",
    ok = "#34d399",
    miss = "#ef4444";
  const pts = session.events.filter((e) => e.scored);
  const n = pts.length;
  if (!n) return;
  for (let i = 0; i < n; i++) {
    const e = pts[i];
    const x = (i / (n - 1 || 1)) * w;
    const y = midY + (e.offset / span) * midY;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    let color = e.judge === "miss" ? miss : e.offset < 0 ? early : late;
    if (e.judge === 300) color = ok;
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function renderOffsetHistogram() {
  const canvas = els.offsetHist;
  if (!canvas) return;
  const ctx = setupHiDPICanvas(canvas);
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    midX = w / 2,
    baseY = h - 18;
  const { w50 } = getWindows();
  const span = Math.max(100, w50 * 2.2);
  const binMs = 5;
  const maxAbs = span;
  const bins = new Map();
  for (const e of session.events) {
    if (!e.scored) continue;
    const off = Math.max(-maxAbs, Math.min(maxAbs, e.offset));
    const bin = Math.round(off / binMs) * binMs;
    bins.set(bin, (bins.get(bin) || 0) + 1);
  }
  ctx.strokeStyle = "#444";
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  ctx.lineTo(w, baseY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(midX, 8);
  ctx.lineTo(midX, baseY);
  ctx.stroke();
  const maxCount = Math.max(1, ...bins.values());
  const scaleY = (baseY - 10) / maxCount;
  const barW = Math.max(2, (w / span) * binMs);
  const early = "#60a5fa",
    late = "#f59e0b",
    ok = "#34d399";
  for (let xMs = -maxAbs; xMs <= maxAbs; xMs += binMs) {
    const c = bins.get(Math.round(xMs / binMs) * binMs) || 0;
    if (!c) continue;
    const x = midX + (xMs / span) * midX;
    const hBar = c * scaleY;
    let color = xMs === 0 ? ok : xMs < 0 ? early : late;
    ctx.fillStyle = color;
    ctx.fillRect(x - barW / 2, baseY - hBar, barW, hBar);
  }
}
