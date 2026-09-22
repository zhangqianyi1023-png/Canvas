import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import Icon from './Icon';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeYaw = (value) => {
  const normalized = ((Number(value) + 180) % 360 + 360) % 360 - 180;
  return Math.round(normalized);
};

const createOrbitRing = (radius, rotation = {}) => {
  const points = [];
  for (let index = 0; index < 96; index += 1) {
    const angle = index / 96 * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0x9da7b5,
    transparent: true,
    opacity: 0.22,
  });
  const ring = new THREE.LineLoop(geometry, material);
  ring.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  return ring;
};

function AngleCameraPreview({
  imageUrl,
  yaw = 0,
  pitch = 0,
  distance = 4,
  secondaryCamera = null,
  disabled = false,
  onChange,
}) {
  const mountRef = useRef(null);
  const sceneStateRef = useRef(null);
  const dragRef = useRef(null);
  const pendingChangeRef = useRef(null);
  const changeFrameRef = useRef(0);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const renderScene = useCallback(() => {
    const current = sceneStateRef.current;
    if (!current) return;

    const safeYaw = normalizeYaw(yaw);
    const safePitch = clamp(Number(pitch) || 0, -60, 60);
    const safeDistance = clamp(Number(distance) || 4, 1, 8);

    const placeCamera = (rig, line, camera) => {
      const nextYaw = normalizeYaw(camera.yaw);
      const nextPitch = clamp(Number(camera.pitch) || 0, -60, 60);
      const nextDistance = clamp(Number(camera.distance) || 4, 1, 8);
      const yawRadians = THREE.MathUtils.degToRad(nextYaw);
      const pitchRadians = THREE.MathUtils.degToRad(nextPitch);
      const orbitRadius = 2.08 + (nextDistance - 1) / 7 * 0.72;
      const horizontalRadius = Math.cos(pitchRadians) * orbitRadius;

      rig.position.set(
        Math.sin(yawRadians) * horizontalRadius,
        -Math.sin(pitchRadians) * orbitRadius,
        Math.cos(yawRadians) * horizontalRadius,
      );
      rig.lookAt(0, 0, 0);
      const linePositions = line.geometry.attributes.position;
      linePositions.setXYZ(0, rig.position.x, rig.position.y, rig.position.z);
      linePositions.setXYZ(1, 0, 0, 0);
      linePositions.needsUpdate = true;
      line.computeLineDistances();
    };

    placeCamera(current.cameraRig, current.viewLine, {
      yaw: safeYaw,
      pitch: safePitch,
      distance: safeDistance,
    });

    const shouldShowSecondary = Boolean(secondaryCamera);
    current.secondaryCameraRig.visible = shouldShowSecondary;
    current.secondaryViewLine.visible = shouldShowSecondary;
    if (shouldShowSecondary) {
      placeCamera(current.secondaryCameraRig, current.secondaryViewLine, secondaryCamera);
    }
    current.renderer.render(current.scene, current.viewCamera);
  }, [distance, pitch, secondaryCamera, yaw]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'angle-camera-canvas';
    mount.appendChild(renderer.domElement);

    const viewCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    viewCamera.position.set(5.3, 3.6, 6.1);
    viewCamera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.75, 28, 20),
      new THREE.MeshBasicMaterial({
        color: 0xaab4c2,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      }),
    );
    scene.add(sphere);
    scene.add(createOrbitRing(2.76));
    scene.add(createOrbitRing(2.76, { z: Math.PI / 2 }));
    scene.add(createOrbitRing(2.76, { x: Math.PI / 3, z: Math.PI / 5 }));

    const subjectMaterial = new THREE.MeshBasicMaterial({
      color: 0x2b2e34,
      side: THREE.DoubleSide,
    });
    const subject = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), subjectMaterial);
    subject.scale.set(2.15, 2.15, 1);
    subject.rotation.set(-0.08, -0.16, 0);
    scene.add(subject);

    const subjectFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.25, 2.25, 0.05)),
      new THREE.LineBasicMaterial({ color: 0xd9e1ea, transparent: true, opacity: 0.34 }),
    );
    subjectFrame.rotation.copy(subject.rotation);
    scene.add(subjectFrame);

    const cameraRig = new THREE.Group();
    const cameraBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.28, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.48, metalness: 0.12 }),
    );
    const cameraLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.15, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x25282d, roughness: 0.42, metalness: 0.3 }),
    );
    cameraLens.rotation.x = Math.PI / 2;
    cameraLens.position.z = -0.23;
    const cameraTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.1, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xcad2dc, roughness: 0.5 }),
    );
    cameraTop.position.y = 0.18;
    cameraRig.add(cameraBody, cameraLens, cameraTop);
    scene.add(cameraRig);

    const secondaryCameraRig = new THREE.Group();
    const secondaryCameraBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.24, 0.26),
      new THREE.MeshStandardMaterial({
        color: 0xffc082,
        transparent: true,
        opacity: 0.58,
        roughness: 0.48,
        metalness: 0.12,
      }),
    );
    const secondaryCameraLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 0.16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x201915,
        transparent: true,
        opacity: 0.62,
        roughness: 0.42,
        metalness: 0.3,
      }),
    );
    secondaryCameraLens.rotation.x = Math.PI / 2;
    secondaryCameraLens.position.z = -0.2;
    secondaryCameraRig.add(secondaryCameraBody, secondaryCameraLens);
    secondaryCameraRig.visible = false;
    scene.add(secondaryCameraRig);

    const viewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: 0x57b7ff,
        dashSize: 0.12,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.74,
      }),
    );
    viewLine.computeLineDistances();
    scene.add(viewLine);

    const secondaryViewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: 0xffb35c,
        dashSize: 0.1,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.46,
      }),
    );
    secondaryViewLine.computeLineDistances();
    secondaryViewLine.visible = false;
    scene.add(secondaryViewLine);

    const floor = new THREE.GridHelper(7, 14, 0x4c5664, 0x333a44);
    floor.position.y = -2.86;
    floor.material.transparent = true;
    floor.material.opacity = 0.24;
    scene.add(floor);

    sceneStateRef.current = {
      scene,
      renderer,
      viewCamera,
      subject,
      subjectFrame,
      cameraRig,
      secondaryCameraRig,
      viewLine,
      secondaryViewLine,
      texture: null,
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      viewCamera.aspect = width / height;
      viewCamera.updateProjectionMatrix();
      renderer.render(scene, viewCamera);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    return () => {
      observer.disconnect();
      const current = sceneStateRef.current;
      current?.texture?.dispose();
      scene.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose?.());
        } else {
          object.material?.dispose?.();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
      sceneStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    renderScene();
  }, [renderScene]);

  useEffect(() => {
    const current = sceneStateRef.current;
    if (!current || !imageUrl) return undefined;
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      imageUrl,
      texture => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        current.texture?.dispose();
        current.texture = texture;
        texture.colorSpace = THREE.SRGBColorSpace;
        const source = texture.image;
        const aspect = Math.max(0.1, (source?.naturalWidth || source?.width || 1) / (source?.naturalHeight || source?.height || 1));
        const width = aspect >= 1 ? 2.2 : 2.2 * aspect;
        const height = aspect >= 1 ? 2.2 / aspect : 2.2;
        current.subject.scale.set(width, height, 1);
        current.subject.material.map = texture;
        current.subject.material.color.set(0xffffff);
        current.subject.material.needsUpdate = true;
        current.subjectFrame.scale.set(width / 2.15, height / 2.15, 1);
        current.renderer.render(current.scene, current.viewCamera);
      },
      undefined,
      () => {
        if (!cancelled) current.renderer.render(current.scene, current.viewCamera);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => () => {
    window.cancelAnimationFrame(changeFrameRef.current);
  }, []);

  const scheduleChange = useCallback((nextYaw, nextPitch) => {
    pendingChangeRef.current = {
      yaw: normalizeYaw(nextYaw),
      pitch: Math.round(clamp(nextPitch, -60, 60)),
    };
    if (changeFrameRef.current) return;
    changeFrameRef.current = window.requestAnimationFrame(() => {
      changeFrameRef.current = 0;
      const next = pendingChangeRef.current;
      pendingChangeRef.current = null;
      if (next) onChangeRef.current?.(next);
    });
  }, []);

  const handlePointerDown = useCallback(event => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: Number(yaw) || 0,
      pitch: Number(pitch) || 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [disabled, pitch, yaw]);

  const handlePointerMove = useCallback(event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    scheduleChange(
      drag.yaw + (event.clientX - drag.x) * 0.48,
      drag.pitch + (event.clientY - drag.y) * 0.4,
    );
  }, [disabled, scheduleChange]);

  const finishPointer = useCallback(event => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const nudge = useCallback((yawDelta, pitchDelta) => {
    if (disabled) return;
    onChangeRef.current?.({
      yaw: normalizeYaw((Number(yaw) || 0) + yawDelta),
      pitch: Math.round(clamp((Number(pitch) || 0) + pitchDelta, -60, 60)),
    });
  }, [disabled, pitch, yaw]);

  return (
    <div className={`angle-camera-preview ${disabled ? 'is-disabled' : ''}`}>
      <div
        ref={mountRef}
        className="angle-camera-mount"
        role="application"
        aria-label="拖拽调整相机视角"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      />
      <button type="button" className="angle-camera-nudge is-left" onClick={() => nudge(-15, 0)} disabled={disabled} data-tooltip="向左旋转" aria-label="向左旋转15度">
        <Icon name="arrowLeft" size={16} />
      </button>
      <button type="button" className="angle-camera-nudge is-right" onClick={() => nudge(15, 0)} disabled={disabled} data-tooltip="向右旋转" aria-label="向右旋转15度">
        <Icon name="arrowLeft" size={16} />
      </button>
      <button type="button" className="angle-camera-nudge is-up" onClick={() => nudge(0, -10)} disabled={disabled} data-tooltip="向上移动相机" aria-label="向上移动相机10度">
        <Icon name="arrowLeft" size={16} />
      </button>
      <button type="button" className="angle-camera-nudge is-down" onClick={() => nudge(0, 10)} disabled={disabled} data-tooltip="向下移动相机" aria-label="向下移动相机10度">
        <Icon name="arrowLeft" size={16} />
      </button>
    </div>
  );
}

export default AngleCameraPreview;
