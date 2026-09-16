// Cloudflare Worker(ダッシュボードの「Create Worker」→コードエディタに貼り付けて使う。
// wrangler等のCLIやGitHub連携は不要です)。
//
// AI社員(A/B/C/D/E/F)の下書きをGemini無料枠で生成し、結果だけをブラウザへ返します。
// APIキーはこのWorker自身の環境変数(GEMINI_API_KEY)に置くので、ブラウザ側には一切出ません。
// 静的サイト(index.html)とは別のWorkerとして動かすため、CORSを許可しています。
//
// 仕様書47〜48章のプロンプト構造(ROLE/MISSION/INPUT/OUTPUT/RULES)を各社員ごとに埋め込んでいます。

const GEMINI_MODEL = 'gemini-3.5-flash' // 無料枠モデル。将来変更があれば書き換えてください。
const WORKERS_AI_MODEL = '@cf/zai-org/glm-4.7-flash' // Gemini失敗時のフォールバック(無料・APIキー不要)

// CORS: env.ALLOWED_ORIGIN を設定すると、そのオリジンだけに制限されます(推奨)。
// 未設定の場合は '*'(誰でも呼び出し可能)のままなので、セキュリティを上げたい場合は
// このWorkerのSettings → Variables and Secrets で ALLOWED_ORIGIN に自分のpages.dev
// のURL(例: https://ai-company-projects.pages.dev)を設定してください。
function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Site-Secret',
  }
}

const COMPANY_RULES = `
あなたはAI企業シミュレーション組織の一員として働くAI社員です。
以下の会社ルールを必ず守ってください。
・「面白そうだから」という理由だけで判断しない
・誇大な数字や根拠のないスコアを出さない
・違法/詐欺的/著作権侵害/個人情報不正収集/スパム目的のアイデアは提案しない
・出力は必ず指定されたJSON形式のみ。前置き・説明・Markdownのコードフェンスは一切付けない
`.trim()

const PROMPTS = {
  A: (ctx) => `
${COMPANY_RULES}

役割：社員A(IDEA GENERATOR / 発案担当)
目的：中小企業・個人事業主の業務課題やSNS上の悩みから、収益化可能性のある新しいWebツール/SaaSのアイデアを1つ考える。

参考テーマ(任意、あれば考慮する。なければ自由に発想する): ${ctx.hint || 'なし'}

次のJSON形式で1つだけ出力してください。
{
  "title": "アイデア名",
  "problem": "解決する問題(2〜3文)",
  "target": "対象ユーザー",
  "solution": "提案する解決方法(2〜3文)",
  "source": "発案理由・着想元"
}
`.trim(),

  B: (ctx) => `
${COMPANY_RULES}

役割：社員B(PLANNER / 企画担当)
目的：社員Aのアイデアを「事業として成立する企画」に落とし込む。あわせて、Aのアイデアに具体性・市場性・重複性の面で
問題がないか簡単にチェックする(仕様書14.1章：Bによる監視)。

【アイデア】
タイトル: ${ctx.title}
解決する問題: ${ctx.problem}
対象ユーザー: ${ctx.target}
解決方法: ${ctx.solution}

誰が使うか、競合、差別化要素、最低限必要なMVP、ユーザー獲得方法を検討し、
次のJSON形式で出力してください。
{
  "note": "企画メモ(Target/競合/差別化/MVP/ユーザー獲得方法を含む日本語の文章、300字程度)",
  "review": "Aのアイデアの具体性・市場性・既存サービスとの重複がないかの簡単なチェックコメント(日本語、100字程度。問題なければその旨を書く)"
}
`.trim(),

  C: (ctx) => `
${COMPANY_RULES}

役割：社員C(MONETIZER / マネタイズ担当)
目的：企画の収益化可能性を検証し、0〜100のMonetization Scoreを算出する。あわせて簡単な市場調査
(市場規模の見立て・主な競合・ターゲットの支払意欲)も行う。さらに、Bの企画が事業として成立しているか、
収益モデルにつながる内容か、ターゲットが明確かを簡単にチェックする(仕様書14.2章：Cによる監視)。
評価軸：市場需要20点、支払意欲20点、競合優位性15点、利益率15点、継続課金可能性15点、顧客獲得可能性10点、開発コスト5点。

【アイデア】
タイトル: ${ctx.title}
問題: ${ctx.problem}
対象ユーザー: ${ctx.target}
【企画メモ】
${ctx.planningNote || '(なし)'}

次のJSON形式で出力してください。
{
  "note": "収益モデルの検討メモ(サブスク/従量課金/買い切り等の比較を含む日本語の文章、300字程度)",
  "market": "市場調査メモ(市場規模の見立て・主な競合サービス名・ターゲットの支払意欲を含む日本語の文章、300字程度)",
  "score": 0から100の整数,
  "review": "Bの企画が事業として成立しているか・ターゲットが明確かの簡単なチェックコメント(日本語、100字程度)"
}
`.trim(),

  D: (ctx) => `
${COMPANY_RULES}

役割：社員D(EXECUTIVE/PM / 責任者)
目的：企画を実際に開発する価値があるか最終判断する。判断は APPROVED / NEEDS_REVISION / HOLD / REJECTED のいずれか。
「誰が買うのか」「なぜ買うのか」「いくら払うのか」「顧客獲得方法」「開発コストに見合うか」を必ず検討すること。
十分な収益可能性がなければ APPROVED にしないこと。これはあくまで「たたき台」であり、最終判断は人間が行う。
あわせて、Cの売上予測が過大でないか・価格設定が妥当か・顧客獲得方法が現実的かも判断理由の中でチェックする(仕様書14.3章)。

【アイデア】
タイトル: ${ctx.title}
問題: ${ctx.problem}
対象ユーザー: ${ctx.target}
【企画メモ】
${ctx.planningNote || '(なし)'}
【市場調査メモ】
${ctx.marketNote || '(なし)'}
【収益性メモ】
${ctx.moneyNote || '(なし)'}
Monetization Score: ${ctx.score ?? '不明'}

次のJSON形式で出力してください。
{
  "decision": "APPROVED または NEEDS_REVISION または HOLD または REJECTED",
  "reason": "判断理由(日本語、200字程度)"
}
`.trim(),

  E: (ctx) => `
${COMPANY_RULES}

役割：社員E(DEVELOPER / 開発担当)
目的：承認された企画のMVPを実際に検証できる、単一HTMLファイルの簡易プロトタイプコードを書く。
CSS・JSも含めて1ファイルで完結させ、ブラウザで開けば core の機能(入力→処理→結果表示など、
企画の中心的な価値が伝わる最小限の動き)を実際に触って確認できるようにすること。
本番運用コードではなく検証用プロトタイプである旨を意識し、過度に複雑にしないこと。
あわせて、Dが承認した企画がプロトタイプ実装に足る情報を含んでいるか(仕様書・要件の不足がないか)を
簡単にチェックする(仕様書14.4章に準ずる社員間監視)。

【アイデア】
タイトル: ${ctx.title}
解決方法: ${ctx.solution}
【企画メモ】
${ctx.planningNote || '(なし)'}

次のJSON形式で出力してください。code内の改行は \\n でエスケープすること。
{
  "note": "実装したプロトタイプの説明・何を確認できるか(日本語、200字程度)",
  "code": "<!doctype html>から始まる、動作する単一HTMLファイルのソースコード全体",
  "score": 0から100の整数(Code Quality見込みスコア),
  "review": "承認された企画がプロトタイプ実装に足る情報を含んでいるかの簡単なチェックコメント(日本語、100字程度。不足があれば具体的に)"
}
`.trim(),

  F: (ctx) => `
${COMPANY_RULES}

役割：社員F(SALES/MARKETER / 営業担当)
目的：完成したプロトタイプを使って、そのままコピーして使える営業素材を作る(実際のSNS投稿・DM送信は
社員F自身は行わない。送信は必ず人間が行う。仕様書20章：大量無差別DM・スパム・bot化は絶対に禁止)。
あわせて、Eの開発内容が実際に営業しやすい状態(訴求できる機能が明確か)かを簡単にチェックする。

【アイデア】
タイトル: ${ctx.title}
対象ユーザー: ${ctx.target}
問題: ${ctx.problem}
【開発メモ】
${ctx.developmentNote || '(なし)'}

次のJSON形式で出力してください。
{
  "note": "ターゲット業界・訴求ポイント・アプローチ方法のメモ(日本語、200字程度)",
  "posts": ["SNS投稿文案1(120字以内、そのままコピーして使える完成形)", "SNS投稿文案2(切り口を変えたもの、120字以内)"],
  "outreach": "見込み客への個別アプローチ文面テンプレート(DMやメールで使える完成形、200字程度。プレースホルダーは【会社名】のように書く)",
  "score": 0から100の整数(見込みLead/Appointment獲得スコア),
  "review": "開発内容が営業しやすい状態かの簡単なチェックコメント(日本語、100字程度)"
}
`.trim(),
}

async function callGemini(env, prompt) {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY が設定されていません(このWorkerのSettings → Variables and Secrets で追加してください)')
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`)
  }
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  return text
}

async function callWorkersAI(env, prompt) {
  if (!env.AI) {
    throw new Error('Workers AIのAI bindingが設定されていません(このWorkerのSettings → Bindings で追加してください)')
  }
  const result = await env.AI.run(WORKERS_AI_MODEL, { messages: [{ role: 'user', content: prompt }] })
  const text = result?.response || result?.result?.response || result?.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('Workers AIから空の応答が返りました')
  return text
}

// codeフィールドのような長い複数行テキストで、AIが改行のエスケープを忘れた場合の救済処理。
// 文字列内(ダブルクォートの中)にある生の改行だけを \n に変換する。
function repairJsonNewlines(text) {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue }
      if (ch === '\\') { out += ch; escaped = true; continue }
      if (ch === '"') { inString = false; out += ch; continue }
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { continue }
      if (ch === '\t') { out += '\\t'; continue }
      out += ch
    } else {
      if (ch === '"') { inString = true; out += ch; continue }
      out += ch
    }
  }
  return out
}

function extractJson(text) {
  const cleaned = text.replace(/```json|```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('AIの出力からJSONを取り出せませんでした: ' + cleaned.slice(0, 200))
  const jsonText = cleaned.slice(start, end + 1)
  try {
    return JSON.parse(jsonText)
  } catch (e) {
    try {
      return JSON.parse(repairJsonNewlines(jsonText))
    } catch {
      throw new Error('AIの出力をJSONとして解析できませんでした: ' + e.message)
    }
  }
}

// ---------------------------------------------------------------------------
// プロバイダー登録リスト ― 新しい無料APIを追加したいときはここに1行足すだけでOK。
// 上から順番に試し、失敗したら次を試す(自動フォールバック)。
// 例: Groqを足したい場合 → async function callGroq(env, prompt) {...} を書いて
//     下の配列に { name: 'groq', call: callGroq } を追加するだけ。
// ---------------------------------------------------------------------------
const PROVIDERS = [
  { name: 'gemini', call: callGemini },
  { name: 'workers-ai', call: callWorkersAI },
]

async function generateWithFallback(env, prompt) {
  const errors = []
  for (const provider of PROVIDERS) {
    try {
      const rawText = await provider.call(env, prompt)
      const data = extractJson(rawText)
      return { data, provider: provider.name, errors }
    } catch (err) {
      errors.push(`${provider.name}: ${String(err.message || err)}`)
    }
  }
  throw new Error(errors.join(' / '))
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env)
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } })

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors })
    }
    if (request.method === 'GET') {
      return json({ ok: true, message: 'POSTで employeeKey と ctx を送ってください' })
    }
    if (request.method !== 'POST') {
      return json({ ok: false, error: 'POSTのみ対応しています' }, 405)
    }

    // 共有シークレット(任意)：env.API_SHARED_SECRET を設定すると、
    // 同じ値を X-Site-Secret ヘッダーで送ってきたリクエストだけを受け付けます。
    // index.html側のAPI_SHARED_SECRETと同じ値にしてください。未設定なら誰でも呼べます。
    if (env.API_SHARED_SECRET) {
      const provided = request.headers.get('X-Site-Secret')
      if (provided !== env.API_SHARED_SECRET) {
        return json({ ok: false, error: '認証に失敗しました(X-Site-Secretが一致しません)' }, 401)
      }
    }

    let employeeKey, ctx
    try {
      const body = await request.json()
      employeeKey = body?.employeeKey
      ctx = body?.ctx
    } catch {
      return json({ ok: false, error: 'リクエストの形式が不正です' }, 400)
    }

    if (!PROMPTS[employeeKey]) {
      return json({ ok: false, error: `未対応の employeeKey: ${employeeKey}` }, 400)
    }

    const prompt = PROMPTS[employeeKey](ctx || {})

    try {
      const { data, provider, errors } = await generateWithFallback(env, prompt)
      return json({ ok: true, data, provider, ...(errors.length ? { fallbackErrors: errors } : {}) })
    } catch (err) {
      return json({ ok: false, error: String(err.message || err) }, 500)
    }
  },
}
