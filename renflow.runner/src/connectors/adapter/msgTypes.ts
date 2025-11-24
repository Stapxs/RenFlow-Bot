import { Exclude, Expose, Transform } from 'class-transformer'

// 消息数据类型 ==================================================

export enum RenMessageDataType {
    text = 'text',
    image = 'image',
    music = 'music',
    video = 'video',
    voice = 'record',
    file = 'file',
    reply = 'reply',
    json = 'json',
    face = 'face',
    mface = 'mface', // 商城表情
    markdown = 'markdown',
    node = 'node',  // 合并转发消息节点
    forward = 'forward',  // 合并转发消息，用于上报
    xml = 'xml',
    poke = 'poke'
}

export type RenMessageBodyData = RenMessageText | RenMessageImage | RenMessageReply

export class RenMessageText {
    @Expose() text: string

    constructor(text: string) {
        this.text = text
    }
}

export class RenMessageImage {
    @Expose({ name: 'url', toClassOnly: true })
    @Exclude({ toPlainOnly: true })
    _url!: string

    @Expose({ name: 'file', toPlainOnly: true })
    _file!: string

    get data(): string {
        return this._url
    }
    set data(value: string) {
        this._url = value
        this._file = value
    }

    @Expose() subType?: number

    constructor(data?: string, subType?: number) {
        if (data) this.data = data
        if (subType) this.subType = subType
    }
}

export class RenMessageReply {
    @Expose() id!: string
}

export function getRenMessageTypeByString(typeStr: string): RenMessageDataType | null {
    switch (typeStr) {
        case 'text':
            return RenMessageDataType.text
        case 'image':
            return RenMessageDataType.image
        case 'music':
            return RenMessageDataType.music
        case 'video':
            return RenMessageDataType.video
        case 'record':
            return RenMessageDataType.voice
        case 'file':
            return RenMessageDataType.file
        case 'reply':
            return RenMessageDataType.reply
        case 'json':
            return RenMessageDataType.json
        case 'face':
            return RenMessageDataType.face
        case 'mface':
            return RenMessageDataType.mface
        case 'markdown':
            return RenMessageDataType.markdown
        case 'node':
            return RenMessageDataType.node
        case 'forward':
            return RenMessageDataType.forward
        case 'xml':
            return RenMessageDataType.xml
        case 'poke':
            return RenMessageDataType.poke
        default:
            return null
    }
}

export class SenderDTO {
    @Expose({ name: 'user_id' })
    @Transform(({ value }) => Number(value), { toClassOnly: true })
    @Transform(({ value }) => value == null ? value : String(value), { toPlainOnly: true })
    userId!: number

    @Expose({ name: 'nickname' })
    nickName!: string

    @Expose({ name: 'card' })
    cardName?: string

    @Expose({ name: 'role' })
    role?: string
}

export abstract class RenMessage {
    abstract messageId: string // 消息唯一 ID
    abstract messageSeqId?: number // 消息序列 ID
    abstract messageType: 'group' | 'private' // 消息类型
    abstract selfId: number // 机器人 ID（收到消息的机器人）
    abstract targetId?: number // 目标 ID（群消息时为群号，私聊消息时为用户 ID）
    abstract groupId?: number // 群号（群消息时存在）
    abstract groupName?: string // 群名称（群消息时存在）
    abstract userId?: number // 发送者用户 ID（私聊消息时存在）
    abstract sender: SenderDTO
    abstract rawMessage: string // 原始消息内容
    abstract message: {
        type: RenMessageDataType,
        data: RenMessageBodyData
    }[] | string // 消息内容数组
    abstract time: Date // 消息发送时间
    abstract isMine: boolean // 是否为自己发送的消息

    __meta__ = { className: 'RenMessage' }

    /** 获取文本内容 */
    static getTextContent(message: {
        type: RenMessageDataType,
        data: RenMessageBodyData
    }[] | string): string {
        if (typeof message === 'string') {
            return message
        } else {
            return message.filter(m => m.type === RenMessageDataType.text).map(m => (m.data as RenMessageText).text).join('')
        }
    }
}

export class BaseRenMessage extends RenMessage {
    messageId: string = ''
    messageSeqId?: number | undefined
    messageType: 'group' | 'private' = 'private'
    selfId: number = 0
    targetId?: number | undefined
    groupId?: number | undefined
    groupName?: string | undefined
    userId?: number | undefined
    sender: SenderDTO = new SenderDTO()
    rawMessage: string = ''
    message: string | { type: RenMessageDataType; data: RenMessageBodyData }[]
        = ''
    time: Date = new Date()
    isMine: boolean = false
}

// callApi 基本参数类型 ==================================================

export type RenApiParamsType = RenApiParamsMessage

export class RenApiParamsMessage {
    @Expose()
    message!: { type: RenMessageDataType, data: RenMessageBodyData }[]

    @Expose({name: 'user_id' })
    userId?: number

    @Expose({ name: 'group_id' })
    groupId?: number

    constructor(message: { type: RenMessageDataType, data: RenMessageBodyData }[], userId?: number, groupId?: number) {
        this.message = message
        if (userId) this.userId = userId
        if (groupId) this.groupId = groupId
    }
}

export abstract class RenApiData {
    abstract action: string
    abstract params: RenApiParamsType
    abstract echo?: string
}
