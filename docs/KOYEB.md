# Koyebへの導入

GitHub連携でこの非公開リポジトリの main を選び、Web Service として作成します。ビルダーは Dockerfile、パスは `deploy/Koyeb.Dockerfile`、ビルドコンテキストはリポジトリのルートです。起動コマンドは空欄です。

Standard CPUの固定1インスタンスを選び、同じリージョンのVolumeを `/mnt/bot` にマウントしてください。料金見積もりを確認してからデプロイします。SQLiteは `/mnt/bot/state/bot.sqlite` に保存します。Volumeはプレビューのため別途バックアップしてください。

HTTPポート8000、ルート / 、HTTPヘルスチェック /readyz を設定します。GET / は起動中に OK を返し、/readyz はDiscordへの接続完了時に200になります。起動時に指定サーバーのコマンドを登録します。

| 環境変数 | 値 |
|---|---|
| DISCORD_TOKEN | Koyeb SecretでBotトークンを登録して参照 |
| DISCORD_CLIENT_ID | DiscordのApplication ID |
| DISCORD_GUILD_ID | 招待済みサーバーのID |
| GPT_SOVITS_URL | Docker設定済み。https://pope-polymer-restructuring-sizes.trycloudflare.com |
| GPT_SOVITS_PROMPT_TEXT | Docker設定済み。私は姫乃きさら。担当は原画。このくらいでいいでしょ？ |
| MESSAGE_CONTENT_ENABLED | 自動読み上げ用にPortalでIntentを有効にした場合 true |
| VOICEVOX_URL | VCでVOICEVOXを使う場合は別途稼働させるエンジンURL |
| ENGINE_TERMS_ACCEPTED | 利用条件を確認したVC用エンジン（VOICEVOXなら voicevox） |

参照音声の利用許諾を確認してから /wav を有効なサーバーで使います。/wav はAPI側の /content/GPT-SoVITS/ref.wav を参照し、Discordチャンネルにファイルとして返信します。Botにファイル添付権限が必要です。GPT-SoVITSも継続して稼働させ、トンネルURLが変わったら GPT_SOVITS_URL を更新して再デプロイしてください。
