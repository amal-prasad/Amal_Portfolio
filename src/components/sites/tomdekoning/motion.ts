import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";

type Cleanup = (() => void) | void;

const num = (value: string | undefined, fallback: number, min = -Infinity) => {
  const parsed = parseFloat(value ?? "");
  return Number.isFinite(parsed) ? Math.max(min, parsed) : fallback;
};

/** Boots every page behavior observed on the source. Returns a teardown. */
export function initMotion(root: HTMLElement): () => void {
  gsap.registerPlugin(ScrollTrigger, SplitText);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const abort = new AbortController();
  const { signal } = abort;
  const cleanups: Cleanup[] = [];
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const $$ = <T extends HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

  let refreshTimer = 0;
  const scheduleRefresh = () => {
    if (signal.aborted) return;
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 100);
  };

  /* Hero frames are fetched up front and decoded; the loader waits on them. */
  const seqEl = $(".image-sequence__element");
  const seqData: DOMStringMap = $("[data-sequence-canvas]")?.dataset ?? ({} as DOMStringMap);
  const seqFrames = Math.min(reduce ? 1 : Infinity, Math.floor(num(seqData.frames, 0, 0)));
  const seqFirst = Math.floor(num(seqData.indexStart, 0, 0));
  const seqDigits = Math.floor(num(seqData.digits, 3, 1));
  const frameCache = new Map<number, HTMLImageElement>();
  let framesSettled = 0;
  let onFrame = () => {};
  for (let k = 0; k < seqFrames; k++) {
    const index = seqFirst + k, img = new Image();
    const settle = () => { framesSettled++; };
    img.onload = () => {
      img.decode().catch(() => {}).then(() => {
        settle();
        if (signal.aborted) return;
        frameCache.set(index, img);
        onFrame();
      });
    };
    img.onerror = settle;
    img.src = `${seqData.src ?? ""}${String(index).padStart(seqDigits, "0")}.${seqData.filetype ?? "jpg"}`;
  }

  let loading = true;
  let lenis: Lenis | undefined;

  const ctx = gsap.context(() => {
    gsap.set($("#header"), { visibility: "visible" });
    if (!reduce) gsap.set(seqEl, { clipPath: "inset(100% 0% 0% 0%)" });
    runLoader();

    /* Live clock */
    const clocks = $$("[data-timezone]");
    let clockTimer = 0;
    const tickClock = () => {
      clearTimeout(clockTimer);
      const now = new Date();
      clocks.forEach(el => {
        const time = new Intl.DateTimeFormat("en-GB", { timeZone: el.dataset.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
        el.textContent = `${el.dataset.timezoneLabel ?? ""} ${time}`.trim();
      });
      if (!document.hidden) clockTimer = window.setTimeout(tickClock, 60000 - (Date.now() % 60000) + 20);
    };
    document.addEventListener("visibilitychange", tickClock, { signal });
    tickClock();
    cleanups.push(() => clearTimeout(clockTimer));

    initMenu();
    if (reduce) {
      gsap.set($$(".line"), { width: "100%" });
      initSequence();
      return;
    }

    /* Smooth scroll (source: Locomotive Scroll v5, which is Lenis underneath) */
    const smooth = new Lenis({ anchors: true });
    lenis = smooth;
    if (loading) smooth.stop();
    smooth.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => smooth.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    cleanups.push(() => { gsap.ticker.remove(raf); smooth.destroy(); lenis = undefined; });

    /* data-scroll-speed parallax */
    $$("[data-scroll-speed]").forEach(el => {
      const speed = num(el.dataset.scrollSpeed, 0);
      // Elements already on screen at load start untranslated; the rest are neutral at viewport center.
      const inFold = el.getBoundingClientRect().top + scrollY < innerHeight;
      const range = () => (speed * (innerHeight + el.offsetHeight)) / 2;
      gsap.fromTo(el, { y: () => (inFold ? 0 : range()) }, {
        y: () => (inFold ? -speed * (el.getBoundingClientRect().bottom + scrollY) : -range()), ease: "none",
        scrollTrigger: { trigger: el, start: inFold ? 0 : "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true },
      });
    });

    initStar();
    initMarquee();
    initFooterGradient();
    initStaggerLinks();
    initCursor();
    initSequence();
  }, root);

  /* Loader: counter follows real frame/font progress (min 1.6s so it never flashes), then wipes up */
  function runLoader() {
    const loader = $(".loader");
    if (!loader) { loading = false; intro(); return; }
    const html = document.documentElement;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    scrollTo(0, 0);
    html.classList.add("is-loading");
    const countEl = loader.querySelector<HTMLElement>("[data-loader-count]");
    let fontsDone = !document.fonts;
    document.fonts?.ready.then(() => { fontsDone = true; });
    const started = performance.now(), minDuration = reduce ? 0 : 1600, maxWait = 10000;
    let shown = 0, lastCount = -1;

    const finish = () => {
      loading = false;
      html.classList.remove("is-loading");
      gsap.set(loader, { display: "none" });
      lenis?.start();
      scheduleRefresh();
    };
    const exit = () => ctx.add(() => {
      if (reduce) {
        intro();
        gsap.to(loader, { autoAlpha: 0, duration: 0.3, onComplete: finish });
        return;
      }
      gsap.timeline({ onComplete: finish })
        .to(loader.querySelectorAll("[data-loader-out]"), { yPercent: -110, duration: 0.7, ease: "power3.in", stagger: 0.04 }, 0)
        .to(loader.querySelector(".loader__logo"), { scale: 1.15, autoAlpha: 0, duration: 0.9, ease: "power3.in" }, 0)
        .to(loader.querySelector(".loader__glow"), { scale: 1.6, autoAlpha: 0, duration: 1.1, ease: "power2.in" }, 0)
        .add(() => ctx.add(intro), 0.45)
        .to(loader, { clipPath: "inset(0% 0% 100% 0%)", duration: 1.2, ease: "expo.inOut" }, 0.45);
    });
    const tick = () => {
      const elapsed = performance.now() - started;
      const real = (seqFrames ? framesSettled / seqFrames : 1) * 0.9 + (fontsDone ? 0.1 : 0);
      const target = elapsed > maxWait ? 1 : Math.min(real, minDuration ? elapsed / minDuration : 1);
      shown += (target - shown) * 0.12;
      if (target >= 1 && shown > 0.995) shown = 1;
      loader.style.setProperty("--p", shown.toFixed(4));
      const count = Math.floor(shown * 100);
      if (countEl && count !== lastCount) { countEl.textContent = String(count); lastCount = count; }
      if (shown < 1) return;
      gsap.ticker.remove(tick);
      exit();
    };
    gsap.ticker.add(tick);
    cleanups.push(() => { gsap.ticker.remove(tick); html.classList.remove("is-loading"); });
  }

  /* Plays as the loader lifts: hero frame wipes in and text staggers. */
  function intro() {
    if (!reduce) {
      gsap.to(seqEl, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut", onComplete: scheduleRefresh });
      initSplitText();
      initReveals();
    }
  }

  /* Menu button */
  function initMenu() {
    const trigger = $(".nav-button.is-menu"), wrapper = $(".navbar-link-wrapper"), page = $(".page-wrapper");
    const dots = $$(".menu-dot"), links = $$(".nav-link");
    if (!trigger || !wrapper || !page || dots.length !== 5) return;
    const d = 5, plusX = [0, d, 0, -d], plusY = [-d, 0, d, 0], crossX = [-d, d, d, -d], crossY = [-d, -d, d, d];
    const four = dots.slice(0, 4);
    let open = false;

    gsap.set(dots, { position: "absolute", top: "50%", left: "50%", xPercent: -50, yPercent: -50 });
    gsap.set(four, { x: i => plusX[i], y: i => plusY[i], scale: 1 });
    gsap.set(dots[4], { x: 0, y: 0, scale: 0 });
    gsap.set(wrapper, { display: "none", autoAlpha: 0, y: "-2rem", pointerEvents: "none" });
    gsap.set(links, { autoAlpha: 0, yPercent: 60 });
    wrapper.inert = true;
    trigger.setAttribute("aria-expanded", "false");

    const iconTl = gsap.timeline({ paused: true })
      .to(four, { x: 0, y: 0, scale: 0.8, duration: 0.22, ease: "power3.in" })
      .to(dots[4], { scale: 1, duration: 0.08, ease: "power2.out" }, 0.18)
      .to(four, { x: i => crossX[i], y: i => crossY[i], scale: 1, duration: 0.34, ease: "back.out(1.4)" }, 0.22);
    const menuTl = gsap.timeline({ paused: true, onReverseComplete: () => { if (!open) gsap.set(wrapper, { display: "none" }); } })
      .to(page, { y: "5rem", duration: 1.05, ease: "power3.inOut" }, 0)
      .to(wrapper, { autoAlpha: 1, y: 0, pointerEvents: "auto", duration: 0.85, ease: "power4.out" }, 0.18)
      .to(links, { autoAlpha: 1, yPercent: 0, duration: 0.65, stagger: 0.06, ease: "power4.out" }, 0.75);

    const setOpen = (value: boolean) => {
      open = value;
      trigger.setAttribute("aria-expanded", String(open));
      wrapper.inert = !open;
      if (open) gsap.set(wrapper, { display: "flex" });
      [iconTl, menuTl].forEach(tl => {
        if (reduce) tl.progress(open ? 1 : 0).pause();
        else if (open) tl.play();
        else tl.reverse();
      });
      if (!open && reduce) gsap.set(wrapper, { display: "none" });
    };

    trigger.addEventListener("click", e => { e.preventDefault(); setOpen(!open); }, { signal });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !open) return;
      setOpen(false);
      trigger.focus({ preventScroll: true });
    }, { signal });
    links.forEach(link => link.addEventListener("click", () => { if (open) setOpen(false); }, { signal }));
  }

  /* Star spins slowly, scroll velocity boosts it */
  function initStar() {
    const star = $(".star-icon");
    if (!star) return;
    const setRotation = gsap.quickSetter(star, "rotation", "deg");
    let rotation = 0, boost = 0, direction = 1, visible = true;
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; });
    observer.observe(star);
    ScrollTrigger.create({
      start: 0, end: "max",
      onUpdate(self) {
        const velocity = self.getVelocity();
        if (Math.abs(velocity) > 0.1) direction = Math.sign(velocity);
        boost = gsap.utils.clamp(-6, 6, boost + velocity * 0.0008);
      },
    });
    const tick = (_: number, delta: number) => {
      if (document.hidden || !visible) return;
      const dt = Math.min(delta / (1000 / 60), 3);
      boost *= Math.pow(0.92, dt);
      rotation = (rotation + (0.2 * direction + boost) * dt) % 360;
      setRotation(rotation);
    };
    gsap.ticker.add(tick);
    cleanups.push(() => { observer.disconnect(); gsap.ticker.remove(tick); });
  }

  /* Marquee that flips direction with scroll direction */
  function initMarquee() {
    $$("[data-marquee-scroll-direction-target]").forEach(marquee => {
      const content = marquee.querySelector<HTMLElement>("[data-marquee-collection-target]");
      const track = marquee.querySelector<HTMLElement>("[data-marquee-scroll-target]");
      if (!content || !track) return;
      const direction = marquee.dataset.marqueeDirection === "right" ? 1 : -1;
      const scrollSpeed = num(marquee.dataset.marqueeScrollSpeed, 0, 0);
      const speed = num(marquee.dataset.marqueeSpeed, 20, 0.01);
      const copies = Math.floor(num(marquee.dataset.marqueeDuplicate, 0, 0));
      const clones: HTMLElement[] = [];
      for (let i = 0; i < copies; i++) {
        const clone = content.cloneNode(true) as HTMLElement;
        clone.setAttribute("aria-hidden", "true");
        clone.inert = true;
        track.append(clone);
        clones.push(clone);
      }
      const items = [content, ...clones];
      gsap.set(track, { marginLeft: `${-scrollSpeed}%`, width: `${100 + scrollSpeed * 2}%` });

      let animation: gsap.core.Tween | undefined, timeScale = direction, visible = true;
      const sync = () => animation?.paused(!visible || document.hidden);
      const rebuild = () => {
        const width = content.getBoundingClientRect().width;
        if (!width) return;
        const progress = animation ? animation.progress() : 0.5;
        animation?.kill();
        const multiplier = innerWidth < 479 ? 0.25 : innerWidth < 991 ? 0.5 : 1;
        const duration = Math.max(0.01, (speed * width) / innerWidth * multiplier);
        animation = gsap.fromTo(items, { xPercent: 0 }, {
          xPercent: -100, duration, repeat: -1, ease: "none", paused: true,
          onReverseComplete: () => { animation?.totalTime(duration * 100); },
        });
        animation.totalTime(duration * (100 + progress)).timeScale(timeScale);
        sync();
      };
      const observer = new ResizeObserver(rebuild);
      observer.observe(content);
      document.addEventListener("visibilitychange", sync, { signal });

      const st = ScrollTrigger.create({
        trigger: marquee, start: "top bottom", end: "bottom top",
        onToggle(self) { visible = self.isActive; sync(); },
        onUpdate(self) {
          timeScale = self.direction === 1 ? -direction : direction;
          animation?.timeScale(timeScale);
        },
      });
      visible = st.isActive;
      const start = direction === -1 ? scrollSpeed : -scrollSpeed;
      gsap.fromTo(track, { x: () => `${start}vw` }, {
        x: () => `${-start}vw`, ease: "none",
        scrollTrigger: { trigger: marquee, start: "top bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true },
      });
      rebuild();
      cleanups.push(() => { observer.disconnect(); clones.forEach(clone => clone.remove()); });
    });
  }

  function initFooterGradient() {
    const footer = $(".footer-base"), gradient = $(".footer-gradient");
    if (!footer || !gradient) return;
    gsap.from(gradient, {
      xPercent: -30, yPercent: 20, scale: 0.85, opacity: 0.6, ease: "none",
      scrollTrigger: { trigger: footer, start: "top bottom", end: "bottom bottom", scrub: 1.2, invalidateOnRefresh: true },
    });
  }

  /* Links roll their characters on hover */
  function initStaggerLinks() {
    $$("[data-link-stagger]").forEach(link => {
      const label = link.textContent?.trim();
      if (!label || link.children.length) return;
      const layer = (cls: string) => {
        const el = document.createElement("span");
        el.className = `stagger-link__layer ${cls}`;
        Array.from(label).forEach(character => {
          const span = document.createElement("span");
          span.className = `stagger-link__char${/[oO]/.test(character) ? " playfair-o" : ""}`;
          span.textContent = character === " " ? " " : character;
          el.appendChild(span);
        });
        return el;
      };
      const inner = document.createElement("span");
      inner.className = "stagger-link__inner";
      inner.setAttribute("aria-hidden", "true");
      const current = layer("stagger-link__layer--current"), hover = layer("stagger-link__layer--hover");
      inner.append(current, hover);
      link.replaceChildren(inner);
      link.setAttribute("aria-label", label);

      gsap.set(hover.children, { yPercent: 110 });
      const tl = gsap.timeline({ paused: true, defaults: { duration: 0.45, ease: "power3.inOut", stagger: 0.018 } })
        .to(current.children, { yPercent: -110 }, 0)
        .to(hover.children, { yPercent: 0 }, 0.04);
      const show = () => tl.play(), hide = () => tl.reverse();
      link.addEventListener("pointerenter", show, { signal });
      link.addEventListener("pointerleave", hide, { signal });
      link.addEventListener("focus", show, { signal });
      link.addEventListener("blur", hide, { signal });
      cleanups.push(() => { link.textContent = label; });
    });
  }

  /* Cursor dot with a fading drawn trail */
  function initCursor() {
    const dot = $("[data-cursor-dot]"), canvas = $<HTMLCanvasElement>("[data-cursor-canvas]");
    const c2d = canvas?.getContext("2d");
    if (!dot || !canvas || !c2d) return;
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) {
      gsap.set([dot, canvas], { autoAlpha: 0 });
      return;
    }
    let points: { x: number; y: number; time: number }[] = [];
    let width = 2, active = false, inside = false, moving = false;
    gsap.set(dot, { xPercent: -50, yPercent: -50, opacity: 0 });
    const xTo = gsap.quickTo(dot, "x", { duration: 0.25, ease: "power3" });
    const yTo = gsap.quickTo(dot, "y", { duration: 0.25, ease: "power3" });

    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      points = [];
    };
    const tick = () => {
      const now = performance.now();
      if (inside && moving) {
        const x = Number(gsap.getProperty(dot, "x")), y = Number(gsap.getProperty(dot, "y"));
        const last = points[points.length - 1];
        if (!last || (x - last.x) ** 2 + (y - last.y) ** 2 >= 0.1) points.push({ x, y, time: now });
        moving = xTo.tween.isActive() || yTo.tween.isActive();
      }
      c2d.clearRect(0, 0, innerWidth, innerHeight);
      points = points.filter(point => now - point.time < 250);
      c2d.lineCap = "butt";
      c2d.shadowColor = "rgba(243,66,19,.75)";
      c2d.shadowBlur = 40;
      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1], curr = points[i], next = points[i + 1];
        const velocity = Math.hypot(curr.x - prev.x, curr.y - prev.y) / Math.max(1, curr.time - prev.time);
        const target = 16 - gsap.utils.clamp(0, 1, (velocity - 0.08) / (2.8 - 0.08)) * 14;
        const alpha = (1 - (now - curr.time) / 250) ** 2;
        if (alpha <= 0.005) continue;
        width += (target - width) * 0.5;
        c2d.beginPath();
        c2d.moveTo((prev.x + curr.x) / 2, (prev.y + curr.y) / 2);
        c2d.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
        c2d.lineWidth = width;
        c2d.strokeStyle = `rgba(243,66,19,${alpha})`;
        c2d.stroke();
      }
      if (!points.length && !moving) {
        gsap.ticker.remove(tick);
        active = false;
      }
    };
    const stop = () => { inside = false; moving = false; gsap.set(dot, { opacity: 0 }); };

    addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      if (!inside) { xTo(e.clientX, e.clientX); yTo(e.clientY, e.clientY); }
      inside = true;
      moving = true;
      gsap.set(dot, { opacity: 1 });
      xTo(e.clientX);
      yTo(e.clientY);
      if (!active) { gsap.ticker.add(tick); active = true; }
    }, { passive: true, signal });
    const overLink = (e: MouseEvent, on: boolean) => {
      const link = (e.target as Element).closest?.("a");
      if (link && !link.contains(e.relatedTarget as Node | null)) {
        gsap.set(dot, on ? { width: "1rem", height: "1rem", backgroundColor: "#E7E1D7" } : { width: ".5rem", height: ".5rem", backgroundColor: "#F34213" });
      }
    };
    document.addEventListener("mouseover", e => overLink(e, true), { signal });
    document.addEventListener("mouseout", e => overLink(e, false), { signal });
    document.documentElement.addEventListener("mouseleave", stop, { signal });
    addEventListener("blur", stop, { signal });
    addEventListener("resize", resize, { passive: true, signal });
    resize();
    cleanups.push(() => gsap.ticker.remove(tick));
  }

  /* Scroll-scrubbed frame sequence on canvas; the frame shrinks as it scrubs */
  function initSequence() {
    $$("[data-sequence-wrap]").forEach(wrap => {
      const element = wrap.querySelector<HTMLElement>("[data-sequence-element]");
      const canvas = element?.querySelector<HTMLCanvasElement>("[data-sequence-canvas]");
      const c2d = canvas?.getContext("2d");
      if (!element || !canvas || !c2d) return;
      const frames = Math.max(1, seqFrames), first = seqFirst, loaded = frameCache;
      let progress = 0, frame = 0, disposed = false, drawn: HTMLImageElement | null = null;
      let width = element.clientWidth, height = element.clientHeight;
      let drawnWidth = 0, drawnHeight = 0;
      let bufferDirty = true;

      const resizeBuffer = () => {
        if (!bufferDirty) return false;
        bufferDirty = false;
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const mobile = matchMedia("(max-width: 767px)").matches;
        // Allocate for the largest size in the existing animation. Scrolling
        // changes the crop, without reallocating a canvas surface every frame.
        const w = Math.max(1, Math.ceil(innerWidth * (mobile ? 0.9 : 0.35) * dpr));
        const h = Math.max(1, Math.ceil(innerHeight * (mobile ? 0.7 : 1) * dpr));
        if (canvas.width === w && canvas.height === h) return false;
        canvas.width = w;
        canvas.height = h;
        return true;
      };
      const render = () => {
        frame = 0;
        if (disposed) return;
        const changed = resizeBuffer();
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const displayWidth = Math.max(1, Math.round(width * dpr));
        const displayHeight = Math.max(1, Math.round(height * dpr));
        const index = first + Math.round(progress * (frames - 1));
        let img = loaded.get(index);
        if (!img) {
          let nearest = Infinity;
          loaded.forEach((candidate, key) => {
            const distance = Math.abs(index - key);
            if (distance < nearest) { nearest = distance; img = candidate; }
          });
        }
        if (!img || !img.naturalWidth || (!changed && img === drawn && displayWidth === drawnWidth && displayHeight === drawnHeight)) return;
        const scale = Math.max(displayWidth / img.naturalWidth, displayHeight / img.naturalHeight);
        const cropWidth = displayWidth / scale, cropHeight = displayHeight / scale;
        // Same cover crop and 15% vertical anchor, at full backing resolution.
        // The opaque JPEG covers the surface, so a separate clear is redundant.
        c2d.drawImage(img, (img.naturalWidth - cropWidth) / 2, Math.max(0, (img.naturalHeight - cropHeight) * 0.15), cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
        drawn = img;
        drawnWidth = displayWidth;
        drawnHeight = displayHeight;
      };
      const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(render); };

      onFrame = schedule;

      const observer = new ResizeObserver(entries => {
        // Read delivered layout measurements, rather than forcing a layout
        // after GSAP changes the element's dimensions on each scroll frame.
        width = Math.round(entries[0].contentRect.width);
        height = Math.round(entries[0].contentRect.height);
        cancelAnimationFrame(frame);
        render();
      });
      observer.observe(element);
      addEventListener("resize", () => { bufferDirty = true; schedule(); }, { passive: true, signal });
      schedule();
      cleanups.push(() => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); });

      // Reduced motion still displays the original hero, without fetching or
      // animating the other 48 frames.
      if (reduce) return;
      // Frames finish at 60% of the scroll range so the full gesture plays
      // before the section leaves; lower = faster.
      const SEQ_SPEED_END = 0.6;
      const toProgress = (p: number) => Math.min(1, p / SEQ_SPEED_END);
      const st = ScrollTrigger.create({
        trigger: wrap, start: "top top", end: "bottom top",
        // The size observer paints after layout with the current frame/crop.
        onUpdate(self) { progress = toProgress(self.progress); schedule(); },
        onRefresh(self) { progress = toProgress(self.progress); schedule(); },
      });
      progress = toProgress(st.progress);

      const mm = gsap.matchMedia();
      mm.add({ mobile: "(max-width: 767px)", desktop: "(min-width: 768px)" }, context => {
        const mobile = !!context.conditions?.mobile;
        gsap.fromTo(element, { width: mobile ? "60vw" : "35vw", height: mobile ? "50vh" : "100vh" }, {
          width: mobile ? "90vw" : "25vw", height: mobile ? "70vh" : "65vh", ease: "none",
          scrollTrigger: { trigger: wrap, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true },
        });
        scheduleRefresh();
      });
      cleanups.push(() => mm.revert());
    });
  }

  function initSplitText() {
    /* Gradient wave: characters light up through orange as the heading scrolls in */
    $$("[data-gradient-wave-text]").forEach(heading => {
      const startColor = "rgba(255,255,255,.2)", waveColor = "#F34213", duration = 0.4;
      const endColor = getComputedStyle(heading).color;
      let effects = new Map<number, gsap.core.Animation>();
      SplitText.create(heading, {
        type: "words, chars", autoSplit: true,
        onSplit(self) {
          effects.forEach(effect => effect.kill());
          effects = new Map();
          const chars = self.chars, state = { value: 0 };
          let count = 0;
          gsap.set(chars, { color: startColor });
          const paint = (instant: boolean) => {
            const next = Math.round(state.value * chars.length);
            if (instant) {
              effects.forEach(effect => effect.kill());
              effects.clear();
              chars.forEach((char, i) => gsap.set(char, { color: i < next ? endColor : startColor }));
            } else for (let i = Math.min(count, next); i < Math.max(count, next); i++) {
              effects.get(i)?.kill();
              effects.set(i, i < next
                ? gsap.timeline()
                  .to(chars[i], { color: waveColor, duration: duration * 0.3, ease: "power2.out" })
                  .to(chars[i], { color: endColor, duration: duration * 0.7, ease: "power2.in" })
                : gsap.to(chars[i], { color: startColor, duration: duration * 0.5, ease: "none" }));
            }
            count = next;
          };
          scheduleRefresh();
          return gsap.to(state, {
            value: 1, ease: "none", onUpdate: () => paint(false),
            scrollTrigger: { trigger: heading, start: "top 90%", end: "center 40%", scrub: 0.1, onRefresh: () => paint(true) },
          });
        },
      });
    });

    /* Masked stagger-up per line or per character */
    $$("[data-stagger-char]").forEach(el => {
      const line = el.dataset.staggerChar === "line";
      SplitText.create(el, {
        type: line ? "lines" : "lines, chars", linesClass: "stagger-line", autoSplit: true, mask: "lines",
        onSplit(self) {
          if (!line) self.chars.forEach(char => { if (/^[oO]$/.test(char.textContent ?? "")) char.classList.add("playfair-o"); });
          scheduleRefresh();
          return gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "restart none none reset" } })
            .fromTo(line ? self.lines : self.chars, { yPercent: 120 }, {
              yPercent: 0, duration: 1, ease: "power4.out", stagger: line ? 0.12 : 0.1,
            }, num(el.dataset.staggerCharDelay, 0, 0));
        },
      });
    });
  }

  function initReveals() {
    $$(".line").forEach(line => {
      gsap.fromTo(line, { scaleX: 0, transformOrigin: "left center" }, {
        scaleX: 1, duration: 1.6, ease: "expo.inOut",
        scrollTrigger: { trigger: line, start: "top 95%", toggleActions: "restart none none reset" },
      });
    });
    $$("[data-reveal-group]").forEach(group => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: group, start: "top 80%", toggleActions: "restart none none reset" } });
      Array.from(group.children).forEach((child, i) => {
        tl.fromTo(child, { y: "2em", autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.8, ease: "power4.inOut" }, i * 0.1);
      });
    });
  }

  if (!reduce) {
    const work = $("[data-glass-carousel]");
    if (work) {
      // Give the existing effects a full viewport of preparation time, without
      // competing with hero frames/fonts or compiling WebGL during startup.
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        if (signal.aborted) return;
        work.querySelectorAll<HTMLVideoElement>("video").forEach(video => {
          video.preload = "auto";
          video.load();
        });
        import("./glassCarousel")
          .then(module => signal.aborted ? undefined : module.initGlassCarousel(root, signal, scheduleRefresh))
          .then(cleanup => {
            if (signal.aborted) cleanup?.();
            else cleanups.push(cleanup);
          })
          .catch(() => { /* The original poster/video list remains available. */ });
      }, { rootMargin: `${Math.max(innerHeight, 800)}px 0px` });
      observer.observe(work);
      cleanups.push(() => observer.disconnect());
    }
  }
  document.fonts?.ready.then(scheduleRefresh);
  scheduleRefresh();

  return () => {
    abort.abort();
    clearTimeout(refreshTimer);
    cleanups.reverse().forEach(cleanup => cleanup?.());
    ctx.revert();
  };
}
