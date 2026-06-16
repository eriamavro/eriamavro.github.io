const isJapanese = document.documentElement.lang === "ja";
const DATA_PATH = isJapanese ? "../data/competitions.json" : "data/competitions.json";
const STATUS_PATH = isJapanese ? "../data/watch-status.json" : "data/watch-status.json";
const text = {
  all: isJapanese ? "すべて" : "All",
  count: (count) => isJapanese ? `${count}件` : `${count} ${count === 1 ? "competition" : "competitions"}`,
  empty: isJapanese ? "該当するコンペはありません。" : "No competitions match this category.",
  error: isJapanese
    ? "コンペ情報を読み込めませんでした。ローカルサーバー経由で開いているか確認してください。"
    : "Unable to load competition data. Please check that the site is being opened through a local server.",
  uncategorized: isJapanese ? "未分類" : "Uncategorized",
  unnamed: isJapanese ? "名称未設定" : "Untitled",
  unknown: isJapanese ? "不明" : "Unknown",
  officialSite: isJapanese ? "公式サイト" : "Official Site",
  notesHeading: isJapanese ? "解説" : "Notes",
  officialReference: isJapanese ? "公式サイト参照" : "See official website for details.",
  watchSummary: {
    none: isJapanese
      ? "公式サイトの自動確認はまだ実行されていません。"
      : "Automatic official-site checks have not run yet.",
    latest: (date, changed, manual, errors) => {
      if (isJapanese) {
        return `最終自動確認: ${date} / 更新検知: ${changed}件 / 公式サイト確認: ${manual}件 / 自動確認できない項目: ${errors}件`;
      }

      return `Last automatic check: ${date} / Updates detected: ${changed} / Check official site: ${manual} / Could not auto-check: ${errors}`;
    },
  },
  watch: {
    updated: isJapanese ? "公式サイトに変更あり" : "Official site changed",
    checked: isJapanese ? "確認済み" : "Checked",
    manual: isJapanese ? "公式サイトで確認" : "Check official site",
    error: isJapanese ? "自動確認できませんでした" : "Could not auto-check",
    lastChecked: isJapanese ? "最終確認" : "Last checked",
    changedAt: isJapanese ? "更新検知" : "Update detected",
  },
  labels: {
    eligibility: isJapanese ? "対象地域" : "Eligibility",
    deadline: isJapanese ? "締切" : "Deadline",
    entryFee: isJapanese ? "参加費" : "Entry Fee",
    difficulty: isJapanese ? "難易度" : "Difficulty",
  },
  eligibility: {
    worldwide: isJapanese ? "🌍 全世界から応募可能" : "🌍 Open Worldwide",
    international_students: isJapanese
      ? "🎓 海外の学生も応募可能"
      : "🎓 Open to International Students",
    conditional: isJapanese ? "⚠️ 条件あり・要確認" : "⚠️ Check Eligibility",
  },
};

const state = {
  competitions: [],
  watchStatus: {},
  activeCategory: text.all,
};

const categoryFilters = document.querySelector("#categoryFilters");
const competitionList = document.querySelector("#competitionList");
const resultCount = document.querySelector("#resultCount");
const watchSummary = document.querySelector("#watchSummary");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    const response = await fetch(DATA_PATH);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    state.competitions = await response.json();
    state.watchStatus = await loadWatchStatus();
    renderFilters();
    renderWatchSummary();
    renderCompetitions();
  } catch (error) {
    competitionList.innerHTML = `
      <p class="error">
        ${text.error}
      </p>
    `;
    resultCount.textContent = "";
    console.error("Failed to load competitions:", error);
  }
}

async function loadWatchStatus() {
  try {
    const response = await fetch(STATUS_PATH);
    if (!response.ok) return {};
    return await response.json();
  } catch (error) {
    console.warn("Failed to load watch status:", error);
    return {};
  }
}

function renderWatchSummary() {
  if (!watchSummary) return;

  const statuses = Object.values(state.watchStatus);

  if (statuses.length === 0) {
    watchSummary.textContent = text.watchSummary.none;
    return;
  }

  const latestCheck = statuses
    .map((status) => status.checkedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const changed = statuses.filter((status) => status.changed).length;
  const manual = statuses.filter((status) => status.status === "manual").length;
  const errors = statuses.filter((status) => status.status === "error" || status.status === "http_error").length;

  watchSummary.textContent = text.watchSummary.latest(formatDateTime(latestCheck), changed, manual, errors);
}

function renderFilters() {
  const categories = [...new Set(state.competitions.flatMap(getCategoryParts))].sort((a, b) =>
    a.localeCompare(b, isJapanese ? "ja" : "en")
  );

  categoryFilters.innerHTML = "";
  [text.all, ...categories].forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-button";
    button.textContent = category;
    button.dataset.category = category;
    button.setAttribute("aria-pressed", category === state.activeCategory ? "true" : "false");

    if (category === state.activeCategory) {
      button.classList.add("is-active");
    }

    button.addEventListener("click", () => {
      state.activeCategory = category;
      renderFilters();
      renderCompetitions();
    });

    categoryFilters.appendChild(button);
  });
}

function renderCompetitions() {
  const filtered = state.activeCategory === text.all
    ? state.competitions
    : state.competitions.filter((competition) =>
        getCategoryParts(competition).includes(state.activeCategory)
      );

  resultCount.textContent = text.count(filtered.length);

  if (filtered.length === 0) {
    competitionList.innerHTML = `<p class="empty">${text.empty}</p>`;
    return;
  }

  competitionList.innerHTML = "";
  const grouped = groupCompetitionsByCountry(filtered);

  grouped.forEach(([country, competitions]) => {
    const section = document.createElement("section");
    section.className = "country-section";

    const heading = document.createElement("h2");
    heading.className = "country-heading";
    const flag = getCountryFlag(country.en);
    const countryLabel = country.label;
    heading.textContent = flag ? `${flag} ${countryLabel}` : countryLabel;

    const grid = document.createElement("div");
    grid.className = "competition-grid";

    competitions.forEach((competition) => {
      grid.appendChild(createCompetitionCard(competition));
    });

    section.append(heading, grid);
    competitionList.appendChild(section);
  });
}

function createCompetitionCard(competition) {
  const card = document.createElement("article");
  card.className = "competition-card";
  const watchStatus = getWatchStatus(competition);

  if (watchStatus?.changed) {
    card.classList.add("has-update");
  } else if (watchStatus?.status === "error" || watchStatus?.status === "http_error") {
    card.classList.add("has-watch-error");
  }

  const body = document.createElement("div");
  body.className = "card-body";

  const category = document.createElement("span");
  category.className = "category-label";
  category.textContent = getLocalizedField(competition.category) || text.uncategorized;

  const title = document.createElement("h3");
  title.textContent = competition.name || text.unnamed;

  const statusRow = createWatchStatusRow(watchStatus);

  const metaList = document.createElement("dl");
  metaList.className = "meta-list";
  metaList.append(
    createMetaRow(text.labels.eligibility, formatEligibility(competition)),
    createMetaRow(text.labels.deadline, formatDetail(competition.deadline, "deadline")),
    createMetaRow(text.labels.entryFee, formatDetail(competition.entryFee, "entryFee")),
    createMetaRow(text.labels.difficulty, formatDetail(competition.difficulty, "difficulty"))
  );

  const notesBlock = document.createElement("section");
  notesBlock.className = "notes-block";

  const notesHeading = document.createElement("h4");
  notesHeading.textContent = text.notesHeading;

  const notes = document.createElement("p");
  notes.className = "notes";
  notes.textContent = getLocalizedField(competition.notes) || text.officialReference;

  notesBlock.append(notesHeading, notes);

  body.append(category, title);

  if (statusRow) {
    body.appendChild(statusRow);
  }

  body.append(metaList, notesBlock);

  if (competition.link) {
    const link = document.createElement("a");
    link.className = "card-link";
    link.href = competition.link;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = text.officialSite;
    body.appendChild(link);
  }

  card.appendChild(body);
  return card;
}

function getWatchStatus(competition) {
  return state.watchStatus[competition.link] || state.watchStatus[competition.name] || null;
}

function createWatchStatusRow(status) {
  if (!status || !status.checkedAt) return null;

  const row = document.createElement("div");
  row.className = "watch-row";

  const badge = document.createElement("span");
  badge.className = "watch-badge";

  if (status.changed) {
    badge.classList.add("is-updated");
    badge.textContent = text.watch.updated;
  } else if (status.status === "manual") {
    badge.classList.add("is-manual");
    badge.textContent = text.watch.manual;
  } else if (status.status === "error" || status.status === "http_error") {
    badge.classList.add("is-error");
    badge.textContent = text.watch.error;
  } else {
    badge.textContent = text.watch.checked;
  }

  const date = document.createElement("span");
  date.className = "watch-date";
  const label = status.changed && status.changedAt ? text.watch.changedAt : text.watch.lastChecked;
  date.textContent = `${label}: ${formatDateTime(status.changedAt || status.checkedAt)}`;

  row.append(badge, date);
  return row;
}

function createMetaRow(label, value) {
  const row = document.createElement("div");
  row.className = "meta-row";

  const term = document.createElement("dt");
  term.textContent = label;

  const description = document.createElement("dd");
  description.textContent = value || text.unknown;

  row.append(term, description);
  return row;
}

function getCategoryParts(competition) {
  return String(getLocalizedField(competition.category) || text.uncategorized)
    .split("/")
    .map((category) => category.trim())
    .filter(Boolean);
}

function getLocalizedField(value, lang = isJapanese ? "ja" : "en") {
  if (value && typeof value === "object") {
    return value[lang] || "";
  }

  return value || "";
}

function formatDetail(value, type) {
  const detail = getLocalizedField(value) || value;

  if (isJapanese) {
    return detail || text.unknown;
  }

  const maps = {
    deadline: {
      "例年 1-3月": "Usually January-March",
      "例年 1月〜2月": "Usually January-February",
      "例年 2月〜3月": "Usually February-March",
      "例年 2月頃": "Usually around February",
      "例年 3月〜4月": "Usually March-April",
      "例年 4-5月": "Usually April-May",
      "例年 4月（奇数年）": "Usually April (odd-numbered years)",
      "例年 5-6月": "Usually May-June",
      "例年 6-8月": "Usually June-August",
      "例年 6月〜7月": "Usually June-July",
      "例年 6月頃": "Usually around June",
      "例年 7-8月": "Usually July-August",
      "例年 7月〜8月": "Usually July-August",
      "例年 8-9月": "Usually August-September",
      "例年 8月": "Usually August",
      "例年 9-10月": "Usually September-October",
      "例年 9月〜10月": "Usually September-October",
      "例年 10-11月": "Usually October-November",
      "例年 10月": "Usually October",
      "例年 10月〜11月": "Usually October-November",
      "例年 11-12月": "Usually November-December",
      "例年 11月〜1月": "Usually November-January",
      "例年 11月〜12月": "Usually November-December",
      "例年 12-2月": "Usually December-February",
      "公式参照": "See official website",
    },
    entryFee: {
      "無料": "Free",
      "有料": "Paid",
      "会員費": "Membership fee",
      "公式参照": "See official website",
    },
    difficulty: {
      "要確認": "Check official website",
    },
  };

  const formatted = maps[type]?.[detail] || detail || text.unknown;
  return containsJapanese(formatted) ? "See official website for details." : formatted;
}

function containsJapanese(value) {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value));
}

function formatDateTime(value) {
  if (!value) return text.unknown;

  try {
    return new Intl.DateTimeFormat(isJapanese ? "ja-JP" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function groupCompetitionsByCountry(competitions) {
  const groups = new Map();

  competitions.forEach((competition) => {
    const countryEn = getLocalizedField(competition.country, "en") || text.unknown;
    const countryLabel = getLocalizedField(competition.country) || text.unknown;

    if (!groups.has(countryEn)) {
      groups.set(countryEn, {
        country: {
          en: countryEn,
          label: countryLabel,
        },
        competitions: [],
      });
    }

    groups.get(countryEn).competitions.push(competition);
  });

  const orderedGroups = [...groups.values()];
  const usIndex = orderedGroups.findIndex((group) => group.country.en === "United States");
  const canadaIndex = orderedGroups.findIndex((group) => group.country.en === "Canada");

  if (usIndex !== -1 && canadaIndex !== -1 && canadaIndex !== usIndex + 1) {
    const [canadaGroup] = orderedGroups.splice(canadaIndex, 1);
    const adjustedUsIndex = orderedGroups.findIndex((group) => group.country.en === "United States");
    orderedGroups.splice(adjustedUsIndex + 1, 0, canadaGroup);
  }

  const adjustedCanadaIndex = orderedGroups.findIndex((group) => group.country.en === "Canada");
  const australiaIndex = orderedGroups.findIndex((group) => group.country.en === "Australia");

  if (adjustedCanadaIndex !== -1 && australiaIndex !== -1 && australiaIndex !== adjustedCanadaIndex + 1) {
    const [australiaGroup] = orderedGroups.splice(australiaIndex, 1);
    const latestCanadaIndex = orderedGroups.findIndex((group) => group.country.en === "Canada");
    orderedGroups.splice(latestCanadaIndex + 1, 0, australiaGroup);
  }

  return orderedGroups.map((group) => [group.country, group.competitions]);
}

function getCountryFlag(country) {
  const flags = {
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

  return flags[country] || "";
}

function formatEligibility(competition) {
  return text.eligibility[competition.eligibility] || text.unknown;
}
