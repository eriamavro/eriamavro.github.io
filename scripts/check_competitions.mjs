import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const DATA_FILE = "competition-site/data/competitions.json";
const STATUS_FILE = "competition-site/data/watch-status.json";
const TIMEOUT_MS = 20000;
const execFileAsync = promisify(execFile);

const checkedAt = new Date().toISOString();

function normalizeContent(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250000);
}

function hashContent(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "EriAdachiCompetitionWatcher/1.0 (+https://www.eriadachi.com/competition-site/)",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url) {
  try {
    const response = await fetchWithTimeout(url);
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } catch (error) {
    if (error.cause?.code !== "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      throw error;
    }

    const { stdout } = await execFileAsync("curl", [
      "--fail",
      "--location",
      "--silent",
      "--show-error",
      "--max-time",
      String(Math.ceil(TIMEOUT_MS / 1000)),
      "--user-agent",
      "EriAdachiCompetitionWatcher/1.0 (+https://www.eriadachi.com/competition-site/)",
      url,
    ], {
      maxBuffer: 8 * 1024 * 1024,
    });

    return {
      ok: true,
      status: 200,
      text: stdout,
    };
  }
}

function statusKey(competition) {
  return competition.link || competition.name;
}

const competitions = await readJson(DATA_FILE, []);
const previous = await readJson(STATUS_FILE, {});
const next = {};

for (const competition of competitions) {
  const key = statusKey(competition);
  const oldStatus = previous[key] || {};

  if (competition.watchMode === "manual") {
    next[key] = {
      name: competition.name,
      url: competition.link || oldStatus.url || null,
      checkedAt,
      changedAt: oldStatus.changedAt || null,
      changed: false,
      status: "manual",
      httpStatus: null,
      contentHash: oldStatus.contentHash || null,
      error: null,
    };
    continue;
  }

  if (!competition.link) {
    next[key] = {
      ...oldStatus,
      name: competition.name,
      checkedAt,
      status: "skipped",
      error: "No official URL configured.",
    };
    continue;
  }

  try {
    const response = await fetchPage(competition.link);
    const html = response.text;
    const contentHash = hashContent(normalizeContent(html));
    const changed = Boolean(oldStatus.contentHash && oldStatus.contentHash !== contentHash);

    next[key] = {
      name: competition.name,
      url: competition.link,
      checkedAt,
      changedAt: changed ? checkedAt : oldStatus.changedAt || null,
      changed,
      status: response.ok ? "ok" : "http_error",
      httpStatus: response.status,
      contentHash,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    next[key] = {
      ...oldStatus,
      name: competition.name,
      url: competition.link,
      checkedAt,
      changed: false,
      status: "error",
      error: error.name === "AbortError" ? "Request timed out." : error.message,
    };
  }
}

await fs.writeFile(STATUS_FILE, `${JSON.stringify(next, null, 2)}\n`);

const changedCount = Object.values(next).filter((item) => item.changed).length;
const errorCount = Object.values(next).filter((item) => item.status === "error" || item.status === "http_error").length;

console.log(`Checked ${competitions.length} competitions.`);
console.log(`Changed: ${changedCount}`);
console.log(`Errors: ${errorCount}`);
