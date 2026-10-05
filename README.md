# DSR Dictation

Hands-free English dictation into a large notepad, with **after-the-fact** spell and grammar
checking, multi-note storage, clipboard export, and text-to-speech playback in a wide choice of
voices. Single-file web app in the DSR house style (gold-on-black), installable as an Android PWA.

> There is also a separate **native Lazarus** "DSR Dictation" desktop app (Whisper + SAPI engines)
> at `C:\Lazarus Projects\DSR Dictation`. This repo is the **web / Android** one.

## Files
| file | purpose |
|------|---------|
| `index.html` | page + styles |
| `app.js` | the app (notes, proofing, read aloud, export, settings) |
| `dsr-speech.js` | **the speech engine** — shared with DSR Notes and DSR Secure Store (this repo is the master copy) |
| `speech-worker.js` | on-device models (transformers.js) off the UI thread — shared too |
| `vendor/` | transformers.js 3.8.1 + its ONNX runtime (.mjs + 21 MB .wasm), self-hosted: same-origin worker threads + offline |
| `_headers` | Cloudflare Pages: COOP/COEP → cross-origin isolation → multi-threaded engine from the first visit |
| `icon.svg` | app / launcher icon (gold microphone on black) |
| `manifest.json` | PWA manifest — includes `share_target` (share text into the app) and `shortcuts` |
| `service-worker.js` | offline cache: app network-first, `vendor/` + jsDelivr dictionaries cache-first |

## Speech engines
Two, switchable in Settings → Dictation:

1. **Google (Web Speech API)** — default. In Chrome (desktop & Android) `SpeechRecognition`
   routes audio to Google's speech service, the same engine as Gboard voice typing. Most
   accurate free option, no API key / backend, and the only one that is truly word-by-word
   real-time. Needs Chrome/Chromium, internet, HTTPS.
2. **Private (on-device)** — transformers.js runs the model entirely on-device (WASM, multi-threaded;
   WebGPU on desktops). Nothing leaves the device. **Moonshine Tiny** (~28 MB, default) / Moonshine
   Base (~63 MB) show live words while you talk; Whisper Tiny / Base / Small are still offered.
   Moonshine's work grows with the length of the phrase, where Whisper always processes a padded
   30 s window: measured on the dev PC (CPU, 4 threads) a 2 s phrase took **0.12 s vs 1.0 s**, an
   11 s clip 0.53 s vs 1.55 s. Mic audio comes through an AudioWorklet; an adaptive noise gate
   cuts phrases at ~0.6 s pauses (clicks/coughs under 0.2 s of voice are dropped).

Everything else — typing, spell check, grammar check, statistics, notes, Read aloud, export —
works **offline** once the app (and, on first use, the ~1 MB dictionary) is cached.

## Features (v1c)
**Dictation**
- **Two engines** (Google online / Whisper offline), selectable per use.
- Large auto-saving memo; **multiple named notes** (new / rename / duplicate / delete / switch /
  **search** / **export all + import** as JSON), each saved to `localStorage`.
- Modes: **Hands-free (continuous)** with auto-restart after pauses, or **Push-to-talk** (hold
  the button). Optional **auto-pause after 10/20/30/60 s of silence**.
- **Input gain** and **noise gate** sliders (drive the Whisper VAD and the level meter; the
  gate level is marked on the meter).
- Live **mic level meter**, interim ("as you speak") text, **screen wake-lock** while dictating.
- **Spoken punctuation & commands** (full list in-app under "? commands"): full stop, comma,
  question mark, new line/paragraph, new bullet, open/close quote, brackets, hyphen/dash/ellipsis,
  `capital <word>`, `all caps <word>`, `caps on` / `caps off`, `scratch that`,
  `delete last word` / `sentence` / `line`, `join lines`, `stop dictation`.
- **Convert spoken numbers to digits** (opt-in): "twenty five" → 25, "three point one four" →
  3.14, "one hundred percent" → 100%. (Ambiguous times like "nine thirty" are a known limitation.)
- Auto-capitalise sentences and stand-alone "I"/"I'm"; smart spacing around punctuation.
- Accent picker (AU/GB/US/NZ/IE/IN/CA/ZA), profanity filter, insert-at-cursor vs append-to-end,
  adjustable note font size.

**After-the-fact proofing**
- **Spelling** — real Hunspell dictionary (AU/GB/US/CA) via `nspell`; suggestions, Ignore, Add,
  and **tap a word to jump to it** in the note. **Personal dictionary persists** across sessions
  and is managed in Settings.
- **Grammar & style** — fast offline checks (double spaces, space before/after punctuation,
  repeated words, a/an, "could of", sentence capitalisation, trailing spaces, missing final
  stop…) + optional **style suggestions** (filler words, possible passive voice, over-long
  sentences) + optional deeper **LanguageTool** online check. Per-item Fix, **overlap-safe
  Fix-all**, tap-to-jump.
- **Find & replace** (match case / whole word / replace all).
- **Statistics** — words, characters, sentences, paragraphs, avg words/sentence, Flesch reading
  ease, speaking & reading time.

**Read aloud**
- Every installed `speechSynthesis` voice, grouped by language (☁ = online voice);
  rate / pitch / volume; Play / From-cursor / Pause / Stop; **word-highlight follow-along**;
  reads just the selection if text is highlighted.

**Export & edit**
- Copy all, Copy & clear, Web Share, Paste in, Download **.txt** / **.md**, **Print**.
- Reformat: Sentence case / lower / UPPER / Title Case, tidy spaces, remove blank lines,
  straighten quotes, insert date-time.
- Session **Undo / Redo** (50 deep) + native Ctrl+Z.
- Drop a `.txt` / `.md` file onto the note to load it.

**Keyboard**: Ctrl+Space toggle dictation · Esc stop · Ctrl+Z / Ctrl+Y undo/redo ·
Ctrl+F find · Ctrl+S download · Ctrl+Enter read aloud.

**PWA**: `?debug=1` exposes internal helpers on `window.DSRDICT` for testing. Manifest
`share_target` lets you share text from other apps into a new note; `shortcuts` give
"New note" and "Start dictation" long-press actions.

## New in 3a (rewrite)
- Engine split out into `dsr-speech.js` + `speech-worker.js`, shared with DSR Notes / Secure Store.
- Moonshine models (default private engine), live words for the private engine, warm start
  (an already-downloaded model loads as the app opens), AudioWorklet capture.
- Leaves out um / uh / er; **My words** (say a phrase → any text, or fix a misheard name);
  new commands: `replace X with Y`, `insert date` / `insert time`, `read that back`, `undo` / `redo`.
- **Punctuation bar** while listening (. , ? ! ↵ ¶ delete-word scratch).
- **🎧 Audio file**: transcribe a voice memo / mp3 / m4a on the device (cut at pauses, ≤20 s pieces).
- Optional **recording** of each dictation, kept with the note (IndexedDB), play / save / delete.
- Efficiency: one localStorage key per note (was: all notes re-serialised on every save), word count
  debounced, undo memory capped for long notes, service worker `no-cache` network-first,
  COOP/COEP from `_headers`.

## Done in v1c (was backlog)
- Offline **Whisper engine** (transformers.js) with tiny/base/small model choice.
- Mic **input-gain / noise-gate** sliders with the gate marked on the meter.
- **Persistent personal spelling dictionary** (managed in Settings).
- Notes **search** + **export/import all** as JSON.
- Grammar **style suggestions** (filler / passive / long sentence), opt-in.

## Backlog / roadmap
- Grammar: subject–verb agreement, comma-splice and run-on detection; a proper (non-heuristic)
  offline grammar model.
- Notes: tags / folders; optional cloud sync via a private Worker (as DSR Dashboard does).
- Wider TTS voices: bundled **Piper** neural voices, or Edge/Azure neural voices via a Worker.
- Number words: better handling of times ("nine thirty"), years, ordinals, phone numbers, currency.
- Whisper: WebGPU auto-detect + toggle; overlap tuning; word-level timestamps for follow-along;
  optional multilingual model.
- Punctuation-restoration model for engines that return unpunctuated text.
- "Read along" that scrolls and highlights in a rendered overlay (not just textarea selection).
- Language auto-detect; multi-language dictation switching mid-note.

## Hosting
Per the usual DSR pattern: create a repo on the `100dsr100-sketch` GitHub account, push these
files to the repo root, enable GitHub Pages on the default branch. Then open in Chrome on
Android and "Add to Home screen".

## Microphone note
The Web Speech API always uses the **system default** microphone — an app cannot choose a
specific device. Settings → Microphone lists the detected inputs and has a **Test microphone**
button (3-second level check). For best accuracy: a headset, or the phone 15–20 cm away, in a
quiet room, speaking at a steady pace; set the preferred mic as the OS default.
