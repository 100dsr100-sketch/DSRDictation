(function(){
"use strict";
var $ = function(s){ return document.querySelector(s); };
var LS = window.localStorage;
function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); }

/* ---------- settings ---------- */
var DEF = {
  engine:"web", model:window.DsrSpeech.DEFAULT_MODEL, micGain:1, noiseGate:0.012,
  mode:"continuous", lang:"en-AU", silence:0, punct:true, numbers:false, cap:true, interim:true,
  continuous:true, profanity:false, wake:true, insertAtCursor:false, dict:"en-au", font:18,
  ttsVoice:"", ttsRate:1, ttsPitch:1, ttsVol:1, ttsFollow:true, useLT:false, style:false,
  fillers:true, keepAudio:false, phrases:[]
};
var S = load();
/* 3a: "whisper" engine -> "private"; Whisper Tiny/Base -> Moonshine Tiny (about 9x quicker per phrase on the
   CPU, and words appear while you talk). Whisper models stay available in Settings. */
if(S.engine === "whisper") S.engine = "private";
if(S.whisperModel){ S.model = /small/.test(S.whisperModel) ? S.whisperModel : DEF.model; delete S.whisperModel; save(); }
if(!Array.isArray(S.phrases)) S.phrases = [];
function load(){ try{ return Object.assign({}, DEF, JSON.parse(LS.getItem("dsrdict.cfg")||"{}")); }catch(e){ return Object.assign({}, DEF); } }
function save(){ try{ LS.setItem("dsrdict.cfg", JSON.stringify(S)); }catch(e){} }

var memo = $("#memo");

/* ---------- notes store ----------
   3a: an index (dsrdict.idx) plus one key per note (dsrdict.n.<id>). Every save while dictating used to
   re-serialise ALL notes into one string; now only the note being edited is written. */
var notes = [], curId = null, storeWarned = false;
function lsPut(k, v){
  try{ LS.setItem(k, v); return true; }
  catch(e){ if(!storeWarned){ storeWarned = true; toast("Storage is full – export your notes (Notes → Export all)"); } return false; }
}
function persistIndex(){
  lsPut("dsrdict.idx", JSON.stringify(notes.map(function(n){ return { id:n.id, name:n.name, created:n.created, updated:n.updated }; })));
  lsPut("dsrdict.curNote", curId);
}
function persistNote(n){ lsPut("dsrdict.n." + n.id, n.text || ""); }
function persistNotes(){ notes.forEach(persistNote); persistIndex(); }
function loadNotes(){
  var idx = null;
  try{ idx = JSON.parse(LS.getItem("dsrdict.idx") || "null"); }catch(e){}
  if(Array.isArray(idx)){
    notes = idx.map(function(m){ var t = ""; try{ t = LS.getItem("dsrdict.n." + m.id) || ""; }catch(e){} return Object.assign({}, m, { text: t }); });
  } else {
    try{ notes = JSON.parse(LS.getItem("dsrdict.notes") || LS.getItem("dsrdict.notes-before-3a") || "[]"); }catch(e){ notes = []; }
    if(Array.isArray(notes) && notes.length){
      persistNotes();
      // the old all-in-one copy is kept, renamed, as a backup of the move to per-note storage
      try{ LS.setItem("dsrdict.notes-before-3a", LS.getItem("dsrdict.notes")); LS.removeItem("dsrdict.notes"); }catch(e){}
    }
  }
  try{ curId = LS.getItem("dsrdict.curNote") || null; }catch(e){}
  if(!Array.isArray(notes) || !notes.length){
    var legacy = "";
    try{ legacy = LS.getItem("dsrdict.text") || ""; }catch(e){}
    notes = [{ id: uid(), name: nameFrom(legacy), text: legacy, created: Date.now(), updated: Date.now() }];
    curId = notes[0].id;
    persistNotes();
  }
  if(!getNote(curId)) curId = notes[0].id;
  memo.value = getNote(curId).text || "";
  paintNoteName();
}
function uid(){ return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function getNote(id){ for(var i=0;i<notes.length;i++) if(notes[i].id===id) return notes[i]; return null; }
function nameFrom(t){ var l=(t||"").split("\n").find(function(x){ return x.trim(); }); return l ? l.trim().slice(0,40) : "Untitled"; }
var saveTextT;
function saveText(){
  clearTimeout(saveTextT);
  $("#stSaved").textContent = "…";
  saveTextT = setTimeout(function(){
    var n = getNote(curId);
    if(n){ n.text = memo.value; n.updated = Date.now(); if(n.name === "Untitled" || !n.name) n.name = nameFrom(memo.value); persistNote(n); persistIndex(); paintNoteName(); }
    $("#stSaved").textContent = "Saved";
    setTimeout(function(){ if($("#stSaved").textContent==="Saved") $("#stSaved").textContent=""; }, 1500);
  }, 350);
}
function paintNoteName(){ var n=getNote(curId); $("#noteName").textContent = n ? (n.name||"Untitled") : "Untitled"; }
function switchNote(id){
  clearTimeout(saveTextT);
  var n = getNote(curId); if(n && n.text !== memo.value){ n.text = memo.value; n.updated = Date.now(); persistNote(n); }
  curId = id; persistIndex();
  memo.value = getNote(curId).text || "";
  undoStack = []; redoStack = [];
  onMemoChanged(); paintNoteName(); renderNotes();
  toast("Opened “" + (getNote(curId).name||"Untitled") + "”");
}
function renderNotes(){
  var box = $("#notesList"); box.innerHTML = "";
  var q = ($("#notesSearch").value || "").toLowerCase().trim();
  var list = notes.slice().sort(function(a,b){ return b.updated - a.updated; });
  if(q) list = list.filter(function(n){ return (n.name||"").toLowerCase().indexOf(q) >= 0 || (n.text||"").toLowerCase().indexOf(q) >= 0; });
  if(!list.length){ box.innerHTML = "<div class='empty' style='color:var(--gold-deep);padding:8px 2px'>No matching notes.</div>"; return; }
  list.forEach(function(n){
    var row = document.createElement("div"); row.className = "nrow" + (n.id===curId ? " active" : "");
    var info = document.createElement("div"); info.className = "info";
    info.innerHTML = "<div class='nm'>" + esc(n.name||"Untitled") + "</div><div class='pv'>" + esc((n.text||"").replace(/\s+/g," ").slice(0,60) || "(empty)") + "</div><div class='dt'>" + new Date(n.updated).toLocaleString() + "</div>";
    info.addEventListener("click", function(){ if(n.id!==curId) switchNote(n.id); });
    row.appendChild(info);
    var dup = document.createElement("button"); dup.className = "mini"; dup.title = "Duplicate"; dup.dataset.l = "Copy"; dup.textContent = "⧉";
    dup.addEventListener("click", function(){ var c={ id:uid(), name:(n.name||"Untitled")+" copy", text:n.text, created:Date.now(), updated:Date.now() }; notes.push(c); persistNote(c); persistIndex(); renderNotes(); });
    var del = document.createElement("button"); del.className = "mini"; del.title = "Delete"; del.dataset.l = "Delete"; del.textContent = "🗑";
    del.addEventListener("click", function(){
      if(notes.length===1){ toast("Can't delete the only note"); return; }
      if(!confirm("Delete “" + (n.name||"Untitled") + "” and any recordings kept with it?")) return;
      notes = notes.filter(function(x){ return x.id!==n.id; });
      try{ LS.removeItem("dsrdict.n." + n.id); }catch(e){}
      deleteRecordingsOf(n.id);
      if(curId===n.id){ curId = notes[0].id; memo.value = getNote(curId).text||""; undoStack=[]; redoStack=[]; onMemoChanged(); paintNoteName(); }
      persistIndex(); renderNotes();
    });
    row.appendChild(dup); row.appendChild(del);
    box.appendChild(row);
  });
}
$("#btnNewNote").addEventListener("click", function(){
  clearTimeout(saveTextT);
  var n = getNote(curId); if(n && n.text !== memo.value){ n.text = memo.value; n.updated = Date.now(); persistNote(n); }
  var fresh = { id: uid(), name: "Untitled", text: "", created: Date.now(), updated: Date.now() };
  notes.push(fresh); curId = fresh.id; persistNote(fresh); persistIndex();
  memo.value = ""; undoStack=[]; redoStack=[]; onMemoChanged(); paintNoteName(); renderNotes();
  toast("New note");
});
$("#notesSearch").addEventListener("input", renderNotes);
$("#btnNotesExport").addEventListener("click", function(){
  var n = getNote(curId); if(n) n.text = memo.value;
  var blob = new Blob([JSON.stringify({ app:"DSR Dictation", exported:new Date().toISOString(), notes:notes }, null, 2)], { type:"application/json" });
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "dsr-dictation-notes-" + stamp() + ".json";
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
});
$("#btnNotesImport").addEventListener("click", function(){ $("#notesImportFile").click(); });
$("#notesImportFile").addEventListener("change", function(){
  var file = this.files && this.files[0]; if(!file) return;
  file.text().then(function(txt){
    var data; try{ data = JSON.parse(txt); }catch(e){ toast("Not a valid JSON file"); return; }
    var incoming = Array.isArray(data) ? data : (data && data.notes);
    if(!Array.isArray(incoming) || !incoming.length){ toast("No notes found in that file"); return; }
    var added = 0;
    incoming.forEach(function(n){
      if(!n || typeof n.text !== "string") return;
      notes.push({ id: uid(), name: (typeof n.name === "string" && n.name.trim() ? n.name : nameFrom(n.text)).slice(0,60), text: n.text,
                   created: n.created || Date.now(), updated: Date.now() });
      added++;
    });
    persistNotes(); renderNotes();
    toast("Imported " + added + " note" + (added !== 1 ? "s" : ""));
  });
  this.value = "";
});
$("#btnRenameNote").addEventListener("click", function(){
  var n = getNote(curId); if(!n) return;
  var v = prompt("Note name:", n.name||"Untitled");
  if(v!=null){ n.name = v.trim().slice(0,60) || "Untitled"; n.updated = Date.now(); persistIndex(); paintNoteName(); renderNotes(); }
});

/* ---------- toast + status ---------- */
var toastT;
function toast(m){ var t=$("#toast"); t.textContent=m; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(function(){ t.classList.remove("show"); },1900); }
function setMsg(m){ $("#stMsg").textContent = m||""; }
/* the word count re-scans the whole note: at most ~4 times a second, not on every keystroke/phrase */
var countT = null;
function updCount(){ if(!countT) countT = setTimeout(function(){ countT = null; paintCount(); }, 250); }
function paintCount(){
  var txt = memo.value.trim();
  var w = txt ? txt.split(/\s+/).length : 0;
  var c = memo.value.length;
  var secs = w ? Math.round(w / (200*S.ttsRate) * 60) : 0;
  $("#stCount").textContent = w + (w===1?" word":" words") + " · " + c + " chars" + (w ? " · ~"+fmtDur(secs)+" aloud" : "");
}
function fmtDur(s){ if(s<60) return s+"s"; var m=Math.floor(s/60); return m+"m "+(s%60)+"s"; }

/* ---------- undo / redo ---------- */
var undoStack = [], redoStack = [], lastUndoPush = 0;
function pushUndo(force){
  var now = Date.now();
  if(!force && now - lastUndoPush < 1400) return;
  if(undoStack.length && undoStack[undoStack.length-1] === memo.value) return;
  lastUndoPush = now;
  undoStack.push(memo.value);
  // whole-note snapshots: keep fewer of them for a very long note (memory on a phone)
  var cap = memo.value.length > 200000 ? 8 : memo.value.length > 50000 ? 20 : 50;
  while(undoStack.length > cap) undoStack.shift();
  redoStack.length = 0;
}
function doUndo(){
  if(!undoStack.length){ toast("Nothing to undo"); return; }
  redoStack.push(memo.value);
  memo.value = undoStack.pop();
  onMemoChanged(); toast("Undone");
}
function doRedo(){
  if(!redoStack.length){ toast("Nothing to redo"); return; }
  undoStack.push(memo.value);
  memo.value = redoStack.pop();
  onMemoChanged(); toast("Redone");
}
function onMemoChanged(){ updCount(); saveText(); }
/* typing must feed our undo stack too – Ctrl+Z / the Undo button are ours, not the textarea's */
memo.addEventListener("beforeinput", function(){ pushUndo(false); });
memo.addEventListener("input", onMemoChanged);
/* Android kills a backgrounded PWA without warning – flush the debounced save immediately */
function flushSave(){
  clearTimeout(saveTextT);
  var n = getNote(curId);
  if(n && n.text !== memo.value){ n.text = memo.value; n.updated = Date.now(); if(n.name === "Untitled" || !n.name) n.name = nameFrom(memo.value); persistNote(n); persistIndex(); }
}
window.addEventListener("pagehide", flushSave);
document.addEventListener("visibilitychange", function(){ if(document.visibilityState === "hidden") flushSave(); });

/* ---------- sheets ---------- */
var backdrop = $("#backdrop");
function openSheet(name){
  closeSheet();
  var s = $("#sheet-"+name); if(!s) return;
  s.classList.add("show"); backdrop.classList.add("show");
  if(name==="settings"){ refreshMicList(false); renderUserDict(); renderPhrases(); }
  if(name==="notes"){ renderNotes(); renderRecordings(); }
  if(name==="edit") refreshStats();
  if(name==="cmds") renderCmds();
}
function closeSheet(){
  document.querySelectorAll(".sheet.show").forEach(function(s){ s.classList.remove("show"); });
  backdrop.classList.remove("show");
}
document.querySelectorAll("[data-sheet]").forEach(function(b){ b.addEventListener("click", function(){ openSheet(b.dataset.sheet); }); });
document.querySelectorAll("[data-close]").forEach(function(b){ b.addEventListener("click", closeSheet); });
backdrop.addEventListener("click", closeSheet);
$("#btnCmdsQuick").addEventListener("click", function(){ openSheet("cmds"); });
$("#btnCmds").addEventListener("click", function(){ openSheet("cmds"); });

/* ================================================================
   DICTATION  (the engine is dsr-speech.js - shared with DSR Notes and DSR Secure Store)
   ================================================================ */
var SP = window.DsrSpeech;
var sess = null, mode = "idle", lastInsert = "", lastInsertRange = null, silenceT = null, capsLock = false;
var listenT0 = 0, clockT = null, recNoteId = null;

function notice(html){ var n=$("#notice"); if(!html){ n.classList.remove("show"); return; } n.innerHTML = html; n.classList.add("show"); }

if(!window.isSecureContext){
  notice("<b>Microphone blocked:</b> this page must be served over HTTPS for dictation to work.");
} else if(!SP.hasGoogle && S.engine !== "private"){
  S.engine = "private"; save();
  notice("<b>Google speech isn&rsquo;t available in this browser</b> &ndash; switched to the <b>Private</b> on-device engine (Settings &rarr; Dictation).");
}
(function(){
  var crash = SP.lastCrash();
  if(crash) setTimeout(function(){ notice("<b>The private speech engine stopped unexpectedly last time</b> while " + esc(crash) + ". It now uses the safer CPU mode. If it keeps happening, pick a smaller model or the Google engine in Settings."); }, 0);
})();

function armSilence(){
  clearTimeout(silenceT);
  if(S.mode === "ptt") return;
  if(+S.silence > 0 && mode === "listening"){
    silenceT = setTimeout(function(){ if(mode==="listening"){ pauseRec(); toast("Paused after " + S.silence + "s silence"); } }, +S.silence * 1000);
  }
}
function startRec(){
  notice("");
  if(sess){ sess.stop(); sess = null; }
  manualStopClock();
  mode = "listening"; reflectMode(); paintGateMark();
  listenT0 = Date.now(); clockT = setInterval(paintClock, 1000);
  if(S.wake) reqWake();
  if(window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.cancel();
  recNoteId = curId;
  var my = sess = SP.start({
    engine: S.engine === "private" ? "private" : "google",
    model: S.model, lang: S.lang, interim: S.interim, profanity: S.profanity,
    continuous: S.continuous || S.mode === "ptt", gain: S.micGain, gate: S.noiseGate,
    keepAudio: S.keepAudio,
    onInterim: function(t){ $("#interim").textContent = S.interim ? (t || "") : ""; if(t) armSilence(); },
    onFinal: function(t){ commit(t); armSilence(); },
    onStatus: setMsg,
    onLevel: setMeter,
    onProgress: function(p, label, amt){ if(p == null) dlHide(); else dlShow(label, p, amt || ""); },
    onError: function(m, fatal){
      if(!fatal){ toast(m); return; }
      notice("<b>" + esc(m) + "</b>" + (S.engine === "private" ? " Try a smaller model, or the Google engine, in Settings &rarr; Dictation." : ""));
    },
    onEnd: function(){ if(sess === my){ sess = null; if(mode === "listening") setModeIdle(); } },
    onAudio: function(blob, secs){ saveRecording(blob, secs, recNoteId); }
  });
  armSilence();
}
function stopSession(){
  if(sess){ var s = sess; sess = null; s.stop(); }
  clearTimeout(silenceT); manualStopClock();
  reflectMode(); relWake(); paintGateMark(); setMeter(0);
  $("#interim").textContent = "";
}
function pauseRec(){ mode = "paused"; stopSession(); }
function setModeIdle(){ mode = "idle"; stopSession(); setMsg(""); }
function manualStopClock(){ clearInterval(clockT); clockT = null; }
function paintClock(){ if(mode === "listening") $("#stMode").textContent = "Listening " + fmtClock((Date.now() - listenT0) / 1000); }
function fmtClock(s){ s = Math.round(s); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
function reflectMode(){
  var b = $("#btnRec");
  b.classList.remove("live","paused");
  $("#pbar").hidden = mode !== "listening";
  if(S.mode === "ptt"){
    if(mode === "listening"){ b.classList.add("live"); b.innerHTML = "&#127908; Listening – release to stop"; $("#stMode").textContent = "Listening"; $("#btnStop").disabled = true; }
    else { b.innerHTML = "&#127908; Hold to talk"; $("#stMode").textContent = "Idle"; $("#btnStop").disabled = true; }
    return;
  }
  var eng = S.engine === "private" ? " (private)" : "";
  if(mode === "listening"){ b.classList.add("live"); b.innerHTML = "&#10073;&#10073; Pause"; $("#btnStop").disabled = false; $("#stMode").textContent = "Listening"; }
  else if(mode === "paused"){ b.classList.add("paused"); b.innerHTML = "&#9679; Resume" + eng; $("#btnStop").disabled = false; $("#stMode").textContent = "Paused"; }
  else { b.innerHTML = "&#9679; Start dictation" + eng; $("#btnStop").disabled = true; $("#stMode").textContent = "Idle"; }
}
var rb = $("#btnRec");
rb.addEventListener("click", function(){
  if(S.mode === "ptt") return;
  if(mode === "listening") pauseRec(); else startRec();
});
rb.addEventListener("pointerdown", function(e){ if(S.mode==="ptt" && !rb.disabled){ e.preventDefault(); try{ rb.setPointerCapture(e.pointerId); }catch(x){} startRec(); } });
// Android long-press = context menu / haptic "select" → pointercancel would end push-to-talk
rb.addEventListener("contextmenu", function(e){ if(S.mode==="ptt") e.preventDefault(); });
["pointerup","pointerleave","pointercancel"].forEach(function(ev){
  rb.addEventListener(ev, function(){ if(S.mode==="ptt" && mode==="listening") pauseRec(); });
});
$("#btnStop").addEventListener("click", setModeIdle);
/* Clear-and-start-afresh: tap once to arm ("Clear?"), tap again within 3s to wipe. Undo brings it back. */
var clrArmT = null, clrUndoT = null, clrBtn = $("#btnClearQuick");
function clrDisarm(){ clearTimeout(clrArmT); clrArmT = null; clearTimeout(clrUndoT); clrUndoT = null; clrBtn.classList.remove("arm"); clrBtn.innerHTML = "&#128465;"; clrBtn.dataset.l = "Clear"; }
clrBtn.addEventListener("click", function(){
  if(clrUndoT){ clrDisarm(); doUndo(); return; }      // button shows "Undo" for a few seconds after a clear
  if(!memo.value){ toast("Note is already empty"); return; }
  if(!clrArmT){
    clrBtn.classList.add("arm"); clrBtn.textContent = "Clear?"; clrBtn.dataset.l = "";
    clrArmT = setTimeout(clrDisarm, 3000);
    return;
  }
  clrDisarm();
  pushUndo(true);
  memo.value = ""; $("#interim").textContent = "";
  lastInsert = ""; lastInsertRange = null; capsLock = false;
  var cn = getNote(curId); if(cn){ cn.name = "Untitled"; paintNoteName(); }   // re-titles from the new text
  onMemoChanged();
  toast("Cleared – ready to start afresh");
  clrBtn.classList.add("arm"); clrBtn.innerHTML = "&#8630; Undo"; clrBtn.dataset.l = "";
  clrUndoT = setTimeout(clrDisarm, 6000);
});

/* ---------- recognised words -> the note ---------- */
function textOpts(over){
  return Object.assign({ punct: S.punct, numbers: S.numbers, caps: S.cap, capsLock: capsLock, fillers: S.fillers,
                         phrases: S.phrases, has: hasInNote }, over || {});
}
function commit(raw, over){
  var r = SP.process(raw, currentText(), textOpts(over));
  if(r.cmd) runCmd(r.cmd, r.arg);
  else if(r.text) insertText(r.text, r.eat);
}
function runCmd(c, a){
  if(c === "scratch") scratchLast();
  else if(c === "deleteWord") deleteTail(/\s*\S+\s*$/);
  else if(c === "deleteSentence") deleteTail(/[^.!?\n]*[.!?]?\s*$/);
  else if(c === "deleteLine") deleteTail(/[^\n]*\n?$/);
  else if(c === "stop"){ pauseRec(); toast("Dictation paused"); }
  else if(c === "capsOn"){ capsLock = true; toast("CAPS on"); }
  else if(c === "capsOff"){ capsLock = false; toast("CAPS off"); }
  else if(c === "joinLines"){ pushUndo(true); memo.value = memo.value.replace(/\n+$/,"").replace(/([^\n])\n([^\n])/g,"$1 $2"); onMemoChanged(); }
  else if(c === "undo") doUndo();
  else if(c === "redo") doRedo();
  else if(c === "readBack") readBack();
  else if(c === "replace") voiceReplace(a.from, a.to);
}
function currentText(){
  if(S.insertAtCursor && document.activeElement === memo) return memo.value.slice(0, memo.selectionStart);
  return memo.value;
}
function insertText(str, eat){
  pushUndo(false);
  eat = eat || 0;
  if(S.insertAtCursor && document.activeElement === memo){
    var a = memo.selectionStart, b = memo.selectionEnd;
    a = Math.max(0, a - eat);
    memo.value = memo.value.slice(0,a) + str + memo.value.slice(b);
    var p = a + str.length;
    try{ memo.setSelectionRange(p,p); }catch(e){}
    lastInsert = str; lastInsertRange = [a, p];
  } else {
    memo.value = (eat ? memo.value.slice(0, -eat) : memo.value) + str;
    lastInsert = str; lastInsertRange = null;
    memo.scrollTop = memo.scrollHeight;
  }
  onMemoChanged();
}
function scratchLast(){
  if(!lastInsert) return;
  pushUndo(true);
  if(lastInsertRange){
    var a = lastInsertRange[0], b = lastInsertRange[1];
    if(memo.value.slice(a,b) === lastInsert){ memo.value = memo.value.slice(0,a) + memo.value.slice(b); try{ memo.setSelectionRange(a,a); }catch(e){} }
  } else if(memo.value.slice(-lastInsert.length) === lastInsert){
    memo.value = memo.value.slice(0, -lastInsert.length);
  }
  lastInsert = ""; lastInsertRange = null; onMemoChanged(); toast("Removed last bit");
}
function deleteTail(reWithEnd){
  pushUndo(true);
  memo.value = memo.value.replace(reWithEnd, "");
  lastInsert = ""; onMemoChanged();
}
function wordRe(s, flags){ return new RegExp("(^|[^A-Za-z0-9'’])(" + s.trim().split(/\s+/).map(function(w){ return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("[\\s,]+") + ")(?![A-Za-z0-9'’])", flags); }
function hasInNote(s){ return !!s && wordRe(s, "i").test(memo.value); }
/* "replace milk with bread" - changes the LAST place those words appear */
function voiceReplace(from, to){
  var re = wordRe(from, "gi"), m, last = null;
  while((m = re.exec(memo.value))){ last = m; if(m.index === re.lastIndex) re.lastIndex++; }
  if(!last) return;
  var at = last.index + last[1].length, old = last[2];
  var rep = /^[A-Z]/.test(old) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
  pushUndo(true);
  memo.value = memo.value.slice(0, at) + rep + memo.value.slice(at + old.length);
  lastInsert = ""; lastInsertRange = null;
  onMemoChanged(); toast("Replaced “" + old + "” with “" + rep + "”");
}
/* "read that back" - the last sentence, spoken. Listening pauses meanwhile (the mic would hear it). */
function readBack(){
  var t = currentText().replace(/\s+$/, "");
  var m = t.match(/[^.!?\n]*[.!?]*$/), s = (m && m[0].trim()) || "";
  if(s.length < 3){ var p = t.split(/[.!?\n]/).filter(function(x){ return x.trim(); }); s = (p[p.length - 1] || "").trim(); }
  if(!s || !("speechSynthesis" in window)){ toast("Nothing to read back"); return; }
  var resume = mode === "listening";
  if(resume) pauseRec();
  speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(s);
  var vi = parseInt($("#ttsVoice").value);
  if(voices[vi]){ u.voice = voices[vi]; u.lang = voices[vi].lang; }
  u.rate = S.ttsRate; u.pitch = S.ttsPitch; u.volume = S.ttsVol;
  u.onend = u.onerror = function(){ if(resume && mode === "paused") startRec(); };
  speechSynthesis.speak(u);
}

/* ---------- punctuation bar (shown while listening) ---------- */
document.querySelectorAll("#pbar [data-p]").forEach(function(b){
  b.addEventListener("pointerdown", function(e){ e.preventDefault(); });      // keep the note's cursor / keyboard state
  b.addEventListener("click", function(){
    var p = b.dataset.p;
    if(p === "word") deleteTail(/\s*\S+\s*$/);
    else if(p === "scratch") scratchLast();
    else commit(p, { punct: true });
  });
});

/* ---------- meter ---------- */
var meterBar = $("#meterBar");
function setMeter(rms){ meterBar.style.width = Math.min(100, Math.round(rms * 260)) + "%"; }
function paintGateMark(){
  var g = $("#meterGate");
  if(S.engine === "private" && mode !== "idle"){ g.hidden = false; g.style.left = Math.min(98, (+S.noiseGate) * 260) + "%"; }
  else g.hidden = true;
}
function dlShow(label, pct, amt){ $("#dlBox").hidden = false; $("#dlLbl").textContent = label; $("#dlAmt").textContent = amt; $("#dlBar").style.width = pct + "%"; }
function dlHide(){ $("#dlBox").hidden = true; $("#btnDlCancel").hidden = true; }

/* ---------- warm start: load an already-downloaded private model while the app opens, so the first
   phrase doesn't wait for it (only if it's on the device already - never a surprise download) ---------- */
function warmPrivate(){
  if(S.engine !== "private") return;
  SP.isCached(S.model).then(function(yes){
    if(yes) setTimeout(function(){ if(!sess) SP.preload(S.model).catch(function(){}); }, 1200);
  });
}

/* ================================================================
   TRANSCRIBE AN AUDIO FILE  (on the device, with the private engine)
   ================================================================ */
var fileJob = null;
function transcribeFile(file){
  if(!file) return;
  if(fileJob){ toast("Already transcribing a file"); return; }
  if(mode === "listening") pauseRec();
  closeSheet();
  var job = fileJob = { cancelled: false }, first = true, got = 0;
  $("#btnDlCancel").hidden = false;
  setMsg("Transcribing " + file.name + " on this device…");
  SP.transcribeFile(file, {
    model: S.model,
    cancelled: function(){ return job.cancelled; },
    onProgress: function(p, label){ if(p == null) return; dlShow(label, p, ""); $("#btnDlCancel").hidden = false; },
    onText: function(t){
      if(first){
        first = false; pushUndo(true);
        var head = "🎧 " + file.name.replace(/\.[^.]+$/, "") + " – " + new Date().toLocaleDateString();
        var sep = memo.value.trim() ? (/\n\n$/.test(memo.value) ? "" : /\n$/.test(memo.value) ? "\n" : "\n\n") : "";
        memo.value += sep + head + "\n"; lastInsert = "";
      }
      got++;
      commit(t, { punct: false });         // a recording's words are text, not commands
    }
  }).then(function(){
    dlHide(); fileJob = null;
    setMsg(job.cancelled ? "Stopped" : got ? "Transcribed " + file.name : "");
    toast(job.cancelled ? "Transcription stopped" : got ? "Transcribed " + file.name : "No speech found in " + file.name);
  }).catch(function(e){
    dlHide(); fileJob = null; setMsg("");
    notice("<b>Couldn&rsquo;t transcribe " + esc(file.name) + ":</b> " + esc(String((e && e.message) || e)));
  });
}
$("#btnAudioFile").addEventListener("click", function(){ $("#audioFile").click(); });
$("#audioFile").addEventListener("change", function(){ var f = this.files && this.files[0]; this.value = ""; transcribeFile(f); });
$("#btnDlCancel").addEventListener("click", function(){ if(fileJob){ fileJob.cancelled = true; setMsg("Stopping after this piece…"); } });

/* ================================================================
   RECORDINGS  (optional: keep the audio of each dictation, per note, in IndexedDB)
   ================================================================ */
var recDbP = null;
function recDb(){
  if(!recDbP) recDbP = new Promise(function(res, rej){
    var r = indexedDB.open("dsrdict-audio", 1);
    r.onupgradeneeded = function(){ var st = r.result.createObjectStore("rec", { keyPath: "id" }); st.createIndex("note", "note"); };
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ recDbP = null; rej(r.error); };
  });
  return recDbP;
}
function recTx(rw, fn){
  return recDb().then(function(db){ return new Promise(function(res, rej){
    var tx = db.transaction("rec", rw), req = fn(tx.objectStore("rec"));
    tx.oncomplete = function(){ res(req && req.result); };
    tx.onerror = tx.onabort = function(){ rej(tx.error); };
  }); });
}
function saveRecording(blob, secs, noteId){
  if(!blob || !blob.size || !noteId) return;
  recTx("readwrite", function(st){ return st.put({ id: uid(), note: noteId, created: Date.now(), secs: secs, type: blob.type, blob: blob }); })
    .then(function(){ toast("Recording saved with the note (" + fmtClock(secs) + ")"); if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){}); if($("#sheet-notes").classList.contains("show")) renderRecordings(); })
    .catch(function(){ toast("Couldn't save the recording"); });
}
function renderRecordings(){
  var box = $("#recList");
  if(!window.indexedDB){ box.innerHTML = "<div class='empty'>Not supported in this browser.</div>"; return; }
  recTx("readonly", function(st){ return st.index("note").getAll(curId); }).then(function(list){
    list = (list || []).sort(function(a, b){ return b.created - a.created; });
    box.innerHTML = "";
    if(!list.length){ box.innerHTML = "<div class='empty'>None for this note." + (S.keepAudio ? "" : " Turn on <b>Keep a recording</b> in Settings &rarr; Dictation.") + "</div>"; return; }
    list.forEach(function(r){
      var row = document.createElement("div"); row.className = "nrow";
      var info = document.createElement("div"); info.className = "info";
      info.innerHTML = "<div class='nm'>" + esc(new Date(r.created).toLocaleString()) + "</div><div class='pv'>" + fmtClock(r.secs || 0) + " · " + (r.blob.size / 1048576).toFixed(1) + " MB</div>";
      row.appendChild(info);
      var play = document.createElement("button"); play.className = "mini"; play.dataset.l = "Play"; play.textContent = "▶";
      var dl = document.createElement("button"); dl.className = "mini"; dl.dataset.l = "Save"; dl.textContent = "⬇";
      var del = document.createElement("button"); del.className = "mini"; del.dataset.l = "Delete"; del.textContent = "🗑";
      play.addEventListener("click", function(){
        var old = box.querySelector("audio"); if(old){ URL.revokeObjectURL(old.src); old.remove(); }
        var au = document.createElement("audio"); au.controls = true; au.src = URL.createObjectURL(r.blob); au.style.width = "100%";
        row.after(au); au.play().catch(function(){});
      });
      dl.addEventListener("click", function(){
        var a = document.createElement("a"); a.href = URL.createObjectURL(r.blob);
        a.download = "dictation-" + new Date(r.created).toISOString().slice(0, 16).replace(/[:T]/g, "-") + (/ogg/.test(r.type) ? ".ogg" : /mp4/.test(r.type) ? ".m4a" : ".webm");
        document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
      });
      del.addEventListener("click", function(){
        if(!confirm("Delete this recording?")) return;
        recTx("readwrite", function(st){ return st.delete(r.id); }).then(renderRecordings);
      });
      row.appendChild(play); row.appendChild(dl); row.appendChild(del);
      box.appendChild(row);
    });
  }).catch(function(){ box.innerHTML = "<div class='empty'>Couldn't read the recordings.</div>"; });
}
function deleteRecordingsOf(noteId){
  if(!window.indexedDB) return;
  recTx("readwrite", function(st){
    var req = st.index("note").openCursor(IDBKeyRange.only(noteId));
    req.onsuccess = function(){ var c = req.result; if(c){ c.delete(); c.continue(); } };
    return req;
  }).catch(function(){});
}

/* ================================================================
   MIC TEST + DEVICE LIST
   ================================================================ */
var meterStream = null, meterCtx = null, meterRAF = null;
function startMeter(){
  if(meterCtx || !navigator.mediaDevices) return;
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
    meterStream = stream;
    meterCtx = new (window.AudioContext || window.webkitAudioContext)();
    var an = meterCtx.createAnalyser(); an.fftSize = 512;
    meterCtx.createMediaStreamSource(stream).connect(an);
    var buf = new Uint8Array(an.fftSize);
    (function tick(){
      an.getByteTimeDomainData(buf);
      var sum = 0;
      for(var i=0;i<buf.length;i++){ var v=(buf[i]-128)/128; sum += v*v; }
      setMeter(Math.sqrt(sum/buf.length));
      meterRAF = requestAnimationFrame(tick);
    })();
  }).catch(function(){});
}
function stopMeter(){
  if(meterRAF) cancelAnimationFrame(meterRAF); meterRAF = null;
  if(meterStream){ meterStream.getTracks().forEach(function(t){ t.stop(); }); meterStream = null; }
  if(meterCtx){ try{ meterCtx.close(); }catch(e){} meterCtx = null; }
  setMeter(0);
}
function refreshMicList(prompt){
  var ul = $("#micList"), stat = $("#micStat");
  if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices){ stat.textContent = "This browser can't list microphones."; return; }
  var go = prompt
    ? navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){ s.getTracks().forEach(function(t){ t.stop(); }); })
    : Promise.resolve();
  go.then(function(){ return navigator.mediaDevices.enumerateDevices(); }).then(function(list){
    var mics = list.filter(function(d){ return d.kind === "audioinput"; });
    ul.innerHTML = "";
    if(!mics.length){ ul.innerHTML = "<li>(none detected)</li>"; return; }
    mics.forEach(function(d){ var li = document.createElement("li"); li.textContent = d.label || "Microphone (allow access to see its name)"; ul.appendChild(li); });
  }).catch(function(){ stat.textContent = "Microphone access was blocked."; });
}
$("#btnMicTest").addEventListener("click", function(){
  var stat = $("#micStat");
  if(mode === "listening"){ stat.textContent = "Pause dictation first – the test needs the microphone to itself."; return; }
  stat.textContent = "Testing… speak now.";
  refreshMicList(true); startMeter();
  var t0 = Date.now(), peak = 0;
  var iv = setInterval(function(){
    peak = Math.max(peak, parseInt(meterBar.style.width) || 0);
    if(Date.now() - t0 > 3500){
      clearInterval(iv);
      if(mode !== "listening") stopMeter();
      stat.textContent = peak > 8 ? ("Microphone works – peak level " + peak + "%.") : "No sound detected – check the mic is connected and allowed.";
    }
  }, 120);
});

/* ================================================================
   WAKE LOCK
   ================================================================ */
var wake = null;
function reqWake(){ if(!navigator.wakeLock) return; navigator.wakeLock.request("screen").then(function(w){ wake = w; }).catch(function(){}); }
function relWake(){ if(wake){ wake.release().catch(function(){}); wake = null; } }
document.addEventListener("visibilitychange", function(){
  if(document.visibilityState === "visible" && mode === "listening" && S.wake) reqWake();
});

/* ================================================================
   MY WORDS  ("when I say … write …": auto-text + fixes for names the engine mishears)
   ================================================================ */
function renderPhrases(){
  var box = $("#phraseList"); box.innerHTML = "";
  if(!S.phrases.length){ box.innerHTML = "<span class='hint' style='padding:2px'>None yet.</span>"; return; }
  S.phrases.forEach(function(p, i){
    var row = document.createElement("div"); row.className = "nrow";
    var info = document.createElement("div"); info.className = "info";
    info.innerHTML = "<div class='pv'>When I say</div><div class='nm'>" + esc(p[0]) + "</div><div class='pv'>write: " + esc(p[1]).replace(/\n/g, "↵") + "</div>";
    var del = document.createElement("button"); del.className = "mini"; del.dataset.l = "Remove"; del.textContent = "🗑";
    del.addEventListener("click", function(){ S.phrases.splice(i, 1); save(); renderPhrases(); });
    row.appendChild(info); row.appendChild(del); box.appendChild(row);
  });
}
$("#btnPhraseAdd").addEventListener("click", function(){
  var say = $("#phraseSay").value.trim().replace(/\s+/g, " "), write = $("#phraseWrite").value;
  if(!say || !write.trim()){ toast("Fill in both boxes"); return; }
  S.phrases = S.phrases.filter(function(p){ return p[0].toLowerCase() !== say.toLowerCase(); });
  S.phrases.push([say, write.replace(/\\n/g, "\n")]);
  save(); renderPhrases();
  $("#phraseSay").value = ""; $("#phraseWrite").value = "";
  toast("Added");
});
/* ================================================================
   TEXT TO SPEECH
   ================================================================ */
var voices = [], ttsQueue = [], ttsIdx = 0, ttsPaused = false, ttsWatch = null, ttsGen = 0;
function loadVoices(){
  voices = window.speechSynthesis ? (speechSynthesis.getVoices() || []) : [];
  var sel = $("#ttsVoice"); sel.innerHTML = "";
  if(!voices.length){ sel.innerHTML = "<option>(loading voices…)</option>"; return; }
  var groups = {};
  voices.forEach(function(v, idx){ (groups[v.lang||"??"] = groups[v.lang||"??"] || []).push({v:v, i:idx}); });
  Object.keys(groups).sort(function(a,b){
    var ae = a.indexOf("en")===0, be = b.indexOf("en")===0;
    if(ae !== be) return ae ? -1 : 1;
    return a.localeCompare(b);
  }).forEach(function(g){
    var og = document.createElement("optgroup"); og.label = g;
    groups[g].forEach(function(o){ var opt = document.createElement("option"); opt.value = o.i; opt.textContent = o.v.name + (o.v.localService ? "" : " ☁"); og.appendChild(opt); });
    sel.appendChild(og);
  });
  var pick = -1;
  if(S.ttsVoice) pick = voices.findIndex(function(v){ return v.name === S.ttsVoice; });
  if(pick < 0) pick = voices.findIndex(function(v){ return v.lang && v.lang.toLowerCase() === S.lang.toLowerCase(); });
  if(pick < 0) pick = voices.findIndex(function(v){ return /^en/i.test(v.lang||""); });
  if(pick >= 0) sel.value = pick;
  $("#ttsHint").textContent = voices.length + " voices available (☁ = online voice). Plays the whole note, or the selected text if you highlight some.";
}
if("speechSynthesis" in window){ loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
else { $("#ttsHint").textContent = "Text-to-speech isn't supported in this browser."; }

function splitSentences(t){
  var parts = t.match(/[^.!?\n]+(?:[.!?]+|\n+|$)/g) || [t];
  var out = [], cur = "", start = 0, pos = 0;
  parts.forEach(function(p){
    if((cur + p).length > 240 && cur){ out.push({s:cur, at:start}); cur = ""; }
    if(!cur) start = pos;
    cur += p; pos += p.length;
  });
  if(cur.trim()) out.push({s:cur, at:start});
  return out;
}
function play(fromCursor){
  if(!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  var base = 0, text = memo.value;
  var selA = memo.selectionStart, selB = memo.selectionEnd;
  if(!fromCursor && selB > selA){ text = memo.value.slice(selA, selB); base = selA; }
  else if(fromCursor){ base = selA; text = memo.value.slice(selA); }
  if(!text.trim()){ toast("Nothing to read"); return; }
  if(mode === "listening") pauseRec();
  ttsQueue = splitSentences(text).map(function(seg){ return { s: seg.s, at: base + seg.at }; });
  ttsIdx = 0; ttsPaused = false; ttsGen++;
  $("#btnPauseTts").innerHTML = "&#10073;&#10073; Pause";
  speakNext();
  clearInterval(ttsWatch);
  ttsWatch = setInterval(function(){ if(speechSynthesis.speaking && !speechSynthesis.paused && !ttsPaused) speechSynthesis.resume(); }, 9000);
}
function speakNext(){
  if(ttsIdx >= ttsQueue.length){ endTts(); return; }
  var item = ttsQueue[ttsIdx], gen = ttsGen;
  var u = new SpeechSynthesisUtterance(item.s);
  var vi = parseInt($("#ttsVoice").value);
  if(voices[vi]){ u.voice = voices[vi]; u.lang = voices[vi].lang; }
  u.rate = S.ttsRate; u.pitch = S.ttsPitch; u.volume = S.ttsVol;
  u.onboundary = function(ev){
    if(!S.ttsFollow || ev.name === "sentence") return;
    var ci = item.at + (ev.charIndex || 0), full = memo.value;
    var s = ci; while(s > 0 && /\S/.test(full[s-1])) s--;
    var e = ci; while(e < full.length && /\S/.test(full[e])) e++;
    if(e > s){ try{ memo.setSelectionRange(s, e); }catch(x){} }
  };
  /* cancel() fires onend/onerror on the dying utterance: the gen check stops Stop/Pause
     from "continuing" to the next sentence */
  u.onend = function(){ if(gen === ttsGen && !ttsPaused){ ttsIdx++; speakNext(); } };
  u.onerror = function(){ if(gen === ttsGen && !ttsPaused){ ttsIdx++; speakNext(); } };
  $("#stMode").textContent = "Reading";
  speechSynthesis.speak(u);
}
function endTts(){ clearInterval(ttsWatch); ttsWatch = null; ttsPaused = false; $("#stMode").textContent = mode==="listening"?"Listening":(mode==="paused"?"Paused":"Idle"); }
$("#btnPlay").addEventListener("click", function(){ play(false); });
$("#btnPlayCursor").addEventListener("click", function(){ play(true); });
/* pause/resume = cancel + re-speak the current sentence: speechSynthesis.pause() does nothing
   (or stops dead) on Android, and Chrome desktop drops paused speech after ~15s */
$("#btnPauseTts").addEventListener("click", function(){
  if(!("speechSynthesis" in window)) return;
  if(ttsPaused){
    ttsPaused = false; ttsGen++; $("#btnPauseTts").innerHTML = "&#10073;&#10073; Pause";
    speakNext();
  } else if(ttsWatch && ttsIdx < ttsQueue.length){
    ttsPaused = true; ttsGen++; speechSynthesis.cancel();
    $("#btnPauseTts").innerHTML = "&#9654; Resume"; $("#stMode").textContent = "Reading paused";
  }
});
$("#btnStopTts").addEventListener("click", function(){ ttsGen++; if("speechSynthesis" in window) speechSynthesis.cancel(); ttsQueue = []; ttsPaused = false; $("#btnPauseTts").innerHTML = "&#10073;&#10073; Pause"; endTts(); });
$("#btnPreview").addEventListener("click", function(){
  if(!("speechSynthesis" in window)) return;
  ttsGen++; ttsQueue = []; ttsPaused = false; endTts();
  speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance("This is a preview of the selected voice for DSR Dictation.");
  var vi = parseInt($("#ttsVoice").value);
  if(voices[vi]){ u.voice = voices[vi]; u.lang = voices[vi].lang; }
  u.rate = S.ttsRate; u.pitch = S.ttsPitch; u.volume = S.ttsVol;
  speechSynthesis.speak(u);
});

/* ================================================================
   SELECT A RANGE IN THE MEMO
   ================================================================ */
function selectRange(a, b){
  closeSheet();
  memo.focus();
  try{ memo.setSelectionRange(a, b); }catch(e){}
  var line = memo.value.slice(0, a).split("\n").length;
  var lh = S.font * 1.5;
  memo.scrollTop = Math.max(0, (line - 3) * lh);
}

/* ================================================================
   SPELL CHECK
   ================================================================ */
var speller = null, spellerFor = "", spellLoading = null, spellIgnore = {};
var userDict = [];
try{ userDict = JSON.parse(LS.getItem("dsrdict.userdict") || "[]") || []; }catch(e){ userDict = []; }
function saveUserDict(){ try{ LS.setItem("dsrdict.userdict", JSON.stringify(userDict)); }catch(e){} renderUserDict(); }
function renderUserDict(){
  var box = $("#userDictList"); if(!box) return;
  box.innerHTML = "";
  if(!userDict.length){ box.innerHTML = "<span class='hint' style='padding:2px'>None yet.</span>"; return; }
  userDict.forEach(function(w){
    var b = document.createElement("button"); b.className = "sec"; b.style.flex = "0 0 auto";
    b.textContent = w + "  ×";
    b.addEventListener("click", function(){ userDict = userDict.filter(function(x){ return x !== w; }); if(speller){ try{ speller.remove(w); }catch(e){} } saveUserDict(); });
    box.appendChild(b);
  });
}
function addUserWord(w){
  w = w.replace(/’/g, "'");
  if(userDict.indexOf(w) < 0) userDict.push(w);
  if(speller) speller.add(w);
  saveUserDict();
}
var DICT_URLS = {
  "en-au": ["dictionary-en-au", "dictionary-en-gb"],
  "en-gb": ["dictionary-en-gb"],
  "en-us": ["dictionary-en", "dictionary-en-us"],
  "en-ca": ["dictionary-en-ca", "dictionary-en-gb"]
};
function loadSpeller(){
  if(speller && spellerFor === S.dict) return Promise.resolve(speller);
  if(spellLoading) return spellLoading;
  var pkgs = DICT_URLS[S.dict] || DICT_URLS["en-gb"];
  setMsg("Loading " + S.dict + " dictionary…");
  spellLoading = (function(){
    function tryPkg(idx){
      if(idx >= pkgs.length) return Promise.reject(new Error("no dictionary"));
      var base = "https://cdn.jsdelivr.net/npm/" + pkgs[idx] + "/";
      return Promise.all([
        fetch(base + "index.aff").then(function(r){ if(!r.ok) throw 0; return r.text(); }),
        fetch(base + "index.dic").then(function(r){ if(!r.ok) throw 0; return r.text(); })
      ]).catch(function(){ return tryPkg(idx + 1); });
    }
    return Promise.all([
      tryPkg(0),
      import("https://cdn.jsdelivr.net/npm/nspell@2.1.5/+esm").then(function(m){ return m.default || m; })
    ]).then(function(res){
      speller = res[1](res[0][0], res[0][1]);
      userDict.forEach(function(w){ try{ speller.add(w); }catch(e){} });
      spellerFor = S.dict; spellLoading = null; setMsg(""); return speller;
    }).catch(function(e){ spellLoading = null; setMsg(""); throw e; });
  })();
  return spellLoading;
}
function checkSpelling(){
  var out = $("#spellOut");
  out.innerHTML = "<div class='empty'>Checking…</div>";
  loadSpeller().then(function(sp){
    var re = /[A-Za-z][A-Za-z'’]*/g, m, bad = [], seen = {};
    while((m = re.exec(memo.value))){
      var w = m[0];
      if(w.length < 2 || /^[A-Z0-9]+$/.test(w) || spellIgnore[w.toLowerCase()]) continue;
      var norm = w.replace(/’/g, "'");
      if(sp.correct(norm)) continue;
      var key = w.toLowerCase();
      if(seen[key]){ seen[key].count++; continue; }
      var rc = { word: w, norm: norm, first: m.index, count: 1, sugg: null };   // suggestions filled lazily – nspell.suggest is slow
      seen[key] = rc; bad.push(rc);
    }
    renderSpell(bad);
  }).catch(function(){
    out.innerHTML = "<div class='empty'>Couldn't load the dictionary. Check your connection and try again, or pick a different dictionary in Settings.</div>";
  });
}
var spellGen = 0;
function renderSpell(bad){
  var out = $("#spellOut"), gen = ++spellGen, slots = [];
  if(!bad.length){ out.innerHTML = "<div class='empty'>No spelling issues found. ✅</div>"; return; }
  out.innerHTML = "";
  bad.forEach(function(rc){
    var d = document.createElement("div"); d.className = "item";
    var mm = document.createElement("div"); mm.className = "m";
    mm.innerHTML = "<b>" + esc(rc.word) + "</b>" + (rc.count > 1 ? " ×" + rc.count : "") + " – not in dictionary";
    d.appendChild(mm);
    var sg = document.createElement("div"); sg.className = "sugg";
    var slot = document.createElement("span"); slot.className = "hint"; slot.textContent = "finding suggestions…";
    sg.appendChild(slot); slots.push({ rc: rc, slot: slot });
    var show = document.createElement("button"); show.className = "ghost"; show.textContent = "Show";
    show.addEventListener("click", function(){ selectRange(rc.first, rc.first + rc.word.length); });
    sg.appendChild(show);
    var ign = document.createElement("button"); ign.className = "ghost"; ign.textContent = "Ignore";
    ign.addEventListener("click", function(){ spellIgnore[rc.word.toLowerCase()] = 1; checkSpelling(); });
    sg.appendChild(ign);
    var add = document.createElement("button"); add.className = "ghost"; add.textContent = "Add";
    add.addEventListener("click", function(){ addUserWord(rc.word); checkSpelling(); });
    sg.appendChild(add);
    d.appendChild(sg);
    out.appendChild(d);
  });
  // one word per tick so the UI stays responsive; abandoned if the list is re-rendered
  (function next(k){
    if(gen !== spellGen || k >= slots.length || !speller) return;
    var o = slots[k], sugg = [];
    try{ sugg = speller.suggest(o.rc.norm).slice(0, 6); }catch(e){}
    var frag = document.createDocumentFragment();
    sugg.forEach(function(s){
      var b = document.createElement("button"); b.textContent = s;
      b.addEventListener("click", function(){ replaceWord(o.rc.word, s); checkSpelling(); });
      frag.appendChild(b);
    });
    if(!sugg.length){ var none = document.createElement("span"); none.className = "hint"; none.textContent = "no suggestions"; frag.appendChild(none); }
    o.slot.replaceWith(frag);
    setTimeout(function(){ next(k + 1); }, 0);
  })(0);
}
function replaceWord(from, to){
  pushUndo(true);
  var re = new RegExp("(^|[^A-Za-z'\\u2019])(" + from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")(?![A-Za-z'\\u2019])", "g");
  memo.value = memo.value.replace(re, function(_, pre){
    var rep = /^[A-Z]/.test(from) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
    return pre + rep;
  });
  onMemoChanged();
}
$("#btnSpell").addEventListener("click", checkSpelling);
$("#btnSpellClear").addEventListener("click", function(){ $("#spellOut").innerHTML = "<div class='empty'>Not checked yet.</div>"; spellIgnore = {}; });

/* ================================================================
   GRAMMAR / STYLE
   ================================================================ */
function offlineGrammar(t){
  var f = [], m, re;
  re = /  +/g;                       while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"Extra space", rep:" "});
  re = /[ \t]+([,.;:!?])/g;          while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"Space before “"+m[1]+"”", rep:m[1]});
  re = /([,.;:!?])([A-Za-z])/g;      while((m = re.exec(t))){ if(!isUrlish(t, m.index)) f.push({i:m.index, len:m[0].length, msg:"Missing space after “"+m[1]+"”", rep:m[1]+" "+m[2]}); }
  re = /\b(\w+)\s+\1\b/gi;           while((m = re.exec(t))){ if(!/^\d+$/.test(m[1]) && !/^(that|had)$/i.test(m[1]) && !(m[1].length === 1 && !/^[ai]$/i.test(m[1]))) f.push({i:m.index, len:m[0].length, msg:"Repeated word “"+m[1]+"”", rep:m[1]}); }
  re = /\bi\b(?!\.e\.)/g;            while((m = re.exec(t))){ if(!isUrlish(t, m.index)) f.push({i:m.index, len:1, msg:"“i” should be capital “I”", rep:"I"}); }
  re = /\b(could|should|would|must|might)\s+of\b/gi; while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"“"+m[1]+" of” → “"+m[1]+" have”", rep:m[1]+" have"});
  re = /\balot\b/gi;                 while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"“alot” → “a lot”", rep:"a lot"});
  re = /\bteh\b/gi;                  while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"“teh” → “the”", rep:"the"});
  re = /\ba\s+([aeiouAEIOU]\w+)/g;   while((m = re.exec(t))){ if(!/^(uni|use|user|one|euro|ubiqu)/i.test(m[1])) f.push({i:m.index, len:m[0].length, msg:"“a "+m[1]+"” → “an "+m[1]+"”", rep:"an "+m[1]}); }
  re = /\ban\s+([bcdfghjklmnpqrstvwxyz]\w+)/gi; while((m = re.exec(t))){ if(!/^(hour|honest|honou?r|heir)/i.test(m[1])) f.push({i:m.index, len:m[0].length, msg:"“an "+m[1]+"” → “a "+m[1]+"”", rep:"a "+m[1]}); }
  re = /([.!?]\s+|\n\s*)([a-z])/g;   while((m = re.exec(t))) if(m[1].charAt(0) === "\n" || (!ABBREV_END.test(t.slice(0, m.index + m[1].length)) && !isUrlish(t, m.index))) f.push({i:m.index, len:m[0].length, msg:"Sentence should start with a capital", rep:m[1].replace(/[ \t]{2,}/g," ") + m[2].toUpperCase()});
  re = /[!?]{3,}/g;                  while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"Excessive punctuation", rep:m[0].charAt(0)});
  re = /[ \t]+$/gm;                  while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"Trailing space", rep:""});
  var first = t.replace(/^\s+/, "");
  if(first && /[a-z]/.test(first[0])) f.push({i: t.length - first.length, len:1, msg:"First letter should be a capital", rep:first[0].toUpperCase()});
  var tr = t.replace(/\s+$/, "");
  if(tr && !/[.!?)"'”…]$/.test(tr)) f.push({i: tr.length - 1, len:1, msg:"The text doesn't end with a full stop", rep: tr.slice(-1) + "."});
  if(S.style){
    re = /\b(very|really|just|quite|actually|basically|literally|simply|totally|definitely)\s+/gi;
    while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"Filler word “" + m[1] + "” – consider removing", rep:""});
    re = /\b(is|are|was|were|be|been|being|been)\s+(\w+ed|written|done|made|given|taken|seen|known|shown|held)\b/gi;
    while((m = re.exec(t))) f.push({i:m.index, len:m[0].length, msg:"Possible passive voice", rep:null});
    re = /[^.!?\n]+[.!?]/g;
    while((m = re.exec(t))){ var wc = (m[0].match(/\S+/g) || []).length; if(wc > 40) f.push({i:m.index, len:m[0].length, msg:"Long sentence (" + wc + " words) – consider splitting", rep:null}); }
  }
  return f;
}
/* is position i inside a URL / e-mail / file name / abbreviation like e.g. or U.S.? */
function isUrlish(t, i){
  var a = i, b = i;
  while(a > 0 && !/\s/.test(t[a-1])) a--;
  while(b < t.length && !/\s/.test(t[b])) b++;
  var tok = t.slice(a, b);
  return /[@\/\\]|www\.|^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|au|io|gov|edu|co|uk|nz|info|app|dev|html?|txt|pdf|docx?|jpe?g|png|mp[34])\b/i.test(tok)
      || /^\(?([a-z]\.){2,}[a-z]?\.?,?\)?$/i.test(tok);
}
function ltGrammar(t){
  var body = new URLSearchParams();
  body.set("text", t); body.set("language", S.lang); body.set("enabledOnly", "false");
  return fetch("https://api.languagetool.org/v2/check", { method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" }, body: body })
    .then(function(r){ return r.json(); })
    .then(function(j){ return (j.matches || []).map(function(mm){ return { i: mm.offset, len: mm.length, msg: mm.message, rep: (mm.replacements && mm.replacements[0]) ? mm.replacements[0].value : null, lt:true }; }); });
}
var grammarFindings = [];
function checkGrammar(){
  var out = $("#grammarOut");
  out.innerHTML = "<div class='empty'>Checking…</div>";
  var t = memo.value;
  var jobs = [Promise.resolve(offlineGrammar(t))];
  if(S.useLT && t.trim()) jobs.push(ltGrammar(t).catch(function(){ toast("LanguageTool unreachable"); return []; }));
  Promise.all(jobs).then(function(parts){
    var all = [].concat.apply([], parts), keyed = {};
    all.forEach(function(f){ var k = f.i + ":" + f.len + ":" + f.msg; if(!keyed[k]) keyed[k] = f; });
    grammarFindings = Object.keys(keyed).map(function(k){ return keyed[k]; }).sort(function(a,b){ return a.i - b.i; });
    renderGrammar();
  });
}
function renderGrammar(){
  var out = $("#grammarOut");
  if(!grammarFindings.length){ out.innerHTML = "<div class='empty'>No issues found. ✅</div>"; return; }
  out.innerHTML = "";
  grammarFindings.forEach(function(f){
    var d = document.createElement("div"); d.className = "item";
    var snip = esc(memo.value.substr(Math.max(0, f.i - 18), 18) + "〈" + memo.value.substr(f.i, f.len) + "〉" + memo.value.substr(f.i + f.len, 18)).replace(/\n/g, "↵");
    var mm = document.createElement("div"); mm.className = "m";
    mm.innerHTML = esc(f.msg) + "<br><span class='snip'>…" + snip + "…</span>";
    d.appendChild(mm);
    var sg = document.createElement("div"); sg.className = "sugg";
    if(f.rep != null){
      var b = document.createElement("button");
      b.textContent = "Fix → " + (f.rep === "" ? "(remove)" : f.rep.replace(/\n/g,"↵"));
      b.addEventListener("click", function(){ applyGrammar(f); });
      sg.appendChild(b);
    }
    var show = document.createElement("button"); show.className = "ghost"; show.textContent = "Show";
    show.addEventListener("click", function(){ selectRange(f.i, f.i + f.len); });
    sg.appendChild(show);
    var ig = document.createElement("button"); ig.className = "ghost"; ig.textContent = "Dismiss";
    ig.addEventListener("click", function(){ grammarFindings.splice(grammarFindings.indexOf(f), 1); renderGrammar(); });
    sg.appendChild(ig);
    d.appendChild(sg);
    out.appendChild(d);
  });
}
function applyGrammar(f){
  pushUndo(true);
  memo.value = memo.value.slice(0, f.i) + f.rep + memo.value.slice(f.i + f.len);
  onMemoChanged();
  grammarFindings.splice(grammarFindings.indexOf(f), 1);
  checkGrammar();
}
function fixAllGrammar(){
  if(!grammarFindings.length){ toast("Nothing to fix"); return; }
  var list = grammarFindings.filter(function(f){ return f.rep != null; }).slice().sort(function(a,b){ return a.i - b.i; });
  if(!list.length){ toast("Nothing to fix"); return; }
  pushUndo(true);
  var src = memo.value, res = "", cursor = 0, applied = 0;
  for(var k = 0; k < list.length; k++){
    var f = list[k];
    if(f.i < cursor) continue;              // range overlaps an earlier fix – skip, re-check will catch it
    res += src.slice(cursor, f.i) + f.rep;
    cursor = f.i + f.len;
    applied++;
  }
  res += src.slice(cursor);
  memo.value = res;
  onMemoChanged(); checkGrammar();
  toast("Applied " + applied + " fix" + (applied !== 1 ? "es" : ""));
}
$("#btnGrammar").addEventListener("click", checkGrammar);
$("#btnGrammarFixAll").addEventListener("click", fixAllGrammar);
$("#btnGrammarClear").addEventListener("click", function(){ grammarFindings = []; $("#grammarOut").innerHTML = "<div class='empty'>Not checked yet.</div>"; });

/* ================================================================
   FIND & REPLACE
   ================================================================ */
function findRe(){
  var q = $("#findText").value;
  if(!q) return null;
  var esc2 = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if($("#findWord").checked) esc2 = "\\b" + esc2 + "\\b";
  return new RegExp(esc2, $("#findCase").checked ? "g" : "gi");
}
function findFrom(start, dir){
  var re = findRe(); if(!re){ $("#findStat").textContent = "Enter something to find."; return; }
  var t = memo.value, hits = [], m;
  while((m = re.exec(t))){ hits.push([m.index, m.index + m[0].length]); if(m.index === re.lastIndex) re.lastIndex++; }
  if(!hits.length){ $("#findStat").textContent = "No matches."; return; }
  var idx;
  if(dir > 0) idx = hits.findIndex(function(h){ return h[0] >= start; });
  else { idx = -1; for(var i=0;i<hits.length;i++){ if(hits[i][1] <= start) idx = i; } }
  if(idx < 0) idx = dir > 0 ? 0 : hits.length - 1;
  var h = hits[idx];
  memo.focus(); memo.setSelectionRange(h[0], h[1]);
  var line = t.slice(0, h[0]).split("\n").length;
  memo.scrollTop = Math.max(0, (line - 3) * S.font * 1.5);
  $("#findStat").textContent = (idx + 1) + " of " + hits.length + " match" + (hits.length>1?"es":"");
}
$("#btnFindNext").addEventListener("click", function(){ findFrom(memo.selectionEnd, 1); });
$("#btnFindPrev").addEventListener("click", function(){ findFrom(memo.selectionStart, -1); });
$("#btnReplaceOne").addEventListener("click", function(){
  var re = findRe(); if(!re) return;
  var s = memo.selectionStart, e = memo.selectionEnd, sel = memo.value.slice(s, e);
  var one = new RegExp(re.source, re.flags.replace("g",""));
  if(e > s && one.test(sel)){
    pushUndo(true);
    memo.value = memo.value.slice(0, s) + $("#replaceText").value + memo.value.slice(e);
    onMemoChanged();
  }
  findFrom(s + $("#replaceText").value.length, 1);
});
$("#btnReplaceAll").addEventListener("click", function(){
  var re = findRe(); if(!re){ return; }
  var n = (memo.value.match(re) || []).length;
  if(!n){ $("#findStat").textContent = "No matches."; return; }
  pushUndo(true);
  memo.value = memo.value.replace(re, $("#replaceText").value);
  onMemoChanged();
  $("#findStat").textContent = "Replaced " + n + ".";
});

/* ================================================================
   STATS
   ================================================================ */
function syllables(w){
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if(w.length <= 3) return w.length ? 1 : 0;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  var m = w.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}
function refreshStats(){
  var t = memo.value, out = $("#statsOut");
  var words = (t.trim().match(/\S+/g) || []);
  var sents = (t.match(/[^.!?\n]+[.!?]+|\S[^.!?\n]*$/g) || []).filter(function(s){ return s.trim(); });
  var paras = t.split(/\n{2,}/).filter(function(p){ return p.trim(); });
  var syl = words.reduce(function(a, w){ return a + syllables(w); }, 0);
  var wc = words.length, sc = Math.max(1, sents.length);
  var flesch = wc ? Math.round(206.835 - 1.015 * (wc / sc) - 84.6 * (syl / wc)) : 0;
  var chNo = t.replace(/\s/g, "").length;
  out.innerHTML =
    row("Words", wc) + row("Characters", t.length + " (" + chNo + " without spaces)") +
    row("Sentences", sents.length) + row("Paragraphs", paras.length) +
    row("Avg words / sentence", wc ? (wc / sc).toFixed(1) : "0") +
    row("Reading ease (Flesch)", flesch + " " + fleschTag(flesch)) +
    row("Speaking time", fmtDur(Math.round(wc / (200 * S.ttsRate) * 60))) +
    row("Reading time", fmtDur(Math.round(wc / 238 * 60)));
  function row(k, v){ return "<div class='item'><div class='m'><b>" + k + ":</b> " + esc(String(v)) + "</div></div>"; }
}
function fleschTag(f){ return f>=70?"(easy)":f>=50?"(fairly hard)":f>=30?"(hard)":f<=0?"":"(very hard)"; }
$("#btnStats").addEventListener("click", refreshStats);

/* ================================================================
   EXPORT / CLIPBOARD
   ================================================================ */
function copyText(t){
  if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
  return new Promise(function(res, rej){
    try{ memo.focus(); memo.select(); document.execCommand("copy"); memo.setSelectionRange(memo.value.length, memo.value.length); res(); }
    catch(e){ rej(e); }
  });
}
function download(name, mime){
  var blob = new Blob([memo.value], { type: mime });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function stamp(){ return new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"); }
$("#btnCopy").addEventListener("click", function(){ if(!memo.value){ toast("Nothing to copy"); return; } copyText(memo.value).then(function(){ toast("Copied to clipboard"); }).catch(function(){ toast("Copy failed"); }); });
$("#btnCopyClear").addEventListener("click", function(){ if(!memo.value){ toast("Nothing to copy"); return; } copyText(memo.value).then(function(){ pushUndo(true); memo.value = ""; onMemoChanged(); toast("Copied – note cleared"); }); });
$("#btnShare").addEventListener("click", function(){ if(!memo.value){ toast("Nothing to share"); return; } if(navigator.share) navigator.share({ text: memo.value }).catch(function(){}); else copyText(memo.value).then(function(){ toast("Sharing not supported – copied instead"); }); });
$("#btnPaste").addEventListener("click", function(){
  if(!navigator.clipboard || !navigator.clipboard.readText){ toast("Paste not supported – use Ctrl+V in the note"); return; }
  navigator.clipboard.readText().then(function(txt){ if(!txt) return; pushUndo(true); var s = memo.selectionStart; memo.value = memo.value.slice(0,s) + txt + memo.value.slice(memo.selectionEnd); onMemoChanged(); toast("Pasted"); }).catch(function(){ toast("Clipboard blocked"); });
});
$("#btnDownload").addEventListener("click", function(){ download("dictation-" + stamp() + ".txt", "text/plain"); });
$("#btnDownloadMd").addEventListener("click", function(){ download("dictation-" + stamp() + ".md", "text/markdown"); });
$("#btnPrint").addEventListener("click", function(){ closeSheet(); setTimeout(function(){ window.print(); }, 120); });
$("#btnClear").addEventListener("click", function(){ if(!memo.value) return; if(confirm("Clear the whole note? (Undo can bring it back this session.)")){ pushUndo(true); memo.value = ""; onMemoChanged(); } });
$("#btnUndo").addEventListener("click", doUndo);
$("#btnRedo").addEventListener("click", doRedo);

/* ================================================================
   EDIT / FORMAT TOOLS
   ================================================================ */
function titleCase(s){
  var small = /^(a|an|and|as|at|but|by|for|if|in|of|on|or|the|to|vs?\.?|via)$/i;
  return s.replace(/\w[^\s]*/g, function(w, i){
    var prev = s.slice(0, i).replace(/\s+$/, "").slice(-1);
    var sStart = i === 0 || prev === "" || /[.!?:\n]/.test(prev);
    if(!sStart && small.test(w)) return w.toLowerCase();
    if(/^[A-Z0-9]{2,}$/.test(w) || /[a-z][A-Z]/.test(w)) return w;   // keep NASA, iPhone, McDonald
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}
function sentenceCase(s){
  return s.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)([a-z])/g, function(_, p, c){ return p + c.toUpperCase(); }).replace(/\bi\b/g, "I");
}
document.querySelectorAll("[data-fmt]").forEach(function(b){
  b.addEventListener("click", function(){
    pushUndo(true);
    var v = memo.value, f = b.dataset.fmt;
    if(f === "sentence") v = sentenceCase(v);
    else if(f === "lower") v = v.toLowerCase();
    else if(f === "upper") v = v.toUpperCase();
    else if(f === "title") v = titleCase(v);
    else if(f === "trim") v = v.replace(/[ \t]+/g, " ").replace(/ +([,.;:!?])/g, "$1").replace(/[ \t]+$/gm, "").replace(/([,.;:!?])(?=[A-Za-z])/g, function(p, _c, off, all){ return isUrlish(all, off) ? p : p + " "; });
    else if(f === "blanks") v = v.replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
    else if(f === "quotes") v = v.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    else if(f === "stamp"){ var d = new Date().toLocaleString(); v = v + (v && !/\n$/.test(v) ? "\n" : "") + d + "\n"; }
    memo.value = v; onMemoChanged(); refreshStats(); toast("Done");
  });
});

/* ================================================================
   COMMANDS SHEET
   ================================================================ */
function renderCmds(){
  var rows = [
    ["full stop / comma / question mark", "punctuation . , ?"],
    ["exclamation mark / colon mark / semicolon", "! : ;"],
    ["new line", "line break"],
    ["new paragraph", "blank line + new paragraph"],
    ["new bullet", "start a • bullet line"],
    ["open quote / close quote", "“ ”"],
    ["open bracket / close bracket", "( )"],
    ["hyphen mark / dash mark / ellipsis", "- – …"],
    ["hash sign / at sign / percent sign / ampersand", "# @ % &"],
    ["capitalise <word>", "capitalise the next word"],
    ["all caps <word>", "UPPERCASE the next word"],
    ["caps on / caps off", "hold everything in UPPERCASE"],
    ["scratch that", "remove the last thing inserted"],
    ["delete last word / sentence / line", "trim the end of the note"],
    ["join lines", "merge single line-breaks into spaces"],
    ["replace <words> with <words>", "change the last place those words appear"],
    ["insert date / insert time", "today's date, or the time"],
    ["read that back", "hear the last sentence (listening pauses meanwhile)"],
    ["undo / redo", "same as the Undo / Redo buttons"],
    ["smiley face / heart emoji / thumbs up emoji", "🙂 ❤️ 👍"],
    ["stop dictation", "pause listening"],
    ["um, uh, er…", "left out automatically (Settings → Dictation)"],
    ["your own phrases", "Settings → My words: say a short phrase, get any text"]
  ];
  $("#cmdsList").innerHTML = rows.map(function(r){ return "<div class='crow'><code>" + esc(r[0]) + "</code><span>" + esc(r[1]) + "</span></div>"; }).join("");
}

/* ================================================================
   SETTINGS WIRING
   ================================================================ */
function bindToggle(id, key, after){ var el = $(id); el.checked = !!S[key]; el.addEventListener("change", function(){ S[key] = el.checked; save(); if(after) after(); }); }
function bindSelect(id, key, after){ var el = $(id); el.value = S[key]; el.addEventListener("change", function(){ S[key] = el.value; save(); if(after) after(); }); }
(function(){
  var sel = $("#setModel");
  SP.MODELS.forEach(function(m){ var o = document.createElement("option"); o.value = m.id; o.textContent = m.name + " · ~" + m.mb + " MB · " + m.hint; sel.appendChild(o); });
})();
function privateFieldsVis(){
  var on = S.engine === "private";
  $("#fldModel").style.display = on ? "" : "none";
  $("#fldModelHint").style.display = on ? "" : "none";
  if(on) SP.isCached(S.model).then(function(yes){ $("#modelState").textContent = yes ? "Downloaded – works offline." : "Downloads once (~" + SP.modelInfo(S.model).mb + " MB) the first time you dictate."; });
}
function restartIfListening(){ if(mode === "listening"){ pauseRec(); startRec(); } }
bindSelect("#setEngine", "engine", function(){ setModeIdle(); privateFieldsVis(); reflectMode(); toast(S.engine === "private" ? "Private engine – runs on this device" : "Google engine"); });
bindSelect("#setModel", "model", function(){ if(mode !== "idle") setModeIdle(); privateFieldsVis(); });
bindSelect("#setMode", "mode", function(){ setModeIdle(); reflectMode(); });
bindSelect("#setLang", "lang", function(){ if(S.engine !== "private") restartIfListening(); loadVoices(); });
bindSelect("#setSilence", "silence", armSilence);
bindToggle("#gStyle", "style");
bindToggle("#setPunct", "punct");
bindToggle("#setNumbers", "numbers");
bindToggle("#setCap", "cap");
bindToggle("#setInterim", "interim", function(){ if(!S.interim) $("#interim").textContent = ""; restartIfListening(); });
bindToggle("#setContinuous", "continuous");
bindToggle("#setProfanity", "profanity", restartIfListening);
bindToggle("#setFillers", "fillers");
bindToggle("#setKeepAudio", "keepAudio", function(){ if(S.keepAudio && S.engine !== "private" && SP.isAndroid) toast("On Android, recordings are kept with the Private engine only"); });
bindToggle("#setWake", "wake");
bindToggle("#setInsert", "insertAtCursor");
bindSelect("#setDict", "dict", function(){ speller = null; spellerFor = ""; });
var setFont = $("#setFont"); setFont.value = S.font; applyFont();
setFont.addEventListener("input", function(){ S.font = +setFont.value; applyFont(); save(); });
function applyFont(){ document.documentElement.style.setProperty("--memo-fs", S.font + "px"); $("#setFontV").textContent = S.font; }
bindToggle("#gLT", "useLT");
$("#ttsFollow").checked = S.ttsFollow;
$("#ttsFollow").addEventListener("change", function(){ S.ttsFollow = $("#ttsFollow").checked; save(); });
function bindRange(id, vid, key){
  var el = $(id), lbl = $(vid);
  el.value = S[key]; lbl.textContent = (+S[key]).toFixed(1);
  el.addEventListener("input", function(){ S[key] = +el.value; lbl.textContent = (+el.value).toFixed(1); save(); if(key === "ttsRate"){ updCount(); } });
}
bindRange("#ttsRate", "#ttsRateV", "ttsRate");
bindRange("#ttsPitch", "#ttsPitchV", "ttsPitch");
bindRange("#ttsVol", "#ttsVolV", "ttsVol");
(function(){
  var g = $("#setGain"), gv = $("#setGainV"); g.value = S.micGain; gv.textContent = (+S.micGain).toFixed(1);
  g.addEventListener("input", function(){ S.micGain = +g.value; gv.textContent = (+g.value).toFixed(1); save(); });
  var q = $("#setGate"), qv = $("#setGateV"); q.value = S.noiseGate; qv.textContent = (+S.noiseGate).toFixed(3);
  q.addEventListener("input", function(){ S.noiseGate = +q.value; qv.textContent = (+q.value).toFixed(3); save(); paintGateMark(); });
})();
privateFieldsVis();
$("#setModel").value = S.model;
$("#ttsVoice").addEventListener("change", function(){ var v = voices[parseInt($("#ttsVoice").value)]; if(v){ S.ttsVoice = v.name; save(); } });
$("#btnReset").addEventListener("click", function(){
  if(!confirm("Reset all settings to defaults? Your notes are kept.")) return;
  S = Object.assign({}, DEF); save(); location.reload();
});

/* ================================================================
   INSTALL PROMPT
   ================================================================ */
var deferredPrompt = null;
window.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); deferredPrompt = e; $("#grpInstall").style.display = ""; });
$("#btnInstall").addEventListener("click", function(){ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt.userChoice.finally(function(){ deferredPrompt = null; $("#grpInstall").style.display = "none"; }); });

/* ================================================================
   DRAG & DROP A TEXT FILE
   ================================================================ */
["dragover","dragenter"].forEach(function(ev){ memo.addEventListener(ev, function(e){ e.preventDefault(); memo.classList.add("dragover"); }); });
["dragleave","dragend","drop"].forEach(function(ev){ memo.addEventListener(ev, function(){ memo.classList.remove("dragover"); }); });
memo.addEventListener("drop", function(e){
  var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if(!file) return;
  e.preventDefault();
  if(/^(audio|video)\//.test(file.type) || /\.(mp3|m4a|wav|ogg|opus|webm|aac|flac|mp4)$/i.test(file.name)){ transcribeFile(file); return; }
  file.text().then(function(txt){
    if(memo.value.trim() && !confirm("Replace the current note with “" + file.name + "”?")){
      pushUndo(true); var s = memo.selectionStart; memo.value = memo.value.slice(0,s) + txt + memo.value.slice(memo.selectionEnd);
    } else { pushUndo(true); memo.value = txt; }
    onMemoChanged(); toast("Loaded " + file.name);
  });
});

/* ================================================================
   KEYBOARD
   ================================================================ */
document.addEventListener("keydown", function(e){
  var mod = e.ctrlKey || e.metaKey;
  if(mod && e.code === "Space"){ e.preventDefault(); if(S.mode==="ptt"){ toast("Push-to-talk: hold the button"); return; } if(mode === "listening") pauseRec(); else startRec(); }
  else if(e.key === "Escape" && document.querySelector(".sheet.show")){ closeSheet(); }
  else if(e.key === "Escape" && mode !== "idle"){ setModeIdle(); }
  else if(mod && !e.shiftKey && (e.key === "z" || e.key === "Z")){ e.preventDefault(); doUndo(); }
  else if(mod && (e.key === "y" || (e.shiftKey && (e.key === "z" || e.key === "Z")))){ e.preventDefault(); doRedo(); }
  else if(mod && (e.key === "f" || e.key === "F")){ e.preventDefault(); openSheet("edit"); $("#findText").focus(); }
  else if(mod && (e.key === "s" || e.key === "S")){ e.preventDefault(); download("dictation-" + stamp() + ".txt", "text/plain"); }
  else if(mod && e.key === "Enter"){ e.preventDefault(); play(false); }
});

/* ================================================================
   SHARE-TARGET / SHORTCUT PARAMS
   ================================================================ */
function handleParams(){
  var p = new URLSearchParams(location.search);
  var shared = [p.get("title"), p.get("text"), p.get("url")].filter(Boolean).join("\n");
  if(shared){ pushUndo(true); memo.value = (memo.value ? memo.value.replace(/\s*$/, "") + "\n\n" : "") + shared; onMemoChanged(); toast("Added shared text"); }
  if(p.get("action") === "new") $("#btnNewNote").click();
  if(p.get("action") === "dictate"){ setTimeout(function(){ try{ startRec(); }catch(e){} }, 400); }
  if(shared || p.get("action")){ try{ history.replaceState(null, "", location.pathname); }catch(e){} }
}

/* ================================================================
   INIT
   ================================================================ */
loadNotes();
$("#setMode").value = S.mode;
$("#setEngine").value = S.engine;
privateFieldsVis();
renderUserDict();
updCount();
reflectMode();
handleParams();
warmPrivate();
if(new URLSearchParams(location.search).get("debug") === "1"){
  window.DSRDICT = { commit: commit, S: S, SP: SP, offlineGrammar: offlineGrammar, isUrlish: isUrlish, titleCase: titleCase,
                     loadSpeller: loadSpeller, transcribeFile: transcribeFile, saveRecording: saveRecording, notes: function(){ return notes; } };
}
if("serviceWorker" in navigator){
  window.addEventListener("load", function(){ navigator.serviceWorker.register("service-worker.js").catch(function(){}); });
}
})();
