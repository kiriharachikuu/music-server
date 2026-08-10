/**
 * 排行榜相关类型定义（综合/单曲/歌切 × 飙升/热歌/新歌，共 9 档）
 */

/** 排行榜主体类型 */
export type RankingType = 'combined' | 'single' | 'clip';

/** 排行榜分类 */
export type RankingKind = 'soar' | 'hot' | 'new';

/**
 * 排行榜条目：统一描述单曲/歌切，trackType 区分。
 * 前端可通过 trackType 决定使用 id 作为 songId 还是 clipId。
 */
export interface RankingItem {
  /** 唯一标识 = itemId */
  id: string;
  /** 歌曲或歌切 ID（与 id 相同，便于兼容老接口） */
  itemId: string;
  /** 曲目类型：song（单曲） / clip（歌切） */
  trackType: 'song' | 'clip';
  /** 标题 */
  title: string;
  /** 艺人名 */
  artist: string;
  /** 封面 */
  cover: string | null;
  /** 时长（秒） */
  duration: number;
  /** 排名（1-based） */
  rank: number;
  /** 关联艺人 ID（单曲） */
  artistId?: string | null;
  /** 关联场次 ID（歌切） */
  sessionId?: string | null;
  /** 关联场次标题（歌切） */
  sessionName?: string | null;
  /** 播放量（热歌/飙升） */
  playCount?: number;
  /** 增长量（飙升） */
  growth?: number;
  /** 文件 URL（歌切） */
  fileUrl?: string | null;
  /** 发布时间（new 榜） */
  createdAt?: string;
  /** 额外字段透传 */
  [key: string]: unknown;
}

/** 排行榜响应结构（同时供前端 9 档使用） */
export interface RankingResponse {
  /** 类型：combined / single / clip */
  type: RankingType;
  /** 榜单：soar / hot / new */
  ranking: RankingKind;
  /** 标题（如：综合-飙升榜） */
  title: string;
  /** 榜单封面 */
  cover: string | null;
  /** 榜单描述 */
  description: string;
  /** 列表 */
  tracks: RankingItem[];
  /** 上次更新时间 */
  updatedAt: string;
  /** 关联系统歌单 ID（可能为 null） */
  playlistId: string | null;
}
