"use strict";

/** @typedef {{ id: number, text: string, x: number, y: number, speed: number, el: HTMLDivElement }} FallingWord */

const dom = {
  scoreValue: /** @type {HTMLSpanElement} */ (document.getElementById("scoreValue")),
  livesValue: /** @type {HTMLSpanElement} */ (document.getElementById("livesValue")),
  bestValue: /** @type {HTMLSpanElement} */ (document.getElementById("bestValue")),
  resetButton: /** @type {HTMLButtonElement} */ (document.getElementById("resetButton")),
  gameArea: /** @type {HTMLDivElement} */ (document.getElementById("gameArea")),
  promptInput: /** @type {HTMLInputElement} */ (document.getElementById("promptInput")),
};

const STORAGE_KEY = "sky-typer-best-v1";

/** @type {{ score: number, lives: number, best: number, isGameOver: boolean, lastTickMs: number, nextId: number, spawnCooldown: number, spawnInterval: number, speedMultiplier: number }} */
const game = {
  score: 0,
  lives: 3,
  best: 0,
  isGameOver: false,
  lastTickMs: performance.now(),
  nextId: 1,
  spawnCooldown: 0,
  spawnInterval: 1200,
  speedMultiplier: 1,
};

/** @type {FallingWord[]} */
let words = [];

/** Basic word list. Keep short and readable. */
const WORDS = [
  "sun", "moon", "star", "sky", "cloud", "rain", "wind", "storm", "light",
  "code", "array", "class", "loop", "bug", "stack", "node", "react", "state",
  "fast", "slow", "crisp", "sweet", "spice", "water", "stone", "metal", "wood",
  "blue", "green", "red", "gold", "violet", "cyan", "white", "black", "silver",
  "type", "word", "game", "skill", "focus", "quick", "zebra", "quake", "jazz"
];

function initialize() {
  loadBest();
  updateHud();
  bindEvents();
  focusPrompt();
  requestAnimationFrame(loop);
}

function bindEvents() {
  dom.resetButton.addEventListener("click", resetGame);
  dom.promptInput.addEventListener("keydown", onPromptKey);
  window.addEventListener("click", () => focusPrompt());
  window.addEventListener("resize", clampAllToBounds);
}

function focusPrompt() {
  if (!game.isGameOver) dom.promptInput?.focus();
}

function resetGame() {
  game.score = 0;
  game.lives = 3;
  game.isGameOver = false;
  game.spawnInterval = 1200;
  game.speedMultiplier = 1;
  clearAllWords();
  // remove any lingering overlays
  const overlays = Array.from(dom.gameArea.querySelectorAll('.miss-flash'));
  overlays.forEach(el => el.remove());
  updateHud();
  focusPrompt();
}

function loadBest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.best === "number") game.best = parsed.best;
  } catch {}
}

function saveBest() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best: game.best, t: Date.now() }));
  } catch {}
}

function updateHud() {
  dom.scoreValue.textContent = String(game.score);
  dom.livesValue.textContent = String(game.lives);
  dom.bestValue.textContent = String(game.best);
}

function onPromptKey(ev) {
  if (ev.key === "Enter") {
    const value = dom.promptInput.value.trim().toLowerCase();
    if (value.length === 0) return;
    trySubmit(value);
    dom.promptInput.value = "";
  }
}

function trySubmit(value) {
  // Target the lowest matching word (closest to the bottom)
  let targetIndex = -1;
  let maxY = -Infinity;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.text === value && w.y > maxY) {
      maxY = w.y;
      targetIndex = i;
    }
  }
  if (targetIndex >= 0) {
    const hit = words[targetIndex];
    awardScore(hit);
    spawnHitEffect(hit.x, hit.y);
    removeWord(hit.id);
  } else {
    flashMiss();
  }
}

function awardScore(word) {
  const base = 10 + Math.floor(word.text.length * 2);
  const depthBonus = Math.floor((word.y / dom.gameArea.clientHeight) * 10);
  game.score += base + depthBonus;
  if (game.score > game.best) {
    game.best = game.score;
    saveBest();
  }
  increaseDifficulty();
  updateHud();
}

function increaseDifficulty() {
  // Make spawns faster and falling faster as score increases
  const minInterval = 400;
  const speedCap = 3.5;
  if (game.spawnInterval > minInterval) game.spawnInterval = Math.max(minInterval, 1200 - game.score * 2);
  game.speedMultiplier = Math.min(speedCap, 1 + game.score / 400);
}

function loop(now) {
  const dtMs = Math.max(0, now - game.lastTickMs);
  game.lastTickMs = now;
  if (!game.isGameOver) {
    updateSpawn(dtMs);
    updateWords(dtMs);
  }
  requestAnimationFrame(loop);
}

function updateSpawn(dtMs) {
  game.spawnCooldown -= dtMs;
  if (game.spawnCooldown <= 0) {
    spawnWord();
    game.spawnCooldown = game.spawnInterval;
  }
}

function spawnWord() {
  const text = WORDS[Math.floor(Math.random() * WORDS.length)];
  const padding = 30;
  const x = padding + Math.random() * Math.max(0, dom.gameArea.clientWidth - padding * 2);
  const y = -20;
  const baseSpeed = 60 + Math.random() * 60; // px/s
  const speed = baseSpeed * game.speedMultiplier;
  const id = game.nextId++;
  const el = document.createElement("div");
  el.className = "word";
  el.textContent = text;
  dom.gameArea.appendChild(el);
  const node = { id, text, x, y, speed, el };
  words.push(node);
  positionWord(node);
}

function updateWords(dtMs) {
  const dt = dtMs / 1000;
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    w.y += w.speed * dt;
    positionWord(w);
    if (w.y > dom.gameArea.clientHeight + 20) {
      // Missed
      loseLife();
      removeWord(w.id);
    }
  }
}

function positionWord(w) {
  w.el.style.left = `${w.x}px`;
  w.el.style.top = `${w.y}px`;
}

function removeWord(id) {
  const idx = words.findIndex(w => w.id === id);
  if (idx >= 0) {
    const [w] = words.splice(idx, 1);
    w.el.remove();
  }
}

function clearAllWords() {
  for (const w of words) w.el.remove();
  words = [];
}

function loseLife() {
  if (game.isGameOver) return;
  game.lives -= 1;
  updateHud();
  flashMiss();
  if (game.lives <= 0) {
    endGame();
  }
}

function endGame() {
  game.isGameOver = true;
  showGameOver();
}

function showGameOver() {
  const banner = document.createElement("div");
  banner.className = "miss-flash";
  banner.style.display = "grid";
  banner.style.placeItems = "center";
  banner.style.fontWeight = "800";
  banner.style.fontSize = "22px";
  banner.textContent = `Game Over – Score ${game.score} · Best ${game.best} · Click or press Reset to play again`;
  dom.gameArea.appendChild(banner);
  setTimeout(() => {
    if (!game.isGameOver) banner.remove();
  }, 2000);
}

function flashMiss() {
  const flash = document.createElement("div");
  flash.className = "miss-flash";
  dom.gameArea.appendChild(flash);
  setTimeout(() => flash.remove(), 400);
}

function spawnHitEffect(x, y) {
  const spark = document.createElement("div");
  spark.className = "hit-spark";
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  dom.gameArea.appendChild(spark);
  setTimeout(() => spark.remove(), 600);
}

function clampAllToBounds() {
  const width = dom.gameArea.clientWidth;
  const padding = 20;
  for (const w of words) {
    w.x = Math.min(width - padding, Math.max(padding, w.x));
    positionWord(w);
  }
}

// Boot
initialize();