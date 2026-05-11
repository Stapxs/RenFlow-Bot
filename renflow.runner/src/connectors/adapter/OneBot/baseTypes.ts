import { Expose, Transform, Type } from 'class-transformer'
import { RenApiData, RenApiParamsType } from '../msgTypes.js'

const toOptionalNumber = ({ value }: { value: any }) => (
    value === undefined || value === null || value === '' ? undefined : Number(value)
)

export class OneBotApiAction extends RenApiData {
    @Expose() action!: string
    @Expose() params!: RenApiParamsType
    @Expose() echo?: string

    constructor(action: string, params?: Record<string, any>, echo?: string) {
        super()
        this.action = action
        this.params = (params ?? {}) as unknown as RenApiParamsType
        if (echo) this.echo = echo
    }
}

export class OneBotApiResponse {
    @Expose() data?: any
    @Expose() echo?: string
    @Expose() message?: string
    @Expose() retcode!: number
    @Expose() status!: string
    @Expose() wording?: string
}

export class OneBotLoginInfo {
    @Expose({ name: 'user_id' })
    @Transform(toOptionalNumber, { toClassOnly: true })
    @Transform(({ value }) => (value == null ? value : Number(value)), { toPlainOnly: true })
    userId!: number

    @Expose({ name: 'nickname' })
    nickname!: string

    @Expose({ name: 'tiny_id' })
    @Transform(toOptionalNumber, { toClassOnly: true })
    tinyId?: number

    @Expose({ name: 'client_id' })
    @Transform(toOptionalNumber, { toClassOnly: true })
    clientId?: number

    @Expose({ name: 'platform' })
    platform?: string

    @Expose({ name: 'status' })
    status?: number

    @Expose({ name: 'online_status' })
    @Transform(toOptionalNumber, { toClassOnly: true })
    onlineStatus?: number

    constructor(init?: Partial<OneBotLoginInfo>) {
        Object.assign(this, init)
    }
}

export class OneBotStrangerInfo extends OneBotLoginInfo {
    @Expose({ name: 'sex' })
    sex?: string

    @Expose({ name: 'age' })
    @Transform(toOptionalNumber, { toClassOnly: true })
    age?: number

    @Expose({ name: 'qid' })
    qid?: string

    @Expose({ name: 'level' })
    @Transform(toOptionalNumber, { toClassOnly: true })
    level?: number

    @Expose({ name: 'login_days' })
    @Transform(toOptionalNumber, { toClassOnly: true })
    loginDays?: number

    @Expose({ name: 'area' })
    area?: string

    @Expose({ name: 'title' })
    title?: string

    @Expose({ name: 'avatar' })
    avatar?: string

    @Expose({ name: 'remark' })
    remark?: string

    constructor(init?: Partial<OneBotStrangerInfo>) {
        super(init)
        Object.assign(this, init)
    }
}

export class OneBotAccountProfile extends OneBotStrangerInfo {
    @Type(() => OneBotLoginInfo)
    loginInfo?: OneBotLoginInfo

    @Type(() => OneBotStrangerInfo)
    strangerInfo?: OneBotStrangerInfo

    static from<L extends OneBotLoginInfo, S extends OneBotStrangerInfo | undefined>(
        login: L,
        stranger?: S
    ): OneBotAccountProfile {
        const profile = new OneBotAccountProfile()
        profile.mergeFrom(login, stranger)
        return profile
    }

    protected mergeFrom<L extends OneBotLoginInfo, S extends OneBotStrangerInfo | undefined>(
        login: L,
        stranger?: S
    ) {
        Object.assign(this, login)
        if (stranger) Object.assign(this, stranger)
        this.loginInfo = login
        this.strangerInfo = stranger
    }
}
