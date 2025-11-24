<script setup lang="ts">
import app from '@app/main'

import { onMounted, ref } from 'vue'
import { backend } from '@app/functions/backend'
import { setAutoDark } from '@app/functions/utils/app'
import { setupToast } from '@app/functions/toast'

import Toast from '@app/components/AppToast.vue'
import GlobalConfirm from '@app/components/GlobalConfirm.vue'

const dev = import.meta.env.DEV

// Toast 组件引用
const toastRef = ref()

function handleAppbarMouseDown(_: MouseEvent) {
    // 获取 URL 最后一级路径作为窗口标识
    const winId = location.pathname.split('/').pop()
    backend.call('win:StartDragging', winId)
}

function barMainClick() {
    // do nothing
}

function controllWin(action: 'minimize' | 'close') {
    action
}

onMounted(async () => {
    window.moYu = () => { return '\x75\x6e\x64\x65\x66\x69\x6e\x65\x64' }

    await backend.init()
    setAutoDark()
    // 设置 Toast
    if (toastRef.value) {
        setupToast(app, toastRef.value)
    }
});
</script>

<template>
    <div id="app-container" class="app-container">
        <!-- Windows/Linux 自定义标题栏 -->
        <div v-if="['linux', 'win32'].includes(backend.platform ?? '')"
            :class="'top-bar' + ((backend.platform == 'win32' && dev) ? ' win' : '')" name="appbar"
            data-tauri-drag-region="true" @mousedown="handleAppbarMouseDown">
            <div class="bar-button" @click="barMainClick()" />
            <div class="space" />
            <div class="controller">
                <div class="min" @click="controllWin('minimize')">
                    <font-awesome-icon :icon="['fas', 'minus']" />
                </div>
                <div class="close" @click="controllWin('close')">
                    <font-awesome-icon :icon="['fas', 'xmark']" />
                </div>
            </div>
        </div>

        <!-- macOS 拖拽区域 -->
        <div v-if="backend.platform == 'darwin'" id="mac-controller" class="controller mac-controller"
            data-tauri-drag-region="true" />

        <!-- 路由视图 -->
        <router-view />

        <!-- 全局 Toast 通知 -->
        <Toast ref="toastRef" />
        <!-- 全局确认对话框 -->
        <GlobalConfirm />
    </div>
</template>
