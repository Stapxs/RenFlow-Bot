<script setup lang="ts">
import { Position, Handle, useVueFlow } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ref, computed, watch } from 'vue'
import { useNodeParams, useSafeDelete } from './nodes/useNodeHelpers'
import NodeSettingsPanel from './NodeSettingsPanel.vue'
import ConditionParam from './ConditionParam.vue'

const props = defineProps<NodeProps>()
const isDev = import.meta.env.DEV

const { getIncomers, findNode } = useVueFlow()

// 使用通用参数管理组合函数
const { paramValues, params, updateParam, updateSettings } = useNodeParams(props as any)

// 设置面板显示状态
const showSettingsPanel = ref(false)
const openSettings = () => { showSettingsPanel.value = true }
const closeSettings = () => { showSettingsPanel.value = false }

// 额外计算属性（基于 params）
const availableParameters = computed(() => {
    const parameters: Array<{ label: string; value: string }> = []
    const currentNode = findNode(props.id)
    if (!currentNode) return parameters
    const incomers = getIncomers(currentNode)
    for (const incomer of incomers) {
        const metadata = incomer.data?.metadata
        if (metadata?.outputSchema) {
            for (const field of metadata.outputSchema) {
                parameters.push({
                    label: `${incomer.data?.label || incomer.id}.${field.label}`,
                    value: `input.${field.key}`
                })
            }
        }
    }
    return parameters
})

const settingsParam = computed(() => params.value.find((p: any) => p.type === 'settings'))
const titleParam = computed(() => params.value.find((p: any) => p.key === 'title' && p.type === 'input'))
const settingsRequired = computed(() => !!settingsParam.value && settingsParam.value.required === true)
const nonSettingsCount = computed(() => params.value.filter((p: any) => p.type !== 'settings').length)
const isParamVisible = (param: any) => {
    const cond = param?.visibleWhen
    if (!cond) return true
    const cur = paramValues.value[cond.key]
    if (Array.isArray(cond.value)) return cond.value.includes(cur)
    if (cond.value === undefined) return Boolean(cur)
    return cur === cond.value
}
const shouldShowSettings = computed(() => {
    return !!settingsParam.value || nonSettingsCount.value > 5
})
const hideParams = computed(() => {
    return settingsRequired.value || nonSettingsCount.value > 5
})
const displayParams = computed(() => {
    const nonSettings = params.value.filter((p: any) => p.type !== 'settings' && isParamVisible(p))
    if (hideParams.value) {
        return nonSettings.filter((p: any) => Boolean((p as any).pin))
    }
    return nonSettings
})
const settingsParams = computed(() => params.value.filter((p: any) => p.type !== 'settings' && !(p as any).pin && isParamVisible(p)))
const allowEditableTitle = computed(() => {
    const nodeType = props.data?.nodeType || props.data?.metadata?.id
    return nodeType !== 'loop-start' && nodeType !== 'loop-break'
})
const editableTitle = computed({
    get: () => {
        const fallback = titleParam.value?.defaultValue || props.data?.label || ''
        return paramValues.value.title || fallback
    },
    set: (value: string) => updateParam('title', value)
})

// 当外部通过 updateNode 修改 data.params 时，需要同步本地的 paramValues，
// 否则 UI（input/select 等）不会反映更新（例如 undo/redo 回放）。
watch(() => props.data?.params, (newParams) => {
    if (!newParams) {
        paramValues.value = {}
        return
    }
    // 深拷贝以断开引用，并保持响应性
    const copied = JSON.parse(JSON.stringify(newParams))
    // 补充 defaultValue：如果 copied 中某个 key 不存在值，且 metadata.params 中定义了 defaultValue，则使用它
    if (props.data?.metadata?.params) {
        for (const paramDef of props.data.metadata.params) {
            if (paramDef.defaultValue !== undefined && copied[paramDef.key] === undefined) {
                copied[paramDef.key] = paramDef.defaultValue
            }
        }
    }
    paramValues.value = copied
}, { deep: true, immediate: true })

// 使用通用删除逻辑
const { deleteNode } = useSafeDelete(props as any)

defineEmits(['updateNodeInternals'])
</script>

<template>
    <Handle v-if="data.type != 'start'" type="target" :position="Position.Left" />

    <div class="vue-flow__node-base ss-card">
        <header v-if="data.metadata">
            <div class="node-title">
                <font-awesome-icon :icon="['fas', data.metadata.icon || 'fa-cube']" />
                <input v-if="titleParam && allowEditableTitle"
                    v-model="editableTitle"
                    type="text"
                    class="node-label-input"
                    :placeholder="titleParam.placeholder || data.label"
                    @mousedown.stop
                    @pointerdown.stop>
                <span v-else class="node-label">{{ editableTitle }}</span>
            </div>
            <button v-if="shouldShowSettings" class="title-btn" title="节点设置"
                @click.stop="openSettings">
                <font-awesome-icon :icon="['fas', 'cog']" />
            </button>
            <button class="title-btn" title="删除节点" @click.stop="deleteNode">
                <font-awesome-icon :icon="['fas', 'times']" />
            </button>
        </header>
        <div v-else>{{ data.label }}</div>

        <!-- 参数列表 -->
        <div v-if="displayParams.length > 0" class="node-params">
            <div v-for="param in displayParams" :key="param.key" class="param-item">
                <label v-if="param.type != 'switch'" :class="{ required: param.required }">
                    {{ param.label }}
                </label>

                <!-- input 类型 -->
                <input v-if="param.type === 'input'"
                    type="text"
                    :placeholder="param.placeholder"
                    :value="paramValues[param.key]"
                    @input="updateParam(param.key, ($event.target as HTMLInputElement).value)"
                    @mousedown.stop
                    @pointerdown.stop>

                <!-- number 类型 -->
                <input v-else-if="param.type === 'number'"
                    type="number"
                    :placeholder="param.placeholder"
                    :value="paramValues[param.key]"
                    @input="updateParam(param.key, Number(($event.target as HTMLInputElement).value))"
                    @mousedown.stop
                    @pointerdown.stop>

                <!-- textarea 类型 -->
                <textarea v-else-if="param.type === 'textarea'"
                    rows="3"
                    :placeholder="param.placeholder"
                    :value="paramValues[param.key]"
                    @input="updateParam(param.key, ($event.target as HTMLTextAreaElement).value)"
                    @mousedown.stop
                    @pointerdown.stop />

                <!-- select 类型 -->
                <select v-else-if="param.type === 'select'"
                    :value="paramValues[param.key]"
                    @change="updateParam(param.key, ($event.target as HTMLSelectElement).value)"
                    @mousedown.stop
                    @pointerdown.stop>
                    <option v-for="option in param.options" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>

                <!-- switch 类型 -->
                <div v-else-if="param.type === 'switch'" class="switch-container">
                    <label :class="{ required: param.required }">
                        {{ param.label }}
                    </label>
                    <label class="ss-switch" @mousedown.stop @pointerdown.stop>
                        <input v-model="paramValues[param.key]"
                            type="checkbox"
                            @change="updateParam(param.key, ($event.target as HTMLInputElement).checked)">
                        <div>
                            <div />
                        </div>
                    </label>
                </div>

                <!-- condition 类型 -->
                <div v-else-if="param.type === 'condition'" class="condition-container">
                    <ConditionParam
                        :model-value="paramValues[param.key] || { parameter: 'input', mode: 'exists', value: '' }"
                        :available-parameters="availableParameters"
                        @update:model-value="updateParam(param.key, $event)"
                        @mousedown.stop
                        @pointerdown.stop />
                </div>
            </div>
        </div>

        <div v-if="isDev" class="node-tip">
            <span>{{ props.id }}</span>
        </div>
    </div>

    <Handle v-if="data.type != 'end'" type="source" :position="Position.Right" />

    <!-- 设置面板弹窗 -->
    <NodeSettingsPanel
        v-model="paramValues"
        :pan-show="showSettingsPanel"
        :node-id="props.id"
        :params="settingsParams"
        :node-name="data.label"
        :template-name="data.metadata?.settingsComponent"
        :description="props.data?.metadata?.fullDescription"
        @update:model-value="updateSettings"
        @close="closeSettings" />
</template>

<style scoped>
.vue-flow__node-base {
    box-shadow: 0 0 5px var(--color-shader);
    min-height: unset;
    min-width: 200px;
    font-size: 0.8rem;
    padding: 15px 20px;
}

.vue-flow__node.selectable:focus .vue-flow__node-base {
    box-shadow: 0 0 5px var(--color-main);
}

.vue-flow__node-base header {
    background: var(--color-main);
    color: var(--color-font-r);
    margin: -8px -13px;
    border-radius: 7px;
    padding: 3px 5px 3px 10px;
    letter-spacing: 0;
    font-weight: bold;
    font-size: 0.8rem;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.vue-flow__node-base header .node-title {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.vue-flow__node-base header .node-title svg {
    flex-shrink: 0;
}

.vue-flow__node-base header .node-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
}

.vue-flow__node-base header .node-label-input {
    background: transparent;
    border: none;
    outline: none;
    color: inherit;
    font-weight: bold;
    font-size: 0.8rem;
    padding: 2px 4px;
    border-radius: 4px;
    transition: background 0.2s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
}

.vue-flow__node-base header .node-label-input:focus {
    background: rgba(255, 255, 255, 0.2);
}

.vue-flow__node-base header .node-label-input::placeholder {
    color: inherit;
    opacity: 0.7;
}

.vue-flow__node-base header svg {
    width: 12px;
    height: 12px;
}

/* 按钮 */
.title-btn {
    transition: background 0.2s, transform 0.1s;
    background: rgba(255, 255, 255, 0.15);
    color: var(--color-font-r);
    justify-content: center;
    align-items: center;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    display: flex;
    opacity: 0.7;
    border: none;
    flex-shrink: 0;
}

.title-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.05);
    opacity: 1;
}

.title-btn:active {
    transform: scale(0.95);
}

.title-btn svg {
    height: 10px;
    width: 10px;
}

/* 参数区域 */
.node-params {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 5px;
}

.node-tip {
    transform: translateY(50%);
    justify-content: center;
    position: absolute;
    font-size: 0.6rem;
    display: flex;
    width: 100%;
    bottom: 0;
    left: 0;
}
.node-tip span {
    background: var(--color-main);
    color: var(--color-font-r);
    border-radius: 99px;
    padding: 4px 7px;
}
</style>
