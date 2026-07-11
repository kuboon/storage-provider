# storage-provider

id.kbn.one で認証したユーザが **Cloudflare R2**
にファイルをアップロードするための API
と、保存済みオブジェクトの管理画面（system admin 用）。

- ランタイム: **Deno**（ローカル / テスト）→ **Cloudflare
  Workers**（デプロイ）。
  同一コードが両方で動く（[kuboon/meibo](https://github.com/kuboon/meibo)
  の構成に準拠）。
- フレームワーク: Remix v3 `@remix-run/fetch-router`。
- R2 は **Workers バインディング (`env.BUCKET`)** で直接読み書き（access key
  不要）。
- 認証は id.kbn.one 発行の **DPoP バインド JWT** を JWKS
  で検証（共有秘密不要）。ステートレス。

## アーキテクチャ

```
● アップロード（任意の RP サイトから）
ブラウザ ──(1) id.kbn.one/session で {userId, jws} 取得（DPoP バインド）
        ──(2) POST /upload?filename=…  (Authorization: DPoP <jws> + DPoP proof, body=ファイル)
              → JWKS+DPoP 検証、Origin を metadata に記録し env.BUCKET.put で R2 へストリーム保存

● 管理画面（/admin, system admin のみ）
ブラウザ → /admin → id.kbn.one で RP ログイン → /admin/objects* を DPoP+Bearer で呼ぶ
         → env.BUCKET.list/delete で一覧・削除・古いデータ一括削除
```

ファイルは Worker を**ストリーム通過**して R2 に入る（バッファしないので Worker
のリクエストボディ上限まで＝おおむね数百MB を想定。本サービスは 500MB
を上限に）。

## エンドポイント

| メソッド | パス                                    | 認証              | 役割                                        |
| -------- | --------------------------------------- | ----------------- | ------------------------------------------- |
| GET      | `/admin`                                | 公開(HTML)        | 管理ページ（中の操作は下記で認可）          |
| POST     | `/upload?filename=…`                    | id.kbn.one ユーザ | body=ファイル。R2 に保存し `{ key }` を返す |
| GET      | `/download?key=…`                       | id.kbn.one ユーザ | オブジェクトをストリーム返却                |
| GET      | `/admin/objects?prefix=&olderThanDays=` | system admin      | 一覧                                        |
| DELETE   | `/admin/objects?key=`                   | system admin      | 単一削除                                    |
| POST     | `/admin/objects/prune`                  | system admin      | `{olderThanDays, prefix?}` 一括削除         |

`POST /upload` は `Content-Type` にファイルの MIME、`?filename=`
に元名を付ける。

## R2 に記録されるメタデータ

| 保存先         | 名前            | 値                                                      |
| -------------- | --------------- | ------------------------------------------------------- |
| object key     | —               | `<originHost>/<yyyymmdd>/<ulid>-<safeName>`             |
| customMetadata | `upload-origin` | アップロード元ホスト名（`Origin` ヘッダ由来・詐称不可） |
| customMetadata | `user-id`       | id.kbn.one の userId                                    |
| httpMetadata   | `content-type`  | ブラウザ指定 MIME                                       |

一覧は `env.BUCKET.list({ include: ["customMetadata"] })` で `upload-origin` /
`user-id` / `uploaded`（日時）を取得。「古いデータ削除」は `uploaded` で判定。

## 環境変数 / バインディング

| 種別       | 名前                    | 既定                 | 用途                                            |
| ---------- | ----------------------- | -------------------- | ----------------------------------------------- |
| binding    | `BUCKET`                | —                    | R2 バケット（`wrangler.jsonc` の `r2_buckets`） |
| var        | `IDP_ORIGIN`            | `https://id.kbn.one` | JWKS URL・期待する `iss`                        |
| var/secret | `STORAGE_ORIGIN`        | リクエスト origin    | 管理ログインの `redirect_uri`                   |
| secret     | `SYSTEM_ADMIN_USER_IDS` | (未設定=管理不可)    | 管理権限を持つ userId のカンマ区切り            |

**R2 access key は不要**（バインディングはプラットフォームが認証）。

## ローカル開発

```bash
# A) Cloudflare 互換（wrangler dev; R2/Assets をローカルエミュレート）
deno task cf:dev

# B) 素の Deno（R2 はインメモリの MemoryBucket で代替。小さいファイルの動作確認用）
deno task dev            # deno serve, http://localhost:8000
```

`deno task dev` はバインディングが無いので `MemoryBucket`（非永続・メモリ上）に
フォールバックする。永続や本番同等の確認は `deno task cf:dev`。

## テスト / チェック

```bash
deno task check          # lint + fmt --check + type check
deno task test           # deno test -P
```

## デプロイ（Cloudflare Workers）

```bash
wrangler r2 bucket create kbn-storage   # 初回のみ（名前は wrangler.jsonc に合わせる）
deno task build:cf                      # dist/worker.js + dist/public/
wrangler deploy                         # もしくは deno task cf:deploy
```

シークレット登録:

```bash
wrangler secret put SYSTEM_ADMIN_USER_IDS   # 例: user_abc,user_def
wrangler secret put STORAGE_ORIGIN          # 例: https://storage.kbn.one
```

CI は `.github/workflows/deploy.yml`（`cloudflare/wrangler-action`）。
リポジトリに `secrets.CLOUDFLARE_API_TOKEN` と `vars.CLOUDFLARE_ACCOUNT_ID`
を設定。

### CORS

ブラウザは R2 ではなく **この Worker** にアップロードするので、R2 バケット側の
CORS 設定は不要。Worker 側の CORS（別オリジンの RP フロントエンドからの
`/upload` 呼び出し許可）は `@remix-run/cors-middleware` で全 origin 許可
（アクセス制御は DPoP トークン検証が担う）。古いデータの自動失効が欲しい場合は
R2 の **ライフサイクルルール**（N 日で削除）も併用できる。

## id.kbn.one 側の設定（コード変更なし）

id.kbn.one には**コードを入れない**。IdP として既存の
`/.well-known/jwks.json`・`/authorize`・`/session` を使うのみ。必要なのは
**デプロイ設定だけ**: id.kbn.one の `AUTHORIZE_WHITELIST` env に **この Worker
のオリジン**（管理ログインの `redirect_uri` 用）を追加する。アップロード元の RP
サイトは、id.kbn.one で認証している時点で既に whitelist 済み。

## メモ

- 認証は `issuer` + DPoP バインド（`cnf.jkt` = proof の thumbprint
  一致）で守る。 id.kbn.one の現行 `/session` トークンに `aud` が無いため
  audience 制限は将来課題。
- ステートレス（KV/DB 無し）。DPoP proof の `jti` replay 防止は短命（≤5分）＋
  `iat` ウィンドウ（300秒）に依存。
- **バインディングを受け取るため薄い `app/server/worker.ts` を Workers
  エントリに している**（binding は `process.env` に載らず `fetch(req, env)` の
  `env` からのみ 取得できるため。meibo と同じ方式）。`deno serve` は `router.ts`
  を直接使う。
