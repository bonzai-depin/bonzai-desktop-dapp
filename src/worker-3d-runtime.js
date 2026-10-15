// This entry is loaded only by the isolated, ephemeral export window (no preload).
window.worker3DReady = (async () => {
  const [{ exportObjectGLB }, THREE] = await Promise.all([
    import('./components/gen3d/glbExport.js'), import('three'),
  ]);
  window.exportWorkerGLB = async code => {
    const source = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const scene = new THREE.Scene();
    try {
      const module = await import(/* @vite-ignore */ source);
      if (typeof module.default !== 'function') throw new Error('The scene has no generator.');
      const root = await module.default({ THREE, scene });
      const bytes = await exportObjectGLB(root?.isObject3D ? root : scene);
      if (bytes.length > 128 * 1024 * 1024) throw new Error('3D delivery exceeds 128 MiB.');
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    } finally { URL.revokeObjectURL(source); scene.traverse(node => { node.geometry?.dispose(); for (const material of Array.isArray(node.material) ? node.material : [node.material]) material?.dispose(); }); }
  };
})();
