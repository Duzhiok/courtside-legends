// The ONLY Three.js symbols the avatar viewer uses. esbuild tree-shakes everything else away.
export { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, HemisphereLight, AnimationMixer, Clock, Box3, Vector3, Group, SRGBColorSpace } from "three";
export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
