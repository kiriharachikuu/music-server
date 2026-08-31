/**
 * 轻量语义化版本（semver）比较工具
 * - 兼容项目现有版本号格式："1.4.3"、"v1.4.3"、"1.8"、"1.4.3-beta.1"
 * - 不引入第三方依赖；解析失败返回 null，由调用方兜底处理
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** 预发布段，如 "beta.1"；无预发布为 null */
  prerelease: string | null;
  raw: string;
}

/** 解析语义化版本号；非法输入返回 null */
export function parseVersion(input: string): ParsedVersion | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([\w.-]+))?$/.exec(raw);
  if (!m) return null;
  return {
    major: parseInt(m[1], 10),
    minor: m[2] != null ? parseInt(m[2], 10) : 0,
    patch: m[3] != null ? parseInt(m[3], 10) : 0,
    prerelease: m[4] ?? null,
    raw,
  };
}

/**
 * 比较两个版本号
 * @returns a > b 返回 1，a < b 返回 -1，相等返回 0；任一版本非法返回 null
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  // semver 规范：无预发布段 > 有预发布段（1.0.0 > 1.0.0-beta）
  if (!pa.prerelease && !pb.prerelease) return 0;
  if (!pa.prerelease) return 1;
  if (!pb.prerelease) return -1;
  return pa.prerelease < pb.prerelease ? -1 : pa.prerelease > pb.prerelease ? 1 : 0;
}

/** 判断 latest 是否比 current 更新（current < latest 时为 true）；任一版本非法时返回 false */
export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(latest, current) === 1;
}
