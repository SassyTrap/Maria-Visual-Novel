"use strict";

/**
 * Omni Prompt — Omni‑Man GIF matcher
 * - Matches a user prompt to a fitting Omni‑Man GIF every time
 * - Uses Tenor API if key present, otherwise curated local list or user uploads
 * - Lightweight semantic scoring via keyword synonyms
 */

/** DOM */
const dom = {
  promptInput: /** @type {HTMLInputElement} */ (document.getElementById("promptInput")),
  goButton: /** @type {HTMLButtonElement} */ (document.getElementById("goButton")),
  suggestions: /** @type {HTMLDivElement} */ (document.getElementById("suggestions")),
  resultMedia: /** @type {HTMLDivElement} */ (document.getElementById("resultMedia")),
  resultShimmer: /** @type {HTMLDivElement} */ (document.getElementById("resultShimmer")),
  gifImage: /** @type {HTMLImageElement} */ (document.getElementById("gifImage")),
  matchLabel: /** @type {HTMLSpanElement} */ (document.getElementById("matchLabel")),
  downloadBtn: /** @type {HTMLButtonElement} */ (document.getElementById("downloadBtn")),
  uploadBtn: /** @type {HTMLButtonElement} */ (document.getElementById("uploadBtn")),
  gifPicker: /** @type {HTMLInputElement} */ (document.getElementById("gifPicker")),
};

/** Config */
const TENOR_API_KEY = (window.OMNI_TENOR_KEY || "").trim();
const TENOR_CLIENT_KEY = "omni-prompt-tool";
const TENOR_ENDPOINT = "https://tenor.googleapis.com/v2/search";
// Add Giphy provider for real-time fetching too
const GIPHY_API_KEY = (window.OMNI_GIPHY_KEY || "").trim();
const GIPHY_ENDPOINT = "https://api.giphy.com/v1/gifs/search";

/** Curated Omni‑Man GIFs (fallback + for keyword matching) */
/** @type {{url: string, title: string, tags: string[]}[]} */
let CURATED = [
  { url: "assets/omni/think-mark.gif", title: "Think, Mark", tags: ["think", "mark", "lecture", "explain", "logic", "disappointed", "serious", "talk"] },
  { url: "assets/omni/angry.gif", title: "Angry Omni‑Man", tags: ["angry", "rage", "furious", "mad", "blood", "fight", "violence", "intense"] },
  { url: "assets/omni/smirk.gif", title: "Smug Smirk", tags: ["smug", "smirk", "confident", "cocky", "superior", "arrogant", "calm"] },
  { url: "assets/omni/proud.gif", title: "Proud but Stern", tags: ["proud", "stern", "father", "mentor", "pride", "disappointed", "serious"] },
  { url: "assets/omni/menacing.gif", title: "Menacing Glow", tags: ["menacing", "glow", "eyes", "threat", "ominous", "power", "danger"] },
  { url: "assets/omni/wipe.gif", title: "Wipe Face Blood", tags: ["wipe", "blood", "battle", "calm", "cold", "ruthless", "post fight"] },
  { url: "assets/omni/fly.gif", title: "Fly Off", tags: ["fly", "leave", "done", "goodbye", "exit", "swift", "fast"] },
  { url: "assets/omni/nod.gif", title: "Approving Nod", tags: ["nod", "approve", "ok", "respect", "acknowledge", "agree"] },
  { url: "assets/omni/smile.gif", title: "Soft Smile", tags: ["smile", "soft", "warm", "friendly", "calm", "gentle"] },
  { url: "assets/omni/punch.gif", title: "Brutal Hit", tags: ["punch", "hit", "violent", "brutal", "fight", "destroy", "attack"] },
];

/** User uploaded GIFs with inferred tags */
/** @type {{url: string, title: string, tags: string[]}[]} */
let USER_GIFS = [];

/** Simple keyword expansions for better matching */
const SYNONYMS = new Map([
  ["angry", ["mad", "furious", "rage", "wrath", "heated"]],
  ["smug", ["confident", "cocky", "arrogant", "superior"]],
  ["proud", ["pride", "fatherly", "stern"]],
  ["menacing", ["ominous", "threat", "danger", "glow"]],
  ["calm", ["composed", "collected", "stoic"]],
  ["disappointed", ["let down", "sad", "upset"]],
  ["fight", ["battle", "combat", "attack", "punch"]],
  ["leave", ["exit", "goodbye", "fly"]],
  ["approve", ["ok", "agree", "acknowledge", "respect"]],
]);

function expandTerms(words) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const w of words) {
    set.add(w);
    const syns = SYNONYMS.get(w);
    if (syns) for (const s of syns) set.add(s);
  }
  return set;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreGif(prompt, item) {
  const terms = tokenize(prompt);
  const expanded = expandTerms(terms);
  let score = 0;
  for (const tag of item.tags) {
    const t = tag.toLowerCase();
    if (expanded.has(t)) score += 4;
    for (const term of expanded) {
      if (t.includes(term) || term.includes(t)) score += 1;
    }
  }
  const joined = item.title.toLowerCase();
  for (const term of terms) if (joined.includes(term)) score += 2;
  return score;
}

async function searchTenor(prompt) {
  if (!TENOR_API_KEY) return [];
  const q = encodeURIComponent(`omni man ${prompt}`);
  const url = `${TENOR_ENDPOINT}?q=${q}&key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=12&media_filter=gif,mediumgif,tinygif&contentfilter=high`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  /** @type {{url: string, title: string, tags: string[]}[]} */
  const mapped = [];
  if (Array.isArray(data.results)) {
    for (const r of data.results) {
      const mf = r.media_formats || {};
      const gif = mf.gif?.url || mf.mediumgif?.url || mf.tinygif?.url || r.media?.[0]?.gif?.url;
      if (!gif) continue;
      const title = (r.content_description || r.title || "Omni‑Man").trim();
      mapped.push({ url: gif, title, tags: tokenize(`${title} ${prompt} omni man`) });
    }
  }
  return mapped.filter(m => /omni.?man|invincible|nolan/i.test(m.title) || /omni/i.test(m.title));
}

// New: Giphy provider
async function searchGiphy(prompt) {
  if (!GIPHY_API_KEY) return [];
  const q = encodeURIComponent(`omni man ${prompt}`);
  const url = `${GIPHY_ENDPOINT}?api_key=${GIPHY_API_KEY}&q=${q}&limit=12&rating=pg-13&lang=en`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  /** @type {{url: string, title: string, tags: string[]}[]} */
  const mapped = [];
  if (Array.isArray(data.data)) {
    for (const g of data.data) {
      const gif = g.images?.original?.url || g.images?.downsized?.url || g.embed_url;
      if (!gif) continue;
      const title = (g.title || g.slug || "Omni‑Man").replace(/GIF by .*$/i, "").trim();
      // Ensure likely Omni‑Man content by title/slug heuristics
      const ok = /omni.?man|invincible|nolan/i.test(title) || /omni.?man|invincible/i.test(g.slug || "");
      if (!ok) continue;
      mapped.push({ url: gif, title, tags: tokenize(`${title} ${prompt} omni man`) });
    }
  }
  return mapped;
}

// New: combined real-time search across providers
async function searchAllProviders(prompt) {
  const tasks = [searchTenor(prompt), searchGiphy(prompt)];
  const results = await Promise.allSettled(tasks);
  /** @type {{url: string, title: string, tags: string[]}[]} */
  let combined = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      combined = combined.concat(r.value);
    }
  }
  // Deduplicate by URL
  const seen = new Set();
  combined = combined.filter(x => {
    if (seen.has(x.url)) return false;
    seen.add(x.url); return true;
  });
  return combined;
}

function pickBest(prompt, candidates) {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreGif(prompt, c);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  if (bestScore < 3 && candidates !== CURATED) {
    return pickBest(prompt, CURATED);
  }
  return best;
}

function setLoading(loading) {
  document.body.classList.toggle("loading", loading);
}

async function showMatch(prompt) {
  setLoading(true);
  dom.matchLabel.textContent = "Finding the perfect Omni‑Man vibe…";
  try {
    const remote = await searchAllProviders(prompt);
    const pool = (USER_GIFS.length ? USER_GIFS : []).concat(remote.length ? remote : CURATED);
    const best = pickBest(prompt, pool);
    await displayGif(best);
    dom.matchLabel.textContent = best.title;
    dom.downloadBtn.onclick = () => downloadGif(best.url, friendlyFilename(prompt, best.title));
  } catch (e) {
    dom.matchLabel.textContent = "Could not load GIF. Try adding local Omni‑Man GIFs.";
  } finally {
    setLoading(false);
  }
}

async function displayGif(item) {
  return new Promise((resolve, reject) => {
    dom.gifImage.onload = () => resolve(undefined);
    dom.gifImage.onerror = () => reject(new Error("Failed to load GIF"));
    dom.gifImage.src = item.url;
    dom.gifImage.alt = item.title || "Omni‑Man";
  });
}

function friendlyFilename(prompt, title) {
  const base = `${title || "omni-man"} ${prompt || ""}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "omni-man"}.gif`;
}

async function downloadGif(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {}
}

function bindEvents() {
  dom.goButton.addEventListener("click", () => onSubmit());
  dom.promptInput.addEventListener("keydown", ev => {
    if (ev.key === "Enter") onSubmit();
  });
  // Real-time search as you type (debounced)
  dom.promptInput.addEventListener("input", debounce(() => {
    const v = dom.promptInput.value.trim();
    if (v.length >= 2) showMatch(v);
  }, 350));
  dom.suggestions?.addEventListener("click", ev => {
    const target = ev.target;
    if (target instanceof HTMLButtonElement && target.dataset.example) {
      dom.promptInput.value = target.dataset.example;
      onSubmit();
    }
  });
  dom.uploadBtn.addEventListener("click", () => dom.gifPicker.click());
  dom.gifPicker.addEventListener("change", async () => {
    if (!dom.gifPicker.files || dom.gifPicker.files.length === 0) return;
    const added = [];
    for (const file of Array.from(dom.gifPicker.files)) {
      const url = URL.createObjectURL(file);
      const base = file.name.replace(/\.[^.]+$/, "");
      const title = base.replace(/[-_]+/g, " ");
      added.push({ url, title, tags: tokenize(title + " omni man") });
    }
    USER_GIFS = USER_GIFS.concat(added);
    if (dom.promptInput.value.trim()) onSubmit();
  });
}

function onSubmit() {
  const value = dom.promptInput.value.trim();
  if (!value) return;
  showMatch(value);
}

function boot() {
  bindEvents();
  showMatch("think, Mark");
}

boot();

// Small utility: debounce
function debounce(fn, delayMs) {
  let t = 0;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delayMs);
  };
}