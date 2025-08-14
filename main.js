"use strict";

/**
 * Omni Prompt — Omni‑Man GIF matcher
 * - Matches a user prompt to a fitting Omni‑Man GIF every time
 * - Uses Tenor API if key present, otherwise curated local list
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
};

/** Config */
const TENOR_API_KEY = (window.OMNI_TENOR_KEY || "").trim();
const TENOR_CLIENT_KEY = "omni-prompt-tool";
const TENOR_ENDPOINT = "https://tenor.googleapis.com/v2/search";

/** Curated Omni‑Man GIFs (fallback + for keyword matching) */
/** @type {{url: string, title: string, tags: string[]}[]} */
const CURATED = [
  {
    url: "https://media.tenor.com/lkMhn74KpHMAAAAC/omni-man-think-mark.gif",
    title: "Think, Mark",
    tags: ["think", "mark", "lecture", "explain", "logic", "disappointed", "serious", "talk"],
  },
  {
    url: "https://media.tenor.com/3fh0Qb5fVJ0AAAAC/omniman-angry.gif",
    title: "Angry Omni‑Man",
    tags: ["angry", "rage", "furious", "mad", "blood", "fight", "violence", "intense"],
  },
  {
    url: "https://media.tenor.com/sit5zM1q9zoAAAAC/omniman-smirk.gif",
    title: "Smug Smirk",
    tags: ["smug", "smirk", "confident", "cocky", "superior", "arrogant", "calm"],
  },
  {
    url: "https://media.tenor.com/G8tS8QeH5woAAAAC/omni-man-proud.gif",
    title: "Proud but Stern",
    tags: ["proud", "stern", "father", "mentor", "pride", "disappointed", "serious"],
  },
  {
    url: "https://media.tenor.com/9w8eQ5CqXrUAAAAC/omni-man-menacing.gif",
    title: "Menacing Glow",
    tags: ["menacing", "glow", "eyes", "threat", "ominous", "power", "danger"],
  },
  {
    url: "https://media.tenor.com/Vf5q0hO5r9wAAAAC/omni-man-wipe.gif",
    title: "Wipe Face Blood",
    tags: ["wipe", "blood", "battle", "calm", "cold", "ruthless", "post fight"],
  },
  {
    url: "https://media.tenor.com/nP1oQLs5y7MAAAAC/omni-man-fly.gif",
    title: "Fly Off",
    tags: ["fly", "leave", "done", "goodbye", "exit", "swift", "fast"],
  },
  {
    url: "https://media.tenor.com/4Rz0m2O5XqMAAAAC/omni-man-nod.gif",
    title: "Approving Nod",
    tags: ["nod", "approve", "ok", "respect", "acknowledge", "agree"],
  },
  {
    url: "https://media.tenor.com/1V7tw0nR8UoAAAAC/omni-man-smile.gif",
    title: "Soft Smile",
    tags: ["smile", "soft", "warm", "friendly", "calm", "gentle"],
  },
  {
    url: "https://media.tenor.com/4M2JkE9bq24AAAAC/omni-man-violent.gif",
    title: "Brutal Hit",
    tags: ["punch", "hit", "violent", "brutal", "fight", "destroy", "attack"],
  },
];

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
  // Boost exact phrase overlap in title
  const joined = item.title.toLowerCase();
  for (const term of terms) if (joined.includes(term)) score += 2;
  return score;
}

async function searchTenor(prompt) {
  if (!TENOR_API_KEY) return [];
  const q = encodeURIComponent(`omni man ${prompt}`);
  const url = `${TENOR_ENDPOINT}?q=${q}&key=${TENOR_API_KEY}&client_key=${TENOR_CLIENT_KEY}&limit=12&media_filter=gif&contentfilter=high`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  /** @type {{url: string, title: string, tags: string[]}[]} */
  const mapped = [];
  if (Array.isArray(data.results)) {
    for (const r of data.results) {
      const gif = r.media_formats?.gif?.url || r.media[0]?.gif?.url;
      if (!gif) continue;
      const title = (r.content_description || r.title || "Omni‑Man").trim();
      mapped.push({ url: gif, title, tags: tokenize(`${title} ${prompt} omni man`) });
    }
  }
  // Always filter to only omni-man content by title or description heuristic
  return mapped.filter(m => /omni.?man|invincible|nolan/i.test(m.title) || /omni/i.test(m.title));
}

function pickBest(prompt, candidates) {
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreGif(prompt, c);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  // fall back to curated best match if score is poor
  if (bestScore < 3) {
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
    const remote = await searchTenor(prompt);
    const pool = remote.length ? remote : CURATED;
    const best = pickBest(prompt, pool);
    await displayGif(best);
    dom.matchLabel.textContent = best.title;
    dom.downloadBtn.onclick = () => downloadGif(best.url, friendlyFilename(prompt, best.title));
  } catch (e) {
    const best = pickBest(prompt, CURATED);
    await displayGif(best);
    dom.matchLabel.textContent = best.title;
    dom.downloadBtn.onclick = () => downloadGif(best.url, friendlyFilename(prompt, best.title));
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
  dom.suggestions?.addEventListener("click", ev => {
    const target = ev.target;
    if (target instanceof HTMLButtonElement && target.dataset.example) {
      dom.promptInput.value = target.dataset.example;
      onSubmit();
    }
  });
}

function onSubmit() {
  const value = dom.promptInput.value.trim();
  if (!value) return;
  showMatch(value);
}

function boot() {
  bindEvents();
  // initial render from curated to show something nice
  showMatch("think, Mark");
}

boot();