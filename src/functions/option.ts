/*
 * @FileDescription: 设置功能模块
 * @Author: Stapxs
 */

import { toast } from './toast'
import { backend } from '@app/functions/backend'

let cacheConfigs: { [key: string]: any }

// 设置项的初始值，防止下拉菜单选项为空或者首次使用初始错误
export const optDefault: { [key: string]: any } = {
    bots: [],
}

// =============== 设置项事件 ===============

const configFunction: { [key: string]: (value: any) => void } = {
}

// =============== 设置基础功能 ===============

/**
 * 读取并序列化 localStorage 中的设置项（electron 读取 electron-store 存储）
 * @returns 设置项集合
 */
export async function load(): Promise<{ [key: string]: any }> {
    let data = {} as { [key: string]: any }

    if('tauri' == backend.type) {
        data = await backend.call('opt:getAll')
        if(data) {
            // 处理下 json 字符串
            Object.keys(data).forEach((key) => {
                const value = data[key]
                if (typeof value == 'string') {
                    try {
                        data[key] = JSON.parse(value)
                    } catch (e: unknown) {
                        // ignore
                    }
                }
            })
        }
    } else {
        const str = localStorage.getItem('options')
        if (str != null) {
            const list = str.split('&')
            for (let i = 0; i <= list.length; i++) {
                if (list[i] !== undefined) {
                    const opt: string[] = list[i].split(':')
                    if (opt.length === 2) {
                        data[opt[0]] = opt[1]
                    }
                }
            }
        }
    }
    return loadOptData(data)
}

function loadOptData(data: { [key: string]: any }) {
    const options: { [key: string]: any } = {}
    Object.keys(data).forEach((key) => {
        const value = data[key]
        if (value === 'true' || value === 'false') {
            options[key] = value === 'true'
        } else if (value === 'null') {
            options[key] = null
        } else if (typeof value == 'string') {
            try {
                options[key] = decodeURIComponent(value)
            } catch (e: unknown) {
                // 如果 decodeURIComponent 失败（比如 CSS 内容有特殊字符），直接使用原值
                options[key] = value
            }
            try {
                options[key] = JSON.parse(options[key])
            } catch (e: unknown) {
                // ignore
            }
        } else {
            options[key] = value
        }
        // 执行设置项操作
        run(key, options[key])
    })
    let optChanged = false
    // 初始化不存在的需要进行初始化的值
    Object.keys(optDefault).forEach((key) => {
        if (options[key] === undefined) {
            optChanged = true
            options[key] = optDefault[key]
        }
    })
    // 删除不存在的设置项
	const needless: string[] = []
	for (const key in options) {
		if (optDefault[key] === undefined)
			needless.push(key)
	}
    if (!import.meta.env.DEV){
        for (const key of needless) {
			delete options[key]
		}
    }else if (needless.length > 0) {
        toast.info('发现' + needless.length + '条未使用的配置属性')
    }

    // 保存
    if (optChanged) {
        saveAll(options)
    }
    // 保存返回
    cacheConfigs = options
    return options
}

/**
 * 执行设置项对应的方法
 * @param name 设置项名称
 * @param value 设置项值
 */
export function run(name: string, value: any) {
    if (typeof configFunction[name] === 'function') configFunction[name](value)
}

/**
 * 获取设置项值
 * @param name 设置项名称
 * @returns 设置项值（如果没有则为 null）
 */
export function get(name: string): any {
    if (cacheConfigs) {
        const names = Object.keys(cacheConfigs)
        for (let i = 0; i < names.length; i++) {
            if (names[i] === name) {
                const get = cacheConfigs[names[i]]
                try {
                    return JSON.parse(get)
                } catch (e: unknown) {
                    return get
                }
            }
        }
    }
    return null
}

/**
 * 获取原始设置项值
 * @param name 设置项名称
 * @returns 设置项值（如果没有则为 null）
 * @description <strong>注意：</strong>
 * 此方法获取原始设置项值，不会对值进行 T/F 转换、JSON 解析、URL 解码等操作；
 * 在 Web 端和 Capacitor 端使用时由于存储在 WebStorage 中，需要特别注意预防上述未转换导致的错误。
 */
export function getRaw(name: string) {
    if('tauri' == backend.type) {
        return backend.call('opt:get', name)
    } else {
        // 解析拆分并执行各个设置项的初始化方法
        const str = localStorage.getItem('options')
        if (str != null) {
            const list = str.split('&')
            for (let i = 0; i <= list.length; i++) {
                if (list[i] !== undefined) {
                    const opt: string[] = list[i].split(':')
                    if (opt.length === 2) {
                        if (name == opt[0]) {
                            return Promise.resolve(opt[1])
                        }
                    }
                }
            }
        }
        return Promise.resolve(null)
    }
}

/**
 * 保存设置项
 * @param name 设置项名称
 * @param value 设置项值
 */
export function save(name: string, value: any) {
    cacheConfigs[name] = value
    saveAll()
}
export function saveAll(config = {} as { [key: string]: any }) {
    if (Object.keys(config).length == 0) {
        Object.assign(config, cacheConfigs)
    }
    let str = ''
    Object.keys(config).forEach((key) => {
        const isObject = typeof config[key] == 'object'
        str +=
            key +
            ':' +
            encodeURIComponent(
                isObject ? JSON.stringify(config[key]) : config[key],
            ) +
            '&'
    })
    str = str.substring(0, str.length - 1)
    localStorage.setItem('options', str)

    // electron：将配置保存
    if (backend.isDesktop()) {
        const saveConfig = config
        Object.keys(config).forEach((key) => {
            const isObject = typeof config[key] == 'object'
            saveConfig[key] = isObject ? JSON.stringify(config[key]): config[key]
        })
        backend.call('opt:saveAll', { data: saveConfig })
    }
}

/**
 * 保存并触发设置项操作
 * @param name 设置项名称
 * @param value 设置项值
 */
export function runAS(name: string, value: any) {
    save(name, value)
    run(name, value)
}

/**
 * 通过 DOM 事件保存并触发设置项操作
 * @param event DOM 事件
 */
export function runASWEvent(event: Event) {
    const sender = event.target as HTMLElement
    if (sender != null) {
        const type = sender.nodeName
        const name = sender.getAttribute('name')
        let value = null as any
        switch (type) {
            case 'SELECT': {
                const sel = sender as HTMLSelectElement
                const opt = sel.options[sel.selectedIndex]
                value = opt ? opt.value : ''
                break
            }
            case 'INPUT': {
                switch ((sender as HTMLInputElement).type) {
                    case 'checkbox': {
                        value = (sender as HTMLInputElement).checked
                        break
                    }
                    case 'radio': {
                        value = sender.dataset.id
                        break
                    }
                    case 'color':
                    case 'range':
                    case 'number':
                    case 'text': {
                        value = (sender as HTMLInputElement).value
                        break
                    }
                }
                break
            }
        }
        if (name !== null) {
            runAS(name, value)
        }
    }
}

/**
 * 删除设置项
 * @param name 设置项名称
 */
export function remove(name: string) {
    delete cacheConfigs[name]
    saveAll()
}

export default {
    get,
    getRaw,
    load,
    save,
    run,
    runAS,
    runASWEvent,
    remove,
}
