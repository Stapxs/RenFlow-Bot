/**
 * 简易缓存模块
 * 支持内存缓存、TTL（过期时间）和 LRU（最近最少使用）淘汰策略
 * 主要用于机器人 API 请求响应的缓存
 */

import { Logger } from './logger.js'

interface CacheEntry<T> {
  value: T
  expiresAt: number
  lastAccessed: number
}

export interface CacheOptions {
  /**
   * 最大缓存条目数，达到上限后使用 LRU 策略淘汰
   * @default 1000
   */
  maxSize?: number

  /**
   * 默认过期时间（毫秒）
   * @default 3600000 (1小时)
   */
  defaultTTL?: number

  /**
   * 是否启用调试日志
   * @default false
   */
  debug?: boolean
}

export class SimpleCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>()
  private maxSize: number
  private defaultTTL: number
  private logger: Logger
  private hits = 0
  private misses = 0

  constructor(name: string = 'Cache', options?: CacheOptions) {
    this.maxSize = options?.maxSize ?? 1000
    this.defaultTTL = options?.defaultTTL ?? 3600000 // 1小时
    this.logger = new Logger(name)

    if (options?.debug) {
      this.logger.debug(`缓存初始化: maxSize=${this.maxSize}, defaultTTL=${this.defaultTTL}ms`)
    }
  }

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（毫秒），不传则使用默认 TTL
   */
  set(key: string, value: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? this.defaultTTL)
    this.cache.set(key, {
      value,
      expiresAt,
      lastAccessed: Date.now()
    })

    this.evictIfNeeded()
    this.logger.debug(`缓存已设置: ${key}, TTL=${ttl ?? this.defaultTTL}ms`)
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值，不存在或已过期返回 undefined
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      this.logger.debug(`缓存未命中: ${key}`)
      return undefined
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.misses++
      this.logger.debug(`缓存已过期: ${key}`)
      return undefined
    }

    // 更新最后访问时间（用于 LRU）
    entry.lastAccessed = Date.now()
    this.hits++
    this.logger.debug(`缓存命中: ${key}`)
    return entry.value
  }

  /**
   * 检查缓存是否存在且未过期
   * @param key 缓存键
   */
  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  /**
   * 删除指定缓存
   * @param key 缓存键
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.logger.debug(`缓存已删除: ${key}`)
    }
    return deleted
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    const size = this.cache.size
    this.cache.clear()
    this.hits = 0
    this.misses = 0
    this.logger.debug(`缓存已清空: ${size} 条记录`)
  }

  /**
   * 获取当前缓存条目数
   */
  size(): number {
    return this.cache.size
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    const total = this.hits + this.misses
    const hitRate = total > 0 ? (this.hits / total * 100).toFixed(2) : '0.00'

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      total
    }
  }

  /**
   * 清理过期条目
   * @returns 清理的条目数
   */
  cleanExpired(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`已清理 ${cleaned} 条过期缓存`)
    }

    return cleaned
  }

  /**
   * LRU 淘汰策略：当缓存达到最大值时，删除最久未使用的条目
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxSize) {
      return
    }

    // 找到最久未访问的条目
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.logger.debug(`LRU 淘汰: ${oldestKey}`)
    }
  }

  /**
   * 带缓存的函数包装器
   * @param key 缓存键
   * @param fn 要执行的异步函数
   * @param ttl 过期时间（毫秒）
   * @returns 函数执行结果（可能来自缓存）
   */
  async wrap(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    // 先尝试从缓存获取
    const cached = this.get(key)
    if (cached !== undefined) {
      return cached
    }

    // 缓存未命中，执行函数
    const result = await fn()
    this.set(key, result, ttl)
    return result
  }
}

/**
 * 创建一个缓存实例
 * @param name 缓存名称（用于日志）
 * @param options 缓存选项
 */
export function createCache<T = any>(name?: string, options?: CacheOptions): SimpleCache<T> {
  return new SimpleCache<T>(name, options)
}
