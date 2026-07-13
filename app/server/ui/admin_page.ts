/**
 * Server-rendered shell for the `/admin` page.
 *
 * Intentionally minimal: a static HTML document that loads a hand-written
 * stylesheet and the bundled client module (`/admin.js`). All behaviour — the
 * id.kbn.one sign-in dance, listing, deletion, pruning — lives in the client
 * module. The client's runtime config (IdP + this service's origin) is
 * injected as a JSON script so it needs no extra round-trip.
 */

export interface AdminPageConfig {
  idpOrigin: string;
  storageOrigin: string;
}

function escapeJson(value: unknown): string {
  // Safe to inline inside a <script> element.
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderAdminPage(cfg: AdminPageConfig): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Storage 管理</title>
<link rel="stylesheet" href="/admin.css">
<script id="admin-config" type="application/json">${escapeJson(cfg)}</script>
</head>
<body>
<header>
  <h1>Storage 管理</h1>
  <div id="whoami" class="muted">読み込み中…</div>
</header>
<main>
  <section id="gate" hidden>
    <p id="gate-message"></p>
    <button id="login" type="button">id.kbn.one でログイン</button>
  </section>

  <section id="panel" hidden>
    <form id="filters">
      <label>prefix <input type="text" name="prefix" placeholder="example.com/"></label>
      <label>N日より古い <input type="number" name="olderThanDays" min="1" step="1" placeholder="30"></label>
      <button type="submit">一覧</button>
      <button id="prune" type="button" class="danger">この条件で一括削除</button>
    </form>
    <p id="status" class="muted"></p>
    <table>
      <thead>
        <tr><th>アップロード元</th><th>日付</th><th>キー</th><th>サイズ</th><th></th></tr>
      </thead>
      <tbody id="rows"></tbody>
    </table>
  </section>
</main>
<script type="module" src="/admin.js"></script>
</body>
</html>
`;
}
