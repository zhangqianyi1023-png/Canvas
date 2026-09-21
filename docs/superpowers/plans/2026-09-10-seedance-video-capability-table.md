# Seedance 2.0 / Mini / Fast / 2.5 Video Capability Table

**Goal:** Build a provider-neutral video model capability table for Seedance 2.0, Seedance 2.0 Mini, Seedance 2.0 Fast, and Seedance 2.5 before adding APIMart, KKPart, or other relay-specific adapters.

**Conclusion:** Seedance capability should be stored as model-family data. APIMart, KKPart, and future relays should only translate field names, endpoints, uploads, and task polling formats.

---

## 1. Why This Is Needed

Current video generation has only small hard-coded Seedance 2.0 logic inside `backend/nodes/video.py`:

| Current logic | Risk |
|---|---|
| Model name starts with `doubao-seedance-2.0` | Seedance 2.5 and relay aliases are not recognized |
| Duration must be 4-15 seconds | Correct for Seedance 2.0 public model card, but may be too narrow for Seedance 2.5 |
| `size` receives aspect ratio for Seedance 2.0 | This is relay/request-shape logic, not model capability |
| Resolution handling is hand-written in `VideoNode` | It does not know that Seedance 2.0 supports `4k`, while Mini/Fast only support `480p` and `720p` |

This is enough for one relay and one model version, but it will become fragile when the same model is sold through APIMart today and KKPart tomorrow.

---

## 2. Source Status

| Source | What it confirms | Confidence |
|---|---|---|
| Seedance 2.0 arXiv model card | Released early February 2026; direct generation duration 4-15 seconds; native output 480p/720p; open platform reference limit up to 3 videos, 9 images, 3 audio clips; text/image/audio/video input modalities | High |
| BytePlus Model list | Confirms four target model IDs: `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-mini-260615`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-5-260628`; confirms per-model resolution, frame rate, duration, and output format | High |
| BytePlus Create video generation task API | Confirms canonical request fields: `model`, `content`, `resolution`, `ratio`, `duration`, optional `frames`, `generate_audio`, and 2.5 task-type constraints | High |
| BytePlus Dreamina Seedance 2.0 / 2.5 tutorials | Confirm reference-to-video, image-to-video, text-to-video, video editing/extension, audio generation, and portrait compliance constraints | High |
| ByteDance Seedance 2.5 product page | Seedance 2.5 is positioned as a longer, more capable audio-video generation model; public marketing mentions longer duration up to 30 seconds | Medium |
| APIMart / KKPart relay docs | Needed for exact endpoint, field names, task response shape, and any relay-specific restrictions | Not confirmed in repo |

---

## 3. Canonical Capability Fields

This is the neutral shape we should use in code. It should describe the model, not the relay.

| Field | Meaning | Example |
|---|---|---|
| `key` | Internal model-family key | `seedance-2.0` |
| `label` | Human-readable name | `Seedance 2.0` |
| `aliases` | Model IDs or relay aliases that map to this family | `doubao-seedance-2.0`, `dreamina-seedance-2-5-260628` |
| `modes` | Supported generation modes | `textToVideo`, `imageToVideo`, `firstLastFrame`, `videoEdit`, `videoExtend`, `omniReference` |
| `durations` | Supported durations or min/max | `min=4`, `max=15` |
| `ratios` | Supported aspect ratios | `16:9`, `9:16`, `1:1`, `adaptive` |
| `resolutions` | Supported output resolution labels | `480p`, `720p`, `4k` |
| `referenceLimits` | Max image/video/audio references | `images=9`, `videos=3`, `audio=3` |
| `supportsAudioOutput` | Whether generated video can include audio | `true` |
| `supportsPromptAssetRefs` | Whether prompts can refer to `Image 1`, `Video 1`, `Audio 1` | `true` |
| `inputComplianceNotes` | Important product safety constraints | Real portrait uploads may need trusted/authorized workflows |

---

## 4. Four-Model Capability Table

This table is the model-family source of truth. It should not contain APIMart-only or KKPart-only field names.

| Model | Canonical key | Confirmed model ID | Modes | Resolution | FPS | Duration | Output | Reference limits |
|---|---|---|
| Seedance 2.0 | `seedance-2.0` | `dreamina-seedance-2-0-260128` | Text-to-video, first-frame image-to-video, first-and-last-frame image-to-video, reference-to-video, video edit, video extend | `480p`, `720p`, `1080p`, `4k`; default `720p` | 24 fps | `[4, 15]` seconds or `-1`; default `5` | `.mp4`, `.mov` when relay supports it | 2.0 series omni reference: images 0-9, videos 0-3, audio 0-3; audio-only input is not supported |
| Seedance 2.0 Mini | `seedance-2.0-mini` | `dreamina-seedance-2-0-mini-260615` | Text-to-video, first-frame image-to-video, first-and-last-frame image-to-video, reference-to-video, video edit, video extend | `480p`, `720p`; default `720p` | 24 fps | `[4, 15]` seconds or `-1`; default `5` | `.mp4` | Same 2.0 series omni reference limits unless provider says otherwise |
| Seedance 2.0 Fast | `seedance-2.0-fast` | `dreamina-seedance-2-0-fast-260128` | Text-to-video, first-frame image-to-video, first-and-last-frame image-to-video, reference-to-video, video edit, video extend | `480p`, `720p`; default `720p` | 24 fps | `[4, 15]` seconds or `-1`; default `5` | `.mp4` | Same 2.0 series omni reference limits unless provider says otherwise |
| Seedance 2.5 | `seedance-2.5` | `dreamina-seedance-2-5-260628` | Text-to-video, first-frame image-to-video, first-and-last-frame image-to-video, reference-to-video, video edit, video extend | `480p`, `720p`, `1080p`; default `720p` | 24 fps | `[4, 30]` seconds or `-1`; default `-1` | `.mp4`, `.mov` when relay supports it | Omni reference: images 0-30, videos 0-10, audio 0-10; audio-only input is supported |

---

## 5. Ratio and Pixel Table

All four target models share the same canonical ratio values, but different resolutions map to different pixels.

| Ratio value | Meaning |
|---|---|
| `adaptive` | Model chooses ratio from task type and input |
| `16:9` | Landscape |
| `4:3` | Landscape |
| `1:1` | Square |
| `3:4` | Portrait |
| `9:16` | Vertical video |
| `21:9` | Wide cinematic |

| Resolution | Ratio | Seedance 2.5 pixels | Seedance 2.0 series pixels |
|---|---|---|---|
| `480p` | `16:9` | `854x480` | `864x496` |
| `480p` | `4:3` | `752x560` | `752x560` |
| `480p` | `1:1` | `640x640` | `640x640` |
| `480p` | `3:4` | `560x752` | `560x752` |
| `480p` | `9:16` | `480x854` | `496x864` |
| `480p` | `21:9` | `992x432` | `992x432` |
| `720p` | `16:9` | `1280x720` | `1280x720` |
| `720p` | `4:3` | `1112x834` | `1112x834` |
| `720p` | `1:1` | `960x960` | `960x960` |
| `720p` | `3:4` | `834x1112` | `834x1112` |
| `720p` | `9:16` | `720x1280` | `720x1280` |
| `720p` | `21:9` | `1470x630` | `1470x630` |
| `1080p` | `16:9` | `1920x1080` | `1920x1080` |
| `1080p` | `4:3` | `1664x1248` | `1664x1248` |
| `1080p` | `1:1` | `1440x1440` | `1440x1440` |
| `1080p` | `3:4` | `1248x1664` | `1248x1664` |
| `1080p` | `9:16` | `1080x1920` | `1080x1920` |
| `1080p` | `21:9` | `2206x946` | `2206x946` |
| `4k` | `16:9` | Not supported | `3840x2160` |
| `4k` | `4:3` | Not supported | `3326x2494` |
| `4k` | `1:1` | Not supported | `2880x2880` |
| `4k` | `3:4` | Not supported | `2494x3326` |
| `4k` | `9:16` | Not supported | `2160x3840` |
| `4k` | `21:9` | Not supported | `4398x1886` |

Important 2.5 ratio rules:

| Task type | 2.5 ratio behavior |
|---|---|
| Text-to-video | Supports `adaptive` or a specified ratio |
| Reference-to-video | Supports `adaptive` or a specified ratio |
| First-frame / first-and-last-frame image-to-video | Defaults to and only supports `adaptive`; it preserves the first-frame image ratio |
| Video editing / extension | Defaults to and only supports `adaptive`; it preserves the selected video ratio |

---

## 6. Old Logic vs Correct Logic

The old logic is roughly:

| Step | Old behavior |
|---|---|
| 1 | User selects provider and model |
| 2 | Backend guesses protocol from `provider_id`, Base URL, or request protocol |
| 3 | If URL contains APIMart, force `apimart` |
| 4 | `VideoNode.submit` checks a few hard-coded model names |
| 5 | Adapter sends request in that relay's shape |

The problem is step 4: model capability is mixed into the business node. This makes Seedance 2.5, Mini, Fast, APIMart, and KKPart easy to tangle together.

The correct logic should be:

| Order | Layer | Plain meaning | Example |
|---|---|---|---|
| 1 | Official model capability | First ask: can this model do it? | Seedance 2.5 supports 4-30 seconds |
| 2 | User/provider selection | Then ask: which relay are we using? | APIMart today, KKPart tomorrow |
| 3 | Relay adapter | Translate the same standard request into that relay's request body | Official `ratio` may become APIMart `size` if APIMart requires it |
| 4 | Relay override | If the relay has stricter limits, narrow the allowed values | KKPart might expose only 720p for a model |
| 5 | Request/response parser | Send, poll, and normalize the result back into our app's standard format | `task_id`, `status`, `video_url` |

So the answer to the product question is: yes, start from the official capability standard, then let the selected relay adapter translate it. But a relay override should only make things narrower or map fields; it should not become the source of truth for what Seedance 2.0 or 2.5 fundamentally supports.

---

## 7. Recommended Code Shape

Do not put these rules directly in `VideoNode.submit`. Add a video capability module first.

```python
VideoModelSpec(
    key="seedance-2.0",
    label="Seedance 2.0",
    aliases=(
        "dreamina-seedance-2-0-260128",
        "dreamina-seedance-2-0",
        "doubao-seedance-2.0",
    ),
    modes=("text_to_video", "image_to_video", "first_last_frame", "video_edit", "video_extend", "omni_reference"),
    ratios=("adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"),
    resolutions=("480p", "720p", "1080p", "4k"),
    min_duration=4,
    max_duration=15,
    default_duration=5,
    default_resolution="720p",
    max_reference_images=9,
    max_reference_videos=3,
    max_reference_audio=3,
    supports_audio_output=True,
)
```

```python
VideoModelSpec(
    key="seedance-2.0-mini",
    label="Seedance 2.0 Mini",
    aliases=(
        "dreamina-seedance-2-0-mini-260615",
        "dreamina-seedance-2-0-mini",
        "doubao-seedance-2.0-mini",
    ),
    modes=("text_to_video", "image_to_video", "first_last_frame", "video_edit", "video_extend", "omni_reference"),
    ratios=("adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"),
    resolutions=("480p", "720p"),
    min_duration=4,
    max_duration=15,
    default_duration=5,
    default_resolution="720p",
    max_reference_images=9,
    max_reference_videos=3,
    max_reference_audio=3,
    supports_audio_output=True,
)
```

```python
VideoModelSpec(
    key="seedance-2.0-fast",
    label="Seedance 2.0 Fast",
    aliases=(
        "dreamina-seedance-2-0-fast-260128",
        "dreamina-seedance-2-0-fast",
        "doubao-seedance-2.0-fast",
    ),
    modes=("text_to_video", "image_to_video", "first_last_frame", "video_edit", "video_extend", "omni_reference"),
    ratios=("adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"),
    resolutions=("480p", "720p"),
    min_duration=4,
    max_duration=15,
    default_duration=5,
    default_resolution="720p",
    max_reference_images=9,
    max_reference_videos=3,
    max_reference_audio=3,
    supports_audio_output=True,
)
```

```python
VideoModelSpec(
    key="seedance-2.5",
    label="Seedance 2.5",
    aliases=(
        "dreamina-seedance-2-5-260628",
        "dreamina-seedance-2-5",
        "doubao-seedance-2.5",
        "doubao-seedance-2-5",
    ),
    modes=("text_to_video", "image_to_video", "first_last_frame", "video_edit", "video_extend", "omni_reference"),
    ratios=("adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"),
    resolutions=("480p", "720p", "1080p"),
    min_duration=4,
    max_duration=30,
    default_duration=-1,
    default_resolution="720p",
    max_reference_images=30,
    max_reference_videos=10,
    max_reference_audio=10,
    supports_audio_output=True,
    supports_audio_only_reference=True,
)
```

---

## 8. Relay Adapter Split

| Layer | APIMart today | KKPart tomorrow |
|---|---|---|
| Model capability | Same `seedance-2.0` / `seedance-2.5` table | Same table |
| Request endpoint | APIMart adapter decides | KKPart adapter decides |
| Ratio field | Example: `size` or relay-specific field | Example: `aspect_ratio`, `ratio`, or relay-specific field |
| Reference upload | APIMart adapter uploads or forwards references | KKPart adapter uploads or forwards references |
| Task polling | APIMart response parser | KKPart response parser |
| Provider override | APIMart-specific clamps | KKPart-specific clamps |

Practical rule: switching APIMart to KKPart should change only `protocol` and adapter behavior, not the user's node data or the canonical model capability table.

---

## 9. Open Questions Before Implementation

| Question | Why it matters |
|---|---|
| What exact model IDs does APIMart expose for Seedance 2.0 and 2.5? | Needed for `aliases` |
| What exact model IDs does KKPart expose? | Needed before adding `kkpart` adapter |
| Does APIMart expose the exact official model IDs or aliases? | Determines alias map and UI labels |
| Does KKPart expose the exact official model IDs or aliases? | Determines alias map and UI labels |
| Does APIMart accept official `ratio` directly, or does it require `size`? | Adapter translation |
| Does KKPart use `ratio`, `aspect_ratio`, `size`, or pixel dimensions? | Adapter translation |
| Does each relay support 2.5 audio-only reference? | Determines provider override |
| Does each relay support `.mov`, or only `.mp4`? | Determines provider override |
| Are real-person portrait assets blocked, allowed, or require special authorization? | Product safety and user messaging |

---

## 10. Minimal Implementation Plan

| Step | Change | Scope |
|---|---|---|
| 1 | Add `backend/video_model_capabilities.py` with Seedance 2.0 and tentative Seedance 2.5 specs | Backend only |
| 2 | Add tests for model lookup, duration validation, reference limits, and aliases | Backend tests |
| 3 | Add `videoModelCapabilities` to runtime provider settings, similar to `imageModelCapabilities` | Backend + frontend settings |
| 4 | Refactor `VideoNode.submit` to call capability helpers instead of hard-coded Seedance checks | Backend only |
| 5 | Keep APIMart request translation in `APIMartAdapter`, add KKPart adapter only after seeing real API examples | Provider layer only |
| 6 | Show video duration/ratio/resolution options from capabilities in the generator UI | Frontend only |

---

## 11. Source Links

- Seedance 2.0 model card: https://arxiv.org/abs/2604.14148
- BytePlus Model list: https://docs.byteplus.com/en/docs/modelark/1330310
- BytePlus Create video generation task API: https://docs.byteplus.com/en/docs/modelark/1520757
- BytePlus Dreamina Seedance 2.0 tutorial: https://docs.byteplus.com/en/docs/modelark/2291680
- BytePlus Dreamina Seedance 2.5 tutorial: https://docs.byteplus.com/en/docs/modelark/2607688
- ByteDance Seedance 2.5 product page: https://seed.bytedance.com/en/seedance25
