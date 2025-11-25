import { defineConfig } from 'vitepress'
import { withSidebar } from 'vitepress-sidebar'

const vitePressConfigs = {
    title: "Renflow Bot 文档",
    themeConfig: {
        nav: [
            { text: '主页', link: '/' },
            { text: '使用指南', link: '/User-Guide' },
            { text: '节点参考', link: '/Node-Reference' },
            { text: 'Runner API', link: '/Runner-API/README' },
            { text: 'GitHub', link: 'https://github.com/Stapxs/RenFlow-Bot' }
        ]
    }
}

export default defineConfig(
    withSidebar(vitePressConfigs, {
        documentRootPath: 'renflow.document',
        collapsed: true,
        collapseDepth: 2,
        hyphenToSpace: true,
        capitalizeEachWords: true,
        excludeByGlobPattern: [
            'README.md',
            'globals.md'
        ]
    })
)
