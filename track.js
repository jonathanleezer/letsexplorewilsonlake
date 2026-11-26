// First-party visit analytics for the owner's dashboard (/admin). No cookies, no third parties.
// Records: where the visit came from, device and screen, scroll depth, time on each section,
// clicks (what was clicked, never what was typed), gallery and video use, and when the booking
// calendar gets focus. Not recorded: keystrokes, form contents, IP addresses, anything inside
// the booking widget. Skipped entirely for Global Privacy Control, automated browsers, and
// devices opted out from the dashboard.
(function () {
  "use strict";
  var nav = navigator;
  if (nav.globalPrivacyControl || nav.webdriver) return;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }
  if (ls("lw_optout") === "1") return;

  var ENDPOINT = "/api/t", IDLE = 30 * 60 * 1000, MAX_EVENTS = 1500;
  function rid() {
    var a = new Uint8Array(12); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; });
    return Array.prototype.map.call(a, function (b) { return (b % 36).toString(36); }).join("") + Date.now().toString(36);
  }
  var now = Date.now();
  var vid = ls("lw_vid"); if (!vid) { vid = rid(); ls("lw_vid", vid); }
  var sid = ss("lw_sid"), sStart = Number(ss("lw_sstart")), lastAct = Number(ss("lw_last"));
  if (!sid || !lastAct || now - lastAct > IDLE) {
    sid = rid(); sStart = now; ss("lw_sid", sid); ss("lw_sstart", String(now));
    ls("lw_visits", String((Number(ls("lw_visits")) || 0) + 1));
  }
  ss("lw_last", String(now));

  var q = [], sent = 0, eng = Number(ss("lw_eng")) || 0, maxScroll = 0, sec = {};
  try { sec = JSON.parse(ss("lw_sec") || "{}"); } catch (e) { sec = {}; }
  function t() { return Date.now() - sStart; }
  function push(e) { if (sent + q.length >= MAX_EVENTS) return; e.t = t(); q.push(e); }

  var params = new URLSearchParams(location.search), utm = {};
  ["source", "medium", "campaign", "term", "content"].forEach(function (f) { var v = params.get("utm_" + f); if (v) utm[f] = v; });
  var mq = function (s) { return window.matchMedia && matchMedia(s).matches; };
  var ctx = {
    ref: document.referrer || "", path: location.pathname + location.search, utm: utm,
    sw: screen.width, sh: screen.height, vw: innerWidth, vh: innerHeight, dpr: window.devicePixelRatio || 1,
    lang: nav.language || "", tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || "",
    touch: "ontouchstart" in window || nav.maxTouchPoints > 0, conn: (nav.connection || {}).effectiveType || "",
    dark: mq("(prefers-color-scheme: dark)"), reduced: mq("(prefers-reduced-motion: reduce)"),
    visit: Number(ls("lw_visits")) || 1
  };

  var flushedEng = -1, flushedScroll = -1;
  function flush(beacon) {
    if (!q.length && eng === flushedEng && maxScroll === flushedScroll) return;
    var batch = q.splice(0, 200);
    sent += batch.length; flushedEng = eng; flushedScroll = maxScroll;
    var body = JSON.stringify({ sid: sid, vid: vid, ctx: ctx, events: batch, eng: eng, scroll: maxScroll, sec: sec });
    ss("lw_eng", String(eng)); ss("lw_sec", JSON.stringify(sec));
    try {
      if (beacon && nav.sendBeacon && nav.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {});
    } catch (e) {}
  }

  // ---- what part of the page is on screen ----
  function key(el) { return el.id || (el.className && String(el.className).split(" ")[0]) || el.tagName.toLowerCase(); }
  var visible = {}, reached = {};
  var blocks = document.querySelectorAll("main > section, footer");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var k = key(en.target), r = en.intersectionRect.height;
        var fill = Math.min(en.boundingClientRect.height, innerHeight);
        visible[k] = en.isIntersecting && r >= fill * 0.5;            // counts toward time on screen
        if (en.isIntersecting && r >= fill * 0.3 && !reached[k]) { reached[k] = 1; push({ k: "section", s: k }); }
      });
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
    blocks.forEach(function (b) { io.observe(b); });
  }

  // ---- engagement clock: counts while the tab is visible and the visitor did something in the last 30 s ----
  var lastInput = Date.now(), playing = false;
  ["scroll", "pointerdown", "pointermove", "keydown", "touchstart", "wheel"].forEach(function (ev) {
    addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true });
  });
  setInterval(function () {
    if (document.visibilityState !== "visible") return;
    if (!playing && Date.now() - lastInput > 30000) return;
    eng += 1000;
    for (var k in visible) if (visible[k]) sec[k] = (sec[k] || 0) + 1000;
    ss("lw_last", String(Date.now()));
  }, 1000);

  addEventListener("scroll", function () {
    var h = document.documentElement.scrollHeight;
    var p = Math.min(100, Math.round((scrollY + innerHeight) / h * 100));
    if (p > maxScroll) maxScroll = p;
  }, { passive: true });

  // ---- clicks (labels and links only; nothing typed is ever read) ----
  var burst = [];
  function label(el) {
    var head = el.querySelector && el.querySelector("h3, h2");
    var s = el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("title") ||
      (head && head.innerText) || el.innerText || el.textContent || "";
    return s.replace(/\s+/g, " ").trim().slice(0, 100);
  }
  document.addEventListener("click", function (e) {
    var target = e.target instanceof Element ? e.target : null; if (!target) return;
    var within = target.closest("main > section, footer, header");
    var s = within ? key(within) : "";
    var x = Math.round(e.pageX / document.documentElement.scrollWidth * 100), y = Math.round(e.pageY);
    var hit = target.closest("a, button, [role=button], video, summary, label");
    if (hit) {
      var ev = { k: "click", s: s, tag: hit.tagName.toLowerCase(), label: label(hit), x: x, y: y };
      if (hit.tagName === "A") ev.href = hit.getAttribute("href") || "";
      push(ev);
    } else if (!target.closest(".booking-widget")) {
      push({ k: "dead", s: s, tag: target.tagName.toLowerCase() + (target.classList[0] ? "." + target.classList[0] : ""), label: label(target).slice(0, 60), x: x, y: y });
    }
    var n = Date.now(); burst = burst.filter(function (b) { return n - b.t < 800 && Math.abs(b.x - e.clientX) < 40 && Math.abs(b.y - e.clientY) < 40; });
    burst.push({ t: n, x: e.clientX, y: e.clientY });
    if (burst.length === 3) push({ k: "rage", s: s, label: hit ? label(hit) : label(target).slice(0, 60) });
  }, true);

  // ---- gallery (gallery.js reports visitor actions; autoplay is not reported) ----
  document.addEventListener("lw:gallery", function (e) { var d = e.detail || {}; push({ k: "gallery", a: d.a, i: d.i, cap: d.cap }); });

  // ---- video tour ----
  var video = document.querySelector(".walkthrough-video");
  if (video) {
    var marks = {};
    video.addEventListener("play", function () { playing = true; push({ k: "video", a: "play", p: Math.round(video.currentTime / (video.duration || 1) * 100) }); });
    video.addEventListener("pause", function () { playing = false; if (!video.ended) push({ k: "video", a: "pause", p: Math.round(video.currentTime / (video.duration || 1) * 100) }); });
    video.addEventListener("ended", function () { playing = false; push({ k: "video", a: "ended", p: 100 }); });
    video.addEventListener("timeupdate", function () {
      var p = Math.floor(video.currentTime / (video.duration || 1) * 4) * 25;
      if (p > 0 && p < 100 && !marks[p]) { marks[p] = 1; push({ k: "video", a: "progress", p: p }); }
    });
  }

  // ---- booking calendar: the widget lives in its own frame, so we only learn that it got focus ----
  addEventListener("blur", function () {
    setTimeout(function () {
      var a = document.activeElement;
      if (a && a.tagName === "IFRAME" && a.closest(".booking-widget")) push({ k: "booking", a: "focus" });
    }, 0);
  });

  document.addEventListener("copy", function () {
    var s = String(window.getSelection ? getSelection() : "").replace(/\s+/g, " ").trim();
    if (s) push({ k: "copy", text: s.slice(0, 80) });
  });
  addEventListener("error", function (e) { push({ k: "error", msg: String(e.message || "").slice(0, 150) }); });

  document.addEventListener("visibilitychange", function () {
    push({ k: "vis", a: document.visibilityState });
    if (document.visibilityState === "hidden") flush(true);
  });
  addEventListener("pagehide", function () { push({ k: "leave", n: maxScroll }); flush(true); });

  push({ k: "view", label: document.title.slice(0, 80) });
  flush(false);
  setInterval(function () { flush(false); }, 15000);
})();
