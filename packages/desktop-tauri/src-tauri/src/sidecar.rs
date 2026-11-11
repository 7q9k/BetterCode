//! Finds or starts the BetterCode background service the renderer talks to, like the Electron app's
//! BackgroundService: a running service registers its URL and password in `service.json` under the XDG state
//! folder; if none answers, `<cli> serve --service` starts one and registers itself.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug)]
pub struct Endpoint {
    pub url: String,
    pub password: Option<String>,
}

#[derive(Default)]
pub struct Sidecar {
    current: Mutex<Option<Endpoint>>,
    // One connect at a time, so two windows never start two services.
    connecting: Mutex<()>,
}

impl Sidecar {
    /// The running service, started first when none answers.
    pub fn ensure(&self, app: &AppHandle) -> Result<Endpoint, String> {
        let _guard = self.connecting.lock().unwrap();
        if let Some(current) = self.current.lock().unwrap().clone().filter(healthy) {
            return Ok(current);
        }
        let deadline = Instant::now() + Duration::from_secs(90);
        let mut started = false;
        loop {
            if let Some(endpoint) = registered().filter(healthy) {
                *self.current.lock().unwrap() = Some(endpoint.clone());
                return Ok(endpoint);
            }
            if !started {
                start(app)?;
                started = true;
            }
            if Instant::now() >= deadline {
                return Err("Timed out waiting for the BetterCode background service to start".into());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
    }
}

fn registered() -> Option<Endpoint> {
    let info: Value = serde_json::from_slice(&std::fs::read(registration_file()).ok()?).ok()?;
    let url = info.get("url")?.as_str()?.replace("://0.0.0.0", "://127.0.0.1");
    let password = info.get("password").and_then(Value::as_str).map(str::to_string);
    Some(Endpoint { url: url.trim_end_matches('/').to_string(), password })
}

fn healthy(endpoint: &Endpoint) -> bool {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(2)))
        .build()
        .into();
    let request = agent.get(format!("{}/api/info", endpoint.url));
    let request = match &endpoint.password {
        Some(password) => request.header(
            "Authorization",
            format!("Basic {}", STANDARD.encode(format!("opencode:{password}"))),
        ),
        None => request,
    };
    request.call().is_ok()
}

fn start(app: &AppHandle) -> Result<(), String> {
    let mut command = cli_command(app);
    let program = command.remove(0);
    let mut process = Command::new(&program);
    process
        .args(command)
        .args(["serve", "--service"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP: no console, and the service outlives this app.
        process.creation_flags(0x0800_0000 | 0x0000_0200);
    }
    process
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to start the BetterCode background service ({program}): {error}"))
}

/// The CLI to start: `BETTERCODE_CLI_COMMAND` (a JSON array, for development), the CLI bundled with the app, the
/// one the installer put in ~/.bettercode/bin, or `bettercode` on PATH.
fn cli_command(app: &AppHandle) -> Vec<String> {
    if let Some(command) = std::env::var("BETTERCODE_CLI_COMMAND")
        .ok()
        .and_then(|text| serde_json::from_str::<Vec<String>>(&text).ok())
        .filter(|command| !command.is_empty())
    {
        return command;
    }
    let executable = if cfg!(windows) { "bettercode.exe" } else { "bettercode" };
    let bundled = if cfg!(windows) { "bettercode-cli.exe" } else { "bettercode-cli" };
    let candidates = [
        app.path().resource_dir().ok().map(|dir| dir.join(bundled)),
        std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.join(bundled))),
        home().map(|home| home.join(".bettercode").join("bin").join(executable)),
    ];
    candidates
        .into_iter()
        .flatten()
        .find(|path| path.is_file())
        .map(|path| vec![path.to_string_lossy().into_owned()])
        .unwrap_or_else(|| vec!["bettercode".into()])
}

/// Where the service registers: `BETTERCODE_SERVICE_FILE`, or `service.json` in BetterCode's XDG state folder.
fn registration_file() -> PathBuf {
    if let Ok(file) = std::env::var("BETTERCODE_SERVICE_FILE") {
        return PathBuf::from(file);
    }
    let state = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .or_else(|| home().map(|home| home.join(".local").join("state")))
        .unwrap_or_default();
    state.join("bettercode").join("service.json")
}

/// The home folder as Node's `os.homedir()` sees it, which the CLI's state paths start from.
fn home() -> Option<PathBuf> {
    let (first, second) = if cfg!(windows) { ("USERPROFILE", "HOME") } else { ("HOME", "USERPROFILE") };
    std::env::var_os(first).or_else(|| std::env::var_os(second)).map(PathBuf::from)
}
