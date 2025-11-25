import { BaseBotAdapter } from '../../connectors/index.js'
import { RenMessage, RenMessageDataType, RenMessageText } from '../../connectors/adapter/msgTypes.js'
import { BaseNode } from '../BaseNode.js'
import type { NodeMetadata, NodeContext, NodeExecutionResult } from '../types.js'
import { NcRenApiData, NcRenApiParamsMessage, NcRenApiResponse } from '../../connectors/adapter/onebot/napcatMsgTypes.js'
import { plainToInstance } from 'class-transformer'
import { fillTextTemplate, getGlobal } from '../../utils/node.js'

/**
 * 发送文本消息节点
 * 用于向用户或群组发送文本消息
 */
export class SendTextNode extends BaseNode {
    metadata: NodeMetadata = {
        id: 'send-text',
        name: '发送文本消息',
        description: '发送文本消息到指定目标',
        category: 'bot',
        icon: 'comment',
        params: [
            {
                key: 'text',
                label: '消息内容',
                type: 'textarea',
                placeholder: '输入要发送的文本消息',
                required: true,
                dynamic: true
            }
        ],
        outputSchema: [
            {
                key: 'text',
                label: '消息内容',
                type: 'string',
                description: '发送的文本消息内容'
            },
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
        const text = params.text

        const bot = getGlobal(context, 'bot') as BaseBotAdapter
        if (!bot || typeof bot.callApiSync !== 'function') {
            return {
                success: false,
                error: 'bot 参数无效'
            }
        }

        const message = getGlobal(context, 'trigger') as RenMessage

        const messageBody = {
            type: RenMessageDataType.text,
            data: new RenMessageText(fillTextTemplate(text, input, context))
        }
        const id = message.groupId || message.userId
        if(id == undefined) {
            return {
                success: false,
                error: '消息体异常'
            }
        }
        const action = new NcRenApiData(
            'send_msg',
            new NcRenApiParamsMessage(
                [messageBody],
                message.messageType === 'group' ? undefined : id,
                message.messageType === 'group' ? id : undefined
            )
        )
        let data: any = await bot.callApiSync(action)
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
                    text: text,
                    sent: true,
                    message: '消息发送成功'
                }
            }
        }
    }
}
