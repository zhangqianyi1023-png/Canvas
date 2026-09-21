# Model Capability and Relay Layer Table

**Goal:** Separate "what a model family supports" from "how a relay platform forwards requests" so Gemini, APIMart, and future custom relays do not get mixed together.

**Conclusion:** Capability belongs to the model family. Translation belongs to the relay. Special differences belong to an override layer.

---

## 1. Current Situation

| Layer | What it currently does | Where it lives now | Main risk |
|---|---|---|---|
| Official model capability table | Stores supported ratios, resolutions, reference-image limits, and edit support | `backend/apimart_image_models.py` | The name is APIMart-specific, so it feels like a relay table even when it is really a model-family capability table |
| APIMart relay adapter | Uploads local references and forwards image requests to APIMart | `backend/providers/apimart.py` | If the request does not reach this adapter, Gemini-specific rules are lost |
| OpenAI-compatible relay adapter | Converts ratio values into pixel sizes for OpenAI-style image endpoints | `backend/providers/openai_compatible.py` | Gemini does not always accept pixel sizes, so `768x1024` can become a bad request |
| Protocol routing | Chooses which adapter runs from `api_protocol` and `baseUrl` | `backend/main.py`, `backend/providers/registry.py` | If routing is wrong, the request uses the wrong translation rules |

## 2. Target Structure

| Layer | Responsibility | Example input | Example output |
|---|---|---|---|
| Official capability base | Define what a model family supports, independent of any relay | `gemini-3-pro-image-preview` | Ratios, resolutions, reference limits, edit support |
| Relay adapter | Translate the standard request into a provider's own API shape | APIMart | `size`, `resolution`, `image_url`, `mask_url`, endpoint path |
| Relay override map | Handle one relay's special mismatch without changing the base capability table | A custom APIMart variant | Small field remaps or exceptions only |

## 3. How This Should Work

| Step | Decision |
|---|---|
| 1 | Pick the model family first |
| 2 | Look up the official capability table for that family |
| 3 | Pick the relay by `api_protocol` and `baseUrl` |
| 4 | Apply relay-specific field translation |
| 5 | Apply override rules only if that relay has a known exception |

## 4. What Went Wrong This Time

| Symptom | Likely cause |
|---|---|
| Gemini returned "unsupported image aspect ratio `768:1024`" | The request was translated into a pixel size instead of staying as a ratio |
| APIMart was the configured provider | The provider name was probably not the issue by itself |
| The same model name behaved differently across paths | The request likely hit the wrong adapter or the wrong translation layer |

## 5. Practical Rule

| Rule | Meaning |
|---|---|
| Model family decides capability | "What can this model do?" |
| Relay decides transport | "How do we send it?" |
| Override decides exceptions | "What is special about this platform?" |

## 6. Recommended Next Change

| Priority | Change |
|---|---|
| High | Rename the current capability table so it no longer looks APIMart-only |
| High | Keep APIMart as a relay adapter, not as the source of truth for model capability |
| Medium | Add a small override layer for custom relay differences |
| Medium | Add tests for "official ratio" vs "relay pixel-size" behavior |
