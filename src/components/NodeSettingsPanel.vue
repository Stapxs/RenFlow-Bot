<script setup lang="ts">
import type { NodeParam } from 'renflow-runner'
import { ref, computed, markRaw, defineAsyncComponent, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import ConditionParam from './ConditionParam.vue'
import SettingsLoading from './setting-pan/SettingsLoading.vue'

interface Props {
    panShow: boolean
    nodeId: string
    params: NodeParam[]
    modelValue: Record<string, any>
    nodeName?: string
    templateName?: string
    description?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
    'update:modelValue': [value: Record<string, any>]
    'close': []
}>()

const { getIncomers, findNode } = useVueFlow()

// 本地参数值
const localValues = ref<Record<string, any>>({ ...props.modelValue })

const syncLocalValues = () => {
    const nextValues = JSON.parse(JSON.stringify(props.modelValue || {}))
    for (const param of props.params || []) {
        if (param.defaultValue !== undefined && nextValues[param.key] === undefined) {
            nextValues[param.key] = param.defaultValue
        }
    }
    localValues.value = nextValues
}

// tip 显示状态（支持点击切换）
const visibleTips = ref<Record<string, boolean>>({})
const toggleTip = (key: string) => {
    visibleTips.value[key] = !visibleTips.value[key]
}

let template = null as any
if(props.templateName) {
    template = markRaw(
        defineAsyncComponent({
            loader: () => import(`./setting-pan/${props.templateName}.vue`),
            loadingComponent: SettingsLoading,
            delay: 100
        }),
    )
}

// 判断参数是否可见（支持 param.visibleWhen ）
const paramVisible = (param: any) => {
    const cond = param?.visibleWhen
    if (!cond) return true
    const key = cond.key
    const value = cond.value
    const cur = localValues.value[key]
    if (value === undefined) return Boolean(cur)
    if (Array.isArray(value)) return value.includes(cur)
    return cur === value
}

// 计算可见的参数列表以避免在模板中混用 v-for 与 v-if
const visibleParams = computed(() => (props.params || []).filter((p: any) => paramVisible(p)))

// helper for tip handling (avoid template type errors)
const paramTip = (param: any) => Boolean(param && param.tip)
const paramGetTip = (param: any) => (param && param.tip) || ''

// 获取可用参数（来自上游节点的输出）
const availableParameters = computed(() => {
    const parameters: Array<{ label: string; value: string }> = []

    // 获取当前节点
    const currentNode = findNode(props.nodeId)
    if (!currentNode) return parameters

    // 获取所有上游节点
    const incomers = getIncomers(currentNode)

    for (const incomer of incomers) {
        const metadata = incomer.data?.metadata
        if (metadata?.outputSchema) {
            // 添加上游节点的输出字段
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

watch(
    () => [props.modelValue, props.params, props.panShow],
    () => {
        syncLocalValues()
    },
    { deep: true, immediate: true }
)

// 更新参数值
const updateParam = (key: string, value: any) => {
    localValues.value[key] = value
}

// 保存设置
const saveSettings = () => {
    emit('update:modelValue', { ...localValues.value })
    emit('close')
}

// 取消设置
const cancelSettings = () => {
    emit('close')
}
</script>

<template>
    <Teleport to="body">
        <Transition name="panel">
            <div v-if="panShow" class="node-settings-overlay" @click.self="cancelSettings">
                <div class="node-settings-panel ss-card">
                    <div class="settings-header">
                        <h3>节点设置<span v-if="nodeName">：{{ nodeName }}</span></h3>
                        <button title="关闭" class="close-btn" @click="cancelSettings">
                            <font-awesome-icon :icon="['fas', 'times']" />
                        </button>
                    </div>

                    <div v-if="description" class="settings-desc" v-html="description" />

                    <div v-if="!template" class="settings-body">
                        <div v-for="(param, index) in visibleParams" :key="param.key" class="param-item">
                            <div v-if="param.type != 'switch'" class="param-label">
                                <label :class="{ required: param.required }">{{ param.label }}</label>
                                <button v-if="paramTip(param)" class="info-btn" aria-label="info"
                                    @click.stop.prevent="toggleTip(param.key)">
                                    <font-awesome-icon :icon="['fas', 'info-circle']" />
                                </button>
                                <div v-if="paramTip(param)" class="tip-popup" :class="{ visible: visibleTips[param.key], first: index === 0 }">
                                    {{ paramGetTip(param) }}
                                </div>
                            </div>

                            <!-- input 类型 -->
                            <input v-if="param.type === 'input'" type="text" :placeholder="param.placeholder"
                                :value="localValues[param.key]"
                                @input="updateParam(param.key, ($event.target as HTMLInputElement).value)">

                            <!-- number 类型 -->
                            <input v-else-if="param.type === 'number'" type="number" :placeholder="param.placeholder"
                                :value="localValues[param.key]"
                                @input="updateParam(param.key, Number(($event.target as HTMLInputElement).value))">

                            <!-- textarea 类型 -->
                            <textarea v-else-if="param.type === 'textarea'" rows="4" :placeholder="param.placeholder"
                                :value="localValues[param.key]"
                                @input="updateParam(param.key, ($event.target as HTMLTextAreaElement).value)" />

                            <!-- select 类型 -->
                            <select v-else-if="param.type === 'select'" :value="localValues[param.key]"
                                @change="updateParam(param.key, ($event.target as HTMLSelectElement).value)">
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
                                    <input v-model="localValues[param.key]"
                                        type="checkbox"
                                        @change="updateParam(param.key, ($event.target as HTMLInputElement).checked)">
                                    <div>
                                        <div />
                                    </div>
                                </label>
                            </div>

                            <!-- condition 类型 -->
                            <ConditionParam v-else-if="param.type === 'condition'"
                                :model-value="localValues[param.key] || { parameter: 'input', mode: 'exists', value: '' }"
                                :available-parameters="availableParameters"
                                @update:model-value="updateParam(param.key, $event)" />
                        </div>
                    </div>
                    <div v-else class="settings-body">
                        <component :is="template"
                            :node-id="nodeId"
                            :params="props.params"
                            :model-value="localValues"
                            @update:model-value="localValues = $event" />
                    </div>

                    <div class="settings-footer">
                        <button class="cancel-btn" @click="cancelSettings">取消</button>
                        <button class="save-btn" @click="saveSettings">保存</button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.node-settings-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(var(--color-card-rgb), 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.node-settings-panel {
    background: rgba(var(--color-card-rgb), 0.5);
    box-shadow: 0 0 5px var(--color-shader);
    backdrop-filter: blur(20px);
    border-radius: 12px;
    min-width: 400px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 10px;
}

/* Panel 进入和退出动画 */
.panel-enter-active {
    transition: opacity 0.2s ease-out;
}

.panel-leave-active {
    transition: opacity 0.2s ease-in;
}

.panel-leave-to {
    opacity: 0;
}

.panel-enter-active .node-settings-panel {
    animation: panelSlideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-leave-active .node-settings-panel {
    animation: panelSlideDown 0.2s cubic-bezier(0.4, 0, 0.6, 1);
}

@keyframes panelSlideUp {
    from {
        transform: translateY(30px) scale(0.95);
        opacity: 0;
    }

    to {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
}

@keyframes panelSlideDown {
    from {
        transform: translateY(0) scale(1);
        opacity: 1;
    }

    to {
        transform: translateY(20px) scale(0.98);
        opacity: 0;
    }
}

.settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 20px 10px 20px;
    border-bottom: 1px solid var(--color-card-2);
    gap: 12px;
}

.settings-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--color-font);
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
}

.close-btn {
    font-size: 1.1rem;
    background: transparent;
    border: none;
    color: var(--color-font-1);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s, color 0.2s;
    flex-shrink: 0;
}

.close-btn:hover {
    background: rgba(var(--color-main-rgb), 0.1);
    color: var(--color-font);
}

.settings-desc {
    margin: 10px 20px 0 20px;
    color: var(--color-font-2);
    border-radius: 7px;
    font-size: 0.8rem;
}

.settings-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
}

.settings-footer {
    background: rgba(var(--color-card-1-rgb), 0.5);
    border-radius: 0 0 7px 7px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 15px 20px;
    margin: 0 -10px -10px -10px;
}

.settings-footer button {
    padding: 6px 20px;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
    font-weight: 500;
}

.cancel-btn {
    background: var(--color-card-2);
    color: var(--color-font);
}

.cancel-btn:hover {
    background: var(--color-card-1);
}

.save-btn {
    background: var(--color-main);
    color: var(--color-font-r);
}

.save-btn:hover {
    opacity: 0.9;
}

.settings-footer button:active {
    transform: scale(0.98);
}

.switch-container > label,
.param-label {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    margin-top: 10px;
}
.param-item .ss-switch {
    --switch-height: 25px;
    min-width: 45px;
}
.param-item input[type="text"],
.param-item input[type="number"],
.param-item input[type="password"],
.param-item textarea,
.param-item select {
    font-size: 0.85rem;
}

.info-btn {
    background: transparent;
    border: none;
    color: var(--color-font-1);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px
}

.info-btn:hover {
    color: var(--color-font)
}

.tip-popup {
    position: absolute;
    top: 28px;
    left: 0;
    min-width: 200px;
    font-size: 0.8rem;
    color: var(--color-font-2);
    background: var(--color-card-1);
    border: 1px solid var(--color-card-2);
    padding: 8px 10px;
    border-radius: 6px;
    box-shadow: 0 6px 18px var(--color-shader);
    opacity: 0;
    transform: translateY(calc(-100% - 2rem - 6px));
    transition: opacity 0.15s, transform 0.15s;
    pointer-events: none;
    z-index: 10;
}

.tip-popup.visible {
    transform: translateY(calc(-100% - 2rem));
    opacity: 1;
}
.tip-popup.first {
    transform: translateY(calc(100% - 4rem));
}

.info-btn:hover+.tip-popup {
    transform: translateY(calc(-100% - 2rem));
    opacity: 1;
}
.info-btn:hover+.tip-popup.first {
    transform: translateY(calc(100% - 4rem));
}
</style>
