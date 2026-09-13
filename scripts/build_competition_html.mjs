// Pre-renders the competition list into the static index.html pages so the
// content is visible to search engines and no-JS clients. app.js re-renders
// the same list on load (adding filters and live watch badges), so this output
// is a hydration baseline — it intentionally omits the daily-changing watch
// status. competitions.json remains the single source of truth; this runs at
// deploy time (see .github/workflows/deploy-pages.yml), nothing is committed.

import { readFileSync, writeFileSync } from "node:fs";

const DATA_FILE = "competitions/data/competitions.json";
const TARGETS = [
  { file: "competitions/index.html", lang: "en" },
  { file: "competitions/jp/index.html", lang: "ja" },
];

const START = "<!-- BUILD:competitions:start -->";
const END = "<!-- BUILD:competitions:end -->";

const t = {
  en: {
    labels: { eligibility: "Eligibility", deadline: "Deadline", entryFee: "Entry Fee", difficulty: "Difficulty" },
    notesHeading: "Notes",
    officialSite: "Official Site",
    uncategorized: "Uncategorized",
    unnamed: "Untitled",
    unknown: "Unknown",
    officialReference: "See official website for details.",
    eligibility: {
      worldwide: "🌍 Open Worldwide",
      international_students: "🎓 Open to International Students",
      conditional: "⚠️ Check Eligibility",
    },
  },
  ja: {
    labels: { eligibility: "対象地域", deadline: "締切", entryFee: "参加費", difficulty: "難易度" },
    notesHeading: "解説",
    officialSite: "公式サイト",
    uncategorized: "未分類",
    unnamed: "名称未設定",
    unknown: "不明",
    officialReference: "公式サイト参照",
    eligibility: {
      worldwide: "🌍 全世界から応募可能",
      international_students: "🎓 海外の学生も応募可能",
      conditional: "⚠️ 条件あり・要確認",
    },
  },
};

const FLAGS = {
  Australia: "🇦🇺",
  Canada: "🇨🇦",
  China: "🇨🇳",
  Croatia: "🇭🇷",
  France: "🇫🇷",
  Germany: "🇩🇪",
  Japan: "🇯🇵",
  Netherlands: "🇳🇱",
  "South Korea": "🇰🇷",
  "United Kingdom": "🇬🇧",
  "United States": "🇺🇸",
};

function loc(value, lang) {
  if (value && typeof value === "object") return value[lang] || "";
  return value || "";
}

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(value) {
  return esc(value).replace(/"/g, "&quot;");
}

// Mirrors groupCompetitionsByCountry() in app.js so the static order matches
// what the client renders after hydration.
function groupByCountry(competitions, lang) {
  const groups = new Map();
  for (const c of competitions) {
    const en = loc(c.country, "en") || "Unknown";
    if (!groups.has(en)) {
      groups.set(en, { en, label: loc(c.country, lang) || "Unknown", items: [] });
    }
    groups.get(en).items.push(c);
  }

  const ordered = [...groups.values()];
  const move = (fromName, afterName) => {
    const from = ordered.findIndex((g) => g.en === fromName);
    const anchor = ordered.findIndex((g) => g.en === afterName);
    if (from !== -1 && anchor !== -1 && from !== anchor + 1) {
      const [g] = ordered.splice(from, 1);
      const a = ordered.findIndex((x) => x.en === afterName);
      ordered.splice(a + 1, 0, g);
    }
  };
  move("Canada", "United States");
  move("Australia", "Canada");
  return ordered;
}

function renderCard(c, lang) {
  const tx = t[lang];
  const category = esc(loc(c.category, lang) || tx.uncategorized);
  const title = esc(loc(c.name, lang) || tx.unnamed);
  const eligibility = esc(tx.eligibility[c.eligibility] || tx.unknown);
  const deadline = esc(loc(c.deadline, lang) || tx.unknown);
  const entryFee = esc(loc(c.entryFee, lang) || tx.unknown);
  const difficulty = esc(loc(c.difficulty, lang) || tx.unknown);
  const notes = esc(loc(c.notes, lang) || tx.officialReference);

  const link = c.link
    ? `\n            <a class="card-link" href="${escAttr(c.link)}" target="_blank" rel="noopener noreferrer">${esc(tx.officialSite)}</a>`
    : "";

  return `        <article class="competition-card">
          <div class="card-body">
            <span class="category-label">${category}</span>
            <h3>${title}</h3>
            <dl class="meta-list">
              <div class="meta-row"><dt>${esc(tx.labels.eligibility)}</dt><dd>${eligibility}</dd></div>
              <div class="meta-row"><dt>${esc(tx.labels.deadline)}</dt><dd>${deadline}</dd></div>
              <div class="meta-row"><dt>${esc(tx.labels.entryFee)}</dt><dd>${entryFee}</dd></div>
              <div class="meta-row"><dt>${esc(tx.labels.difficulty)}</dt><dd>${difficulty}</dd></div>
            </dl>
            <section class="notes-block">
              <h4>${esc(tx.notesHeading)}</h4>
              <p class="notes">${notes}</p>
            </section>${link}
          </div>
        </article>`;
}

function renderList(competitions, lang) {
  const sections = groupByCountry(competitions, lang).map((group) => {
    const flag = FLAGS[group.en] || "";
    const heading = flag ? `${flag} ${esc(group.label)}` : esc(group.label);
    const cards = group.items.map((c) => renderCard(c, lang)).join("\n");
    return `      <section class="country-section">
        <h2 class="country-heading">${heading}</h2>
        <div class="competition-grid">
${cards}
        </div>
      </section>`;
  });
  return sections.join("\n");
}

function inject(file, inner) {
  const html = readFileSync(file, "utf8");
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s === -1 || e === -1) {
    throw new Error(`Markers not found in ${file}`);
  }
  const before = html.slice(0, s + START.length);
  const after = html.slice(e);
  writeFileSync(file, `${before}\n${inner}\n      ${after}`);
}

const competitions = JSON.parse(readFileSync(DATA_FILE, "utf8"));
for (const { file, lang } of TARGETS) {
  inject(file, renderList(competitions, lang));
  console.log(`Rendered ${competitions.length} competitions into ${file}`);
}
