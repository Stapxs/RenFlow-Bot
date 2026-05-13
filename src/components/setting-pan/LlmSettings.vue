<script setup lang="ts">
import { computed } from 'vue'
import BcTab from 'vue3-bcui/packages/bc-tab'

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

const defaultAgentSystemPrompt = [
    '你是 RenFlow 的工作流助手。',
    '你的职责是理解用户目标，必要时调用工具完成查询、分析和节点执行，并基于工具结果给出最终答复。',
    '规则：',
    '1. 如果任务需要调用节点功能，先优先使用 list_available_nodes 确认可用节点、参数结构和输出结构，再决定是否执行。',
    '2. 使用 execute_node 时，必须明确提供 nodeType；params 必须符合节点参数结构；input 作为该节点的一次性输入。',
    '3. execute_node 只会单次执行目标节点，不代表运行整个工作流，不会自动触发后续节点。不要把它当作工作流调度器。',
    '4. 不要臆造不存在的节点、参数或输出字段；不确定时先调用 list_available_nodes。',
    '5. 能直接回答时直接回答；只有在确实需要外部信息或节点能力时才调用工具。',
    '6. 回答时优先引用真实工具结果；如果工具失败，要明确说明失败原因，不要假装成功。',
    '7. 若用户要求执行节点，默认只执行最小必要次数，避免重复调用。'
].join('\n')

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
    {
        id: 'open_url_in_browser',
        name: 'open_url_in_browser',
        description: '在 Tauri 桌面环境中用系统浏览器打开链接；非 Tauri 环境下仅返回未执行状态。',
        fields: ['url']
    },
    {
        id: 'list_available_nodes',
        name: 'list_available_nodes',
        description: '列出当前 runner 可执行的节点类型、参数结构和输出结构。',
        fields: []
    },
    {
        id: 'execute_node',
        name: 'execute_node',
        description: '按节点类型执行一次节点功能，传入 input 和 params。',
        fields: ['nodeType', 'input', 'params']
    },
]

interface McpServerItem {
    serverLabel: string
    serverUrl: string
    allowedTools?: string[]
    requireApproval?: 'always' | 'never'
    headers?: Record<string, string>
    enabled?: boolean
}

const values = computed({
    get() {
        let enabledTools = '["http_request","get_system_info","get_time","open_url_in_browser","list_available_nodes","execute_node"]'
        let mcpServers = '[]'
        try {
            const candidate = (props.modelValue || {}).enabledTools
            if (typeof candidate === 'string') {
                const parsed = JSON.parse(candidate)
                if (Array.isArray(parsed)) {
                    enabledTools = candidate
                }
            }
        } catch {
            enabledTools = '["http_request","get_system_info","get_time","open_url_in_browser","list_available_nodes","execute_node"]'
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

        return {
            mode: 'single',
            provider: 'openai',
            model: 'gpt-4o-mini',
            prompt: '',
            systemPrompt: defaultAgentSystemPrompt,
            temperature: 0.7,
            maxTokens: 1024,
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            timeout: 30000,
            retries: 0,
            sessionKey: '',
            maxTurns: 8,
            enabledTools,
            mcpServers,
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

const parseStringArray = (raw: string): string[] => {
    try {
        const parsed = JSON.parse(raw || '[]')
        return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
    } catch {
        return []
    }
}

const parseStringRecord = (raw: string): Record<string, string> => {
    try {
        const parsed = JSON.parse(raw || '{}')
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {}
        }
        return Object.fromEntries(
            Object.entries(parsed)
                .filter(([key, value]) => String(key).trim() && value !== undefined && value !== null)
                .map(([key, value]) => [String(key), String(value)])
        )
    } catch {
        return {}
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
            serverLabel: String(item?.serverLabel || `mcp-${index + 1}`),
            serverUrl: item?.serverUrl ? String(item.serverUrl) : '',
            allowedTools: Array.isArray(item?.allowedTools) ? item.allowedTools.map((tool: any) => String(tool)) : [],
            requireApproval: item?.requireApproval === 'never' ? 'never' : 'always',
            headers: item?.headers && typeof item.headers === 'object' ? item.headers : {},
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
        serverLabel: `mcp-${Date.now().toString(36)}`,
        serverUrl: '',
        allowedTools: [],
        requireApproval: 'always',
        headers: {},
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
                    </template>
                </div>
            </div>

            <div class="llm-sidecard">
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
                                <article v-for="(server, index) in mcpServersList" :key="server.serverLabel" class="tool-card mcp-card">
                                    <div class="tool-head">
                                        <div class="tool-title">
                                            <strong>{{ server.serverLabel || '未命名 MCP' }}</strong>
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
                                        <label>Server Label</label>
                                        <input
                                            :value="server.serverLabel"
                                            type="text"
                                            placeholder="例如 docs"
                                            @input="updateMcpServer(index, { serverLabel: ($event.target as HTMLInputElement).value })">
                                    </div>
                                    <div class="field">
                                        <label>Server URL</label>
                                        <input
                                            :value="server.serverUrl"
                                            type="text"
                                            placeholder="例如 https://example.com/mcp"
                                            @input="updateMcpServer(index, { serverUrl: ($event.target as HTMLInputElement).value })">
                                    </div>
                                    <div class="field">
                                        <label>Allowed Tools(JSON)</label>
                                        <textarea
                                            rows="3"
                                            :value="JSON.stringify(server.allowedTools || [])"
                                            placeholder='例如 ["search","fetch"]'
                                            @input="updateMcpServer(index, { allowedTools: parseStringArray(($event.target as HTMLTextAreaElement).value) })" />
                                    </div>
                                    <div class="field">
                                        <label>Require Approval</label>
                                        <select
                                            :value="server.requireApproval || 'always'"
                                            @change="updateMcpServer(index, { requireApproval: ($event.target as HTMLSelectElement).value as 'always' | 'never' })">
                                            <option value="always">always</option>
                                            <option value="never">never</option>
                                        </select>
                                    </div>
                                    <div class="field">
                                        <label>Headers(JSON)</label>
                                        <textarea
                                            rows="3"
                                            :value="JSON.stringify(server.headers || {}, null, 2)"
                                            placeholder='例如 {"Authorization":"Bearer token"}'
                                            @input="updateMcpServer(index, { headers: parseStringRecord(($event.target as HTMLTextAreaElement).value) })" />
                                    </div>
                                </article>
                            </div>
                            <div v-else class="empty-panel">还没有 MCP server。点击右上角 `+` 新增。</div>
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
