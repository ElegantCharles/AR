const CSRF = (document.cookie.split('; ').find(c => c.startsWith('csrftoken=')) || '').split('=')[1] || '';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'X-CSRFToken': CSRF
};

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => {
  const canvas = $('three-canvas');
  const tree = $('tree');
  const fileTarget = $('file-target');
  const fileAsset = $('file-asset');
  const globalAssets = $('global-assets');
  const btnAddTarget = $('btn-add-target');
  const btnDelTarget = $('btn-del-target');
  const btnAddAsset = $('btn-add-content');
  const btnDelAsset = $('btn-del-asset');
  const btnPublish = $('btn-publish');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });

  scene.add(new THREE.GridHelper(10, 10));
  scene.add(new THREE.AxesHelper(5));
  scene.add(new THREE.AmbientLight(0xffffff, 1));
  camera.position.set(0, 2, 5);

  function resize() {
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  const controls = new OrbitControls(camera, renderer.domElement);
  const transform = new TransformControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.addEventListener('change', () => renderer.render(scene, camera));
  transform.addEventListener('change', () => renderer.render(scene, camera));
  transform.addEventListener('objectChange', updateInputs);
  scene.add(transform);

  const expId = window.EXP_ID;
  const tgtQP = `experience=${expId}`;
  const eaQP = `experience=${expId}`;

  const objMap = new Map();
  const tgtMap = new Map();
  const assetMap = new Map();

  let selected = null;
  let currentTarget = null;
  let selectedAsset = null;
  let planes = [];

  refreshAll();

  function refreshAll() {
    Promise.all([
      fetch(`/api/targets/?${tgtQP}`).then(r => r.json()).then(renderTargets),
      fetch(`/api/exp-assets/?${eaQP}`).then(r => r.json()).then(renderEA),
      fetch('/api/assets/').then(r => r.json()).then(renderGlobalAssets)
    ]).catch(console.error);
  }

  function renderTargets(targets = []) {
    tree.innerHTML = '';
    tgtMap.clear();
    planes.forEach(p => scene.remove(p));
    planes = [];

    const tLoader = new THREE.TextureLoader();

    targets.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t.name;
      li.className = 'cursor-pointer font-bold';
      li.onclick = () => {
        currentTarget = t.id;
        highlight(li);
        selectedAsset = null;
      };
      tree.appendChild(li);
      tgtMap.set(t.id, li);

      if (!currentTarget) {
        currentTarget = t.id;
        highlight(li);
      }

      const mat = new THREE.MeshBasicMaterial({
        map: tLoader.load(abs(t.image)),
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      plane.rotation.x = -Math.PI / 2;
      scene.add(plane);
      planes.push(plane);
    });
  }

  function renderEA(eas = []) {
    objMap.forEach(o => scene.remove(o));
    objMap.clear();

    const gltfLoader = new GLTFLoader();
    const texLoader = new THREE.TextureLoader();

    eas.forEach(async ea => {
      if (typeof ea.asset === 'number') {
        ea.asset = await fetch(`/api/assets/${ea.asset}/`).then(r => r.json());
      }

      const t = ea.transform;
      let obj;

      const finish = () => {
        applyTransform(obj, t);
        scene.add(obj);
        objMap.set(ea.id, obj);

        const parent = tgtMap.get(ea.target);
        if (parent) {
          const li = document.createElement('li');
          li.textContent = '└─ ' + ea.asset.name;
          li.className = 'cursor-pointer';
          li.onclick = () => {
            selectedAsset = ea;
            transform.attach(obj);
            selected = obj;
            updateInputs();
          };
          parent.appendChild(li);
        }
      };

      if (ea.asset.type === 'model') {
        const url = abs(ea.asset.file);
        gltfLoader.load(
          url,
          gltf => {
            gltf.scene.traverse(n => {
              if (n.isMesh && !n.material.map) n.material = new THREE.MeshNormalMaterial();
            });
            obj = gltf.scene;
            finish();
          },
          undefined,
          err => console.error(`GLTF error (${url})`, err)
        );
      } else {
        const sprMat = new THREE.SpriteMaterial();
        texLoader.load(
          abs(ea.asset.file),
          tex => { sprMat.map = tex; obj = new THREE.Sprite(sprMat); finish(); },
          undefined,
          err => console.error('Texture error', err)
        );
      }
    });
  }

  function renderGlobalAssets(assets = []) {
    globalAssets.innerHTML = '';
    assetMap.clear();

    assets.forEach(a => {
      const li = document.createElement('li');
      li.textContent = a.name;
      li.className = 'cursor-pointer text-gray-600';
      li.onclick = () => {
        selectedAsset = a;
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

  btnAddTarget.onclick = () => fileTarget.click();
  fileTarget.onchange = () => {
    const file = fileTarget.files[0];
    const fd = new FormData();
    fd.append('name', file.name.replace(/\.[^.]+$/, ''));
    fd.append('image', file);

    fetch('/api/targets/', { method: 'POST', headers: { 'X-CSRFToken': CSRF }, body: fd })
      .then(r => r.json())
      .then(t => {
        return fetch(`/api/experiences/${expId}/`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({ targets: [t.id] })
        });
      })
      .then(refreshAll);
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
    const kind = file.type.split('/')[0] || (file.name.match(/\.(gltf|glb)$/i) ? 'model' : 'file');
    fd.append('type', kind);

    fetch('/api/assets/', {
      method: 'POST',
      headers: { 'X-CSRFToken': CSRF },
      credentials: 'same-origin',
      body: fd
    }).then(refreshAll);
  };

  btnDelAsset.onclick = () => {
    if (!selectedAsset) return alert('Selecciona un asset');
    const ea = [...objMap.keys()].find(id => selectedAsset.id === selectedAsset.id);
    if (ea) {
      fetch(`/api/exp-assets/${ea}/`, {
        method: 'DELETE',
        headers: JSON_HEADERS,
        credentials: 'same-origin'
      }).then(refreshAll);
    } else {
      if (confirm('Eliminar el asset globalmente? Puede afectar otras experiencias.')) {
        fetch(`/api/assets/${selectedAsset.id}/`, {
          method: 'DELETE',
          headers: JSON_HEADERS,
          credentials: 'same-origin'
        }).then(refreshAll);
      }
    }
  };

  btnPublish.onclick = () => {
    if (!confirm('¿Publicar esta experiencia en modo NFT?')) return;
    fetch(`/publish/${expId}/`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'same-origin',
      body: JSON.stringify({ marker_type: 'nft' })
    })
      .then(r => r.json())
      .then(data => {
        alert(`Publicado!\n${data.viewer_url}`);
        window.open(data.viewer_url, '_blank');
      })
      .catch(err => {
        console.error(err);
        alert(err.message || 'Error al publicar');
      });
  };

  function highlight(el) {
    [...tree.children].forEach(n => n.style.background = '');
    el.style.background = '#eef';
  }

  const abs = p => p.startsWith('http') ? p : `/media/${p}`;

  function applyTransform(o, t) {
    o.position.set(...t.pos);
    o.rotation.set(...t.rot.map(THREE.MathUtils.degToRad));
    o.scale.set(...t.scale);
  }

  function syncInputGroup(prefix, deg) {
    ['x', 'y', 'z'].forEach(axis => {
      const slider = $(`${prefix}-${axis}`);
      const input = $(`${prefix}-${axis}-num`);
      if (!slider) return;

      const setter = v => {
        let val = parseFloat(v);
        if (deg) val = THREE.MathUtils.degToRad(val);
        selected[
          prefix === 'pos' ? 'position' :
          prefix === 'rot' ? 'rotation' : 'scale'
        ][axis] = val;
        renderer.render(scene, camera);
      };

      slider.oninput = () => { input.value = slider.value; if (selected) setter(slider.value); };
      input.oninput = () => { slider.value = input.value; if (selected) setter(input.value); };
    });
  }
  syncInputGroup('pos', false);
  syncInputGroup('rot', true);
  syncInputGroup('scale', false);

  function updateInputs() {
    if (!selected) return;
    ['x', 'y', 'z'].forEach(axis => {
      $(`pos-${axis}`).value = $(`pos-${axis}-num`).value = selected.position[axis].toFixed(2);
      $(`rot-${axis}`).value = $(`rot-${axis}-num`).value = THREE.MathUtils.radToDeg(selected.rotation[axis]).toFixed(0);
      $(`scale-${axis}`).value = $(`scale-${axis}-num`).value = selected.scale[axis].toFixed(2);
    });
  }

  setInterval(() => {
    fetch(`/save_config/${expId}/`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      credentials: 'same-origin',
      body: JSON.stringify({ config_json: { objects: [...objMap.keys()] } })
    });
  }, 30000);

  (function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  })();
});
