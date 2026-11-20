import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from '../types.js';

export interface HttpResult { bytes: Buffer; headers: Headers; status: number; }
export type Fetcher = typeof fetch;
export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds*1000;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0,at-now) : null;
}
export function parseJson(result: HttpResult): unknown {
  try { return JSON.parse(result.bytes.toString('utf8')) as unknown; }
  catch { throw new AppError('INVALID_JSON','音声サービスが不正なJSONを返しました。'); }
}
function remoteCode(bytes: Buffer): string {
  try {
    const value = JSON.parse(bytes.toString()) as {error?: {code?: string}; detail?: {code?: string}};
    // Inspect codes only; never return remote messages which may echo input text.
    return value.error?.code ?? value.detail?.code ?? '';
  } catch { return ''; }
}
async function readBounded(response: Response, max: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel();
    throw new AppError('AUDIO_TOO_LARGE','サービスから返されたデータが上限を超えています。');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total=0;
  try {
    for (;;) {
      const {done,value} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total>max) { await reader.cancel(); throw new AppError('AUDIO_TOO_LARGE','サービスから返されたデータが上限を超えています。'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
export class Http {
  constructor(private timeoutMs = 180000, private maxBytes = 20000000, private fetcher: Fetcher = fetch,
    private sleep: (ms: number, signal?: AbortSignal) => Promise<unknown> = (ms,signal) => delay(ms,undefined,{signal})) {}
  async request(url: string | URL, init: RequestInit = {}, options: {retryServer?: boolean} = {}): Promise<HttpResult> {
    const deadline = AbortSignal.timeout(this.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal,deadline]) : deadline;
    const started = Date.now();
    for (let attempt=0; attempt<3; attempt++) {
      signal.throwIfAborted();
      let response: Response; let bytes: Buffer;
      try {
        response = await this.fetcher(url,{...init,signal,redirect:'error'});
        bytes = await readBounded(response,this.maxBytes);
      } catch(e) {
        if (init.signal?.aborted) throw e;
        if (e instanceof AppError) throw e;
        throw new AppError(deadline.aborted ? 'API_TIMEOUT':'API_NETWORK','音声サービスへの通信に失敗しました。接続と稼働状態を確認してください。');
      }
      if (response.ok) return {bytes,headers:response.headers,status:response.status};
      const status=response.status; const quota=remoteCode(bytes)==='insufficient_quota';
      const retry=status===429 && !quota || status>=500 && (options.retryServer || (init.method ?? 'GET')==='GET');
      if (retry && attempt<2) {
        const wait=retryAfterMs(response.headers.get('retry-after')) ?? 1000*2**attempt;
        // A long Retry-After is a failure now, never permission to retry earlier.
        if (Date.now()-started+wait<this.timeoutMs) { await this.sleep(wait,signal); continue; }
      }
      const message = status===401 ? 'APIキーが無効または未設定です。'
        : status===403 ? 'アカウントまたはAPIの利用権限を確認してください。'
        : status===402 || quota ? '音声サービスの利用枠・残高が不足しています。'
        : status===429 ? '音声サービスの利用制限中です。時間をおいて再試行してください。'
        : status===404 ? '指定した音声またはAPIが見つかりません。音声を再同期してください。'
        : '音声サービスでエラーが発生しました。設定と稼働状態を確認してください。';
      throw new AppError(quota ? 'API_QUOTA':`API_HTTP_${status}`,message,status);
    }
    throw new AppError('API_RETRY_EXHAUSTED','音声サービスの再試行回数を超えました。');
  }
  async json(url: string | URL, init?: RequestInit): Promise<unknown> { return parseJson(await this.request(url,init)); }
}
export function requireKey(key: string, engine: string): void {
  if (!key) throw new AppError('AUTH_PENDING',`${engine}は認証待ちです。所有者が環境変数にAPIキーを設定してください。`);
}
export function audioResult(result: HttpResult, extension: 'mp3' | 'wav') {
  const type = result.headers.get('content-type') ?? '';
  const prefix=result.bytes.subarray(0,64).toString().trimStart();
  if (!result.bytes.length || type.includes('json') || /^[{[<]/.test(prefix)
    || !(type.startsWith('audio/') || type.includes('application/octet-stream')))
    throw new AppError('INVALID_AUDIO','音声サービスが音声データを返しませんでした。');
  return {bytes:result.bytes,extension};
}
