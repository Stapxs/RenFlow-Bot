<template>
    <transition name="modal">
        <div v-if="visible" class="modal-overlay">
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3>新增连接</h3>
                    <button class="modal-close" @click="close">
                        <font-awesome-icon :icon="['fas', 'xmark']" />
                    </button>
                </div>
                <div class="modal-body">
                    <div class="param-item">
                        <label>名称</label>
                        <input v-model="form.name" type="text" placeholder="例如：我的机器人">
                    </div>
                    <div class="param-item">
                        <label>类型</label>
                        <select v-model="form.type">
                            <option v-for="value in types" :key="value" :value="value">{{ value }}</option>
                        </select>
                    </div>
                    <div class="param-item">
                        <label>连接地址</label>
                        <input v-model="form.address" type="text" placeholder="例如：ws://localhost:3000">
                    </div>
                    <div class="param-item">
                        <label>密钥</label>
                        <input v-model="form.token" type="password">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-cancel" @click="close">取消</button>
                    <button class="modal-btn modal-btn-confirm" @click="save">添加</button>
                </div>
            </div>
        </div>
    </transition>
</template>

<script setup lang="ts">
import { connectorManager } from 'renflow-runner'
import { reactive, watch, defineProps, defineEmits, toRef } from 'vue'

const props = defineProps<{ modelValue: boolean }>()
const emits = defineEmits(['update:modelValue', 'save'])

const visible = toRef(props, 'modelValue')

const form = reactive({ name: '', type: '', address: '', token: '' })

const types = connectorManager.getAllSupportedAdapterTypes()

watch(() => props.modelValue, (v) => {
    if (v) {
        form.name = ''
        form.type = ''
        form.address = ''
        form.token = ''
    }
})

function close() {
    emits('update:modelValue', false)
}

function save() {
    if (!form.name || form.name.trim() === '') return
    emits('save', { name: form.name, type: form.type, address: form.address, token: form.token })
    emits('update:modelValue', false)
}
</script>
<style scoped>
.param-item label {
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
</style>
