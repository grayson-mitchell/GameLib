//! Quick task 261023-vkv (todo 2026-10-17): deliver notifications through
//! `UNUserNotificationCenter` in a packaged macOS `GameLib.app`.
//!
//! `tauri-plugin-notification` -> notify-rust -> mac-notification-sys talks to the deprecated
//! `NSUserNotificationCenter`. On macOS 26 that path never prompts for permission and never
//! registers the app in System Settings -> Notifications, and the plugin throws the result away,
//! so packaged builds dropped every `notify()` silently (261017-cwf measured it).
//!
//! UN* needs a real signed bundle, so `tauri dev` (an unbundled binary that borrows Terminal's
//! authorization, by the plugin's own design) and any non-`.app` run keep the plugin:
//! [`backend`] gates every entry point, and `currentNotificationCenter` is never called unless
//! it says `UserNotifications`. Failures are returned as the `notification:*` strings from
//! `notification_backend`, which the sidecar logs through `logWarning` (stderr is /dev/null in a
//! packaged build, so `eprintln!` here is dev visibility only).

use std::ptr::NonNull;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, ProtocolObject};
use objc2::{define_class, msg_send, AnyThread};
use objc2_foundation::{NSBundle, NSError, NSObjectProtocol, NSString};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationSettings,
    UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};

use crate::notification_backend::{
    auth_status_from_raw, authorization_gate, select_notification_backend, NotificationBackend,
    NOTIFICATION_COMPLETION_TIMEOUT,
};

static BACKEND: OnceLock<NotificationBackend> = OnceLock::new();
/// NSError text from the startup authorization request, surfaced by `authorization_gate`.
static STARTUP_AUTH_ERROR: OnceLock<String> = OnceLock::new();
static REQUEST_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Which backend this process uses; computed once. This guard is what keeps
/// `currentNotificationCenter` from ever being called outside a real bundle.
pub fn backend() -> NotificationBackend {
    *BACKEND.get_or_init(|| {
        let bundle = NSBundle::mainBundle();
        let identifier = bundle.bundleIdentifier().map(|s| s.to_string());
        let path_is_app = bundle.bundlePath().to_string().ends_with(".app");
        select_notification_backend(tauri::is_dev(), identifier.as_deref(), path_is_app)
    })
}

define_class!(
    // Delegate callbacks arrive on an arbitrary queue, so this is a plain AnyThread class.
    #[unsafe(super(NSObject))]
    struct GameLibNotificationDelegate;

    unsafe impl NSObjectProtocol for GameLibNotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for GameLibNotificationDelegate {
        // Without this, macOS suppresses the banner whenever GameLib is frontmost, and every
        // in-app trigger (Remove shortcuts, ...) fires while it is frontmost.
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion_handler: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion_handler.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }
    }
);

impl GameLibNotificationDelegate {
    fn new() -> Retained<Self> {
        let this = Self::alloc().set_ivars(());
        // SAFETY: `init` on a freshly allocated NSObject subclass with no ivars.
        unsafe { msg_send![super(this), init] }
    }
}

/// Called from `.setup()` on the main thread. Installs the foreground-presentation delegate and
/// fires the one-time `Alert | Sound` authorization request. Does not block.
pub fn init_at_startup() {
    if backend() != NotificationBackend::UserNotifications {
        return;
    }
    let center = UNUserNotificationCenter::currentNotificationCenter();
    let delegate = GameLibNotificationDelegate::new();
    center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    // The center holds its delegate weakly; deliberately leak one process-lifetime reference
    // rather than let a local drop it.
    let _ = Retained::into_raw(delegate);

    let block = RcBlock::new(|granted: Bool, error: *mut NSError| {
        // SAFETY: when non-null, `error` is a valid NSError for the duration of the callback.
        let err = unsafe { error.as_ref() }.map(|e| e.localizedDescription().to_string());
        if let Some(e) = &err {
            let _ = STARTUP_AUTH_ERROR.set(e.clone());
        }
        eprintln!(
            "[shell] notification authorization: granted={} error={:?}",
            granted.as_bool(),
            err
        );
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &block,
    );
}

/// Delivers one notification, blocking for at most two `NOTIFICATION_COMPLETION_TIMEOUT`s.
/// Runs on the dispatch worker thread.
pub fn deliver(title: Option<&str>, body: Option<&str>) -> Result<(), String> {
    if backend() != NotificationBackend::UserNotifications {
        return Err("notification:backend-unavailable".to_string());
    }
    let center = UNUserNotificationCenter::currentNotificationCenter();

    // (1) Live authorization check on every call, so a later toggle in System Settings is honoured.
    let (tx, rx) = mpsc::channel::<isize>();
    let settings_block = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        // SAFETY: the pointer is a valid UNNotificationSettings for the duration of the callback.
        let raw = unsafe { settings.as_ref() }.authorizationStatus().0;
        let _ = tx.send(raw);
    });
    center.getNotificationSettingsWithCompletionHandler(&settings_block);
    let raw = rx
        .recv_timeout(NOTIFICATION_COMPLETION_TIMEOUT)
        .map_err(|_| "notification:settings-timeout".to_string())?;
    authorization_gate(
        auth_status_from_raw(raw),
        STARTUP_AUTH_ERROR.get().map(|s| s.as_str()),
    )?;

    // (2) Content + request.
    let content = UNMutableNotificationContent::new();
    if let Some(t) = title {
        content.setTitle(&NSString::from_str(t));
    }
    if let Some(b) = body {
        content.setBody(&NSString::from_str(b));
    }
    content.setSound(Some(&UNNotificationSound::defaultSound()));
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let id = format!(
        "gamelib-{nanos}-{}",
        REQUEST_COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(&id),
        &content,
        None,
    );

    // (3) Add it.
    let (tx, rx) = mpsc::channel::<Option<String>>();
    let add_block = RcBlock::new(move |error: *mut NSError| {
        // SAFETY: when non-null, `error` is a valid NSError for the duration of the callback.
        let err = unsafe { error.as_ref() }.map(|e| e.localizedDescription().to_string());
        let _ = tx.send(err);
    });
    center.addNotificationRequest_withCompletionHandler(&request, Some(&add_block));
    match rx.recv_timeout(NOTIFICATION_COMPLETION_TIMEOUT) {
        Err(_) => Err("notification:delivery-timeout".to_string()),
        Ok(Some(e)) => Err(format!("notification:delivery-failed: {e}")),
        Ok(None) => Ok(()),
    }
}
