use rhai::Module;
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

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
    *LOG_LEVEL.lock().unwrap() = new_level;
}

fn log(level: LogLevel, msg: &str) {
    let current = *LOG_LEVEL.lock().unwrap();
    if level < current {
        return;
    }
    match level {
        LogLevel::Debug => web_sys::console::debug_1(&JsValue::from_str(msg)),
        LogLevel::Info => web_sys::console::info_1(&JsValue::from_str(msg)),
        LogLevel::Warn => web_sys::console::warn_1(&JsValue::from_str(msg)),
        LogLevel::Error => web_sys::console::error_1(&JsValue::from_str(msg)),
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
    module.register_fn("debug", log_debug);
    module.register_fn("info", log_info);
    module.register_fn("warn", log_warn);
    module.register_fn("error", log_error);
    module
}
