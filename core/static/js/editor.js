// static/js/editor.js

const CSRF = document.cookie
  .split('; ')
  .find(cookie => cookie.startsWith('csrftoken='))
  ?.split('=')[1] || '';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'X-CSRFToken': CSRF
};

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);

  const canvas     = $('three-canvas');
  const tree       = $('tree');
  const fileTarget = $('file-target');
  const fileAsset  = $('file-asset');
  const globalAssets = $('global-assets');

  const btnAddTarget = $('btn-add-target');
  const btnDelTarget = $('btn-del-target');
  const btnAddAsset  = $('btn-add-content');
  const btnDelAsset  = $('btn-del-asset');
  const btnPublish   = $('btn-publish');

  // THREE.js setup
  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });

  scene.add(new THREE.GridHelper(10, 10));
  scene.add(new THREE.AxesHelper(5));
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  camera.position.set(0, 2, 5);

  const resize = () => {
    const width  = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 400;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const controls   = new OrbitControls(camera, renderer.domElement);
  const transform  = new TransformControls(camera, renderer.domElement);

  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.addEventListener('change', () => renderer.render(scene, camera));

  transform.addEventListener('change', () => renderer.render(scene, camera));
  transform.addEventListener('objectChange', updateInputs);
  scene.add(transform);

  const expId     = window.EXP_ID;
  const objMap    = new Map();
  const tgtMap    = new Map();
  const assetMap  = new Map();
  let   selected        = null;
  let   currentTarget   = null;
  let   selectedAssetId = null;
  let   planes          = [];

  // Fetch & render loop
  function refreshAll() {
    Promise.all([
      fetch(`/api/targets/?experience=${expId}`).then(r => r.json()).then(renderTargets),
      fetch(`/api/exp-assets/?experience=${expId}`).then(r => r.json()).then(renderEA),
      fetch('/api/assets/').then(r => r.json()).then(renderGlobalAssets)
    ]).catch(console.error);
  }
  refreshAll();

  // Render targets as both list items + ground planes
  function renderTargets(targets) {
    tree.innerHTML = '';
    tgtMap.clear();
    planes.forEach(p => scene.remove(p));
    planes = [];

    const loader = new THREE.TextureLoader();
    targets.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t.name;
      li.className = 'cursor-pointer font-bold';
      li.onclick = () => {
        currentTarget = t.id;
        highlight(li);
        selectedAssetId = null;
      };
      tree.appendChild(li);
      tgtMap.set(t.id, li);

      if (!currentTarget) {
        currentTarget = t.id;
        highlight(li);
      }

      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: loader.load(abs(t.image)), side: THREE.DoubleSide })
      );
      plane.rotation.x = -Math.PI / 2;
      scene.add(plane);
      planes.push(plane);
    });
  }

  // Render experience assets into the scene
  function renderEA(eas) {
    objMap.forEach(o => scene.remove(o));
    objMap.clear();

    const gltfLoader = new GLTFLoader();
    const texLoader  = new THREE.TextureLoader();

    eas.forEach(async ea => {
      if (typeof ea.asset === 'number') {
        ea.asset = await fetch(`/api/assets/${ea.asset}/`).then(r => r.json());
      }

      let obj;
      if (ea.asset.type === 'model') {
        gltfLoader.load(abs(ea.asset.file), gltf => {
          gltf.scene.traverse(node => {
            if (node.isMesh && !node.material.map) {
              node.material = new THREE.MeshNormalMaterial();
            }
          });
          obj = gltf.scene;
          finish();
        });
      } else {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: texLoader.load(abs(ea.asset.file)) }));
        finish();
      }

      function finish() {
        applyTransform(obj, ea.transform);
        scene.add(obj);
        objMap.set(ea.id, obj);

        const parentLi = tgtMap.get(ea.target);
        if (parentLi) {
          const li = document.createElement('li');
          li.textContent = '└─ ' + ea.asset.name;
          li.className = 'cursor-pointer';
          li.onclick = () => {
            selectedAssetId = ea.asset.id;
            transform.attach(obj);
            selected = obj;
            updateInputs();
          };
          parentLi.appendChild(li);
        }
      }
    });
  }

  // Render global asset list
  function renderGlobalAssets(assets) {
    globalAssets.innerHTML = '';
    assetMap.clear();

    assets.forEach(a => {
      const li = document.createElement('li');
      li.textContent = a.name;
      li.className = 'cursor-pointer text-gray-600';
      li.onclick = () => {
        selectedAssetId = a.id;
        assetMap.forEach(n => n.style.background = '');
        li.style.background = '#eef';
        if (currentTarget) {
          fetch('/api/exp-assets/', {
            method: 'POST',
            headers: JSON_HEADERS,
            credentials: 'same-origin',
            body: JSON.stringify({
              experience: expId,
              asset: a.id,
              target: currentTarget,
              transform: { pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1] }
            })
          })
          .then(r => r.json())
          .then(newEa => renderEA([newEa]));
        }
      };
      globalAssets.appendChild(li);
      assetMap.set(a.id, li);
    });
  }

  // File inputs
  btnAddTarget.onclick = () => fileTarget.click();
  fileTarget.onchange = () => {
    const file = fileTarget.files[0];
    const fd = new FormData();
    fd.append('name', file.name.split('.')[0]);
    fd.append('image', file);
    fetch('/api/targets/', {
      method: 'POST',
      headers: { 'X-CSRFToken': CSRF },
      credentials: 'same-origin',
      body: fd
    }).then(refreshAll);
  };

  btnDelTarget.onclick = () => {
    if (!currentTarget) return alert('Selecciona un target');
    fetch(`/api/targets/${currentTarget}/`, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      credentials: 'same-origin'
    }).then(() => {
      currentTarget = null;
      refreshAll();
    });
  };

  btnAddAsset.onclick = () => fileAsset.click();
  fileAsset.onchange = () => {
    const file = fileAsset.files[0];
    const fd = new FormData();
    fd.append('name', file.name);
    fd.append('file', file);
    fd.append('type', file.type.split('/')[0]);
    fetch('/api/assets/', {
      method: 'POST',
      headers: { 'X-CSRFToken': CSRF },
      credentials: 'same-origin',
      body: fd
    }).then(refreshAll);
  };

  btnDelAsset.onclick = () => {
    if (!selectedAssetId) return alert('Selecciona un asset');
    fetch(`/api/assets/${selectedAssetId}/`, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      credentials: 'same-origin'
    }).then(() => {
      selectedAssetId = null;
      refreshAll();
    });
  };

  // Publish always uses Pattern Marker
  btnPublish.addEventListener('click', () => {
    if (!confirm('¿Publicar esta experiencia?')) return;

    fetch(`/publish/${expId}/`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'same-origin',
      body: JSON.stringify({ marker_type: 'pattern' })
    })
      .then(response => {
        if (!response.ok) throw response;
        return response.json();
      })
      .then(data => {
        alert('Publicado! URL:\n' + data.viewer_url);
        window.open(data.viewer_url, '_blank');
      })
      .catch(err => {
        console.error(err);
        err.json?.().then(e => alert(e.error || 'Error al publicar'));
      });
  });

  // Helpers
  function highlight(element) {
    [...tree.children].forEach(n => n.style.background = '');
    element.style.background = '#eef';
  }

  function abs(path) {
    return path.startsWith('http') ? path : `/media/${path}`;
  }

  function applyTransform(obj, t) {
    obj.position.set(...t.pos);
    obj.rotation.set(...t.rot.map(THREE.MathUtils.degToRad));
    obj.scale.set(...t.scale);
  }

  function syncInputGroup(prefix, deg) {
    ['x','y','z'].forEach(axis => {
      const slider = $(`${prefix}-${axis}`);
      const input  = $(`${prefix}-${axis}-num`);
      if (!slider || !input) return;

      slider.oninput = () => {
        input.value = slider.value;
        if (selected) {
          let v = parseFloat(slider.value);
          if (deg) v = THREE.MathUtils.degToRad(v);
          selected[prefix==='pos'?'position': prefix==='rot'?'rotation':'scale'][axis] = v;
          renderer.render(scene, camera);
        }
      };

      input.oninput = () => {
        slider.value = input.value;
        if (selected) {
          let v = parseFloat(input.value);
          if (deg) v = THREE.MathUtils.degToRad(v);
          selected[prefix==='pos'?'position': prefix==='rot'?'rotation':'scale'][axis] = v;
          renderer.render(scene, camera);
        }
      };
    });
  }
  syncInputGroup('pos',   false);
  syncInputGroup('rot',   true);
  syncInputGroup('scale', false);

  function updateInputs() {
    if (!selected) return;
    ['x','y','z'].forEach(axis => {
      $('pos-'+axis).value = $('pos-'+axis+'-num').value = selected.position[axis].toFixed(2);
      $('rot-'+axis).value = $('rot-'+axis+'-num').value = THREE.MathUtils.radToDeg(selected.rotation[axis]).toFixed(0);
      $('scale-'+axis).value = $('scale-'+axis+'-num').value = selected.scale[axis].toFixed(2);
    });
  }

  // Auto-save config every 30s
  setInterval(() => {
    fetch(`/save_config/${expId}/`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      credentials: 'same-origin',
      body: JSON.stringify({ config_json: { objects: [...objMap.keys()] } })
    });
  }, 30000);

  // Animation loop
  (function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  })();
});
