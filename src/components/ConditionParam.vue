<script setup lang="ts">
import Codemirror from 'codemirror-editor-vue3'
import { ref, computed, watch } from 'vue'
import type { Editor, EditorConfiguration } from 'codemirror'
import '@app/assets/css/codemirror-bcui.css'
import 'codemirror/mode/javascript/javascript.js'

interface Props {
    modelValue: {
        parameter: string
        mode: string
        value: string
        customCode?: string
    }
    availableParameters?: Array<{ label: string; value: string }>
}

const props = defineProps<Props>()
const emit = defineEmits<{
    'update:modelValue': [value: any]
}>()

// 本地值
const localValue = ref({ ...props.modelValue })

// 监听外部变化
watch(() => props.modelValue, (newVal) => {
    localValue.value = { ...newVal }
}, { deep: true })

// 可用的比较模式
const comparisonModes = [
    { label: '存在', value: 'exists' },
    { label: '不存在', value: 'not_exists' },
    { label: '等于', value: 'equals' },
    { label: '不等于', value: 'not_equals' },
    { label: '严格等于 (===)', value: 'strict_equals' },
    { label: '严格不等于 (!==)', value: 'strict_not_equals' },
    { label: '大于', value: 'greater_than' },
    { label: '小于', value: 'less_than' },
    { label: '大于等于', value: 'greater_or_equal' },
    { label: '小于等于', value: 'less_or_equal' },
    { label: '包含', value: 'contains' },
    { label: '不包含', value: 'not_contains' },
    { label: '正则匹配', value: 'regex' }
]

// 是否需要显示值输入框
const needsValueInput = computed(() => {
    return !['exists', 'not_exists'].includes(localValue.value.mode)
})

// 是否为自定义模式
const isCustomMode = computed(() => {
    return localValue.value.parameter === 'custom'
})

const defaultCustomCode = '// 返回 true 或 false\n// 可用变量: input, context\n\nreturn input !== null'
const cmOptions: EditorConfiguration = {
    mode: 'javascript',
    indentUnit: 4,
    smartIndent: true,
    lineNumbers: true,
}

// 更新参数
const updateParameter = (value: string) => {
    localValue.value.parameter = value
    emitUpdate()
}

// 更新模式
const updateMode = (value: string) => {
    localValue.value.mode = value
    emitUpdate()
}

// 更新值
const updateValue = (value: string) => {
    localValue.value.value = value
    emitUpdate()
}

// 更新自定义代码
const updateCustomCode = (value: string) => {
    localValue.value.customCode = value
    emitUpdate()
}

const onEditorReady = (cm: Editor) => {
    cm.setOption('theme', 'bcui')
}

// 发送更新事件
const emitUpdate = () => {
    emit('update:modelValue', { ...localValue.value })
}
</script>

<template>
    <div class="condition-param">
        <!-- 自定义模式 -->
        <div v-if="isCustomMode" class="custom-mode">
            <div class="custom-header">
                <label>自定义 JavaScript 条件</label>
                <button class="back-btn" title="返回标准模式" @click="updateParameter('input')">
                    <font-awesome-icon :icon="['fas', 'arrow-left']" />
                    标准模式
                </button>
            </div>

            <div v-if="availableParameters && availableParameters.length > 0" class="available-params">
                <span class="params-label">可用参数：</span>
                <div class="params-tags">
                    <span v-for="param in availableParameters"
                        :key="param.value"
                        class="param-tag">
                        {{ param.label }} ({{ param.value }})
                    </span>
                </div>
            </div>

            <div class="custom-code">
                <Codemirror
                    :value="localValue.customCode || defaultCustomCode"
                    :options="cmOptions"
                    height="180px"
                    @change="updateCustomCode"
                    @ready="onEditorReady" />
            </div>
        </div>

        <!-- 标准模式 -->
        <div v-else class="standard-mode">
            <div class="condition-row">
                <label>参数</label>
                <select :value="localValue.parameter" @change="updateParameter(($event.target as HTMLSelectElement).value)">
                    <option v-for="param in availableParameters" :key="param.value" :value="param.value">
                        {{ param.label }}
                    </option>
                    <option value="custom">自定义...</option>
                </select>
            </div>

            <div class="condition-row">
                <label>模式</label>
                <select :value="localValue.mode" @change="updateMode(($event.target as HTMLSelectElement).value)">
                    <option v-for="mode in comparisonModes" :key="mode.value" :value="mode.value">
                        {{ mode.label }}
                    </option>
                </select>
            </div>

            <div v-if="needsValueInput" class="condition-row">
                <label>条件值</label>
                <input type="text"
                    placeholder="请输入比较值"
                    :value="localValue.value"
                    @input="updateValue(($event.target as HTMLInputElement).value)">
            </div>
        </div>
    </div>
</template>

<style scoped>
.condition-param {
    width: 100%;
}

.standard-mode {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.condition-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.condition-row label {
    font-size: 0.75rem;
    color: var(--color-font);
    font-weight: 500;
}

.condition-row select,
.condition-row input {
    height: 25px;
    background: rgba(var(--color-card-2-rgb), 0.5);
    border: 1px solid rgba(var(--color-font-rgb), 0.1);
    border-radius: 5px;
    padding: 6px 8px;
    font-size: 0.75rem;
    color: var(--color-font);
    outline: none;
    transition: border-color 0.2s, background 0.2s;
}

.condition-row select:focus,
.condition-row input:focus {
    border-color: var(--color-main);
    background: rgba(var(--color-card-2-rgb), 0.8);
}

.condition-row select {
    height: 35px;
    cursor: pointer;
}

/* 自定义模式 */
.custom-mode {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.custom-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.custom-header label {
    font-size: 0.75rem;
    color: var(--color-font);
    font-weight: 500;
    flex: 1;
}

.back-btn {
    background: rgba(var(--color-main-rgb), 0.1);
    border: 1px solid rgba(var(--color-main-rgb), 0.3);
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 0.7rem;
    color: var(--color-font);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background 0.2s, border-color 0.2s;
}

.back-btn:hover {
    background: rgba(var(--color-main-rgb), 0.2);
    border-color: rgba(var(--color-main-rgb), 0.5);
}

.back-btn svg {
    width: 10px;
    height: 10px;
}

.available-params {
    background: rgba(var(--color-card-2-rgb), 0.3);
    border-radius: 5px;
    padding: 8px;
    font-size: 0.7rem;
}

.params-label {
    color: var(--color-font-1);
    display: block;
    margin-bottom: 5px;
}

.params-tags {
    max-width: 45vw;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.param-tag {
    background: var(--color-main);
    color: var(--color-font-r);
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 0.65rem;
    cursor: pointer;
    transition: opacity 0.2s;
}

.param-tag:hover {
    opacity: 0.8;
}

.custom-code {
    background: rgba(var(--color-card-2-rgb), 0.5);
    border: 1px solid rgba(var(--color-font-rgb), 0.1);
    border-radius: 5px;
    overflow: hidden;
    min-height: 180px;
    transition: border-color 0.2s, background 0.2s;
}

.custom-code:focus-within {
    border-color: var(--color-main);
    background: rgba(var(--color-card-2-rgb), 0.8);
}
</style>
