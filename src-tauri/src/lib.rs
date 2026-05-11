mod commands;
mod utils;

use log::info;
use log4rs::{
    append::console::ConsoleAppender,
    config::{Appender, Logger, Root},
    Config,
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreBuilder;
use once_cell::sync::OnceCell;
use utils::http_proxy::ProxyServer;

pub static PROXY_PORT: OnceCell<u16> = OnceCell::new();

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let rt = tokio::runtime::Runtime::new().unwrap();

    // 初始化本地代理服务器 ============
    let proxy = rt.block_on(async {
        let proxy = ProxyServer::new().await;
        proxy
    });
    PROXY_PORT.set(proxy.port).unwrap();

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let store = StoreBuilder::new(app, ".settings.dat")
                .build()
                .map_err(|e| e.to_string())?;
            let log_level = store.get("log_level").unwrap_or_default();
            let final_log_level = match log_level.as_str() {
                Some("err") => log::LevelFilter::Error,
                Some("debug") => log::LevelFilter::Debug,
                Some("info") => log::LevelFilter::Info,
                Some("all") => log::LevelFilter::Debug,
                _ => log::LevelFilter::Info,
            };
            // 初始化 log4rs
            let stdout = ConsoleAppender::builder()
                .encoder(Box::new(utils::colored_encoder::ColoredPrefixEncoder))
                .build();
            let config = Config::builder()
                .appender(Appender::builder().build("stdout", Box::new(stdout)))
                .logger(Logger::builder().build("tao", log::LevelFilter::Info))
                .logger(Logger::builder().build("tungstenite", log::LevelFilter::Info))
                .logger(Logger::builder().build("tokio_tungstenite", log::LevelFilter::Info))
                .logger(Logger::builder().build("hyper", log::LevelFilter::Info))
                .logger(Logger::builder().build("hyper_util", log::LevelFilter::Info))
                .logger(Logger::builder().build("reqwest", log::LevelFilter::Info))
                .logger(Logger::builder().build("warp", log::LevelFilter::Info))
                .build(Root::builder().appender("stdout").build(final_log_level))
                .unwrap();

            log4rs::init_config(config).unwrap();

            println!("");
            println!(" _____ _____ _____ _____ __ __ ");
            println!("|   __|_   _|  _  |  _  |  |  |");
            println!("|__   | | | |     |   __|-   -|");
            println!("|_____| |_| |__|__|__|  |__|__| CopyRight © Stapx Steve");
            println!("=======================================================");
            println!("日志等级:{}", log_level);

            if PROXY_PORT.get().is_some() {
                info!("代理服务器已启动，端口：{}", PROXY_PORT.get().unwrap());
            }

            // 创建主窗体 ============
            info!(
                "欢迎使用 Ren Flow, 当前版本: {}",
                env!("CARGO_PKG_VERSION")
            );
            info!("启动平台架构：{}", std::env::consts::OS);
            info!("正在创建窗体 ……");
            let window = create_window(app)?;
            info!("窗体创建成功");

            // 其他窗口事件
            let window_clone_event = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    #[cfg(not(target_os = "macos"))]
                    {
                        window_clone_event.hide().unwrap();
                    }
                    #[cfg(target_os = "macos")]
                    {
                        use tauri::Manager;

                        tauri::AppHandle::hide(window_clone_event.app_handle()).unwrap();
                    }
                    api.prevent_close();
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            info!("已有实例正在运行 ……");
            let window = app.get_webview_window("main").unwrap();
            window.unminimize().unwrap();
            window.set_focus().unwrap();
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::sys::sys_front_loaded,
            commands::sys::sys_get_platform,
            commands::sys::sys_get_release,
            commands::sys::sys_run_proxy,
            commands::sys::sys_send_notice,
            commands::sys::sys_close_notice,
            commands::sys::sys_close_all_notice,
            commands::sys::sys_clear_notice,
            commands::sys::sys_open_in_browser,
            commands::sys::sys_run_command,
            commands::sys::sys_get_final_redirect_url,
            commands::sys::sys_get_html,
            commands::sys::get_system_info,
            commands::sys::sys_get_api,
            commands::sys::sys_download,
            commands::sys::sys_set_store_value,
            commands::sys::sys_get_store_value,
            commands::sys::sys_export_workspace,
            commands::win::win_create_window,
            commands::win::win_close_window,
            commands::win::win_show_window,
            commands::win::win_hide_window,
            commands::win::win_start_dragging,
            commands::win::win_minimize,
            commands::win::win_maximize,
            commands::win::win_unmaximize,
            commands::win::win_toggle_maximize,
            commands::win::win_is_maximized,
            commands::opt::opt_get_system_info,
            commands::opt::opt_store,
            commands::opt::opt_save_all,
            commands::opt::opt_get_all,
            commands::opt::opt_get,
            commands::opt::opt_clear_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 创建主窗体配置
fn create_window(app: &mut tauri::App) -> tauri::Result<tauri::WebviewWindow> {
    let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
        .title("Ren Flow")
        .inner_size(850.0, 530.0)
        .transparent(true);
    #[cfg(target_os = "macos")]
    let win_builder = win_builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(20.0, 30.0))
        .background_color(tauri::window::Color(0, 0, 0, 1))
        .accept_first_mouse(true)
        .effects(
            tauri::window::EffectsBuilder::new()
                .effects(vec![tauri::window::Effect::Sidebar])
                .build(),
        );
    #[cfg(target_os = "linux")]
    let win_builder = win_builder.decorations(false).disable_drag_drop_handler();
    let window = win_builder.build()?;
    #[cfg(target_os = "windows")]
    window_vibrancy::apply_mica(&window, None);
    #[cfg(debug_assertions)]
    window.open_devtools();
    Ok(window)
}
