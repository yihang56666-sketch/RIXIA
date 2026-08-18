// RIXIA Tauri 后端入口 — 处理深链接 + 提供原生能力给前端
// 用 `cargo tauri dev` 或 `cargo tauri build` 构建

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 注册 bilibili:// 与 rixia:// 协议
            #[cfg(target_os = "windows")]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("RIXIA Tauri 启动失败");
}
