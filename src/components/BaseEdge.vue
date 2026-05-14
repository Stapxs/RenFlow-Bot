<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@vue-flow/core'
import { computed } from 'vue'

const props = defineProps<EdgeProps>()

const path = computed(() => getSmoothStepPath(props))
const hidden = computed(() => props.data?.kind === 'loop-pair')
</script>

<script lang="ts">
export default {
    inheritAttrs: false,
}
</script>

<template>
    <defs>
        <marker id="arrowhead" viewBox="0 0 512 512" markerWidth="6"
            markerHeight="6" refX="256" refY="256"
            orient="auto">
            <rect x="160" y="200" width="100"
                height="150" fill="var(--color-bg)" />
            <path
                d="M249.3 235.8c10.2 12.6 9.5 31.1-2.2 42.8l-128 128c-9.2 9.2-22.9 11.9-34.9 6.9S64.5 396.9 64.5 384l0-256c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l128 128 2.2 2.4z"
                fill="var(--color-main)" />
        </marker>
    </defs>

    <BaseEdge v-if="!hidden" :path="path[0]" marker-end="url(#arrowhead)" />

    <EdgeLabelRenderer v-if="!hidden && data.label">
        <div :style="{
            pointerEvents: 'all',
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${path[1]}px,${path[2]}px)`,
        }" class="nodrag nopan">
            {{ data.label }}
        </div>
    </EdgeLabelRenderer>
</template>
