// The ONLY Three.js symbols the avatar viewer uses. esbuild tree-shakes everything else away.
export { WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, HemisphereLight, AnimationMixer, Clock, Box3, Vector3, Group, SRGBColorSpace, LoopRepeat, LoopOnce } from "three";
// The showcase platform (avatarStage.js): flat discs, a rim, a soft shadow plane.
export { Mesh, MeshStandardMaterial, MeshBasicMaterial, CylinderGeometry, CircleGeometry, TorusGeometry, PlaneGeometry, CanvasTexture } from "three";
export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
