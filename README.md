# DSR Dictation

Hands-free English dictation into a large notepad, with **after-the-fact** spell and grammar
checking, clipboard export, and text-to-speech playback in a wide choice of voices.
Single-file web app in the DSR house style (gold-on-black), installable as an Android PWA.

## Files
| file | purpose |
|------|---------|
| `index.html` | the whole app (UI + logic, no build step) |
| `icon.svg` | app / launcher icon (gold microphone on black) |
| `manifest.json` | PWA manifest |
| `service-worker.js` | offline shell cache + cache-first for the jsDelivr spell dictionaries |

## Speech engine
Live dictation uses the browser **Web Speech API** (`SpeechRecognition`). In Chrome — desktop
and Android — this routes audio to **Google's speech service**, which is the most accurate
speech-to-text you can use for free with no API key and no backend, and the only option that is
genuinely real-time on a phone. Requirements: Chrome/Chromium, an internet connection, HTTPS.

Everything else — typing, spell check, grammar check, Read aloud, export — works **offline**
once the app (and, on first use, the ~1 MB dictionary) has been cached.

*Possible follow-up:* a selectable offline engine (Whisper via `transformers.js` / WebGPU) for
private, no-cloud transcription at the cost of a model download and chunked (non-instant) results.

## Features
- Big auto-saving memo (localStorage); survives reload/close.
- Start / Pause / Resume / Stop, live mic level meter, interim ("as you speak") text.
- "Keep listening after pauses" — auto-restarts recognition so long dictation doesn't drop.
- Spoken punctuation & commands (toggle): *full stop, comma, question mark, new line,
  new paragraph, new bullet, open/close quote, capital <word>, all caps <word>*;
  *"scratch that"* removes the last insert; *"stop dictation"* pauses.
- Auto-capitalise sentences & stand-alone "i", smart spacing around punctuation.
- Accent picker (en-AU/GB/US/NZ/IE/IN/CA/ZA), profanity filter, screen wake-lock,
  insert-at-cursor vs append-to-end, adjustable note font size.
- **Spelling** (nspell + Hunspell dictionary, en-AU/GB/US/CA) — on demand, with suggestions,
  Ignore, Add-to-dictionary.
- **Grammar & style** — fast offline checks (double spaces, space-before-punctuation,
  missing space after punctuation, repeated words, a/an, could-of, sentence capitalisation,
  trailing spaces, missing terminal stop…) plus optional deeper check via LanguageTool
  (online, opt-in). Per-item Fix or Fix-all.
- **Read aloud** — every `speechSynthesis` voice, grouped by language; rate / pitch / volume;
  Play / Pause / Stop; word-highlight follow-along; reads the selection if text is highlighted.
- **Export** — Copy all, Copy & clear, Web Share, Download .txt.
- **Edit tools** — Sentence case / lower / UPPER / Title Case, tidy spaces, remove blank lines,
  straighten quotes, insert date-time.
- Session Undo (button + native Ctrl+Z). Ctrl+Space toggles dictation, Esc stops.

## Hosting
Per the usual DSR pattern: create a repo on the `100dsr100-sketch` GitHub account, push these
files to the repo root, enable GitHub Pages on the default branch. Then open in Chrome on
Android and "Add to Home screen".

## Microphone note
The Web Speech API always uses the **system default** microphone — an app cannot choose a
specific device. Settings → Microphone lists the detected inputs and has a **Test microphone**
button (3-second level check). For best accuracy: a headset, or the phone 15–20 cm away, in a
quiet room, speaking at a steady pace; set the preferred mic as the OS default.
