<script setup lang="ts">
import { computed } from 'vue'

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

const values = computed({
    get() {
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
            ...(props.modelValue || {}),
        }
    },
    set(val: Record<string, any>) {
        emit('update:model-value', val)
    }
})

const updateField = (key: string, value: any) => {
    values.value = {
        ...values.value,
        [key]: value,
    }
}
</script>

<template>
    <div class="llm-settings">
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
        </div>
    </div>
</template>

<style scoped>
.llm-settings {
    height: 52vh;
    overflow-y: auto;
    padding: 8px 6px 8px 2px;
}

.llm-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
</style>
