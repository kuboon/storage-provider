/**
 * Admin page client.
 *
 * Signs the operator in through id.kbn.one (RP flow: generate a DPoP key →
 * `/authorize` → read `/session` for the access token), then drives the
 * object-management API on this service with DPoP-signed, bearer-authenticated
 * requests. Everything is gated server-side; this UI just reflects state.
 */

import { init } from "@kuboon/dpop";

interface AdminConfig {
  idpOrigin: string;
  storageOrigin: string;
}

interface StoredObject {
  key: string;
  size: number;
  uploaded: string;
  uploadOrigin?: string;
  userId?: string;
}

function cfg(): AdminConfig {
  const el = document.getElementById("admin-config");
  return JSON.parse(el?.textContent ?? "{}") as AdminConfig;
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function humanSize(n: number): string {
  if (!Number.isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

/** Split `originHost/yyyymmdd/rest` for display. */
function describeKey(key: string): { origin: string; date: string } {
  const parts = key.split("/");
  const origin = parts[0] ?? "";
  const d = parts[1] ?? "";
  const date = /^\d{8}$/.test(d)
    ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    : d;
  return { origin, date };
}

const { idpOrigin, storageOrigin } = cfg();

const dpop = await init();
const fetchDpop = dpop.fetchDpop;

let accessToken: string | null = null;

/** Read the id.kbn.one session for this DPoP key. Returns the userId or null. */
async function loadSession(): Promise<string | null> {
  try {
    const res = await fetchDpop(new URL("/session", idpOrigin).toString());
    if (!res.ok) return null;
    const data = await res.json() as { userId?: string | null; jws?: string };
    if (!data.userId || !data.jws) return null;
    accessToken = data.jws;
    return data.userId;
  } catch {
    return null;
  }
}

/** Call this service's API with the bearer token + a DPoP proof. */
function api(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return fetchDpop(new URL(path, storageOrigin).toString(), {
    ...init,
    headers,
  });
}

function toLogin(): void {
  const url = new URL("/authorize", idpOrigin);
  url.searchParams.set("dpop_jkt", dpop.thumbprint);
  url.searchParams.set(
    "redirect_uri",
    new URL("/admin", storageOrigin).toString(),
  );
  location.href = url.toString();
}

function showGate(message: string, showLogin: boolean): void {
  $("panel").hidden = true;
  const gate = $("gate");
  gate.hidden = false;
  $("gate-message").textContent = message;
  ($("login") as HTMLButtonElement).hidden = !showLogin;
}

function setStatus(message: string): void {
  $("status").textContent = message;
}

function renderRows(objects: StoredObject[]): void {
  const tbody = $("rows");
  tbody.replaceChildren();
  for (const o of objects) {
    const fromKey = describeKey(o.key);
    const tr = document.createElement("tr");

    const add = (text: string, cls?: string) => {
      const td = document.createElement("td");
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    };
    add(o.uploadOrigin ?? fromKey.origin);
    add(o.uploaded ? o.uploaded.slice(0, 10) : fromKey.date);
    add(o.key, "key");
    add(humanSize(o.size));

    const actions = document.createElement("td");
    const del = document.createElement("button");
    del.textContent = "削除";
    del.className = "danger";
    del.addEventListener("click", async () => {
      if (!confirm(`削除しますか?\n${o.key}`)) return;
      del.disabled = true;
      const res = await api(`/admin/objects?key=${encodeURIComponent(o.key)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        tr.remove();
      } else {
        del.disabled = false;
        setStatus(`削除失敗: ${res.status}`);
      }
    });
    actions.appendChild(del);
    tr.appendChild(actions);

    tbody.appendChild(tr);
  }
  setStatus(`${objects.length} 件`);
}

function filterValues(): { prefix: string; olderThanDays: string } {
  const form = $("filters") as HTMLFormElement;
  const data = new FormData(form);
  return {
    prefix: String(data.get("prefix") ?? "").trim(),
    olderThanDays: String(data.get("olderThanDays") ?? "").trim(),
  };
}

async function refresh(): Promise<void> {
  const { prefix, olderThanDays } = filterValues();
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  if (olderThanDays) params.set("olderThanDays", olderThanDays);
  setStatus("読み込み中…");
  const res = await api(`/admin/objects?${params.toString()}`);
  if (res.status === 403) {
    showGate("このアカウントには管理権限がありません。", false);
    return;
  }
  if (!res.ok) {
    setStatus(`一覧取得失敗: ${res.status}`);
    return;
  }
  const data = await res.json() as { objects: StoredObject[] };
  renderRows(data.objects);
}

async function prune(): Promise<void> {
  const { prefix, olderThanDays } = filterValues();
  const days = Number(olderThanDays);
  if (!Number.isFinite(days) || days <= 0) {
    setStatus("「N日より古い」に正の数を入れてください。");
    return;
  }
  if (!confirm(`${days}日より古いデータを削除します。よろしいですか?`)) return;
  setStatus("削除中…");
  const res = await api("/admin/objects/prune", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ olderThanDays: days, prefix: prefix || undefined }),
  });
  if (!res.ok) {
    setStatus(`一括削除失敗: ${res.status}`);
    return;
  }
  const data = await res.json() as { deleted: number };
  setStatus(`${data.deleted} 件削除しました。`);
  await refresh();
}

async function main(): Promise<void> {
  ($("login") as HTMLButtonElement).addEventListener("click", toLogin);
  ($("filters") as HTMLFormElement).addEventListener("submit", (e) => {
    e.preventDefault();
    void refresh();
  });
  ($("prune") as HTMLButtonElement).addEventListener(
    "click",
    () => void prune(),
  );

  const userId = await loadSession();
  if (!userId) {
    $("whoami").textContent = "未ログイン";
    showGate("管理画面を使うには id.kbn.one でログインしてください。", true);
    return;
  }
  $("whoami").textContent = `user: ${userId}`;

  // Probe admin access with a listing; the gate is shown on 403.
  $("gate").hidden = true;
  $("panel").hidden = false;
  await refresh();
}

await main();
