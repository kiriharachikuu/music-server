/** 文件上传结果 */
export interface UploadResult {
  /** 可访问的公开 URL */
  url: string;
  /** 存储引擎内部的相对路径（删除时使用） */
  path: string;
}

/**
 * 存储服务抽象接口
 * 本地存储与 S3 存储均实现该接口，由工厂按配置注入具体实现
 */
export interface StorageService {
  /** 上传文件到指定分类目录 */
  upload(file: Express.Multer.File, category: string): Promise<UploadResult>;
  /** 删除指定路径的文件 */
  delete(path: string): Promise<void>;
  /** 根据存储路径生成可访问 URL */
  getUrl(path: string): string;
}

/** StorageService 的 DI Token */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');
