import { plainToInstance } from 'class-transformer'
import { NcRenApiData, NcRenApiParamsMessage, NcRenApiResponse } from '../../connectors/adapter/onebot/napcatMsgTypes.js'
import { BaseBotAdapter } from '../../connectors/index.js'
import { RenMessage, RenMessageBodyData, RenMessageDataType, RenMessageImage, RenMessageText } from '../../index.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'
import { fillTextTemplate, getGlobal } from '../../utils/node.js'

/**
 * 发送复杂消息节点
 */
export class SendMessageNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'send-message',
        name: '发送消息',
        description: ' 组装发送自定义的消息结构',
        fullDescription: '组装并发送自定义的消息结构到指定目标，支持多种消息类型的组合。<br>本节点支持跨 bot 发送，允许你在一个 bot 的响应流程中调用另一个 bot 发送消息。',
        category: 'bot',
        icon: 'comment',
        settingsComponent: 'SendMessageSettings',
        params: [
            {
                key: 'settings',
                label: '',
                type: 'settings'
            },
            {
                key: 'sender',
                label: '发送者',
                type: 'input',
                placeholder: '输入发送者 ID',
                required: true,
                dynamic: true,
                defaultValue: '{trigger.selfId}'
            },
            {
                key: 'targetType',
                label: '接收者类型',
                type: 'select',
                options: [
                    { label: '私聊', value: 'private' },
                    { label: '群组', value: 'group' }
                ],
                defaultValue: 'private',
                required: true
            },
            {
                key: 'target',
                label: '接收者',
                type: 'input',
                placeholder: '输入接收者 ID',
                required: true,
                dynamic: true,
                defaultValue: '{trigger.targetId}'
            },
        ],
        outputSchema: [
            {
                key: 'sent',
                label: '发送状态',
                type: 'boolean',
                description: '消息是否成功发送'
            },
            {
                key: 'message',
                label: '状态信息',
                type: 'string',
                description: '发送结果的状态信息'
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
                error: 'bot 参数无效'
            }
        }

        const message = getGlobal(context, 'trigger') as RenMessage

        let senderCfg = params['sender']
        let targetCfg = params['target']
        if (senderCfg.indexOf('{trigger.selfId}') > -1) {
            senderCfg = message.selfId
        }
        if (targetCfg.indexOf('{trigger.targetId}') > -1) {
            targetCfg = message.targetId || message.groupId
        }

        const targetType = params['targetType'] || 'private'

        // 组装消息体
        const rawVal = params['msgList'] as
            { value: string, data: any }[] || []
        const messageBody = [] as {
            type: RenMessageDataType,
            data: RenMessageBodyData
        }[]

        for (const item of rawVal) {
            // 对 item.data 中的 {nodeid.value} 进行替换
            if (typeof item.data === 'string' && item.data.includes('{') && item.data.includes('}')) {
                item.data = fillTextTemplate(item.data, input, context)
            }

            switch (item.value) {
                case 'text':
                    messageBody.push({
                        type: RenMessageDataType.text,
                        data: new RenMessageText(item.data)
                    })
                    break
                case 'image':
                    messageBody.push({
                        type: RenMessageDataType.image,
                        data: new RenMessageImage(item.data, 1)
                    })
                    break
            }
        }

        const action = new NcRenApiData(
            'send_msg',
            new NcRenApiParamsMessage(
                messageBody,
                targetType == 'private' ? Number(targetCfg) : undefined,
                targetType == 'group' ? Number(targetCfg) : undefined,
            )
        )

        let data: any = await bot.callApiSync(action)
        // 有些适配器/实现可能返回一个数组包裹的响应，取第一个元素作为实际响应
        if (Array.isArray(data) && data.length > 0) data = data[0]
        const res = plainToInstance(NcRenApiResponse, data)
        if (!res || typeof res.retcode !== 'number' || res.retcode !== 0) {
            return {
                success: false,
                error: `发送消息失败 > 错误码：${(res && (res.retcode ?? JSON.stringify(res))) || 'unknown'}，信息：${(res && res.message) || ''}`
            }
        } else {
            return {
                success: true,
                output: {
                    sent: true,
                    message: '消息发送成功'
                }
            }
        }
    }
}
