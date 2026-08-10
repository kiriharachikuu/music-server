-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "passwordUpdatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "albumId" TEXT,
    "duration" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "coverUrl" TEXT,
    "lyricUrl" TEXT,
    "lyricContent" TEXT,
    "releaseDate" DATETIME NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Song_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Album" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "cover" TEXT,
    "description" TEXT,
    "releaseDate" DATETIME NOT NULL,
    "songCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cover" TEXT,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaylistSong" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "songId" TEXT,
    "clipId" TEXT,
    "sort" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistSong_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistSong_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistSong_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "LiveClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "linkUrl" TEXT,
    "songId" TEXT,
    "adUrl" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Banner_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SongTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "SongTag_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SongTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorite_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlbumFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlbumFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlbumFavorite_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaylistFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistFavorite_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "songId" TEXT,
    "clipId" TEXT,
    "playTime" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayHistory_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayHistory_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "LiveClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DownloadRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DownloadRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DownloadRecord_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "versionCode" INTEGER NOT NULL,
    "versionName" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "downloadUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "md5" TEXT,
    "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
    "minVersionCode" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'stable',
    "platform" TEXT NOT NULL DEFAULT 'android',
    "status" TEXT NOT NULL DEFAULT 'published',
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlatformChangelog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "versionCode" INTEGER NOT NULL,
    "releaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "bio" TEXT,
    "representativeWorks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "SongArtist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SongArtist_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SongArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlbumArtist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "albumId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AlbumArtist_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlbumArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveSessionArtist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveSessionArtist_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveSessionArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveClipArtist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clipId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveClipArtist_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "LiveClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveClipArtist_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SearchSynonym" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "synonym" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "cover" TEXT,
    "description" TEXT,
    "liveTime" DATETIME NOT NULL,
    "sessionNumber" INTEGER,
    "songCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "LiveClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "trackIndex" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "coverUrl" TEXT,
    "lyricContent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiveClip_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveSessionFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveSessionFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveSessionFavorite_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveClipFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveClipFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveClipFavorite_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "LiveClip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SongQuality" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "bitrate" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SongQuality_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "preferredQuality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscodingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalSongs" INTEGER NOT NULL DEFAULT 0,
    "completedSongs" INTEGER NOT NULL DEFAULT 0,
    "failedSongs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TranscodingJobItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "songTitle" TEXT NOT NULL,
    "songArtist" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranscodingJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranscodingJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtistAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alias" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "canonical" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtistAlias_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtistMergeLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalName" TEXT NOT NULL,
    "canonicalArtistId" TEXT,
    "aliases" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "batchId" TEXT,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "clipCount" INTEGER NOT NULL DEFAULT 0,
    "songCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Song_albumId_idx" ON "Song"("albumId");

-- CreateIndex
CREATE INDEX "Song_plays_idx" ON "Song"("plays");

-- CreateIndex
CREATE INDEX "Song_releaseDate_idx" ON "Song"("releaseDate");

-- CreateIndex
CREATE INDEX "Song_status_idx" ON "Song"("status");

-- CreateIndex
CREATE INDEX "Song_deletedAt_idx" ON "Song"("deletedAt");

-- CreateIndex
CREATE INDEX "Song_title_idx" ON "Song"("title");

-- CreateIndex
CREATE INDEX "Song_artist_idx" ON "Song"("artist");

-- CreateIndex
CREATE INDEX "Album_deletedAt_idx" ON "Album"("deletedAt");

-- CreateIndex
CREATE INDEX "Album_name_idx" ON "Album"("name");

-- CreateIndex
CREATE INDEX "Album_artist_idx" ON "Album"("artist");

-- CreateIndex
CREATE INDEX "Playlist_userId_idx" ON "Playlist"("userId");

-- CreateIndex
CREATE INDEX "Playlist_isPublic_idx" ON "Playlist"("isPublic");

-- CreateIndex
CREATE INDEX "Playlist_deletedAt_idx" ON "Playlist"("deletedAt");

-- CreateIndex
CREATE INDEX "Playlist_name_idx" ON "Playlist"("name");

-- CreateIndex
CREATE INDEX "PlaylistSong_playlistId_sort_idx" ON "PlaylistSong"("playlistId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistSong_playlistId_songId_key" ON "PlaylistSong"("playlistId", "songId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistSong_playlistId_clipId_key" ON "PlaylistSong"("playlistId", "clipId");

-- CreateIndex
CREATE INDEX "Banner_sort_status_idx" ON "Banner"("sort", "status");

-- CreateIndex
CREATE INDEX "OperationLog_userId_idx" ON "OperationLog"("userId");

-- CreateIndex
CREATE INDEX "OperationLog_action_idx" ON "OperationLog"("action");

-- CreateIndex
CREATE INDEX "OperationLog_createdAt_idx" ON "OperationLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "SongTag_tagId_idx" ON "SongTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "SongTag_songId_tagId_key" ON "SongTag"("songId", "tagId");

-- CreateIndex
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_songId_key" ON "Favorite"("userId", "songId");

-- CreateIndex
CREATE INDEX "AlbumFavorite_userId_idx" ON "AlbumFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AlbumFavorite_userId_albumId_key" ON "AlbumFavorite"("userId", "albumId");

-- CreateIndex
CREATE INDEX "PlaylistFavorite_userId_idx" ON "PlaylistFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistFavorite_userId_playlistId_key" ON "PlaylistFavorite"("userId", "playlistId");

-- CreateIndex
CREATE INDEX "PlayHistory_userId_playTime_idx" ON "PlayHistory"("userId", "playTime");

-- CreateIndex
CREATE INDEX "PlayHistory_songId_playTime_idx" ON "PlayHistory"("songId", "playTime");

-- CreateIndex
CREATE INDEX "PlayHistory_clipId_playTime_idx" ON "PlayHistory"("clipId", "playTime");

-- CreateIndex
CREATE INDEX "DownloadRecord_userId_idx" ON "DownloadRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AppVersion_versionCode_key" ON "AppVersion"("versionCode");

-- CreateIndex
CREATE INDEX "AppVersion_channel_platform_status_idx" ON "AppVersion"("channel", "platform", "status");

-- CreateIndex
CREATE INDEX "AppVersion_versionCode_idx" ON "AppVersion"("versionCode");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformChangelog_versionCode_key" ON "PlatformChangelog"("versionCode");

-- CreateIndex
CREATE INDEX "PlatformChangelog_versionCode_idx" ON "PlatformChangelog"("versionCode");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_name_key" ON "Artist"("name");

-- CreateIndex
CREATE INDEX "Artist_name_idx" ON "Artist"("name");

-- CreateIndex
CREATE INDEX "Artist_deletedAt_idx" ON "Artist"("deletedAt");

-- CreateIndex
CREATE INDEX "SongArtist_songId_idx" ON "SongArtist"("songId");

-- CreateIndex
CREATE INDEX "SongArtist_artistId_idx" ON "SongArtist"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "SongArtist_songId_artistId_key" ON "SongArtist"("songId", "artistId");

-- CreateIndex
CREATE INDEX "AlbumArtist_albumId_idx" ON "AlbumArtist"("albumId");

-- CreateIndex
CREATE INDEX "AlbumArtist_artistId_idx" ON "AlbumArtist"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "AlbumArtist_albumId_artistId_key" ON "AlbumArtist"("albumId", "artistId");

-- CreateIndex
CREATE INDEX "LiveSessionArtist_sessionId_idx" ON "LiveSessionArtist"("sessionId");

-- CreateIndex
CREATE INDEX "LiveSessionArtist_artistId_idx" ON "LiveSessionArtist"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionArtist_sessionId_artistId_key" ON "LiveSessionArtist"("sessionId", "artistId");

-- CreateIndex
CREATE INDEX "LiveClipArtist_clipId_idx" ON "LiveClipArtist"("clipId");

-- CreateIndex
CREATE INDEX "LiveClipArtist_artistId_idx" ON "LiveClipArtist"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveClipArtist_clipId_artistId_key" ON "LiveClipArtist"("clipId", "artistId");

-- CreateIndex
CREATE INDEX "SearchLog_keyword_idx" ON "SearchLog"("keyword");

-- CreateIndex
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- CreateIndex
CREATE INDEX "SearchLog_ip_createdAt_idx" ON "SearchLog"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "SearchSynonym_keyword_idx" ON "SearchSynonym"("keyword");

-- CreateIndex
CREATE UNIQUE INDEX "SearchSynonym_keyword_synonym_key" ON "SearchSynonym"("keyword", "synonym");

-- CreateIndex
CREATE INDEX "LiveSession_liveTime_idx" ON "LiveSession"("liveTime");

-- CreateIndex
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

-- CreateIndex
CREATE INDEX "LiveSession_deletedAt_idx" ON "LiveSession"("deletedAt");

-- CreateIndex
CREATE INDEX "LiveSession_title_idx" ON "LiveSession"("title");

-- CreateIndex
CREATE INDEX "LiveSession_artist_idx" ON "LiveSession"("artist");

-- CreateIndex
CREATE INDEX "LiveClip_sessionId_idx" ON "LiveClip"("sessionId");

-- CreateIndex
CREATE INDEX "LiveClip_sessionId_trackIndex_idx" ON "LiveClip"("sessionId", "trackIndex");

-- CreateIndex
CREATE INDEX "LiveClip_title_idx" ON "LiveClip"("title");

-- CreateIndex
CREATE INDEX "LiveClip_artist_idx" ON "LiveClip"("artist");

-- CreateIndex
CREATE INDEX "LiveClip_status_idx" ON "LiveClip"("status");

-- CreateIndex
CREATE INDEX "LiveSessionFavorite_userId_idx" ON "LiveSessionFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionFavorite_userId_sessionId_key" ON "LiveSessionFavorite"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "LiveClipFavorite_userId_idx" ON "LiveClipFavorite"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveClipFavorite_userId_clipId_key" ON "LiveClipFavorite"("userId", "clipId");

-- CreateIndex
CREATE INDEX "UploadRecord_createdAt_idx" ON "UploadRecord"("createdAt");

-- CreateIndex
CREATE INDEX "UploadRecord_category_idx" ON "UploadRecord"("category");

-- CreateIndex
CREATE INDEX "SongQuality_songId_idx" ON "SongQuality"("songId");

-- CreateIndex
CREATE INDEX "SongQuality_quality_idx" ON "SongQuality"("quality");

-- CreateIndex
CREATE UNIQUE INDEX "SongQuality_songId_quality_key" ON "SongQuality"("songId", "quality");

-- CreateIndex
CREATE INDEX "UserPreference_userId_idx" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "TranscodingJobItem_jobId_idx" ON "TranscodingJobItem"("jobId");

-- CreateIndex
CREATE INDEX "TranscodingJobItem_status_idx" ON "TranscodingJobItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistAlias_alias_key" ON "ArtistAlias"("alias");

-- CreateIndex
CREATE INDEX "ArtistAlias_artistId_idx" ON "ArtistAlias"("artistId");

-- CreateIndex
CREATE INDEX "ArtistAlias_normalized_idx" ON "ArtistAlias"("normalized");

-- CreateIndex
CREATE INDEX "ArtistAlias_canonical_idx" ON "ArtistAlias"("canonical");

-- CreateIndex
CREATE INDEX "ArtistMergeLog_canonicalArtistId_idx" ON "ArtistMergeLog"("canonicalArtistId");

-- CreateIndex
CREATE INDEX "ArtistMergeLog_createdAt_idx" ON "ArtistMergeLog"("createdAt");

-- CreateIndex
CREATE INDEX "ArtistMergeLog_batchId_idx" ON "ArtistMergeLog"("batchId");


