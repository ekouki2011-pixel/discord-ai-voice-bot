import { AppError } from './types.js';
export function normalizeText(raw: string, maxChars: number): string {
  // Bound the original content too; a huge URL must not bypass the raw-input budget.
  if ([...raw].length > maxChars) throw new AppError('TEXT_TOO_LONG',`本文は${maxChars}文字以内で投稿してください。`);
  const text = raw.replace(/```[\s\S]*?```/g,' コード省略 ')
    .replace(/\|\|[\s\S]*?\|\|/g,' 伏せ字 ')
    .replace(/https?:\/\/[^\s<>]+/gi,' URL省略 ')
    .replace(/<@!?\d+>/g,' ユーザー ').replace(/<@&\d+>/g,' ロール ')
    .replace(/<#\d+>/g,' チャンネル ').replace(/@everyone|@here/g,' 全体メンション ')
    .replace(/<a?:([A-Za-z0-9_]+):\d+>/g,' 絵文字$1 ')
    .replace(/\p{Extended_Pictographic}[\uFE0F\u200D\p{Emoji_Modifier}\p{Extended_Pictographic}]*/gu,' 絵文字 ')
    .replace(/[\p{Cc}\p{Cf}]/gu,' ').replace(/[*_~`>]/g,'').replace(/\s+/g,' ').trim();
  if (!text) throw new AppError('TEXT_EMPTY','読み上げる文章がありません。');
  return text;
}
export class SlidingLimit {
  private hits = new Map<string,number[]>();
  constructor(private now: () => number = Date.now) {}
  take(keys: {key: string; limit: number}[]): void {
    const at = this.now();
    for (const [key,values] of this.hits) {
      const recent = values.filter(x => x > at-60000);
      if (!recent.length) this.hits.delete(key); else this.hits.set(key,recent);
    }
    if (keys.some(({key,limit}) => (this.hits.get(key)?.length ?? 0) >= limit))
      throw new AppError('RATE_LIMIT','連投制限中です。少し待ってから投稿してください。');
    for (const {key} of keys) this.hits.set(key,[...(this.hits.get(key) ?? []),at]);
  }
}
