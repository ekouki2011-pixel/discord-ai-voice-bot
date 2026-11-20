# 所有者の設定手順

## Discord Developer Portal

1. Safariで https://discord.com/developers/applications を開き、本人のアカウントでログインします。
2. New ApplicationでBot専用のアプリを作成します。名前例：日本語AI読み上げBot。
3. General InformationのApplication IDを `DISCORD_CLIENT_ID` に設定します。Application IDはBotトークンではありません。
4. Bot画面でBotのトークンを発行し、ホストのシークレット機能または `.env` の `DISCORD_TOKEN` に入力します。画面・チャット・GitHubに貼り付けないでください。漏れた場合はPortalで再発行します。
5. 自動読み上げを使う場合だけ、Bot → Privileged Gateway Intents → Message Content Intentを有効にします。Server Members Intent、Presence Intentは不要です。
6. Botの公開範囲は必要なサーバーに限定します。Public Botを無効にできる構成では無効にします。自分以外へ広く公開する場合は、公開前に所有者が判断します。
7. Discordアプリの詳細設定で開発者モードを有効にし、検証サーバーのメニューからIDをコピーして `DISCORD_GUILD_ID` に保存します。
8. `npm run commands:register` で検証サーバーのスラッシュコマンドを登録します。グローバル登録は `DISCORD_GUILD_ID` を空にして明示的に再実行します。

Message Content Intentは特権Intentです。Portalの設定と実行時の `MESSAGE_CONTENT_ENABLED=true` を一致させます。100以上のサーバーへ参加するBotは認証と必要なIntent審査が必要です。未許可時に切断コード4014が出る場合は、設定を正規に許可するか、環境変数をfalseに戻して `/say` を使用します。制限を回避する仕組みはありません。

## サーバーへの招待

OAuth2のURL Generatorを使う場合、Scopesに `bot` と `applications.commands`、Bot Permissionsに View Channels / Send Messages / Connect / Speakを指定します。InstallationではGuild Installを使用します。Administrator、Manage Server、Read Message History、Manage Messages、Move Membersは付けません。

`npm run commands:register` も同じ最小権限の招待URLを表示します。所有者がURLを開き、追加先を確認して招待を確定します。テキスト・VCのチャンネル権限上書きでも必要権限が許可されていることを確認します。

Botの管理コマンドを実行する人にはDiscordの「サーバー管理」権限が必要です。Bot自身へ「サーバー管理」権限を付ける必要はありません。

## APIキー・利用条件

共通：必要なキーだけをシークレット設定に保存します。`.env.example` は空欄のテンプレートです。キーを設定しただけではクラウドエンジンは有効になりません。運用者自身が年齢・プラン・権利条件を確認し、`ENGINE_TERMS_ACCEPTED` に対象エンジンを追加します。追加契約・購入・規約への同意は所有者の操作です。

|エンジン|キー・接続先|確認事項|
|---|---|---|
|VOICEVOX|`VOICEVOX_URL`。ローカル利用はキー不要|話者ごとのライセンスとクレジット。必要なら話者の個別規約も確認|
|SaydiVoice|`SAYDI_API_KEY`|既存音声と同じアカウントのDevelopers → API Keys。公式案内はCreator以上がAPIキー対象。16歳未満は保護者の同意・監督が必要|
|ElevenLabs|`ELEVENLABS_API_KEY`|公式利用規約では18歳未満は利用不可。利用資格を満たす場合だけ接続。既定モデルは日本語対応の `eleven_multilingual_v2`|
|Fish Audio|`FISH_API_KEY`|アカウントのAPIキー。18歳未満は保護者の許可が必要。APIの残高・利用権限はWebプランと別に確認|

2026年11月21日確認。規約・プランは更新されるため、利用開始前にも [参照先](SOURCES.md) を確認してください。無料枠を超える利用をBot側から契約・購入することはありません。

### SaydiVoiceの「私の声1」

1. 「私の声1」が保存されている本人アカウントでDevelopers画面を開きます。
2. APIキーの利用権限・プランを確認します。キーが発行できなければ購入せず、VOICEVOXで運用を先に進められます。
3. キーを `SAYDI_API_KEY` へ安全に設定し、利用条件確認済みの場合に `ENGINE_TERMS_ACCEPTED=voicevox,saydi` とします。
4. `npm run voices:saydi` またはBotの `/voice sync engine:saydi` を実行します。
5. 一覧に「私の声1」があり状態がreadyなら、表示されたIDを利用します。同名が複数ならIDを照合します。
6. processingなら待って再同期します。failed・ref_missingでも再作成や再アップロードは自動で行いません。本人がサービスへ問い合わせるなどして判断してください。
7. 管理者が利用許諾を確認し、`/admin engine`、`/voice approve`、`/engine`、`/voice set` を設定します。その後の `/say` は音声生成APIを呼びます。

401はキー、403は権限・アカウント状態、402またはinsufficient_quotaはプラン・残高、429はレート・同時実行制限を確認します。取得できていないIDを推測で入力する必要はありません。

### 追加エンジン

ElevenLabsは利用資格を満たす運用者がキーを設定し、`ENGINE_TERMS_ACCEPTED` へ `elevenlabs` を追加して再起動します。`/voice sync engine:elevenlabs` でアカウントの声を同期し、管理者が許可後に選択します。`/admin usage engine:elevenlabs` は契約情報の読み取りだけを行い、使用量・上限・取得可能な次回請求情報を表示します。料金額は通貨の最小単位で返されるため、請求管理画面でも確認してください。

Fish Audioも同様に `fish` を追加します。モデル一覧は `self=true` で現在のワークスペースが所有するモデルだけ取得します。コミュニティの声を無差別に登録しません。`reference_id` に保存済みモデルIDを指定して生成します。APIモデル名は `FISH_MODEL` で選択でき、既定値は公式例の `s2.1-pro-free` です。名称だけで無料利用を保証するものではありません。
