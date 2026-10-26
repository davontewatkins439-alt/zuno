use tauri::{WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;

/// The desktop app is a thin, native shell around the deployed ZUNO web app, so
/// accounts, servers, messages and the owner console stay in the production
/// backend. There is no local database and nothing to sync.
const PRODUCTION_URL: &str = "https://zunoo.freebuff.page";
const DEV_URL: &str = "http://localhost:3000";

/// Native OS notification used by the web client when the window is in the
/// background. Titles and bodies are plain text from ZUNO itself.
#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![notify])
        .setup(|app| {
            let url = if cfg!(debug_assertions) {
                DEV_URL
            } else {
                PRODUCTION_URL
            };

            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url.parse()?))
                .title("ZUNO")
                .inner_size(1320.0, 880.0)
                .min_inner_size(980.0, 640.0)
                .center()
                .initialization_script(
                    "window.__ZUNO_DESKTOP__ = true;\n\
                     window.zunoDesktop = {\n\
                       notify: (title, body) => window.__TAURI__.core.invoke('notify', { title, body }),\n\
                     };",
                )
                .build()?;

            window.show()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ZUNO");
}
