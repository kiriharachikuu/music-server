import 'dotenv/config';
import { PrismaClient, Role, SongStatus, BannerStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

/**
 * XingTone后端 - 种子数据脚本
 * 执行：npx prisma db seed（或 npx tsx prisma/seed.ts）
 *
 * 内容：
 *  - 1 个管理员（admin / admin123）
 *  - 2 个普通用户
 *  - 3 个标签（流行 / 摇滚 / 电子）
 *  - 2 个专辑
 *  - 8 首歌曲（关联专辑与标签，plays 各异用于排行榜）
 *  - 3 个 Banner
 *  - 2 个歌单（含 PlaylistSong）
 *  - 系统默认设置
 */
const prisma = new PrismaClient();

async function main() {
  const adminPwd = await bcrypt.hash('admin123', 10);
  const userPwd = await bcrypt.hash('user123', 10);

  // 1. 清理旧数据（按依赖反序）
  console.log('清理旧数据...');
  await prisma.playlistSong.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.playHistory.deleteMany();
  await prisma.downloadRecord.deleteMany();
  await prisma.songTag.deleteMany();
  await prisma.song.deleteMany();
  await prisma.album.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.playlist.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.user.deleteMany();

  // 2. 用户（avatar 留空，前端用首字母 fallback，避免引用不存在的图片）
  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@xtmusic.com',
      password: adminPwd,
      role: Role.ADMIN,
      avatar: null,
    },
  });
  const user1 = await prisma.user.create({
    data: {
      username: '星瞳',
      email: 'startong@xtmusic.com',
      password: userPwd,
      role: Role.USER,
      avatar: null,
    },
  });
  const user2 = await prisma.user.create({
    data: {
      username: '夜行猫',
      email: 'nightcat@xtmusic.com',
      password: userPwd,
      role: Role.USER,
      avatar: null,
    },
  });

  // 3. 标签
  const [tagPop, tagRock, tagElec] = await Promise.all([
    prisma.tag.create({ data: { name: '流行' } }),
    prisma.tag.create({ data: { name: '摇滚' } }),
    prisma.tag.create({ data: { name: '电子' } }),
  ]);

  // 4. 专辑
  const [album1, album2] = await Promise.all([
    prisma.album.create({
      data: {
        name: '星海漫游',
        artist: '星瞳',
        cover: 'https://picsum.photos/seed/album1/600/600',
        description: '星瞳首张录音室专辑，带你漫游浩瀚星海。',
        releaseDate: new Date('2024-05-20'),
      },
    }),
    prisma.album.create({
      data: {
        name: '霓虹之夜',
        artist: 'Synth Riders',
        cover: 'https://picsum.photos/seed/album2/600/600',
        description: '复古合成器浪潮，点亮霓虹之夜。',
        releaseDate: new Date('2024-10-31'),
      },
    }),
  ]);

  // 5. 歌曲（8 首，plays 各异用于排行榜）
  const songs = await Promise.all([
    prisma.song.create({
      data: {
        title: '星海漫游',
        artist: '星瞳',
        albumId: album1.id,
        duration: 245,
        fileUrl: '/uploads/songs/song1.mp3',
        coverUrl: album1.cover,
        lyricUrl: null,
        releaseDate: new Date('2024-05-20'),
        plays: 98000,
        status: SongStatus.PUBLISHED,
        songTags: { create: [{ tagId: tagPop.id }] },
      },
    }),
    prisma.song.create({
      data: {
        title: '紫罗兰信号',
        artist: '星瞳',
        albumId: album1.id,
        duration: 218,
        fileUrl: '/uploads/songs/song2.mp3',
        coverUrl: album1.cover,
        lyricUrl: null,
        releaseDate: new Date('2024-05-20'),
        plays: 76200,
        status: SongStatus.PUBLISHED,
        songTags: { create: [{ tagId: tagPop.id }, { tagId: tagElec.id }] },
      },
    }),
    prisma.song.create({
      data: {
        title: '光锥之外',
        artist: '星瞳',
        albumId: album1.id,
        duration: 301,
        fileUrl: '/uploads/songs/song3.mp3',
        coverUrl: album1.cover,
        releaseDate: new Date('2024-06-01'),
        plays: 54100,
        status: SongStatus.PUBLISHED,
        songTags: { create: [{ tagId: tagRock.id }] },
      },
    }),
    prisma.song.create({
      data: {
        title: '晚星电台',
        artist: '星瞳',
        albumId: album1.id,
        duration: 195,
        fileUrl: '/uploads/songs/song4.mp3',
        coverUrl: album1.cover,
        releaseDate: new Date('2024-06-10'),
        plays: 42800,
        status: SongStatus.PUBLISHED,
        songTags: { create: [{ tagId: tagPop.id }] },
      },
    }),
    prisma.song.create({
      data: {
        title: '霓虹之夜',
        artist: 'Synth Riders',
        albumId: album2.id,
        duration: 256,
        fileUrl: '/uploads/songs/song5.mp3',
        coverUrl: album2.cover,
        lyricUrl: null,
        releaseDate: new Date('2024-10-31'),
        plays: 88500,
        status: SongStatus.PUBLISHED,
        songTags: { create: [{ tagId: tagElec.id }] },
      },
    }),
    prisma.song.create({
      data: {
        title: '赛博梦境',
        artist: 'Synth Riders',
        albumId: album2.id,
        duration: 233,
        fileUrl: '/uploads/songs/song6.mp3',
        coverUrl: album2.cover,
        releaseDate: new Date('2024-11-05'),
        plays: 61700,
        status: SongStatus.PUBLISHED,
        songTags: { create: [{ tagId: tagElec.id }] },
      },
    }),
    prisma.song.create({
      data: {
        title: '碎裂棱镜',
        artist: 'Synth Riders',
        albumId: album2.id,
        duration: 274,
        fileUrl: '/uploads/songs/song7.mp3',
        coverUrl: album2.cover,
        releaseDate: new Date('2024-11-12'),
        plays: 38900,
        status: SongStatus.PUBLISHED,
        songTags: { create: [{ tagId: tagRock.id }, { tagId: tagElec.id }] },
      },
    }),
    prisma.song.create({
      data: {
        title: '未命名草稿',
        artist: '星瞳',
        duration: 180,
        fileUrl: '/uploads/songs/song8.mp3',
        releaseDate: new Date('2024-12-01'),
        plays: 0,
        status: SongStatus.DRAFT,
      },
    }),
  ]);

  // 同步专辑歌曲数
  await prisma.album.update({ where: { id: album1.id }, data: { songCount: 4 } });
  await prisma.album.update({ where: { id: album2.id }, data: { songCount: 3 } });

  // 6. Banner
  await Promise.all([
    prisma.banner.create({
      data: {
        title: '星海漫游 新专辑上线',
        imageUrl: 'https://picsum.photos/seed/banner1/1200/400',
        linkUrl: `/album/${album1.id}`,
        sort: 1,
        status: BannerStatus.VISIBLE,
      },
    }),
    prisma.banner.create({
      data: {
        title: '霓虹之夜 限时免费',
        imageUrl: 'https://picsum.photos/seed/banner2/1200/400',
        linkUrl: `/album/${album2.id}`,
        sort: 2,
        status: BannerStatus.VISIBLE,
      },
    }),
    prisma.banner.create({
      data: {
        title: 'XingTone 听见宇宙',
        imageUrl: 'https://picsum.photos/seed/banner3/1200/400',
        linkUrl: '/',
        sort: 3,
        status: BannerStatus.VISIBLE,
      },
    }),
  ]);

  // 7. 歌单
  const playlist1 = await prisma.playlist.create({
    data: {
      name: '夜晚电台',
      cover: 'https://picsum.photos/seed/playlist1/300/300',
      description: '适合深夜独处的旋律。',
      userId: user1.id,
      isPublic: true,
    },
  });
  const playlist2 = await prisma.playlist.create({
    data: {
      name: '通勤节拍',
      cover: 'https://picsum.photos/seed/playlist2/300/300',
      description: '上下班路上的电子节拍。',
      userId: user2.id,
      isPublic: true,
    },
  });
  await prisma.playlistSong.createMany({
    data: [
      { playlistId: playlist1.id, songId: songs[0].id, sort: 1 },
      { playlistId: playlist1.id, songId: songs[3].id, sort: 2 },
      { playlistId: playlist1.id, songId: songs[5].id, sort: 3 },
      { playlistId: playlist2.id, songId: songs[4].id, sort: 1 },
      { playlistId: playlist2.id, songId: songs[5].id, sort: 2 },
      { playlistId: playlist2.id, songId: songs[6].id, sort: 3 },
    ],
  });

  // 8. 系统设置
  await prisma.systemSetting.createMany({
    data: [
      { key: 'site_name', value: 'XingTone' },
      { key: 'storage_driver', value: 'local' },
      { key: 'default_quality', value: 'high' },
    ],
  });

  console.log('种子数据写入完成：');
  console.log(`  用户：admin / ${user1.username} / ${user2.username}`);
  console.log(`  专辑：${album1.name} / ${album2.name}`);
  console.log(`  歌曲：${songs.length} 首`);
  console.log(`  管理员账号：admin / admin123`);
}

main()
  .catch((e) => {
    console.error('种子数据写入失败：', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
