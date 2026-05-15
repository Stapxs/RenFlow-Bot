import type { NodeContext } from '../nodes/types.js'
import { getValue } from './util.js'

/**
 * 从全局存储读取值
 * @param context 节点执行上下文
 * @param key 键
 * @param defaultValue 默认值（当不存在时返回）
 */
export function getGlobal(context: NodeContext, key: string, defaultValue?: any): any {
    try {
        if (!context || !context.globalState) return defaultValue
        return context.globalState.has(key) ? context.globalState.get(key) : defaultValue
    } catch {
        return defaultValue
    }
}

/**
 * 填充文本模板中的占位符
 * @param str 模板字符串
 * @param input 输入数据
 * @param context 节点执行上下文
 * @param throwError 当占位符无法解析时是否抛出错误
 * @returns
 */
export function fillTextTemplate(
    str: string, input: {[key: string]: any},
    context: NodeContext, throwError = false): string {
    const regex = /\{([^}]+)\}/g
    let match
    let newStr = str
    while ((match = regex.exec(str)) !== null) {
        const placeholder = match[0]
        const rawPath = match[1].trim()
        const path = rawPath.split('.')
        let value = undefined

        // 优先按当前 input 直接解析完整路径，和日志节点的使用体验保持一致。
        value = getValue(input, rawPath)

        // 若当前 input 中不存在，再回退到旧的“第一段视为全局节点 ID”规则，
        // 以兼容历史模板如 {node-1.result}。
        if (value === undefined && path.length === 1) {
            value = getValue(input, path[0])
        } else if (value === undefined) {
            const nodeId = path[0]
            const nodeData = getGlobal(context, nodeId)
            value = getValue(nodeData, path.slice(1).join('.'))
        }
        if (value !== undefined) {
            newStr = newStr.replace(placeholder, String(value))
        } else if(throwError) {
            throw new Error(`无法解析模板中的占位符: ${placeholder}`)
        }
    }
    return newStr
}
