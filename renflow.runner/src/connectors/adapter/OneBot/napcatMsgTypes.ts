import { Expose, Type, Transform } from 'class-transformer'
import { RenApiData, RenApiParamsMessage, RenMessage, RenMessageDataType, RenMessageImage, RenMessageReply, RenMessageText, SenderDTO } from '../msgTypes.js'


class NcRenMessageImage extends RenMessageImage {
    @Expose()
    @Transform(({ obj }) => obj.data?.summary, { toClassOnly: true })
    @Transform(({ value }) => ({ summary: value }), { toPlainOnly: true })
    summary?: string

    @Expose()
    @Transform(({ obj }) => obj.data?.emoji_id, { toClassOnly: true })
    @Transform(({ value }) => ({ emojiId: value }), { toPlainOnly: true })
    emojiId?: string

    @Expose()
    @Transform(({ obj }) => obj.data?.emoji_package_id, { toClassOnly: true })
    @Transform(({ value }) => ({ packageId: value }), { toPlainOnly: true })
    packageId?: string

    constructor(url?: string, subType?: number, summary?: string, emojiId?: string, packageId?: string) {
        super(url, subType)
        if (summary) this.summary = summary
        if (emojiId) this.emojiId = emojiId
        if (packageId) this.packageId = packageId
    }
}

type NcRenMessageBodyData = RenMessageText | NcRenMessageImage | RenMessageReply

export class NapcatRenMessage extends RenMessage {

    @Expose({ name: 'message_id' })
    messageId: string // 消息唯一 ID

    @Expose({ name: 'real_seq' })
    @Transform(({ value }) => value == null ? undefined : Number(value), { toClassOnly: true })
    @Transform(({ value }) => value == null ? value : String(value), { toPlainOnly: true })
    messageSeqId?: number // 消息序列 ID

    @Expose({ name: 'message_type' })
    messageType: 'group' | 'private' // 消息类型

    @Expose({ name: 'self_id' })
    @Transform(({ value }) => Number(value), { toClassOnly: true })
    @Transform(({ value }) => value == null ? value : String(value), { toPlainOnly: true })
    selfId: number // 机器人 ID（收到消息的机器人）

    @Expose({ name: 'target_id' })
    @Transform(({ value }) => value == null ? undefined : Number(value), { toClassOnly: true })
    @Transform(({ value }) => value == null ? value : String(value), { toPlainOnly: true })
    targetId?: number // 目标 ID（群消息时为群号，私聊消息时为用户 ID）

    @Expose({ name: 'group_id' })
    @Transform(({ value }) => value == null ? undefined : Number(value), { toClassOnly: true })
    @Transform(({ value }) => value == null ? value : String(value), { toPlainOnly: true })
    groupId?: number // 群号（群消息时存在）

    @Expose({ name: 'group_name' })
    declare groupName?: string // 群名称（群消息时存在）

    @Expose({ name: 'user_id' })
    @Transform(({ value }) => value == null ? undefined : Number(value), { toClassOnly: true })
    @Transform(({ value }) => value == null ? value : String(value), { toPlainOnly: true })
    userId?: number // 发送者用户 ID（私聊消息时存在）

    @Expose({ name: 'sender' })
    @Type(() => SenderDTO)
    sender: SenderDTO

    @Expose({ name: 'raw_message' })
    rawMessage: string // 原始消息内容

    @Expose({ name: 'message' })
    message: {
        type: RenMessageDataType,
        data: NcRenMessageBodyData
    }[] | string

    @Expose({ name: 'time' })
    @Transform(({ value }) => new Date(value * 1000), { toClassOnly: true })
    @Transform(({ value }) => Math.floor((value as Date).getTime() / 1000), { toPlainOnly: true })
    time: Date // 消息发送时间

    // 非映射字段（不会被 classToPlain 处理）
    isMine: boolean // 是否为自己发送的消息

    constructor(init?: Partial<NapcatRenMessage>) {
        super()
        this.messageId = init?.messageId || ''
        this.messageSeqId = init?.messageSeqId
        this.messageType = init?.messageType || 'private'
        this.selfId = init?.selfId || 0
        this.targetId = init?.targetId
        this.groupId = init?.groupId
        this.userId = init?.userId
        this.sender = init?.sender as any || { userId: 0, nickName: '', role: 'member' }
        this.rawMessage = init?.rawMessage || ''
        this.message = init?.message || ''
        this.time = init?.time ? new Date(init.time as any) : new Date()
        this.isMine = init?.isMine || false
    }
}

// callApi 基本参数类型 ==================================================

type NcRenApiParamsType = NcRenApiParamsMessage

export class NcRenApiParamsMessage extends RenApiParamsMessage {
    @Expose()
    declare message: { type: RenMessageDataType, data: NcRenMessageBodyData }[]

    @Expose({name: 'user_id' })
    declare userId?: number

    @Expose({ name: 'group_id' })
    declare groupId?: number
}

export class NcRenApiData extends RenApiData {
    @Expose() action!: string
    @Expose() params!: NcRenApiParamsType
    @Expose() echo?: string

    constructor(action: string, params: NcRenApiParamsType, echo?: string) {
        super()
        this.action = action
        this.params = params
        if (echo) this.echo = echo
    }
}

export class NcRenApiResponse {
    @Expose() data?: any
    @Expose() echo?: string
    @Expose() message?: string
    @Expose() retcode!: number
    @Expose() status!: string
    @Expose() wording?: string
}

