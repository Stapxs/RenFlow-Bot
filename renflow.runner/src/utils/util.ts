/**
 * 根据路径从 Object 中获取值
 * @param val 一个对象
 * @param path 形似 'a.b.c' 或 'a[0].b' 或 'a.0.b' 的路径字符串
 * @returns 路径对应的值，如果不存在则返回 undefined
 */
export function getValue(val: any, path: string): any {
    // 如果传入空路径，直接返回原值
    if (!path) return val

    // 将 a[0].b 或 a[0][1] 转换为 a.0.b 或 a.0.1 的形式
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1')
    const parts = normalizedPath.split('.')
    let current: any = val

    for (const part of parts) {
        if (current == null) {
            return undefined
        }

        // 尝试作为数组索引
        const index = Number(part)
        if (!Number.isNaN(index) && Array.isArray(current)) {
            current = current[index]
        } else if (typeof current === 'object' || typeof current === 'function') {
            // 作为对象属性
            if (Object.prototype.hasOwnProperty.call(current, part)) {
                current = current[part]
            } else {
                return undefined
            }
        } else {
            return undefined
        }
    }

    // 如果是对象且默认 toString 返回 "[object Object]"
    // 则尝试用 JSON.stringify 转为可读字符串
    if (current != null && typeof current === 'object') {
        const asString = String(current)
        if (asString === '[object Object]') {
            try {
                return JSON.stringify(current)
            } catch {
                return asString
            }
        }
    }

    return current
}

/**
 * 判断数组 b 是否为数组 a 的开头部分
 * @param a 数组 a
 * @param b 数组 b
 * @returns 如果 b 是 a 的开头部分则返回 true，否则返回 false
 */
export function startsWithArray(a: string[], b: string[]) {
  if (b.length > a.length) return false;
  return b.every((v, i) => a[i] === v);
}
