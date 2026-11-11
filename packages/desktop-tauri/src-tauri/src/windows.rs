use crate::AppState;
use std::time::Duration;
use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// The renderer's last reported background (`AppSetBackgroundColor`), so a window opens in its theme's color.
pub const BACKGROUND_KEY: &str = "background-color";

/// Opens a BetterCode window. It stays hidden until the renderer has painted its theme (`WindowThemeReady`), as in
/// Electron, or at most a few seconds.
pub fn open(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    let background = app
        .state::<AppState>()
        .storage
        .setting(BACKGROUND_KEY)
        .and_then(|value| value.as_str().and_then(parse_color))
        .unwrap_or(Color(22, 22, 22, 255));

    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("BetterCode")
        .inner_size(1280.0, 820.0)
        .min_inner_size(640.0, 480.0)
        .background_color(background)
        .center()
        .visible(false);

    // Windows: the renderer draws the whole title bar; the caption buttons come from src/window-controls.ts.
    #[cfg(target_os = "windows")]
    let builder = builder.decorations(false).shadow(true);

    // macOS: the traffic lights float over the renderer's title bar, as with Electron's hidden title bar.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    let window = builder.build()?;
    let reveal = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(4));
        let _ = reveal.show();
    });
    Ok(window)
}

/// Parses `#rgb`, `#rrggbb` or `#rrggbbaa`.
pub fn parse_color(value: &str) -> Option<Color> {
    let hex = value.trim().strip_prefix('#')?;
    let channel = |index: usize, width: usize| {
        let text = &hex[index * width..index * width + width];
        let value = u8::from_str_radix(text, 16).ok()?;
        Some(if width == 1 { value * 17 } else { value })
    };
    match hex.len() {
        3 => Some(Color(channel(0, 1)?, channel(1, 1)?, channel(2, 1)?, 255)),
        6 => Some(Color(channel(0, 2)?, channel(1, 2)?, channel(2, 2)?, 255)),
        8 => Some(Color(channel(0, 2)?, channel(1, 2)?, channel(2, 2)?, channel(3, 2)?)),
        _ => None,
    }
}
