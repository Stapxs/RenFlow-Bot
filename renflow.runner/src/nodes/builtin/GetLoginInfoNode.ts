import { instanceToPlain, plainToInstance } from 'class-transformer'
import { OneBotAccountProfile, OneBotApiAction, OneBotApiResponse, OneBotLoginInfo, OneBotStrangerInfo } from '../../connectors/adapter/onebot/baseTypes.js'
import { BaseBotAdapter } from '../../connectors/index.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'
import { getGlobal } from '../../utils/node.js'

/**
 * 获取登录账号信息节点
 * 会先调用 get_login_info 获取当前登录账号，再调用 get_stranger_info 获取更详细的信息，
 * 最终合并两个接口的数据返回。
 */
export class GetLoginInfoNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'get-login-info',
        name: '获取账号信息',
        description: '获取机器人相关的信息。',
        fullDescription: '获取机器人相关的信息。',
        category: 'bot',
        icon: 'user',
        params: [],
        outputSchema: [
            {
                key: 'user_id',
                label: '用户 ID',
                type: 'number',
                description: '账号的 QQ 号'
            },
            {
                key: 'nickname',
                label: '昵称',
                type: 'string',
                description: '账号昵称'
            },
            {
                key: 'sex',
                label: '性别',
                type: 'string',
                description: '性别（male/female/unknown）'
            },
            {
                key: 'age',
                label: '年龄',
                type: 'number',
                description: '年龄'
            },
            {
                key: 'level',
                label: '等级',
                type: 'number',
                description: 'QQ 等级'
            },
            {
                key: 'login_days',
                label: '登录天数',
                type: 'number',
                description: 'QQ 登录天数'
            },
            {
                key: 'qid',
                label: 'QID',
                type: 'string',
                description: '唯一标识（若接口支持）'
            },
            {
                key: 'avatar',
                label: '头像 URL',
                type: 'string',
                description: '头像链接（如果返回）'
            },
            {
                key: 'area',
                label: '地区',
                type: 'string',
                description: '账号所在地（若接口返回）'
            },
            {
                key: 'title',
                label: '头衔',
                type: 'string',
                description: '账号头衔或称号（若接口返回）'
            },
            {
                key: 'remark',
                label: '备注',
                type: 'string',
                description: '账号备注（若接口返回）'
            }
        ]
    }

    async execute(
        input: any,
        params: Record<string, any>,
        context: NodeContext
    ): Promise<NodeExecutionResult> {
        const bot = getGlobal(context, 'bot') as BaseBotAdapter
        if (!bot || typeof bot.callApiSync !== 'function') {
            return {
                success: false,
                error: '未找到可用的 bot 适配器'
            }
        }

        try {
            // Step 1: 调用 get_login_info 获取当前账号信息
            let loginResponse: any = await bot.callApiSync(
                new OneBotApiAction('get_login_info')
            )

            if (Array.isArray(loginResponse) && loginResponse.length > 0) {
                loginResponse = loginResponse[0]
            }

            const loginApiResponse = plainToInstance(OneBotApiResponse, loginResponse)
            if (!loginApiResponse || typeof loginApiResponse.retcode !== 'number' || loginApiResponse.retcode !== 0) {
                return {
                    success: false,
                    error: loginApiResponse?.message || `get_login_info 调用失败: retcode=${loginApiResponse?.retcode ?? 'unknown'}`
                }
            }

            const loginInfoRaw = plainToInstance(
                OneBotLoginInfo,
                loginApiResponse.data || {},
                { enableImplicitConversion: true }
            ) as OneBotLoginInfo | OneBotLoginInfo[]
            const loginInfo = Array.isArray(loginInfoRaw) ? loginInfoRaw[0] : loginInfoRaw
            if (!loginInfo) {
                return {
                    success: false,
                    error: 'get_login_info 返回数据为空'
                }
            }

            const userId = loginInfo.userId
            if (typeof userId !== 'number') {
                return {
                    success: false,
                    error: 'get_login_info 返回的 user_id 无效'
                }
            }

            // Step 2: 调用 get_stranger_info 获取更多资料
            let strangerResponse: any = await bot.callApiSync(
                new OneBotApiAction('get_stranger_info', { user_id: userId })
            )

            if (Array.isArray(strangerResponse) && strangerResponse.length > 0) {
                strangerResponse = strangerResponse[0]
            }

            const strangerApiResponse = plainToInstance(OneBotApiResponse, strangerResponse)
            if (!strangerApiResponse || typeof strangerApiResponse.retcode !== 'number' || strangerApiResponse.retcode !== 0) {
                return {
                    success: false,
                    error: strangerApiResponse?.message || `get_stranger_info 调用失败: retcode=${strangerApiResponse?.retcode ?? 'unknown'}`
                }
            }

            const strangerInfoRaw = plainToInstance(
                OneBotStrangerInfo,
                strangerApiResponse.data || {},
                { enableImplicitConversion: true }
            ) as OneBotStrangerInfo | OneBotStrangerInfo[]
            const strangerInfo = Array.isArray(strangerInfoRaw) ? strangerInfoRaw[0] : strangerInfoRaw

            const profile = OneBotAccountProfile.from(loginInfo, strangerInfo)

            const profilePlain = instanceToPlain(profile)
            const loginPlain = loginInfo ? instanceToPlain(loginInfo) : null
            const strangerPlain = strangerInfo ? instanceToPlain(strangerInfo) : null

            const output: Record<string, any> = {
                user_id: profile.userId ?? userId,
                nickname: profile.nickname,
                sex: profile.sex,
                age: profile.age,
                level: profile.level,
                login_days: profile.loginDays,
                qid: profile.qid,
                avatar: profile.avatar,
                area: profile.area,
                title: profile.title,
                remark: profile.remark,
                login_info: loginPlain,
                stranger_info: strangerPlain,
                raw: profilePlain,
            }

            return {
                success: true,
                output
            }
        } catch (error: any) {
            return {
                success: false,
                error: error?.message || String(error)
            }
        }
    }
}

