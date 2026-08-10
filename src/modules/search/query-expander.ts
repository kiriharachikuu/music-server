import { PrismaService } from '../../prisma/prisma.service';
import { toPinyinInitials } from './pinyin.util';

export interface SearchQuery {
  /** 原始输入（未 trim / 未 lower） */
  original: string;
  /** trim + lower 后的标准输入 */
  raw: string;
  /** 输入字符串的拼音首字母 */
  pinyin: string;
  /** 由 SearchSynonym 表展开出来的同义词数组（已去重、不含 raw 本身） */
  synonyms: string[];
}

/**
 * 把一个用户输入展开为多路查询条件
 *
 * 1. raw        : trim + lower 后的原文，作为主查询 term
 * 2. pinyin     : 原文的拼音首字母，例如 "星镜境" -> "xjj"
 * 3. synonyms   : 在 SearchSynonym 表里以 (keyword | synonym) = raw 命中后，
 *                 把另一侧的词也作为查询 term
 */
export async function expandQuery(
  prisma: PrismaService,
  q: string,
): Promise<SearchQuery> {
  const raw = q.trim().toLowerCase();
  const pinyin = toPinyinInitials(raw);

  // 查同义词表：双向查询（keyword 命中 或 synonym 命中都算）
  // 注：当前 Prisma provider = sqlite，StringFilter 不支持 mode:'insensitive'；
  // 由于 raw 已统一 lower，且后续 SQL 用 contains/LIKE 默认对 ASCII 大小写不敏感，
  // 直接 equals 即可满足"瞳瞳 -> 星瞳"这种同义匹配。
  const rows = await prisma.searchSynonym.findMany({
    where: {
      OR: [
        { keyword: { equals: raw } },
        { synonym: { equals: raw } },
      ],
    },
    select: { keyword: true, synonym: true },
  });

  // 收集另一侧的展开词（双向合并）
  const expanded = new Set<string>();
  for (const row of rows) {
    if (row.keyword.toLowerCase() !== raw) expanded.add(row.keyword);
    if (row.synonym.toLowerCase() !== raw) expanded.add(row.synonym);
  }
  // 拼音首字母也作为兜底 term（避免 "xjj" 进来时漏掉）
  if (pinyin && pinyin !== raw) {
    expanded.add(pinyin);
  }

  return {
    original: q,
    raw,
    pinyin,
    synonyms: Array.from(expanded),
  };
}
