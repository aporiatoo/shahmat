import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Chess } from 'chess.js';

// ==================== CONFIG ====================
const BOARD_SIZE = 8;
const SQUARE_SIZE = 1.1;
const PIECE_HEIGHT = 1.6;
const BOARD_HEIGHT = 0.3;
const PIECE_SCALE = 0.85;

// Colors
const COLORS = {
    boardLight: 0xe8d5b7,
    boardDark: 0x5c4633,
    boardEdge: 0x3c2e22,
    whitePiece: 0xf0e6d2,
    blackPiece: 0x2a2520,
    highlight: 0xc5a26f,
    moveHighlight: 0x6aa34a,
    captureHighlight: 0xc94c4c,
    selected: 0xffd54f
};

// ==================== GLOBAL STATE ====================
let scene, camera, renderer;
let controls;
let chess;
let pieces = {}; // key: square (e.g. 'e2') => { mesh, type, color }
let selectedPiece = null;
let validMoves = [];
let boardGroup;
let raycaster, mouse;
let isFlipped = false;
let isAnimating = false;
let promotionPending = null;

// UI Elements
let moveHistoryEl, capturedWhiteEl, capturedBlackEl, statusTextEl;
let turnIndicatorEl, whiteStatusEl, blackStatusEl;

// ==================== PIECE GEOMETRY GENERATORS ====================
// Highly detailed 3D chess pieces

function createPawn(color) {
    const group = new THREE.Group();
    const isWhite = color === 'w';
    const mat = createPieceMaterial(isWhite);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.48, 0.32, 32),
        mat
    );
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.42, 0.7, 32),
        mat
    );
    body.position.y = 0.52;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Neck
    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.32, 0.25, 28),
        mat
    );
    neck.position.y = 1.0;
    neck.castShadow = true;
    neck.receiveShadow = true;
    group.add(neck);
    
    // Head sphere
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 32, 28),
        mat
    );
    head.position.y = 1.35;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);
    
    // Top small ball
    const topBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 24, 20),
        mat
    );
    topBall.position.y = 1.65;
    topBall.castShadow = true;
    topBall.receiveShadow = true;
    group.add(topBall);
    
    // Decorative ring
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.33, 0.06, 12, 32),
        mat
    );
    ring.position.y = 0.92;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    
    group.userData = { type: 'p', color };
    return group;
}

function createRook(color) {
    const group = new THREE.Group();
    const isWhite = color === 'w';
    const mat = createPieceMaterial(isWhite);
    const darkMat = createPieceMaterial(isWhite, true); // darker for detail
    
    // Base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.52, 0.35, 32),
        mat
    );
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    
    // Main body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.42, 1.1, 32),
        mat
    );
    body.position.y = 0.75;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Top platform
    const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.46, 0.18, 32),
        mat
    );
    top.position.y = 1.4;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);
    
    // Battlements (4 crenellations)
    const battHeight = 0.38;
    const battWidth = 0.18;
    const positions = [0, 90, 180, 270];
    
    positions.forEach((deg, i) => {
        const batt = new THREE.Mesh(
            new THREE.BoxGeometry(battWidth, battHeight, 0.14),
            mat
        );
        const rad = (deg * Math.PI) / 180;
        batt.position.x = Math.cos(rad) * 0.38;
        batt.position.z = Math.sin(rad) * 0.38;
        batt.position.y = 1.58;
        batt.rotation.y = rad;
        batt.castShadow = true;
        batt.receiveShadow = true;
        group.add(batt);
        
        // Inner battlement
        const inner = new THREE.Mesh(
            new THREE.BoxGeometry(battWidth * 0.7, battHeight * 0.55, 0.12),
            darkMat
        );
        inner.position.x = Math.cos(rad) * 0.22;
        inner.position.z = Math.sin(rad) * 0.22;
        inner.position.y = 1.58;
        inner.rotation.y = rad;
        group.add(inner);
    });
    
    // Decorative groove
    const groove = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.43, 0.08, 32),
        darkMat
    );
    groove.position.y = 1.05;
    group.add(groove);
    
    group.userData = { type: 'r', color };
    return group;
}

function createKnight(color) {
    const group = new THREE.Group();
    const isWhite = color === 'w';
    const mat = createPieceMaterial(isWhite);
    const accentMat = createPieceMaterial(isWhite, true);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.46, 0.32, 28),
        mat
    );
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    
    // Body (angled)
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.38, 0.95, 24),
        mat
    );
    body.position.set(0.08, 0.65, 0);
    body.rotation.z = -0.35;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Head (horse head)
    const head = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.28, 0.75, 22),
        mat
    );
    head.position.set(0.4, 1.25, 0);
    head.rotation.z = 0.95;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);
    
    // Nose
    const nose = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.18, 0.4, 18),
        mat
    );
    nose.position.set(0.65, 1.55, 0);
    nose.rotation.z = 1.05;
    nose.castShadow = true;
    nose.receiveShadow = true;
    group.add(nose);
    
    // Ears
    const ear1 = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.35, 6),
        mat
    );
    ear1.position.set(0.3, 1.6, 0.14);
    ear1.rotation.set(0.2, 0.3, 1.8);
    group.add(ear1);
    
    const ear2 = ear1.clone();
    ear2.position.z = -0.14;
    ear2.rotation.y = -0.3;
    group.add(ear2);
    
    // Mane
    const mane = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.18, 0.55, 8),
        accentMat
    );
    mane.position.set(0.28, 1.35, 0);
    mane.rotation.z = 1.1;
    group.add(mane);
    
    // Eye detail
    const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 6),
        new THREE.MeshPhongMaterial({ color: 0x222222 })
    );
    eye.position.set(0.55, 1.52, 0.13);
    group.add(eye);
    
    const eye2 = eye.clone();
    eye2.position.z = -0.13;
    group.add(eye2);
    
    group.userData = { type: 'n', color };
    return group;
}

function createBishop(color) {
    const group = new THREE.Group();
    const isWhite = color === 'w';
    const mat = createPieceMaterial(isWhite);
    const accent = createPieceMaterial(isWhite, true);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.5, 0.32, 32),
        mat
    );
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.36, 1.15, 32),
        mat
    );
    body.position.y = 0.8;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Tapered neck
    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, 0.45, 28),
        mat
    );
    neck.position.y = 1.45;
    neck.castShadow = true;
    neck.receiveShadow = true;
    group.add(neck);
    
    // Head sphere
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 32, 26),
        mat
    );
    head.position.y = 1.9;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);
    
    // Mitre / top detail
    const mitre = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.55, 28),
        accent
    );
    mitre.position.y = 2.2;
    mitre.castShadow = true;
    mitre.receiveShadow = true;
    group.add(mitre);
    
    // Cross / slit in bishop hat
    const slit1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.42, 0.52),
        accent
    );
    slit1.position.y = 2.35;
    group.add(slit1);
    
    const slit2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.05, 0.05),
        accent
    );
    slit2.position.y = 2.35;
    group.add(slit2);
    
    // Decorative rings
    const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.35, 0.05, 10, 32),
        accent
    );
    ring1.position.y = 0.68;
    ring1.rotation.x = Math.PI / 2;
    group.add(ring1);
    
    const ring2 = ring1.clone();
    ring2.position.y = 1.25;
    group.add(ring2);
    
    group.userData = { type: 'b', color };
    return group;
}

function createQueen(color) {
    const group = new THREE.Group();
    const isWhite = color === 'w';
    const mat = createPieceMaterial(isWhite);
    const accent = createPieceMaterial(isWhite, true);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.54, 0.36, 32),
        mat
    );
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.42, 1.25, 32),
        mat
    );
    body.position.y = 0.85;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Top crown base
    const crownBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.46, 0.2, 32),
        mat
    );
    crownBase.position.y = 1.55;
    crownBase.castShadow = true;
    crownBase.receiveShadow = true;
    group.add(crownBase);
    
    // Crown points (8 spikes)
    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        const spike = new THREE.Mesh(
            new THREE.ConeGeometry(0.1, 0.58, 6),
            accent
        );
        spike.position.x = Math.cos(angle) * 0.38;
        spike.position.z = Math.sin(angle) * 0.38;
        spike.position.y = 1.75;
        spike.rotation.z = -angle + Math.PI;
        spike.castShadow = true;
        spike.receiveShadow = true;
        group.add(spike);
        
        // Small ball on top of spikes
        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 10, 8),
            mat
        );
        ball.position.x = Math.cos(angle) * 0.38;
        ball.position.z = Math.sin(angle) * 0.38;
        ball.position.y = 2.08;
        group.add(ball);
    }
    
    // Center dome
    const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 26, 22),
        mat
    );
    dome.position.y = 1.95;
    group.add(dome);
    
    // Small sphere on crown center
    const topSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 16, 14),
        accent
    );
    topSphere.position.y = 2.25;
    group.add(topSphere);
    
    // Decorative bands
    const band1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.08, 32),
        accent
    );
    band1.position.y = 0.7;
    group.add(band1);
    
    const band2 = band1.clone();
    band2.position.y = 1.28;
    group.add(band2);
    
    group.userData = { type: 'q', color };
    return group;
}

function createKing(color) {
    const group = new THREE.Group();
    const isWhite = color === 'w';
    const mat = createPieceMaterial(isWhite);
    const accent = createPieceMaterial(isWhite, true);
    
    // Base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.43, 0.53, 0.34, 32),
        mat
    );
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    
    // Body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.43, 1.2, 32),
        mat
    );
    body.position.y = 0.82;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    
    // Neck
    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.35, 0.32, 24),
        mat
    );
    neck.position.y = 1.55;
    neck.castShadow = true;
    neck.receiveShadow = true;
    group.add(neck);
    
    // Head
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 32, 26),
        mat
    );
    head.position.y = 1.95;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);
    
    // Crown
    const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.18, 32),
        accent
    );
    crown.position.y = 2.3;
    crown.castShadow = true;
    crown.receiveShadow = true;
    group.add(crown);
    
    // Cross on top
    const crossVertical = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.55, 0.09),
        accent
    );
    crossVertical.position.y = 2.65;
    group.add(crossVertical);
    
    const crossHorizontal = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.09, 0.09),
        accent
    );
    crossHorizontal.position.y = 2.55;
    group.add(crossHorizontal);
    
    // Decorative band
    const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.44, 0.07, 32),
        accent
    );
    band.position.y = 0.66;
    group.add(band);
    
    // Additional decorative
    const smallSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 10),
        accent
    );
    smallSphere.position.y = 2.48;
    group.add(smallSphere);
    
    group.userData = { type: 'k', color };
    return group;
}

// Material creator with high quality
function createPieceMaterial(isWhite, isAccent = false) {
    const color = isWhite ? COLORS.whitePiece : COLORS.blackPiece;
    
    let materialColor = color;
    if (isAccent) {
        materialColor = isWhite ? 0xc9b48a : 0x1c1917;
    }
    
    return new THREE.MeshPhongMaterial({
        color: materialColor,
        shininess: isWhite ? 42 : 28,
        specular: isWhite ? 0x999999 : 0x222222,
        flatShading: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });
}

// ==================== BOARD CREATION ====================
function createChessboard() {
    const board = new THREE.Group();
    
    // Main board base
    const base = new THREE.Mesh(
        new THREE.BoxGeometry(
            BOARD_SIZE * SQUARE_SIZE + 0.9, 
            BOARD_HEIGHT, 
            BOARD_SIZE * SQUARE_SIZE + 0.9
        ),
        new THREE.MeshPhongMaterial({
            color: COLORS.boardEdge,
            shininess: 15,
            specular: 0x222222
        })
    );
    base.position.y = BOARD_HEIGHT / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    board.add(base);
    
    // Squares
    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const isLight = (row + col) % 2 === 0;
            const color = isLight ? COLORS.boardLight : COLORS.boardDark;
            
            const square = new THREE.Mesh(
                new THREE.BoxGeometry(SQUARE_SIZE, 0.1, SQUARE_SIZE),
                new THREE.MeshPhongMaterial({
                    color: color,
                    shininess: 22,
                    specular: isLight ? 0x555555 : 0x222222
                })
            );
            
            const x = (col - 3.5) * SQUARE_SIZE;
            const z = (row - 3.5) * SQUARE_SIZE;
            
            square.position.set(x, BOARD_HEIGHT + 0.05, z);
            square.userData = { row, col, square: getSquareName(row, col) };
            square.castShadow = true;
            square.receiveShadow = true;
            
            board.add(square);
            
            // Add subtle bevel / edge highlight for realism
            if (!isLight) {
                const bevel = new THREE.Mesh(
                    new THREE.BoxGeometry(SQUARE_SIZE * 1.01, 0.02, SQUARE_SIZE * 1.01),
                    new THREE.MeshPhongMaterial({
                        color: 0x2f241b,
                        shininess: 5
                    })
                );
                bevel.position.set(x, BOARD_HEIGHT + 0.13, z);
                board.add(bevel);
            }
        }
    }
    
    // Board borders / frame
    const frameThickness = 0.55;
    const frameMat = new THREE.MeshPhongMaterial({
        color: COLORS.boardEdge,
        shininess: 18
    });
    
    // Horizontal borders
    const topBorder = new THREE.Mesh(
        new THREE.BoxGeometry(BOARD_SIZE * SQUARE_SIZE + frameThickness * 2, 0.22, frameThickness),
        frameMat
    );
    topBorder.position.set(0, BOARD_HEIGHT + 0.1, -4.4);
    topBorder.castShadow = true;
    topBorder.receiveShadow = true;
    board.add(topBorder);
    
    const bottomBorder = topBorder.clone();
    bottomBorder.position.z = 4.4;
    board.add(bottomBorder);
    
    // Vertical borders
    const leftBorder = new THREE.Mesh(
        new THREE.BoxGeometry(frameThickness, 0.22, BOARD_SIZE * SQUARE_SIZE + frameThickness * 2),
        frameMat
    );
    leftBorder.position.set(-4.4, BOARD_HEIGHT + 0.1, 0);
    leftBorder.castShadow = true;
    leftBorder.receiveShadow = true;
    board.add(leftBorder);
    
    const rightBorder = leftBorder.clone();
    rightBorder.position.x = 4.4;
    board.add(rightBorder);
    
    // Add elegant gold trim lines
    const trimMat = new THREE.MeshPhongMaterial({ color: 0x8c7250, shininess: 40 });
    
    const trimTop = new THREE.Mesh(
        new THREE.BoxGeometry(BOARD_SIZE * SQUARE_SIZE + 0.9, 0.04, 0.06),
        trimMat
    );
    trimTop.position.set(0, BOARD_HEIGHT + 0.18, -4.38);
    board.add(trimTop);
    
    const trimBottom = trimTop.clone();
    trimBottom.position.z = 4.38;
    board.add(trimBottom);
    
    const trimLeft = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.04, BOARD_SIZE * SQUARE_SIZE + 0.9),
        trimMat
    );
    trimLeft.position.set(-4.38, BOARD_HEIGHT + 0.18, 0);
    board.add(trimLeft);
    
    const trimRight = trimLeft.clone();
    trimRight.position.x = 4.38;
    board.add(trimRight);
    
    // Add file/rank labels
    addBoardLabels(board);
    
    return board;
}

function addBoardLabels(board) {
    const labelMat = new THREE.MeshPhongMaterial({ 
        color: 0x66553f, 
        shininess: 5 
    });
    
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    
    for (let i = 0; i < 8; i++) {
        // Bottom labels (files)
        const fileLabel = createTextSprite(files[i], 0.42);
        fileLabel.position.set(
            (i - 3.5) * SQUARE_SIZE, 
            BOARD_HEIGHT + 0.27, 
            4.72
        );
        board.add(fileLabel);
        
        // Top labels
        const fileLabelTop = createTextSprite(files[i], 0.42);
        fileLabelTop.position.set(
            (i - 3.5) * SQUARE_SIZE, 
            BOARD_HEIGHT + 0.27, 
            -4.72
        );
        board.add(fileLabelTop);
        
        // Rank labels
        const rank = (8 - i).toString();
        const rankLabel = createTextSprite(rank, 0.42);
        rankLabel.position.set(
            -4.75, 
            BOARD_HEIGHT + 0.27, 
            (i - 3.5) * SQUARE_SIZE
        );
        board.add(rankLabel);
        
        const rankLabelRight = createTextSprite(rank, 0.42);
        rankLabelRight.position.set(
            4.75, 
            BOARD_HEIGHT + 0.27, 
            (i - 3.5) * SQUARE_SIZE
        );
        board.add(rankLabelRight);
    }
}

function createTextSprite(text, size = 0.5) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#66553f';
    ctx.font = 'bold 48px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshPhongMaterial({ 
        map: texture, 
        transparent: true,
        shininess: 10
    });
    
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        material
    );
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}

// ==================== PIECE PLACEMENT ====================
function createPiece(type, color) {
    let pieceMesh;
    
    switch (type) {
        case 'p': pieceMesh = createPawn(color); break;
        case 'r': pieceMesh = createRook(color); break;
        case 'n': pieceMesh = createKnight(color); break;
        case 'b': pieceMesh = createBishop(color); break;
        case 'q': pieceMesh = createQueen(color); break;
        case 'k': pieceMesh = createKing(color); break;
        default: return null;
    }
    
    // Scale
    pieceMesh.scale.set(PIECE_SCALE, PIECE_SCALE, PIECE_SCALE);
    
    // Add shadow properties to all children
    pieceMesh.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    return pieceMesh;
}

function placePieces() {
    // Clear previous pieces
    Object.keys(pieces).forEach(key => {
        const pieceObj = pieces[key];
        if (pieceObj.mesh && pieceObj.mesh.parent) {
            pieceObj.mesh.parent.remove(pieceObj.mesh);
        }
    });
    pieces = {};
    
    const board = chess.board();
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const pieceData = board[row][col];
            if (!pieceData) continue;
            
            const square = getSquareName(row, col);
            const pieceMesh = createPiece(pieceData.type, pieceData.color);
            
            if (pieceMesh) {
                const pos = getWorldPosition(row, col);
                pieceMesh.position.set(pos.x, BOARD_HEIGHT + 0.1, pos.z);
                
                // Add slight random rotation for realism
                pieceMesh.rotation.y = (Math.random() - 0.5) * 0.04;
                
                boardGroup.add(pieceMesh);
                
                pieces[square] = {
                    mesh: pieceMesh,
                    type: pieceData.type,
                    color: pieceData.color,
                    row,
                    col
                };
            }
        }
    }
}

function getSquareName(row, col) {
    const files = 'abcdefgh';
    return files[col] + (8 - row);
}

function getWorldPosition(row, col) {
    const x = (col - 3.5) * SQUARE_SIZE;
    const z = (row - 3.5) * SQUARE_SIZE;
    return { x, z };
}

function getRowColFromSquare(square) {
    const files = 'abcdefgh';
    const col = files.indexOf(square[0]);
    const row = 8 - parseInt(square[1]);
    return { row, col };
}

// ==================== HIGHLIGHTS ====================
let highlightMeshes = [];

function clearHighlights() {
    highlightMeshes.forEach(mesh => {
        if (mesh.parent) mesh.parent.remove(mesh);
    });
    highlightMeshes = [];
}

function highlightSquare(square, color = COLORS.highlight, opacity = 0.55) {
    const { row, col } = getRowColFromSquare(square);
    const pos = getWorldPosition(row, col);
    
    const highlight = new THREE.Mesh(
        new THREE.BoxGeometry(SQUARE_SIZE * 0.96, 0.02, SQUARE_SIZE * 0.96),
        new THREE.MeshPhongMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            shininess: 10,
            depthWrite: false
        })
    );
    
    highlight.position.set(pos.x, BOARD_HEIGHT + 0.17, pos.z);
    boardGroup.add(highlight);
    highlightMeshes.push(highlight);
    
    // Add a ring highlight for more depth
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(SQUARE_SIZE * 0.45, 0.035, 12, 42),
        new THREE.MeshPhongMaterial({
            color: color,
            transparent: true,
            opacity: 0.75,
            shininess: 30
        })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pos.x, BOARD_HEIGHT + 0.22, pos.z);
    boardGroup.add(ring);
    highlightMeshes.push(ring);
    
    return highlight;
}

function highlightPossibleMoves(moves) {
    clearHighlights();
    
    if (selectedPiece) {
        highlightSquare(selectedPiece.square, COLORS.selected, 0.7);
    }
    
    moves.forEach(move => {
        const isCapture = move.captured || move.flags.includes('e');
        const color = isCapture ? COLORS.captureHighlight : COLORS.moveHighlight;
        highlightSquare(move.to, color, isCapture ? 0.65 : 0.45);
    });
}

// ==================== MOVE EXECUTION ====================
function movePiece(from, to, promotion = null) {
    if (isAnimating) return false;
    
    const move = chess.move({ from, to, promotion: promotion || 'q' });
    if (!move) return false;
    
    isAnimating = true;
    
    // Find piece
    const pieceObj = pieces[from];
    if (!pieceObj) {
        isAnimating = false;
        return false;
    }
    
    const targetPos = getWorldPositionFromSquare(to);
    const startPos = pieceObj.mesh.position.clone();
    
    // Handle capture animation
    let capturedPiece = null;
    if (move.captured) {
        capturedPiece = pieces[to];
        if (capturedPiece) {
            // Capture animation: lift and disappear
            animateCapture(capturedPiece, () => {
                updateCapturedPieces();
            });
        }
    }
    
    // Handle en passant capture
    if (move.flags.includes('e')) {
        const epSquare = chess.history({ verbose: true }).slice(-1)[0].to;
        const epRowCol = getRowColFromSquare(epSquare);
        const epTarget = getSquareName(epRowCol.row + (move.color === 'w' ? 1 : -1), epRowCol.col);
        const epPiece = pieces[epTarget];
        if (epPiece) {
            animateCapture(epPiece, () => {
                delete pieces[epTarget];
                updateCapturedPieces();
            });
        }
    }
    
    // Animate the moving piece
    const duration = 420;
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        
        const newX = startPos.x + (targetPos.x - startPos.x) * ease;
        const newZ = startPos.z + (targetPos.z - startPos.z) * ease;
        
        // Slight lift arc
        const lift = Math.sin(progress * Math.PI) * 0.65;
        
        pieceObj.mesh.position.x = newX;
        pieceObj.mesh.position.z = newZ;
        pieceObj.mesh.position.y = BOARD_HEIGHT + 0.1 + lift;
        
        // Add slight rotation during move
        pieceObj.mesh.rotation.y = (progress * 0.8) * (Math.random() > 0.5 ? 1 : -1);
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Final position
            pieceObj.mesh.position.set(targetPos.x, BOARD_HEIGHT + 0.1, targetPos.z);
            pieceObj.mesh.rotation.y = (Math.random() - 0.5) * 0.05;
            
            // Update internal state
            delete pieces[from];
            pieces[to] = pieceObj;
            
            // Update piece data
            const { row, col } = getRowColFromSquare(to);
            pieceObj.row = row;
            pieceObj.col = col;
            
            // Handle promotion
            if (move.promotion) {
                promotePieceMesh(to, move.promotion);
            }
            
            // Update UI
            updateMoveHistory(move);
            updateStatus();
            updateCapturedPieces();
            
            clearHighlights();
            selectedPiece = null;
            validMoves = [];
            
            isAnimating = false;
            
            // Check for game end
            checkGameEnd();
            
            // If AI or just player vs player (here it's PvP)
            if (chess.turn() === 'b' && !chess.isGameOver()) {
                // Could add simple AI here, but for now just let user play black
            }
        }
    }
    
    animate();
    return true;
}

function getWorldPositionFromSquare(square) {
    const { row, col } = getRowColFromSquare(square);
    return getWorldPosition(row, col);
}

function animateCapture(pieceObj, onComplete) {
    if (!pieceObj || !pieceObj.mesh) {
        onComplete?.();
        return;
    }
    
    const startY = pieceObj.mesh.position.y;
    const startTime = Date.now();
    const duration = 380;
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const lift = Math.sin(progress * Math.PI * 1.2) * 1.3;
        pieceObj.mesh.position.y = startY + lift;
        
        // Scale down
        const scale = 1 - progress * 0.6;
        pieceObj.mesh.scale.set(scale, scale, scale);
        
        // Rotate while dying
        pieceObj.mesh.rotation.x = progress * 3.5;
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            if (pieceObj.mesh.parent) {
                pieceObj.mesh.parent.remove(pieceObj.mesh);
            }
            onComplete?.();
        }
    }
    
    animate();
}

function promotePieceMesh(square, newType) {
    const pieceObj = pieces[square];
    if (!pieceObj || !pieceObj.mesh) return;
    
    // Remove old mesh
    if (pieceObj.mesh.parent) {
        pieceObj.mesh.parent.remove(pieceObj.mesh);
    }
    
    // Create new piece
    const newMesh = createPiece(newType, pieceObj.color);
    const pos = getWorldPositionFromSquare(square);
    newMesh.position.set(pos.x, BOARD_HEIGHT + 0.1, pos.z);
    newMesh.scale.set(PIECE_SCALE, PIECE_SCALE, PIECE_SCALE);
    
    boardGroup.add(newMesh);
    
    // Replace
    pieces[square] = {
        mesh: newMesh,
        type: newType,
        color: pieceObj.color,
        row: pieceObj.row,
        col: pieceObj.col
    };
    
    // Small celebration scale
    newMesh.scale.set(0.1, 0.1, 0.1);
    setTimeout(() => {
        const start = Date.now();
        function grow() {
            const p = Math.min((Date.now() - start) / 240, 1);
            const s = 0.1 + (PIECE_SCALE - 0.1) * (1 - Math.pow(1 - p, 2.5));
            newMesh.scale.set(s, s, s);
            if (p < 1) requestAnimationFrame(grow);
            else newMesh.scale.set(PIECE_SCALE, PIECE_SCALE, PIECE_SCALE);
        }
        grow();
    }, 120);
}

// ==================== INTERACTIONS ====================
function onMouseDown(event) {
    if (isAnimating) return;
    
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    // First check if clicking on a piece
    const pieceIntersects = raycaster.intersectObjects(
        Object.values(pieces).map(p => p.mesh), true
    );
    
    if (pieceIntersects.length > 0) {
        // Find the actual piece group
        let clickedMesh = pieceIntersects[0].object;
        let pieceGroup = clickedMesh;
        
        while (pieceGroup.parent && !pieceGroup.userData.type) {
            pieceGroup = pieceGroup.parent;
        }
        
        if (!pieceGroup.userData.type) return;
        
        const clickedSquare = Object.keys(pieces).find(sq => pieces[sq].mesh === pieceGroup);
        if (!clickedSquare) return;
        
        const piece = pieces[clickedSquare];
        
        // If already selected piece clicked again
        if (selectedPiece && selectedPiece.square === clickedSquare) {
            clearHighlights();
            selectedPiece = null;
            validMoves = [];
            return;
        }
        
        // If selecting own piece
        if (piece.color === chess.turn()) {
            selectedPiece = { square: clickedSquare, ...piece };
            validMoves = chess.moves({ square: clickedSquare, verbose: true });
            highlightPossibleMoves(validMoves);
        } 
        // If selecting opponent piece but we have a selected
        else if (selectedPiece) {
            tryMove(selectedPiece.square, clickedSquare);
        }
        return;
    }
    
    // Check for clicking on highlighted square (move)
    const boardIntersects = raycaster.intersectObjects(boardGroup.children, true);
    
    for (let intersect of boardIntersects) {
        const obj = intersect.object;
        if (obj.userData && obj.userData.square) {
            const targetSquare = obj.userData.square;
            
            if (selectedPiece) {
                tryMove(selectedPiece.square, targetSquare);
            }
            return;
        }
    }
}

function tryMove(from, to) {
    if (!selectedPiece || isAnimating) return;
    
    const possibleMove = validMoves.find(m => m.from === from && m.to === to);
    
    if (!possibleMove) {
        // Invalid move, clear selection
        clearHighlights();
        selectedPiece = null;
        validMoves = [];
        return;
    }
    
    // Check for promotion
    if (possibleMove.flags.includes('p')) {
        // Store pending promotion
        promotionPending = { from, to };
        
        // Show modal
        document.getElementById('promotion-modal').style.display = 'flex';
        return;
    }
    
    // Execute move
    const success = movePiece(from, to);
    
    if (success) {
        clearHighlights();
        selectedPiece = null;
        validMoves = [];
    }
}

window.promotePiece = function(pieceType) {
    if (!promotionPending) return;
    
    document.getElementById('promotion-modal').style.display = 'none';
    
    const { from, to } = promotionPending;
    promotionPending = null;
    
    const success = movePiece(from, to, pieceType);
    
    if (success) {
        clearHighlights();
        selectedPiece = null;
        validMoves = [];
    }
};

// ==================== UI UPDATES ====================
function updateMoveHistory(move) {
    if (!moveHistoryEl) return;
    
    const history = chess.history({ verbose: true });
    const moveNum = Math.ceil(history.length / 2);
    
    // Clear placeholder if exists
    if (moveHistoryEl.children.length === 1 && moveHistoryEl.children[0].textContent.includes('حرکات')) {
        moveHistoryEl.innerHTML = '';
    }
    
    // If it's a new full move, create new row
    const lastChild = moveHistoryEl.lastElementChild;
    
    if (history.length % 2 === 1) {
        // White move: create new row
        const row = document.createElement('div');
        row.className = 'move-row';
        row.innerHTML = `
            <div class="move-num">${moveNum}.</div>
            <div class="move-white">${move.san}</div>
            <div class="move-black"></div>
        `;
        moveHistoryEl.appendChild(row);
    } else {
        // Black move: update last row
        if (lastChild) {
            const blackDiv = lastChild.querySelector('.move-black');
            if (blackDiv) blackDiv.textContent = move.san;
        }
    }
    
    // Auto scroll to bottom
    moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
}

function updateCapturedPieces() {
    if (!capturedWhiteEl || !capturedBlackEl) return;
    
    capturedWhiteEl.innerHTML = '';
    capturedBlackEl.innerHTML = '';
    
    const history = chess.history({ verbose: true });
    
    history.forEach(move => {
        if (move.captured) {
            const container = move.color === 'w' ? capturedBlackEl : capturedWhiteEl;
            const span = document.createElement('div');
            span.className = 'captured-piece';
            span.textContent = getPieceSymbol(move.captured, move.color === 'w' ? 'b' : 'w');
            container.appendChild(span);
        }
    });
}

function getPieceSymbol(type, color) {
    const symbols = {
        p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔'
    };
    let sym = symbols[type] || '?';
    if (color === 'b') {
        // Use black unicode variants
        const blackSymbols = { '♙': '♟︎', '♖': '♜', '♘': '♞', '♗': '♝', '♕': '♛', '♔': '♚' };
        sym = blackSymbols[sym] || sym;
    }
    return sym;
}

function updateStatus() {
    if (!statusTextEl || !turnIndicatorEl) return;
    
    const turn = chess.turn();
    
    // Update indicators
    if (whiteStatusEl && blackStatusEl) {
        if (turn === 'w') {
            whiteStatusEl.textContent = 'نوبت شما';
            blackStatusEl.textContent = 'در انتظار';
            whiteStatusEl.style.color = '#c5a26f';
            blackStatusEl.style.color = '#8d8573';
        } else {
            whiteStatusEl.textContent = 'در انتظار';
            blackStatusEl.textContent = 'نوبت شما';
            whiteStatusEl.style.color = '#8d8573';
            blackStatusEl.style.color = '#c5a26f';
        }
    }
    
    let status = '';
    
    if (chess.isCheckmate()) {
        const winner = turn === 'w' ? 'سیاه' : 'سفید';
        status = `کیش و مات! ${winner} برنده شد`;
        statusTextEl.style.color = '#c94c4c';
    } else if (chess.isCheck()) {
        status = 'کیش!';
        statusTextEl.style.color = '#c5a26f';
    } else if (chess.isDraw()) {
        status = 'مساوی!';
        statusTextEl.style.color = '#8d8573';
    } else if (chess.isStalemate()) {
        status = 'پات!';
        statusTextEl.style.color = '#8d8573';
    } else {
        status = turn === 'w' ? 'نوبت سفید' : 'نوبت سیاه';
        statusTextEl.style.color = '#e8e4d9';
    }
    
    statusTextEl.textContent = status;
}

function checkGameEnd() {
    updateStatus();
    
    if (chess.isGameOver()) {
        // Show nice end message
        setTimeout(() => {
            const msg = chess.isCheckmate() ? 'کیش و مات!' : 'بازی تمام شد!';
            statusTextEl.innerHTML = `<strong>${msg}</strong>`;
            
            // Optional: subtle end effect
            if (renderer) renderer.domElement.style.filter = 'saturate(0.6)';
        }, 600);
    }
}

// ==================== CAMERA & SCENE ====================
function initThree() {
    const container = document.getElementById('three-container');
    
    // Renderer
    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        alpha: false,
        powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x1a1f2e, 18, 55);
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        58, 
        container.clientWidth / container.clientHeight, 
        0.5, 
        100
    );
    camera.position.set(4.5, 11.5, 11.8);
    camera.lookAt(0, 0, 0);
    
    // Lights - dramatic high quality lighting
    const ambient = new THREE.AmbientLight(0x4a5568, 0.65);
    scene.add(ambient);
    
    // Main directional (sun)
    const dirLight = new THREE.DirectionalLight(0xfff1d9, 1.05);
    dirLight.position.set(6, 18, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    dirLight.shadow.bias = -0.0004;
    scene.add(dirLight);
    
    // Fill light
    const fillLight = new THREE.DirectionalLight(0xa3b4d9, 0.35);
    fillLight.position.set(-8, 9, -12);
    scene.add(fillLight);
    
    // Rim / edge light
    const rimLight = new THREE.DirectionalLight(0xaaa088, 0.4);
    rimLight.position.set(0, 6, -14);
    scene.add(rimLight);
    
    // Point lights for extra shine on pieces
    const point1 = new THREE.PointLight(0xffe8c2, 0.7, 30);
    point1.position.set(0, 12, 0);
    scene.add(point1);
    
    const point2 = new THREE.PointLight(0x8a9fc4, 0.35, 25);
    point2.position.set(-6, 4, -8);
    scene.add(point2);
    
    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 5;
    controls.maxDistance = 22;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.minPolarAngle = Math.PI * 0.08;
    controls.target.set(0, 1.5, 0);
    controls.update();
    
    // Raycaster & mouse
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Event listeners
    renderer.domElement.addEventListener('mousedown', onMouseDown, false);
    
    // Resize handler
    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
    
    // Create board
    boardGroup = createChessboard();
    scene.add(boardGroup);
    
    // Ground plane
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(42, 42),
        new THREE.MeshPhongMaterial({ 
            color: 0x11161f, 
            shininess: 5 
        })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Initial chess
    chess = new Chess();
    placePieces();
    
    // Initial highlights
    updateStatus();
    
    // Start render loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    
    if (controls) controls.update();
    
    // Very subtle piece breathing / floating
    Object.values(pieces).forEach(pieceObj => {
        if (pieceObj.mesh && !isAnimating) {
            const time = Date.now() * 0.001;
            const float = Math.sin(time * 0.8 + pieceObj.mesh.position.x * 0.5) * 0.012;
            pieceObj.mesh.position.y = BOARD_HEIGHT + 0.1 + float;
        }
    });
    
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// ==================== PUBLIC FUNCTIONS ====================
window.resetGame = function() {
    if (isAnimating) return;
    
    chess.reset();
    
    // Clear all pieces
    Object.keys(pieces).forEach(key => {
        const p = pieces[key];
        if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    });
    pieces = {};
    
    // Reset UI
    if (moveHistoryEl) moveHistoryEl.innerHTML = '<div style="color:#666; font-size:0.8rem; padding:4px 8px;">حرکات اینجا نمایش داده می‌شود...</div>';
    if (capturedWhiteEl) capturedWhiteEl.innerHTML = '';
    if (capturedBlackEl) capturedBlackEl.innerHTML = '';
    if (statusTextEl) statusTextEl.style.color = '#e8e4d9';
    
    clearHighlights();
    selectedPiece = null;
    validMoves = [];
    promotionPending = null;
    
    // Re-place pieces
    placePieces();
    updateStatus();
    
    // Reset camera
    if (camera) {
        camera.position.set(4.5, 11.5, 11.8);
        controls.target.set(0, 1.5, 0);
        controls.update();
    }
    
    // Reset filter
    if (renderer) renderer.domElement.style.filter = 'none';
};

window.undoMove = function() {
    if (isAnimating) return;
    
    const historyLen = chess.history().length;
    if (historyLen === 0) return;
    
    // Undo last move
    chess.undo();
    
    // Rebuild pieces from chess state
    Object.keys(pieces).forEach(key => {
        const p = pieces[key];
        if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
    });
    pieces = {};
    
    placePieces();
    
    // Rebuild UI
    rebuildMoveHistory();
    updateCapturedPieces();
    updateStatus();
    
    clearHighlights();
    selectedPiece = null;
    validMoves = [];
    
    if (renderer) renderer.domElement.style.filter = 'none';
};

function rebuildMoveHistory() {
    if (!moveHistoryEl) return;
    
    moveHistoryEl.innerHTML = '';
    const history = chess.history({ verbose: true });
    
    let row;
    for (let i = 0; i < history.length; i++) {
        const move = history[i];
        const moveNum = Math.ceil((i + 1) / 2);
        
        if (i % 2 === 0) {
            row = document.createElement('div');
            row.className = 'move-row';
            row.innerHTML = `
                <div class="move-num">${moveNum}.</div>
                <div class="move-white">${move.san}</div>
                <div class="move-black"></div>
            `;
            moveHistoryEl.appendChild(row);
        } else {
            if (row) {
                const blackDiv = row.querySelector('.move-black');
                if (blackDiv) blackDiv.textContent = move.san;
            }
        }
    }
    
    moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
}

window.flipBoard = function() {
    if (isAnimating) return;
    
    isFlipped = !isFlipped;
    
    // Animate camera rotation around board
    const targetAngle = isFlipped ? Math.PI : 0;
    
    const startPos = camera.position.clone();
    const duration = 780;
    const startTime = Date.now();
    
    const center = new THREE.Vector3(0, 1.5, 0);
    
    function animateFlip() {
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        
        // Rotate around Y axis
        const currentAngle = targetAngle * ease;
        
        // Spherical rotation
        const radius = startPos.distanceTo(center);
        const startAzimuth = Math.atan2(startPos.z, startPos.x);
        
        const newX = Math.cos(startAzimuth + currentAngle) * radius;
        const newZ = Math.sin(startAzimuth + currentAngle) * radius;
        
        camera.position.x = newX;
        camera.position.z = newZ;
        camera.lookAt(center);
        
        if (t < 1) {
            requestAnimationFrame(animateFlip);
        } else {
            // Snap board labels if needed
            if (controls) controls.update();
        }
    }
    
    animateFlip();
};

// ==================== INIT ====================
function initUI() {
    moveHistoryEl = document.getElementById('move-history');
    capturedWhiteEl = document.getElementById('captured-white');
    capturedBlackEl = document.getElementById('captured-black');
    statusTextEl = document.getElementById('status-text');
    turnIndicatorEl = document.getElementById('turn-indicator');
    whiteStatusEl = document.getElementById('white-status');
    blackStatusEl = document.getElementById('black-status');
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            if (!isAnimating) window.resetGame();
        }
        if (e.key === 'u' || e.key === 'U') {
            window.undoMove();
        }
        if (e.key === 'f' || e.key === 'F') {
            window.flipBoard();
        }
        if (e.key === 'Escape' && document.getElementById('promotion-modal').style.display === 'flex') {
            document.getElementById('promotion-modal').style.display = 'none';
            promotionPending = null;
        }
    });
    
    // Make sure modal close on outside click
    const modal = document.getElementById('promotion-modal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
            promotionPending = null;
        }
    });
    
    // Touch support for mobile
    let touchStartX = 0, touchStartY = 0;
    const canvas = document.querySelector('#three-container canvas');
    
    if (canvas) {
        canvas.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });
        
        canvas.addEventListener('touchend', (e) => {
            const dx = e.changedTouches[0].clientX - touchStartX;
            const dy = e.changedTouches[0].clientY - touchStartY;
            
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                // Treat as tap
                const rect = canvas.getBoundingClientRect();
                const fakeEvent = {
                    clientX: e.changedTouches[0].clientX,
                    clientY: e.changedTouches[0].clientY
                };
                onMouseDown(fakeEvent);
            }
        });
    }
    
    // Welcome message
    setTimeout(() => {
        if (statusTextEl && statusTextEl.textContent === 'آماده برای بازی') {
            statusTextEl.textContent = 'کلیک روی قطعه برای حرکت';
        }
    }, 2800);
}

function init() {
    initUI();
    initThree();
    
    // Initial UI state
    console.log('%c[Shahmat] 3D Chess with ultra-detailed pieces initialized.', 'color:#66553f');
    
    // Add some initial info hint
    setTimeout(() => {
        const hint = document.createElement('div');
        hint.style.cssText = 'position:absolute; bottom:18px; left:50%; transform:translateX(-50%); background:rgba(20,24,35,0.75); color:#8d8573; font-size:0.72rem; padding:3px 14px; border-radius:20px; pointer-events:none;';
        hint.textContent = 'از OrbitControls برای چرخش و زوم استفاده کنید';
        
        const container = document.getElementById('three-container');
        if (container) {
            container.appendChild(hint);
            setTimeout(() => {
                hint.style.transition = 'opacity 0.7s';
                hint.style.opacity = '0';
                setTimeout(() => hint.remove(), 700);
            }, 3600);
        }
    }, 4200);
}

// Bootstrap
init();
