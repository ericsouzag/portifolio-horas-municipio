import {
  db, app, DEMO, CATEGORIAS, esc, fmtMin, minutesOf, monthInfo, monthOptions, currentMonth, isHttp,
  SCHOOLS, schoolOf, schoolInfo,
} from "./common.js";
import { SITE } from "./config.js";
import {
  collection, doc, getDocs, addDoc, setDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);

let editingId = null;
let imgs = [];        // { id?, data }
let removedIds = [];
let cache = [];
let busy = false;
let beforeAi = null;  // texto antes da IA, para o "Desfazer"

document.querySelectorAll(".js-name").forEach((el) => (el.textContent = SITE.teacherName));
document.querySelectorAll(".js-where").forEach((el) => (el.textContent = `${SITE.role} · ${SCHOOLS.map((x) => x.short || x.name).join(" e ")}`));

function say(el, text, kind = "") {
  el.hidden = !text;
  el.textContent = text || "";
  el.className = `msg ${kind}`.trim();
}

/* ------------------------------ Login ------------------------------ */
function showPanel(email) {
  $("#gateview").hidden = true;
  $("#panelview").hidden = false;
  $("#me").textContent = email;
  $("#avatar").textContent = (email || "?")[0];
  // A importação só faz sentido rodando no seu computador, onde a pasta "trabalhos" existe
  $("#importbox").hidden = DEMO || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  loadList();
}

/* ------------------------------ Importação inicial ------------------------------ */
$("#importbtn").addEventListener("click", async () => {
  const box = $("#importbox");
  const btn = $("#importbtn");
  btn.disabled = true;
  try {
    const { DEMO_SERVICES } = await import("./demo.js");
    const existing = new Set(cache.map((s) => (s.title || "").trim().toLowerCase()));
    let done = 0, skipped = 0;
    for (const s of DEMO_SERVICES) {
      if (existing.has(s.title.trim().toLowerCase())) { skipped++; continue; }
      box.firstElementChild.textContent = `Importando "${s.title}"… (${done + skipped + 1} de ${DEMO_SERVICES.length})`;
      const full = [];
      for (const url of s.images) full.push(await shrink(url, 1600, 0.82, 700000));
      const thumbs = [];
      for (const d of full.slice(0, 4)) thumbs.push(await shrink(d, 480, 0.72, 45000));
      const ref = await addDoc(collection(db, "services"), {
        title: s.title, requester: s.requester, category: s.category, month: s.month,
        hours: s.hours, minutes: s.minutes, description: s.description, link: "", school: schoolOf(s),
        thumbs, imageCount: full.length, published: true,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      for (let i = 0; i < full.length; i++) {
        await addDoc(collection(db, "services", ref.id, "images"), { data: full[i], order: i });
      }
      done++;
    }
    box.firstElementChild.textContent = `Pronto: ${done} importado(s)${skipped ? `, ${skipped} já existia(m)` : ""}. Confira no portfólio.`;
    box.className = "msg good";
    btn.hidden = true;
    await loadList();
  } catch (e) {
    console.error(e);
    box.firstElementChild.textContent = `Não foi possível importar: ${e.code || e.message}`;
    box.className = "msg err";
    btn.disabled = false;
  }
});

if (DEMO) {
  say($("#gatemsg"), "O Firebase ainda não foi configurado no config.js. Veja o SETUP.md. Enquanto isso, dá para abrir o painel em modo demonstração (nada é salvo).");
  $("#login").lastChild.textContent = " Ver painel em demonstração";
  $("#login").addEventListener("click", () => showPanel("modo demonstração"));
  $("#logout").addEventListener("click", () => location.reload());
} else {
  const { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } =
    await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  const auth = getAuth(app);

  $("#login").addEventListener("click", async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) {
      if (e.code === "auth/popup-closed-by-user") return;
      say($("#gatemsg"), `Não foi possível entrar (${e.code || e.message}). Se aparecer "unauthorized-domain", autorize o endereço do site no Firebase (SETUP.md, passo 3).`, "err");
    }
  });
  $("#logout").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    const ok = user?.email && user.email.toLowerCase() === SITE.adminEmail.toLowerCase();
    if (user && !ok) {
      say($("#gatemsg"), `A conta ${user.email} não tem permissão para editar este portfólio.`, "err");
      signOut(auth);
    }
    if (ok) showPanel(user.email);
    else { $("#gateview").hidden = false; $("#panelview").hidden = true; }
  });
}

/* ------------------------------ Campos ------------------------------ */
function fillMonths(selected) {
  $("#month").innerHTML = monthOptions([selected]).map((m) =>
    `<option value="${m}">${esc(monthInfo(m).label)}</option>`).join("");
  $("#month").value = selected;
}
$("#school").innerHTML = SCHOOLS.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
const lastSchool = () => { try { return localStorage.getItem("escola-painel"); } catch { return null; } };
$("#school").addEventListener("change", () => { try { localStorage.setItem("escola-painel", $("#school").value); } catch {} });
$("#category").innerHTML = CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join("");

/* ------------------------------ Imagens ------------------------------ */
const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

/** Reduz a imagem e devolve um JPEG em base64 com no máximo maxChars caracteres */
async function shrink(input, maxSide, quality, maxChars) {
  const isUrl = typeof input === "string";
  const src = isUrl ? input : URL.createObjectURL(input);
  const img = await loadImage(src);
  if (!isUrl) URL.revokeObjectURL(src);
  let scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  let q = quality, out = "";
  for (let i = 0; i < 8; i++) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q);
    if (out.length <= maxChars) break;
    q -= 0.1;
    if (q < 0.45) { q = 0.6; scale *= 0.8; }
  }
  return out;
}

async function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    try { imgs.push({ data: await shrink(f, 1600, 0.82, 700000) }); }
    catch { say($("#savemsg"), `Não consegui ler a imagem ${f.name}.`, "err"); }
    renderImgs();
  }
}

$("#files").addEventListener("change", (e) => { const fs = [...e.target.files]; e.target.value = ""; addFiles(fs); });
const drop = $("#drop");
["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); addFiles([...e.dataTransfer.files]); });

function renderImgs() {
  $("#thumbs").innerHTML = imgs.map((im, i) => `
    <div class="thumb">
      <img src="${im.data}" alt="Imagem ${i + 1}">
      <button type="button" class="x" data-rm="${i}" aria-label="Remover imagem ${i + 1}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      ${i === 0 ? `<span class="cover on">Capa</span>` : `<button type="button" class="cover" data-cover="${i}">Usar como capa</button>`}
    </div>`).join("");
  preview();
}
$("#thumbs").addEventListener("click", (e) => {
  const rm = e.target.closest("[data-rm]");
  const cv = e.target.closest("[data-cover]");
  if (rm) {
    const [x] = imgs.splice(Number(rm.dataset.rm), 1);
    if (x.id) removedIds.push(x.id);
  } else if (cv) {
    const [x] = imgs.splice(Number(cv.dataset.cover), 1);
    imgs.unshift(x);
  } else return;
  renderImgs();
});

/* ------------------------------ Prévia ------------------------------ */
const numVal = (id, max) => Math.min(max, Math.max(0, parseInt($(id).value, 10) || 0));

function preview() {
  $("#pvlabel").textContent = `Prévia · ${schoolInfo($("#school").value).short} · ${monthInfo($("#month").value).label}`;
  $("#pvwho").textContent = $("#requester").value.trim() || "—";
  $("#pvtime").textContent = fmtMin(numVal("#hours", 99) * 60 + numVal("#minutes", 59));
  $("#pvcat").textContent = $("#category").value;
  $("#pvtitle").textContent = $("#title").value.trim() || "Título do trabalho";
  $("#pvdesc").textContent = $("#description").value.trim() || "A descrição aparece aqui.";
  $("#pvimgs").innerHTML = imgs.slice(0, 3).map((im) => `<img src="${im.data}" alt="">`).join("");
}
["#school", "#month", "#category", "#title", "#requester", "#hours", "#minutes", "#description"].forEach((id) =>
  $(id).addEventListener("input", preview));

/* ------------------------------ IA ------------------------------ */
const SYSTEM = `Você ajuda um professor a escrever a descrição curta de um trabalho que ele fez para a escola. A descrição aparece num portfólio público, lido pela direção e pelos colegas.
Reescreva o rascunho em português do Brasil, com 2 a 4 frases, linguagem clara, profissional e natural. Prefira começar pelo que foi feito (por exemplo: "Criação de...", "Montagem de...", "Produção de...").
REGRAS OBRIGATÓRIAS:
- Use somente informações presentes no rascunho e nos dados fornecidos. Não invente etapas, ferramentas, quantidades, prazos, pessoas ou resultados.
- Não inclua nomes de alunos nem dados pessoais.
- Não use emojis, listas, títulos, aspas nem markdown.
Responda apenas com o texto da descrição.`;

$("#improve").addEventListener("click", async () => {
  const key = localStorage.getItem("gemini_key");
  const model = localStorage.getItem("gemini_model") || "gemini-2.5-flash-lite";
  const raw = $("#description").value.trim();
  const msg = $("#aimsg");
  if (!key) { $("#aidlg").showModal(); return; }
  if (!raw) { msg.textContent = "Escreva um rascunho da descrição primeiro, do seu jeito."; return; }

  const btn = $("#improve");
  btn.disabled = true;
  msg.textContent = "Melhorando o texto…";
  try {
    const userText = `Título: ${$("#title").value}\nQuem pediu: ${$("#requester").value}\nCategoria: ${$("#category").value}\n\nRascunho do professor:\n${raw}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.4 },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = body?.error?.message || "";
      if (res.status === 429) throw new Error("Limite gratuito da IA atingido. Espere alguns minutos e tente de novo.");
      if (res.status === 404) throw new Error(`Modelo "${model}" não encontrado. Troque o nome do modelo no botão IA, lá no topo.`);
      if (res.status === 400 || res.status === 403) throw new Error(`A chave foi recusada. Confira a chave no botão IA, lá no topo. ${m}`);
      throw new Error(`Erro ${res.status}. ${m}`);
    }
    const txt = (body?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (!txt) throw new Error("A IA não devolveu texto. Tente de novo.");
    beforeAi = raw;
    $("#description").value = txt;
    $("#undo").hidden = false;
    msg.textContent = "Pronto. Revise o texto e ajuste o que quiser antes de publicar.";
    preview();
  } catch (e) {
    msg.textContent = e.message || "Não foi possível melhorar o texto.";
  } finally {
    btn.disabled = false;
  }
});
$("#undo").addEventListener("click", () => {
  if (beforeAi == null) return;
  $("#description").value = beforeAi;
  beforeAi = null;
  $("#undo").hidden = true;
  $("#aimsg").textContent = "Texto original de volta.";
  preview();
});

$("#openai").addEventListener("click", () => {
  $("#gkey").value = localStorage.getItem("gemini_key") || "";
  $("#gmodel").value = localStorage.getItem("gemini_model") || "";
  say($("#keymsg"), "");
  $("#aidlg").showModal();
});
$("#savekey").addEventListener("click", () => {
  const k = $("#gkey").value.trim();
  if (!k) return say($("#keymsg"), "Cole a chave antes de salvar.", "err");
  localStorage.setItem("gemini_key", k);
  const m = $("#gmodel").value.trim();
  m ? localStorage.setItem("gemini_model", m) : localStorage.removeItem("gemini_model");
  say($("#keymsg"), "Salvo neste navegador. Já pode usar o botão Melhorar texto.", "good");
});
$("#clearkey").addEventListener("click", () => {
  localStorage.removeItem("gemini_key");
  $("#gkey").value = "";
  say($("#keymsg"), "Chave apagada deste navegador.", "good");
});

/* ------------------------------ Formulário ------------------------------ */
function resetForm() {
  editingId = null; imgs = []; removedIds = []; beforeAi = null;
  ["#title", "#requester", "#description", "#link"].forEach((id) => ($(id).value = ""));
  $("#hours").value = 0; $("#minutes").value = 0;
  $("#category").value = CATEGORIAS[0];
  fillMonths(currentMonth());
  $("#school").value = schoolInfo(lastSchool()).id;
  $("#undo").hidden = true;
  $("#aimsg").textContent = "Evite nomes de alunos ou dados pessoais. O portfólio é público.";
  $("#formtitle").textContent = "Novo trabalho";
  $("#cancel").hidden = true;
  renderImgs();
}
$("#cancel").addEventListener("click", () => { resetForm(); say($("#savemsg"), ""); });

async function edit(id) {
  const s = cache.find((x) => x.id === id);
  if (!s) return;
  resetForm();
  editingId = id;
  $("#title").value = s.title || "";
  $("#requester").value = s.requester || "";
  $("#description").value = s.description || "";
  $("#link").value = s.link || "";
  $("#hours").value = s.hours || 0;
  $("#minutes").value = s.minutes || 0;
  $("#category").value = CATEGORIAS.includes(s.category) ? s.category : "Outro";
  fillMonths(s.month || currentMonth());
  $("#school").value = schoolOf(s);
  $("#formtitle").textContent = `Editando: ${s.title}`;
  $("#cancel").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (DEMO) { imgs = (s.images || []).map((data) => ({ data })); renderImgs(); return; }
  say($("#savemsg"), "Carregando imagens…");
  try {
    const snap = await getDocs(collection(db, "services", id, "images"));
    imgs = snap.docs.map((d) => ({ id: d.id, data: d.data().data, order: d.data().order ?? 0 }))
      .sort((a, b) => a.order - b.order);
    say($("#savemsg"), "");
  } catch (e) {
    say($("#savemsg"), `Não consegui carregar as imagens: ${e.code || e.message}`, "err");
  }
  renderImgs();
}

async function save(publish) {
  if (busy) return;
  const msg = $("#savemsg");
  const title = $("#title").value.trim();
  const hours = numVal("#hours", 99);
  const minutes = numVal("#minutes", 59);
  const link = $("#link").value.trim();
  const description = $("#description").value.trim();

  if (!title) return say(msg, "Preencha o título do trabalho.", "err");
  if (link && !isHttp(link)) return say(msg, "O link precisa começar com https://", "err");
  if (publish && hours * 60 + minutes === 0) return say(msg, "Informe o tempo gasto antes de publicar.", "err");
  if (publish && !description) return say(msg, "Escreva a descrição antes de publicar.", "err");
  if (DEMO) return say(msg, "Modo demonstração: nada foi salvo. Configure o Firebase no config.js para publicar de verdade.", "err");

  busy = true;
  ["#publish", "#draft"].forEach((b) => ($(b).disabled = true));
  say(msg, "Salvando… (com muitas imagens pode levar alguns segundos)");
  try {
    const thumbs = [];
    for (const im of imgs.slice(0, 4)) thumbs.push(await shrink(im.data, 480, 0.72, 45000));
    const data = {
      title, hours, minutes, link, description,
      requester: $("#requester").value.trim(),
      category: $("#category").value,
      month: $("#month").value,
      school: $("#school").value,
      thumbs,
      imageCount: imgs.length,
      published: publish,
      updatedAt: serverTimestamp(),
    };
    let id = editingId;
    if (id) await setDoc(doc(db, "services", id), data);
    else { const ref = await addDoc(collection(db, "services"), { ...data, createdAt: serverTimestamp() }); id = ref.id; }

    for (const rid of removedIds) await deleteDoc(doc(db, "services", id, "images", rid));
    for (let i = 0; i < imgs.length; i++) {
      const im = imgs[i];
      if (im.id) await setDoc(doc(db, "services", id, "images", im.id), { order: i }, { merge: true });
      else { const r = await addDoc(collection(db, "services", id, "images"), { data: im.data, order: i }); im.id = r.id; }
    }
    const label = `${schoolInfo(data.school).short} · ${monthInfo(data.month).label}`;
    resetForm();
    say(msg, publish ? `Publicado em ${label}. Já aparece no portfólio.` : "Rascunho salvo. Ele não aparece no portfólio até você publicar.", "good");
    await loadList();
  } catch (e) {
    console.error(e);
    const hint = e.code === "permission-denied" ? " Confira se o e-mail nas regras do Firestore é o mesmo do config.js (SETUP.md, passo 5)." : "";
    say(msg, `Não foi possível salvar: ${e.code || e.message}.${hint}`, "err");
  } finally {
    busy = false;
    ["#publish", "#draft"].forEach((b) => ($(b).disabled = false));
  }
}
$("#publish").addEventListener("click", () => save(true));
$("#draft").addEventListener("click", () => save(false));

/* ------------------------------ Lista ------------------------------ */
const EDIT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
const TRASH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>`;

async function loadList() {
  try {
    if (DEMO) cache = (await import("./demo.js")).DEMO_SERVICES;
    else cache = (await getDocs(collection(db, "services"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    $("#list").innerHTML = `<li class="list-empty">Não foi possível carregar a lista (${esc(e.code || e.message)}).</li>`;
    return;
  }
  cache.sort((a, b) => SCHOOLS.findIndex((x) => x.id === schoolOf(a)) - SCHOOLS.findIndex((x) => x.id === schoolOf(b)) || (b.month || "").localeCompare(a.month || "") || (a.title || "").localeCompare(b.title || ""));
  const pub = cache.filter((s) => s.published);
  $("#listlabel").textContent = `Publicadas: ${SCHOOLS.map((x) => `${x.short} ${fmtMin(pub.filter((s) => schoolOf(s) === x.id).reduce((t, s) => t + minutesOf(s), 0))}`).join(" · ")}`;
  $("#list").innerHTML = cache.length ? cache.map((s) => `
    <li>
      <div class="info">
        <strong>${esc(s.title)}</strong>
        <span>${esc([schoolInfo(schoolOf(s)).short, monthInfo(s.month).name, s.requester, fmtMin(minutesOf(s))].filter(Boolean).join(" · "))}</span>
        ${s.published ? "" : `<span class="draft">Rascunho</span>`}
      </div>
      <button type="button" class="icon-btn" data-edit="${esc(s.id)}" aria-label="Editar ${esc(s.title)}">${EDIT}</button>
      <button type="button" class="icon-btn danger" data-del="${esc(s.id)}" aria-label="Excluir ${esc(s.title)}">${TRASH}</button>
    </li>`).join("") : `<li class="list-empty">Nenhum trabalho cadastrado ainda. Use o formulário ao lado.</li>`;
}

$("#list").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  if (ed) return edit(ed.dataset.edit);
  if (!del) return;
  const s = cache.find((x) => x.id === del.dataset.del);
  if (!s || !confirm(`Excluir "${s.title}" e todas as imagens? Isso não pode ser desfeito.`)) return;
  if (DEMO) return say($("#savemsg"), "Modo demonstração: nada foi excluído.", "err");
  try {
    const im = await getDocs(collection(db, "services", s.id, "images"));
    for (const d of im.docs) await deleteDoc(d.ref);
    await deleteDoc(doc(db, "services", s.id));
    if (editingId === s.id) resetForm();
    say($("#savemsg"), `"${s.title}" foi excluído.`, "good");
    loadList();
  } catch (err) {
    say($("#savemsg"), `Não foi possível excluir: ${err.code || err.message}`, "err");
  }
});

resetForm();
