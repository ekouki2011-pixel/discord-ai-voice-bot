# 公式仕様の参照記録

確認日：2026年11月21日（日本時間）。API・規約・料金・ライブラリは変わるため、運用開始時と更新時に再確認してください。以下は実装に使用した一次資料です。

|対象|一次資料|反映した点|
|---|---|---|
|Discord VC/DAVE|https://docs.discord.com/developers/topics/voice-connections |2026年3月以降のE2EE要件、現行VC接続|
|Discord Gateway|https://docs.discord.com/developers/events/gateway |Message Content特権Intent、認証・審査、最小Intent|
|@discordjs/voice|https://discord.js.org/docs/packages/voice/0.19.2 |npmのstable 0.19.2を固定。DAVE同梱依存と既定有効を確認|
|SaydiVoice API|https://voice.saydi.ai/docs/ と https://voice.saydi.ai/llms-full.txt |Bearer認証、既存音声一覧・単体状態、speechバイナリ、JSONエラー、Retry-After、実音声ヘッダー|
|SaydiVoice API対象プラン|https://voice.saydi.ai/en/text-to-speech-api/ |APIキーはCreator以上との案内。契約を自動実行しない|
|SaydiVoice利用規約|https://voice.saydi.ai/en/terms/ |16歳・法的能力、16歳未満の保護者同意・監督、声の権利条件|
|VOICEVOX ENGINE|https://github.com/VOICEVOX/voicevox_engine |speakers、audio_query、synthesis、スタイルID、Docker構成|
|VOICEVOX API|https://voicevox.github.io/voicevox_engine/api/ |起動中エンジンの /docs と /openapi.json も併用|
|VOICEVOXリリース|https://github.com/VOICEVOX/voicevox_engine/releases/tag/0.26.2 |公式Linux CPUエンジンによる実接続試験|
|VOICEVOX利用規約|https://voicevox.hiroshiba.jp/term/ |各音声ライブラリ規約とVOICEVOXクレジット|
|試験話者の規約|https://zunko.jp/con_ongen_kiyaku.html |ずんだもんの音声クレジットと用途条件|
|VOICEVOX動作環境|https://voicevox.hiroshiba.jp/qa/ |CPU版・Linux対応。運用資料のRAM・CPU数値は本プロジェクトの見積もり|
|公式CPUイメージ|https://hub.docker.com/r/voicevox/voicevox_engine/tags |cpu-0.26.2の存在、CPUアーキテクチャ、容量|
|ElevenLabs音声生成|https://elevenlabs.io/docs/api-reference/text-to-speech/convert |xi-api-key、明示モデルID、日本語本文、バイナリ音声|
|ElevenLabs一覧|https://elevenlabs.io/docs/api-reference/voices/search |GET /v2/voices、has_moreとnext_page_tokenによるページ取得|
|ElevenLabs利用量|https://elevenlabs.io/docs/api-reference/user/subscription/get |利用量・上限・取得可能な次回請求情報の読み取り|
|ElevenLabs速度|https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech |対応モデルの0.7〜1.2。モデルごとの非対応を明示|
|ElevenLabs利用規約|https://elevenlabs.io/terms-of-use |18歳未満利用不可。未適格の利用者向けには有効化しない|
|Fish Audio音声生成|https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech |Bearer、modelヘッダー、JSONのreference_idとprosody|
|Fishモデル一覧|https://docs.fish.audio/api-reference/endpoint/model/list-models |ワークスペース所有モデル、ページ取得|
|Fish利用規約|https://fish.audio/terms/ |年齢条件と18歳未満の保護者許可|

ローカルVOICEVOX 0.26.2の実応答で `streaming_talk` スタイルを確認し、従来の `talk` と合わせて一覧へ含めるよう修正しました。API仕様とのモック整合だけで最新エンジンとの実互換を保証せず、実接続結果を別記録にします。
