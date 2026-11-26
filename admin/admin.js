// Visitor dashboard. All stored values are inserted as text (never HTML).
(function () {
  "use strict";
  var SECTIONS = [
    ["top", "Hero"], ["book", "Booking calendar"], ["walkthrough", "Video tour"], ["gallery", "Photo gallery"],
    ["cabin", "The cabin"], ["doublehead", "Doublehead"], ["lake-life", "Lake life"], ["shoals", "The Shoals"],
    ["dining", "Dining"], ["itinerary", "Ways to stay"], ["final-cta", "Closing / book again"], ["footer", "Footer"]
  ];
  var NAMES = {}; SECTIONS.forEach(function (s) { NAMES[s[0]] = s[1]; });
  var key = sessionStorage.getItem("lw_admin_key") || "", days = Number(sessionStorage.getItem("lw_admin_days")) || 30, data = [];
  var $ = function (id) { return document.getElementById(id); };

  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === "text") n.textContent = attrs[k]; else if (k === "on") n.addEventListener("click", attrs[k]); else n.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c); });
    return n;
  }
  function api(q) {
    return fetch("/api/admin?" + q, { headers: { Authorization: "Bearer " + key } }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.message || j.error || r.status); return j; });
    });
  }
  function dur(ms) { var s = Math.round((ms || 0) / 1000); return s < 60 ? s + "s" : Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s"; }
  function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "–"; }
  function median(a) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }
  function when(ts) { return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function place(s) { return [s.city, s.region, s.country].filter(Boolean).join(", ") || "Unknown"; }
  function count(list, fn) { var m = {}; list.forEach(function (x) { [].concat(fn(x)).forEach(function (k) { if (k) m[k] = (m[k] || 0) + 1; }); }); return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); }

  function table(id, head, rows, opts) {
    opts = opts || {};
    var t = $(id); t.replaceChildren();
    t.appendChild(h("tr", null, head.map(function (c, i) { return h("th", { class: i ? "n" : "" , text: c }); })));
    if (!rows.length) { t.appendChild(h("tr", null, [h("td", { class: "muted", colspan: head.length, text: "Nothing yet" })])); return; }
    var max = Math.max.apply(null, rows.map(function (r) { return Number(r[1]) || 0; })) || 1;
    rows.slice(0, opts.limit || 15).forEach(function (r) {
      t.appendChild(h("tr", null, r.map(function (c, i) {
        if (i === 0 && opts.bars !== false) {
          var w = (Number(r[1]) || 0) / max * 100;
          return h("td", { class: "barcell" }, [h("i", { style: "width:" + w + "%" }), h("span", { text: c })]);
        }
        return h("td", { class: i ? "n" : "", text: c });
      })));
    });
  }

  function render() {
    var S = data, n = S.length;
    var visitors = {}; S.forEach(function (s) { visitors[s.vid] = 1; });
    var returning = S.filter(function (s) { return s.visit > 1; }).length;
    var booked = S.filter(function (s) { return s.booking > 0 || (s.sections.book && s.sections.book.ms >= 5000); }).length;
    var bookFocus = S.filter(function (s) { return s.booking > 0; }).length;
    var kpis = [
      [n, "Visits"], [Object.keys(visitors).length, "Unique visitors"], [pct(returning, n), "Return visits"],
      [dur(median(S.map(function (s) { return s.engagedMs; }))), "Median engaged time"],
      [median(S.map(function (s) { return s.maxScroll; })) + "%", "Median scroll depth"],
      [pct(bookFocus, n), "Used booking calendar"], [pct(booked, n), "Spent 5s+ at booking"],
      [pct(S.filter(function (s) { return s.video.plays; }).length, n), "Played the video"],
      [pct(S.filter(function (s) { return s.gallery.views; }).length, n), "Browsed photos"]
    ];
    $("kpis").replaceChildren.apply($("kpis"), kpis.map(function (k) { return h("div", { class: "kpi" }, [h("b", { text: k[0] }), h("span", { text: k[1] })]); }));

    // per-day bars
    var byDay = {}, today = new Date(); today.setHours(0, 0, 0, 0);
    for (var i = days - 1; i >= 0; i--) { var d = new Date(today); d.setDate(d.getDate() - i); byDay[d.toDateString()] = 0; }
    S.forEach(function (s) { var k = new Date(s.start).toDateString(); if (k in byDay) byDay[k]++; });
    var vals = Object.keys(byDay).map(function (k) { return [k, byDay[k]]; }), mx = Math.max.apply(null, vals.map(function (v) { return v[1]; })) || 1;
    $("days").replaceChildren.apply($("days"), vals.map(function (v) { return h("div", { style: "height:" + (v[1] / mx * 100) + "%", title: new Date(v[0]).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + ": " + v[1] + " visits" }); }));
    var f = function (s) { return new Date(s).toLocaleDateString([], { month: "short", day: "numeric" }); };
    $("daylabels").replaceChildren(h("span", { text: f(vals[0][0]) }), h("span", { text: f(vals[vals.length - 1][0]) }));

    table("funnel", ["Section", "Reached", "Avg time"], SECTIONS.map(function (sec) {
      var hit = S.filter(function (s) { return s.sections[sec[0]]; });
      var ms = hit.reduce(function (a, s) { return a + (s.sections[sec[0]].ms || 0); }, 0);
      return [sec[1], pct(hit.length, n), dur(hit.length ? ms / hit.length : 0)];
    }).map(function (r) { return [r[0], r[1], r[2]]; }), { limit: 20, bars: false });
    // draw funnel bars from the percentage column
    Array.prototype.forEach.call($("funnel").querySelectorAll("tr"), function (tr, i) {
      if (!i) return; var c = tr.children; if (c.length < 3) return;
      var w = parseInt(c[1].textContent, 10) || 0; var td = c[0]; var txt = td.textContent; td.className = "barcell"; td.replaceChildren(h("i", { style: "width:" + w + "%" }), h("span", { text: txt }));
    });

    table("sources", ["Source", "Visits", "Share"], count(S, function (s) { return s.source; }).map(function (r) { return [r[0], r[1], pct(r[1], n)]; }));
    table("places", ["Place", "Visits"], count(S, place), { limit: 40 });
    table("devices", ["Device", "Visits", "Share"], count(S, function (s) { return s.device; }).map(function (r) { return [r[0], r[1], pct(r[1], n)]; }));

    table("clicks", ["What", "Clicks"], aggregateClicks(S), { limit: 30 });
    table("outbound", ["Link", "Visits"], count(S, function (s) { return s.outbound.filter(function (v, i, a) { return a.indexOf(v) === i; }); }), { limit: 20 });
    table("photos", ["Photo", "Visits"], count(S, function (s) { return s.gallery.photos; }), { limit: 20 });
    table("dead", ["Signal", "Visits"], [
      ["Clicked something that isn't a link or button", S.filter(function (s) { return s.dead; }).length],
      ["Rage clicks (3 fast clicks in one spot)", S.filter(function (s) { return s.rage; }).length],
      ["Page errors", S.filter(function (s) { return s.errors; }).length],
      ["Copied text", S.filter(function (s) { return s.copies; }).length]
    ], { bars: false });
    table("campaigns", ["Campaign / landing", "Visits"], count(S, function (s) {
      var u = s.utm || {}; return u.campaign ? (u.source || "?") + " / " + (u.medium || "?") + " / " + u.campaign : s.landing && s.landing !== "/" ? s.landing : null;
    }));
    table("tech", ["Browser · system · screen", "Visits"], count(S, function (s) { return s.browser + " · " + s.os + " · " + s.viewport; }), { limit: 20 });

    var vt = $("visits"); vt.replaceChildren(h("tr", null, ["When", "Where", "Source", "Device", "Engaged", "Scroll", "Clicks", "Reached", "Booking"].map(function (c, i) { return h("th", { class: i > 3 ? "n" : "", text: c }); })));
    S.slice(0, 300).forEach(function (s) {
      var furthest = SECTIONS.filter(function (x) { return s.sections[x[0]]; }).pop();
      vt.appendChild(h("tr", { class: "row", on: function () { openVisit(s.sid); } }, [
        h("td", { text: when(s.start) + (s.visit > 1 ? " · visit " + s.visit : "") }), h("td", { text: place(s) }), h("td", { text: s.source }),
        h("td", { text: s.device + " · " + s.os }), h("td", { class: "n", text: dur(s.engagedMs) }), h("td", { class: "n", text: s.maxScroll + "%" }),
        h("td", { class: "n", text: s.clicks }), h("td", { class: "n", text: furthest ? furthest[1] : "–" }),
        h("td", { class: "n" }, [s.booking ? h("span", { class: "pill", text: "used" }) : document.createTextNode("")])
      ]));
    });
  }

  // Click labels aren't in the summary; derive a short list from summaries (outbound) plus a lazy fetch of recent visits.
  var clickAgg = null;
  function aggregateClicks() { return clickAgg || [["Loading…", ""]]; }
  function loadClicks() {
    var recent = data.slice(0, 60), m = {};
    Promise.all(recent.map(function (s) { return api("session=" + encodeURIComponent(s.sid)).catch(function () { return null; }); })).then(function (all) {
      all.forEach(function (v) {
        if (!v) return; var seen = {};
        v.events.forEach(function (e) { if (e.k === "click") { var k = (e.label || e.href || e.tag) + (e.s ? "  ·  " + (NAMES[e.s] || e.s) : ""); if (!seen[k]) { seen[k] = 1; m[k] = (m[k] || 0) + 1; } } });
      });
      clickAgg = Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
      if (!clickAgg.length) clickAgg = [];
      table("clicks", ["What (latest " + recent.length + " visits)", "Visits"], clickAgg, { limit: 30 });
    });
  }

  function openVisit(sid) {
    api("session=" + encodeURIComponent(sid)).then(function (v) {
      var s = v.meta;
      $("dTitle").textContent = when(s.start) + " · " + place(s);
      var dl = h("dl");
      [["Source", s.source + (s.ref ? " (" + s.ref + ")" : "")], ["Landing", s.landing], ["Visitor", "visit #" + s.visit + " from this browser"],
       ["Device", s.device + " · " + s.os + " · " + s.browser], ["Screen / window", s.screen + " / " + s.viewport + " @" + s.dpr + "x"],
       ["Language / time zone", s.lang + " / " + s.tz], ["Connection", s.conn || "–"], ["Dark mode", s.dark ? "yes" : "no"],
       ["Engaged time", dur(s.engagedMs)], ["Scroll depth", s.maxScroll + "%"],
       ["Video", s.video.plays ? s.video.plays + " play(s), watched to " + s.video.maxPct + "%" : "not played"],
       ["Photos chosen", s.gallery.photos.join(", ") || "none"],
       ["Time per section", SECTIONS.filter(function (x) { return s.sections[x[0]]; }).map(function (x) { return x[1] + " " + dur(s.sections[x[0]].ms); }).join(" · ") || "–"]
      ].forEach(function (r) { dl.appendChild(h("dt", { text: r[0] })); dl.appendChild(h("dd", { text: r[1] })); });
      var tl = h("table", { class: "tl" });
      v.events.forEach(function (e) {
        var desc = describe(e); if (!desc) return;
        tl.appendChild(h("tr", null, [h("td", { text: clock(e.t) }), h("td", { class: "k-" + e.k, text: desc })]));
      });
      $("dBody").replaceChildren(dl, h("h2", { text: "Timeline" }), tl);
      $("detail").showModal();
    }).catch(function (e) { alert(e.message); });
  }
  function clock(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function describe(e) {
    var where = e.s ? " (" + (NAMES[e.s] || e.s) + ")" : "";
    switch (e.k) {
      case "view": return "Opened the page";
      case "section": return "Reached " + (NAMES[e.s] || e.s);
      case "click": return "Clicked “" + (e.label || e.tag) + "”" + (e.href && e.href.charAt(0) !== "#" ? " → " + e.href : "") + where;
      case "dead": return "Clicked " + (e.label ? "“" + e.label + "” " : "") + "[" + e.tag + "], which isn't clickable" + where;
      case "rage": return "Rage-clicked “" + (e.label || "") + "”" + where;
      case "gallery": return { open: "Opened full-screen photos on", close: "Closed full-screen photos on" }[e.a] ? ({ open: "Opened full-screen photos on", close: "Closed full-screen photos on" }[e.a] + " “" + e.cap + "”") : "Gallery " + e.a + " → “" + e.cap + "”";
      case "video": return "Video " + e.a + (e.p != null ? " at " + e.p + "%" : "");
      case "booking": return "Started using the booking calendar";
      case "copy": return "Copied “" + e.text + "”";
      case "vis": return e.a === "hidden" ? "Switched away from the tab" : "Came back to the tab";
      case "leave": return "Left the page (scrolled " + e.n + "%)";
      case "error": return "Page error: " + e.msg;
      default: return null;
    }
  }

  function load() {
    $("ranges").replaceChildren.apply($("ranges"), [1, 7, 30, 90].map(function (d) {
      return h("button", { class: "btn" + (d === days ? " on" : ""), type: "button", text: d === 1 ? "24 h" : d + " days", on: function () { days = d; sessionStorage.setItem("lw_admin_days", d); load(); } });
    }));
    return api("days=" + days).then(function (j) {
      data = j.sessions || []; clickAgg = null;
      $("login").hidden = true; $("app").hidden = false;
      render(); loadClicks();
    });
  }

  function optLabel() {
    var out = false; try { out = localStorage.getItem("lw_optout") === "1"; } catch (e) {}
    $("optout").textContent = out ? "This device: not counted ✓" : "Don't count this device";
    $("optout").className = "btn" + (out ? " on" : "");
  }
  $("optout").addEventListener("click", function () {
    try { if (localStorage.getItem("lw_optout") === "1") localStorage.removeItem("lw_optout"); else localStorage.setItem("lw_optout", "1"); } catch (e) {}
    optLabel();
  });
  $("logout").addEventListener("click", function () { sessionStorage.removeItem("lw_admin_key"); location.reload(); });
  $("dClose").addEventListener("click", function () { $("detail").close(); });
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault(); key = $("key").value.trim(); $("err").textContent = "";
    load().then(function () { sessionStorage.setItem("lw_admin_key", key); }).catch(function (er) { $("err").textContent = er.message; });
  });
  optLabel();
  if (key) load().catch(function (er) { $("err").textContent = er.message; });
})();
