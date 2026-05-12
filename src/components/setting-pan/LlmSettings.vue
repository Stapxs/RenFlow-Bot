<script setup lang="ts">
import { computed, ref } from 'vue'
import BcTab from 'vue3-bcui/packages/bc-tab'
import { toast } from '@app/functions/toast'

interface Props {
    nodeId: string
    params?: any[]
    modelValue: Record<string, any>
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'update:model-value', value: Record<string, any>): void
}>()

const modeOptions = [
    { label: '单次请求', value: 'single' },
    { label: 'Agent 模式', value: 'agent' },
]

const providerOptions = [
    { label: 'OpenAI', value: 'openai' },
    { label: 'Anthropic', value: 'anthropic' },
    { label: 'Gemini', value: 'gemini' },
    { label: '自定义 OpenAI 兼容', value: 'openai-compatible' },
]

const builtinTools = [
    {
        id: 'http_request',
        name: 'http_request',
        description: '发起 HTTP/HTTPS 请求并返回状态、响应头和响应体。',
        fields: ['url', 'method', 'headers', 'query', 'body']
    },
    {
        id: 'get_system_info',
        name: 'get_system_info',
        description: '获取当前 runner 所在环境的系统信息。',
        fields: []
    },
    {
        id: 'get_time',
        name: 'get_time',
        description: '获取当前时间，可选指定时区。',
        fields: ['timeZone']
    },
]

interface McpServerItem {
    id: string
    transport?: string
    endpoint?: string
    enabledTools?: string[]
    enabled?: boolean
}

interface SkillItem {
    id: string
    name?: string
    description?: string
    version?: string
    promptFragment?: string
    enabledTools?: string[]
    sourceFile?: string
    enabled?: boolean
}

const values = computed({
    get() {
        let enabledTools = '["http_request","get_system_info","get_time"]'
        let mcpServers = '[]'
        let skills = '[]'
        try {
            const candidate = (props.modelValue || {}).enabledTools
            if (typeof candidate === 'string') {
                const parsed = JSON.parse(candidate)
                if (Array.isArray(parsed)) {
                    enabledTools = candidate
                }
            }
        } catch {
            enabledTools = '["http_request","get_system_info","get_time"]'
        }
        try {
            const candidate = (props.modelValue || {}).mcpServers
            if (typeof candidate === 'string') {
                const parsed = JSON.parse(candidate)
                if (Array.isArray(parsed)) {
                    mcpServers = candidate
                }
            }
        } catch {
            mcpServers = '[]'
        }
        try {
            const candidate = (props.modelValue || {}).skills
            if (typeof candidate === 'string') {
                const parsed = JSON.parse(candidate)
                if (Array.isArray(parsed)) {
                    skills = candidate
                }
            }
        } catch {
            skills = '[]'
        }

        return {
            mode: 'single',
            provider: 'openai',
            model: 'gpt-4o-mini',
            prompt: '',
            systemPrompt: '',
            temperature: 0.7,
            maxTokens: 1024,
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            timeout: 30000,
            retries: 0,
            sessionKey: '',
            maxTurns: 8,
            compressionThreshold: 12,
            compressionWindow: 6,
            enabledTools,
            mcpServers,
            skills,
            ...(props.modelValue || {}),
        }
    },
    set(val: Record<string, any>) {
        emit('update:model-value', val)
    }
})

const enabledToolSet = computed(() => {
    try {
        const parsed = JSON.parse(String(values.value.enabledTools || '[]'))
        return new Set(Array.isArray(parsed) ? parsed.map(item => String(item)) : [])
    } catch {
        return new Set<string>()
    }
})

const updateField = (key: string, value: any) => {
    values.value = {
        ...values.value,
        [key]: value,
    }
}

const toggleTool = (toolId: string, checked: boolean) => {
    const next = new Set(enabledToolSet.value)
    if (checked) {
        next.add(toolId)
    } else {
        next.delete(toolId)
    }
    updateField('enabledTools', JSON.stringify([...next]))
}

const mcpServersList = computed<McpServerItem[]>(() => {
    try {
        const parsed = JSON.parse(String(values.value.mcpServers || '[]'))
        return Array.isArray(parsed) ? parsed.map((item, index) => ({
            id: String(item?.id || `mcp-${index + 1}`),
            transport: item?.transport ? String(item.transport) : '',
            endpoint: item?.endpoint ? String(item.endpoint) : '',
            enabledTools: Array.isArray(item?.enabledTools) ? item.enabledTools.map((tool: any) => String(tool)) : [],
            enabled: item?.enabled !== false
        })) : []
    } catch {
        return []
    }
})

const syncMcpServers = (servers: McpServerItem[]) => {
    updateField('mcpServers', JSON.stringify(servers))
}

const addMcpServer = () => {
    const next = [...mcpServersList.value]
    next.unshift({
        id: `mcp-${Date.now().toString(36)}`,
        transport: '',
        endpoint: '',
        enabledTools: [],
        enabled: true
    })
    syncMcpServers(next)
}

const updateMcpServer = (index: number, patch: Partial<McpServerItem>) => {
    const next = [...mcpServersList.value]
    if (!next[index]) return
    next[index] = {
        ...next[index],
        ...patch
    }
    syncMcpServers(next)
}

const removeMcpServer = (index: number) => {
    const next = [...mcpServersList.value]
    next.splice(index, 1)
    syncMcpServers(next)
}

const skillFileInput = ref<HTMLInputElement | null>(null)

const skillsList = computed<SkillItem[]>(() => {
    try {
        const parsed = JSON.parse(String(values.value.skills || '[]'))
        return Array.isArray(parsed) ? parsed.map((item, index) => ({
            id: String(item?.id || `skill-${index + 1}`),
            name: item?.name ? String(item.name) : '',
            description: item?.description ? String(item.description) : '',
            version: item?.version ? String(item.version) : '',
            promptFragment: item?.promptFragment ? String(item.promptFragment) : '',
            enabledTools: Array.isArray(item?.enabledTools) ? item.enabledTools.map((tool: any) => String(tool)) : [],
            sourceFile: item?.sourceFile ? String(item.sourceFile) : '',
            enabled: item?.enabled !== false
        })) : []
    } catch {
        return []
    }
})

const syncSkills = (skills: SkillItem[]) => {
    updateField('skills', JSON.stringify(skills))
}

const updateSkill = (index: number, patch: Partial<SkillItem>) => {
    const next = [...skillsList.value]
    if (!next[index]) return
    next[index] = {
        ...next[index],
        ...patch
    }
    syncSkills(next)
}

const removeSkill = (index: number) => {
    const next = [...skillsList.value]
    next.splice(index, 1)
    syncSkills(next)
}

const openSkillUpload = () => {
    skillFileInput.value?.click()
}

const normalizeSkillId = (name: string) => {
    const normalized = name
        .replace(/\.[^/.]+$/, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return normalized || `skill-${Date.now().toString(36)}`
}

const parseSkillFrontmatter = (text: string) => {
    const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
    if (!match) {
        return {
            meta: {},
            body: text
        }
    }

    const metaLines = match[1].split('\n')
    const meta: Record<string, string> = {}
    for (const rawLine of metaLines) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const separatorIndex = line.indexOf(':')
        if (separatorIndex <= 0) continue
        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim()
        meta[key] = value
    }

    return {
        meta,
        body: match[2].trim()
    }
}

const handleSkillUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    try {
        const text = await file.text()
        const { meta, body } = parseSkillFrontmatter(text)
        let nextSkill: SkillItem

        if (file.name.toLowerCase().endsWith('.json')) {
            const parsed = JSON.parse(text)
            nextSkill = {
                id: String(parsed?.id || normalizeSkillId(file.name)),
                name: parsed?.name ? String(parsed.name) : '',
                description: parsed?.description ? String(parsed.description) : '',
                version: parsed?.version ? String(parsed.version) : '',
                promptFragment: parsed?.promptFragment ? String(parsed.promptFragment) : '',
                enabledTools: Array.isArray(parsed?.enabledTools) ? parsed.enabledTools.map((tool: any) => String(tool)) : [],
                sourceFile: file.name,
                enabled: parsed?.enabled !== false
            }
        } else {
            const resolvedName = meta.name ? String(meta.name) : ''
            nextSkill = {
                id: normalizeSkillId(resolvedName || file.name),
                name: resolvedName,
                description: meta.description ? String(meta.description) : '',
                version: meta.version ? String(meta.version) : '',
                promptFragment: body,
                enabledTools: [],
                sourceFile: file.name,
                enabled: true
            }
        }

        syncSkills([nextSkill, ...skillsList.value])
    } catch (error: any) {
        toast.error(`Skill 文件解析失败: ${error?.message || String(error)}`)
    } finally {
        input.value = ''
    }
}
</script>

<template>
    <div class="llm-settings">
        <div class="llm-layout">
            <div class="llm-form">
                <div class="llm-grid">
                    <div class="field">
                        <label>模式</label>
                        <select :value="values.mode" @change="updateField('mode', ($event.target as HTMLSelectElement).value)">
                            <option v-for="option in modeOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="field">
                        <label>服务商</label>
                        <select :value="values.provider" @change="updateField('provider', ($event.target as HTMLSelectElement).value)">
                            <option v-for="option in providerOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </option>
                        </select>
                    </div>

                    <div class="field">
                        <label>模型</label>
                        <input
                            :value="values.model"
                            type="text"
                            placeholder="例如 gpt-4o-mini"
                            @input="updateField('model', ($event.target as HTMLInputElement).value)">
                    </div>

                    <div class="field full">
                        <label>系统提示词</label>
                        <textarea
                            rows="5"
                            :value="values.systemPrompt"
                            placeholder="可选，用于限定角色、风格和输出规则"
                            @input="updateField('systemPrompt', ($event.target as HTMLTextAreaElement).value)" />
                    </div>

                    <div class="field full">
                        <label>用户提示词</label>
                        <textarea
                            rows="8"
                            :value="values.prompt"
                            placeholder="支持 {input.xxx} / {nodeId.xxx} 模板"
                            @input="updateField('prompt', ($event.target as HTMLTextAreaElement).value)" />
                    </div>

                    <div class="field">
                        <label>温度</label>
                        <input
                            :value="values.temperature"
                            type="number"
                            min="0"
                            max="2"
                            step="0.1"
                            @input="updateField('temperature', Number(($event.target as HTMLInputElement).value))">
                    </div>

                    <div class="field">
                        <label>最大输出 Tokens</label>
                        <input
                            :value="values.maxTokens"
                            type="number"
                            min="1"
                            step="1"
                            @input="updateField('maxTokens', Number(($event.target as HTMLInputElement).value))">
                    </div>

                    <div class="field full">
                        <label>Base URL</label>
                        <input
                            :value="values.baseUrl"
                            type="text"
                            placeholder="默认 https://api.openai.com/v1"
                            @input="updateField('baseUrl', ($event.target as HTMLInputElement).value)">
                    </div>

                    <div class="field full">
                        <label>API Key</label>
                        <input
                            :value="values.apiKey"
                            type="text"
                            placeholder="当前先保存在节点配置中，后续可改为环境变量/密钥管理"
                            @input="updateField('apiKey', ($event.target as HTMLInputElement).value)">
                    </div>

                    <div class="field">
                        <label>超时(ms)</label>
                        <input
                            :value="values.timeout"
                            type="number"
                            min="1000"
                            step="1000"
                            @input="updateField('timeout', Number(($event.target as HTMLInputElement).value))">
                    </div>

                    <div class="field">
                        <label>重试次数</label>
                        <input
                            :value="values.retries"
                            type="number"
                            min="0"
                            step="1"
                            @input="updateField('retries', Number(($event.target as HTMLInputElement).value))">
                    </div>

                    <template v-if="values.mode === 'agent'">
                        <div class="field full">
                            <label>Session Key</label>
                            <input
                                :value="values.sessionKey"
                                type="text"
                                placeholder="Agent 模式必填，支持模板"
                                @input="updateField('sessionKey', ($event.target as HTMLInputElement).value)">
                        </div>

                        <div class="field">
                            <label>最大轮数</label>
                            <input
                                :value="values.maxTurns"
                                type="number"
                                min="1"
                                step="1"
                                @input="updateField('maxTurns', Number(($event.target as HTMLInputElement).value))">
                        </div>

                        <div class="field">
                            <label>压缩阈值</label>
                            <input
                                :value="values.compressionThreshold"
                                type="number"
                                min="2"
                                step="1"
                                @input="updateField('compressionThreshold', Number(($event.target as HTMLInputElement).value))">
                        </div>

                        <div class="field">
                            <label>保留窗口</label>
                            <input
                                :value="values.compressionWindow"
                                type="number"
                                min="1"
                                step="1"
                                @input="updateField('compressionWindow', Number(($event.target as HTMLInputElement).value))">
                        </div>

                    </template>
                </div>
            </div>

            <div class="llm-sidecard">
                <input
                    ref="skillFileInput"
                    type="file"
                    accept=".json,.md,.txt"
                    class="hidden-file-input"
                    @change="handleSkillUpload">
                <BcTab class="llm-side-tabs">
                    <div icon="fa-screwdriver-wrench">
                        <div class="side-panel">
                            <header>内置 Tools</header>
                            <div class="tool-list">
                                <article v-for="tool in builtinTools" :key="tool.id" class="tool-card">
                                    <div class="tool-head">
                                        <div class="tool-title">
                                            <strong>{{ tool.name }}</strong>
                                            <span>builtin</span>
                                        </div>
                                        <label class="ss-switch">
                                            <input
                                                :checked="enabledToolSet.has(tool.id)"
                                                type="checkbox"
                                                @change="toggleTool(tool.id, ($event.target as HTMLInputElement).checked)">
                                            <div>
                                                <div />
                                            </div>
                                        </label>
                                    </div>
                                    <p>{{ tool.description }}</p>
                                    <div class="tool-fields">
                                        <label>参数</label>
                                        <div v-if="tool.fields.length > 0" class="field-tags">
                                            <span v-for="field in tool.fields" :key="field">{{ field }}</span>
                                        </div>
                                        <div v-else class="empty-inline">无参数</div>
                                    </div>
                                </article>
                            </div>
                        </div>
                    </div>
                    <div icon="fa-plug">
                        <div class="side-panel">
                            <header class="section-head">
                                <span>MCP</span>
                                <button class="add-circle-btn" type="button" @click="addMcpServer">+</button>
                            </header>
                            <div v-if="mcpServersList.length > 0" class="tool-list">
                                <article v-for="(server, index) in mcpServersList" :key="server.id" class="tool-card mcp-card">
                                    <div class="tool-head">
                                        <div class="tool-title">
                                            <strong>{{ server.id || '未命名 MCP' }}</strong>
                                        </div>
                                        <div class="card-actions">
                                            <label class="ss-switch">
                                                <input
                                                    :checked="server.enabled !== false"
                                                    type="checkbox"
                                                    @change="updateMcpServer(index, { enabled: ($event.target as HTMLInputElement).checked })">
                                                <div>
                                                    <div />
                                                </div>
                                            </label>
                                            <button class="circle-ghost-btn" type="button" @click="removeMcpServer(index)">×</button>
                                        </div>
                                    </div>
                                    <div class="field">
                                        <label>ID</label>
                                        <input
                                            :value="server.id"
                                            type="text"
                                            placeholder="例如 docs"
                                            @input="updateMcpServer(index, { id: ($event.target as HTMLInputElement).value })">
                                    </div>
                                    <div class="field">
                                        <label>Transport</label>
                                        <input
                                            :value="server.transport"
                                            type="text"
                                            placeholder="例如 http / sse / stdio"
                                            @input="updateMcpServer(index, { transport: ($event.target as HTMLInputElement).value })">
                                    </div>
                                    <div class="field">
                                        <label>Endpoint</label>
                                        <input
                                            :value="server.endpoint"
                                            type="text"
                                            placeholder="例如 https://example.com/mcp"
                                            @input="updateMcpServer(index, { endpoint: ($event.target as HTMLInputElement).value })">
                                    </div>
                                </article>
                            </div>
                            <div v-else class="empty-panel">还没有 MCP server。点击右上角 `+` 新增。</div>
                        </div>
                    </div>
                    <div icon="fa-wand-magic-sparkles">
                        <div class="side-panel">
                            <header class="section-head">
                                <span>Skills</span>
                                <button class="add-circle-btn" type="button" @click="openSkillUpload">+</button>
                            </header>
                            <div v-if="skillsList.length > 0" class="tool-list">
                                <article v-for="(skill, index) in skillsList" :key="`${skill.id}-${index}`" class="tool-card mcp-card">
                                    <div class="tool-head">
                                        <div class="tool-title">
                                            <strong>{{ skill.name || skill.id }}</strong>
                                            <span>{{ skill.sourceFile || 'uploaded' }}</span>
                                        </div>
                                        <div class="card-actions">
                                            <label class="ss-switch">
                                                <input
                                                    :checked="skill.enabled !== false"
                                                    type="checkbox"
                                                    @change="updateSkill(index, { enabled: ($event.target as HTMLInputElement).checked })">
                                                <div>
                                                    <div />
                                                </div>
                                            </label>
                                            <button class="circle-ghost-btn" type="button" @click="removeSkill(index)">×</button>
                                        </div>
                                    </div>
                                    <div class="field">
                                        <label>ID</label>
                                        <input
                                            :value="skill.id"
                                            type="text"
                                            placeholder="例如 summarizer"
                                            @input="updateSkill(index, { id: ($event.target as HTMLInputElement).value })">
                                    </div>
                                    <div class="field">
                                        <label>Name</label>
                                        <input
                                            :value="skill.name"
                                            type="text"
                                            placeholder="例如 Workflow Sync"
                                            @input="updateSkill(index, { name: ($event.target as HTMLInputElement).value })">
                                    </div>
                                    <div class="field">
                                        <label>Description</label>
                                        <textarea
                                            rows="3"
                                            :value="skill.description"
                                            placeholder="技能描述"
                                            @input="updateSkill(index, { description: ($event.target as HTMLTextAreaElement).value })" />
                                    </div>
                                    <div class="field">
                                        <label>Version</label>
                                        <input
                                            :value="skill.version"
                                            type="text"
                                            placeholder="例如 1.0.0"
                                            @input="updateSkill(index, { version: ($event.target as HTMLInputElement).value })">
                                    </div>
                                    <div class="field">
                                        <label>Prompt Fragment</label>
                                        <textarea
                                            rows="5"
                                            :value="skill.promptFragment"
                                            placeholder="上传后可继续编辑 prompt 片段"
                                            @input="updateSkill(index, { promptFragment: ($event.target as HTMLTextAreaElement).value })" />
                                    </div>
                                </article>
                            </div>
                            <div v-else class="empty-panel">还没有 skills。点击右上角 `+` 上传 skill 文件。</div>
                        </div>
                    </div>
                </BcTab>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ss-switch {
    --switch-dot-margin: 6px;
    --switch-height: 20px;
    min-width: 35px;
}
.ss-switch > div {
    background: var(--color-card-2);
}

.llm-settings {
    height: 52vh;
    padding: 8px 6px 8px 2px;
}

.llm-layout {
    height: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
    gap: 14px;
    align-items: stretch;
}

.llm-form,
.llm-sidecard {
    min-height: 0;
    min-width: 0;
}

.llm-form {
    overflow-y: auto;
    padding-right: 10px;
    min-width: 0;
}

.llm-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.llm-side-tabs {
    height: 100%;
    --bc-tab-margin: 0;
    min-width: 0;
}

.hidden-file-input {
    display: none;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.field.full {
    grid-column: 1 / -1;
}

.field > label {
    color: var(--color-font-1);
    font-size: 0.8rem;
}

.field > input,
.field > select,
.field > textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--color-card-1);
    color: var(--color-font);
    border: 1px solid var(--color-card-2);
    border-radius: 8px;
    outline: none;
    padding: 10px 12px;
    resize: vertical;
}

.field > select {
    height: 35px;
}

.side-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 4px 0;
    min-width: 0;
}

.side-panel > header {
    color: var(--color-font);
    font-size: 0.95rem;
    font-weight: 600;
}

.section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.add-circle-btn {
    width: 25px;
    height: 25px;
    border: 0;
    border-radius: 999px;
    background: var(--color-main);
    color: white;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
    margin-right: 5px;
}

.ghost-btn {
    border: 0;
    border-radius: 8px;
    background: rgba(var(--color-main-rgb), 0.12);
    color: var(--color-font);
    padding: 6px 10px;
    font-size: 0.75rem;
    cursor: pointer;
}

.tool-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding-right: 4px;
    min-width: 0;
}

.tool-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--color-card-2);
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-card-1) 88%, transparent);
    width: 30vw;
    min-width: 0;
    box-sizing: border-box;
}

.mcp-card .field > input {
    background: rgba(var(--color-card-2-rgb), 0.35);
}

.tool-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.tool-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.tool-title > strong {
    color: var(--color-font);
    font-size: 0.9rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tool-title > span {
    color: var(--color-font-2);
    font-size: 0.72rem;
    flex-shrink: 0;
}

.card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
}
.card-actions > button {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 999px;
    background: var(--color-card-2);
    color: var(--color-font);
    font-size: 0.9rem;
    line-height: 1;
    cursor: pointer;
}

.tool-card > p,
.empty-inline,
.empty-panel {
    margin: 0;
    color: var(--color-font-2);
    font-size: 0.78rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.tool-fields {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.tool-fields > label {
    color: var(--color-font-1);
    font-size: 0.74rem;
}

.field-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.field-tags > span {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(var(--color-main-rgb), 0.12);
    color: var(--color-font);
    font-size: 0.72rem;
}

.empty-panel {
    padding: 14px 12px;
    border: 1px dashed var(--color-card-2);
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-card-1) 82%, transparent);
    width: calc(30vw + 5px);
    box-sizing: border-box;
}

@media (max-width: 960px) {
    .llm-layout {
        grid-template-columns: 1fr;
    }

    .llm-sidecard {
        min-height: 240px;
    }
}
</style>

<style>
.llm-sidecard .tab-body {
    height: calc(100% - 20px);
    overflow: scroll;
}
</style>
