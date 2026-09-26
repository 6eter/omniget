//! Push-based localization of the prompts the backend seeds.
//!
//! `default_roster()`, the team templates and the help assistant all start from
//! text that the user reads in the roster, so it has to follow the interface
//! language — but the seeds live in Rust, where `$t` is unreachable, and the
//! result is stored in `roster.json` as the user's own data.
//!
//! Same contract as `sync_tray_strings`: no language detection in the backend,
//! the frontend resolves the strings and pushes them on startup and after every
//! locale change. Until the first push the compiled-in English set is used, and
//! existing roster entries are never rewritten — the user may have edited them.

use omniget_core::core::llm::roster_store::{set_prompt_defaults, PromptDefaults};
use serde::Deserialize;

/// The nine prompts for the active locale, as pushed by the frontend.
///
/// One struct instead of nine command arguments: the payload is one object and
/// nine parameters would trip `clippy::too_many_arguments`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptPayload {
    pub omni: String,
    pub builder: String,
    pub scout: String,
    pub template_chief: String,
    pub template_researcher: String,
    pub template_writer: String,
    pub template_em: String,
    pub template_reviewer: String,
    pub help: String,
}

#[tauri::command]
pub fn sync_llm_prompts(prompts: PromptPayload) {
    set_prompt_defaults(PromptDefaults {
        omni: prompts.omni,
        builder: prompts.builder,
        scout: prompts.scout,
        template_chief: prompts.template_chief,
        template_researcher: prompts.template_researcher,
        template_writer: prompts.template_writer,
        template_em: prompts.template_em,
        template_reviewer: prompts.template_reviewer,
        help: prompts.help,
    });
}
