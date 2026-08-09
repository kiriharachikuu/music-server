/**
 * 歌手名归一化与相似度工具
 *
 * 用于歌手合并的「自动识别建议」与「上传时归一」：
 * - normalizeArtistName：把不同写法收敛到同一个 key（大小写折叠 + NFKC 全/半角、假名兼容 + 去装饰空白）
 * - artistSimilarity：给两个名字算相似度（含子串包含判定），供聚类建议使用
 *
 * 说明：这里只做「建议」，最终是否合并由人工在管理端确认，避免误伤把不同人并到一起。
 */

/** 多歌手拼接串的分隔符（与 refreshSongArtistDisplay 的 " / " 对齐，同时兼容常见分隔） */
export const ARTIST_JOIN = ' / ';
const SPLIT_RE = /\s*[/、,，&＆]\s*|\s+feat\.?\s+|\s+ft\.?\s+/gi;

/**
 * 归一化歌手名，得到用于分组/匹配的 key。
 * 处理：NFKC（全角→半角、兼容假名/罗马数字等）→ 去首尾及压缩内部空白 → 小写折叠。
 * 例：`ＬＵＬＵ` / `LULU` / ` lulu ` → `lulu`
 */
export function normalizeArtistName(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .replace(/\s+/g, ' ') // JS 的 \s 已含全角/表意空格 U+3000
    .trim()
    .toLowerCase();
}

/** 把可能的多歌手拼接串拆成单个名字（去空段、去重保序） */
export function splitArtists(raw: string): string[] {
  if (!raw) return [];
  const parts = raw
    .split(SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = normalizeArtistName(p);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out.length ? out : raw.trim() ? [raw.trim()] : [];
}

/**
 * 在一个歌手拼接串中，把等于某个变体（归一化相等）的那一段替换为规范名，其余保持不变。
 * 例：rewriteArtistToken('るる / A', {るる, A...}, '雫るる') → '雫るる / A'
 * 若没有任何一段命中，返回 null（表示该串无需改写）。
 */
export function rewriteArtistToken(
  raw: string,
  aliasNormalizedSet: Set<string>,
  canonical: string,
): string | null {
  const tokens = splitArtists(raw);
  let changed = false;
  const mapped = tokens.map((t) => {
    if (aliasNormalizedSet.has(normalizeArtistName(t))) {
      changed = true;
      return canonical;
    }
    return t;
  });
  if (!changed) return null;
  // 去重（规范名可能与已有段重复），保序
  const seen = new Set<string>();
  const dedup = mapped.filter((t) => {
    const k = normalizeArtistName(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return dedup.join(ARTIST_JOIN);
}

/** Levenshtein 编辑距离 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev: number[] = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * 相似度 [0,1]：归一化后
 * - 完全相等 → 1
 * - 一方是另一方的子串（如 るる ⊂ 雫るる）→ 高分（0.86，仍需人工确认）
 * - 否则用编辑距离归一
 */
export function artistSimilarity(a: string, b: string): number {
  const na = normalizeArtistName(a);
  const nb = normalizeArtistName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (shorter.length >= 2 && longer.includes(shorter)) {
    // 子串包含：长度越接近越可信
    const ratio = shorter.length / longer.length;
    return 0.8 + 0.15 * ratio;
  }
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/** 判定两名字是否「疑似同一歌手」（默认阈值 0.72，可调） */
export function isLikelySameArtist(
  a: string,
  b: string,
  threshold = 0.72,
): boolean {
  return artistSimilarity(a, b) >= threshold;
}
