# GitHubへ非公開保存する手順

このプロジェクトは新規専用リポジトリ用です。既存ゲーム・サイトのリポジトリへ保存しません。GitHubリポジトリが作成・保存されたという確認がない場合、URLやremote保存済みSHAを推測で報告しません。

所有者がGitHubへログインし、`discord-ai-voice-bot` という新しい **Private** リポジトリを作成します。名前が既に使われている場合は別名を選択してください。GitHubからReadmeや.gitignoreを自動追加せず、空のリポジトリにすると既存のローカル履歴をそのまま送れます。

GitHub CLIを利用する場合、所有者が正規の認証を完了してから以下を実行できます。

```sh
gh auth login
gh repo create discord-ai-voice-bot --private --source=. --remote=origin
git push -u origin main
```

リポジトリをWebで作成した場合は、画面で確認した正確なHTTPS URLを `git remote add origin` に指定してからpushします。既存のoriginがあるときは内容を確認し、勝手に別リポジトリへ差し替えません。

```sh
git remote -v
git status --short
npm run check
npm run security:scan
git push -u origin main
git rev-parse HEAD
```

送信後、GitHubのPrivate表示、mainのSHA、ソースとCI結果を確認します。非公開リポジトリのActionsにも利用枠があり得るため、残高・実行枠を所有者が管理してください。GitHub Actionsに音声APIキー・Discordトークンを渡す必要はありません。

配布ZIPに `git-history.bundle` が含まれる場合、履歴は次で復元できます。

```sh
git clone git-history.bundle discord-ai-voice-bot
cd discord-ai-voice-bot
```

ZIP内の通常ソースも独立して使用できます。`node_modules`、実 `.env`、SQLiteデータ、APIキー、VOICEVOX本体は配布物に含めません。公開リポジトリへの変更は所有者の明示承認が必要です。
