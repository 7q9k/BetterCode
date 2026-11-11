//! The BetterCode desktop shell on Tauri. The window shows the same renderer as the Electron app
//! (packages/desktop/src/renderer); this side answers its IPC calls (see `rpc`), keeps its storage, and starts the
//! BetterCode background service the renderer talks to.

mod rpc;
mod sidecar;
mod storage;
mod windows;

use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, EventTarget, Manager, WindowEvent};

pub struct AppState {
    pub sidecar: sidecar::Sidecar,
    pub storage: storage::Storage,
    /// Files the user picked, by picker token: a window may read only these.
    pub picked: Mutex<HashMap<String, HashSet<PathBuf>>>,
    /// Each window's page zoom and last fullscreen state, by window label.
    pub zoom: Mutex<HashMap<String, f64>>,
    pub fullscreen: Mutex<HashMap<String, bool>>,
}

/// Sends a renderer event (`DesktopEvent` in packages/desktop/src/shared/ipc-rpc/events.ts) to one window.
pub fn emit_event(app: &tauri::AppHandle, label: &str, tag: &str, fields: Value) {
    let mut payload = fields;
    payload["_tag"] = json!(tag);
    let _ = app.emit_to(EventTarget::webview_window(label), "desktop-event", payload);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.webview_windows().values().next() {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            app.manage(AppState {
                sidecar: sidecar::Sidecar::default(),
                storage: storage::Storage::open(data.join("storage"))?,
                picked: Mutex::new(HashMap::new()),
                zoom: Mutex::new(HashMap::new()),
                fullscreen: Mutex::new(HashMap::new()),
            });
            windows::open(app.handle(), "main")?;
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            let label = window.label();
            match event {
                WindowEvent::Focused(focused) => {
                    emit_event(app, label, "WindowFocusChanged", json!({ "focused": focused }))
                }
                WindowEvent::Resized(_) => {
                    let fullscreen = window.is_fullscreen().unwrap_or(false);
                    let state = app.state::<AppState>();
                    let changed = state
                        .fullscreen
                        .lock()
                        .unwrap()
                        .insert(label.to_string(), fullscreen)
                        .map_or(fullscreen, |previous| previous != fullscreen);
                    if changed {
                        emit_event(app, label, "WindowFullscreenChanged", json!({ "fullscreen": fullscreen }))
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![rpc::rpc])
        .run(tauri::generate_context!())
        .expect("error while running BetterCode");
}
