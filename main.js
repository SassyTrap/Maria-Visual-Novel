"use strict";

// Typing game configuration
const CONFIG = {
  baseSpawnMs: 1400,
  minSpawnMs: 450,
  baseSpeed: 42,           // px per second
  speedPerLevel: 6,
  maxConcurrent: 8,
  startLives: 3,
  particles: 18
};

// DOM references
const dom = {
  playfield: /** @type {HTMLDivElement} */ (document.getElementById("playfield")),
  score: /** @type {HTMLSpanElement} */ (document.getElementById("score")),
  streak: /** @type {HTMLSpanElement} */ (document.getElementById("streak")),
  level: /** @type {HTMLSpanElement} */ (document.getElementById("level")),
  lives: /** @type {HTMLSpanElement} */ (document.getElementById("lives")),
  accuracy: /** @type {HTMLSpanElement} */ (document.getElementById("accuracy")),
  startBtn: /** @type {HTMLButtonElement} */ (document.getElementById("startBtn")),
  pauseBtn: /** @type {HTMLButtonElement} */ (document.getElementById("pauseBtn")),
  resetBtn: /** @type {HTMLButtonElement} */ (document.getElementById("resetBtn")),
  overlay: /** @type {HTMLDivElement} */ (document.getElementById("overlay")),
  overlayTitle: /** @type {HTMLHeadingElement} */ (document.getElementById("overlayTitle")),
  overlayText: /** @type {HTMLParagraphElement} */ (document.getElementById("overlayText")),
  overlayBtn: /** @type {HTMLButtonElement} */ (document.getElementById("overlayBtn"))
};

// Game state
let isRunning = false;
let isPaused = false;
let score = 0;
let streak = 0;
let level = 1;
let lives = CONFIG.startLives;
let correctKeystrokes = 0;
let totalKeystrokes = 0;
let lastTs = 0;
let untilNextSpawnMs = CONFIG.baseSpawnMs;
let activeWordId = null;
let nextWordId = 1;

/** @type {Map<number, {id:number, text:string, typed:number, x:number, y:number, speed:number, el:HTMLDivElement, letters:HTMLSpanElement[]}>} */
const words = new Map();

// Word list
const WORDS = [
  "time","year","people","way","day","man","thing","woman","life","child","world","school","state","family","student","group","country","problem","hand","part","place","case","week","company","system","program","question","work","night","point","home","water","room","mother","area","money","story","fact","month","lot","right","study","book","eye","job","word","business","issue","side","kind","head","house","service","friend","father","power","hour","game","line","end","member","law","car","city","community","name","president","team","minute","idea","kid","body","information","back","parent","face","others","level","office","door","health","person","art","war","history","party","result","change","morning","reason","research","girl","guy","moment","air","teacher","force","education",
  // shorter gaming flavoured
  "laser","neon","nova","proto","hyper","zap","flux","byte","logic","quantum","glow","spark","lumen","rune","core","nexus","pulse","blaze","crux","axiom"
];

function init() {
  bindEvents();
  updateHud();
  showOverlay("Ready?", "Press Start, then type the words. Don't let them reach the bottom!", "Start", () => start());
}

function bindEvents() {
  dom.startBtn.addEventListener("click", start);
  dom.pauseBtn.addEventListener("click", togglePause);
  dom.resetBtn.addEventListener("click", resetGame);
  dom.overlayBtn.addEventListener("click", () => {
    if (!isRunning) start(); else togglePause();
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("blur", () => { if (isRunning && !isPaused) togglePause(true); });
}

function start() {
  if (isRunning) return;
  isRunning = true;
  isPaused = false;
  dom.playfield.focus();
  hideOverlay();
  lastTs = performance.now();
  requestAnimationFrame(tick);
  dom.startBtn.disabled = true;
  dom.pauseBtn.disabled = false;
}

function togglePause(forcePause = false) {
  if (!isRunning) return;
  isPaused = forcePause ? true : !isPaused;
  if (isPaused) {
    showOverlay("Paused", "Press Resume to continue.", "Resume", () => togglePause(false));
  } else {
    hideOverlay();
    lastTs = performance.now();
    requestAnimationFrame(tick);
  }
}

function resetGame() {
  // clear words
  for (const w of words.values()) w.el.remove();
  words.clear();
  activeWordId = null;

  isRunning = false;
  isPaused = false;
  score = 0; streak = 0; level = 1; lives = CONFIG.startLives;
  correctKeystrokes = 0; totalKeystrokes = 0;
  untilNextSpawnMs = CONFIG.baseSpawnMs;
  updateHud();
  dom.startBtn.disabled = false;
  dom.pauseBtn.disabled = true;
  showOverlay("Reset", "Press Start to play again.", "Start", () => start());
}

function gameOver() {
  isRunning = false;
  isPaused = false;
  dom.startBtn.disabled = false;
  dom.pauseBtn.disabled = true;
  showOverlay("Game Over", `Score: ${score}\nLevel: ${level}\nAccuracy: ${formatAccuracy()}`, "Play again", () => resetGame());
}

function tick(ts) {
  if (!isRunning || isPaused) return;
  const dt = Math.min(0.05, (ts - lastTs) / 1000); // clamp to avoid huge jumps
  lastTs = ts;

  updateWords(dt);
  handleSpawning(dt);

  requestAnimationFrame(tick);
}

function updateWords(dt) {
  const height = dom.playfield.clientHeight;
  for (const w of [...words.values()]) {
    w.y += w.speed * dt;
    if (w.y >= height - 28) {
      // word reached bottom -> lose life
      removeWord(w.id, false);
      loseLife();
      continue;
    }
    w.el.style.transform = `translate(${w.x}px, ${w.y}px)`;
  }
}

function loseLife() {
  lives -= 1; streak = 0; activeWordId = null;
  flashPlayfield();
  if (lives <= 0) return gameOver();
  updateHud();
}

function handleSpawning(dt) {
  if (words.size >= CONFIG.maxConcurrent) return;
  untilNextSpawnMs -= dt * 1000;
  if (untilNextSpawnMs <= 0) {
    spawnWord();
    const targetMs = Math.max(CONFIG.minSpawnMs, CONFIG.baseSpawnMs * Math.pow(0.96, level - 1));
    // randomize a bit
    untilNextSpawnMs = targetMs * (0.7 + Math.random() * 0.6);
  }
}

function spawnWord() {
  const text = pickWord();
  const id = nextWordId++;
  const el = document.createElement("div");
  el.className = "word";
  el.dataset.id = String(id);

  const lettersWrap = document.createElement("span");
  lettersWrap.className = "letters";
  /** @type {HTMLSpanElement[]} */
  const lettersEls = [];
  for (const ch of text) {
    const s = document.createElement("span");
    s.className = "letter";
    s.textContent = ch;
    lettersWrap.appendChild(s);
    lettersEls.push(s);
  }
  el.appendChild(lettersWrap);

  dom.playfield.appendChild(el);
  // After in DOM, measure width to place within bounds
  const fieldWidth = dom.playfield.clientWidth;
  const elWidth = el.clientWidth;
  const margin = 12;
  const x = Math.max(margin, Math.min(fieldWidth - elWidth - margin, Math.random() * (fieldWidth - elWidth)));
  const y = -Math.random() * 40 - 20; // start slightly above
  const speed = CONFIG.baseSpeed + (level - 1) * CONFIG.speedPerLevel + Math.random() * 12;

  el.style.transform = `translate(${x}px, ${y}px)`;

  const word = { id, text, typed: 0, x, y, speed, el, letters: lettersEls };
  words.set(id, word);
  return word;
}

function pickWord() {
  // word length scales with level
  const minLen = Math.min(3 + Math.floor(level / 2), 8);
  const maxLen = Math.min(4 + Math.floor(level / 1.5), 12);
  const candidates = WORDS.filter(w => w.length >= minLen && w.length <= maxLen);
  return candidates[Math.floor(Math.random() * candidates.length)] || WORDS[Math.floor(Math.random() * WORDS.length)];
}

function onKeyDown(e) {
  if (!isRunning || isPaused) return;
  const key = e.key;

  if (key === "Escape" || key === " ") {
    // switch target
    setActiveWord(null);
    return;
  }
  if (key === "Backspace") {
    if (activeWordId != null) {
      const w = words.get(activeWordId);
      if (w && w.typed > 0) {
        w.typed -= 1;
        updateWordLetters(w, false);
      }
    }
    return;
  }

  if (key.length !== 1) return;
  const ch = key.toLowerCase();
  if (!/^[a-z]$/.test(ch)) return;

  totalKeystrokes++;

  // pick a target if none
  if (activeWordId == null) {
    const best = pickTarget(ch);
    if (!best) { onMiss(); return; }
    setActiveWord(best.id);
  }

  const w = words.get(activeWordId);
  if (!w) { activeWordId = null; return; }
  const expected = w.text[w.typed]?.toLowerCase();

  if (ch === expected) {
    w.typed++;
    correctKeystrokes++;
    updateWordLetters(w, true);
    // completed word
    if (w.typed >= w.text.length) {
      onDestroyWord(w);
    }
  } else {
    onMiss(w);
  }
}

function pickTarget(startChar) {
  let best = null;
  let bestY = -Infinity;
  for (const w of words.values()) {
    if (w.text[0].toLowerCase() === startChar) {
      if (w.y > bestY) { bestY = w.y; best = w; }
    }
  }
  return best;
}

function setActiveWord(id) {
  if (activeWordId != null) {
    const prev = words.get(activeWordId);
    if (prev) prev.el.classList.remove("word--active");
  }
  activeWordId = id;
  if (activeWordId != null) {
    const w = words.get(activeWordId);
    if (w) w.el.classList.add("word--active");
  }
}

function updateWordLetters(w, good) {
  for (let i = 0; i < w.letters.length; i++) {
    const span = w.letters[i];
    span.classList.remove("letter--typed", "letter--wrong");
    if (i < w.typed) span.classList.add("letter--typed");
  }
  if (good === false) {
    const next = w.letters[w.typed];
    if (next) next.classList.add("letter--wrong");
  }
}

function onMiss(w) {
  streak = 0;
  if (w) updateWordLetters(w, false);
  flashPlayfield();
  updateHud();
}

function onDestroyWord(w) {
  // scoring: length * level * (1 + streak bonus)
  const base = w.text.length * 10;
  const bonus = 1 + Math.min(1.5, streak * 0.05);
  score += Math.floor(base * level * bonus);
  streak += 1;
  if (streak % 8 === 0) level += 1;

  burstParticles(w);

  removeWord(w.id, true);
  setActiveWord(null);
  updateHud();
}

function removeWord(id, good) {
  const w = words.get(id);
  if (!w) return;
  if (!good) {
    // small red burst for failure
    burstParticles(w, true);
  }
  w.el.remove();
  words.delete(id);
}

function burstParticles(w, isBad = false) {
  const rect = dom.playfield.getBoundingClientRect();
  const wordRect = w.el.getBoundingClientRect();
  const cx = wordRect.left - rect.left + wordRect.width / 2;
  const cy = wordRect.top - rect.top + wordRect.height / 2;

  const n = CONFIG.particles;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 80;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    p.style.setProperty("--dx", `${dx}px`);
    p.style.setProperty("--dy", `${dy}px`);
    if (isBad) {
      p.style.background = "radial-gradient(circle at 30% 30%, #fff, var(--danger))";
    } else if (Math.random() < 0.3) {
      p.style.background = "radial-gradient(circle at 30% 30%, #fff, var(--accent-2))";
    }
    dom.playfield.appendChild(p);
    setTimeout(() => p.remove(), 950);
  }
}

function flashPlayfield() {
  dom.playfield.classList.remove("shake");
  // force reflow to restart animation
  void dom.playfield.offsetWidth;
  dom.playfield.classList.add("shake");
}

function updateHud() {
  dom.score.textContent = String(score);
  dom.streak.textContent = String(streak);
  dom.level.textContent = String(level);
  dom.lives.textContent = String(lives);
  dom.accuracy.textContent = formatAccuracy();
}

function formatAccuracy() {
  if (totalKeystrokes === 0) return "100%";
  const pct = (correctKeystrokes / totalKeystrokes) * 100;
  return `${Math.max(0, Math.min(100, pct)).toFixed(0)}%`;
}

function showOverlay(title, text, btnLabel, onClick) {
  dom.overlayTitle.textContent = title;
  dom.overlayText.textContent = text;
  dom.overlayBtn.textContent = btnLabel;
  dom.overlay.classList.remove("hidden");
  dom.overlayBtn.onclick = onClick;
}

function hideOverlay() {
  dom.overlay.classList.add("hidden");
}

// Boot
init();