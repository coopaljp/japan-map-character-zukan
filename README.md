# 日本地図キャラずかん

小学校4年生向けに、47都道府県の県名、県庁所在地、地図上の位置をくり返し学ぶWebアプリです。

## 使用技術

- React
- TypeScript
- Vite
- localStorage
- Geolonia japanese-prefectures のSVG地図

## セットアップ

```bash
npm install
```

## 起動方法

```bash
npm run dev
```

ビルド確認:

```bash
npm run build
```

## GitHub Pagesで公開する方法

このリポジトリには、GitHub Actionsで `dist` をGitHub Pagesへ公開するワークフローを含めています。

1. GitHubで公開リポジトリを作成します。
2. このフォルダをGit管理し、GitHubへpushします。
3. GitHubのリポジトリ画面で `Settings` → `Pages` を開きます。
4. `Build and deployment` の `Source` を `GitHub Actions` にします。
5. `main` ブランチへpushすると、`.github/workflows/deploy-pages.yml` が実行されます。
6. Actions完了後、`https://ユーザー名.github.io/リポジトリ名/` で公開されます。

このアプリはGitHub Pagesのサブパス公開に対応するため、Viteの `base` をActions内でリポジトリ名に合わせて指定しています。

## 画面構成

- `/` ホーム
- `/map` 日本地図
- `/region/:regionId` 地方ステージ
- `/prefecture/:prefectureId` 都道府県カード
- `/quiz` クイズ
- `/review` 今日の復習
- `/dex` ご当地キャラずかん
- `/stats` 成績

## 進捗データ

進捗は `localStorage` の `japan-map-character-zukan-progress-v2` に保存します。都道府県ごとに以下を持ちます。

- `visited`
- `learningStatus`
- `nameCorrectCount` / `nameWrongCount`
- `locationCorrectCount` / `locationWrongCount`
- `capitalCorrectCount` / `capitalWrongCount`
- `lastCorrectAt`
- `lastWrongAt`
- `nextReviewAt`
- `firstClearedAt`
- `reviewSuccessCount`
- `lastReviewCorrectAt`
- `characterStage`
- `isWeak`

## 学習状態

- 未学習
- 学習済み
- 初回クリア
- 復習待ち
- 定着中
- マスター

初回正解だけではマスターにしません。初回正解後は翌日以降の復習対象になり、日付をまたいだ復習正解を経て定着中、条件を満たすとマスターになります。

## キャラクター画像の追加方法

MVPでは都道府県ごとに基本画像1枚で始めます。

```text
public/characters/base/hokkaido.png
public/characters/base/aomori.png
public/characters/base/iwate.png
public/characters/base/tokyo.png
public/characters/base/osaka.png
public/characters/base/fukuoka.png
public/characters/base/okinawa.png
```

画像がない場合はプレースホルダーを表示します。

将来、成長段階ごとの差分を追加する場合は以下のように配置できます。

```text
public/characters/hokkaido/met.webp
public/characters/hokkaido/friendly.webp
public/characters/hokkaido/buddy.webp
public/characters/hokkaido/master.webp
```

表示優先順位は、成長段階ごとの画像、基本画像、プレースホルダーです。現在のMVPでは、添付のキャラクター一覧画像から切り出したPNGを `public/characters/base/` に配置しています。

共通装飾画像を追加する場合は以下を想定しています。

```text
public/characters/effects/heart.webp
public/characters/effects/sparkle.webp
public/characters/effects/crown.webp
public/characters/effects/master-frame.webp
```

現時点では装飾画像がなくてもCSSと記号で表示できます。

## 地図素材とライセンス

日本地図SVGは [Geolonia japanese-prefectures](https://github.com/geolonia/japanese-prefectures) の以下のファイルを `public/maps/` に配置して利用しています。

- `map-full.svg`
- `map-mobile.svg`

各都道府県の `data-code` をアプリ内の47都道府県データと紐づけ、クリック遷移、学習状態による色分け、地図タップクイズの正誤判定に使っています。

Geolonia japanese-prefectures のREADMEには、ライセンスが GFDL と記載されています。利用時は同リポジトリのREADMEとライセンス表記を確認してください。

## 今後の改善案

- 地図のラベル表示や地方別表示の改善
- 翌日、3日後、7日後のより細かい復習スケジュール
- クイズ出題数と結果サマリーの強化
- ふりがな表示の拡充
- キャラクター画像の追加
