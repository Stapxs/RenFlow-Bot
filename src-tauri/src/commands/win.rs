use tauri::{command, AppHandle, Manager, WebviewWindow};
use log::{debug, error, info};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct CreateWindowOptions {
    label: String,
    url: String,
    title: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
}

/// 创建新窗口或显示已存在的窗口
#[command]
pub fn win_create_window(app_handle: AppHandle, options: CreateWindowOptions) -> Result<String, String> {
    info!("创建新窗口: {} -> {}", options.label, options.url);

    // 检查窗口是否已存在
    if let Some(window) = app_handle.get_webview_window(&options.label) {
        info!("窗口已存在，显示并聚焦: {}", options.label);
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return Ok("existing".to_string());
    }

    // 创建新窗口
    let mut window_builder = tauri::WebviewWindowBuilder::new(
        &app_handle,
        &options.label,
        tauri::WebviewUrl::App(options.url.into())
    )
    .title(options.title.unwrap_or_else(|| "Ren Flow".to_string()))
    .inner_size(
        options.width.unwrap_or(850.0),
        options.height.unwrap_or(530.0)
    )
    .disable_drag_drop_handler()
    .transparent(true);

    // 平台特定配置
    #[cfg(target_os = "macos")]
    {
        window_builder = window_builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .background_color(tauri::window::Color(0, 0, 0, 1))
            .traffic_light_position(tauri::LogicalPosition::new(20.0, 30.0))
            .accept_first_mouse(true)
            .effects(tauri::window::EffectsBuilder::new()
                .effects(vec![tauri::window::Effect::Menu])
                .build());
    }

    #[cfg(target_os = "linux")]
    {
        window_builder = window_builder
            .decorations(false);
    }

    let window = window_builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    {
        window_vibrancy::apply_mica(&window, None);
    }

    info!("窗口创建成功: {}", options.label);
    Ok("created".to_string())
}

/// 关闭指定窗口
#[command]
pub fn win_close_window(app_handle: AppHandle, label: String) -> Result<String, String> {
    info!("关闭窗口: {}", label);

    if let Some(window) = app_handle.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
        Ok("closed".to_string())
    } else {
        Err(format!("窗口不存在: {}", label))
    }
}

/// 显示指定窗口
#[command]
pub fn win_show_window(app_handle: AppHandle, label: String) -> Result<String, String> {
    info!("显示窗口: {}", label);

    if let Some(window) = app_handle.get_webview_window(&label) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        Ok("shown".to_string())
    } else {
        Err(format!("窗口不存在: {}", label))
    }
}

/// 隐藏指定窗口
#[command]
pub fn win_hide_window(app_handle: AppHandle, label: String) -> Result<String, String> {
    info!("隐藏窗口: {}", label);

    if let Some(window) = app_handle.get_webview_window(&label) {
        window.hide().map_err(|e| e.to_string())?;
        Ok("hidden".to_string())
    } else {
        Err(format!("窗口不存在: {}", label))
    }
}

/// 开始拖拽窗口
#[command]
pub fn win_start_dragging(app: AppHandle, label: Option<String>) -> Result<String, String> {
    debug!("开始拖拽窗口: {:?}", label);

    // 获取窗口
    let window = if let Some(label_str) = label {
        app.get_webview_window(&label_str)
            .ok_or_else(|| format!("窗口不存在: {}", label_str))?
    } else {
        return Err("必须提供窗口 label".to_string());
    };

    // 开始拖拽
    window.start_dragging().map_err(|e| {
        error!("开始拖拽失败: {:?}", e);
        e.to_string()
    })?;

    Ok("dragging".to_string())
}

/// 最小化窗口
#[command]
pub fn win_minimize(app: AppHandle, label: String) -> Result<String, String> {
    debug!("最小化窗口: {}", label);

    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {}", label))?;

    window.minimize().map_err(|e| e.to_string())?;
    Ok("minimized".to_string())
}

/// 最大化窗口
#[command]
pub fn win_maximize(app: AppHandle, label: String) -> Result<String, String> {
    debug!("最大化窗口: {}", label);

    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {}", label))?;

    window.maximize().map_err(|e| e.to_string())?;
    Ok("maximized".to_string())
}

/// 取消最大化窗口
#[command]
pub fn win_unmaximize(app: AppHandle, label: String) -> Result<String, String> {
    debug!("取消最大化窗口: {}", label);

    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {}", label))?;

    window.unmaximize().map_err(|e| e.to_string())?;
    Ok("unmaximized".to_string())
}

/// 切换窗口最大化状态
#[command]
pub fn win_toggle_maximize(app: AppHandle, label: String) -> Result<String, String> {
    debug!("切换最大化状态: {}", label);

    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {}", label))?;

    let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;

    if is_maximized {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok("unmaximized".to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok("maximized".to_string())
    }
}

/// 检查窗口是否最大化
#[command]
pub fn win_is_maximized(app: AppHandle, label: String) -> Result<bool, String> {
    let window = app.get_webview_window(&label)
        .ok_or_else(|| format!("窗口不存在: {}", label))?;

    window.is_maximized().map_err(|e| e.to_string())
}
