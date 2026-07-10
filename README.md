# storage-provider

id.kbn.one で認証したユーザが **Cloudflare R2**
にファイルをアップロードするための API
と、保存済みオブジェクトの管理画面（system admin 用）。

- ランタイム: **Deno**（ローカル / テスト）→ **Cloudflare
  Workers**（デプロイ）。
  同一コードが両方で動く（[kuboon/meibo](https://github.com/kuboon/meibo)
  の構成に準拠）。
- フレームワーク: Remix v3 `@remix-run/fetch-router`。
- R2 は **S3 互換 API + presigned URL** で扱う（R2 バインディング不使用）。
- 認証は id.kbn.one 発行の **DPoP バインド JWT** を JWKS
  で検証（共有秘密不要）。

## アーキテクチャ

```
● アップロード（任意の RP サイトから）
ブラウザ ──(1) id.kbn.one/session で {userId, jws} 取得（DPoP バインド）
        ──(2) POST /upload-url  (Authorization: DPoP <jws> + DPoP proof)
              → JWKS+DPoP 検証、Origin をメタデータに焼いた presigned PUT を発行
        ──(3) PUT 署名済 URL へファイルを直接 → Cloudflare R2

● 管理画面（/admin, system admin のみ）
ブラウザ → /admin → id.kbn.one で RP ログイン → /admin/objects* を DPoP+Bearer で呼ぶ
         → S3 List/Delete で一覧・削除・古いデータ一括削除
```

## エンドポイント

| メソッド | パス                                    | 認証              | 役割                                |
| -------- | --------------------------------------- | ----------------- | ----------------------------------- |
| GET      | `/admin`                                | 公開(HTML)        | 管理ページ（中の操作は下記で認可）  |
| POST     | `/upload-url`                           | id.kbn.one ユーザ | presigned PUT URL 発行              |
| GET      | `/download-url?key=`                    | id.kbn.one ユーザ | presigned GET URL 発行              |
| GET      | `/admin/objects?prefix=&olderThanDays=` | system admin      | 一覧                                |
| DELETE   | `/admin/objects?key=`                   | system admin      | 単一削除                            |
| POST     | `/admin/objects/prune`                  | system admin      | `{olderThanDays, prefix?}` 一括削除 |

`POST /upload-url` のボディ: `{ filename?, contentType? }`。レスポンス:
`{ key, url, method: "PUT", headers }` — ブラウザは `url` に `headers` を付けて
`PUT` する（`headers` は署名対象なので改変不可）。

## R2 に記録されるメタデータ

| 保存先         | 名前            | 値                                             |
| -------------- | --------------- | ---------------------------------------------- |
| object key     | —               | `<originHost>/<yyyymmdd>/<ulid>-<safeName>`    |
| customMetadata | `upload-origin` | アップロード元ホスト名（署名で固定＝詐称不可） |
| customMetadata | `user-id`       | id.kbn.one の userId                           |
| httpMetadata   | `content-type`  | ブラウザ指定 MIME                              |

## 環境変数

| 変数                                        | 既定                                      | 用途                                 |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------ |
| `IDP_ORIGIN`                                | `https://id.kbn.one`                      | JWKS URL・期待する `iss`             |
| `STORAGE_ORIGIN`                            | リクエスト origin                         | 管理ログインの `redirect_uri`        |
| `SYSTEM_ADMIN_USER_IDS`                     | (未設定=管理不可)                         | 管理権限を持つ userId のカンマ区切り |
| `R2_ACCOUNT_ID`                             | —                                         | R2 S3 エンドポイントのホスト         |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | —                                         | SigV4 署名                           |
| `R2_BUCKET`                                 | —                                         | バケット名                           |
| `R2_S3_ENDPOINT`                            | `https://<acct>.r2.cloudflarestorage.com` | 任意上書き                           |

## ローカル開発

```bash
# A) Cloudflare 互換（wrangler dev; KV/Assets をローカルエミュレート）
deno task cf:dev

# B) 素の Deno（静的アセットは deno task build 済み前提）
deno task dev            # deno serve, http://localhost:8000
```

R2 のクレデンシャルはローカルでは `.dev.vars`（wrangler）や `.env` に置く。

## テスト / チェック

```bash
deno task check          # lint + fmt --check + type check
deno task test           # deno test -P
```

## デプロイ（Cloudflare Workers）

```bash
deno task build:cf       # dist/worker.js + dist/public/
wrangler deploy          # もしくは deno task cf:deploy
```

シークレット登録:

```bash
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET
wrangler secret put SYSTEM_ADMIN_USER_IDS   # 例: user_abc,user_def
wrangler secret put STORAGE_ORIGIN          # 例: https://storage.kbn.one
```

CI は `.github/workflows/deploy.yml`（`cloudflare/wrangler-action`）。
リポジトリに `secrets.CLOUDFLARE_API_TOKEN` と `vars.CLOUDFLARE_ACCOUNT_ID`
を設定。

### R2 バケットの CORS 設定（必須）

ブラウザが presigned URL で直接 PUT/GET するため、バケットに CORS
ルールを設定する:

```json
[
  {
    "AllowedOrigins": [
      "https://<アップロード元サイト>",
      "https://storage.kbn.one"
    ],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": [
      "content-type",
      "x-amz-meta-upload-origin",
      "x-amz-meta-user-id"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

古いデータの自動失効が欲しい場合は R2 の **ライフサイクルルール**（N
日で削除）も併用できる。

## id.kbn.one 側の設定（コード変更なし）

id.kbn.one には**コードを入れない**。IdP として既存の
`/.well-known/jwks.json`・`/authorize`・`/session` を使うのみ。必要なのは
**デプロイ設定だけ**: id.kbn.one の `AUTHORIZE_WHITELIST` env に **この Worker
のオリジン**（管理ログインの `redirect_uri` 用）を追加する。 アップロード元の RP
サイトは、id.kbn.one で認証している時点で既に whitelist 済み。

## メモ

- 認証は `issuer` + DPoP バインド（`cnf.jkt` = proof の thumbprint
  一致）で守る。 id.kbn.one の現行 `/session` トークンに `aud` が無いため
  audience 制限は将来課題。
- ステートレス（KV/DB 無し）。DPoP proof の `jti` replay 防止は短命（≤5分）＋
  `iat` ウィンドウ（300秒）に依存。
- Claude Code on the web で開く場合は、Deno を入れる SessionStart フック
  （`.claude/hooks/session-start.sh`）を用意すると便利
  （[deno-remix-reference](https://github.com/kuboon/deno-remix-reference)
  参照）。
