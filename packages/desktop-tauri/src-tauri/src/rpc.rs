//! Answers the renderer's IPC calls. Each `tag` is one RPC of the Electron contract in
//! packages/desktop/src/shared/ipc-rpc/*.ts with the same payload and result; src/bridge.ts sends them here. Bytes
//! travel as `{"$bytes": base64}`.

use crate::{emit_event, windows, AppState};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

type Reply = Result<Value, Value>;

const SPELLCHECK_KEY: &str = "spellcheck";
const ZOOM_LEVEL_KEY: &str = "zoom-level";
const PINCH_ZOOM_KEY: &str = "pinch-zoom";

#[tauri::command]
pub async fn rpc(app: AppHandle, window: WebviewWindow, tag: String, payload: Value) -> Reply {
    // Dialogs, file reads and the service connect block, so every call runs off the async workers.
    tauri::async_runtime::spawn_blocking(move || dispatch(&app, &window, &tag, &payload))
        .await
        .map_err(|error| failure(&error.to_string()))?
}

fn dispatch(app: &AppHandle, window: &WebviewWindow, tag: &str, payload: &Value) -> Reply {
    let state = app.state::<AppState>();
    let text = |key: &str| payload.get(key).and_then(Value::as_str).unwrap_or_default().to_string();
    let flag = |key: &str| payload.get(key).and_then(Value::as_bool).unwrap_or(false);

    match tag {
        // App
        "AppAwaitInitialization" | "AppReconnectService" => {
            let endpoint = state.sidecar.ensure(app).map_err(|error| failure(&error))?;
            Ok(json!({ "url": endpoint.url, "password": endpoint.password }))
        }
        "AppReadyDeepLinks" | "AppAcknowledgeDeepLinks" | "AppSetForceFocus" | "AppSetNativeTranslations" => {
            Ok(Value::Null)
        }
        "AppIsFirstLaunchOnboardingPending" | "AppCheckAppExists" => Ok(json!(false)),
        "AppFinishFirstLaunchOnboarding" | "AppResolveAppPath" => Ok(Value::Null),
        "AppSetBackgroundColor" => {
            let color = text("color");
            if let Some(parsed) = windows::parse_color(&color) {
                let _ = window.set_background_color(Some(parsed));
            }
            state.storage.set_setting(windows::BACKGROUND_KEY, json!(color));
            Ok(Value::Null)
        }
        "AppExportDebugLogs" => Ok(json!("")),
        "AppGetSpellcheckEnabled" => Ok(json!(state.storage.setting(SPELLCHECK_KEY).and_then(|v| v.as_bool()).unwrap_or(true))),
        "AppSetSpellcheckEnabled" => {
            state.storage.set_setting(SPELLCHECK_KEY, json!(flag("enabled")));
            Ok(Value::Null)
        }
        "AppRecordFatalRendererError" => {
            eprintln!("renderer error: {}", payload.get("error").unwrap_or(&Value::Null));
            Ok(Value::Null)
        }
        "AppRelaunch" => app.restart(),

        // Storage
        "WindowSnapshot" => {
            let names = payload.get("names").and_then(Value::as_array).cloned().unwrap_or_default();
            let snapshot: serde_json::Map<String, Value> = names
                .iter()
                .filter_map(Value::as_str)
                .map(|name| {
                    let (items, revision) = state.storage.items(name);
                    (name.to_string(), json!({ "items": items, "revision": revision }))
                })
                .collect();
            Ok(json!({ "storage": snapshot, "plugins": [] }))
        }
        "StorageItems" => {
            let (items, revision) = state.storage.items(&text("name"));
            Ok(json!({ "items": items, "revision": revision }))
        }
        "StorageUpdate" => {
            let name = text("name");
            let insert: BTreeMap<String, String> =
                serde_json::from_value(payload.get("insert").cloned().unwrap_or_default()).unwrap_or_default();
            let remove: Vec<String> =
                serde_json::from_value(payload.get("remove").cloned().unwrap_or_default()).unwrap_or_default();
            let revision = state.storage.update(&name, insert.clone(), remove.clone());
            // Other windows hold their own copy of this namespace; tell them what moved.
            for other in app.webview_windows().keys().filter(|label| *label != window.label()) {
                emit_event(
                    app,
                    other,
                    "StorageChanged",
                    json!({ "name": name, "insert": insert, "remove": remove, "revision": revision }),
                );
            }
            Ok(json!(revision))
        }
        "StorageClear" => {
            state.storage.clear(&text("name"));
            Ok(Value::Null)
        }
        "DraftsGet" => Ok(json!(state.storage.draft(&text("key")))),
        "DraftsSet" => Ok(json!(state.storage.set_draft(
            &text("key"),
            Some(text("value")),
            flag("strict")
        ))),
        "DraftsDelete" => {
            state.storage.set_draft(&text("key"), None, false);
            Ok(Value::Null)
        }
        "DraftsPutBlob" => Ok(json!(state.storage.put_blob(&bytes(payload.get("data"))?))),
        "DraftsGetBlob" => Ok(state.storage.blob(&text("id")).map_or(Value::Null, |data| encode(&data))),

        // Files
        "FilesOpenDirectoryPicker" => {
            let options = payload.get("options").cloned().unwrap_or_default();
            let dialog = picker(app, window, &options);
            if options.get("multiple").and_then(Value::as_bool).unwrap_or(false) {
                let paths = dialog.blocking_pick_folders().unwrap_or_default();
                let paths: Vec<String> = paths.into_iter().filter_map(path_text).collect();
                return Ok(if paths.is_empty() { Value::Null } else { json!(paths) });
            }
            Ok(dialog.blocking_pick_folder().and_then(path_text).map_or(Value::Null, |path| json!(path)))
        }
        "FilesOpenFilePicker" => {
            let options = payload.get("options").cloned().unwrap_or_default();
            let mut dialog = picker(app, window, &options);
            let extensions: Vec<String> = options
                .get("extensions")
                .and_then(Value::as_array)
                .map(|items| items.iter().filter_map(Value::as_str).map(|ext| ext.trim_start_matches('.').to_string()).collect())
                .unwrap_or_default();
            if !extensions.is_empty() {
                let refs: Vec<&str> = extensions.iter().map(String::as_str).collect();
                dialog = dialog.add_filter("Files", &refs);
            }
            let paths: Vec<PathBuf> = if options.get("multiple").and_then(Value::as_bool).unwrap_or(false) {
                dialog.blocking_pick_files().unwrap_or_default()
            } else {
                dialog.blocking_pick_file().into_iter().collect()
            }
            .into_iter()
            .filter_map(|path| path.into_path().ok())
            .collect();
            if paths.is_empty() {
                return Ok(Value::Null);
            }
            let token = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
            let files: Vec<Value> = paths
                .iter()
                .map(|path| {
                    json!({
                        "path": path.to_string_lossy(),
                        "name": path.file_name().map(|name| name.to_string_lossy()).unwrap_or_default(),
                        "size": std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0),
                    })
                })
                .collect();
            state.picked.lock().unwrap().insert(token.clone(), paths.into_iter().collect::<HashSet<_>>());
            Ok(json!({ "token": token, "files": files }))
        }
        "FilesReadPickedFile" => {
            let path = PathBuf::from(text("path"));
            let allowed = state.picked.lock().unwrap().get(&text("token")).is_some_and(|paths| paths.contains(&path));
            if !allowed {
                return Err(failure("This file was not picked"));
            }
            std::fs::read(&path).map(|data| encode(&data)).map_err(|error| failure(&error.to_string()))
        }
        "FilesReleasePickedFiles" => {
            state.picked.lock().unwrap().remove(&text("token"));
            Ok(Value::Null)
        }
        "FilesSaveFile" => {
            let options = payload.get("options").cloned().unwrap_or_default();
            let Some(path) = picker(app, window, &options).blocking_save_file().and_then(|path| path.into_path().ok()) else {
                return Ok(json!(false));
            };
            std::fs::write(path, text("content")).map_err(|error| failure(&error.to_string()))?;
            Ok(json!(true))
        }
        "FilesOpenExternal" => {
            let _ = app.opener().open_url(text("url"), None::<&str>);
            Ok(Value::Null)
        }
        "FilesOpenBrowser" => Ok(json!(app.opener().open_url(text("url"), None::<&str>).is_ok())),
        "FilesOpenLocalFile" => {
            let url = text("url");
            let path = url.strip_prefix("file:///").or_else(|| url.strip_prefix("file://")).unwrap_or(&url);
            let _ = app.opener().open_path(path.replace("%20", " "), None::<&str>);
            Ok(Value::Null)
        }
        "FilesOpenPath" => {
            let application = payload.get("application").and_then(Value::as_str);
            Ok(match app.opener().open_path(text("path"), application) {
                Ok(()) => Value::Null,
                Err(error) => json!(error.to_string()),
            })
        }
        "FilesRevealPath" => Ok(json!(app.opener().reveal_item_in_dir(text("path")).is_ok())),
        "FilesReadClipboardImage" => {
            let Ok(image) = app.clipboard().read_image() else { return Ok(Value::Null) };
            let mut png = Vec::new();
            let encoder = image::codecs::png::PngEncoder::new(&mut png);
            image::ImageEncoder::write_image(encoder, image.rgba(), image.width(), image.height(), image::ExtendedColorType::Rgba8)
                .map_err(|error| failure(&error.to_string()))?;
            Ok(json!({ "buffer": encode(&png), "width": image.width(), "height": image.height() }))
        }
        "FilesWriteClipboardText" => {
            app.clipboard().write_text(text("text")).map_err(|error| failure(&error.to_string()))?;
            Ok(Value::Null)
        }

        // Window
        "WindowThemeReady" | "WindowShow" => {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            Ok(Value::Null)
        }
        "WindowRequestMicrophone" => Ok(json!(true)),
        "WindowSetVoiceCallActive" | "WindowSetTrafficLightsPosition" => Ok(Value::Null),
        "WindowGetFocused" => Ok(json!(window.is_focused().unwrap_or(false))),
        "WindowGetFullscreen" => Ok(json!(window.is_fullscreen().unwrap_or(false))),
        "WindowSetFocus" => {
            let _ = window.set_focus();
            Ok(Value::Null)
        }
        "WindowGetZoomFactor" => Ok(json!(state.zoom.lock().unwrap().get(window.label()).copied().unwrap_or(1.0))),
        "WindowSetZoomFactor" => {
            let factor = payload.get("factor").and_then(Value::as_f64).unwrap_or(1.0);
            let _ = window.set_zoom(factor);
            state.zoom.lock().unwrap().insert(window.label().to_string(), factor);
            Ok(Value::Null)
        }
        "WindowGetZoomLevel" => Ok(state.storage.setting(ZOOM_LEVEL_KEY).unwrap_or(json!(1))),
        "WindowSetZoomLevel" => {
            state.storage.set_setting(ZOOM_LEVEL_KEY, payload.get("level").cloned().unwrap_or(json!(1)));
            Ok(Value::Null)
        }
        "WindowGetPinchZoomEnabled" => Ok(state.storage.setting(PINCH_ZOOM_KEY).unwrap_or(json!(false))),
        "WindowSetPinchZoomEnabled" => {
            state.storage.set_setting(PINCH_ZOOM_KEY, json!(flag("enabled")));
            Ok(Value::Null)
        }
        "WindowSetTitlebar" => {
            let dark = payload.pointer("/theme/mode").and_then(Value::as_str) == Some("dark");
            let _ = window.set_theme(Some(if dark { tauri::Theme::Dark } else { tauri::Theme::Light }));
            Ok(Value::Null)
        }

        // Menu: edit actions run in the page (src/bridge.ts); the rest act on the window.
        "MenuRunAction" => {
            match text("action").as_str() {
                "view.reload" => {
                    let _ = window.eval("location.reload()");
                }
                "view.toggleDevTools" => {
                    if window.is_devtools_open() {
                        window.close_devtools()
                    } else {
                        window.open_devtools()
                    }
                }
                "view.toggleFullscreen" => {
                    let _ = window.set_fullscreen(!window.is_fullscreen().unwrap_or(false));
                }
                "window.new" => {
                    let label = format!("window-{}", app.webview_windows().len() + 1);
                    windows::open(app, &label).map_err(|error| failure(&error.to_string()))?;
                }
                "window.close" => {
                    let _ = window.close();
                }
                "window.minimize" => {
                    let _ = window.minimize();
                }
                "window.toggleMaximize" => {
                    let _ = if window.is_maximized().unwrap_or(false) { window.unmaximize() } else { window.maximize() };
                }
                "app.relaunch" => app.restart(),
                _ => {}
            }
            Ok(Value::Null)
        }

        // GUI plugins: built-ins run in the renderer; main-process plugin entries are not hosted yet.
        "PluginSubscribe" => Ok(json!({ "available": false })),
        "PluginCall" => Err(json!({ "code": "unavailable" })),
        "PluginEmbed" | "PluginMenubarItem" | "PluginConfigure" | "PluginCapture" => Ok(Value::Null),
        "PluginMenubarItems" => Ok(json!([])),
        "PluginList" => Ok(json!(builtin_plugins())),
        "PluginGuis" => Ok(json!({ "plugins": [], "reserved": [] })),
        "PluginEnable" | "PluginDisable" | "PluginReload" => Err(json!({ "code": "notFound" })),

        _ => Err(failure(&format!("Unknown desktop call: {tag}"))),
    }
}

/// The built-in GUI plugins (packages/gui-plugins/src/main.ts). Those with a main-process entry report an error, so
/// the renderer's startup gate stops waiting for what they would contribute (packages/app/src/runtime/plugin).
fn builtin_plugins() -> Vec<Value> {
    const WINDOW_ONLY: [&str; 10] =
        ["context", "btw", "terminal", "file", "review", "details", "microsoft-office", "sources", "goal", "visuals"];
    const WITH_MAIN: [&str; 6] = ["debug", "browser", "pairing", "updater", "ssh", "wsl"];
    WINDOW_ONLY
        .iter()
        .map(|id| json!({ "id": id, "builtin": true, "enabled": true }))
        .chain(WITH_MAIN.iter().map(|id| {
            json!({ "id": id, "builtin": true, "enabled": true, "error": "Not available in the Tauri desktop app yet" })
        }))
        .collect()
}

fn picker(app: &AppHandle, window: &WebviewWindow, options: &Value) -> tauri_plugin_dialog::FileDialogBuilder<tauri::Wry> {
    let mut dialog = app.dialog().file().set_parent(window);
    if let Some(title) = options.get("title").and_then(Value::as_str) {
        dialog = dialog.set_title(title);
    }
    if let Some(path) = options.get("defaultPath").and_then(Value::as_str) {
        let path = Path::new(path);
        dialog = if path.is_dir() { dialog.set_directory(path) } else { dialog.set_file_name(path.to_string_lossy()) };
    }
    dialog
}

fn path_text(path: tauri_plugin_dialog::FilePath) -> Option<String> {
    path.into_path().ok().map(|path| path.to_string_lossy().into_owned())
}

fn encode(data: &[u8]) -> Value {
    json!({ "$bytes": STANDARD.encode(data) })
}

fn bytes(value: Option<&Value>) -> Result<Vec<u8>, Value> {
    value
        .and_then(|value| value.get("$bytes"))
        .and_then(Value::as_str)
        .and_then(|text| STANDARD.decode(text).ok())
        .ok_or_else(|| failure("Expected bytes"))
}

fn failure(message: &str) -> Value {
    json!({ "message": message })
}
