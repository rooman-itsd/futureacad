/* ============================================================
   FutureAcad — Neural World (shared background, all pages)
   Exposes window.__faWorld = { state, ready } so page scripts
   (home.js) can drive the camera/colour via ScrollTrigger.
   ============================================================ */
(function () {
  'use strict';
  const isTouch = document.documentElement.classList.contains('is-touch')
    || window.matchMedia('(hover: none)').matches;

  // Camera/colour state — mutated by page scripts. Always exists, even if
  // WebGL is unavailable, so timelines never crash.
  const state = { camZ: 60, camX: 0, camY: 0, hue: 0.6, twist: 0, nodeSize: 2.4, lineOpacity: 0.14 };
  window.__faWorld = { state, ready: false };

  const canvas = document.getElementById('world');
  if (!canvas || typeof THREE === 'undefined') return;

  try {
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.018);
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
    camera.position.set(0, 0, 60);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(innerWidth, innerHeight, false); // false = don't write inline px size; CSS 100% controls display (avoids 100vw scrollbar overflow)
    // Fill-rate is the bottleneck here, not geometry: this is a full-screen
    // additively-blended field, so rendering it at native 2x on a retina/4K
    // panel costs 4x the pixels for a soft glow nobody can tell apart.
    renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 1.5));

    const NODES = isTouch ? 260 : 520;
    const SPREAD = 130;
    const positions = new Float32Array(NODES * 3);
    const seeds = [];
    for (let i = 0; i < NODES; i++) {
      const x = (Math.random() - 0.5) * SPREAD;
      const y = (Math.random() - 0.5) * SPREAD * 0.7;
      const z = (Math.random() - 0.5) * SPREAD;
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      seeds.push({ ox: x, oy: y, oz: z, ph: Math.random() * Math.PI * 2, sp: 0.2 + Math.random() * 0.6 });
    }
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    function makeSprite() {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(180,210,255,1)');
      grad.addColorStop(0.25, 'rgba(106,168,255,0.7)');
      grad.addColorStop(1, 'rgba(61,124,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }
    const nodeMat = new THREE.PointsMaterial({
      size: 2.4, map: makeSprite(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0x9fc0ff, opacity: 0.95
    });
    const points = new THREE.Points(nodeGeo, nodeMat);
    scene.add(points);

    const linePairs = [];
    const MAXD = 26;
    for (let i = 0; i < NODES; i++) {
      let made = 0;
      for (let j = i + 1; j < NODES && made < 3; j++) {
        const dx = positions[i*3]-positions[j*3], dy = positions[i*3+1]-positions[j*3+1], dz = positions[i*3+2]-positions[j*3+2];
        if (dx*dx+dy*dy+dz*dz < MAXD*MAXD) { linePairs.push(i, j); made++; }
      }
    }
    const linePos = new Float32Array(linePairs.length * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x3d7cff, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(lines);

    const dustN = isTouch ? 350 : 900;
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) {
      dustPos[i*3] = (Math.random()-.5)*340;
      dustPos[i*3+1] = (Math.random()-.5)*240;
      dustPos[i*3+2] = (Math.random()-.5)*340;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.7, color: 0x6f86c8, transparent: true, opacity: 0.5, depthWrite: false }));
    scene.add(dust);

    let pointer = { x: 0, y: 0 }, ptarget = { x: 0, y: 0 };
    addEventListener('mousemove', (e) => { ptarget.x = (e.clientX / innerWidth - .5); ptarget.y = (e.clientY / innerHeight - .5); });

    // --- Hero-only: fade the neural canvas out as the first section scrolls
    //     away, revealing the simple gradient background. Pause rendering
    //     once hidden to keep the rest of the page light & smooth. ---
    let visible = true;
    let lastO = -1;
    let fadeQueued = false;
    let hidden = false;
    // A transparent full-screen canvas is still a layer the compositor has to
    // consider under every blended video below the hero. visibility:hidden
    // takes it out of the picture entirely for the rest of the page.
    function setHidden(h) {
      if (h === hidden) return;
      hidden = h;
      canvas.style.visibility = h ? 'hidden' : '';
    }
    function applyFade() {
      fadeQueued = false;
      if (!document.body.classList.contains('is-home')) {
        canvas.style.opacity = '0';
        setHidden(true);
        visible = false;
        return;
      }
      const span = innerHeight * 0.85;                 // fade across hero section
      const o = Math.max(0, Math.min(1, 1 - window.scrollY / span));
      // Writing on every scroll event restarts the opacity transition each
      // time, which reads as flicker. Only write on a visible change, and
      // batch it into the frame.
      if (Math.abs(o - lastO) > 0.004) {
        lastO = o;
        canvas.style.opacity = o.toFixed(3);
      }
      visible = o > 0.01;
      setHidden(!visible);
    }
    function updateFade() {
      if (fadeQueued) return;
      fadeQueued = true;
      requestAnimationFrame(applyFade);
    }
    addEventListener('scroll', updateFade, { passive: true });
    addEventListener('resize', updateFade);
    updateFade();

    const clock = new THREE.Clock();
    function render() {
      // Skip the heavy work entirely when the canvas is faded out.
      if (!visible) { requestAnimationFrame(render); return; }
      const t = clock.getElapsedTime();
      pointer.x += (ptarget.x - pointer.x) * 0.05;
      pointer.y += (ptarget.y - pointer.y) * 0.05;

      const p = nodeGeo.attributes.position.array;
      for (let i = 0; i < NODES; i++) {
        const s = seeds[i];
        p[i*3]   = s.ox + Math.sin(t * s.sp + s.ph) * 1.6;
        p[i*3+1] = s.oy + Math.cos(t * s.sp * 0.8 + s.ph) * 1.6;
        p[i*3+2] = s.oz + Math.sin(t * s.sp * 0.6 + s.ph) * 1.6;
      }
      nodeGeo.attributes.position.needsUpdate = true;

      for (let k = 0; k < linePairs.length; k++) {
        const idx = linePairs[k];
        linePos[k*3] = p[idx*3]; linePos[k*3+1] = p[idx*3+1]; linePos[k*3+2] = p[idx*3+2];
      }
      lineGeo.attributes.position.needsUpdate = true;

      camera.position.x += (state.camX + pointer.x * 14 - camera.position.x) * 0.05;
      camera.position.y += (state.camY - pointer.y * 10 - camera.position.y) * 0.05;
      camera.position.z += (state.camZ - camera.position.z) * 0.05;
      points.rotation.y = lines.rotation.y = t * 0.02 + state.twist;
      dust.rotation.y = -t * 0.01;
      camera.lookAt(0, 0, 0);

      nodeMat.size += (state.nodeSize - nodeMat.size) * 0.05;
      lineMat.opacity += (state.lineOpacity - lineMat.opacity) * 0.05;
      nodeMat.color.setHSL(state.hue, 0.85, 0.72);
      lineMat.color.setHSL(state.hue, 0.9, 0.55);

      renderer.render(scene, camera);
      requestAnimationFrame(render);
    }
    render();
    window.__faWorld.ready = true;

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight, false); // false = don't write inline px size; CSS 100% controls display (avoids 100vw scrollbar overflow)
    });
  } catch (err) {
    console.warn('[FutureAcad] WebGL world unavailable — continuing without it.', err);
    canvas.style.display = 'none';
  }
})();
