/**
 * Interactive 3D U.S. Diabetes Choropleth Map
 * Author: Kent John Macalam
 * Built with Three.js & CDC Diabetes Atlas Data
 */

(function () {
  'use strict';

  // --- Color Palettes ---
  const PALETTES = {
    red: [
      { stop: 4.0, color: '#fff5f0' },
      { stop: 7.0, color: '#fee0d2' },
      { stop: 9.5, color: '#fc9272' },
      { stop: 12.0, color: '#ef3b2c' },
      { stop: 14.5, color: '#cb181d' },
      { stop: 16.5, color: '#99000d' },
      { stop: 18.0, color: '#5a0009' }
    ],
    blue: [
      { stop: 4.0, color: '#f0f8ff' },
      { stop: 7.0, color: '#b8dbf5' },
      { stop: 9.5, color: '#5dade2' },
      { stop: 12.0, color: '#0072ce' },
      { stop: 14.5, color: '#004b87' },
      { stop: 16.5, color: '#052244' },
      { stop: 18.0, color: '#021024' }
    ],
    ylorrd: [
      { stop: 4.0, color: '#ffffb2' },
      { stop: 7.0, color: '#fed976' },
      { stop: 9.5, color: '#feb24c' },
      { stop: 12.0, color: '#fd8d3c' },
      { stop: 14.5, color: '#f03b20' },
      { stop: 16.5, color: '#bd0026' },
      { stop: 18.0, color: '#800026' }
    ],
    viridis: [
      { stop: 4.0, color: '#440154' },
      { stop: 7.0, color: '#414487' },
      { stop: 9.5, color: '#2a788e' },
      { stop: 12.0, color: '#22a884' },
      { stop: 14.5, color: '#7ad151' },
      { stop: 16.5, color: '#bddf26' },
      { stop: 18.0, color: '#fde725' }
    ]
  };

  function hexToRgb(hex) {
    const bigint = parseInt(hex.replace('#', ''), 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  function interpolateColor(rate, paletteName) {
    const stops = PALETTES[paletteName] || PALETTES.red;
    const clamped = Math.max(stops[0].stop, Math.min(stops[stops.length - 1].stop, rate));
    
    let i = 0;
    while (i < stops.length - 1 && clamped > stops[i + 1].stop) {
      i++;
    }
    
    const s0 = stops[i];
    const s1 = stops[Math.min(i + 1, stops.length - 1)];
    const t = s1.stop === s0.stop ? 0 : (clamped - s0.stop) / (s1.stop - s0.stop);
    
    const c0 = hexToRgb(s0.color);
    const c1 = hexToRgb(s1.color);
    
    const r = Math.round(c0.r + (c1.r - c0.r) * t);
    const g = Math.round(c0.g + (c1.g - c0.g) * t);
    const b = Math.round(c0.b + (c1.b - c0.b) * t);
    
    return (r << 16) | (g << 8) | b;
  }

  // --- Application State ---
  const state = {
    pitch: 35.6,         // degrees from ground plane (Rayshader default)
    azimuth: -53.6,      // degrees horizontal (Rayshader default)
    zoom: 95,            // camera distance
    autoRotate: false,
    sunAzimuth: 125,     // degrees
    sunElevation: 45,    // degrees
    shadowIntensity: 0.65,
    ambientLight: 0.55,
    heightScale: 1.0,    // extrusion multiplier
    palette: 'red',
    showBorders: true,
    darkMode: false
  };

  // --- Three.js Globals ---
  let scene, camera, renderer, controls;
  let sunLight, ambientLight, floorMesh, mapGroup;
  let countyData = null;
  const countyMeshes = [];
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredMesh = null;
  let originalHex = null;

  // --- DOM Elements ---
  const container = document.getElementById('webgl-container');
  const overlay = document.getElementById('loading-overlay');
  const drawer = document.getElementById('controls-drawer');
  const tooltip = document.getElementById('county-tooltip');
  
  // Sliders & Values
  const sliderPitch = document.getElementById('slider-pitch');
  const valPitch = document.getElementById('val-pitch');
  const sliderAzimuth = document.getElementById('slider-azimuth');
  const valAzimuth = document.getElementById('val-azimuth');
  const sliderZoom = document.getElementById('slider-zoom');
  const valZoom = document.getElementById('val-zoom');
  const toggleAutoRotate = document.getElementById('toggle-autorotate');

  const sliderSunAzimuth = document.getElementById('slider-sun-azimuth');
  const valSunAzimuth = document.getElementById('val-sun-azimuth');
  const sliderSunElevation = document.getElementById('slider-sun-elevation');
  const valSunElevation = document.getElementById('val-sun-elevation');
  const sliderShadowIntensity = document.getElementById('slider-shadow-intensity');
  const valShadowIntensity = document.getElementById('val-shadow-intensity');
  const sliderAmbient = document.getElementById('slider-ambient');
  const valAmbient = document.getElementById('val-ambient');

  const sliderHeight = document.getElementById('slider-height');
  const valHeight = document.getElementById('val-height');
  const toggleBorders = document.getElementById('toggle-borders');
  const toggleDarkMode = document.getElementById('toggle-darkmode');

  const legendGradient = document.getElementById('legend-gradient');

  // --- Initialize Scene ---
  function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0f14);

    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(40, aspect, 1, 1000);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent going below ground
    controls.minDistance = 35;
    controls.maxDistance = 220;
    controls.target.set(0, 0, 0);

    // Studio Pedestal Floor
    const floorGeo = new THREE.PlaneGeometry(300, 220);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.02
    });
    floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -0.05;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Lighting
    ambientLight = new THREE.AmbientLight(0xffffff, state.ambientLight);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xfff7ed, 1.25);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -70;
    sunLight.shadow.camera.right = 70;
    sunLight.shadow.camera.top = 50;
    sunLight.shadow.camera.bottom = -50;
    sunLight.shadow.bias = -0.0004;
    scene.add(sunLight);

    // Map container group
    mapGroup = new THREE.Group();
    scene.add(mapGroup);

    applyCameraPosition();
    updateSunPosition();

    // Listeners
    window.addEventListener('resize', onWindowResize, false);
    renderer.domElement.addEventListener('pointermove', onPointerMove, false);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave, false);
    controls.addEventListener('change', onControlsChange);
  }

  // --- Camera Mathematics ---
  function applyCameraPosition() {
    // pitch: degrees above horizon (15 to 90)
    // azimuth: rotation around Y axis in degrees (-180 to 180)
    const phi = (90 - state.pitch) * (Math.PI / 180);
    const theta = (state.azimuth + 90) * (Math.PI / 180);
    const r = state.zoom;

    camera.position.x = r * Math.sin(phi) * Math.sin(theta);
    camera.position.y = r * Math.cos(phi);
    camera.position.z = r * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(controls.target);
    controls.update();
  }

  function onControlsChange() {
    if (!controls) return;
    const offset = camera.position.clone().sub(controls.target);
    const r = offset.length();
    const phi = Math.acos(Math.max(-1, Math.min(1, offset.y / r)));
    const theta = Math.atan2(offset.x, offset.z);

    const pitchDeg = Math.round(90 - (phi * 180 / Math.PI));
    const azDeg = Math.round((theta * 180 / Math.PI) - 90);
    let normalizedAz = azDeg;
    while (normalizedAz > 180) normalizedAz -= 360;
    while (normalizedAz < -180) normalizedAz += 360;

    state.pitch = pitchDeg;
    state.azimuth = normalizedAz;
    state.zoom = Math.round(r);

    sliderPitch.value = pitchDeg;
    valPitch.innerHTML = pitchDeg + '&deg;';
    sliderAzimuth.value = normalizedAz;
    valAzimuth.innerHTML = normalizedAz + '&deg;';
    sliderZoom.value = Math.round(r);
    valZoom.textContent = Math.round(r);
  }

  // --- Sun & Shadow Mathematics ---
  function updateSunPosition() {
    const azRad = state.sunAzimuth * (Math.PI / 180);
    const elRad = state.sunElevation * (Math.PI / 180);
    const dist = 110;

    sunLight.position.x = dist * Math.cos(elRad) * Math.sin(azRad);
    sunLight.position.y = dist * Math.sin(elRad);
    sunLight.position.z = dist * Math.cos(elRad) * Math.cos(azRad);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();

    // Shadow darkness through floor opacity / light ratios
    sunLight.intensity = 0.5 + (state.shadowIntensity * 1.0);
    ambientLight.intensity = state.ambientLight * (1.1 - state.shadowIntensity * 0.4);
  }

  // --- Build 3D County Meshes ---
  function buildCountyMesh(county, baseHeightScale) {
    const rate = county.rate;
    // Map rate to height: baseline rate 4% = height 0.5, peak rate 18% = height 6.5
    const baseHeight = Math.max(0.4, (rate - 3.5) * 0.42);
    const height = baseHeight * baseHeightScale;

    const shapes = [];
    for (let p = 0; p < county.polys.length; p++) {
      const ring = county.polys[p];
      if (ring.length < 3) continue;

      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) {
        shape.lineTo(ring[i][0], ring[i][1]);
      }
      shape.closePath();
      shapes.push(shape);
    }

    if (shapes.length === 0) return null;

    const extrudeSettings = {
      steps: 1,
      depth: height,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    // Orient so X is East, Z is South (Three.js coordinates), and extrusion is upward Y
    geometry.rotateX(-Math.PI / 2);

    const hex = interpolateColor(rate, state.palette);
    const material = new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.55,
      metalness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      id: county.id,
      name: county.name,
      state: county.state,
      rate: rate,
      baseHeight: baseHeight
    };

    // Optional border outline
    if (state.showBorders) {
      const edges = new THREE.EdgesGeometry(geometry, 28);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.16
      });
      const wireframe = new THREE.LineSegments(edges, lineMat);
      mesh.add(wireframe);
      mesh.userData.wireframe = wireframe;
    }

    return mesh;
  }

  function renderMapData() {
    while (mapGroup.children.length > 0) {
      const child = mapGroup.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      mapGroup.remove(child);
    }
    countyMeshes.length = 0;

    const counties = countyData.counties;
    for (let i = 0; i < counties.length; i++) {
      const mesh = buildCountyMesh(counties[i], state.heightScale);
      if (mesh) {
        mapGroup.add(mesh);
        countyMeshes.push(mesh);
      }
    }
  }

  function updatePalette() {
    for (let i = 0; i < countyMeshes.length; i++) {
      const mesh = countyMeshes[i];
      const hex = interpolateColor(mesh.userData.rate, state.palette);
      mesh.material.color.setHex(hex);
    }

    // Update legend gradient bar
    legendGradient.className = `legend-gradient ${state.palette}-gradient`;
  }

  function updateExtrusionHeights() {
    for (let i = 0; i < countyMeshes.length; i++) {
      const mesh = countyMeshes[i];
      mesh.scale.y = state.heightScale;
    }
  }

  // --- Load Data ---
  async function loadData() {
    try {
      const response = await fetch('data/us_counties_diabetes.json');
      if (!response.ok) throw new Error('Network response error: ' + response.statusText);
      countyData = await response.json();
      renderMapData();
      overlay.classList.add('hidden');
    } catch (err) {
      console.error('Failed to load county data:', err);
      overlay.innerHTML = `
        <div class="loader-content">
          <h2 style="color: #ff6b6b;">Error Loading Data</h2>
          <p>${err.message}</p>
        </div>
      `;
    }
  }

  // --- Raycasting & Hover Tooltip ---
  function onPointerMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(countyMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (hoveredMesh !== hit) {
        if (hoveredMesh && originalHex !== null) {
          hoveredMesh.material.color.setHex(originalHex);
        }
        hoveredMesh = hit;
        originalHex = hit.material.color.getHex();
        // Brighten hovered county
        hit.material.color.offsetHSL(0, 0.1, 0.2);
      }

      showTooltip(hit.userData, event.clientX, event.clientY);
    } else {
      if (hoveredMesh && originalHex !== null) {
        hoveredMesh.material.color.setHex(originalHex);
        hoveredMesh = null;
        originalHex = null;
      }
      hideTooltip();
    }
  }

  function onPointerLeave() {
    if (hoveredMesh && originalHex !== null) {
      hoveredMesh.material.color.setHex(originalHex);
      hoveredMesh = null;
      originalHex = null;
    }
    hideTooltip();
  }

  function showTooltip(data, mouseX, mouseY) {
    document.getElementById('tt-county-name').textContent = data.name;
    document.getElementById('tt-state-name').textContent = data.state;
    document.getElementById('tt-rate-val').textContent = data.rate.toFixed(1) + '%';

    const barPercent = Math.min(100, Math.max(10, ((data.rate - 3) / 15) * 100));
    document.getElementById('tt-bar-fill').style.width = barPercent + '%';

    const tag = document.getElementById('tt-category');
    if (data.rate >= 15.0) {
      tag.textContent = 'Severe Epidemic Cluster';
      tag.style.color = '#ff6b6b';
      tag.style.background = 'rgba(239, 59, 44, 0.25)';
    } else if (data.rate >= 11.0) {
      tag.textContent = 'Above National Median';
      tag.style.color = '#ffa726';
      tag.style.background = 'rgba(255, 167, 38, 0.2)';
    } else {
      tag.textContent = 'Baseline Prevalence';
      tag.style.color = '#81c784';
      tag.style.background = 'rgba(129, 199, 132, 0.2)';
    }

    // Keep tooltip inside screen boundaries
    let left = mouseX;
    let top = mouseY - 20;
    if (left + 130 > window.innerWidth) left = window.innerWidth - 130;
    if (left < 130) left = 130;
    if (top < 120) top = mouseY + 140;

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.classList.add('visible');
    tooltip.setAttribute('aria-hidden', 'false');
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  // --- Resize Handler ---
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- UI Event Binding ---
  function initUI() {
    // Drawer open/close
    const btnToggle = document.getElementById('btn-toggle-controls');
    const btnClose = document.getElementById('btn-close-controls');

    btnToggle.addEventListener('click', () => {
      drawer.classList.toggle('collapsed');
      const isExpanded = !drawer.classList.contains('collapsed');
      btnToggle.setAttribute('aria-expanded', isExpanded);
    });

    btnClose.addEventListener('click', () => {
      drawer.classList.add('collapsed');
      btnToggle.setAttribute('aria-expanded', 'false');
    });

    // Camera sliders
    sliderPitch.addEventListener('input', (e) => {
      state.pitch = parseFloat(e.target.value);
      valPitch.innerHTML = state.pitch + '&deg;';
      applyCameraPosition();
    });

    sliderAzimuth.addEventListener('input', (e) => {
      state.azimuth = parseFloat(e.target.value);
      valAzimuth.innerHTML = state.azimuth + '&deg;';
      applyCameraPosition();
    });

    sliderZoom.addEventListener('input', (e) => {
      state.zoom = parseFloat(e.target.value);
      valZoom.textContent = state.zoom;
      applyCameraPosition();
    });

    toggleAutoRotate.addEventListener('change', (e) => {
      state.autoRotate = e.target.checked;
      controls.autoRotate = state.autoRotate;
      controls.autoRotateSpeed = 1.0;
    });

    // Camera presets
    const presetButtons = document.querySelectorAll('.btn-preset');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        presetButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');

        const preset = btn.getAttribute('data-preset');
        if (preset === 'rayshader') {
          state.pitch = 35.6;
          state.azimuth = -53.6;
          state.zoom = 95;
          controls.target.set(0, 0, 0);
        } else if (preset === 'top') {
          state.pitch = 86;
          state.azimuth = 0;
          state.zoom = 110;
          controls.target.set(0, 0, 0);
        } else if (preset === 'cinematic') {
          state.pitch = 20;
          state.azimuth = -45;
          state.zoom = 80;
          controls.target.set(0, 0, 0);
        } else if (preset === 'south') {
          state.pitch = 42;
          state.azimuth = -25;
          state.zoom = 65;
          controls.target.set(16, 0, -8);
        }
        applyCameraPosition();
      });
    });

    // Sun & Shadows
    sliderSunAzimuth.addEventListener('input', (e) => {
      state.sunAzimuth = parseFloat(e.target.value);
      valSunAzimuth.innerHTML = state.sunAzimuth + '&deg;';
      updateSunPosition();
    });

    sliderSunElevation.addEventListener('input', (e) => {
      state.sunElevation = parseFloat(e.target.value);
      valSunElevation.innerHTML = state.sunElevation + '&deg;';
      updateSunPosition();
    });

    sliderShadowIntensity.addEventListener('input', (e) => {
      state.shadowIntensity = parseFloat(e.target.value) / 100;
      valShadowIntensity.textContent = e.target.value + '%';
      updateSunPosition();
    });

    sliderAmbient.addEventListener('input', (e) => {
      state.ambientLight = parseFloat(e.target.value) / 100;
      valAmbient.textContent = e.target.value + '%';
      updateSunPosition();
    });

    // Lighting presets
    const lightPresets = document.querySelectorAll('.btn-light-preset');
    lightPresets.forEach(btn => {
      btn.addEventListener('click', () => {
        lightPresets.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const type = btn.getAttribute('data-light');
        if (type === 'studio') {
          state.sunAzimuth = 125;
          state.sunElevation = 45;
          state.shadowIntensity = 0.65;
          state.ambientLight = 0.55;
        } else if (type === 'golden') {
          state.sunAzimuth = 70;
          state.sunElevation = 22;
          state.shadowIntensity = 0.85;
          state.ambientLight = 0.45;
        } else if (type === 'noon') {
          state.sunAzimuth = 180;
          state.sunElevation = 80;
          state.shadowIntensity = 0.5;
          state.ambientLight = 0.7;
        } else if (type === 'dramatic') {
          state.sunAzimuth = 310;
          state.sunElevation = 28;
          state.shadowIntensity = 0.95;
          state.ambientLight = 0.35;
        }

        sliderSunAzimuth.value = state.sunAzimuth;
        valSunAzimuth.innerHTML = state.sunAzimuth + '&deg;';
        sliderSunElevation.value = state.sunElevation;
        valSunElevation.innerHTML = state.sunElevation + '&deg;';
        sliderShadowIntensity.value = Math.round(state.shadowIntensity * 100);
        valShadowIntensity.textContent = Math.round(state.shadowIntensity * 100) + '%';
        sliderAmbient.value = Math.round(state.ambientLight * 100);
        valAmbient.textContent = Math.round(state.ambientLight * 100) + '%';

        updateSunPosition();
      });
    });

    // Extrusion Height Slider
    sliderHeight.addEventListener('input', (e) => {
      state.heightScale = parseFloat(e.target.value) / 100;
      valHeight.innerHTML = state.heightScale.toFixed(1) + '&times;';
      updateExtrusionHeights();
    });

    // Color Palette Buttons
    const paletteButtons = document.querySelectorAll('.btn-palette');
    paletteButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        paletteButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');

        state.palette = btn.getAttribute('data-palette');
        updatePalette();
      });
    });

    // Borders Toggle
    toggleBorders.addEventListener('change', (e) => {
      state.showBorders = e.target.checked;
      for (let i = 0; i < countyMeshes.length; i++) {
        const wf = countyMeshes[i].userData.wireframe;
        if (wf) wf.visible = state.showBorders;
      }
    });

    // Dark Mode Toggle
    toggleDarkMode.addEventListener('change', (e) => {
      state.darkMode = e.target.checked;
      if (state.darkMode) {
        scene.background.setHex(0x0a0b0e);
        floorMesh.material.color.setHex(0x13151b);
      } else {
        scene.background.setHex(0x0e0f14);
        floorMesh.material.color.setHex(0xffffff);
      }
    });

    // Export PNG
    document.getElementById('btn-export-png').addEventListener('click', () => {
      // Hide tooltip temporarily
      hideTooltip();
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `USA_diabetes_3d_custom_pov_${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    });

    // Reset View
    document.getElementById('btn-reset-view').addEventListener('click', () => {
      state.pitch = 35.6;
      state.azimuth = -53.6;
      state.zoom = 95;
      state.sunAzimuth = 125;
      state.sunElevation = 45;
      state.shadowIntensity = 0.65;
      state.ambientLight = 0.55;
      state.heightScale = 1.0;
      state.palette = 'red';
      state.showBorders = true;
      state.darkMode = false;

      sliderPitch.value = 36;
      valPitch.innerHTML = '36&deg;';
      sliderAzimuth.value = -54;
      valAzimuth.innerHTML = '-54&deg;';
      sliderZoom.value = 95;
      valZoom.textContent = '95';
      sliderSunAzimuth.value = 125;
      valSunAzimuth.innerHTML = '125&deg;';
      sliderSunElevation.value = 45;
      valSunElevation.innerHTML = '45&deg;';
      sliderShadowIntensity.value = 65;
      valShadowIntensity.textContent = '65%';
      sliderAmbient.value = 55;
      valAmbient.textContent = '55%';
      sliderHeight.value = 100;
      valHeight.innerHTML = '1.0&times;';
      toggleBorders.checked = true;
      toggleDarkMode.checked = false;

      scene.background.setHex(0x0e0f14);
      floorMesh.material.color.setHex(0xffffff);
      controls.target.set(0, 0, 0);

      applyCameraPosition();
      updateSunPosition();
      updatePalette();
      updateExtrusionHeights();
    });
  }

  // --- Animation Render Loop ---
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  // --- Boot Application ---
  initScene();
  initUI();
  loadData();
  animate();
})();
