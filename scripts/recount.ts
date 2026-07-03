// 运行：npx ts-node scripts/recount.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * XingTone后端 - 统计字段重算脚本
 *
 * 重新计算并修正以下持久化的派生计数字段：
 *  - Song.plays：按 PlayHistory 表按 songId 统计总播放数（简化为按 songId 计数）
 *  - Song.favoriteCount：按 Favorite 表按 songId 统计收藏数
 *  - Album.songCount：按未删除 Song 表按 albumId 统计歌曲数
 *
 * 说明：原计划「遍历 Playlist 更新 songCount（按 PlaylistSong 表计数）」因 schema 中
 * Playlist 模型无持久化 songCount 字段（仅有 playCount；歌曲数在查询时通过 _count 动态
 * 计算），在不修改 schema 的约束下，此处改为重算 Album.songCount，并以只读方式遍历
 * Playlist 打印其歌曲数供审计。
 */
const prisma = new PrismaClient();

async function main() {
  // 1. 重算 Song.plays 与 Song.favoriteCount
  console.log('开始重算 Song 的 plays 与 favoriteCount...');
  const songs = await prisma.song.findMany({
    select: {
      id: true,
      title: true,
      artist: true,
      plays: true,
      favoriteCount: true,
    },
  });

  // 按 songId 聚合播放历史数与收藏数（groupBy 仅返回有记录的 songId）
  const [playCounts, favoriteCounts] = await Promise.all([
    prisma.playHistory.groupBy({ by: ['songId'], _count: { _all: true } }),
    prisma.favorite.groupBy({ by: ['songId'], _count: { _all: true } }),
  ]);
  const playMap = new Map<string, number>(
    playCounts.map((r) => [r.songId, r._count._all]),
  );
  const favMap = new Map<string, number>(
    favoriteCounts.map((r) => [r.songId, r._count._all]),
  );

  let songFixed = 0;
  for (const song of songs) {
    const newPlays = playMap.get(song.id) ?? 0;
    const newFav = favMap.get(song.id) ?? 0;
    if (song.plays !== newPlays || song.favoriteCount !== newFav) {
      await prisma.song.update({
        where: { id: song.id },
        data: { plays: newPlays, favoriteCount: newFav },
      });
      songFixed += 1;
      console.log(
        `  修正歌曲「${song.title} - ${song.artist}」：plays ${song.plays}→${newPlays}，favoriteCount ${song.favoriteCount}→${newFav}`,
      );
    }
  }
  console.log(
    `歌曲统计重算完成，共修正 ${songFixed} 首（总计 ${songs.length} 首）。`,
  );

  // 2. 重算 Album.songCount（仅统计未删除歌曲）
  console.log('开始重算 Album.songCount...');
  const albums = await prisma.album.findMany({
    select: { id: true, name: true, artist: true, songCount: true },
  });
  const albumCounts = await prisma.song.groupBy({
    by: ['albumId'],
    where: { deletedAt: null, albumId: { not: null } },
    _count: { _all: true },
  });
  const albumMap = new Map<string, number>(
    albumCounts.map((r) => [r.albumId as string, r._count._all]),
  );

  let albumFixed = 0;
  for (const album of albums) {
    const newCount = albumMap.get(album.id) ?? 0;
    if (album.songCount !== newCount) {
      await prisma.album.update({
        where: { id: album.id },
        data: { songCount: newCount },
      });
      albumFixed += 1;
      console.log(
        `  修正专辑「${album.name} - ${album.artist}」：songCount ${album.songCount}→${newCount}`,
      );
    }
  }
  console.log(
    `专辑统计重算完成，共修正 ${albumFixed} 个（总计 ${albums.length} 个）。`,
  );

  // 3. 遍历 Playlist 统计歌曲数（Playlist 无持久化 songCount 字段，仅打印审计信息）
  console.log('统计 Playlist 歌曲数（songCount 查询时动态计算，此处仅审计打印）...');
  const playlists = await prisma.playlist.findMany({
    select: { id: true, name: true },
  });
  const playlistCounts = await prisma.playlistSong.groupBy({
    by: ['playlistId'],
    _count: { _all: true },
  });
  const playlistMap = new Map<string, number>(
    playlistCounts.map((r) => [r.playlistId, r._count._all]),
  );
  for (const playlist of playlists) {
    const count = playlistMap.get(playlist.id) ?? 0;
    console.log(`  歌单「${playlist.name}」当前包含 ${count} 首歌曲`);
  }
  console.log(`歌单统计完成（共 ${playlists.length} 个歌单）。`);

  console.log('全部重算完成。');
}

main()
  .catch((e) => {
    console.error('重算失败：', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
