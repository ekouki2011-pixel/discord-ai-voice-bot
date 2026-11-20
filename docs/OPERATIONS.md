# 常時稼働・保守

## 稼働先

Discord BotはGatewayの常時WebSocket接続と、VCへのUDP送信を使います。常時プロセスとUDP通信を許可するLinuxサーバーまたは常時起動PCを選んでください。通常の静的サイト、リクエスト時だけ起動する関数、アイドル時に休眠する無料Webホストでは常時稼働できません。

Bot単体は少量のメモリで動きますが、VOICEVOXにはCPU合成の計算資源・モデル領域が必要です。検討の出発点として **2 vCPU、4 GB RAM、空きディスク10 GB以上** を推奨します。これは本プロジェクトの容量見積もりであり、公式の最低保証値ではありません。長文・同時サーバー数・選択話者によって増やしてください。公式CPUイメージの圧縮サイズも約1.94 GBあります。GPUは必須ではありません。

契約先・料金・地域・予算はまだ指定されていません。ホストの契約、支払い、本番起動は行っていません。無料での検証は手元PCのVOICEVOXとBotで行えます。PCを停止するとBotも停止します。iPhoneだけでの24時間常駐は想定しません。

## Docker

`docker-compose.yml` はBotとVOICEVOX CPU版0.26.2を分離します。VOICEVOXポートをホストへ公開しません。ヘルスチェックの8080番もホストの127.0.0.1へ限定します。Botは非root、read-onlyルート、権限削減、一時音声用tmpfsで動きます。SQLiteとバックアップには名前付き永続ボリュームを使います。

1. `.env` を所有者が設定します。`ENGINE_TERMS_ACCEPTED`、キー、Intent許可を確認します。
2. `docker compose --env-file .env config --quiet` で構成を確認します。`config` の出力には秘密情報が含まれ得るため、`--quiet` を使い、設定全体を共有しないでください。
3. `docker compose build`。
4. 所有者が稼働開始を判断して `docker compose up -d`。
5. `docker compose run --rm --no-deps bot node dist/scripts/register.js` で所有者がコマンドを登録できます。スクリプト出力の招待URLからサーバーへ追加します。
6. `docker compose ps`、Discordの `/join` と `/say`、自動読み上げを確認します。

VOICEVOXのヘルスチェックはBashのローカルHTTP要求で行い、公式イメージに追加のcurlやPython CLIを要求しません。VOICEVOXはクエリに文章を含むAPIを使うため、Composeではエンジンのアクセスログを保存しません。別方式で起動する場合も、エンジンやリバースプロキシのアクセスログに本文を残さない設定にしてください。

この作業環境にはDocker CLI／デーモンがないため、イメージビルド・Compose実起動は未検証です。GitHub ActionsにはビルドとCompose構文確認を含めていますが、リポジトリ保存後に実行結果の確認が必要です。

## 復旧と監視

異常終了時は `restart: unless-stopped` で再起動します。正常なSIGTERMでは新規読み上げを止め、合成・再生をキャンセルしてDBを閉じます。再起動後は設定が保持されますが、VCには所有者または利用者が `/join` で呼び戻します。

`GET /healthz` はプロセス生存、`GET /readyz` はDiscordの準備完了状態を返します。`readyz` はDiscordが未接続の間503です。応答に本文・トークン・キー・ユーザーIDを含みません。

Dockerのunhealthy判定だけではコンテナは自動再起動しません。Discord SDKがGatewayの再接続を担当し、VCは最大3回の復旧を試みて失敗時に退出します。4014等の除外・許可に関わる切断で復帰を強制しません。長期切断を含む監視は、所有者がホストの監視機能で `readyz` の失敗と再起動回数を通知する設定にしてください。通知先アカウントやWebhookを勝手に作成・送信しません。読上げ失敗は、権限が残っていれば操作元チャンネルへ短い通知を返します。

ログはJSON形式でイベント名とエラーコードを記録し、メッセージ本文・APIレスポンス・SDK例外全体を記録しません。`docker compose logs --tail=100 bot` で確認できます。Botログは10 MB×3ファイルへローテーションします。外部サービスのログ保持は各サービスの条件に従います。

## バックアップと復元

```sh
# ローカル稼働
npm run db:backup -- backups/bot-before-update.sqlite

# Docker稼働（運用中のWALをSQLite公式backup機能でコピー）
docker compose exec bot node dist/scripts/backup.js /app/backups/bot-before-update.sqlite
docker compose cp bot:/app/backups/bot-before-update.sqlite ./bot-before-update.sqlite
```

バックアップにはユーザーID・音声設定が含まれるため、所有者だけが閲覧できる場所へ保管します。ホスト障害に備え別の保存先へコピーしてください。

復元はBotを停止してから行います。現在のDBを別名へ保全し、バックアップを `DATABASE_PATH` へ配置します。停止後の古い `-wal` と `-shm` も別名へ退避し、復元DBと混在させないでください。所有権をBot実行ユーザーへ合わせて起動します。別の一時DBへの復元と設定・日次使用量比較は自動テストで確認しています。Dockerボリュームへの実復元は本番前に実施してください。

## 安全な更新

1. 更新対象のコミットSHAを控えます。
2. `npm ci` → `npm run check` → 秘密情報検査を実行します。
3. DBバックアップを取得します。
4. 検証サーバーで [実機チェック](ACCEPTANCE_JA.md) を通します。
5. 所有者が本番反映を承認して、`docker compose build bot` → `docker compose up -d --no-deps bot`。
6. readyz、VC再生、自動読み上げ、設定保持を確認します。スラッシュコマンド定義を変更した場合は登録スクリプトも再実行します。

問題があれば元のソースSHAから再ビルドします。現在のDBスキーマはuser_version=1です。将来の互換性のないDB変更では、アプリだけ戻すことを安全と仮定せず、変更時に決めた復元手順に従ってください。`docker compose down -v` は永続設定を消すため通常の更新で使いません。
