# AI COMPANY — Web完結版(ビルド不要・コマンドプロンプト不要)

前回渡したVite版と同じ機能を、**実装〜デプロイ〜利用まで一切ターミナルを使わずに**動かせるようにした版です。
`npm install` も `npm run build` も `git push` コマンドも出てきません。すべてブラウザの画面操作だけで完結します。

さらに、AI社員の下書きを **Gemini API(無料枠)** で自動生成できる「🤖 AIに下書きさせる」ボタンを追加しました。
Geminiがレート制限などで使えないときは、**Cloudflare Workers AI(無料・APIキー不要)** に自動でフォールバックします。
どちらが下書きしたかはボタンの下に表示されます。
人が最終確認して「記録する」を押すまでは何も保存されないので、判断の主導権は引き続き人間にあります。

## 構成(2つのCloudflareプロジェクトに分かれています)

デプロイ中に「Variables cannot be added to a Worker that only has static assets」というエラーが出た方向けの
更新版です。Cloudflareが「静的ファイルだけのPagesプロジェクト」と「コードを実行するWorker」を明確に区別する
仕様になっており、静的ファイルだけのプロジェクトには環境変数やAI bindingを追加できません。
そのため、次の2つに分けます。

1. **静的サイト(index.html)** → Cloudflare Pages(前回と同じ、GitHub経由)
2. **AI呼び出し用のWorker** → Cloudflareの画面で直接コードを貼り付けて作る、独立したWorker
   (GitHubもFunctionsフォルダも使いません。ここに環境変数とAI bindingを設定します)

## ディレクトリ構成(プロジェクトルート = `ai-company-web/`)

```
ai-company-web/
├── index.html              # 静的サイト本体(GitHub経由でCloudflareにデプロイする)
├── wrangler.jsonc          # 静的サイト用Workerのビルド設定(GitHubにアップロードする)
├── site-worker.js          # 静的サイトにBasic認証をかけるWorker(GitHubにアップロードする)
├── worker/
│   └── generate.js         # AI呼び出し用Worker(Cloudflareのコードエディタに貼り付ける。アップロード不要)
└── supabase/
    └── schema.sql           # Supabaseに1回だけ流すSQL(前回と同じ内容)
```

## 1. Supabaseのセットアップ(前回と同じ。まだの場合のみ)

1. https://supabase.com で無料プロジェクトを作成(リージョンはTokyo推奨)。
2. 左メニュー「SQL Editor」で `supabase/schema.sql` の中身を貼り付けて実行。
3. 左下の歯車アイコン(Project Settings)→「**Data API**」で **Project URL** をコピー。
4. 同じくProject Settings→「**API Keys**」→「API Keys」タブで、なければ「Create new API Keys」を押し、
   **Publishable key**(`sb_publishable_...`)をコピー。

## 2. Geminiの無料APIキーを取得する

1. https://aistudio.google.com/apikey を開き、Googleアカウントでログイン。
2. 「Create API key」をクリックし、表示されたキーをコピーする(無料・クレジットカード不要)。

## 3. AI呼び出し用のWorkerを作る(GitHub不要)

1. https://dash.cloudflare.com にログインし、左メニュー「**Workers & Pages**」を開く。
2. 「**Create application**」→「**Create Worker**」を選ぶ(Pagesではなく、通常のWorkerです)。
3. 名前は何でも構いません(例：`ai-company-api`)。「Deploy」を押すといったんサンプルコードで
   デプロイされます。
4. デプロイ後、「**Edit code**」(コードエディタ)を開き、中身を全部削除して、
   `worker/generate.js` の内容をまるごと貼り付けて「**Deploy**」を押す。
5. 「**Settings**」タブ→「**Variables and Secrets**」で `GEMINI_API_KEY` を追加し、手順2のキーを設定する。
6. 同じく「**Settings**」内の「**Bindings**」で「Add binding」→「AI」を選び、変数名を `AI` にして追加する
   (Workers AIへのフォールバック用。APIキーは不要)。
7. Worker概要画面に表示されている `https://xxxx.yyyy.workers.dev` のようなURLをコピーしておく
   (これが次の手順で使う `API_BASE_URL` です)。

このWorkerは通常のコードWorkerなので、Pagesのときと違って環境変数やbindingを問題なく追加できます。

## 4. index.htmlに接続情報を書き込む

`index.html` をテキストエディタで開き、上のほうにある3行を、それぞれ自分の値に書き換えて保存します。

```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY'   // 手順1-4のPublishable key
const API_BASE_URL = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev'  // 手順3-7のURL
```

Geminiのキーはここには書きません(手順3-5でWorker側にだけ設定済みです)。

## 5. GitHubにアップロードする(ターミナル不要)

1. https://github.com/new で新しいリポジトリを作成(Public/Privateどちらでも可)。
2. リポジトリ画面の「Add file → Upload files」を開き、`index.html` をドラッグ&ドロップしてアップロードし、
   「Commit changes」を押す(`worker` フォルダと `supabase` フォルダはアップロード不要です。
   手順3で直接貼り付け済み、手順1で直接実行済みのため)。

## 6. Cloudflare Pagesで静的サイトをデプロイする

1. https://dash.cloudflare.com → **Workers & Pages → Create application → Pages → Connect to Git** で、
   手順5のリポジトリを選ぶ。
2. ビルド設定は次のようにする。
   - Build command: (空欄のまま)
   - Build output directory: `/`
3. 「Save and Deploy」を押すと `https://ai-company-xxxx.pages.dev` のようなURLが発行されます。

これで完成です。ブックマークしたそのURLをPC・スマホどちらからでも開けば、いつでも同じ会社の状態を
確認・操作できます。何かファイルを更新したいときは、GitHubの画面から該当ファイルを開いて
「Edit(鉛筆アイコン)」→ 保存するだけで、Cloudflare Pagesが自動的に再デプロイします。

## 使い方

- 「+ 新しいアイデアを登録」→「🤖 AIに考えてもらう」でアイデアの下書きが自動生成されます。
  内容を確認・修正してから「Bへ提出」を押してください。
- 各プロジェクトカードの「Bへ：企画を作成」などのボタンを押すと、その工程用のフォームが開きます。
  ここでも「🤖 AIに下書きさせる」でAIに下書きさせられます。社員Dの承認判断も同様に
  たたき台を出せますが、**最終的に決定ボタンを押すのは必ず人間です**。
- 社員C(マネタイズ担当)は収益性メモに加えて**市場調査メモ**(市場規模・競合・支払意欲)も下書きします。
- AIの下書きには、前工程の内容に不足や問題がないかをチェックする**確認コメント**(仕様書14章の
  相互監視に対応)もあわせて表示されます。これは記録には保存されず、その場の判断材料としてのみ表示されます。
- オフィス画面では、今まさに作業中の社員のアバターが光る演出になり、誰から誰へ仕事が引き継がれているかが
  「🔗 ○○と連携中」のバッジと、MEETING ROOM内の矢印表示で分かるようになっています。
- AI呼び出しが失敗した場合(無料枠のレート制限超過、キー未設定など)は、ボタンの下に
  エラーメッセージが表示されます。しばらく待つか、手動でClaude Web等の内容を貼り付けて進めてください。

## セキュリティについて

- GEMINI_API_KEYはWorker自身の環境変数にのみ保存され、ブラウザ側には出力されません。
- SUPABASE_ANON_KEY(Publishable key)はindex.htmlの中に直接書きます(ブラウザから見える状態に
  なりますが、この鍵はもともと公開される前提のもので、実際のアクセス制御は`schema.sql`で設定した
  Row Level Securityが担っています)。
- **サイト全体にログイン(Basic認証)を追加しました。** 静的サイト用Worker(`site-worker.js`)の
  Settings → Variables and Secrets で `SITE_PASSWORD`(必須)と `SITE_USER`(任意、未設定なら
  `admin`)を設定すると、ブラウザで開いたときにユーザー名とパスワードを求められるようになります。
  設定しなければ今まで通り誰でも開けます。
- **API用Workerにも共有シークレットを追加できます。** API用Worker(`generate.js`をデプロイした
  ほう)のSettings → Variables and Secretsで `API_SHARED_SECRET` を設定し、index.html冒頭の
  `API_SHARED_SECRET` を同じ値に書き換えると、このシークレットを知らない相手からのAI呼び出しを
  拒否するようになります(ブラウザのソースに書く値なので、サイト自体にBasic認証がかかっていない
  状態だと完全な秘密にはなりません。上記のBasic認証と合わせて使うのがおすすめです)。
- **CORSも制限できます。** API用WorkerのSettings → Variables and Secretsで `ALLOWED_ORIGIN` に
  自分のpages.dev URL(例: `https://ai-company-projects.pages.dev`)を設定すると、他のサイトから
  このAPIを呼び出せなくなります。未設定なら今まで通りどこからでも呼べます。
- ここまで設定すると、「サイトはパスワードでロック」「APIも合言葉がないと呼べない」「APIは自分の
  サイトからしか呼べない」の3段構えになります。とはいえBasic認証は簡易的なものなので、より本格的な
  認証が必要な場合はCloudflare Access(無料枠あり)の併用も検討してください。

## 他の無料AI APIを併用したい場合

`worker/generate.js` は `PROVIDERS` という配列で使用するAPIを管理しています。まずGeminiを試し、
失敗したら次のプロバイダーへ自動的にフォールバックします。新しいAPI(Groq・Mistral・OpenRouterなど)
を追加したい場合は、`callGemini` と同じ形の関数(`async function callXxx(env, prompt) { ... }`)を
書いて、`PROVIDERS` 配列に `{ name: 'xxx', call: callXxx }` を1行足すだけで組み込めます。
どのサービスを使いたいか、また特定の社員だけ別サービスにしたい等の希望があれば教えてください。

## 前回のVite版について

前回渡した `ai-company`(Vite+React)フォルダは削除しなくても問題ありません。将来的に本格的な
ビルドパイプラインやテストを整えたくなった場合の選択肢として残しておけます。ただし今後の追加開発は、
まずこちらのWeb完結版をベースに進めます。
