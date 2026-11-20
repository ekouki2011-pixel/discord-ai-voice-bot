# 検証記録と残課題

作成日：2026年11月21日（日本時間）。この記録の「通過」は記載した範囲の検証結果です。Discordへの実接続や各クラウド音声の実生成を、モック試験だけで完成扱いしません。

## 検証済み

|検証|結果|使用した対象|
|---|---|---|
|TypeScript型チェック|通過|`npm run typecheck`、Node.js 24.22.3、24系のNode型定義|
|Lint|通過|`npm run lint`|
|自動テスト|55件通過|7テストファイル。内訳の分類は下記|
|ビルド|通過|`npm run build`。実行可能JSを生成|
|本番依存の脆弱性監査|0件|`npm audit --omit=dev --audit-level=high` 実行時点|
|VOICEVOX実接続|通過|公式Linux CPUエンジン0.26.2。モック起動フラグなし|
|VOICEVOX実日本語合成|通過|ずんだもん・ノーマル（スタイル3）。739,372 bytesのWAVを生成|
|生成音声のFFmpegデコード|通過|実VOICEVOX生成データを実FFmpegで処理|
|FFmpeg → Opus変換|通過|実FFmpeg、opusscript、@discordjs/voiceのAudioResource|
|本番の再生処理・一時ファイル削除|通過|実AudioPlayerとFFmpeg。ネットワーク接続部のみローカルの準備完了fixture|
|再生中断・FFmpeg起動失敗時の削除|通過|実一時ファイル・プロセスを使うテスト|
|DAVE依存のロード|通過|@discordjs/voice 0.19.2、@snazzah/davey 0.1.12。実DAVE交渉は未検証|
|SQLite保存・再起動相当の再読込|通過|実SQLiteファイルのclose/reopen|
|SQLiteバックアップ・隔離復元比較|通過|稼働WALのbackup、別DBへ復元して設定・日次使用量を比較|
|Docker用VOICEVOXヘルスチェック|通過|実エンジンへBashのHTTP要求を送信|
|Compose・CIのYAML構文|通過|YAMLの読み込み検査。Docker自身による検証は未実施|
|未設定認証時の案内|確認済み|SaydiVoice一覧スクリプト、Discordコマンド登録スクリプトが認証待ちを表示|

## 自動テストの範囲

投稿順、生成遅延、割り込み防止、生成中skip、再生中stop、stop後の新規受付、サーバー分離、合成数上限、失敗後の次件再生、待機列上限、本文非表示を検証しました。

管理権限、scope:serverの変更拒否、自動読み上げ対象チャンネル、Bot・Webhook・VC外投稿の除外、URL・メンション・伏せ字処理、連投制限、個人音声と既定音声、日次予算の原子的な加算、権限変更後の再生拒否、本人同意のある代替と通知を検証しました。

SaydiVoice・ElevenLabs・Fish Audioは公式の要求形式とfixture応答を使うモックです。既存「私の声1」の名前検索・ready判定・同名重複・認証不足、speech要求、誤った音声への置換拒否、ElevenLabs一覧のページ取得・利用量読み取り、Fishの所有モデル取得を検証しました。これらは実アカウントへの接続確認ではありません。

HTTPは429のRetry-After、過長の待機指示、認証・課金・入力エラーの再送抑止、JSON音声エラー、データ上限、通信中断を検証しました。別途、ローカルHTTPサーバーへ実通信し、認証ヘッダー・日本語JSON・バイナリ受信を確認しました。

## 修正した不具合

- VOICEVOX 0.26.2の実応答にある `streaming_talk` を認識し、一覧・選択に含めるよう修正。
- 実行環境でtsx CLIのIPCソケットが使えないため、補助コマンドを `node --import tsx` で起動する方式へ修正。
- 外部APIの生成中に投稿者のVC参加・権限が変わった場合、再生直前にも確認して本文が流れないよう修正。
- キャンセルとAudioPlayerのIdleイベントが重なった場合の完了処理を一度に限定。
- Docker公式VOICEVOXイメージにcurlがあると仮定せず、Bashによるヘルスチェックへ変更。
- VOICEVOXの本文付きアクセスログをComposeで保存しない構成に変更。

## 所有者の設定・実機確認待ち

|項目|状態・必要条件|
|---|---|
|Discord接続・コマンド登録・招待|認証待ち。Botトークン、Application ID、検証サーバーID、所有者の招待操作が必要|
|Discord VCの実音声再生|未検証。P0の最終条件は未達。トークン設定後に実VCで確認|
|Discord DAVEの実交渉|未検証。対応コードと依存は準備済み|
|実Discordでの自動読み上げ|未検証。Message Content Intentの正規許可が必要|
|切断・再接続の実VC挙動|未検証。復旧処理は実装済み|
|iPhone Discordでの操作|未検証。手順はACCEPTANCE_JA.mdに用意|
|SaydiVoice「私の声1」の実ID|認証・利用条件確認待ち。SAYDI_API_KEYは未設定。ID取得成功とは報告しない|
|SaydiVoice実合成・VC再生|未検証。readyと音声の利用許諾を確認後に実施|
|ElevenLabs実接続|未検証・無効。18歳以上等の利用条件を満たす運用者が必要|
|Fish Audio実接続|未検証・無効。キー、API利用権限、必要な保護者許可、モデルの使用許諾が必要|
|Dockerビルド・Compose起動|未検証。この環境にはDockerコマンドがない|
|GitHub保存・リモートCI|本人の新規リポジトリ作成用ログイン待ち。接続先のGitHubツールにはリポジトリ作成機能がない|
|常時稼働先への導入|稼働先・料金・本番起動の承認待ち。契約・課金・公開は実行していない|

ローカルのGit履歴とソース一式を保存対象とし、GitHub保存が未完了の場合も再開できます。リポジトリURL・リモートSHAは実際の保存を確認してから報告します。ローカル最終SHAは `git rev-parse HEAD` で確認できます。
