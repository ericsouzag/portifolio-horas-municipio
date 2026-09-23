import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

/** true enquanto o config.js ainda não recebeu os dados do Firebase */
export const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey === "COLE_AQUI";

export const app = DEMO ? null : initializeApp(firebaseConfig);
export const db = DEMO ? null : getFirestore(app);

export const CATEGORIAS = [
  "Design gráfico", "Apresentação", "Material didático", "Documento", "Vídeo", "Site", "Outro",
];

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** "2026-08" -> { name: "Agosto", year: "2026", label: "Agosto 2026" } */
export function monthInfo(ym) {
  const [y, m] = String(ym || "").split("-");
  const name = MESES[Number(m) - 1] || "Sem mês";
  return { name, year: y || "", label: y ? `${name} ${y}` : name };
}

/** Lista de meses para o seletor do painel: 2 à frente e 18 para trás, mais recentes primeiro */
export function monthOptions(extra = []) {
  const out = new Set(extra.filter(Boolean));
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 2);
  for (let i = 0; i < 21; i++) {
    out.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return [...out].sort().reverse();
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Escapa texto para inserir com segurança em innerHTML */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** 150 -> "2h30" | 120 -> "2h" | 45 -> "45min" | 0 -> "0h" */
export function fmtMin(total) {
  const t = Math.max(0, Math.round(Number(total) || 0));
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}min`;
  return "0h";
}

export const minutesOf = (s) => (Number(s.hours) || 0) * 60 + (Number(s.minutes) || 0);

export const isHttp = (u) => /^https?:\/\//i.test(u || "");

/** Link que abre como vídeo (botão de play) em vez de "Abrir material" */
export const isVideo = (s) => isHttp(s.link) && (s.category === "Vídeo" || /youtu\.?be|vimeo\.com/i.test(s.link));

/** "Paula, Ismara e Flávia" -> ["Paula", "Ismara", "Flávia"] (para contar solicitantes) */
export const splitNames = (txt) => String(txt || "")
  .split(/\s*(?:,|;|\/|\be\b)\s*/i)
  .map((n) => n.trim())
  .filter(Boolean);

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
