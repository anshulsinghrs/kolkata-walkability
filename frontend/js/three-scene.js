/**
 * three-scene.js
 * --------------
 * 3D walkability visualization with first-person avatar controls and WebXR VR support.
 * Uses Three.js to render PWS data points as 3D columns in an explorable cityscape.
 */

window.ThreeScene = (function () {
  'use strict';

  let scene, camera, renderer, clock;
  let isActive = false;
  let vrSession = null;
  let vrSupported = false;
  let animFrameId = null;

  // Avatar state
  const avatar = {
    position: new THREE.Vector3(0, 1.6, 0),
    velocity: new THREE.Vector3(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
    speed: 5,
    runMultiplier: 2.2,
    jumpForce: 6,
    grounded: true,
    height: 1.6,
  };

  const keys = {};
  const GRAVITY = -15;

  // Settings
  let heightScale = 1.0;
  let fov = 60;
  let fogDensity = 0.5;

  // Scene objects
  let columns = [];
  let ground = null;
  let pointLight = null;
  let ambientLight = null;

  const container = document.getElementById('three-container');
  const canvas = document.getElementById('three-canvas');
  const hudInfo = document.getElementById('hud-info');
  const hudInstructions = document.getElementById('hud-instructions');

  function scoreToColor(score) {
    const t = Math.max(0, Math.min(1, score / 100));
    const r = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
    const g = t < 0.5 ? t * 2 : 1;
    const b = 0.1;
    return new THREE.Color(r, g, b);
  }

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b0e);

    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.copy(avatar.position);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;

    // Lighting
    ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(50, 80, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    pointLight = new THREE.PointLight(0xd4a574, 1.0, 30);
    pointLight.position.set(0, 3, 0);
    scene.add(pointLight);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(600, 600, 60, 60);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c22,
      roughness: 0.85,
      metalness: 0.15,
    });
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper
    const grid = new THREE.GridHelper(600, 120, 0x2a2c30, 0x1a1c20);
    grid.position.y = 0.01;
    scene.add(grid);

    // Fog
    updateFog();

    // Skybox gradient (hemisphere light as sky)
    const hemiLight = new THREE.HemisphereLight(0x1a2040, 0x080810, 0.4);
    scene.add(hemiLight);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(3000);
    for (let i = 0; i < 3000; i++) {
      starPositions[i] = (Math.random() - 0.5) * 800;
      if (i % 3 === 1) starPositions[i] = Math.abs(starPositions[i]) + 50;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeo, starMat));

    window.addEventListener('resize', onResize);
  }

  function updateFog() {
    if (fogDensity > 0) {
      scene.fog = new THREE.FogExp2(0x0a0b0e, 0.003 + fogDensity * 0.012);
    } else {
      scene.fog = null;
    }
  }

  function onResize() {
    if (!isActive) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function buildCityFromData(data) {
    // Clear existing columns
    columns.forEach((c) => scene.remove(c));
    columns = [];

    if (!data || data.length === 0) return;

    // Find bounds
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    for (const pt of data) {
      const lon = pt[0], lat = pt[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }

    const latRange = maxLat - minLat || 0.01;
    const lonRange = maxLon - minLon || 0.01;
    const scale = 200;

    const maxPoints = Math.min(data.length, 3000);
    const step = Math.max(1, Math.floor(data.length / maxPoints));

    const baseGeo = new THREE.BoxGeometry(1, 1, 1);

    for (let i = 0; i < data.length; i += step) {
      const pt = data[i];
      const lon = pt[0], lat = pt[1], score = pt[2];
      if (score === undefined || score === null) continue;

      const x = ((lon - minLon) / lonRange - 0.5) * scale;
      const z = ((lat - minLat) / latRange - 0.5) * -scale;
      const height = (score / 100) * 10 * heightScale + 0.3;
      const width = 0.6 + (score / 100) * 0.4;

      const color = scoreToColor(score);
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.4,
        metalness: 0.3,
        emissive: color,
        emissiveIntensity: 0.15,
      });

      const mesh = new THREE.Mesh(baseGeo, mat);
      mesh.scale.set(width, height, width);
      mesh.position.set(x, height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { score, lat, lon, index: i };

      columns.push(mesh);
      scene.add(mesh);
    }

    // Position avatar at center
    avatar.position.set(0, avatar.height, 0);
    camera.position.copy(avatar.position);
  }

  function enter(data) {
    if (!scene) init();

    buildCityFromData(data);

    container.hidden = false;
    isActive = true;

    hudInstructions.style.display = 'block';
    canvas.addEventListener('click', lockPointer);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    animate();
  }

  function exit() {
    isActive = false;
    container.hidden = true;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }

    canvas.removeEventListener('click', lockPointer);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);

    if (vrSession) {
      vrSession.end();
      vrSession = null;
    }
  }

  function lockPointer() {
    canvas.requestPointerLock();
  }

  function onPointerLockChange() {
    if (document.pointerLockElement === canvas) {
      hudInstructions.style.display = 'none';
    } else {
      hudInstructions.style.display = 'block';
    }
  }

  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Space' && avatar.grounded) {
      avatar.velocity.y = avatar.jumpForce;
      avatar.grounded = false;
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  function onMouseMove(e) {
    if (document.pointerLockElement !== canvas) return;

    const sensitivity = 0.002;
    avatar.euler.y -= e.movementX * sensitivity;
    avatar.euler.x -= e.movementY * sensitivity;
    avatar.euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, avatar.euler.x));
  }

  function updateAvatar(dt) {
    const dir = new THREE.Vector3();
    const right = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1);

    forward.applyEuler(new THREE.Euler(0, avatar.euler.y, 0));
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const isRunning = keys['ShiftLeft'] || keys['ShiftRight'];
    const moveSpeed = avatar.speed * (isRunning ? avatar.runMultiplier : 1);

    if (keys['KeyW']) dir.add(forward);
    if (keys['KeyS']) dir.sub(forward);
    if (keys['KeyA']) dir.sub(right);
    if (keys['KeyD']) dir.add(right);

    if (dir.length() > 0) dir.normalize();

    avatar.position.x += dir.x * moveSpeed * dt;
    avatar.position.z += dir.z * moveSpeed * dt;

    // Gravity
    avatar.velocity.y += GRAVITY * dt;
    avatar.position.y += avatar.velocity.y * dt;

    if (avatar.position.y <= avatar.height) {
      avatar.position.y = avatar.height;
      avatar.velocity.y = 0;
      avatar.grounded = true;
    }

    // Update camera
    camera.position.copy(avatar.position);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(avatar.euler.x, avatar.euler.y, 0);

    // Point light follows avatar
    pointLight.position.set(avatar.position.x, avatar.position.y + 1, avatar.position.z);
  }

  function raycastFromCamera() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObjects(columns);
    if (hits.length > 0) {
      const data = hits[0].object.userData;
      hudInfo.textContent = `PWS: ${data.score.toFixed(1)} | Lat: ${data.lat.toFixed(5)} | Lon: ${data.lon.toFixed(5)}`;
      hudInfo.style.opacity = '1';
    } else {
      hudInfo.style.opacity = '0';
    }
  }

  function animate() {
    if (!isActive) return;
    animFrameId = requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);
    updateAvatar(dt);
    raycastFromCamera();

    renderer.render(scene, camera);
  }

  // --- VR ---
  async function checkVRSupport() {
    if (!navigator.xr) {
      vrSupported = false;
      return false;
    }
    try {
      vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
    } catch (e) {
      vrSupported = false;
    }
    return vrSupported;
  }

  async function enterVR() {
    if (!vrSupported || !renderer) return;

    try {
      vrSession = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      renderer.xr.setSession(vrSession);

      vrSession.addEventListener('end', () => {
        vrSession = null;
        renderer.xr.setSession(null);
      });

      renderer.setAnimationLoop((time, frame) => {
        if (!isActive) return;
        const dt = Math.min(clock.getDelta(), 0.1);
        updateAvatar(dt);
        renderer.render(scene, camera);
      });
    } catch (e) {
      console.error('VR session failed:', e);
    }
  }

  // --- Settings ---
  function setHeightScale(val) {
    heightScale = val / 10;
    columns.forEach((col) => {
      const score = col.userData.score;
      const height = (score / 100) * 10 * heightScale + 0.3;
      col.scale.y = height;
      col.position.y = height / 2;
    });
  }

  function setFOV(val) {
    fov = val;
    if (camera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  function setFogDensity(val) {
    fogDensity = val / 100;
    if (scene) updateFog();
  }

  function isRunning() {
    return isActive;
  }

  return {
    init,
    enter,
    exit,
    isRunning,
    checkVRSupport,
    enterVR,
    setHeightScale,
    setFOV,
    setFogDensity,
  };
})();
