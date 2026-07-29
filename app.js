import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
import { I18N, LANG_NAMES, pickLang } from "./i18n.js";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const chordText = document.getElementById("chordText");
const detailText = document.getElementById("detailText");
const volBar = document.getElementById("volBar");
const modeEl = document.getElementById("mode");
const keyEl = document.getElementById("key");
const instEl = document.getElementById("inst");
const leftSettingEl = document.getElementById("leftSetting");
const rightSettingEl = document.getElementById("rightSetting");
const startBtn = document.getElementById("start-btn");
const startScreen = document.getElementById("start-screen");
const statusEl = document.getElementById("status");

const TEAL = "#34d9b4";
const WARM = "#f0a86e";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DEGREE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const KEY_BASE = 48;
const QUALITIES = [
  { major: [0, 4, 7],     minor: [0, 3, 7] },
  { major: [4, 7, 12],    minor: [3, 7, 12] },
  { major: [0, 4, 7, 11], minor: [0, 3, 7, 10] },
  { major: [0, 4, 7, 14], minor: [0, 3, 7, 14] },
];
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

NOTE_NAMES.forEach((n, i) => {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = n;
  if (i === 0) opt.selected = true;
  keyEl.appendChild(opt);
});

let lang = pickLang();
const t = k => I18N[lang][k] ?? I18N.en[k];

const langSelects = [...document.querySelectorAll(".langSel")];
langSelects.forEach(sel => {
  for (const code in LANG_NAMES) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = LANG_NAMES[code];
    sel.appendChild(opt);
  }
  sel.value = lang;
  sel.addEventListener("change", () => {
    lang = sel.value;
    localStorage.setItem("telli-lang", lang);
    langSelects.forEach(s => { if (s !== sel) s.value = lang; });
    applyI18n();
  });
});

function applyI18n() {
  document.documentElement.lang = lang;
  document.getElementById("lbl-mode").textContent = t("mode");
  document.getElementById("lbl-key").textContent = t("key");
  document.getElementById("lbl-inst").textContent = t("instrument");
  document.getElementById("lbl-left").textContent = t("leftHand");
  document.getElementById("lbl-right").textContent = t("rightHand");
  document.getElementById("lbl-lang").textContent = t("language");
  modeEl.options[0].textContent = t("modeGesture");
  modeEl.options[1].textContent = t("modeTheremin");
  instEl.options[0].textContent = t("instSynth");
  instEl.options[1].textContent = t("instOrgan");
  instEl.options[2].textContent = t("instPiano");
  instEl.options[3].textContent = t("instGuitar");
  instEl.options[4].textContent = t("instElectric");
  leftSettingEl.options[0].textContent = t("leftTilt");
  leftSettingEl.options[1].textContent = t("leftMajor");
  leftSettingEl.options[2].textContent = t("leftMinor");
  rightSettingEl.options[0].textContent = t("rightFingers");
  rightSettingEl.options[1].textContent = t("rightFixedTriad");
  rightSettingEl.options[2].textContent = t("rightFixedSeventh");
  document.getElementById("card-left-title").textContent = t("cardLeftTitle");
  document.getElementById("card-left-body").textContent = t("cardLeftBody");
  document.getElementById("card-right-title").textContent = t("cardRightTitle");
  document.getElementById("card-right-body").textContent = t("cardRightBody");
  document.getElementById("card-cam-title").textContent = t("cardCamTitle");
  document.getElementById("card-cam-body").textContent = t("cardCamBody");
  if (!startBtn.disabled) startBtn.textContent = t("start");
}
applyI18n();

let landmarker = null;
let running = false;
let volume = 0;
let tone = 0.5;
let lastChordKey = null;
let thereminFreq = 220;
let thereminVol = 0;
let tiltMinor = false;
let prevRVol = 0;
let lastTriggerAt = 0;

const degreeState = { committed: null, cand: null, count: 0 };
const qualityState = { committed: null, cand: null, count: 0 };
const lmSmooth = { left: null, right: null };
const roles = { left: null, right: null };
const rMotion = { x: 0, y: 0, palm: 0, t: 0 };

function smoothLandmarks(key, pts) {
  const prev = lmSmooth[key];
  if (!prev || prev.length !== pts.length) {
    lmSmooth[key] = pts.map(p => ({ ...p }));
    return lmSmooth[key];
  }
  for (let i = 0; i < pts.length; i++) {
    prev[i].x += (pts[i].x - prev[i].x) * 0.5;
    prev[i].y += (pts[i].y - prev[i].y) * 0.5;
  }
  return prev;
}

function stabilize(raw, s, dwell = 3) {
  if (raw === null || raw === undefined) { s.committed = null; s.cand = null; s.count = 0; return null; }
  if (s.committed === null || raw === s.committed) { s.committed = raw; s.cand = raw; s.count = 0; return s.committed; }
  if (raw === s.cand) s.count++; else { s.cand = raw; s.count = 1; }
  if (s.count >= dwell) { s.committed = raw; s.count = 0; }
  return s.committed;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

let bus, filter, sustainGain, oscs = [], thereminOsc, thereminGain;
let guitarPlucks = [], electricPlucks = [], piano, guitarSampler, electricSampler;

function initAudio() {
  const limiter = new Tone.Limiter(-2).toDestination();
  const reverb = new Tone.Reverb({ decay: 2.4, wet: 0.25 }).connect(limiter);
  bus = new Tone.Gain(0.8).connect(reverb);

  const shimmer = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.5, wet: 0.3 }).connect(bus);
  shimmer.start();
  filter = new Tone.Filter(1800, "lowpass").connect(shimmer);
  sustainGain = new Tone.Gain(0).connect(filter);
  for (let i = 0; i < 4; i++) {
    const o = new Tone.Oscillator(220, "sawtooth").connect(sustainGain);
    o.detune.value = i % 2 === 0 ? -5 : 5;
    o.start();
    oscs.push(o);
  }

  thereminGain = new Tone.Gain(0).connect(filter);
  thereminOsc = new Tone.Oscillator(220, "sine").connect(thereminGain);
  thereminOsc.start();

  for (let i = 0; i < 4; i++) {
    const gain = new Tone.Gain(1).connect(bus);
    const synth = new Tone.PluckSynth({ attackNoise: 1, dampening: 4200, resonance: 0.975 }).connect(gain);
    guitarPlucks.push({ synth, gain });
  }

  const chorus = new Tone.Chorus({ frequency: 1.2, delayTime: 3, depth: 0.4, wet: 0.5 }).connect(bus);
  chorus.start();
  const distortion = new Tone.Distortion(0.35).connect(chorus);
  for (let i = 0; i < 4; i++) {
    const gain = new Tone.Gain(1).connect(distortion);
    const synth = new Tone.PluckSynth({ attackNoise: 0.6, dampening: 2600, resonance: 0.985 }).connect(gain);
    electricPlucks.push({ synth, gain });
  }

  guitarSampler = new Tone.Sampler({
    urls: {
      "E2": "E2.mp3", "G2": "G2.mp3", "A2": "A2.mp3", "C3": "C3.mp3",
      "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", "A3": "A3.mp3", "C4": "C4.mp3",
      "E4": "E4.mp3", "G4": "G4.mp3", "C5": "C5.mp3",
    },
    baseUrl: "https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-acoustic/",
  }).connect(bus);

  const ampComp = new Tone.Compressor(-20, 3).connect(bus);
  const cabLow = new Tone.Filter(4500, "lowpass").connect(ampComp);
  const cabHigh = new Tone.Filter(90, "highpass").connect(cabLow);
  const drive = new Tone.Distortion({ distortion: 0.3, oversample: "2x" }).connect(cabHigh);
  electricSampler = new Tone.Sampler({
    urls: {
      "E2": "E2.mp3", "F#2": "Fs2.mp3", "A2": "A2.mp3", "C3": "C3.mp3",
      "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", "A3": "A3.mp3", "C4": "C4.mp3",
      "A4": "A4.mp3", "C5": "C5.mp3",
    },
    baseUrl: "https://nbrosowsky.github.io/tonejs-instruments/samples/guitar-electric/",
  }).connect(drive);

  piano = new Tone.Sampler({
    urls: {
      "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3", "A2": "A2.mp3",
      "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3", "A3": "A3.mp3",
      "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3", "A4": "A4.mp3",
      "C5": "C5.mp3",
    },
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  }).connect(bus);
}

function triggerChord(midis, vel) {
  const inst = instEl.value;
  const now = Tone.now();
  const notes = (inst === "guitar" || inst === "electric") ? [midis[0] - 12, ...midis] : midis;
  notes.forEach((m, k) => {
    const t = now + k * 0.018 + Math.random() * 0.006;
    const v = Math.min(1, (0.3 + 0.6 * vel) * (0.85 + Math.random() * 0.3));
    const freq = midiToFreq(m);
    if (inst === "piano") {
      if (piano.loaded) piano.triggerAttackRelease(freq, "1n", t, v);
      return;
    }
    const sampler = inst === "electric" ? electricSampler : guitarSampler;
    if (sampler && sampler.loaded) {
      sampler.triggerAttackRelease(freq, "1n", t, v);
    } else {
      const set = inst === "electric" ? electricPlucks : guitarPlucks;
      const s = set[k % set.length];
      s.gain.gain.setValueAtTime(0.3 + 0.7 * vel, t);
      s.synth.triggerAttack(freq, t);
    }
  });
}

function silentWavUrl() {
  const rate = 8000, n = rate / 2;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

let mediaSession = null;
function unlockMobileAudio() {
  if (mediaSession) return;
  mediaSession = document.createElement("audio");
  mediaSession.setAttribute("playsinline", "");
  mediaSession.loop = true;
  mediaSession.volume = 0.01;
  mediaSession.src = silentWavUrl();
  mediaSession.play().catch(() => {});
}

async function resumeAudio() {
  if (Tone.context.state !== "running") {
    try { await Tone.context.resume(); } catch {}
  }
}

window.addEventListener("touchend", resumeAudio, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) resumeAudio();
});

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    statusEl.textContent = t("statusAudio");
    unlockMobileAudio();
    await Tone.start();
    await resumeAudio();
    initAudio();

    statusEl.textContent = t("statusModel");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    const options = {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    try {
      landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch {
      options.baseOptions.delegate = "CPU";
      landmarker = await HandLandmarker.createFromOptions(vision, options);
    }

    statusEl.textContent = t("statusCamera");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await new Promise(res => { video.onloadedmetadata = res; });
    await video.play();

    startScreen.style.display = "none";
    running = true;
    requestAnimationFrame(loop);
  } catch (err) {
    statusEl.textContent = t("error") + err.message;
    startBtn.disabled = false;
    startBtn.textContent = t("start");
  }
});

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

function mapPoint(lm) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(canvas.width / vw, canvas.height / vh);
  const ox = (canvas.width - vw * scale) / 2;
  const oy = (canvas.height - vh * scale) / 2;
  return { x: (1 - lm.x) * vw * scale + ox, y: lm.y * vh * scale + oy };
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function fingerExtended(pts, mcp, pip, tip) {
  const v1x = pts[mcp].x - pts[pip].x, v1y = pts[mcp].y - pts[pip].y;
  const v2x = pts[tip].x - pts[pip].x, v2y = pts[tip].y - pts[pip].y;
  const cos = (v1x * v2x + v1y * v2y) /
    (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 1e-6);
  return cos < -0.55 && dist(pts[tip], pts[0]) > dist(pts[pip], pts[0]);
}

function fingersUp(pts) {
  return {
    index: fingerExtended(pts, 5, 6, 8),
    middle: fingerExtended(pts, 9, 10, 12),
    ring: fingerExtended(pts, 13, 14, 16),
    pinky: fingerExtended(pts, 17, 18, 20),
    thumb: dist(pts[4], pts[17]) > dist(pts[3], pts[17]) * 1.25,
  };
}

function handTilt(pts) {
  const dx = pts[9].x - pts[0].x;
  const dy = pts[9].y - pts[0].y;
  return Math.atan2(dx, -dy) * 180 / Math.PI;
}

function analyzeLeft(pts) {
  const up = fingersUp(pts);
  let degree = null;
  if (up.index && up.pinky && !up.middle && !up.ring) {
    degree = up.thumb ? 7 : 6;
  } else {
    const nonThumb = ["index", "middle", "ring", "pinky"].filter(k => up[k]).length;
    if (nonThumb > 0) degree = nonThumb === 4 && up.thumb ? 5 : Math.min(nonThumb, 4);
  }
  const tilt = Math.abs(handTilt(pts));
  if (tiltMinor) {
    if (tilt < 24) tiltMinor = false;
  } else {
    if (tilt > 34) tiltMinor = true;
  }
  return { degree, tilted: tiltMinor };
}

function analyzeRight(pts) {
  const up = fingersUp(pts);
  const nonThumb = ["index", "middle", "ring", "pinky"].filter(k => up[k]).length;
  const palm = dist(pts[0], pts[9]);
  const volY = clamp((0.9 - pts[0].y / canvas.height) / 0.35, 0, 1);
  const tilt = handTilt(pts);
  return {
    quality: nonThumb >= 1 ? Math.min(nonThumb, 4) - 1 : null,
    volY,
    tonePct: clamp(Math.abs(tilt) / 60, 0, 1),
    thumbDown: pts[4].y > pts[0].y + palm * 0.25,
  };
}

function drawHandLabel(pts, text, color) {
  ctx.fillStyle = color;
  ctx.font = '600 14px "Segoe UI", sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, pts[0].x + 20, pts[0].y + 4);
}

function drawHand(pts, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function setSustainTargets(midis, targetVol) {
  const inst = instEl.value;
  const sustained = inst === "synth" || inst === "organ";
  const wave = inst === "organ" ? "sine" : "sawtooth";
  oscs.forEach((o, i) => {
    if (o.type !== wave) o.type = wave;
    if (midis && midis[i] !== undefined) o.frequency.rampTo(midiToFreq(midis[i]), 0.12);
  });
  sustainGain.gain.rampTo(sustained ? targetVol * 0.22 : 0, 0.12);
}

function loop() {
  if (!running) return;
  const now = performance.now();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let leftPts = null, rightPts = null;

  if (video.videoWidth > 0) {
    const res = landmarker.detectForVideo(video, now);
    const hands = (res.landmarks || []).map(lm => lm.map(mapPoint));

    if (hands.length >= 2) {
      const sorted = [hands[0], hands[1]].sort((a, b) => a[0].x - b[0].x);
      leftPts = sorted[0];
      rightPts = sorted[1];
    } else if (hands.length === 1) {
      const p = hands[0][0];
      const dl = roles.left && now - roles.left.seenAt < 700
        ? Math.hypot(p.x - roles.left.x, p.y - roles.left.y) : Infinity;
      const dr = roles.right && now - roles.right.seenAt < 700
        ? Math.hypot(p.x - roles.right.x, p.y - roles.right.y) : Infinity;
      if (dl === Infinity && dr === Infinity) {
        if (p.x < canvas.width / 2) leftPts = hands[0]; else rightPts = hands[0];
      } else if (dl <= dr) {
        leftPts = hands[0];
      } else {
        rightPts = hands[0];
      }
    }

    if (leftPts) roles.left = { x: leftPts[0].x, y: leftPts[0].y, seenAt: now };
    if (rightPts) roles.right = { x: rightPts[0].x, y: rightPts[0].y, seenAt: now };
  }

  leftPts = leftPts ? smoothLandmarks("left", leftPts) : (lmSmooth.left = null);
  rightPts = rightPts ? smoothLandmarks("right", rightPts) : (lmSmooth.right = null);

  if (leftPts) drawHand(leftPts, TEAL);
  if (rightPts) drawHand(rightPts, WARM);

  if (modeEl.value === "theremin") {
    sustainGain.gain.rampTo(0, 0.1);
    const keyHz = midiToFreq(KEY_BASE + parseInt(keyEl.value, 10) + 12);
    const targetFreq = rightPts
      ? keyHz * Math.pow(2, clamp(1 - rightPts[0].y / canvas.height, 0, 1) * 2)
      : thereminFreq;
    const targetVol = leftPts ? Math.pow(clamp(1 - leftPts[0].y / canvas.height, 0, 1), 1.4) * 0.3 : 0;
    thereminFreq = lerp(thereminFreq, targetFreq, 0.3);
    thereminVol = lerp(thereminVol, targetVol, 0.25);
    thereminOsc.frequency.rampTo(thereminFreq, 0.04);
    thereminGain.gain.rampTo(thereminVol, 0.06);
    chordText.textContent = thereminVol > 0.01 ? Math.round(thereminFreq) + " Hz" : "—";
    detailText.textContent = t("theremin");
    volBar.style.width = Math.round(thereminVol / 0.3 * 100) + "%";
    lastChordKey = null;
    requestAnimationFrame(loop);
    return;
  }

  thereminGain.gain.rampTo(0, 0.1);

  const L = leftPts ? analyzeLeft(leftPts) : null;
  const R = rightPts ? analyzeRight(rightPts) : null;

  let shake = false;
  if (rightPts) {
    const p = rightPts[0];
    const palm = dist(rightPts[0], rightPts[9]);
    const tNow = performance.now();
    if (rMotion.t && tNow - rMotion.t < 200) {
      const dt = Math.max(0.016, (tNow - rMotion.t) / 1000);
      const move = Math.hypot(p.x - rMotion.x, p.y - rMotion.y) / canvas.height / dt;
      const zoom = Math.abs(palm - rMotion.palm) / Math.max(palm, 1) / dt;
      shake = move > 0.8 || zoom > 0.6;
    }
    rMotion.x = p.x;
    rMotion.y = p.y;
    rMotion.palm = palm;
    rMotion.t = tNow;
  } else {
    rMotion.t = 0;
  }

  const degree = stabilize(L ? L.degree : null, degreeState, 5);

  let minor = false;
  if (leftSettingEl.value === "tilt") minor = L ? L.tilted : false;
  else minor = leftSettingEl.value === "minor";

  let qualityIdx = 0;
  if (rightSettingEl.value === "fingers") {
    qualityIdx = stabilize(R ? R.quality : null, qualityState, 4) ?? 0;
  } else {
    qualityIdx = parseInt(rightSettingEl.value, 10);
  }

  const octDown = R ? R.thumbDown : false;
  tone = lerp(tone, R ? R.tonePct : 0.5, 0.15);
  filter.frequency.rampTo(500 + tone * 3200, 0.08);

  const targetVol = degree === null ? 0 : (R ? 0.3 + 0.7 * R.volY : 0.65);
  volume = lerp(volume, targetVol, 0.15);
  volBar.style.width = Math.round(clamp(volume, 0, 1) * 100) + "%";

  if (degree !== null) {
    const rootMidi = KEY_BASE + parseInt(keyEl.value, 10) + DEGREE_OFFSETS[degree - 1] - (octDown ? 12 : 0);
    const quality = QUALITIES[qualityIdx];
    const intervals = (minor ? quality.minor : quality.major).slice();
    while (intervals.length < 4) intervals.push(intervals[0] + 12);
    const midis = intervals.map(iv => rootMidi + iv);

    setSustainTargets(midis, volume);

    const inst = instEl.value;
    if (inst === "piano" || inst === "guitar" || inst === "electric") {
      const chordKey = [degree, minor, qualityIdx, octDown, keyEl.value].join("|");
      const retrig = (shake || (R && (R.volY - prevRVol) > 0.08)) && performance.now() - lastTriggerAt > 300;
      if (volume > 0.06 && (chordKey !== lastChordKey || retrig) && performance.now() - lastTriggerAt > 140) {
        triggerChord(midis, clamp(targetVol, 0.2, 1));
        lastChordKey = chordKey;
        lastTriggerAt = performance.now();
      }
      if (volume <= 0.06) lastChordKey = null;
    }

    const rootName = NOTE_NAMES[((rootMidi % 12) + 12) % 12];
    chordText.textContent = rootName + (minor ? "m" : "") +
      (qualityIdx === 2 ? "7" : qualityIdx === 3 ? "9" : "");
    detailText.textContent = ROMAN[degree - 1] + " · " + (minor ? t("minor") : t("major")) + " · " +
      t("qualities")[qualityIdx].toUpperCase() + (octDown ? " · " + t("octDown") : "");
  } else {
    setSustainTargets(null, 0);
    lastChordKey = null;
    chordText.textContent = "—";
    detailText.textContent = leftPts ? "" : t("showLeftHand");
  }

  if (leftPts && degree !== null) {
    drawHandLabel(leftPts, ROMAN[degree - 1] + " · " + (minor ? t("minor") : t("major")), TEAL);
  }
  if (rightPts) {
    drawHandLabel(rightPts, t("qualities")[qualityIdx] + " · " + Math.round(clamp(volume, 0, 1) * 100) + "%", WARM);
  }
  prevRVol = R ? R.volY : 0;

  requestAnimationFrame(loop);
}
