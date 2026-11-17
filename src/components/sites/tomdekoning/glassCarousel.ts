import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type * as Three from "three";

/* Liquid-glass carousel: panels are rendered to a target, then a lens shader
   (zoom, chromatic dispersion, rim ring) is applied over the whole canvas.
   Constants and shader match the source. */
const panelHeight = 0.6, panelGap = 40, panelWidthMax = 0.78, narrowBreakpoint = 768, repeats = 4;
const lensWidth = 1, lensHeight = 0.6, lensHeightNarrow = 0.7, lensRotation = 90;
const ease = 0.09, wheelSpeed = 1.4, dragSpeed = 1.6, touchSpeed = 1, touchEase = 0.22;
const friction = 0.865, snapIdle = 120, snapEase = 0.05, shrinkMax = 60;
const shrinkAttack = 0.25, shrinkDecay = 0.06, clickSlop = 6, touchClickSlop = 12, flickIdle = 90;

const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uCenter;
uniform float uSizeX,uSizeY,uAspect,uZoom,uDispersion,uGlow,uBlueRing,uRingRadius,uRingWidth,uShimmerFreq,uShimmerSpeed,uShimmerDepth,uTime,uRimStart,uRimTangential,uRimFreq1,uRimFreq2,uRimLine,uRimLinePos,uRimLineWidth,uRotation;
uniform vec3 uBlueColor;
const int N=16;

vec4 discLens(vec2 center,float aspectCorrect,out float outMask){
  vec2 p=vUv-center;p.x*=aspectCorrect;
  float ca=cos(uRotation),sa=sin(uRotation);p=mat2(ca,-sa,sa,ca)*p;
  float dist=length(p/vec2(uSizeX,uSizeY));outMask=0.0;
  if(dist>1.0)return vec4(0.0);
  float nd=clamp(dist,0.0,1.0);
  vec2 offset=vUv-center,radialDir=normalize(offset+1e-6),tangentDir=vec2(-radialDir.y,radialDir.x);
  float angle=atan(p.y,p.x),pull=uZoom*.30*(nd*nd),rimStrength=smoothstep(uRimStart,1.0,nd);
  float fluidWave=sin(angle*uRimFreq1)*.55+sin(angle*uRimFreq2)*.25,rScreen=(uSizeX+uSizeY)*.5;
  vec2 baseUV=center+offset*(1.0-pull)+tangentDir*fluidWave*rimStrength*rScreen*uRimTangential;
  vec2 dispDir=offset*uDispersion*.004*smoothstep(.55,1.0,nd);
  vec3 col=vec3(0.0),caW=vec3(0.0);float alphaSum=0.0;
  for(int i=0;i<N;i++){
    float t=float(i)/float(N-1);
    vec4 s=texture2D(uTex,baseUV+dispDir*(t-.5));
    vec3 w=vec3(exp(-pow((t-.00)/.38,2.0)),exp(-pow((t-.50)/.38,2.0)),exp(-pow((t-1.00)/.38,2.0)));
    col+=s.rgb*w;caW+=w;alphaSum+=s.a;
  }
  col/=max(caW,vec3(.001));
  float dC=nd*.5,tR=clamp(uRingRadius,.1,.49),rW=max(uRingWidth,.003);
  float ring=exp(-pow((dC-tR)/rW,2.0))*uBlueRing*(uGlow/17.0)*1.8;
  ring*=sin(angle*uShimmerFreq+uTime*uShimmerSpeed)*uShimmerDepth+(1.0-uShimmerDepth);
  float ringAura=exp(-pow((dC-tR)/(rW*6.0),2.0))*.28*uBlueRing*(uGlow/17.0);
  float rimLine=exp(-pow((dC-uRimLinePos)/max(uRimLineWidth,.0001),2.0))*uRimLine;
  col+=uBlueColor*(ring+ringAura)+vec3(rimLine);
  outMask=1.0-smoothstep(.93,1.0,dist);
  return vec4(col,max(alphaSum/float(N),clamp(max(ring+ringAura,rimLine),0.0,1.0)));
}

void main(){
  vec4 base=texture2D(uTex,vUv);
  float mask=0.0;
  vec4 lens=discLens(uCenter,uAspect,mask);
  gl_FragColor=vec4(mix(base.rgb,lens.rgb,mask),mix(base.a,lens.a,mask));
  #include <colorspace_fragment>
}`;

interface PanelRect { left: number; right: number; top: number; bottom: number; poolIdx: number; srcIndex: number; centerX: number }

export async function initGlassCarousel(root: HTMLElement, cancelled: AbortSignal, onReady: () => void): Promise<(() => void) | void> {
  const wrapper = root.querySelector<HTMLElement>("[data-glass-carousel]");
  const mount = wrapper?.querySelector<HTMLCanvasElement>("[data-glass-carousel-canvas]");
  const items = Array.from(wrapper?.querySelectorAll<HTMLElement>("[data-glass-carousel-item]") ?? []);
  if (!wrapper || !mount || !items.length) return;
  const THREE: typeof Three = await import("three");
  if (cancelled.aborted || !wrapper.isConnected) return;

  const captionEl = wrapper.querySelector<HTMLElement>("[data-glass-carousel-caption]");
  const counterEl = wrapper.querySelector<HTMLElement>("[data-glass-carousel-counter]");
  const total = items.length;
  let W = Math.max(1, mount.clientWidth), H = Math.max(1, mount.clientHeight);
  let narrow = W < narrowBreakpoint, panelH = 0;

  let renderer: Three.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, canvas: mount });
  } catch {
    return; // ponytail: no WebGL → the plain scrollable video list stays visible
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -100, 100);
  camera.position.z = 10;

  const abort = new AbortController();
  const { signal } = abort;
  let disposed = false, inView = false, raf = 0, lastTick = 0;

  const sources = items.map(item => ({
    tex: null as Three.VideoTexture | null,
    poster: null as Three.Texture | null,
    posterReady: false,
    aspect: 16 / 9,
    video: item.querySelector<HTMLVideoElement>("video"),
    playing: false,
  }));

  const measurePanel = () => {
    const widest = Math.max(1, ...sources.map(source => source.aspect));
    panelH = Math.min(H * panelHeight, (W * panelWidthMax) / widest);
    // caption/counter hug the panel edges via CSS (panel is centred at H/2)
    wrapper.style.setProperty("--panel-half", `${panelH / 2}px`);
  };
  const slotWidth = (index: number) => sources[index].aspect * panelH + panelGap;
  let offsets: number[] = [], totalWidth = 0;
  const recomputeTotal = () => {
    offsets = [];
    let acc = 0;
    sources.forEach((_, i) => { offsets.push(acc); acc += slotWidth(i); });
    totalWidth = acc;
  };
  measurePanel();
  recomputeTotal();

  const slotCenter = (index: number) => offsets[index] + slotWidth(index) / 2 - panelGap / 2;
  const centerForIndex = (index: number) => {
    const source = ((index % total) + total) % total;
    return slotCenter(source) + Math.floor(index / total) * totalWidth;
  };
  const nearestIndex = (value: number) => {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < total; i++) {
      const center = slotCenter(i), k = Math.round((value - center) / totalWidth);
      const dist = Math.abs(center + k * totalWidth - value);
      if (dist < bestDist) { bestDist = dist; best = i + k * total; }
    }
    return best;
  };
  const sourceIndex = (value: number) => ((nearestIndex(value) % total) + total) % total;

  let scroll = centerForIndex(0), target = scroll, userInteracted = false;
  let velocity = 0, prevScroll = scroll, scrollEnergy = 0;
  let lastInput = performance.now(), snapped = false, lastCenter = -1;

  const textureLoader = new THREE.TextureLoader();
  sources.forEach(source => {
    const video = source.video;
    if (!video) return;
    // Keep the same artwork visible while a slow connection buffers the video.
    // The shader, resolution, and video texture take over unchanged.
    if (video.poster) {
      source.poster = textureLoader.load(video.poster, texture => {
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        source.posterReady = true;
      }, undefined, () => { /* Keep the DOM poster fallback on failure. */ });
    }
    const adopt = () => {
      if (disposed || source.tex || !video.videoWidth || video.readyState < 2) return;
      source.aspect = video.videoWidth / video.videoHeight;
      measurePanel();
      recomputeTotal();
      if (!userInteracted) { scroll = target = prevScroll = centerForIndex(0); }
      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      source.tex = tex;
    };
    adopt();
    video.addEventListener("loadeddata", adopt, { signal });
    video.addEventListener("playing", adopt, { signal });
  });

  const panelGeometry = new THREE.PlaneGeometry(1, 1);
  const pool = Array.from({ length: repeats * total }, (_, i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true });
    const mesh = new THREE.Mesh(panelGeometry, mat);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, mat, srcIndex: i % total, boundTex: null as Three.Texture | null };
  });

  const bufferW = () => Math.max(1, Math.round(W * renderer.getPixelRatio()));
  const bufferH = () => Math.max(1, Math.round(H * renderer.getPixelRatio()));
  const rt = new THREE.WebGLRenderTarget(bufferW(), bufferH(), { type: THREE.HalfFloatType });
  const lensScene = new THREE.Scene();
  const lensCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTex: { value: rt.texture },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uSizeX: { value: 1 }, uSizeY: { value: 1 }, uRotation: { value: 0 }, uAspect: { value: W / H },
    uZoom: { value: 0.4 }, uDispersion: { value: 11 }, uGlow: { value: 4 },
    uBlueRing: { value: 1 }, uRingRadius: { value: 0.49 }, uRingWidth: { value: 0.01 },
    uShimmerFreq: { value: 12 }, uShimmerSpeed: { value: 3.5 }, uShimmerDepth: { value: 0.12 }, uTime: { value: 0 },
    uRimStart: { value: 0.578 }, uRimTangential: { value: 0.3 }, uRimFreq1: { value: 2 }, uRimFreq2: { value: 1 },
    uBlueColor: { value: new THREE.Color("#009dff") },
    uRimLine: { value: 1 }, uRimLinePos: { value: 0.488 }, uRimLineWidth: { value: 0.003 },
  };
  const lensMat = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true });
  const lensQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat);
  lensScene.add(lensQuad);

  const applyLook = () => {
    const active = sourceIndex(scroll);
    measurePanel();
    recomputeTotal();
    scroll = target = prevScroll = centerForIndex(active);
    velocity = 0;
    uniforms.uAspect.value = W / H;
    uniforms.uSizeX.value = lensWidth * (W / H);
    uniforms.uSizeY.value = (narrow ? lensHeightNarrow : lensHeight) * (W / H);
    uniforms.uRotation.value = (lensRotation * Math.PI) / 180;
  };

  let panelRects: PanelRect[] = [], centeredPoolIdx = -1;
  const layout = () => {
    panelRects = [];
    centeredPoolIdx = -1;
    let centeredDist = Infinity;
    const half = W / 2;
    pool.forEach((p, poolIdx) => {
      const rep = Math.floor(poolIdx / total), i = p.srcIndex, src = sources[i];
      let x = slotCenter(i) - scroll;
      x = ((x % totalWidth) + totalWidth) % totalWidth;
      x += (rep - Math.floor(repeats / 2)) * totalWidth;
      if (x > half + totalWidth) x -= totalWidth * repeats;
      const buffer = (src.aspect * panelH) / 2;
      if (x < -half - buffer || x > half + buffer) { p.mesh.visible = false; return; }

      const shrink = 1 - 0.25 * scrollEnergy, h = panelH * shrink, w = src.aspect * panelH * shrink;
      const texture = src.tex ?? (src.posterReady ? src.poster : null);
      if (texture && p.boundTex !== texture) {
        p.mat.map = texture;
        p.mat.color.set(0xffffff);
        p.mat.needsUpdate = true;
        p.boundTex = texture;
      }
      p.mesh.visible = true;
      p.mesh.position.set(x, 0, 0);
      p.mesh.scale.set(w, h, 1);
      const sx = x + W / 2, sy = H / 2;
      panelRects.push({ left: sx - w / 2, right: sx + w / 2, top: sy - h / 2, bottom: sy + h / 2, poolIdx, srcIndex: i, centerX: x });
      if (Math.abs(x) < centeredDist) { centeredDist = Math.abs(x); centeredPoolIdx = poolIdx; }
    });
  };

  const rectOf = (px: number, py: number) => {
    const bounds = mount.getBoundingClientRect();
    const x = ((px - bounds.left) * W) / (bounds.width || W), y = ((py - bounds.top) * H) / (bounds.height || H);
    return panelRects.find(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) ?? null;
  };

  let dragging = false, dragPointerId: number | null = null, dragLastX = 0, dragDist = 0;
  let dragVel = 0, dragMoveT = 0, suppressClick = false, dragPointerType = "mouse";
  let lastPointerX = NaN, lastPointerY = NaN, pointerInside = false;
  let pointerState: string | undefined;
  const setHover = (on: boolean) => {
    const next = dragging ? "grabbing" : on ? "grab" : "";
    if (next === pointerState) return;
    pointerState = next;
    wrapper.setAttribute("data-glass-carousel-pointer", next);
  };

  const onPointerUp = (e?: PointerEvent) => {
    if (!dragging || (e && dragPointerId !== null && e.pointerId !== dragPointerId)) return;
    dragging = false;
    if (dragPointerId !== null) {
      try { mount.releasePointerCapture(dragPointerId); } catch {}
      dragPointerId = null;
    }
    const cancelled = !!e && (e.type === "pointercancel" || e.type === "lostpointercapture");
    velocity = cancelled || performance.now() - dragMoveT > flickIdle ? 0 : dragVel;
    dragVel = 0;
    lastInput = performance.now();
    snapped = false;
    suppressClick = cancelled || dragDist > (dragPointerType === "mouse" ? clickSlop : touchClickSlop);
    setHover(dragPointerType === "mouse" && rectOf(lastPointerX, lastPointerY) !== null);
  };

  // Vertical wheel scrolls the page; only sideways wheel (trackpad) moves the carousel.
  mount.addEventListener("wheel", e => {
    if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    userInteracted = true;
    target += e.deltaX * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? W : 1) * wheelSpeed;
    lastInput = performance.now();
    snapped = false;
  }, { passive: false, signal });
  mount.addEventListener("pointerdown", e => {
    if (dragging || !e.isPrimary || (e.button !== 0 && e.pointerType === "mouse")) return;
    suppressClick = false;
    dragging = true;
    dragPointerId = e.pointerId;
    dragPointerType = e.pointerType || "mouse";
    try { mount.setPointerCapture(e.pointerId); } catch {}
    dragLastX = lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    dragDist = dragVel = velocity = 0;
    lastInput = dragMoveT = performance.now();
    userInteracted = true;
    snapped = false;
    setHover(false);
  }, { signal });
  mount.addEventListener("pointermove", e => {
    if (dragging && e.pointerId === dragPointerId) {
      const sens = dragPointerType === "mouse" ? dragSpeed : touchSpeed, dx = e.clientX - dragLastX;
      dragLastX = e.clientX;
      dragDist += Math.abs(dx);
      target -= dx * sens;
      const now = performance.now(), dt = Math.max(1, now - dragMoveT) / (1000 / 60);
      dragVel = dragVel * 0.6 + ((-dx * sens) / dt) * 0.4;
      lastInput = dragMoveT = now;
      snapped = false;
    }
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    pointerInside = e.pointerType === "mouse";
    if (pointerInside) setHover(rectOf(e.clientX, e.clientY) !== null);
  }, { signal });
  mount.addEventListener("pointerup", onPointerUp, { signal });
  mount.addEventListener("pointercancel", onPointerUp, { signal });
  mount.addEventListener("lostpointercapture", onPointerUp, { signal });
  mount.addEventListener("pointerleave", () => { pointerInside = false; setHover(false); }, { signal });
  mount.addEventListener("click", e => {
    if (suppressClick) { suppressClick = false; return; }
    const hit = rectOf(e.clientX, e.clientY);
    if (!hit || hit.poolIdx === centeredPoolIdx) return;
    userInteracted = true;
    velocity = 0;
    target = centerForIndex(nearestIndex(scroll + hit.centerX));
    snapped = true;
    setHover(false);
  }, { signal });

  let entered = false;
  const entranceTrigger = ScrollTrigger.create({
    trigger: wrapper, start: "top 80%", end: "bottom 20%",
    onEnter() {
      if (entered) return;
      entered = true;
      userInteracted = true;
      velocity = 0;
      target = centerForIndex(nearestIndex(scroll));
      snapped = true;
    },
    onLeaveBack() { entered = false; },
  });

  const showActive = (index: number) => {
    if (counterEl) counterEl.textContent = `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
    const content = items[index].querySelector("[data-glass-carousel-content]");
    if (!captionEl) return;
    gsap.killTweensOf(captionEl);
    captionEl.replaceChildren();
    if (!content) return;
    captionEl.append(content.cloneNode(true));
    gsap.fromTo(captionEl, { yPercent: 25, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.4, ease: "power3.out" });
  };

  // Only videos with a panel on screen keep playing.
  const syncVideos = () => {
    const visible = new Set(panelRects.map(rect => rect.srcIndex));
    sources.forEach((source, i) => {
      const on = inView && !document.hidden && visible.has(i);
      if (source.playing === on || !source.video) return;
      source.playing = on;
      if (on) source.video.play().catch(() => { source.playing = false; });
      else source.video.pause();
    });
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed || !inView || document.hidden) return;
    const dt = lastTick ? Math.min((now - lastTick) / (1000 / 60), 3) : 1;
    lastTick = now;

    if (!dragging) {
      const decay = Math.pow(friction, dt);
      target += (velocity * (1 - decay)) / (1 - friction);
      velocity *= decay;
      if (Math.abs(velocity) < 0.05) velocity = 0;
      if (!snapped && Math.abs(velocity) < 0.5 && performance.now() - lastInput > snapIdle) {
        velocity = 0;
        target = centerForIndex(nearestIndex(scroll));
        snapped = true;
      }
    }
    const follow = dragging && dragPointerType !== "mouse" ? touchEase : snapped ? snapEase : ease;
    scroll += (target - scroll) * (1 - Math.pow(1 - follow, dt));

    const ci = sourceIndex(scroll);
    if (ci !== lastCenter) { lastCenter = ci; showActive(ci); }

    const norm = Math.min(1, Math.abs((scroll - prevScroll) / Math.max(0.01, dt)) / shrinkMax);
    prevScroll = scroll;
    scrollEnergy += (norm - scrollEnergy) * (1 - Math.pow(1 - (norm > scrollEnergy ? shrinkAttack : shrinkDecay), dt));

    layout();
    syncVideos();
    if (pointerInside && !dragging) setHover(rectOf(lastPointerX, lastPointerY) !== null);
    uniforms.uTime.value = performance.now() * 0.001;

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(lensScene, lensCam);
    if (wrapper.dataset.glassCarousel !== "canvas" && panelRects.every(rect => {
      const source = sources[rect.srcIndex];
      return source.tex || source.posterReady;
    })) wrapper.setAttribute("data-glass-carousel", "canvas");
    raf = requestAnimationFrame(tick);
  };

  const syncVisibility = () => {
    cancelAnimationFrame(raf);
    raf = lastTick = 0;
    if (disposed) return;
    if (inView && !document.hidden) raf = requestAnimationFrame(tick);
    else { onPointerUp(); velocity = 0; }
    syncVideos();
  };

  const resizeObserver = new ResizeObserver(() => {
    const nextW = mount.clientWidth, nextH = mount.clientHeight;
    if (!nextW || !nextH || (nextW === W && nextH === H)) return;
    W = nextW;
    H = nextH;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(W, H, false);
    camera.left = -W / 2;
    camera.right = W / 2;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    rt.setSize(bufferW(), bufferH());
    narrow = W < narrowBreakpoint;
    applyLook();
    layout();
  });
  resizeObserver.observe(mount);

  showActive(0);
  lastCenter = 0;
  applyLook();
  layout();

  const visibilityObserver = new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    syncVisibility();
  });
  visibilityObserver.observe(wrapper);
  document.addEventListener("visibilitychange", syncVisibility, { signal });
  onReady();

  return () => {
    disposed = true;
    abort.abort();
    cancelAnimationFrame(raf);
    visibilityObserver.disconnect();
    resizeObserver.disconnect();
    entranceTrigger.kill();
    if (captionEl) gsap.killTweensOf(captionEl);
    sources.forEach(source => { source.tex?.dispose(); source.poster?.dispose(); source.video?.pause(); });
    pool.forEach(p => p.mat.dispose());
    panelGeometry.dispose();
    lensQuad.geometry.dispose();
    lensMat.dispose();
    rt.dispose();
    renderer.dispose();
    wrapper.setAttribute("data-glass-carousel", "");
    wrapper.removeAttribute("data-glass-carousel-pointer");
  };
}
