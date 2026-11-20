# Discord多機能AI音声読み上げBot Ver.1.0

日本語の `/say` と専用テキストチャンネルの自動読み上げに対応するDiscord Botです。Node.js 24、TypeScript、discord.js 14.28.1、@discordjs/voice 0.19.2（DAVE有効）、FFmpeg、SQLiteを使用します。iPhoneのDiscordアプリから日常操作できます。

**実装と実運用確認は別です。** 自動テストで検証した範囲、実音声合成の結果、認証待ちの項目は [検証記録](docs/VALIDATION.md) に記載します。Discord Botトークンが設定されるまではDiscord接続・VC再生を確認できません。SaydiVoice「私の声1」の実ID取得もAPIキー設定待ちです。

## 最初の起動

必要なもの：Node.js **24.17以上の24系**、FFmpeg、Discordのテストサーバー管理権限、VOICEVOX ENGINEまたはVOICEVOXアプリ。Docker利用時はホストへのNode.js・FFmpegの個別インストールは不要です。

```sh
npm ci
cp .env.example .env
```

1. [Discord Developer Portal](https://discord.com/developers/applications)でアプリ・Botを作成します。[設定手順](docs/SETUP_JA.md)に沿って `.env` またはホストのシークレット設定へ `DISCORD_TOKEN`、`DISCORD_CLIENT_ID`、検証サーバーの `DISCORD_GUILD_ID` を入力します。秘密情報をチャットへ貼る必要はありません。
2. VOICEVOXを起動します。既定の接続先は `http://127.0.0.1:50021` です。
3. 使用する音声のライセンス・クレジット条件を確認し、利用できる運用者が `ENGINE_TERMS_ACCEPTED=voicevox` を設定します。
4. 以下を実行します。コマンド登録はDiscord上のアプリ設定を書き換えるため、所有者が確認して実施してください。

```sh
npm run commands:register
npm run doctor
npm run build
npm start
```

登録スクリプトが表示する招待URLを所有者が開き、対象サーバーを確認して追加します。最小権限は「チャンネルを見る」「メッセージを送信」「接続」「発言」です。管理者権限、VC録音、メンバー一覧取得Intent、メッセージ履歴の取得権限は要求しません。

## Discordでの初回設定

1. 通常のVCへ参加して `/join`。
2. 管理者が `/voice sync engine:voicevox`。
3. `/voice list engine:voicevox` でスタイルIDとクレジットを確認します。
4. 管理者が、使用許諾を確認した声について `/voice approve engine:voicevox id:ID rights:true`。
5. `/voice set engine:voicevox id:ID`。サーバーの既定にする場合は管理者が `scope:server` も指定します。
6. `/say text:こんにちは！`。

「サーバー管理」権限を持つ人を、このBotの管理者として扱います。音声同期と利用許可は別の操作です。外部アカウントに保存されているだけで、音声の使用許諾があるとは判断しません。

## 自動読み上げ

所有者がDeveloper Portalの **Bot → Privileged Gateway Intents → Message Content Intent** を有効にし、`.env` を `MESSAGE_CONTENT_ENABLED=true` に変更して再起動します。大規模・認証済みBotではDiscord側の審査も必要です。未許可のIntentは要求しません。

管理者が `/channel set channel:#読み上げ` → `/auto on`。同じVCに参加中の人が指定チャンネルへ投稿すると、投稿順に読み上げます。Bot・Webhook・システム投稿、指定外チャンネル、VCにいない人の投稿は対象外です。スレッド、ステージチャンネル、添付ファイルのOCRには対応していません。

## SaydiVoice「私の声1」を使う

音声を作り直す必要はありません。APIキーは、既存の「私の声1」があるアカウントの開発者画面で所有者が設定します。APIキーの提供対象プランと年齢条件は [APIキー設定](docs/SETUP_JA.md) を確認してください。新しい契約は自動で行いません。

```dotenv
SAYDI_API_KEY=ここへ所有者が安全に入力
ENGINE_TERMS_ACCEPTED=voicevox,saydi
```

```sh
npm run voices:saydi
```

この読み取り専用スクリプトは `GET /api/v1/voices` から「私の声1」を検索し、`GET /api/v1/voices/{id}` で状態を確認します。同名の声が複数ある場合は勝手に選びません。音声生成も課金を伴うテストも実行しません。未認証時に成功したと表示することはありません。

再起動後、管理者が以下を実行します。

```text
/voice sync engine:saydi
/admin engine engine:saydi enabled:true
/voice approve engine:saydi id:取得したID rights:true
/engine engine:saydi
/voice set engine:saydi id:取得したID
/say text:みなさん、こんにちは！
```

SaydiVoiceの音声の削除・改名・作成、録音のアップロードを行う機能はありません。Bot内での `/voice revoke` は利用許可を取り消す操作です。外部サービスの音声は削除しません。

## コマンド

|コマンド|内容|権限|
|---|---|---|
|`/join` `/leave`|VC参加・退出|同じVC。管理者は退出を代行可|
|`/say text:...`|一度だけ読み上げ|同じVC|
|`/voice list` `/voice set`|許可済み音声の一覧・選択|全員。server設定は管理者|
|`/voice sync`|APIから一覧を更新|管理者|
|`/voice approve` `/voice revoke`|音声のBot内利用許可・解除|管理者|
|`/engine` `/speed` `/pitch` `/volume`|個人設定。scope:serverは既定設定|server変更は管理者|
|`/auto on` `/auto off`|自動読み上げの有効・無効|管理者|
|`/channel set` `/channel show`|読み上げ用チャンネル|管理者|
|`/skip` `/stop`|生成・再生をスキップ／待機列も削除|同じVC、または管理者|
|`/queue`|生成・再生・待機の状況。本文は非表示|同じVC|
|`/settings` `/help`|設定、日本語ヘルプ、AI音声・クレジット|全員|
|`/profile reset`|個人設定を消去して既定へ戻す|本人|
|`/profile fallback`|別の声になることを了承してVOICEVOX代替を許可|本人|
|`/admin limits`|文字数・連投・待機列・退出時間・日次上限|管理者|
|`/admin engine` `/admin pause`|エンジンの許可・一時停止|管理者|
|`/admin fallback` `/admin usage`|代替音声・文字数利用量確認|管理者|

未対応の高さ・速度調整は説明を表示し、現在の設定を保持します。高さはVOICEVOXのみ対応します。ElevenLabsは選択したモデルが速度調整に対応する場合だけ有効です。音量は全エンジンで再生時に一度だけ適用します。

## 読み上げ・プライバシー

受信時にサーバー別FIFO待機列へ登録し、先頭の文章を合成してから再生します。生成時間による追い越しや割り込みはありません。1サーバーにつき生成・再生は1件ずつ、全サーバー合計の同時合成数にも制限があります。生成前と再生直前にVC参加・権限・利用許可を確認します。

URL、ID形式のメンション、カスタム絵文字を読みやすい表現に置き換え、伏せ字とコードブロックは省略します。本文は待機列と一時音声だけで扱い、データベースや通常ログには保存しません。VCの音声を受信・録音しません。クラウドエンジン利用時は本文を選択先のサービスへ送信します。サービス側でのデータ保持は各社の条件に従います。

再生後とスキップ時に一時ファイルを削除し、クラッシュで残ったBot専用の一時ディレクトリは次回起動時に消去します。音声・本文の待機列は再起動後に復元しません。サーバー設定、個人設定、音声キャッシュ、許可、日次使用量はSQLiteへ保存します。日次上限の更新はUTC 0時＝日本時間9時です。失敗・中断済みのAPI送信も保守的に文字数へ計上するため、請求額と一致する保証はありません。

代替音声は管理者の許可済みVOICEVOX音声と本人の同意が揃った場合だけ使い、切替前に通知します。認証・権限・利用枠不足は代替で回避しません。429はRetry-Afterを守ります。料金重複を避けるため、未知の有料POST通信失敗を無条件に再送しません。

## 開発・運用

```sh
npm run check
npm run security:scan
npm audit --omit=dev --audit-level=high
```

詳細は [開発・構造](docs/ARCHITECTURE.md)、[常時稼働と保守](docs/OPERATIONS.md)、[iPhone実機テスト](docs/ACCEPTANCE_JA.md)、[公式仕様の参照記録](docs/SOURCES.md) を参照してください。

Docker起動は所有者が認証情報・利用条件・稼働先を確認してから行います。

```sh
docker compose build
docker compose up -d
docker compose logs --tail=100 bot
```

非公開GitHubリポジトリへの保存方法は [GitHub手順](docs/GITHUB.md) を参照してください。既存ゲーム・サイトのリポジトリは使用しません。
