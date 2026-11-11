//! The renderer's persistent storage: named key-value namespaces (`Storage*` RPCs), drafts with their blobs
//! (`Drafts*`), and the shell's own settings. Each namespace is one JSON file, written when it changes; revisions
//! are process-local, as in Electron, so windows can order the changes they hear about.

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

type Items = BTreeMap<String, String>;

pub struct Storage {
    dir: PathBuf,
    namespaces: Mutex<HashMap<String, Items>>,
    revision: AtomicU64,
    drafts: Mutex<Option<Items>>,
    settings: Mutex<Option<Map<String, Value>>>,
}

impl Storage {
    pub fn open(dir: PathBuf) -> std::io::Result<Self> {
        fs::create_dir_all(dir.join("namespaces"))?;
        fs::create_dir_all(dir.join("blobs"))?;
        Ok(Self {
            dir,
            namespaces: Mutex::new(HashMap::new()),
            revision: AtomicU64::new(0),
            drafts: Mutex::new(None),
            settings: Mutex::new(None),
        })
    }

    pub fn items(&self, name: &str) -> (Items, u64) {
        let mut namespaces = self.namespaces.lock().unwrap();
        let items = namespaces.entry(name.to_string()).or_insert_with(|| self.load(name)).clone();
        (items, self.revision.load(Ordering::SeqCst))
    }

    pub fn update(&self, name: &str, insert: Items, remove: Vec<String>) -> u64 {
        let mut namespaces = self.namespaces.lock().unwrap();
        let items = namespaces.entry(name.to_string()).or_insert_with(|| self.load(name));
        remove.iter().for_each(|key| {
            items.remove(key);
        });
        items.extend(insert);
        write_json(&self.namespace_file(name), items);
        self.revision.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn clear(&self, name: &str) {
        self.namespaces.lock().unwrap().insert(name.to_string(), Items::new());
        let _ = fs::remove_file(self.namespace_file(name));
    }

    pub fn draft(&self, key: &str) -> Option<String> {
        self.with_drafts(|drafts| drafts.get(key).cloned())
    }

    /// Stores a draft and returns the blob ids it references that this store does not hold. A strict write is
    /// refused while any are missing, so the previous draft stays visible instead of one with dangling references.
    pub fn set_draft(&self, key: &str, value: Option<String>, strict: bool) -> Vec<String> {
        let missing: Vec<String> = value
            .as_deref()
            .filter(|text| text.starts_with('{') || text.starts_with('['))
            .and_then(|text| serde_json::from_str::<Value>(text).ok())
            .map(|document| {
                let mut ids = Vec::new();
                referenced(&document, &mut ids);
                ids.into_iter().filter(|id| !self.blob_file(id).exists()).collect()
            })
            .unwrap_or_default();
        if strict && !missing.is_empty() {
            return missing;
        }
        self.with_drafts(|drafts| {
            match value {
                Some(value) => drafts.insert(key.to_string(), value),
                None => drafts.remove(key),
            };
            write_json(&self.dir.join("drafts.json"), drafts);
        });
        missing
    }

    pub fn put_blob(&self, data: &[u8]) -> String {
        let id: String = Sha256::digest(data).iter().map(|byte| format!("{byte:02x}")).collect();
        let file = self.blob_file(&id);
        if !file.exists() {
            let _ = fs::write(file, data);
        }
        id
    }

    pub fn blob(&self, id: &str) -> Option<Vec<u8>> {
        if !id.chars().all(|char| char.is_ascii_hexdigit()) {
            return None;
        }
        fs::read(self.blob_file(id)).ok()
    }

    pub fn setting(&self, key: &str) -> Option<Value> {
        self.with_settings(|settings| settings.get(key).cloned())
    }

    pub fn set_setting(&self, key: &str, value: Value) {
        self.with_settings(|settings| {
            settings.insert(key.to_string(), value);
            write_json(&self.dir.join("settings.json"), settings);
        })
    }

    fn with_drafts<T>(&self, run: impl FnOnce(&mut Items) -> T) -> T {
        let mut drafts = self.drafts.lock().unwrap();
        run(drafts.get_or_insert_with(|| read_json(&self.dir.join("drafts.json")).unwrap_or_default()))
    }

    fn with_settings<T>(&self, run: impl FnOnce(&mut Map<String, Value>) -> T) -> T {
        let mut settings = self.settings.lock().unwrap();
        run(settings.get_or_insert_with(|| read_json(&self.dir.join("settings.json")).unwrap_or_default()))
    }

    fn load(&self, name: &str) -> Items {
        read_json(&self.namespace_file(name)).unwrap_or_default()
    }

    fn namespace_file(&self, name: &str) -> PathBuf {
        let safe: String = name
            .chars()
            .map(|char| if char.is_ascii_alphanumeric() || "._-".contains(char) { char } else { '-' })
            .collect();
        self.dir.join("namespaces").join(format!("{safe}.json"))
    }

    fn blob_file(&self, id: &str) -> PathBuf {
        self.dir.join("blobs").join(id)
    }
}

/// The blob ids a draft document references: `blob: { id }` or `blob: { ids: [...] }` anywhere in it.
fn referenced(value: &Value, ids: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::Object(blob)) = map.get("blob") {
                if let Some(Value::String(id)) = blob.get("id") {
                    ids.push(id.clone());
                }
                if let Some(Value::Array(chunks)) = blob.get("ids") {
                    ids.extend(chunks.iter().filter_map(|id| id.as_str().map(str::to_string)));
                }
            }
            map.values().for_each(|item| referenced(item, ids));
        }
        Value::Array(items) => items.iter().for_each(|item| referenced(item, ids)),
        _ => {}
    }
}

fn read_json<T: serde::de::DeserializeOwned>(file: &PathBuf) -> Option<T> {
    serde_json::from_slice(&fs::read(file).ok()?).ok()
}

/// Writes through a temporary file, so a crash mid-write never leaves a torn file behind.
fn write_json<T: serde::Serialize>(file: &PathBuf, value: &T) {
    let Ok(text) = serde_json::to_vec(value) else { return };
    let temporary = file.with_extension("tmp");
    if fs::write(&temporary, text).is_ok() {
        let _ = fs::rename(&temporary, file);
    }
}
