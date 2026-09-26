use reqwest::StatusCode;
use std::time::Duration;

pub const ERR_UNAUTHORIZED: &str = "ERR_UNAUTHORIZED";
pub const ERR_FORBIDDEN: &str = "ERR_FORBIDDEN";
pub const ERR_NOT_FOUND: &str = "ERR_NOT_FOUND";
pub const ERR_RATE_LIMITED: &str = "ERR_RATE_LIMITED";
pub const ERR_UNREACHABLE: &str = "ERR_UNREACHABLE";
pub const ERR_SERVER: &str = "ERR_SERVER";
pub const ERR_BAD_REQUEST: &str = "ERR_BAD_REQUEST";
pub const ERR_NO_SESSION: &str = "ERR_NO_SESSION";

pub fn http_client(timeout: Duration) -> Result<reqwest::Client, String> {
    crate::core::http_client::apply_global_proxy(
        reqwest::Client::builder()
            .user_agent(format!("OmniGet/{}", env!("CARGO_PKG_VERSION")))
            .timeout(timeout),
    )
    .build()
    .map_err(|e| format!("OmniDisc: could not build HTTP client: {}", e))
}

pub fn map_error(status: StatusCode, code: &str) -> String {
    match status {
        StatusCode::UNAUTHORIZED => ERR_UNAUTHORIZED.to_string(),
        StatusCode::FORBIDDEN => with_code(ERR_FORBIDDEN, code),
        StatusCode::NOT_FOUND => ERR_NOT_FOUND.to_string(),
        StatusCode::TOO_MANY_REQUESTS => ERR_RATE_LIMITED.to_string(),
        s if s.is_client_error() => with_code(ERR_BAD_REQUEST, code),
        _ => ERR_SERVER.to_string(),
    }
}

fn with_code(base: &str, code: &str) -> String {
    if code.is_empty() {
        base.to_string()
    } else {
        format!("{}:{}", base, code)
    }
}
