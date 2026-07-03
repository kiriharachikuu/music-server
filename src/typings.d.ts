/**
 * 第三方包的类型声明补充
 * ffprobe-static 仅提供 CommonJS 入口且未附带 .d.ts，
 * 这里补充最小声明，便于在 TypeScript 中以默认导入方式使用
 */
declare module 'ffprobe-static' {
  /** 当前平台对应的 ffprobe 可执行文件绝对路径 */
  export const path: string;
}
