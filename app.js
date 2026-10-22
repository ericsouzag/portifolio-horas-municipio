import {
  db, app, DEMO, esc, fmtMin, minutesOf, monthInfo, isHttp, isVideo, splitNames, plural,
  SCHOOLS, schoolOf, schoolInfo, schoolOfLogin, summarize,
} from "./common.js";
import { SITE } from "./config.js";
import {
  collection, query, where, getDocs, doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
let services = [];        // trabalhos da escola aberta
let school = null;        // escola aberta (null = página inicial)
let user = null;          // conta logada (escola ou professor)
let fbAuth = null;        // módulo de login do Firebase
let auth = null;
const demoUnlocked = new Set();

$("#who").textContent = SITE.teacherName;
if (DEMO) $("#demo").hidden = false;

const isAdminUser = () => !!user?.email && user.email.toLowerCase() === SITE.adminEmail.toLowerCase();
const canSee = (id) => (DEMO ? demoUnlocked.has(id) : isAdminUser() || schoolOfLogin(user?.email) === id);
const colorClass = (id) => `c${Math.max(0, SCHOOLS.findIndex((x) => x.id === id)) % 4}`;

async function loadSchool(id) {
  if (DEMO) {
    const { DEMO_SERVICES } = await import("./demo.js");
    return DEMO_SERVICES.filter((s) => schoolOf(s) === id);
  }
  const snap = await getDocs(query(collection(db, "services"), where("school", "==", id), where("published", "==", true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadSummary() {
  if (DEMO) return summarize((await import("./demo.js")).DEMO_SERVICES);
  const snap = await getDoc(doc(db, "stats", "summary"));
  return snap.exists() ? snap.data() : summarize([]);
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

  $("#monthnav").innerHTML = groups.slice(0, 3).map((g) =>
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

/* ------------------------------ Página inicial ------------------------------ */
const LOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const OPEN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.9-1"/></svg>`;
const ARROW = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
let summary = null;

function renderCards() {
  const data = summary?.schools || {};
  $("#schoolcards").innerHTML = SCHOOLS.map((sc) => {
    const d = data[sc.id] || { minutes: 0, count: 0 };
    const open = canSee(sc.id);
    return `<button type="button" class="school-card ${colorClass(sc.id)}" data-school="${esc(sc.id)}">
      <span class="sc-top"><span class="sc-dot" aria-hidden="true"></span><span class="sc-lock">${open ? OPEN + " Acesso liberado" : LOCK + " Com senha"}</span></span>
      <span class="sc-name">${esc(sc.name)}</span>
      <span class="sc-nums"><strong>${fmtMin(d.minutes)}</strong><span>${plural(d.count, "trabalho", "trabalhos")}</span></span>
      <span class="sc-cta">Ver trabalhos ${ARROW}</span>
    </button>`;
  }).join("");
}

function renderPanorama() {
  const data = summary?.schools || {};
  const months = [...new Set(SCHOOLS.flatMap((sc) => Object.keys(data[sc.id]?.months || {})))].sort().reverse();
  const max = Math.max(1, ...SCHOOLS.flatMap((sc) => Object.values(data[sc.id]?.months || {})));
  $("#grandtotal").textContent = fmtMin(SCHOOLS.reduce((t, sc) => t + (data[sc.id]?.minutes || 0), 0));
  $("#legend").innerHTML = SCHOOLS.map((sc) =>
    `<span class="${colorClass(sc.id)}"><span class="sc-dot" aria-hidden="true"></span>${esc(sc.short || sc.name)} <strong>${fmtMin(data[sc.id]?.minutes || 0)}</strong></span>`).join("");
  if (!months.length) {
    $("#panrows").innerHTML = `<p class="state">Nenhuma hora registrada ainda.</p>`;
    return;
  }
  $("#panrows").innerHTML = months.map((m) => {
    const info = monthInfo(m);
    const total = SCHOOLS.reduce((t, sc) => t + (data[sc.id]?.months?.[m] || 0), 0);
    return `<div class="pan-row">
      <div class="pan-month"><strong>${esc(info.name)}</strong><span>${esc(info.year)}</span></div>
      <div class="pan-bars">${SCHOOLS.map((sc) => {
        const v = data[sc.id]?.months?.[m] || 0;
        return `<div class="pan-bar ${colorClass(sc.id)}">
          <span class="pan-label">${esc(sc.short || sc.name)}</span>
          <span class="bar-track"><span style="width:${(v / max) * 100}%"></span></span>
          <strong>${fmtMin(v)}</strong>
        </div>`;
      }).join("")}</div>
      <div class="pan-total"><strong>${fmtMin(total)}</strong><span>no mês</span></div>
    </div>`;
  }).join("");
}

async function showOverview() {
  school = null;
  services = [];
  $("#overview").hidden = false;
  $("#schoolview").hidden = true;
  $("#back").hidden = $("#leave").hidden = $("#navsep").hidden = true;
  $("#monthnav").innerHTML = "";
  $("#where").textContent = SITE.role;
  $("#footnote").textContent = "Registro de serviços prestados em compensação de horas";
  document.title = `Trabalhos feitos para as escolas · ${SITE.teacherName}`;
  renderCards();
  if (!summary) {
    try { summary = await loadSummary(); }
    catch (e) { console.error(e); summary = summarize([]); }
    renderCards();
  }
  renderPanorama();
}

async function showSchool(id) {
  const info = schoolInfo(id);
  school = id;
  $("#overview").hidden = true;
  $("#schoolview").hidden = false;
  $("#back").hidden = $("#navsep").hidden = false;
  $("#leave").hidden = !(schoolOfLogin(user?.email) === id || (DEMO && demoUnlocked.has(id)));
  $("#where").textContent = `${SITE.role} · ${info.name}`;
  $("#footnote").textContent = `Registro de serviços prestados em compensação de horas · ${info.name}`;
  $("#schooltitle").textContent = info.name;
  document.title = `${info.short || info.name} · Trabalhos de ${SITE.teacherName}`;
  $("#months").innerHTML = `<p class="state">Carregando…</p>`;
  $("#tally").innerHTML = "";
  window.scrollTo(0, 0);
  try {
    services = await loadSchool(id);
  } catch (e) {
    console.error(e);
    $("#months").innerHTML = `<p class="state">Não foi possível carregar os trabalhos desta escola (${esc(e.code || e.message)}). Volte às escolas e entre de novo com a senha.</p>`;
    return;
  }
  if (school !== id) return;
  const groups = byMonth(services);
  renderTally(groups, services);
  renderMonths(groups);
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}

/* ------------------------------ Navegação ------------------------------ */
function go(id) {
  const url = new URL(location.href);
  url.hash = "";
  if (id) url.searchParams.set("escola", id); else url.searchParams.delete("escola");
  history.pushState(null, "", url);
  route();
}

function route() {
  const id = new URLSearchParams(location.search).get("escola");
  const valid = SCHOOLS.some((x) => x.id === id);
  if (valid && canSee(id)) return showSchool(id);
  showOverview();
  if (valid) askPassword(id);
}

window.addEventListener("popstate", route);
$("#back").addEventListener("click", (e) => { e.preventDefault(); go(null); });
$("#schoolcards").addEventListener("click", (e) => {
  const b = e.target.closest("[data-school]");
  if (!b) return;
  if (canSee(b.dataset.school)) go(b.dataset.school);
  else askPassword(b.dataset.school);
});
$("#leave").addEventListener("click", async () => {
  if (DEMO) demoUnlocked.clear();
  else if (user && !isAdminUser()) await fbAuth.signOut(auth);
  go(null);
});

/* ------------------------------ Senha ------------------------------ */
let pwSchool = null;

function askPassword(id) {
  pwSchool = id;
  $("#pwschool").textContent = `Digite a senha da ${schoolInfo(id).name} para ver os trabalhos.`;
  $("#pw").value = "";
  $("#pwmsg").hidden = true;
  if (!$("#pwdlg").open) $("#pwdlg").showModal();
  $("#pw").focus();
}

$("#pwcancel").addEventListener("click", () => {
  $("#pwdlg").close();
  if (new URLSearchParams(location.search).has("escola")) go(null);
});

$("#pwform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("#pw").value;
  const msg = $("#pwmsg");
  if (!pw) { msg.textContent = "Digite a senha."; msg.hidden = false; return; }
  const id = pwSchool;
  $("#pwok").disabled = true;
  try {
    if (DEMO) {
      demoUnlocked.add(id);
    } else {
      if (user && !isAdminUser()) await fbAuth.signOut(auth);
      const cred = await fbAuth.signInWithEmailAndPassword(auth, schoolInfo(id).login, pw);
      user = cred.user;
    }
    $("#pwdlg").close();
    go(id);
  } catch (err) {
    const c = err.code || "";
    msg.textContent =
      /invalid-credential|wrong-password|user-not-found|invalid-login/.test(c) ? "Senha incorreta. Confira e tente de novo." :
      c.includes("too-many-requests") ? "Muitas tentativas seguidas. Espere alguns minutos e tente de novo." :
      c.includes("operation-not-allowed") ? "O acesso por senha ainda não foi ativado no Firebase (SETUP.md, passo 9)." :
      c.includes("network") ? "Sem conexão com a internet. Verifique e tente de novo." :
      `Não foi possível entrar (${c || err.message}).`;
    msg.hidden = false;
    $("#pw").select();
  } finally {
    $("#pwok").disabled = false;
  }
});

/* ------------------------------ Início ------------------------------ */
if (DEMO) {
  route();
} else {
  fbAuth = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  auth = fbAuth.getAuth(app);
  let first = true;
  fbAuth.onAuthStateChanged(auth, (u) => {
    user = u;
    if (first) { first = false; route(); }
    else if (!school) renderCards();
  });
}
