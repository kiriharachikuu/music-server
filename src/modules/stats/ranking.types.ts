/**
 * 排行榜相关类型定义
 *
 * 仅保留 3 档"综合"榜单：综合-飙升榜 / 综合-热歌榜 / 综合-新歌榜
 * - 综合：单曲（Song）+ 歌切（LiveClip）混合排序
 * - 旧版"单曲 / 歌切"两档已移除
 */

/** 排行榜分类 */
export type RankingKind = 'soar' | 'hot' | 'new';

/** 专辑摘要（统一 track 字段用，含 id / name / cover） */
export interface RankingAlbumInfo {
  id?: string | null;
  name?: string;
  cover?: string | null;
}

/**
 * 排行榜条目：统一描述单曲/歌切，trackType 区分。
 * 前端可通过 trackType 决定使用 id 作为 songId 还是 clipId。
 */
export interface RankingItem {
  /** 唯一标识 = itemId */
  id: string;
  /** 歌曲或歌切 ID（与 id 相同，便于兼容老接口） */
  itemId: string;
  /** 曲目类型：song（单曲） / live_clip（歌切）；clip 为旧缓存兼容值 */
  trackType: 'song' | 'live_clip' | 'clip';
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
  /** 单曲专辑 ID */
  albumId?: string | null;
  /** 单曲专辑名（歌切为 null） */
  albumName?: string | null;
  /** 专辑对象（含 id / name / cover） */
  album?: RankingAlbumInfo | null;
  /** 单曲封面 */
  coverUrl?: string | null;
  /** 播放 URL（兼容前端播放器） */
  url?: string | null;
  /** 关联场次 ID（歌切） */
  sessionId?: string | null;
  /** 关联场次标题（歌切） */
  sessionName?: string | null;
  /** 场次封面（歌切） */
  sessionCover?: string | null;
  /** 直播时间（歌切） */
  liveTime?: string;
  /** 歌切曲序 */
  trackIndex?: number;
  /** 播放量（热歌/飙升） */
  playCount?: number;
  /** 旧接口播放量字段 */
  plays?: number;
  /** 旧接口收藏数字段 */
  favoriteCount?: number;
  /** 增长量（飙升） */
  growth?: number;
  /** 文件 URL（歌切） */
  fileUrl?: string | null;
  /** 发布时间（new 榜） */
  createdAt?: string;
  /** 额外字段透传 */
  [key: string]: unknown;
}

/** 排行榜响应结构 */
export interface LegacyRankingsResponse {
  soar: RankingItem[];
  new: RankingItem[];
  hot: RankingItem[];
}

export interface RankingResponse {
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
  /** 分页信息（不传 limit/offset 时 tracks 为全量） */
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  /** 上次更新时间 */
  updatedAt: string;
  /** 生成时间（兼容旧前端字段） */
  generatedAt: string;
  /** 关联系统歌单 ID（可能为 null） */
  playlistId: string | null;
}
