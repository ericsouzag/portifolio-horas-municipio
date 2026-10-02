import {
  db, DEMO, esc, fmtMin, minutesOf, monthInfo, isHttp, isVideo, splitNames, plural, SCHOOLS, schoolOf, schoolInfo,
} from "./common.js";
import { SITE } from "./config.js";
import {
  collection, query, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
let services = [];
let school = SCHOOLS[0].id;

$("#who").textContent = SITE.teacherName;

async function load() {
  if (DEMO) {
    $("#demo").hidden = false;
    const { DEMO_SERVICES } = await import("./demo.js");
    return DEMO_SERVICES;
  }
  const snap = await getDocs(query(collection(db, "services"), where("published", "==", true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Agrupa por mês, do mais recente para o mais antigo */
function byMonth(list) {
  const map = new Map();
  for (const s of list) {
    const k = s.month || "";
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(s);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, items]) => ({
      month,
      items: items.sort((a, b) => minutesOf(b) - minutesOf(a) || (a.title || "").localeCompare(b.title || "")),
      minutes: items.reduce((t, s) => t + minutesOf(s), 0),
    }));
}

const anchor = (month) => `mes-${month || "sem-mes"}`;

/* ------------------------------ Topo ------------------------------ */
function renderTally(groups, list) {
  const total = list.reduce((t, s) => t + minutesOf(s), 0);
  const max = Math.max(1, ...groups.map((g) => g.minutes));
  const people = new Set(list.flatMap((s) => splitNames(s.requester).map((n) => n.toLowerCase())));

  $("#tally").innerHTML = `
    <span class="tally-label">Horas totais trabalhadas</span>
    <span class="tally-big">${fmtMin(total)}</span>
    <div class="bars">
      ${groups.map((g) => `
        <a class="bar" href="#${anchor(g.month)}">
          <span>${esc(monthInfo(g.month).name)}</span>
          <span class="bar-track"><span style="width:${(g.minutes / max) * 100}%"></span></span>
          <strong>${fmtMin(g.minutes)}</strong>
        </a>`).join("")}
    </div>
    <div class="stats">
      <div><strong>${list.length}</strong><span>${list.length === 1 ? "trabalho" : "trabalhos"}</span></div>
      <div><strong>${people.size}</strong><span>${people.size === 1 ? "solicitante" : "solicitantes"}</span></div>
      <div><strong>${groups.length}</strong><span>${groups.length === 1 ? "mês" : "meses"}</span></div>
    </div>`;

  $("#monthnav").innerHTML = groups.slice(0, 4).map((g) =>
    `<a href="#${anchor(g.month)}">${esc(monthInfo(g.month).name)}</a>`).join("");
}

/* ------------------------------ Trabalhos ------------------------------ */
const PLAY = `<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const FILE = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>`;

function media(s) {
  const thumbs = s.thumbs || [];
  const count = Math.max(s.imageCount || 0, thumbs.length);
  const link = isHttp(s.link) ? esc(s.link) : "";
  const title = esc(s.title);

  // Vídeo: capa (primeira imagem) com botão de play
  if (isVideo(s)) {
    return `<div class="media media-video">
      <a class="video" href="${link}" target="_blank" rel="noopener noreferrer" aria-label="Assistir ao vídeo: ${title}">
        ${thumbs[0] ? `<img src="${thumbs[0]}" alt="" loading="lazy">` : ""}
        <span class="play">${PLAY}</span>
        <span class="video-cap">Assistir ao vídeo</span>
      </a></div>`;
  }

  const tiles = thumbs.map((src, i) => {
    const more = i === thumbs.length - 1 && count > thumbs.length ? count - thumbs.length : 0;
    return `<button type="button" class="tile" data-open="${esc(s.id)}" data-i="${i}" aria-label="Ampliar imagem ${i + 1} de ${count}">
      <img src="${src}" alt="Imagem ${i + 1} do trabalho ${title}" loading="lazy">
      ${more ? `<span class="more">+${more} ${more === 1 ? "imagem" : "imagens"}</span>` : ""}
    </button>`;
  });

  if (link) {
    tiles.push(`<a class="tile tile-file" href="${link}" target="_blank" rel="noopener noreferrer">
      ${FILE}<span><strong>Abrir material</strong><small>${esc(new URL(s.link).hostname.replace(/^www\./, ""))}</small></span></a>`);
  }
  if (!tiles.length) return "";
  return `<div class="media cols-${Math.min(tiles.length, 4)}">${tiles.join("")}</div>`;
}

function article(s) {
  return `
    <article class="work">
      <dl class="work-meta">
        <div><dt>Solicitado por</dt><dd class="who">${esc(s.requester || "Não informado")}</dd></div>
        <div><dt>Tempo de execução</dt><dd class="time">${fmtMin(minutesOf(s))}</dd></div>
        ${s.category ? `<div><dt>Categoria</dt><dd>${esc(s.category)}</dd></div>` : ""}
      </dl>
      <div class="work-body">
        <h3>${esc(s.title)}</h3>
        ${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}
        ${media(s)}
      </div>
    </article>`;
}

function renderMonths(groups) {
  if (!groups.length) {
    $("#months").innerHTML = `<p class="state">Nenhum trabalho publicado nesta escola ainda.</p>`;
    return;
  }
  $("#months").innerHTML = groups.map((g) => {
    const m = monthInfo(g.month);
    return `
    <section class="month" id="${anchor(g.month)}">
      <div class="month-head">
        <h2>${esc(m.name)} <span>${esc(m.year)}</span></h2>
        <div class="month-count"><span>${plural(g.items.length, "trabalho", "trabalhos")}</span><strong>${fmtMin(g.minutes)}</strong><span>no mês</span></div>
      </div>
      ${g.items.map(article).join(`<hr class="work-sep">`)}
    </section>`;
  }).join("");
}

/* ------------------------------ Galeria ------------------------------ */
const lb = { list: [], i: 0, s: null };
const fullCache = new Map();

async function fullImages(s) {
  if (DEMO) return s.images || [];
  if (fullCache.has(s.id)) return fullCache.get(s.id);
  const snap = await getDocs(collection(db, "services", s.id, "images"));
  const list = snap.docs.map((d) => d.data()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((d) => d.data);
  fullCache.set(s.id, list);
  return list;
}

function drawLb() {
  const n = lb.list.length;
  $("#lbimg").src = lb.list[lb.i];
  $("#lbimg").alt = `Imagem ${lb.i + 1} de ${n} do trabalho ${lb.s.title}`;
  $("#lbpos").textContent = `${lb.i + 1} de ${n}`;
  $("#lbprev").hidden = $("#lbnext").hidden = n < 2;
  $("#lbthumbs").innerHTML = n < 2 ? "" : lb.list.map((src, k) =>
    `<button type="button" data-k="${k}" class="${k === lb.i ? "on" : ""}" aria-label="Ver imagem ${k + 1}"${k === lb.i ? ' aria-current="true"' : ""}><img src="${src}" alt=""></button>`).join("");
}

async function openLb(id, i) {
  const s = services.find((x) => x.id === id);
  if (!s) return;
  lb.s = s;
  lb.list = s.thumbs || [];
  lb.i = i;
  $("#lbtitle").textContent = s.title;
  $("#lbmeta").textContent = [s.requester, fmtMin(minutesOf(s)), monthInfo(s.month).label].filter(Boolean).join(" · ");
  drawLb();
  $("#lb").showModal();
  try {
    const full = await fullImages(s);
    if (full.length && lb.s === s) { lb.list = full; drawLb(); }
  } catch (e) { console.error(e); }
}

const step = (d) => { const n = lb.list.length; lb.i = (lb.i + d + n) % n; drawLb(); };
$("#lbprev").addEventListener("click", () => step(-1));
$("#lbnext").addEventListener("click", () => step(1));
$("#lbclose").addEventListener("click", () => $("#lb").close());
$("#lb").addEventListener("click", (e) => { if (e.target.id === "lb") $("#lb").close(); });
$("#lb").addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") step(-1);
  if (e.key === "ArrowRight") step(1);
});
$("#lbthumbs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-k]");
  if (b) { lb.i = Number(b.dataset.k); drawLb(); }
});
$("#months").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]");
  if (b) openLb(b.dataset.open, Number(b.dataset.i));
});

/* ------------------------------ Escola ------------------------------ */
function renderSchoolTabs() {
  $("#schooltabs").innerHTML = SCHOOLS.map((sc) => {
    const min = services.filter((s) => schoolOf(s) === sc.id).reduce((t, s) => t + minutesOf(s), 0);
    const on = sc.id === school;
    return `<button type="button" class="school-tab${on ? " on" : ""}" data-school="${esc(sc.id)}" aria-pressed="${on}">
      <span class="school-name"><span class="full">${esc(sc.name)}</span><span class="short">${esc(sc.short || sc.name)}</span></span>
      <span class="school-hours">${fmtMin(min)}</span>
    </button>`;
  }).join("");
}

function render() {
  const info = schoolInfo(school);
  $("#where").textContent = `${SITE.role} · ${info.name}`;
  $("#footnote").textContent = `Registro de serviços prestados em compensação de horas · ${info.name}`;
  document.title = `${info.short || info.name} · Trabalhos de ${SITE.teacherName}`;
  const list = services.filter((s) => schoolOf(s) === school);
  const groups = byMonth(list);
  renderSchoolTabs();
  renderTally(groups, list);
  renderMonths(groups);
}

$("#schooltabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-school]");
  if (!b || b.dataset.school === school) return;
  school = b.dataset.school;
  try { localStorage.setItem("escola", school); } catch {}
  const url = new URL(location.href);
  url.searchParams.set("escola", school);
  url.hash = "";
  history.replaceState(null, "", url);
  render();
});

/* ------------------------------ Início ------------------------------ */
(async () => {
  try {
    services = await load();
  } catch (e) {
    console.error(e);
    $("#months").innerHTML = `<p class="state">Não foi possível carregar os trabalhos agora. Recarregue a página em instantes.</p>`;
    $("#tally").hidden = true;
    return;
  }
  const fromUrl = new URLSearchParams(location.search).get("escola");
  let saved = null;
  try { saved = localStorage.getItem("escola"); } catch {}
  school = [fromUrl, saved].find((id) => SCHOOLS.some((x) => x.id === id)) || SCHOOLS[0].id;
  render();
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
})();
