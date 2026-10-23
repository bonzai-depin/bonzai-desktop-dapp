import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { describePart, partKey, readTransform, writeTransform } from './levelEditing.js';

export class LevelEditControls {
  constructor({viewer,root,onSelect,onTransform,onPlace}) {
    Object.assign(this,{viewer,root,onSelect,onTransform,onPlace});
    this.element=viewer.renderer.domElement;
    this.gizmo=new TransformControls(viewer.camera,this.element);
    this.gizmo.setSize(.8);this.gizmo.setSpace('local');
    this.helper=this.gizmo.getHelper();this.helper.userData.excludeFromBBox=true;
    viewer.scene.add(this.helper);
    this.outline=new THREE.Box3Helper(new THREE.Box3(),0x82aaff);
    this.outline.visible=false;this.outline.material.depthTest=false;this.outline.renderOrder=1000;
    viewer.scene.add(this.outline);
    this.gizmo.addEventListener('dragging-changed',event=>{
      viewer.controls.enabled=!event.value;
      if(!event.value&&this.selection){this.commit();this.suppressClick=true;}
    });
    this.gizmo.addEventListener('objectChange',()=>this.updateInstance());
    this.down=event=>{this.pointer={x:event.clientX,y:event.clientY,button:event.button};this.suppressClick=false;};
    this.up=event=>{
      if(this.disabled||!this.pointer||this.pointer.button!==0||this.suppressClick||this.gizmo.axis||Math.hypot(event.clientX-this.pointer.x,event.clientY-this.pointer.y)>4)return;
      if(this.pendingAsset){this.onPlace(this.pendingAsset,this.dropPosition(event.clientX,event.clientY));this.pendingAsset=null;return;}
      const hit=this.hits(event.clientX,event.clientY)[0];
      if(!hit){this.select(null);return;}
      let node=hit.object;
      // Click an assembly as a unit. The object list exposes nested parts too.
      while(node.parent&&node.parent!==this.root&&!node.userData.bonzaiPart?.placementId){
        if(node.parent.userData.bonzaiPart)node=node.parent;else break;
      }
      const target={...node.userData.bonzaiPart};
      if(node===hit.object&&node.isInstancedMesh)target.instanceId=hit.instanceId;
      this.select(node,target);
    };
    this.element.addEventListener('pointerdown',this.down,true);
    this.element.addEventListener('pointerup',this.up);
    viewer._isEditingLevel=true;
    viewer.setNavigationMode('orbit');
    this.autoRotate=viewer.controls.autoRotate;
    viewer.controls.autoRotate=false;
  }
  hits(x,y){
    const rect=this.element.getBoundingClientRect(),ray=new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.viewer.camera);
    return ray.intersectObject(this.root,true).filter(hit=>{
      let n=hit.object;while(n&&n!==this.root){if(!n.visible)return false;n=n.parent;}return n===this.root;
    });
  }
  dropPosition(x,y){
    const hit=this.hits(x,y)[0];
    const world=hit?.point.clone() || new THREE.Vector3(...Object.values(this.viewer.screenToGroundPosition(x,y)));
    this.root.worldToLocal(world);return {x:world.x,y:world.y,z:world.z};
  }
  entries(){
    const entries=[];
    const walk=(node,depth)=>{
      const target=node.userData.bonzaiPart;
      if(target&&(node.isMesh||node.children.length)) entries.push({key:partKey(target),target:{...target},title:node.name||node.geometry?.type?.replace('Geometry','')||node.type,depth,node,instanceCount:node.isInstancedMesh?node.count:0});
      if(target?.placementId || target?.instanceId!=null)return;
      for(const child of node.children)if(child.userData.bonzaiPart)walk(child,depth+1);
    };
    for(const child of this.root.children)walk(child,0);
    return entries;
  }
  selectByKey(key){
    const entry=this.entries().find(item=>item.key===key);
    if(entry)this.select(entry.node,entry.target);else this.select(null);
  }
  selectTarget(target){
    const candidates=this.entries().filter(item=>target.placementId ? item.target.placementId===target.placementId : item.target.path===target.path);
    const entry=candidates.find(item=>item.target.instanceId===target.instanceId) || candidates.find(item=>item.node.isInstancedMesh);
    if(entry)this.select(entry.node,target);else this.select(null);
  }
  select(node,target=node?.userData.bonzaiPart){
    this.gizmo.detach();this.proxy?.removeFromParent();this.proxy=null;
    this.selection=node&&target ? {node,target:{...target}} : null;
    this.outline.visible=!!this.selection;
    if(!this.selection){this.onSelect(null);return;}
    if(node.isInstancedMesh&&target.instanceId!=null){
      this.proxy=new THREE.Object3D();node.add(this.proxy);
      const matrix=new THREE.Matrix4();node.getMatrixAt(target.instanceId,matrix);
      matrix.decompose(this.proxy.position,this.proxy.quaternion,this.proxy.scale);
      this.gizmo.attach(this.proxy);
    }else this.gizmo.attach(node);
    this.updateOutline();this.onSelect({...describePart(node,target),instanceCount:node.isInstancedMesh?node.count:0});
  }
  updateInstance(){
    if(this.proxy&&this.selection){
      this.proxy.updateMatrix();const {node,target}=this.selection;
      node.setMatrixAt(target.instanceId,this.proxy.matrix);node.instanceMatrix.needsUpdate=true;
      node.computeBoundingSphere();node.computeBoundingBox();
    }
    this.updateOutline();
  }
  updateOutline(){
    if(!this.selection)return;
    const {node,target}=this.selection;node.updateWorldMatrix(true,true);
    if(node.isInstancedMesh&&target.instanceId!=null){
      node.geometry.computeBoundingBox();const matrix=new THREE.Matrix4();node.getMatrixAt(target.instanceId,matrix);
      this.outline.box.copy(node.geometry.boundingBox).applyMatrix4(matrix.premultiply(node.matrixWorld));
    }else this.outline.box.setFromObject(node);
  }
  transform(value){if(!this.selection)return;writeTransform(this.proxy||this.selection.node,value);this.updateInstance();this.commit();}
  commit(){if(!this.selection)return;const {node,target}=this.selection;this.onTransform({...describePart(node,target),instanceCount:node.isInstancedMesh?node.count:0,transform:readTransform(this.proxy||node)});}
  markerPosition(){if(!this.selection)return null;const point=(this.proxy||this.selection.node).getWorldPosition(new THREE.Vector3());this.root.worldToLocal(point);return {x:point.x,y:point.y,z:point.z};}
  setMode(mode){this.gizmo.setMode(mode);}
  setSnap(enabled){this.gizmo.setTranslationSnap(enabled ? .25 : null);this.gizmo.setRotationSnap(enabled ? Math.PI/12 : null);this.gizmo.setScaleSnap(enabled ? .1 : null);}
  setDisabled(value){this.disabled=value;this.gizmo.enabled=!value;}
  dispose(){
    this.gizmo.detach();this.proxy?.removeFromParent();this.gizmo.dispose();this.helper.removeFromParent();
    this.outline.removeFromParent();this.outline.geometry.dispose();this.outline.material.dispose();
    this.element.removeEventListener('pointerdown',this.down,true);this.element.removeEventListener('pointerup',this.up);
    this.viewer._isEditingLevel=false;
    this.viewer.controls.autoRotate=this.autoRotate;
    this.viewer.controls.enabled=this.viewer.navigationMode!=='fly';
  }
}
