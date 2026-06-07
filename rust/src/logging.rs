use rhai::{FuncRegistration, Module};
use std::sync::Mutex;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

static LOG_LEVEL: Mutex<LogLevel> = Mutex::new(LogLevel::Info);

pub fn set_log_level(level: &str) {
    let new_level = match level.to_lowercase().as_str() {
        "debug" => LogLevel::Debug,
        "info" => LogLevel::Info,
        "warn" => LogLevel::Warn,
        "error" => LogLevel::Error,
        _ => return,
    };
    *LOG_LEVEL.lock().unwrap_or_else(|e| e.into_inner()) = new_level;
}

fn log(level: LogLevel, msg: &str) {
    let current = *LOG_LEVEL.lock().unwrap_or_else(|e| e.into_inner());
    if level < current {
        return;
    }
    #[cfg(target_arch = "wasm32")]
    {
        use wasm_bindgen::prelude::*;
        match level {
            LogLevel::Debug => web_sys::console::debug_1(&JsValue::from_str(msg)),
            LogLevel::Info => web_sys::console::info_1(&JsValue::from_str(msg)),
            LogLevel::Warn => web_sys::console::warn_1(&JsValue::from_str(msg)),
            LogLevel::Error => web_sys::console::error_1(&JsValue::from_str(msg)),
        }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let prefix = match level {
            LogLevel::Debug => "[DEBUG]",
            LogLevel::Info => "[INFO]",
            LogLevel::Warn => "[WARN]",
            LogLevel::Error => "[ERROR]",
        };
        eprintln!("{prefix} {msg}");
    }
}

// Separate standalone functions because Rhai's set_native_fn expects a function pointer,
// not a closure.
pub fn log_debug(msg: &str) {
    log(LogLevel::Debug, msg);
}
pub fn log_info(msg: &str) {
    log(LogLevel::Info, msg);
}
pub fn log_warn(msg: &str) {
    log(LogLevel::Warn, msg);
}
pub fn log_error(msg: &str) {
    log(LogLevel::Error, msg);
}

pub fn create_module() -> Module {
    let mut module = Module::new();
    FuncRegistration::new("debug").set_into_module(&mut module, log_debug);
    FuncRegistration::new("info").set_into_module(&mut module, log_info);
    FuncRegistration::new("warn").set_into_module(&mut module, log_warn);
    FuncRegistration::new("error").set_into_module(&mut module, log_error);
    module
}
