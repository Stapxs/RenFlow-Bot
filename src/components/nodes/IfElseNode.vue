<script setup lang="ts">
import { Position, Handle } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ref, computed } from 'vue'
import { useNodeParams, useSafeDelete } from './useNodeHelpers'
import NodeSettingsPanel from '../NodeSettingsPanel.vue'

const props = defineProps<NodeProps>()
const isDev = import.meta.env.DEV

// useVueFlow not required here; delete handled by useSafeDelete

// 使用通用参数管理
const { paramValues, params, updateParam, updateSettings } = useNodeParams(props as any)

// 节点标题，绑定到 paramValues.title
const title = computed({
    get: () => paramValues.value.title || '条件分支',
    set: (v: string) => updateParam('title', v)
})

// 设置面板显示状态
const showSettingsPanel = ref(false)
const openSettings = () => { showSettingsPanel.value = true }
const closeSettings = () => { showSettingsPanel.value = false }

// 删除节点逻辑（通用）
const { deleteNode } = useSafeDelete(props as any)

defineEmits(['updateNodeInternals'])
</script>

<template>
    <Handle type="target" :position="Position.Left" />

    <div class="if-else-node ss-card">
        <header>
            <div class="node-title">
                <font-awesome-icon :icon="['fas', 'code-branch']" />
                <input v-model="title"
                    type="text"
                    class="node-label-input"
                    placeholder="条件分支"
                    @mousedown.stop
                    @pointerdown.stop>
            </div>
            <button title="删除节点" class="delete-btn" @click.stop="deleteNode">
                <font-awesome-icon :icon="['fas', 'times']" />
            </button>
        </header>

        <!-- 条件表达式按钮 -->
        <div class="condition-btn">
            <button title="编辑条件" @click.stop="openSettings">
                <span>编辑条件</span>
                <font-awesome-icon :icon="['fas', 'pencil']" />
            </button>
        </div>

        <div v-if="isDev" class="node-tip">
            <span>{{ props.id }}</span>
        </div>
    </div>

    <!-- True 分支 -->
    <Handle id="true"
        type="source"
        :position="Position.Right"
        :style="{ top: 'calc(33% + 6px)' }" />
    <div class="handle-label handle-label-true" />

    <!-- False 分支 -->
    <Handle id="false"
        type="source"
        :position="Position.Right"
        :style="{ top: 'calc(66% + 6px)' }" />
    <div class="handle-label handle-label-false" />

    <!-- 设置面板弹窗 -->
    <NodeSettingsPanel
        v-model="paramValues"
        :pan-show="showSettingsPanel"
        :params="params"
        :node-id="props.id"
        @update:model-value="updateSettings"
        @close="closeSettings" />
</template>

<style scoped>
.if-else-node {
    box-shadow: 0 0 5px var(--color-shader);
    background: var(--color-card);
    border-radius: 7px;
    min-width: 200px;
}

.if-else-node header {
    background: var(--color-main);
    color: var(--color-font-r);
    margin: -13px -13px 10px -13px;
    border-radius: 7px;
    padding: 3px 5px 3px 10px;
    letter-spacing: 0;
    font-weight: bold;
    font-size: 0.8rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.if-else-node header .node-title {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
}

.if-else-node header .node-title svg {
    flex-shrink: 0;
}

.if-else-node header .node-label-input {
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

.if-else-node header .node-label-input:focus {
    background: rgba(255, 255, 255, 0.2);
}

.if-else-node header .node-label-input::placeholder {
    color: inherit;
    opacity: 0.7;
}

.if-else-node header svg {
    width: 12px;
    height: 12px;
}

/* 删除按钮 */
.delete-btn {
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

.delete-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.05);
    opacity: 1;
}

.delete-btn:active {
    transform: scale(0.95);
}

.delete-btn svg {
    height: 10px;
    width: 10px;
}

/* 条件按钮 */
.condition-btn {
    color: var(--color-font);
    font-size: 0.7rem;
    font-weight: 500;
}

.condition-btn button {
    width: 100%;
    background: rgba(var(--color-main-rgb), 0.1);
    border: 1px solid rgba(var(--color-main-rgb), 0.3);
    border-radius: 6px;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition: background 0.2s, border-color 0.2s, transform 0.1s;
}

.condition-btn button span {
    text-align: left;
    flex: 1;
}

.condition-btn button:hover {
    background: rgba(var(--color-main-rgb), 0.2);
    border-color: rgba(var(--color-main-rgb), 0.5);
}

.condition-btn button:active {
    transform: scale(0.98);
}

.condition-btn svg {
    color: var(--color-font-1);
    width: 12px;
    height: 12px;
    flex-shrink: 0;
}

/* Handle 标签 */
.handle-label {
    width: 6px;
    height: 6px;
    margin-top: 3px;
    border-radius: 100%;
    position: absolute;
    right: -7px;
    font-size: 0.7rem;
    pointer-events: none;
    outline: 2px solid var(--color-bg);
}

.handle-label-true {
    top: 33%;
    background: #09de3a;
}

.handle-label-false {
    top: 66%;
    background-color: #f37a7a;
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
