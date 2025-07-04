const CSRF = document.cookie.split('; ').find(r => r.startsWith('csrftoken='))?.split('=')[1] || '';
const JSON_HEADERS = { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF };

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const canvas = $('three-canvas');
  const tree = $('tree');
  const btnAddTarget = $('btn-add-target');
  const btnDelTarget = $('btn-del-target');
  const btnAddAsset = $('btn-add-content');
  const btnDelAsset = $('btn-del-asset');
  const btnPublish = $('btn-publish');
  const fileTarget = $('file-target');
  const fileAsset = $('file-asset');
  const globalAssets = $('global-assets');

  const scene = new THREE.Scene();
  scene.add(new THREE.GridHelper(10, 10));
  scene.add(new THREE.AxesHelper(5));
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 2, 5);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  function resize() {
    const w = canvas.clientWidth || 600;
    const h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.addEventListener('change', () => renderer.render(scene, camera));

  const transform = new TransformControls(camera, renderer.domElement);
  transform.addEventListener('change', () => renderer.render(scene, camera));
  transform.addEventListener('objectChange', updateInputs);
  scene.add(transform);

  const expId = window.EXP_ID;
  const objMap = new Map();
  const tgtMap = new Map();
  const assetMap = new Map();
  let selected = null;
  let currentTarget = null;
  let selectedAssetId = null;
  let planes = [];

  function refreshAll() {
    Promise.all([
      fetch(`/api/targets/?experience=${expId}`).then(r => r.json()).then(renderTargets),
      fetch(`/api/exp-assets/?experience=${expId}`).then(r => r.json()).then(renderEA),
      fetch('/api/assets/').then(r => r.json()).then(renderGlobalAssets)
    ]).catch(console.error);
  }
  refreshAll();

  function renderTargets(tgts) {
    tree.innerHTML = '';
    tgtMap.clear();
    planes.forEach(p => scene.remove(p));
    planes = [];
    const tex = new THREE.TextureLoader();
    tgts.forEach(t => {
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
        new THREE.MeshBasicMaterial({ map: tex.load(abs(t.image)), side: THREE.DoubleSide })
      );
      plane.rotation.x = -Math.PI / 2;
      scene.add(plane);
      planes.push(plane);
    });
  }

  function renderEA(eas) {
    objMap.forEach(o => scene.remove(o));
    objMap.clear();
    const gltf = new GLTFLoader();
    const tex = new THREE.TextureLoader();
    eas.forEach(async ea => {
      if (typeof ea.asset === 'number') {
        ea.asset = await fetch(`/api/assets/${ea.asset}/`).then(r => r.json());
      }
      let obj;
      if (ea.asset.type === 'model') {
        gltf.load(abs(ea.asset.file), g => {
          g.scene.traverse(n => {
            if (n.isMesh && !n.material.map) n.material = new THREE.MeshNormalMaterial();
          });
          obj = g.scene;
          finish();
        });
      } else {
        obj = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.load(abs(ea.asset.file)) }));
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
        if (currentTarget && confirm('¿Agregar este asset al target seleccionado?')) {
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
            .then(ea => renderEA([ea]));
        }
      };
      globalAssets.appendChild(li);
      assetMap.set(a.id, li);
    });
  }

  btnAddTarget.onclick = () => fileTarget.click();
  fileTarget.onchange = () => {
    const f = fileTarget.files[0];
    const fd = new FormData();
    fd.append('name', f.name.split('.')[0]);
    fd.append('image', f);
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
    const f = fileAsset.files[0];
    const fd = new FormData();
    fd.append('name', f.name);
    fd.append('file', f);
    fd.append('type', f.type.split('/')[0]);
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

  btnPublish.addEventListener('click', () => {
    // 1. Pregunta tipo de target
    const usePattern = confirm(
      '¿Usar Pattern Marker (más rápido y ligero) en lugar de NFT (más robusto pero más pesado)?\n' +
      '→ OK = Pattern Marker\n' +
      '→ Cancelar = NFT'
    );
    const markerType = usePattern ? 'pattern' : 'nft';

    // 2. Publica pasando markerType
    fetch(`/publish/${expId}/`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'same-origin',
      body: JSON.stringify({ marker_type: markerType })
    })
      .then(r => {
        if (!r.ok) throw r;
        return r.json();
      })
      .then(body => {
        alert('Publicado! URL:\n' + body.viewer_url);
        window.open(body.viewer_url, '_blank');
      })
      .catch(err => {
        console.error(err);
        err.json?.().then(e => alert(e.error || 'Error al publicar'));
      });
  });


  function highlight(li) {
    [...tree.children].forEach(n => n.style.background = '');
    li.style.background = '#eef';
  }
  function abs(p) {
    return p.startsWith('http') ? p : `/media/${p}`;
  }
  function applyTransform(o, t) {
    o.position.set(...t.pos);
    o.rotation.set(...t.rot.map(THREE.MathUtils.degToRad));
    o.scale.set(...t.scale);
  }

  function syncInputGroup(prefix, deg) {
    ['x', 'y', 'z'].forEach(ax => {
      const s = $(prefix + '-' + ax);
      const n = $(prefix + '-' + ax + '-num');
      if (!s || !n) return;
      s.oninput = () => {
        n.value = s.value;
        if (selected) {
          let v = parseFloat(s.value);
          if (deg) v = THREE.MathUtils.degToRad(v);
          selected[prefix === 'pos' ? 'position' : prefix === 'rot' ? 'rotation' : 'scale'][ax] = v;
          renderer.render(scene, camera);
        }
      };
      n.oninput = () => {
        s.value = n.value;
        if (selected) {
          let v = parseFloat(n.value);
          if (deg) v = THREE.MathUtils.degToRad(v);
          selected[prefix === 'pos' ? 'position' : prefix === 'rot' ? 'rotation' : 'scale'][ax] = v;
          renderer.render(scene, camera);
        }
      };
    });
  }
  syncInputGroup('pos', false);
  syncInputGroup('rot', true);
  syncInputGroup('scale', false);

  function updateInputs() {
    if (!selected) return;
    ['x', 'y', 'z'].forEach(ax => {
      $('pos-' + ax).value = $('pos-' + ax + '-num').value = selected.position[ax].toFixed(2);
      $('rot-' + ax).value = $('rot-' + ax + '-num').value = THREE.MathUtils.radToDeg(selected.rotation[ax]).toFixed(0);
      $('scale-' + ax).value = $('scale-' + ax + '-num').value = selected.scale[ax].toFixed(2);
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
});
