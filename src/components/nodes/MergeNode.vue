<script setup lang="ts">
import { Position, Handle } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { computed, ref } from 'vue'
import NodeSettingsPanel from '../NodeSettingsPanel.vue'
import { useNodeParams } from './useNodeHelpers'

const props = defineProps<NodeProps>()
// Removed unused toRef usage

// 使用通用参数管理
const { paramValues, params, updateSettings } = useNodeParams(props as any)

// 设置面板显示状态
const showSettingsPanel = ref(false)
const openSettings = () => { showSettingsPanel.value = true }
const closeSettings = () => { showSettingsPanel.value = false }
const nodeIcon = computed(() => {
    const nodeType = props.data?.nodeType || props.data?.metadata?.id
    if (nodeType === 'loop-end') {
        return 'flag-checkered'
    }
    return 'gear'
})

defineEmits(['updateNodeInternals'])
</script>

<template>
    <Handle type="target" :position="Position.Left" />

    <div class="merge-node">
        <button @click="openSettings">
            <font-awesome-icon :icon="['fas', nodeIcon]" />
        </button>
    </div>

    <Handle type="source" :position="Position.Right" />

    <!-- 设置面板弹窗 -->
    <NodeSettingsPanel
        v-model="paramValues"
        :pan-show="showSettingsPanel"
        :params="params"
        :node-id="props.id"
        :node-name="data.label"
        @update:model-value="updateSettings"
        @close="closeSettings" />
</template>
<style scoped>
.merge-node {
    box-shadow: 0 0 5px var(--color-shader);
    background: var(--color-card);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 45px;
    width: 45px;
}
.merge-node button {
    background: transparent;
    border: none;
    cursor: pointer;
}
.merge-node button > svg {
    color: var(--color-main);
    font-size: 0.9rem;
}
</style>
