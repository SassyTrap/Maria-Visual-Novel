"use strict";

const STORAGE_KEY = "cc-lite-save-v1";
const SAVE_INTERVAL_MS = 4000;

/** @typedef {{ id: string, name: string, description: string, type: 'cpc'|'cps', cpc?: number, cps?: number, baseCost: number, costMultiplier: number }} UpgradeDef */
/** @typedef {{ [id: string]: number }} UpgradeCounts */

/** @type {UpgradeDef[]} */
const UPGRADE_DEFS = [
  { id: "cursor", name: "Cursor", description: "+1 cookie per click", type: "cpc", cpc: 1, baseCost: 15, costMultiplier: 1.15 },
  { id: "grandma", name: "Grandma", description: "Bakes 0.2 cookies/sec", type: "cps", cps: 0.2, baseCost: 100, costMultiplier: 1.15 },
  { id: "farm", name: "Farm", description: "Yields 1 cookie/sec", type: "cps", cps: 1, baseCost: 1100, costMultiplier: 1.15 },
  { id: "factory", name: "Factory", description: "Produces 8 cookies/sec", type: "cps", cps: 8, baseCost: 13000, costMultiplier: 1.15 },
  { id: "mine", name: "Mine", description: "Extracts 47 cookies/sec", type: "cps", cps: 47, baseCost: 120000, costMultiplier: 1.15 }
];

const dom = {
  cookiesCount: /** @type {HTMLSpanElement} */ (document.getElementById("cookiesCount")),
  cookiesPerClick: /** @type {HTMLSpanElement} */ (document.getElementById("cookiesPerClick")),
  cookiesPerSecond: /** @type {HTMLSpanElement} */ (document.getElementById("cookiesPerSecond")),
  cookieButton: /** @type {HTMLButtonElement} */ (document.getElementById("cookieButton")),
  shopList: /** @type {HTMLDivElement} */ (document.getElementById("shopList")),
  resetButton: /** @type {HTMLButtonElement} */ (document.getElementById("resetButton")),
  saveIndicator: /** @type {HTMLDivElement} */ (document.getElementById("saveIndicator"))
};

/** @type {{
 *   cookies: number,
 *   totalCookies: number,
 *   upgradeCounts: UpgradeCounts,
 *   lastTickMs: number
 * }} */
const gameState = {
  cookies: 0,
  totalCookies: 0,
  upgradeCounts: {},
  lastTickMs: performance.now()
};

let latestComputedCpc = 1;
let latestComputedCps = 0;
let lastSaveMs = 0;
let isSaving = false;

function initialize() {
  // Initialize upgrade counts
  for (const def of UPGRADE_DEFS) {
    if (gameState.upgradeCounts[def.id] == null) {
      gameState.upgradeCounts[def.id] = 0;
    }
  }

  loadSave();
  buildShop();
  bindEvents();
  updateComputedRates();
  updateUi();
  requestAnimationFrame(gameLoop);
}

function bindEvents() {
  dom.cookieButton.addEventListener("click", onCookieClicked);
  dom.resetButton.addEventListener("click", resetGame);
  window.addEventListener("beforeunload", () => saveNow());
}

function onCookieClicked(ev) {
  addCookies(latestComputedCpc);
  spawnGainLabel(ev);
  // brief press feedback class could be added here
}

function addCookies(amount) {
  gameState.cookies += amount;
  gameState.totalCookies += amount;
  updateUi();
  scheduleSave();
}

function spendCookies(amount) {
  gameState.cookies -= amount;
  updateUi();
  scheduleSave();
}

function resetGame() {
  const confirmText = "Reset your progress? This cannot be undone.";
  if (!confirm(confirmText)) return;
  localStorage.removeItem(STORAGE_KEY);
  gameState.cookies = 0;
  gameState.totalCookies = 0;
  for (const def of UPGRADE_DEFS) gameState.upgradeCounts[def.id] = 0;
  updateComputedRates();
  updateUi();
}

function buildShop() {
  dom.shopList.innerHTML = "";
  for (const def of UPGRADE_DEFS) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("div");
    title.className = "card__title";
    title.textContent = def.name;

    const desc = document.createElement("div");
    desc.className = "card__desc";
    desc.textContent = def.description;

    const meta = document.createElement("div");
    meta.className = "card__meta";

    const owned = document.createElement("span");
    owned.className = "badge";
    owned.id = `owned-${def.id}`;
    owned.textContent = `Owned: ${gameState.upgradeCounts[def.id]}`;

    const effect = document.createElement("span");
    effect.id = `effect-${def.id}`;
    effect.textContent = effectText(def);

    meta.appendChild(owned);
    meta.appendChild(effect);

    const actions = document.createElement("div");
    actions.className = "card__actions";

    const price = document.createElement("div");
    price.className = "price";
    price.id = `price-${def.id}`;
    price.textContent = `Cost: ${formatNumber(nextCost(def))}`;

    const buy = document.createElement("button");
    buy.className = "btn";
    buy.id = `buy-${def.id}`;
    buy.textContent = "Buy";
    buy.addEventListener("click", () => tryBuy(def));

    actions.appendChild(buy);
    actions.appendChild(price);

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(meta);
    card.appendChild(actions);

    dom.shopList.appendChild(card);
  }
}

function tryBuy(def) {
  const cost = nextCost(def);
  if (gameState.cookies < cost) return;
  spendCookies(cost);
  gameState.upgradeCounts[def.id] += 1;
  updateComputedRates();
  updateUi();
}

function nextCost(def) {
  const count = gameState.upgradeCounts[def.id] || 0;
  const cost = def.baseCost * Math.pow(def.costMultiplier, count);
  return Math.floor(cost);
}

function effectText(def) {
  if (def.type === "cpc") return `+${def.cpc} / click`;
  return `+${def.cps} / sec`;
}

function updateComputedRates() {
  let cpc = 1; // base click
  let cps = 0;
  for (const def of UPGRADE_DEFS) {
    const count = gameState.upgradeCounts[def.id] || 0;
    if (def.type === "cpc") cpc += (def.cpc || 0) * count;
    if (def.type === "cps") cps += (def.cps || 0) * count;
  }
  latestComputedCpc = cpc;
  latestComputedCps = cps;
}

function updateUi() {
  dom.cookiesCount.textContent = formatNumber(gameState.cookies);
  dom.cookiesPerClick.textContent = formatNumber(latestComputedCpc);
  dom.cookiesPerSecond.textContent = formatNumber(latestComputedCps);

  for (const def of UPGRADE_DEFS) {
    const ownedEl = /** @type {HTMLElement} */ (document.getElementById(`owned-${def.id}`));
    const priceEl = /** @type {HTMLElement} */ (document.getElementById(`price-${def.id}`));
    const buyBtn = /** @type {HTMLButtonElement} */ (document.getElementById(`buy-${def.id}`));
    const effectEl = /** @type {HTMLElement} */ (document.getElementById(`effect-${def.id}`));

    if (ownedEl) ownedEl.textContent = `Owned: ${gameState.upgradeCounts[def.id]}`;
    if (priceEl) priceEl.textContent = `Cost: ${formatNumber(nextCost(def))}`;
    if (effectEl) effectEl.textContent = effectText(def);
    if (buyBtn) buyBtn.disabled = gameState.cookies < nextCost(def);
  }
}

function gameLoop(nowMs) {
  const dtSec = Math.max(0, (nowMs - gameState.lastTickMs) / 1000);
  gameState.lastTickMs = nowMs;

  if (latestComputedCps > 0 && dtSec > 0) {
    addCookies(latestComputedCps * dtSec);
  }

  requestAnimationFrame(gameLoop);
}

function scheduleSave() {
  const now = performance.now();
  if (now - lastSaveMs < SAVE_INTERVAL_MS) return;
  lastSaveMs = now;
  saveSoon();
}

function saveSoon() {
  isSaving = true;
  updateSaveIndicator();
  setTimeout(() => saveNow(), 100); // small debounce for burst updates
}

function saveNow() {
  try {
    const toSave = {
      cookies: gameState.cookies,
      totalCookies: gameState.totalCookies,
      upgradeCounts: gameState.upgradeCounts,
      t: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Save failed", e);
  } finally {
    isSaving = false;
    updateSaveIndicator();
  }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.cookies === "number") gameState.cookies = parsed.cookies;
    if (typeof parsed.totalCookies === "number") gameState.totalCookies = parsed.totalCookies;
    if (parsed.upgradeCounts && typeof parsed.upgradeCounts === "object") {
      for (const def of UPGRADE_DEFS) {
        const v = parsed.upgradeCounts[def.id];
        if (typeof v === "number" && isFinite(v) && v >= 0) {
          gameState.upgradeCounts[def.id] = v;
        }
      }
    }
  } catch (e) {
    console.warn("Load failed", e);
  }
}

function updateSaveIndicator() {
  dom.saveIndicator.classList.toggle("save-indicator--busy", isSaving);
  dom.saveIndicator.classList.toggle("save-indicator--ok", !isSaving);
}

function spawnGainLabel(ev) {
  const amount = `+${formatNumber(latestComputedCpc)}`;
  const span = document.createElement("span");
  span.className = "gain";
  span.textContent = amount;

  const rect = dom.cookieButton.getBoundingClientRect();
  const x = (ev.clientX || (rect.left + rect.width / 2));
  const y = (ev.clientY || (rect.top + rect.height / 2));

  span.style.left = `${x}px`;
  span.style.top = `${y}px`;

  document.body.appendChild(span);
  setTimeout(() => span.remove(), 1000);
}

function formatNumber(n) {
  if (!isFinite(n)) return "0";
  if (n < 1000) return n % 1 === 0 ? String(n) : n.toFixed(1);
  const units = ["K","M","B","T","Qa","Qi","Sx","Sp","Oc","No","Dc"];
  let unitIndex = -1;
  let value = n;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)}${units[unitIndex] || ""}`;
}

// Boot
initialize();