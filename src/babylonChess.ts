import {
  Engine,
  WebGPUEngine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  Color3,
  Color4,
  StandardMaterial,
  GlowLayer,
  TransformNode,
  Mesh,
  Animation,
  EasingFunction,
  CubicEase,
  SceneLoader
} from "@babylonjs/core";
import { Chess } from "chess.js";
import type { AbstractMesh } from "@babylonjs/core";

type SquareKey = string; // "a1" .. "h8"

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];

function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).gpu;
}

export class BabylonChessView {
    private pieceLibrary = new Map<string, AbstractMesh>(); // key: "w_p", "b_k", etc
    private piecesReady = false;
    private modelRoot: AbstractMesh[] = [];
    private currentChessSet: 'set1' | 'set2' = 'set1'; // Default to first set

  private canvas: HTMLCanvasElement;
  private engine!: Engine | WebGPUEngine;
  private scene!: Scene;
  private glow!: GlowLayer;

  private root!: TransformNode;
  private squareMeshes = new Map<SquareKey, Mesh>();
  private pieceMeshes = new Map<SquareKey, Mesh>(); // keyed by square
  private pieceRoot!: TransformNode;

  private matDark!: StandardMaterial;
  private matLight!: StandardMaterial;
  private matPieceW!: StandardMaterial;
  private matPieceB!: StandardMaterial;

  private matGlowFrom!: StandardMaterial;
  private matGlowTo!: StandardMaterial;

  private currentFen: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init(): Promise<void> {
    // Engine: WebGPU first, fallback to WebGL Engine
    if (isWebGPUAvailable()) {
      try {
        const wgpu = new WebGPUEngine(this.canvas, { adaptToDeviceRatio: true });
        await wgpu.initAsync();
        this.engine = wgpu;
      } catch (error) {
        console.warn("WebGPU initialization failed, falling back to WebGL:", error);
        this.engine = new Engine(this.canvas, true, { adaptToDeviceRatio: true });
      }
    } else {
      this.engine = new Engine(this.canvas, true, { adaptToDeviceRatio: true });
    }

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.04, 0.06, 0.08, 1);

    const camera = new ArcRotateCamera(
      "cam",
      Math.PI / 4,
      Math.PI / 3.2,
      18,
      new Vector3(0, 0, 0),
      this.scene
    );
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 26;
    camera.lowerBetaLimit = 0.9;
    camera.upperBetaLimit = 1.4;
    camera.attachControl(this.canvas, true);

    new HemisphericLight("h", new Vector3(0, 1, 0), this.scene).intensity = 0.35;
    const dir = new DirectionalLight("d", new Vector3(-1, -2, -1), this.scene);
    dir.intensity = 1.0;

    this.glow = new GlowLayer("glow", this.scene);
    this.glow.intensity = 0.8;

    this.root = new TransformNode("root", this.scene);
    this.pieceRoot = new TransformNode("pieces", this.scene);
    this.pieceRoot.parent = this.root;

    this.buildMaterials();
    this.buildBoard();

    // Load GLB models and log mesh names
    await this.loadPieceModels();

    this.engine.runRenderLoop(() => this.scene.render());
    window.addEventListener("resize", () => this.engine.resize());
  }

  dispose(): void {
    this.scene?.dispose();
    this.engine?.dispose();
  }

  async switchChessSet(setName: 'set1' | 'set2'): Promise<void> {
    this.currentChessSet = setName;
    
    // Clear existing pieces from the board
    for (const m of this.pieceMeshes.values()) {
      m.dispose();
    }
    this.pieceMeshes.clear();
    
    // Clear old model library
    this.pieceLibrary.clear();
    this.piecesReady = false;
    
    // Dispose old model roots
    this.modelRoot.forEach(m => m.dispose());
    this.modelRoot = [];
    
    // Load new models
    await this.loadPieceModels();
    
    // Reload current position with new models
    if (this.currentFen) {
      const tempFen = this.currentFen;
      this.currentFen = null;
      this.setPositionFromFen(tempFen);
    }
  }

  private async loadPieceModels(): Promise<void> {
    try {
      const fileName = this.currentChessSet === 'set1' 
        ? 'chess_set.glb' 
        : 'replica_lewis_chess_pieces_on_chessboard.glb';
      
      const result = await SceneLoader.ImportMeshAsync(
        null,
        "/models/",
        fileName,
        this.scene
      );

      // Save for disposal / debugging
      this.modelRoot = result.meshes;

      // Disable originals (we clone from them)
      result.meshes.forEach(m => m.setEnabled(false));

      // Helper to find by exact name match
      const find = (name: string) =>
        result.meshes.find(m => m.name === name);

      // Map chess.js piece types -> mesh names (different for each set)
      let whiteMap: Record<string, string>;
      let blackMap: Record<string, string>;
      
      if (this.currentChessSet === 'set1') {
        whiteMap = {
          p: "Piece_01_White_player.001_0",
          n: "Piece_03_White_player.001_0",
          b: "Piece_04_White_player.001_0",
          r: "Piece_02_White_player.001_0",
          q: "Piece_05_White_player.001_0",
          k: "Piece_06_White_player.001_0",
        };
        blackMap = {
          p: "Piece_01.008_Black_Player.001_0",
          n: "Piece_03.002_Black_Player.001_0",
          b: "Piece_04.002_Black_Player.001_0",
          r: "Piece_02.002_Black_Player.001_0",
          q: "Piece_05.001_Black_Player.001_0",
          k: "Piece_06.001_Black_Player.001_0",
        };
      } else {
        // Set 2 - Lewis chess pieces (generic object names)
        whiteMap = {
          p: "Object_12",  // white pawn (was Object_4)
          n: "Object_4",   // white knight (was Object_12)
          b: "Object_8",   // white bishop
          r: "Object_10",  // white rook
          q: "Object_6",   // white queen
          k: "Object_14",  // white king
        };
        blackMap = {
          p: "Object_12",  // black pawn (was Object_39)
          n: "Object_39",  // black knight (was Object_47)
          b: "Object_43",  // black bishop
          r: "Object_45",  // black rook
          q: "Object_41",  // black queen
          k: "Object_49",  // black king
        };
      }

      // Fill library: w_p, w_n, ... b_k
      for (const [t, name] of Object.entries(whiteMap)) {
        const mesh = find(name);
        if (mesh) this.pieceLibrary.set(`w_${t}`, mesh);
      }

      for (const [t, name] of Object.entries(blackMap)) {
        const mesh = find(name);
        if (mesh) this.pieceLibrary.set(`b_${t}`, mesh);
      }

      this.piecesReady = this.pieceLibrary.size >= 12;
      if (this.piecesReady && this.currentFen) {
        const tempFen = this.currentFen;
        this.currentFen = null;
        this.setPositionFromFen(tempFen);
      }
    } catch (error) {
      console.error("Failed to load GLB models, using primitives:", error);
      this.piecesReady = false;
    }
  }

  getEngineKindLabel(): string {
    return this.engine instanceof WebGPUEngine ? "WebGPU" : "WebGL";
  }

  // Apply a full FEN position to the 3D board (instant sync)
  setPositionFromFen(fen: string): void {
    if (this.currentFen === fen) return;
    this.currentFen = fen;

    // Clear existing pieces
    for (const m of this.pieceMeshes.values()) {
      m.dispose();
    }
    this.pieceMeshes.clear();

    const chess = new Chess();
    try {
      chess.load(fen);
    } catch {
      return;
    }

    const board = chess.board(); // 8x8 from rank 8 to 1

    // board[0] = rank 8
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f];
        if (!piece) continue;

        const file = FILES[f];
        const rank = String(8 - r);
        const sq = `${file}${rank}` as SquareKey;

        const mesh = this.createPieceMesh(piece.type, piece.color);
        
        // Piece-specific y-offset adjustments
        const yOffsets: Record<string, number> = {
          p: 0.05,  // pawn
          n: 0.61,   // knight - pivot is very low, needs much higher
          b: 0.10, // bishop - lower to board level
          r: 0.05,  // rook
          q: 0.05,  // queen
          k: 0.15,  // king
        };
        const yOffset = yOffsets[piece.type] || 0.05;
        
        mesh.position = this.squareToWorld(sq).add(new Vector3(0, yOffset, 0));
        mesh.parent = this.pieceRoot;
        this.pieceMeshes.set(sq, mesh);
      }
    }
  }

  // Animate a single move meta: glow from/to, move piece mesh if present, otherwise just resync after.
  async animateMove(from: string, to: string): Promise<void> {
    this.clearSquareHighlights();
    this.highlightSquare(from, "from");
    this.highlightSquare(to, "to");

    // Try animate the specific piece mesh if we have it.
    const moving = this.pieceMeshes.get(from as SquareKey);
    if (!moving) {
      // If we can't find it (castling edge cases due to instant rebuild), just wait a beat.
      await sleep(120);
      return;
    }

    const start = moving.position.clone();
    const end = this.squareToWorld(to as SquareKey);

    // Arc
    const mid = start.add(end).scale(0.5);
    mid.y += 1.0;

    await this.animateAlongQuadraticBezier(moving, start, mid, end, 260);

    // Update piece mapping: remove captured on 'to' if exists
    const captured = this.pieceMeshes.get(to as SquareKey);
    if (captured && captured !== moving) {
      // tiny fade-out effect: scale down quickly
      await this.animateScaleDownAndDispose(captured, 120);
      this.pieceMeshes.delete(to as SquareKey);
    }

    this.pieceMeshes.delete(from as SquareKey);
    this.pieceMeshes.set(to as SquareKey, moving);

    // Keep highlights briefly
    await sleep(120);
  }

  clearSquareHighlights(): void {
    for (const [sq, mesh] of this.squareMeshes.entries()) {
      const isLight = isLightSquare(sq);
      mesh.material = isLight ? this.matLight : this.matDark;
    }
  }

  private buildMaterials(): void {
    // Board materials
    this.matDark = new StandardMaterial("dark", this.scene);
    this.matDark.diffuseColor = new Color3(0.10, 0.12, 0.14);
    this.matDark.specularColor = new Color3(0.25, 0.25, 0.25);

    this.matLight = new StandardMaterial("light", this.scene);
    this.matLight.diffuseColor = new Color3(0.20, 0.22, 0.25);
    this.matLight.specularColor = new Color3(0.35, 0.35, 0.35);

    // Pieces
    this.matPieceW = new StandardMaterial("pw", this.scene);
    this.matPieceW.diffuseColor = new Color3(0.85, 0.86, 0.90);
    this.matPieceW.specularColor = new Color3(0.6, 0.6, 0.6);

    this.matPieceB = new StandardMaterial("pb", this.scene);
    this.matPieceB.diffuseColor = new Color3(0.12, 0.13, 0.16);
    this.matPieceB.specularColor = new Color3(0.5, 0.5, 0.5);

    // Glow highlight mats (emissive drives bloom)
    this.matGlowFrom = new StandardMaterial("glowFrom", this.scene);
    this.matGlowFrom.diffuseColor = new Color3(0.10, 0.12, 0.14);
    this.matGlowFrom.emissiveColor = new Color3(0.10, 0.55, 0.95); // blue-ish glow

    this.matGlowTo = new StandardMaterial("glowTo", this.scene);
    this.matGlowTo.diffuseColor = new Color3(0.10, 0.12, 0.14);
    this.matGlowTo.emissiveColor = new Color3(0.95, 0.70, 0.15); // gold-ish glow
  }

  private buildBoard(): void {
    // Base
    const base = MeshBuilder.CreateBox("base", { width: 10, depth: 10, height: 0.6 }, this.scene);
    base.position.y = -0.35;
    const baseMat = new StandardMaterial("baseMat", this.scene);
    baseMat.diffuseColor = new Color3(0.06, 0.07, 0.09);
    baseMat.specularColor = new Color3(0.2, 0.2, 0.2);
    base.material = baseMat;
    base.parent = this.root;

    // Squares
    const size = 1.1;
    const start = -3.85;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const file = FILES[f];
        const rank = RANKS[r];
        const sq = `${file}${rank}` as SquareKey;

        const tile = MeshBuilder.CreateBox(`sq_${sq}`, { width: size, depth: size, height: 0.16 }, this.scene);
        tile.position.x = start + f * size;
        tile.position.z = start + r * size;
        tile.position.y = -0.02;

        const isLight = (f + r) % 2 === 0;
        tile.material = isLight ? this.matLight : this.matDark;
        tile.parent = this.root;

        this.squareMeshes.set(sq, tile);
      }
    }
  }

  private highlightSquare(sq: string, kind: "from" | "to"): void {
    const m = this.squareMeshes.get(sq as SquareKey);
    if (!m) return;
    m.material = kind === "from" ? this.matGlowFrom : this.matGlowTo;
  }

  private squareToWorld(sq: SquareKey): Vector3 {
    // "a1" should map to bottom-left in our board arrangement.
    // Our squares are built ranks 1..8 increasing in +z, files a..h increasing in +x.
    const size = 1.1;
    const start = -3.85;

    const file = sq[0];
    const rank = sq[1];

    const fIdx = FILES.indexOf(file);
    const rIdx = RANKS.indexOf(rank);

    return new Vector3(start + fIdx * size, 0, start + rIdx * size);
  }

  private createPieceMesh(type: string, color: "w" | "b"): Mesh {
    if (!this.piecesReady) {
      return this.createPrimitivePieceMesh(type, color);
    }

    const key = `${color}_${type}`;
    const src = this.pieceLibrary.get(key);

    if (!src) {
      return this.createPrimitivePieceMesh(type, color);
    }
    
    // Log Lewis set piece mappings
    if (this.currentChessSet === 'set2') {
      const pieceNames: Record<string, string> = {
        p: 'Pawn', n: 'Knight', b: 'Bishop', 
        r: 'Rook', q: 'Queen', k: 'King'
      };
      const colorName = color === 'w' ? 'White' : 'Black';
      console.log(`${colorName} ${pieceNames[type]}: ${src.name}`);
    }
    
    // Clone with children to get the full model
    const clone = src.clone(`${key}_clone`, this.pieceRoot, true);
    
    if (!clone) {
      return this.createPrimitivePieceMesh(type, color);
    }
    
    // ---- TWEAKS (likely needed for your model) ----
    // 1) scale to fit a square
    const scale = this.currentChessSet === 'set1' ? 4.0 : 16.0;
    clone.scaling.setAll(scale);

    // 2) orientation - different rotation for each set
    clone.rotationQuaternion = null;
    if (this.currentChessSet === 'set1') {
      clone.rotation.x = -Math.PI / 2;
      clone.rotation.y = 0;
      clone.rotation.z = 0;
    } else {
      // Lewis set - pieces stand upright, rotate black pieces to face white
      clone.rotation.x = 0;
      clone.rotation.y = color === 'b' ? Math.PI : 0; // Rotate black 180 degrees
      clone.rotation.z = 0;
    }
    
    // 3) Enable and make visible BEFORE applying material
    clone.setEnabled(true);
    clone.isVisible = true;
    
    // Apply color material to the mesh itself and any children
    const material = color === "w" ? this.matPieceW : this.matPieceB;
    const childMeshes = clone.getChildMeshes();
    
    // Apply material to the cloned mesh itself (this is the actual geometry)
    if (clone instanceof Mesh) {
      clone.material = material;
    }
    
    // Also apply to any children if they exist
    childMeshes.forEach(child => {
      if (child instanceof Mesh) {
        child.setEnabled(true);
        child.isVisible = true;
        child.material = material;
      }
    });

    return clone as Mesh;
  }

  private createPrimitivePieceMesh(type: string, color: "w" | "b"): Mesh {
    // Simple stylized primitives per piece type
    let mesh: Mesh;

    switch (type) {
      case "p":
        mesh = MeshBuilder.CreateCylinder("p", { height: 0.95, diameterTop: 0.55, diameterBottom: 0.65, tessellation: 24 }, this.scene);
        break;
      case "n":
        mesh = MeshBuilder.CreateBox("n", { size: 0.85 }, this.scene);
        break;
      case "b":
        mesh = MeshBuilder.CreateCylinder("b", { height: 1.2, diameterTop: 0.55, diameterBottom: 0.75, tessellation: 24 }, this.scene);
        break;
      case "r":
        mesh = MeshBuilder.CreateBox("r", { width: 0.85, depth: 0.85, height: 1.1 }, this.scene);
        break;
      case "q":
        mesh = MeshBuilder.CreateCylinder("q", { height: 1.45, diameterTop: 0.7, diameterBottom: 0.9, tessellation: 24 }, this.scene);
        break;
      case "k":
        mesh = MeshBuilder.CreateCylinder("k", { height: 1.55, diameterTop: 0.75, diameterBottom: 0.95, tessellation: 24 }, this.scene);
        break;
      default:
        mesh = MeshBuilder.CreateSphere("x", { diameter: 0.8 }, this.scene);
    }

    mesh.material = color === "w" ? this.matPieceW : this.matPieceB;
    return mesh;
  }

  private async animateAlongQuadraticBezier(mesh: Mesh, p0: Vector3, p1: Vector3, p2: Vector3, ms: number): Promise<void> {
    const frames = 60;
    const anim = new Animation("moveAnim", "position", frames, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);

    const keys = [];
    for (let i = 0; i <= frames; i++) {
      const t = i / frames;
      const pos = quadraticBezier(p0, p1, p2, t);
      keys.push({ frame: i, value: pos });
    }
    anim.setKeys(keys);

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    anim.setEasingFunction(ease);

    mesh.animations = [anim];
    await beginAnimationAsync(this.scene, mesh, 0, frames, ms);
  }

  private async animateScaleDownAndDispose(mesh: Mesh, ms: number): Promise<void> {
    const frames = 30;
    const anim = new Animation("scaleDown", "scaling", frames, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);

    anim.setKeys([
      { frame: 0, value: mesh.scaling.clone() },
      { frame: frames, value: new Vector3(0.01, 0.01, 0.01) }
    ]);

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    anim.setEasingFunction(ease);

    mesh.animations = [anim];
    await beginAnimationAsync(this.scene, mesh, 0, frames, ms);
    mesh.dispose();
  }
}

function isLightSquare(sq: SquareKey): boolean {
  const f = FILES.indexOf(sq[0]);
  const r = RANKS.indexOf(sq[1]);
  return (f + r) % 2 === 0;
}

function quadraticBezier(p0: Vector3, p1: Vector3, p2: Vector3, t: number): Vector3 {
  const u = 1 - t;
  const a = p0.scale(u * u);
  const b = p1.scale(2 * u * t);
  const c = p2.scale(t * t);
  return a.add(b).add(c);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function beginAnimationAsync(scene: Scene, target: any, from: number, to: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const ratio = ms / 1000;
    const anim = scene.beginAnimation(target, from, to, false, 1 / ratio);
    anim.onAnimationEndObservable.addOnce(() => resolve());
  });
}
