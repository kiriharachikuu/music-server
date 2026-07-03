#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
XT-Music 批量音频导入脚本

用途：
  递归扫描指定目录下的音频文件，逐个上传到后端并创建歌曲记录，
  适用于一次性批量入库场景。

用法：
  python scripts/batch_import.py \\
      --dir /path/to/music \\
      --email admin@xt.com \\
      --password your_password \\
      --api-base http://localhost:3000 \\
      [--transcode]

参数：
  --dir        待扫描的音频目录（递归子目录）
  --email      登录账号（邮箱或用户名，对应登录接口的 account 字段）
  --password   登录密码
  --api-base   后端 API 根地址，如 http://localhost:3000
  --transcode  可选，透传给上传接口 ?transcode=true，由后端转码为 128kbps MP3

依赖：
  - Python 3.8+ 标准库
  - requests 库（pip install requests）
  - 系统需安装 ffprobe（可选，仅用于本地预解析时长，缺失不影响导入）
  - 系统需安装 ffmpeg（仅当使用 --transcode 时，后端转码需要）

流程：
  1. 登录 POST /api/auth/login 获取 JWT token
  2. 扫描 --dir 下所有音频文件（.mp3 .flac .wav .ogg .aac .m4a）
  3. 对每个文件：本地 ffprobe 解析时长（可选）→ 上传 POST /api/admin/upload?type=audio
     → 若上传接口未自动创建歌曲，则调用 POST /api/admin/songs 创建歌曲记录
  4. 单文件失败不中断，最终打印统计（成功 X 失败 Y）
"""

import argparse
import os
import subprocess
import sys
from datetime import date
from pathlib import Path

try:
    import requests
except ImportError:
    print('缺少依赖 requests，请先执行: pip install requests', file=sys.stderr)
    sys.exit(1)


# 支持的音频扩展名（小写）
AUDIO_EXTENSIONS = {'.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'}


def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description='XT-Music 批量音频导入脚本')
    parser.add_argument('--dir', required=True, help='待扫描的音频目录')
    parser.add_argument('--email', required=True, help='登录账号（邮箱或用户名）')
    parser.add_argument('--password', required=True, help='登录密码')
    parser.add_argument(
        '--api-base', required=True, help='后端 API 根地址，如 http://localhost:3000'
    )
    parser.add_argument(
        '--transcode',
        action='store_true',
        help='透传给上传接口 ?transcode=true，由后端转码为 128kbps MP3',
    )
    return parser.parse_args()


def login(api_base, account, password):
    """登录后端获取 JWT token"""
    resp = requests.post(
        f'{api_base}/api/auth/login',
        json={'account': account, 'password': password},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    token = data.get('token')
    if not token:
        raise RuntimeError('登录响应中未包含 token')
    return token


def scan_audio_files(directory):
    """递归扫描目录下所有音频文件，返回排序后的绝对路径列表"""
    result = []
    for root, _dirs, files in os.walk(directory):
        for name in files:
            if Path(name).suffix.lower() in AUDIO_EXTENSIONS:
                result.append(os.path.join(root, name))
    result.sort()
    return result


def probe_duration(filepath):
    """调用系统 ffprobe 解析时长（秒，取整），失败返回 None"""
    try:
        proc = subprocess.run(
            [
                'ffprobe',
                '-v',
                'error',
                '-show_entries',
                'format=duration',
                '-of',
                'default=noprint_wrappers=1:nokey=1',
                filepath,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0:
            val = proc.stdout.strip()
            if val:
                return int(float(val))
    except Exception:
        pass
    return None


def upload_file(api_base, token, filepath, transcode):
    """上传单个音频文件，返回响应 JSON"""
    params = {'type': 'audio'}
    if transcode:
        params['transcode'] = 'true'
    headers = {'Authorization': f'Bearer {token}'}
    filename = os.path.basename(filepath)
    with open(filepath, 'rb') as f:
        files = {'file': (filename, f)}
        resp = requests.post(
            f'{api_base}/api/admin/upload',
            files=files,
            params=params,
            headers=headers,
            timeout=300,
        )
    resp.raise_for_status()
    return resp.json()


def create_song(api_base, token, payload):
    """创建歌曲记录"""
    headers = {'Authorization': f'Bearer {token}'}
    resp = requests.post(
        f'{api_base}/api/admin/songs',
        json=payload,
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def build_song_payload(filepath, upload_resp, local_duration):
    """根据上传响应与本地 ffprobe 时长组装创建歌曲的请求体"""
    metadata = upload_resp.get('metadata') or {}
    parsed = upload_resp.get('parsed') or {}
    file_url = upload_resp.get('url', '')

    # 优先用上传接口返回的元数据，其次本地 ffprobe，再次文件名
    title = parsed.get('title') or metadata.get('title') or Path(filepath).stem
    artist = parsed.get('artist') or metadata.get('artist') or '未知'
    duration = metadata.get('duration') or local_duration or 0

    return {
        'title': title,
        'artist': artist,
        'duration': int(duration),
        'fileUrl': file_url,
        'releaseDate': date.today().isoformat(),
    }


def main():
    args = parse_args()

    directory = args.dir
    if not os.path.isdir(directory):
        print(f'错误：目录不存在 - {directory}', file=sys.stderr)
        sys.exit(1)

    # 登录
    print(f'正在登录 {args.api_base} ...')
    try:
        token = login(args.api_base, args.email, args.password)
    except Exception as e:
        print(f'登录失败：{e}', file=sys.stderr)
        sys.exit(1)
    print('登录成功')

    # 扫描音频文件
    audio_files = scan_audio_files(directory)
    total = len(audio_files)
    if total == 0:
        print(f'目录下未发现音频文件：{directory}')
        return
    print(f'共发现 {total} 个音频文件，开始导入...\n')

    success = 0
    fail = 0
    for i, filepath in enumerate(audio_files, 1):
        name = os.path.basename(filepath)
        prefix = f'[{i}/{total}] {name}'
        try:
            # 本地 ffprobe 预解析时长（可选，失败不影响导入）
            local_duration = probe_duration(filepath)

            # 上传到后端
            upload_resp = upload_file(
                args.api_base, token, filepath, args.transcode
            )

            # 若上传接口已自动创建歌曲则跳过
            if upload_resp.get('songId') or upload_resp.get('song'):
                print(f'{prefix} - 成功（上传接口已创建歌曲）')
                success += 1
                continue

            # 调用 POST /api/admin/songs 创建歌曲记录
            payload = build_song_payload(filepath, upload_resp, local_duration)
            try:
                create_song(args.api_base, token, payload)
                extra = '（已转码）' if upload_resp.get('transcoded') else ''
                print(f'{prefix} - 成功{extra}')
                success += 1
            except Exception as e:
                # 上传已成功，仅歌曲记录创建失败，记为成功但提示
                print(f'{prefix} - 成功（上传成功，但创建歌曲记录失败：{e}）')
                success += 1
        except Exception as e:
            print(f'{prefix} - 失败：{e}')
            fail += 1

    print(f'\n导入完成：成功 {success} 失败 {fail}')


if __name__ == '__main__':
    main()
