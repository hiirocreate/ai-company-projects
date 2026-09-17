// AI COMPANY ― 静的サイト用Worker(Cloudflare Pagesの"Advanced mode"用。ファイル名は必ず _worker.js のままにすること)
//
// index.html(静的アセット)を配信する前に、簡易的なBasic認証でログインを求めます。
// これにより、URLを知っているだけでは中身を見られなくなります。
//
// 設定方法(このWorkerのダッシュボード → Settings → Variables and Secrets):
//   SITE_PASSWORD ― 必須。ログイン用パスワード。
//   SITE_USER     ― 任意。ログイン用ユーザー名(未設定なら "admin")。
//
// SITE_PASSWORDを設定しない間は、誰でも認証なしでアクセスできます
// (前回までの動作と同じ。まずは動作確認してから設定することもできます)。

export default {
  async fetch(request, env) {
    if (env.SITE_PASSWORD) {
      const authHeader = request.headers.get('Authorization') || ''
      const expectedUser = env.SITE_USER || 'admin'
      const expected = 'Basic ' + btoa(`${expectedUser}:${env.SITE_PASSWORD}`)
      if (authHeader !== expected) {
        return new Response('認証が必要です(Authentication required)', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="AI Company"' },
        })
      }
    }
    // 認証を通過(またはSITE_PASSWORD未設定)なら、通常どおり静的ファイルを返す
    return env.ASSETS.fetch(request)
  },
}
