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
  SceneLoader,
  PointerEventTypes,
  DynamicTexture,
  Quaternion
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
    private currentChessSet: 'set1' | 'set2' = 'set2'; // Default to Lewis set
    
    // Cache for loaded models (per set)
    private modelCache = new Map<'set1' | 'set2', AbstractMesh[]>();
    private libraryCache = new Map<'set1' | 'set2', Map<string, AbstractMesh>>();

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
  private currentMoveNotation: string = "";

  // Tutorial helpers
  private moveDotMeshes: Mesh[] = [];
  private arrowMeshes: Mesh[] = [];
  private clickCallback: ((sq: string) => void) | null = null;
  private matMoveDot!: StandardMaterial;
  private matArrow!: StandardMaterial;
  private matHighlight!: StandardMaterial;

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
    this.buildBoardLabels();
    this.buildSkybox();
    this.buildGroundPlane();

    // Load GLB models and log mesh names
    await this.loadPieceModels();

    this.engine.runRenderLoop(() => this.scene.render());
    window.addEventListener("resize", () => this.engine.resize());

    // Pointer pick for click-to-move (tutorial)
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERTAP) return;
      if (!this.clickCallback) return;
      const pick = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        (m) => m.name.startsWith("sq_")
      );
      if (pick?.hit && pick.pickedMesh) {
        const sq = pick.pickedMesh.name.replace("sq_", "");
        this.clickCallback(sq);
      }
    });
  }

  // ── Tutorial helpers ──────────────────────────────────────────────────────

  showMoveDots(squares: string[]): void {
    this.clearMoveDots();
    for (const sq of squares) {
      const pos = this.squareToWorld(sq as SquareKey);
      const dot = MeshBuilder.CreateSphere(`dot_${sq}`, { diameter: 0.32, segments: 8 }, this.scene);
      dot.position = pos.add(new Vector3(0, 0.22, 0));
      dot.material = this.matMoveDot;
      dot.parent = this.root;
      this.moveDotMeshes.push(dot);
    }
  }

  clearMoveDots(): void {
    this.moveDotMeshes.forEach(m => m.dispose());
    this.moveDotMeshes = [];
  }

  hidePiecesOnSquares(squares: string[]): void {
    for (const sq of squares) {
      const m = this.pieceMeshes.get(sq as SquareKey);
      if (m) {
        m.isVisible = false;
        m.getChildMeshes().forEach(c => { c.isVisible = false; });
      }
    }
  }

  highlightSquares(squares: string[], clear = true): void {
    if (clear) this.clearSquareHighlights();
    for (const sq of squares) {
      const m = this.squareMeshes.get(sq as SquareKey);
      if (m) m.material = this.matHighlight;
    }
  }

  drawArrow(from: string, to: string, color: "gold" | "green" | "red" = "gold"): void {
    const start = this.squareToWorld(from as SquareKey).add(new Vector3(0, 0.28, 0));
    const end   = this.squareToWorld(to   as SquareKey).add(new Vector3(0, 0.28, 0));
    const dir   = end.subtract(start);
    const len   = dir.length();
    const mid   = start.add(end).scale(0.5);

    const shaft = MeshBuilder.CreateCylinder(`arrow_shaft_${from}${to}`, {
      height: len * 0.78, diameter: 0.13, tessellation: 10
    }, this.scene);
    shaft.position = mid;
    const horizontal = new Vector3(dir.z, 0, -dir.x);
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), dir.normalize()))));
    const q = horizontal.length() > 0.001
      ? Quaternion.RotationAxis(horizontal.normalize(), angle)
      : Quaternion.Identity();
    shaft.rotationQuaternion = q;

    const head = MeshBuilder.CreateCylinder(`arrow_head_${from}${to}`, {
      height: len * 0.22, diameterTop: 0, diameterBottom: 0.3, tessellation: 10
    }, this.scene);
    head.position = end.subtract(dir.normalize().scale(len * 0.11));
    head.rotationQuaternion = q.clone();

    const mat = new StandardMaterial(`arrowMat_${from}${to}`, this.scene);
    if (color === "gold") {
      mat.diffuseColor = new Color3(0.95, 0.75, 0.10);
      mat.emissiveColor = new Color3(0.55, 0.38, 0.02);
    } else if (color === "green") {
      mat.diffuseColor = new Color3(0.2, 0.85, 0.35);
      mat.emissiveColor = new Color3(0.05, 0.45, 0.1);
    } else {
      mat.diffuseColor = new Color3(0.9, 0.2, 0.2);
      mat.emissiveColor = new Color3(0.5, 0.05, 0.05);
    }
    mat.alpha = 0.88;
    shaft.material = mat;
    head.material  = mat;
    shaft.parent = this.root;
    head.parent  = this.root;
    this.arrowMeshes.push(shaft, head);
  }

  clearArrows(): void {
    this.arrowMeshes.forEach(m => m.dispose());
    this.arrowMeshes = [];
  }

  enableClickToMove(callback: ((sq: string) => void) | null): void {
    this.clickCallback = callback;
  }

  async flashSquare(sq: string, result: "correct" | "wrong"): Promise<void> {
    const mesh = this.squareMeshes.get(sq as SquareKey);
    if (!mesh) return;
    const mat = new StandardMaterial(`flash_${sq}_${Date.now()}`, this.scene);
    mat.emissiveColor = result === "correct" ? new Color3(0.1, 0.9, 0.3) : new Color3(0.9, 0.15, 0.1);
    const old = mesh.material;
    mesh.material = mat;
    await sleep(600);
    mesh.material = old;
    mat.dispose();
  }

  dispose(): void {
    for (const models of this.modelCache.values()) {
      models.forEach(m => m.dispose());
    }
    this.modelCache.clear();
    this.libraryCache.clear();
    
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
    
    // Check if we have cached models for this set
    const cachedLibrary = this.libraryCache.get(setName);
    const cachedModels = this.modelCache.get(setName);
    
    if (cachedLibrary && cachedModels) {
      // Use cached models - create a new Map to avoid reference issues
      this.pieceLibrary = new Map(cachedLibrary);
      this.modelRoot = cachedModels;
      this.piecesReady = true;
    } else {
      // Clear and load new models
      this.pieceLibrary = new Map();
      this.modelRoot = [];
      await this.loadPieceModels();
    }
    
    // Reload current position with new models
    if (this.currentFen) {
      const tempFen = this.currentFen;
      this.currentFen = null;
      this.setPositionFromFen(tempFen);
    }
  }

  private async loadPieceModels(): Promise<void> {
    try {
      if (this.currentChessSet === 'set1') {
        // Set 1: Load from combined chess_set.glb file
        const result = await SceneLoader.ImportMeshAsync(
          null,
          "/models/set1/",
          "chess_set.glb",
          this.scene
        );

        this.modelRoot = result.meshes;
        
        // Log all mesh names to help find the correct ones
        console.log("Glass chess set meshes:", result.meshes.map(m => m.name));
        
        result.meshes.forEach(m => {
          m.setEnabled(false);
          // Reset transformations to ensure clean state
          m.position.setAll(0);
          m.rotationQuaternion = null;
          m.rotation.setAll(0);
          m.scaling.setAll(1);
        });

        const find = (name: string) => result.meshes.find(m => m.name === name);

        const whiteMap = {
          p: "Piece_01_White_player.001_0",
          n: "Piece_03_White_player.001_0",
          b: "Piece_04_White_player.001_0",
          r: "Piece_02_White_player.001_0",
          q: "Piece_05_White_player.001_0",
          k: "Piece_06_White_player.001_0",
        };
        const blackMap = {
          p: "Piece_01.008_Black_Player.001_0",
          n: "Piece_03.002_Black_Player.001_0",
          b: "Piece_04.002_Black_Player.001_0",
          r: "Piece_02.002_Black_Player.001_0",
          q: "Piece_05.001_Black_Player.001_0",
          k: "Piece_06.001_Black_Player.001_0",
        };

        for (const [t, name] of Object.entries(whiteMap)) {
          const mesh = find(name);
          if (mesh) this.pieceLibrary.set(`w_${t}`, mesh);
        }
        for (const [t, name] of Object.entries(blackMap)) {
          const mesh = find(name);
          if (mesh) this.pieceLibrary.set(`b_${t}`, mesh);
        }
      } else {
        // Set 2: Load individual GLB files for Lewis chess pieces
        console.log("Loading Lewis chess set (set2)...");
        const pieceFiles = {
          w_p: "Pawn_white.glb",
          w_n: "Knight_white.glb",
          w_b: "Bishop_white.glb",
          w_r: "Castle_white.glb",
          w_q: "Queen_white.glb",
          w_k: "King_white.glb",
          b_p: "Pawn_black.glb",
          b_n: "Knight_black.glb",
          b_b: "Bishop_black.glb",
          b_r: "Castle_black.glb",
          b_q: "Queen_black.glb",
          b_k: "King_black.glb",
        };

        // Load each piece file individually
        for (const [key, fileName] of Object.entries(pieceFiles)) {
          try {
            console.log(`Loading ${fileName}...`);
            const result = await SceneLoader.ImportMeshAsync(
              null,
              "/models/set2/",
              fileName,
              this.scene
            );

            this.modelRoot.push(...result.meshes);
            result.meshes.forEach(m => {
              m.setEnabled(false);
              // Reset transformations to ensure clean state
              m.position.setAll(0);
              m.rotationQuaternion = null;
              m.rotation.setAll(0);
              m.scaling.setAll(1);
            });

            // Find the main mesh (usually the first non-root mesh)
            const mainMesh = result.meshes.find(m => m.name !== "__root__") || result.meshes[0];
            if (mainMesh) {
              this.pieceLibrary.set(key, mainMesh);
              console.log(`✓ Loaded ${key} from ${fileName}`);
            } else {
              console.warn(`⚠ No mesh found in ${fileName}`);
            }
          } catch (error) {
            console.error(`Failed to load ${fileName}:`, error);
          }
        }
        console.log(`Set2 pieces loaded: ${this.pieceLibrary.size}/12`);
      }

      this.piecesReady = this.pieceLibrary.size >= 12;
      console.log(`Pieces ready: ${this.piecesReady} (${this.pieceLibrary.size} pieces in library)`);
      console.log(`Current FEN at load time: ${this.currentFen || '(none)'}`);
      
      // Cache the loaded models and library for this set
      if (this.piecesReady) {
        this.modelCache.set(this.currentChessSet, this.modelRoot);
        this.libraryCache.set(this.currentChessSet, this.pieceLibrary);
      }
      
      if (this.piecesReady && this.currentFen) {
        console.log(`Setting position from cached FEN: ${this.currentFen}`);
        const tempFen = this.currentFen;
        this.currentFen = null;
        this.setPositionFromFen(tempFen);
      } else if (this.piecesReady) {
        console.log(`No FEN to display yet - pieces will show when setPositionFromFen is called`);
      }
    } catch (error) {
      console.error("Failed to load GLB models:", error);
      this.piecesReady = false;
    }
  }

  getEngineKindLabel(): string {
    return this.engine instanceof WebGPUEngine ? "WebGPU" : "WebGL";
  }

  // Apply a full FEN position to the 3D board (instant sync)
  // Force variant: always rebuilds even if FEN hasn't changed (use in tutorial)
  forceSetPositionFromFen(fen: string): void {
    this.currentFen = null;
    this.setPositionFromFen(fen);
  }

  setPositionFromFen(fen: string): void {
    console.log(`setPositionFromFen called with: ${fen}`);
    console.log(`piecesReady: ${this.piecesReady}, pieceLibrary size: ${this.pieceLibrary.size}`);
    
    if (this.currentFen === fen) {
      console.log(`Skipping - FEN is the same as current`);
      return;
    }
    this.currentFen = fen;

    // Clear existing pieces
    console.log(`Clearing ${this.pieceMeshes.size} existing pieces`);
    for (const m of this.pieceMeshes.values()) {
      m.dispose();
    }
    this.pieceMeshes.clear();

    const chess = new Chess();
    try {
      chess.load(fen, { skipValidation: true });
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
        
        // Piece-specific y-offset adjustments (different for each set)
        const yOffsets: Record<string, number> = this.currentChessSet === 'set1' 
          ? {
              p: 0.05,  // pawn
              n: 0.61,  // knight - pivot is very low, needs much higher
              b: 0.10,  // bishop
              r: 0.05,  // rook
              q: 0.05,  // queen
              k: 0.15,  // king
            }
          : {
              p: 0.05,  // pawn
              n: 0.05,  // knight - Lewis pieces have proper pivot
              b: 0.10,  // bishop
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
    console.log(`Created ${this.pieceMeshes.size} pieces on the board`);
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

    this.matMoveDot = new StandardMaterial("moveDot", this.scene);
    this.matMoveDot.diffuseColor = new Color3(0.2, 0.9, 0.4);
    this.matMoveDot.emissiveColor = new Color3(0.1, 0.6, 0.2);
    this.matMoveDot.alpha = 0.82;

    this.matArrow = new StandardMaterial("arrow", this.scene);
    this.matArrow.diffuseColor = new Color3(0.95, 0.75, 0.15);
    this.matArrow.emissiveColor = new Color3(0.7, 0.5, 0.05);
    this.matArrow.alpha = 0.9;

    this.matHighlight = new StandardMaterial("highlight", this.scene);
    this.matHighlight.diffuseColor = new Color3(0.15, 0.15, 0.10);
    this.matHighlight.emissiveColor = new Color3(0.6, 0.55, 0.05);
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
    
    // Clone with children to get the full model
    // Important: Clone from the original cached mesh which should be untransformed
    const clone = (src as Mesh).clone(`${key}_clone_${Date.now()}`, null, true);
    
    if (!clone) {
      return this.createPrimitivePieceMesh(type, color);
    }
    
    // Reset any transformations that might have been in the source
    clone.position.setAll(0);
    clone.rotationQuaternion = null;
    clone.rotation.setAll(0);
    clone.scaling.setAll(1);
    
    // ---- TWEAKS (likely needed for your model) ----
    // 1) scale to fit a square
    const scale = this.currentChessSet === 'set1' ? 4.0 : 16.0;
    clone.scaling.setAll(scale);

    // 2) orientation - different rotation for each set
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
    
    // Set parent after all transformations
    clone.parent = this.pieceRoot;

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

  private buildSkybox(): void {
    const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000 }, this.scene);
    const skyboxMaterial = new StandardMaterial("skyBoxMaterial", this.scene);
    skyboxMaterial.backFaceCulling = false;
    
    // Create a gradient-like effect with emissive color
    skyboxMaterial.diffuseColor = new Color3(0.02, 0.04, 0.08);
    skyboxMaterial.specularColor = new Color3(0, 0, 0);
    skyboxMaterial.emissiveColor = new Color3(0.03, 0.05, 0.12); // Deep blue-ish
    
    skybox.material = skyboxMaterial;
    skybox.infiniteDistance = true;
  }

  private buildBoardLabels(): void {
    const size = 1.1;
    const start = -3.85;
    const edgeOffset = 0.72;

    // Files a-h along the front edge (low z)
    for (let f = 0; f < 8; f++) {
      const letter = FILES[f].toUpperCase();
      const x = start + f * size;
      this.createBoardLabel(letter, x, 0.06, start - edgeOffset);
    }
    // Ranks 1-8 along the left edge (low x)
    for (let r = 0; r < 8; r++) {
      const number = RANKS[r];
      const z = start + r * size;
      this.createBoardLabel(number, start - edgeOffset, 0.06, z);
    }
  }

  private createBoardLabel(text: string, x: number, y: number, z: number): void {
    const plane = MeshBuilder.CreatePlane(`lbl_${text}_${x}${z}`, { size: 0.55 }, this.scene);
    plane.position = new Vector3(x, y, z);
    plane.rotation.x = Math.PI / 2; // lay flat on the board
    plane.parent = this.root;

    const tex = new DynamicTexture(`ltex_${text}_${x}${z}`, { width: 64, height: 64 }, this.scene, false);
    tex.drawText(text, null, null, "bold 44px Arial", "#cccccc", "transparent", true);

    const mat = new StandardMaterial(`lmat_${text}_${x}${z}`, this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveTexture = tex;
    mat.backFaceCulling = false;
    plane.material = mat;
  }

  private buildGroundPlane(): void {
    const ground = MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, this.scene);
    ground.position.y = -0.7;
    
    const groundMaterial = new StandardMaterial("groundMaterial", this.scene);
    groundMaterial.diffuseColor = new Color3(0.05, 0.06, 0.08);
    groundMaterial.specularColor = new Color3(0.4, 0.4, 0.4);
    groundMaterial.specularPower = 64;
    
    // Simple dark reflective surface without MirrorTexture
    groundMaterial.alpha = 1.0;
    
    ground.material = groundMaterial;
  }

  getCurrentMoveNotation(): string {
    return this.currentMoveNotation;
  }

  setCurrentMoveNotation(notation: string): void {
    this.currentMoveNotation = notation;
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
