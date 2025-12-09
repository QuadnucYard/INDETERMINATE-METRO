import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Rect } from "./types";

export class ModelRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private model: THREE.Group | null = null;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.scene = new THREE.Scene();

    // Setup camera
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1000);
    this.camera.position.set(10, -10, 10);
    this.camera.lookAt(0, 2.5, 0);

    // Setup lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(100, 100, 100);
    this.scene.add(directionalLight);

    // Add axes helper for debugging
    // const axesHelper = new THREE.AxesHelper(10);
    // this.scene.add(axesHelper);

    // Load model
    const loader = new GLTFLoader();
    loader.load(
      `${import.meta.env.BASE_URL}lollipop.glb`,
      (gltf) => {
        this.model = gltf.scene;

        // Center the model
        const box = new THREE.Box3().setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        this.model.position.sub(center);

        // Apply "italic" shear to the model container or the model itself
        const shearMatrix = new THREE.Matrix4();
        shearMatrix.makeShear(0.3, 0, 0, 0, 0, 0);

        // Apply shear to the model
        this.model.applyMatrix4(shearMatrix);

        this.scene.add(this.model);
      },
      undefined,
      (error) => {
        console.warn("An error happened loading the model:", error);
        // Fallback: Add a cube if model fails to load
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, wireframe: true });
        this.model = new THREE.Group();
        const cube = new THREE.Mesh(geometry, material);
        this.model.add(cube);

        // Apply shear
        const shearMatrix = new THREE.Matrix4();
        shearMatrix.makeShear(0.3, 0, 0, 0, 0, 0);
        this.model.applyMatrix4(shearMatrix);

        this.scene.add(this.model);
      },
    );
  }

  public getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  public resize(rect: Rect) {
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
  }

  public update(dt: number, totalRidership: number, multiplier: number) {
    if (this.model) {
      const baseSpeed = totalRidership * 1; // Adjust scale as needed
      const rotationSpeed = baseSpeed * multiplier;

      // Rotate around Y axis
      this.model.rotation.y += rotationSpeed * dt;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
