(() => {
  const descriptors = new Map();
  let loadingModel;

  async function loadModel() {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../node_modules/@vladmandic/face-api/dist/face-api.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    const api = window.faceapi;
    await api.tf.ready();
    const directory = 'nova-cast-model://weights';
    const models = [api.nets.tinyFaceDetector, api.nets.ssdMobilenetv1, api.nets.faceLandmark68TinyNet, api.nets.faceRecognitionNet];
    await Promise.all(models.map(net => net.loadFromUri(directory)));
    return api;
  }

  async function describe(api, source, portrait = false) {
    const picture = new Image();
    picture.src = source;
    await picture.decode();
    const scan = options => api.detectAllFaces(picture, options).withFaceLandmarks(true).withFaceDescriptors();
    if (portrait) return scan(new api.SsdMobilenetv1Options({ minConfidence: 0.55 }));
    const faces = await scan(new api.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }));
    return faces.length ? faces : scan(new api.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }));
  }

  window.recognizeSceneCast = async ({ frame, references }) => {
    loadingModel ??= loadModel();
    const api = await loadingModel;
    const faces = await describe(api, frame);
    if (!faces.length) return [];

    const roster = [];
    for (const { id, source, index } of references) {
      if (!descriptors.has(id)) {
        if (descriptors.size >= 64) descriptors.delete(descriptors.keys().next().value);
        const portrait = await describe(api, source, true).catch(() => []);
        descriptors.set(id, portrait.length === 1 ? portrait[0].descriptor : null);
      }
      const descriptor = descriptors.get(id);
      if (descriptor) roster.push({ index, descriptor });
    }
    const matched = new Set();
    for (const face of faces) {
      const distances = new Map();
      for (const { index, descriptor } of roster) {
        const distance = api.euclideanDistance(face.descriptor, descriptor);
        distances.set(index, Math.min(distances.get(index) ?? Infinity, distance));
      }
      const [first, second] = [...distances].sort((a, b) => a[1] - b[1]);
      if (first && first[1] < 0.52 && (!second || second[1] - first[1] > 0.08)) matched.add(first[0]);
    }
    return [...matched];
  };
})();
