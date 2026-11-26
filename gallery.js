// Photo carousel + full-screen lightbox. Plain JS, no dependencies.
// Behaviour matches the original site: autoplay every 5.5 s (paused on hover,
// focus or while the lightbox is open), arrows, dots, Esc / ← / → in the lightbox.
(function () {
  var photos = [
    { src: "/gallery/gallery-18.jpg", alt: "Fire burning in the cabin fireplace while porch lights glow over Wilson Lake at dusk", caption: "Fireside, with the lake out the window", fit: "contain" },
    { src: "/gallery/gallery-17.jpg", alt: "Bare winter trees silhouetted against an orange sunset over Wilson Lake", caption: "Winter sunset on Wilson Lake" },
    { src: "/gallery/gallery-15.jpg", alt: "Stone-faced wood-burning fireplace in the cabin living room", caption: "The wood-burning fireplace" },
    { src: "/gallery/gallery-13.jpg", alt: "Fire glowing beside Wilson Lake after dark", caption: "Lake nights by the fire" },
    { src: "/gallery/gallery-16.jpg", alt: "Living room with sofas gathered around the fireplace under exposed beams", caption: "Gathered around the fireplace" },
    { src: "/gallery/gallery-02.jpg", alt: "Orange sunset over Wilson Lake", caption: "Sunset over Wilson Lake" },
    { src: "/gallery/gallery-05.jpg", alt: "Twilight view of Wilson Lake through tall trees", caption: "Evening at the lake" },
    { src: "/gallery/gallery-08.jpg", alt: "Wide view of Wilson Lake from the cabin lawn", caption: "Bare branches, open views" },
    { src: "/gallery/gallery-10.jpg", alt: "Open living area with wood floors and exposed beams", caption: "Open living space" },
    { src: "/gallery/gallery-14.jpg", alt: "Oversized porch swing facing the lake", caption: "The porch swing" },
    { src: "/gallery/gallery-06.jpg", alt: "Fully equipped kitchen and dining area inside the cabin", caption: "Kitchen and dining area" },
    { src: "/gallery/gallery-07.jpg", alt: "Cabin bedroom with a queen bed and lake-themed bedding", caption: "Queen bedroom" },
    { src: "/gallery/gallery-09.jpg", alt: "Cabin bedroom with twin bunk beds", caption: "Bunk room" },
    { src: "/gallery/gallery-11.jpg", alt: "Full bathroom with tub and shower", caption: "One of two full bathrooms" },
    { src: "/gallery/gallery-03.jpg", alt: "Exterior of the Let's Explore cabin beside Wilson Lake", caption: "Let’s Explore on Wilson Lake" },
    { src: "/gallery/gallery-01.jpg", alt: "Shaded lakefront lawn with picnic table and water view", caption: "The lakefront lawn" },
    { src: "/gallery/gallery-04.jpg", alt: "Sunlight filtering through trees beside the private dock", caption: "Steps from the water" },
    { src: "/gallery/gallery-12.jpg", alt: "Entrance sign for The Cove at Doublehead", caption: "The Cove at Doublehead" }
  ];

  var shell = document.querySelector(".carousel-shell");
  if (!shell) return;

  var index = 0, hovering = false, open = false, timer = null, lightbox = null, prevOverflow = "";

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "on") for (var ev in attrs.on) node.addEventListener(ev, attrs.on[ev]);
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { node.appendChild(c); });
    return node;
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function go(i) { index = (i + photos.length) % photos.length; render(); }
  function prev() { go(index - 1); }
  function next() { go(index + 1); }
  // Visitor-initiated changes report to /track.js (autoplay does not).
  function emit(a) {
    try { document.dispatchEvent(new CustomEvent("lw:gallery", { detail: { a: a, i: index, cap: photos[index].caption } })); } catch (e) {}
  }
  function userGo(i, a) { go(i); emit(a); }
  function userPrev() { userGo(index - 1, "prev"); }
  function userNext() { userGo(index + 1, "next"); }

  // ---- carousel ----
  var images = photos.map(function (p, i) {
    var img = el("img", { class: "carousel-image", src: p.src, alt: "", loading: i < 2 ? "eager" : "lazy" });
    if (p.fit) img.style.objectFit = p.fit; // e.g. "contain" for very wide photos
    return img;
  });
  var hint = el("span", { class: "enlarge-hint" }, [document.createTextNode("View full screen "), el("b", { text: "↗" })]);
  var stage = el("button", { class: "carousel-stage", type: "button", on: { click: openLightbox } }, images.concat([hint]));
  var caption = el("p");
  var counter = el("span");
  var dots = photos.map(function (p, i) {
    return el("button", { type: "button", "aria-label": "Show photo " + (i + 1) + ": " + p.caption, on: { click: function () { userGo(i, "dot"); } } });
  });

  shell.replaceChildren(
    stage,
    el("button", { class: "carousel-arrow carousel-arrow-left", type: "button", "aria-label": "Previous photo", text: "‹", on: { click: userPrev } }),
    el("button", { class: "carousel-arrow carousel-arrow-right", type: "button", "aria-label": "Next photo", text: "›", on: { click: userNext } }),
    el("div", { class: "carousel-meta", "aria-live": "polite" }, [caption, counter]),
    el("div", { class: "carousel-dots", "aria-label": "Choose a photo" }, dots)
  );
  shell.addEventListener("mouseenter", function () { hovering = true; schedule(); });
  shell.addEventListener("mouseleave", function () { hovering = false; schedule(); });
  shell.addEventListener("focusin", function () { hovering = true; schedule(); });
  shell.addEventListener("focusout", function () { hovering = false; schedule(); });

  function schedule() {
    clearInterval(timer);
    if (!hovering && !open) timer = setInterval(next, 5500);
  }

  // ---- lightbox ----
  var lbImg, lbCaption, lbCount, thumbs;
  function buildLightbox() {
    lbImg = el("img");
    lbCaption = el("span");
    lbCount = el("small");
    thumbs = photos.map(function (p, i) {
      return el("button", { type: "button", "aria-label": "View " + p.caption, on: { click: function () { userGo(i, "thumb"); } } },
        [el("img", { src: p.src, alt: "", loading: "lazy" })]);
    });
    var stop = { mousedown: function (e) { e.stopPropagation(); } };
    lightbox = el("div", { class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": "Cabin photo gallery",
      on: { mousedown: function (e) { if (e.target === lightbox) closeLightbox(); } } }, [
      el("button", { class: "lightbox-close", type: "button", "aria-label": "Close gallery", text: "×", on: { click: closeLightbox } }),
      el("button", { class: "lightbox-arrow lightbox-arrow-left", type: "button", "aria-label": "Previous photo", text: "‹", on: { click: userPrev } }),
      el("figure", { class: "lightbox-figure", on: stop }, [lbImg, el("figcaption", {}, [lbCaption, lbCount])]),
      el("button", { class: "lightbox-arrow lightbox-arrow-right", type: "button", "aria-label": "Next photo", text: "›", on: { click: userNext } }),
      el("div", { class: "lightbox-thumbnails", "aria-label": "Photo thumbnails", on: stop }, thumbs)
    ]);
  }
  function onKey(e) {
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") userPrev();
    else if (e.key === "ArrowRight") userNext();
  }
  function openLightbox() {
    if (!lightbox) buildLightbox();
    open = true;
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(lightbox);
    window.addEventListener("keydown", onKey);
    lightbox.querySelector(".lightbox-close").focus();
    schedule();
    render();
    emit("open");
  }
  function closeLightbox() {
    open = false;
    document.body.style.overflow = prevOverflow;
    lightbox.remove();
    window.removeEventListener("keydown", onKey);
    stage.focus();
    schedule();
    emit("close");
  }

  function render() {
    var p = photos[index];
    images.forEach(function (img, i) {
      var active = i === index;
      img.className = active ? "carousel-image is-active" : "carousel-image";
      img.alt = active ? p.alt : "";
      img.setAttribute("aria-hidden", active ? "false" : "true");
    });
    stage.setAttribute("aria-label", "Enlarge photo: " + p.caption);
    caption.textContent = p.caption;
    counter.textContent = pad(index + 1) + " / " + photos.length;
    dots.forEach(function (d, i) {
      d.className = i === index ? "is-active" : "";
      if (i === index) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
    });
    if (open) {
      lbImg.src = p.src;
      lbImg.alt = p.alt;
      lbCaption.textContent = p.caption;
      lbCount.textContent = (index + 1) + " of " + photos.length;
      thumbs.forEach(function (t, i) {
        t.className = i === index ? "is-active" : "";
        if (i === index) { t.setAttribute("aria-current", "true"); t.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }); }
        else t.removeAttribute("aria-current");
      });
    }
  }

  render();
  schedule();
})();
