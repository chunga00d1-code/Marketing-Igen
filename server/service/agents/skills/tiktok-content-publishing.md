# TikTok Content Publishing Runtime Skill

TikTok slots are video-only. The caption (`bodyText`) is Vietnamese caption text plus hashtags and must be no longer than 2,200 characters; `outline` is the storyboard and `voiceScript` is narration. Never put scene directions into the caption or silently truncate it.

Require a completed, reachable MP4, MOV, or WebM before approval or publish. Reject AVI. A Drive item with an extensionless name is valid only when its probed MIME is a supported video MIME. Images and text-only fallbacks are invalid for TikTok.

Keep the lifecycle ordered: prepare content and media -> `pending_approval` -> authenticated review with creator privacy/duration/consent options -> `ready_to_publish` -> due publish worker with an atomic lease -> TikTok Direct Post -> `processing` until `PUBLISH_COMPLETE` webhook -> `published`. Persist provider IDs, URL, transitions, errors, and retry state.

Before Direct Post, re-query creator info, use only the creator's available privacy levels, enforce max duration, and require explicit consent. Never approve TikTok through generic public Facebook-style links because those links cannot collect TikTok publish options.
