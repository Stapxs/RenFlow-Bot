export function setAutoDark() {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    // 刷新一次颜色模式
    if (media.matches) {
        changeColorMode('dark')
    } else {
        changeColorMode('light')
    }
    // 创建颜色模式变化监听
    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', (e) => {
            const prefersDarkMode = e.matches
            if (prefersDarkMode) {
                changeColorMode('dark')
            } else {
                changeColorMode('light')
            }
        })
    }
}

function changeColorMode(mode: string) {
    // 切换颜色
    const match_list = ['color-.*.css', 'prism-.*.css', 'append-.*.css']
    const css_list = document.getElementsByTagName('link')
    for (let i = 0; i < css_list.length; i++) {
        const name = css_list[i].href
        match_list.forEach((value) => {
            if (name.match(value) != null) {
                // 检查切换的文件是否可以被访问到
                if (name != undefined) {
                    let newName = name
                    if (name.indexOf('dark') > -1) {
                        newName = name.replace('dark', 'light')
                    } else {
                        newName = name.replace('light', 'dark')
                    }
                    const xhr = new XMLHttpRequest()
                    xhr.open('HEAD', newName, false)
                    xhr.send()
                    if (xhr.status != 200) {
                        return
                    }
                }
                const newLink = document.createElement('link')
                newLink.setAttribute('rel', 'stylesheet')
                newLink.setAttribute('type', 'text/css')
                if (mode === 'dark') {
                    newLink.setAttribute('href', name.replace('light', 'dark'))
                } else {
                    newLink.setAttribute('href', name.replace('dark', 'light'))
                }
                const head = document.getElementsByTagName('head').item(0)
                if (head !== null) {
                    head.replaceChild(newLink, css_list[i])
                }
            }
        })
    }
    // 刷新页面主题色
    const meta = document.getElementsByName('theme-color')[0]
    if (meta) {
        (meta as HTMLMetaElement).content = getComputedStyle(
            document.documentElement,
        ).getPropertyValue('--color-main')
    }
}
