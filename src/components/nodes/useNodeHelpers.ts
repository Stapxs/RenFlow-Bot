import { ref, computed, watch } from 'vue'
import { useVueFlow } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import type { NodeParam } from 'renflow-runner'

export function useNodeParams(props: NodeProps) {
    const { updateNode } = useVueFlow()

    const paramValues = ref<Record<string, any>>({ ...(props.data?.params || {}) })

    const params = computed<NodeParam[]>(() => {
        return (props.data && (props.data as any).metadata && (props.data as any).metadata.params) || []
    })

    const initParamDefaults = () => {
        params.value.forEach(param => {
            if (param.defaultValue !== undefined && paramValues.value[param.key] === undefined) {
                paramValues.value[param.key] = param.defaultValue
            }
        })
    }

    // 首次填充默认值
    initParamDefaults()

    // 同步外部 data.params
    watch(() => props.data?.params, (newVal) => {
        paramValues.value = { ...(newVal || {}) }
        initParamDefaults()
    }, { deep: true, immediate: true })

    const updateNodeData = (newParams: Record<string, any>) => {
        updateNode(props.id, {
            data: {
                ...(props.data as any),
                params: { ...newParams }
            }
        })
    }

    const updateParam = (key: string, value: any) => {
        paramValues.value[key] = value
        updateNodeData(paramValues.value)
    }

    const updateSettings = (newValues: Record<string, any>) => {
        paramValues.value = { ...newValues }
        updateNodeData(paramValues.value)
    }

    return {
        paramValues,
        params,
        updateParam,
        updateSettings,
        updateNodeData
    }
}

export function useSafeDelete(props: NodeProps) {
    const { removeNodes, findNode, getIncomers, getOutgoers } = useVueFlow()

    function deleteNode() {
        try {
            const current = findNode(props.id)
            const toRemove = new Set<string>()
            toRemove.add(props.id)

            if (current) {
                const incomers = getIncomers(current)
                for (const inc of incomers) {
                    const isMerge = !!(
                        (inc.data && inc.data.nodeType === 'merge') ||
                        (inc.data && inc.data.metadata && inc.data.metadata.id === 'merge')
                    )
                    if (!isMerge || !inc.id) continue

                    try {
                        const outgoers = getOutgoers(inc) || []
                        const outIds = outgoers.map((o: any) => o.id)
                        const safeToRemove = outIds.length === 0 || (outIds.length === 1 && outIds[0] === props.id)
                        if (safeToRemove) toRemove.add(inc.id)
                    } catch (e) {
                        // 默认不删除以保证安全
                    }
                }
            }

            removeNodes(Array.from(toRemove))
        } catch (e) {
            removeNodes([props.id])
        }
    }

    return { deleteNode }
}
