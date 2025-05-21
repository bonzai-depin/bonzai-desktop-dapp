<template>
  <div ref="threeContainer" class="three-container"></div>
</template>

<script>
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export default {
  name: "ThreeViewer",
  mounted() {
    // Ensure the context is preserved in the animation loop.
    this.animate = this.animate.bind(this);
    this.initThree();
    window.addEventListener("resize", this.onWindowResize);
  },
  beforeUnmount() {
    window.removeEventListener("resize", this.onWindowResize);
    cancelAnimationFrame(this.animationId);
    // Dispose of the renderer to free up resources
    this.renderer.dispose();
  },
  methods: {
    initThree() {
      // Create the scene
      this.scene = new THREE.Scene();

      // Get container dimensions
      const width = this.$refs.threeContainer.clientWidth;
      const height = this.$refs.threeContainer.clientHeight;

      // Set up camera
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      this.camera.position.z = 3;

      // Create renderer with transparency enabled
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setClearColor(0x000000, 0); // transparent background
      this.renderer.setSize(width, height);
      this.$refs.threeContainer.appendChild(this.renderer.domElement);

      // Create a cube (2x2x2) with a transparent material
      const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
      const cubeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.7,
      });
      this.cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      this.scene.add(this.cube);

      // Add white borders (wireframe) to the cube
      const cubeEdges = new THREE.EdgesGeometry(cubeGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
      const cubeWireframe = new THREE.LineSegments(cubeEdges, lineMaterial);
      this.cube.add(cubeWireframe);

      // Start animation loop
      this.animate();
    },
    animate() {
      this.animationId = requestAnimationFrame(this.animate);

      // Traverse the scene and animate each mesh (or any object with a rotation property)
      this.scene.traverse((child) => {
        if (child.isMesh && child.rotation) {
          child.rotation.x += 0.01;
          child.rotation.y += 0.01;
        }
      });

      this.renderer.render(this.scene, this.camera);
    },
    onWindowResize() {
      const width = this.$refs.threeContainer.clientWidth;
      const height = this.$refs.threeContainer.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    },
    // Dedicated function to replace the current object with a new one
    replaceObject(newObject) {
      let geometryData;
      if (typeof newObject === "string") {
        try {
          geometryData = JSON.parse(newObject);
        } catch (error) {
          console.error("Error parsing JSON:", error);
          return;
        }
      } else {
        geometryData = newObject;
      }

      const loader = new THREE.BufferGeometryLoader();
      let geometry;
      try {
        geometry = loader.parse(geometryData);
      } catch (error) {
        console.error("Error loading geometry:", error);
        return;
      }

      const material = new THREE.MeshStandardMaterial({ color: 0xff5533 });
      const mesh = new THREE.Mesh(geometry, material);

      // Reset the scene by removing all existing children
      while (this.scene.children.length > 0) {
        this.scene.remove(this.scene.children[0]);
      }

      // Add the new mesh to the scene
      this.scene.add(mesh);

      this.animate();
    },
    // Demo function: replace the cube with a sphere
    replaceWithSphere() {
      // Create sphere geometry and material
      const sphereGeometry = new THREE.SphereGeometry(1.2, 32, 32);
      const sphereMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.7,
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

      // Add white borders to the sphere
      const sphereEdges = new THREE.EdgesGeometry(sphereGeometry);
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
      const sphereWireframe = new THREE.LineSegments(sphereEdges, lineMaterial);
      sphere.add(sphereWireframe);

      // Replace the cube with the sphere
      this.replaceObject(sphere);
    },
    replaceScene(newScene) {
      // Replace the current scene with the new scene
      this.scene = newScene;
    },
  },
};
</script>

<style scoped>
.three-container {
  width: 100%;
  height: 50vh;
  overflow: hidden;
}
</style>
