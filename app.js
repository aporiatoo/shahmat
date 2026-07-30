(() => {
  'use strict';

  const boardEl = document.getElementById('board');
  const boardStage = document.querySelector('.board-stage');
  const moveListEl = document.getElementById('moveList');
  const toastEl = document.getElementById('toast');
  const promotionModal = document.getElementById('promotionModal');
  const promotionChoices = document.getElementById('promotionChoices');
  const endgameModal = document.getElementById('endgameModal');
  const mainMenu = document.getElementById('mainMenu');
  const gameMenu = document.getElementById('gameMenu');
  const menuScrim = document.getElementById('menuScrim');
  const menuToggle = document.getElementById('menuToggle');
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const pieces = { p: 'پیاده', n: 'اسب', b: 'فیل', r: 'رخ', q: 'وزیر', k: 'شاه' };
  const notationPieces = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
  const unicodePieces = {
    w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
    b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' }
  };
  const coachTips = [
    'مرکز صفحه را با پیاده‌ها کنترل کنید.',
    'پیش از حمله، امنیت شاه خود را بررسی کنید.',
    'اسب‌ها در خانه‌های مرکزی بیشترین قدرت را دارند.',
    'رخ‌ها را پشت پیاده‌های گذشته قرار دهید.',
    'گاهی بهترین حرکت، حرکتی است که حریف انتظارش را ندارد.'
  ];

  let idCounter = 0;
  let audioContext;
  let soundOn = true;
  let toastTimer;
  let state;
  let threeBoard = null;

  function makePiece(type, color) {
    return { type, color, id: `${color}${type}${++idCounter}` };
  }

  function makeInitialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    backRank.forEach((type, x) => {
      board[0][x] = makePiece(type, 'b');
      board[1][x] = makePiece('p', 'b');
      board[6][x] = makePiece('p', 'w');
      board[7][x] = makePiece(type, 'w');
    });
    return board;
  }

  function resetState() {
    idCounter = 0;
    state = {
      board: makeInitialBoard(),
      turn: 'w',
      selected: null,
      legalMoves: [],
      lastMove: null,
      moves: [],
      snapshots: [],
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      enPassant: null,
      capturedBy: { w: [], b: [] },
      timers: { w: 600, b: 600 },
      gameOver: false,
      gameStarted: false,
      result: '',
      resultDescription: '',
      flipped: false,
      focused: false,
      hint: null,
      pendingPromotion: null
    };
  }

  function cloneBoard(board) {
    return board.map(row => row.map(piece => piece ? { ...piece } : null));
  }

  function clonePlain(value) {
    return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  function makeSnapshot() {
    return {
      board: cloneBoard(state.board),
      turn: state.turn,
      lastMove: clonePlain(state.lastMove),
      moves: clonePlain(state.moves),
      castling: { ...state.castling },
      enPassant: clonePlain(state.enPassant),
      capturedBy: { w: clonePlain(state.capturedBy.w), b: clonePlain(state.capturedBy.b) },
      timers: { ...state.timers },
      gameOver: state.gameOver,
      gameStarted: state.gameStarted,
      result: state.result,
      resultDescription: state.resultDescription
    };
  }

  function restoreSnapshot(snapshot) {
    state.board = cloneBoard(snapshot.board);
    state.turn = snapshot.turn;
    state.lastMove = clonePlain(snapshot.lastMove);
    state.moves = clonePlain(snapshot.moves);
    state.castling = { ...snapshot.castling };
    state.enPassant = clonePlain(snapshot.enPassant);
    state.capturedBy = { w: clonePlain(snapshot.capturedBy.w), b: clonePlain(snapshot.capturedBy.b) };
    state.timers = { ...snapshot.timers };
    state.gameOver = snapshot.gameOver;
    state.gameStarted = snapshot.gameStarted;
    state.result = snapshot.result;
    state.resultDescription = snapshot.resultDescription;
    state.selected = null;
    state.legalMoves = [];
    state.hint = null;
    state.pendingPromotion = null;
  }

  function inside(y, x) { return y >= 0 && y < 8 && x >= 0 && x < 8; }
  function opposite(color) { return color === 'w' ? 'b' : 'w'; }
  function sameSquare(a, b) { return a && b && a.y === b.y && a.x === b.x; }
  function squareName(y, x) { return `${files[x]}${8 - y}`; }
  function farsiMoveNumber(n) { return String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }

  function clearPath(board, from, to) {
    const stepY = Math.sign(to.y - from.y);
    const stepX = Math.sign(to.x - from.x);
    let y = from.y + stepY;
    let x = from.x + stepX;
    while (y !== to.y || x !== to.x) {
      if (board[y][x]) return false;
      y += stepY;
      x += stepX;
    }
    return true;
  }

  function attacksSquare(board, fromY, fromX, targetY, targetX) {
    const piece = board[fromY][fromX];
    if (!piece) return false;
    const dy = targetY - fromY;
    const dx = targetX - fromX;
    const absY = Math.abs(dy);
    const absX = Math.abs(dx);
    if (piece.type === 'p') {
      const direction = piece.color === 'w' ? -1 : 1;
      return dy === direction && absX === 1;
    }
    if (piece.type === 'n') return (absY === 2 && absX === 1) || (absY === 1 && absX === 2);
    if (piece.type === 'k') return Math.max(absY, absX) === 1;
    if (piece.type === 'b') return absY === absX && clearPath(board, { y: fromY, x: fromX }, { y: targetY, x: targetX });
    if (piece.type === 'r') return (dy === 0 || dx === 0) && (dy !== 0 || dx !== 0) && clearPath(board, { y: fromY, x: fromX }, { y: targetY, x: targetX });
    if (piece.type === 'q') return ((absY === absX) || dy === 0 || dx === 0) && (dy !== 0 || dx !== 0) && clearPath(board, { y: fromY, x: fromX }, { y: targetY, x: targetX });
    return false;
  }

  function isSquareAttacked(board, y, x, byColor) {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col]?.color === byColor && attacksSquare(board, row, col, y, x)) return true;
      }
    }
    return false;
  }

  function findKing(board, color) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (board[y][x]?.color === color && board[y][x].type === 'k') return { y, x };
      }
    }
    return null;
  }

  function isKingInCheck(color, board = state.board) {
    const king = findKing(board, color);
    return king ? isSquareAttacked(board, king.y, king.x, opposite(color)) : true;
  }

  function pseudoMoves(from, includeCastling = true) {
    const { y, x } = from;
    const board = state.board;
    const piece = board[y][x];
    if (!piece) return [];
    const moves = [];
    const add = (toY, toX, special = null) => {
      if (!inside(toY, toX)) return;
      const target = board[toY][toX];
      if (!target || (target.color !== piece.color && target.type !== 'k')) moves.push({ y: toY, x: toX, special });
    };

    if (piece.type === 'p') {
      const direction = piece.color === 'w' ? -1 : 1;
      const startRow = piece.color === 'w' ? 6 : 1;
      if (inside(y + direction, x) && !board[y + direction][x]) {
        add(y + direction, x);
        if (y === startRow && !board[y + direction * 2][x]) add(y + direction * 2, x, 'double-pawn');
      }
      for (const dx of [-1, 1]) {
        const targetY = y + direction;
        const targetX = x + dx;
        if (!inside(targetY, targetX)) continue;
        if (board[targetY][targetX] && board[targetY][targetX].color !== piece.color) add(targetY, targetX);
        if (state.enPassant && state.enPassant.y === targetY && state.enPassant.x === targetX) {
          const passingPawn = board[y][targetX];
          if (passingPawn?.type === 'p' && passingPawn.color !== piece.color) add(targetY, targetX, 'en-passant');
        }
      }
    }

    if (piece.type === 'n') {
      [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dy, dx]) => add(y + dy, x + dx));
    }

    if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
      const directions = [];
      if (piece.type === 'b' || piece.type === 'q') directions.push([-1,-1],[-1,1],[1,-1],[1,1]);
      if (piece.type === 'r' || piece.type === 'q') directions.push([-1,0],[1,0],[0,-1],[0,1]);
      directions.forEach(([dy, dx]) => {
        let targetY = y + dy;
        let targetX = x + dx;
        while (inside(targetY, targetX)) {
          const target = board[targetY][targetX];
          if (!target) moves.push({ y: targetY, x: targetX, special: null });
          else {
            if (target.color !== piece.color && target.type !== 'k') moves.push({ y: targetY, x: targetX, special: null });
            break;
          }
          targetY += dy;
          targetX += dx;
        }
      });
    }

    if (piece.type === 'k') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dy || dx) add(y + dy, x + dx);
      if (includeCastling && x === 4 && (y === 7 || y === 0)) {
        const prefix = piece.color;
        const home = y;
        if (state.castling[`${prefix}K`] && !board[home][5] && !board[home][6] && board[home][7]?.type === 'r' && board[home][7]?.color === piece.color) {
          moves.push({ y: home, x: 6, special: 'castle-kingside' });
        }
        if (state.castling[`${prefix}Q`] && !board[home][3] && !board[home][2] && !board[home][1] && board[home][0]?.type === 'r' && board[home][0]?.color === piece.color) {
          moves.push({ y: home, x: 2, special: 'castle-queenside' });
        }
      }
    }
    return moves;
  }

  function applyMoveToBoard(board, from, move, promotion = null) {
    const next = cloneBoard(board);
    const piece = next[from.y][from.x];
    if (!piece) return next;
    next[from.y][from.x] = null;
    if (move.special === 'en-passant') next[from.y][move.x] = null;
    if (move.special === 'castle-kingside') {
      next[from.y][5] = next[from.y][7];
      next[from.y][7] = null;
    }
    if (move.special === 'castle-queenside') {
      next[from.y][3] = next[from.y][0];
      next[from.y][0] = null;
    }
    next[move.y][move.x] = promotion ? { ...piece, type: promotion } : piece;
    return next;
  }

  function isCastlePathSafe(from, move, piece) {
    if (!move.special?.startsWith('castle')) return true;
    if (isKingInCheck(piece.color, state.board)) return false;
    const direction = move.x > from.x ? 1 : -1;
    const steppingBoard = cloneBoard(state.board);
    steppingBoard[from.y][from.x] = null;
    steppingBoard[from.y][from.x + direction] = { ...piece };
    return !isSquareAttacked(steppingBoard, from.y, from.x + direction, opposite(piece.color));
  }

  function getLegalMoves(from) {
    const piece = state.board[from.y][from.x];
    if (!piece) return [];
    return pseudoMoves(from).filter(move => {
      if (!isCastlePathSafe(from, move, piece)) return false;
      const next = applyMoveToBoard(state.board, from, move);
      return !isKingInCheck(piece.color, next);
    });
  }

  function getAllLegalMoves(color) {
    const all = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (state.board[y][x]?.color === color) {
          const options = getLegalMoves({ y, x });
          options.forEach(move => all.push({ from: { y, x }, move }));
        }
      }
    }
    return all;
  }

  function pieceShape(type) {
    const base = '<path d="M17 87c0-7 4-11 12-13l5-12h32l5 12c8 2 12 6 12 13H17Z"/><path d="M20 88h60c2 0 4 2 4 4H16c0-2 2-4 4-4Z"/>';
    if (type === 'p') return `${base}<circle cx="50" cy="26" r="14"/><path d="M38 61c0-11 3-18 12-21 9 3 12 10 12 21Z"/>`;
    if (type === 'r') return `${base}<path d="M29 62V32h7v-8h8v8h12v-8h8v8h7v30Z"/><path d="M26 22h11v7h8v-7h10v7h8v-7h11v13H26Z"/>`;
    if (type === 'n') return `${base}<path d="M31 65c3-18 6-33 4-46 10 1 22 6 28 17l9 6-8 7 3 16H31Z"/><path d="M39 25c3-8 12-12 19-10l6 8-10 4Z"/>`;
    if (type === 'b') return `${base}<path d="M32 63c4-13 8-21 13-26-7-10-5-22 5-28 10 6 12 18 5 28 5 5 9 13 13 26Z"/><path d="M40 23l20 13" class="piece-detail"/>`;
    if (type === 'q') return `${base}<path d="M29 62 25 30l13 11 12-22 12 22 13-11-4 32Z"/><circle cx="25" cy="26" r="4"/><circle cx="50" cy="15" r="4"/><circle cx="75" cy="26" r="4"/><path d="M31 54h38" class="piece-detail"/>`;
    return `${base}<path d="M34 64c4-13 7-22 12-28V24h-7v-7h7v-8h8v8h7v7h-7v12c5 6 8 15 12 28Z"/><path d="M38 48h24" class="piece-detail"/>`;
  }

  function pieceSvg(piece, suffix) {
    const id = `${piece.id}-${suffix}`.replace(/[^a-zA-Z0-9-]/g, '');
    const shape = pieceShape(piece.type);
    return `<svg viewBox="0 0 100 100" role="img" aria-label="${pieces[piece.type]} ${piece.color === 'w' ? 'سفید' : 'سیاه'}"><defs>
      <linearGradient id="ivoryMetal-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffdf1"/><stop offset=".28" stop-color="#e9e4d5"/><stop offset=".62" stop-color="#afa795"/><stop offset="1" stop-color="#eee9da"/></linearGradient>
      <linearGradient id="obsidianMetal-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#587a70"/><stop offset=".28" stop-color="#354f48"/><stop offset=".67" stop-color="#172e2a"/><stop offset="1" stop-color="#3d6258"/></linearGradient>
      <linearGradient id="rubyMetal-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8b5a48"/><stop offset=".4" stop-color="#4e2c25"/><stop offset="1" stop-color="#2e1715"/></linearGradient>
    </defs><g class="piece-side">${shape}</g><g class="piece-main" style="fill:url(#${piece.color === 'w' ? `ivoryMetal-${id}` : `obsidianMetal-${id}`})">${shape}</g><ellipse class="piece-glint" cx="43" cy="28" rx="4" ry="8"/></svg>`;
  }

  function configureThreeColors() {
    if (!threeBoard) return;
    const amber = document.body.classList.contains('alt-light');
    threeBoard.materials.light.color.set(amber ? 0xe9dcc4 : 0xf1ecdd);
    threeBoard.materials.lightAccent.color.set(amber ? 0x9e876c : 0xb7aa91);
    threeBoard.materials.dark.color.set(amber ? 0x4b2924 : 0x1c4039);
    threeBoard.materials.darkAccent.color.set(amber ? 0x1d100e : 0x0c2723);
    threeBoard.materials.lightTile.color.set(amber ? 0xcdb699 : 0xd8c19a);
    threeBoard.materials.darkTile.color.set(amber ? 0x704c3c : 0x46675b);
    threeBoard.materials.wood.color.set(amber ? 0x5e331e : 0x5a351d);
    threeBoard.materials.woodEdge.color.set(amber ? 0x24130f : 0x1f1712);
    threeBoard.materials.frameInlay.color.set(amber ? 0xe4a650 : 0xd7ac65);
  }

  function createLatheModel(THREE, profile, material) {
    const points = profile.map(([radius, height]) => new THREE.Vector2(radius, height));
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 64), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function addThreeMesh(group, mesh, x = 0, y = 0, z = 0) {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function createThreePiece(type, color, THREE, materials) {
    const group = new THREE.Group();
    const main = color === 'w' ? materials.light : materials.dark;
    const accent = color === 'w' ? materials.lightAccent : materials.darkAccent;
    const inlay = color === 'w' ? materials.inlay : materials.darkInlay;
    const profile = {
      p: [[.46,0],[.51,.025],[.52,.055],[.48,.09],[.38,.12],[.34,.17],[.32,.25],[.30,.34],[.25,.43],[.20,.49],[.185,.55]],
      r: [[.48,0],[.53,.025],[.54,.058],[.49,.10],[.39,.13],[.34,.18],[.32,.27],[.30,.35]],
      n: [[.48,0],[.53,.025],[.54,.058],[.49,.10],[.38,.13],[.33,.18],[.31,.29],[.28,.40]],
      b: [[.48,0],[.53,.025],[.54,.058],[.49,.10],[.38,.13],[.31,.23],[.28,.36],[.23,.50],[.185,.61]],
      q: [[.50,0],[.55,.025],[.56,.062],[.51,.11],[.41,.14],[.35,.22],[.31,.34],[.27,.49],[.22,.63]],
      k: [[.51,0],[.56,.025],[.57,.065],[.52,.11],[.42,.15],[.36,.24],[.31,.39],[.27,.55],[.205,.70]]
    };
    const addRing = (radius, tube, height, material = accent) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 12, 48), material);
      ring.rotation.x = Math.PI / 2;
      return addThreeMesh(group, ring, 0, height, 0);
    };
    const addStudCircle = (radius, height, count, size = .035, material = inlay) => {
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        const stud = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), material);
        addThreeMesh(group, stud, Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      }
    };
    const addVerticalFlutes = (radius, height, count, material = accent) => {
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        const flute = new THREE.Mesh(new THREE.BoxGeometry(.024, height, .038), material);
        flute.rotation.y = -angle;
        addThreeMesh(group, flute, Math.cos(angle) * radius, height / 2 + .34, Math.sin(angle) * radius);
      }
    };

    group.add(createLatheModel(THREE, profile[type], main));
    addRing(.44, .014, .053, inlay);
    addRing(.36, .013, .132, accent);
    if (type !== 'p') addStudCircle(.405, .145, 10, .024, inlay);

    if (type === 'p') {
      addRing(.205, .033, .55, accent);
      addRing(.165, .012, .60, inlay);
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.225, 40, 28), main), 0, .79, 0);
      const headBand = new THREE.Mesh(new THREE.TorusGeometry(.188, .014, 10, 36), accent);
      headBand.rotation.x = Math.PI / 2;
      addThreeMesh(group, headBand, 0, .79, 0);
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.052, 18, 14), inlay), 0, .90, -.19);
    }

    if (type === 'r') {
      addThreeMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(.30, .33, .54, 64), main), 0, .64, 0);
      addVerticalFlutes(.305, .39, 10, accent);
      addRing(.325, .018, .42, inlay);
      addRing(.32, .019, .84, accent);
      addThreeMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .115, 64), main), 0, .96, 0);
      addThreeMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(.37, .40, .05, 64), inlay), 0, 1.025, 0);
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        const crenel = new THREE.Mesh(new THREE.BoxGeometry(.16, .17, .16), main);
        crenel.rotation.y = -angle;
        addThreeMesh(group, crenel, Math.cos(angle) * .31, 1.10, Math.sin(angle) * .31);
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(.034, 14, 10), inlay);
        addThreeMesh(group, rivet, Math.cos(angle) * .315, 1.18, Math.sin(angle) * .315);
      }
    }

    if (type === 'n') {
      addRing(.29, .022, .40, inlay);
      const shape = new THREE.Shape();
      shape.moveTo(-.29, .35);
      shape.lineTo(-.32, .70);
      shape.quadraticCurveTo(-.36, 1.07, -.18, 1.34);
      shape.quadraticCurveTo(.03, 1.55, .27, 1.38);
      shape.lineTo(.35, 1.10);
      shape.lineTo(.18, .94);
      shape.lineTo(.33, .74);
      shape.lineTo(.22, .43);
      shape.lineTo(.02, .36);
      shape.closePath();
      const neck = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .29, bevelEnabled: true, bevelSegments: 3, bevelSize: .028, bevelThickness: .032 }), main);
      addThreeMesh(group, neck, 0, 0, -.145);
      const mane = new THREE.Mesh(new THREE.BoxGeometry(.052, .72, .32), accent);
      mane.rotation.z = -.22;
      addThreeMesh(group, mane, -.19, .95, 0);
      for (let i = 0; i < 5; i++) {
        const maneRidge = new THREE.Mesh(new THREE.ConeGeometry(.047, .15, 10), inlay);
        maneRidge.rotation.z = Math.PI / 2 - .22;
        addThreeMesh(group, maneRidge, -.22 + i * .035, .62 + i * .13, 0);
      }
      for (const x of [-.10, .10]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(.073, .19, 14), main);
        ear.rotation.z = x > 0 ? -.15 : .15;
        addThreeMesh(group, ear, x, 1.42, -.02);
      }
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.052, 18, 14), inlay), .19, 1.28, -.165);
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.026, 14, 10), accent), .22, 1.30, -.205);
      const bridle = new THREE.Mesh(new THREE.TorusGeometry(.19, .014, 10, 32), inlay);
      bridle.rotation.x = Math.PI / 2;
      addThreeMesh(group, bridle, .06, 1.08, -.03);
    }

    if (type === 'b') {
      addRing(.22, .028, .59, accent);
      addRing(.18, .014, .65, inlay);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 44, 32), main);
      head.scale.set(.92, 1.25, .92);
      addThreeMesh(group, head, 0, .88, 0);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(.188, .013, 10, 36), inlay);
      halo.rotation.x = Math.PI / 2;
      addThreeMesh(group, halo, 0, .90, 0);
      const slash = new THREE.Mesh(new THREE.BoxGeometry(.058, .32, .09), accent);
      slash.rotation.z = -.64;
      addThreeMesh(group, slash, 0, .89, -.205);
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 12), inlay), -.075, 1.02, -.18);
    }

    if (type === 'q') {
      addRing(.235, .031, .64, accent);
      addRing(.19, .014, .70, inlay);
      addThreeMesh(group, new THREE.Mesh(new THREE.CylinderGeometry(.34, .30, .09, 64), main), 0, .77, 0);
      addThreeMesh(group, new THREE.Mesh(new THREE.ConeGeometry(.35, .17, 8), main), 0, .89, 0);
      addRing(.275, .018, .94, inlay);
      for (let i = 0; i < 8; i++) {
        const angle = i / 8 * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(.065, .23, 14), main);
        spike.rotation.z = -.24;
        addThreeMesh(group, spike, Math.cos(angle) * .275, 1.08, Math.sin(angle) * .275);
        const jewel = new THREE.Mesh(new THREE.SphereGeometry(.058, 18, 14), inlay);
        addThreeMesh(group, jewel, Math.cos(angle) * .275, 1.205, Math.sin(angle) * .275);
      }
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.128, 28, 20), inlay), 0, 1.14, 0);
      addStudCircle(.18, .81, 8, .025, inlay);
    }

    if (type === 'k') {
      addRing(.24, .03, .71, accent);
      addRing(.195, .014, .77, inlay);
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.18, 36, 28), main), 0, .93, 0);
      const crownRing = new THREE.Mesh(new THREE.TorusGeometry(.16, .019, 10, 36), inlay);
      crownRing.rotation.x = Math.PI / 2;
      addThreeMesh(group, crownRing, 0, 1.04, 0);
      const crossBack = new THREE.Mesh(new THREE.BoxGeometry(.13, .40, .15), accent);
      addThreeMesh(group, crossBack, 0, 1.24, .012);
      const crossStem = new THREE.Mesh(new THREE.BoxGeometry(.09, .37, .11), main);
      addThreeMesh(group, crossStem, 0, 1.25, -.06);
      const crossArm = new THREE.Mesh(new THREE.BoxGeometry(.36, .09, .11), main);
      addThreeMesh(group, crossArm, 0, 1.32, -.06);
      const crossInlay = new THREE.Mesh(new THREE.BoxGeometry(.19, .032, .125), inlay);
      addThreeMesh(group, crossInlay, 0, 1.32, -.125);
      addThreeMesh(group, new THREE.Mesh(new THREE.SphereGeometry(.052, 18, 14), inlay), 0, 1.48, -.06);
      addStudCircle(.20, .84, 8, .025, inlay);
    }

    group.scale.setScalar(.77);
    group.userData.type = type;
    return group;
  }

  function makeSquareMarker(THREE, root, x, z, kind, materials, y = .10) {
    let marker;
    if (kind === 'legal') {
      marker = new THREE.Mesh(new THREE.CylinderGeometry(.115, .115, .025, 28), materials.legal);
    } else if (kind === 'capture') {
      marker = new THREE.Mesh(new THREE.TorusGeometry(.38, .038, 10, 36), materials.capture);
      marker.rotation.x = Math.PI / 2;
    } else if (kind === 'check') {
      marker = new THREE.Mesh(new THREE.TorusGeometry(.42, .047, 12, 40), materials.check);
      marker.rotation.x = Math.PI / 2;
    } else if (kind === 'hint') {
      marker = new THREE.Mesh(new THREE.OctahedronGeometry(.12, 1), materials.hint);
      y += .11;
    } else {
      marker = new THREE.Mesh(new THREE.BoxGeometry(.88, .028, .88), materials[kind]);
    }
    marker.position.set(x, y, z);
    marker.userData.markerKind = kind;
    marker.castShadow = false;
    marker.receiveShadow = false;
    root.add(marker);
    return marker;
  }

  function updateThreeCamera() {
    if (!threeBoard) return;
    const { camera, target } = threeBoard;
    const direction = state.flipped ? -1 : 1;
    const zoom = state.focused ? .93 : 1;
    camera.position.set(7.9 * direction * zoom, 10.9 * zoom, 9.7 * direction * zoom);
    camera.fov = state.focused ? 43 : 46;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function buildThreeBoardScenery(THREE, scene, materials) {
    const scenery = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(9.34, .34, 9.34), materials.woodEdge);
    base.position.y = -.30;
    base.receiveShadow = true;
    scenery.add(base);
    const innerBase = new THREE.Mesh(new THREE.BoxGeometry(8.82, .13, 8.82), materials.wood);
    innerBase.position.y = -.075;
    innerBase.receiveShadow = true;
    scenery.add(innerBase);

    const railMaterial = materials.wood;
    const railEdge = materials.frameInlay;
    const rails = [
      { size: [9.05, .25, .43], pos: [0, -.005, -4.32] },
      { size: [9.05, .25, .43], pos: [0, -.005, 4.32] },
      { size: [.43, .25, 8.2], pos: [-4.32, -.005, 0] },
      { size: [.43, .25, 8.2], pos: [4.32, -.005, 0] }
    ];
    rails.forEach(({ size, pos }) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(...size), railMaterial);
      rail.position.set(...pos);
      rail.castShadow = true;
      rail.receiveShadow = true;
      scenery.add(rail);
    });
    const trim = [
      { size: [8.48, .04, .035], pos: [0, .14, -4.08] },
      { size: [8.48, .04, .035], pos: [0, .14, 4.08] },
      { size: [.035, .04, 7.65], pos: [-4.08, .14, 0] },
      { size: [.035, .04, 7.65], pos: [4.08, .14, 0] }
    ];
    trim.forEach(({ size, pos }) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(...size), railEdge);
      line.position.set(...pos);
      scenery.add(line);
    });
    for (const x of [-4.33, 4.33]) for (const z of [-4.33, 4.33]) {
      const corner = new THREE.Mesh(new THREE.CylinderGeometry(.17, .20, .13, 24), materials.frameInlay);
      corner.position.set(x, .14, z);
      corner.castShadow = true;
      scenery.add(corner);
    }
    scene.add(scenery);

    const tiles = new THREE.Group();
    const tileGeometry = new THREE.BoxGeometry(.975, .14, .975);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const tile = new THREE.Mesh(tileGeometry, (row + col) % 2 ? materials.darkTile : materials.lightTile);
        tile.position.set(col - 3.5, .02, row - 3.5);
        tile.receiveShadow = true;
        tiles.add(tile);
      }
    }
    scene.add(tiles);
  }

  function initThreeBoard() {
    if (!window.THREE) return;
    const THREE = window.THREE;
    const canvas = document.getElementById('threeCanvas');
    if (!canvas) return;
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, .1, 35);
      const target = new THREE.Vector3(0, .28, 0);
      const materials = {
        light: new THREE.MeshPhysicalMaterial({ color: 0xf1ecdd, roughness: .20, metalness: .15, clearcoat: .78, clearcoatRoughness: .13 }),
        lightAccent: new THREE.MeshStandardMaterial({ color: 0xb7aa91, roughness: .27, metalness: .48 }),
        dark: new THREE.MeshPhysicalMaterial({ color: 0x1c4039, roughness: .18, metalness: .68, clearcoat: .62, clearcoatRoughness: .12 }),
        darkAccent: new THREE.MeshStandardMaterial({ color: 0x0c2723, roughness: .24, metalness: .75 }),
        inlay: new THREE.MeshPhysicalMaterial({ color: 0xd5a851, roughness: .16, metalness: .9, clearcoat: .45 }),
        darkInlay: new THREE.MeshPhysicalMaterial({ color: 0x5eb69e, roughness: .16, metalness: .86, clearcoat: .4 }),
        lightTile: new THREE.MeshStandardMaterial({ color: 0xd8c19a, roughness: .66, metalness: .04 }),
        darkTile: new THREE.MeshStandardMaterial({ color: 0x46675b, roughness: .52, metalness: .12 }),
        wood: new THREE.MeshPhysicalMaterial({ color: 0x5a351d, roughness: .34, metalness: .06, clearcoat: .26 }),
        woodEdge: new THREE.MeshStandardMaterial({ color: 0x1f1712, roughness: .42, metalness: .18 }),
        frameInlay: new THREE.MeshPhysicalMaterial({ color: 0xd7ac65, roughness: .16, metalness: .82, clearcoat: .36 }),
        selected: new THREE.MeshBasicMaterial({ color: 0xffd16b, transparent: true, opacity: .43, depthWrite: false }),
        last: new THREE.MeshBasicMaterial({ color: 0xe8aa46, transparent: true, opacity: .26, depthWrite: false }),
        legal: new THREE.MeshBasicMaterial({ color: 0x54d2ae, transparent: true, opacity: .8, depthWrite: false }),
        capture: new THREE.MeshBasicMaterial({ color: 0xf17a67, transparent: true, opacity: .86, depthWrite: false }),
        check: new THREE.MeshBasicMaterial({ color: 0xff5149, transparent: true, opacity: .9, depthWrite: false }),
        hint: new THREE.MeshBasicMaterial({ color: 0xffd773, transparent: true, opacity: .95, depthWrite: false })
      };

      scene.add(new THREE.HemisphereLight(0xc6fff2, 0x100d0b, 1.8));
      const key = new THREE.DirectionalLight(0xffdf9f, 3.4);
      key.position.set(-6, 11, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -7;
      key.shadow.camera.right = 7;
      key.shadow.camera.top = 7;
      key.shadow.camera.bottom = -7;
      key.shadow.bias = -.00035;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x43d6b0, 1.75);
      rim.position.set(6, 6, -7);
      scene.add(rim);
      const warmFill = new THREE.PointLight(0xc58a47, 1.15, 16, 2);
      warmFill.position.set(-3, 4, -4);
      scene.add(warmFill);

      buildThreeBoardScenery(THREE, scene, materials);
      const pieceRoot = new THREE.Group();
      const indicatorRoot = new THREE.Group();
      scene.add(pieceRoot, indicatorRoot);
      const templates = {};
      ['w', 'b'].forEach(color => ['p', 'n', 'b', 'r', 'q', 'k'].forEach(type => {
        templates[`${color}${type}`] = createThreePiece(type, color, THREE, materials);
      }));

      threeBoard = { THREE, canvas, renderer, scene, camera, target, materials, pieceRoot, indicatorRoot, templates, raycaster: new THREE.Raycaster(), pointer: new THREE.Vector2(), animationTime: 0 };
      configureThreeColors();
      boardEl.classList.add('three-ready');
      boardStage.classList.add('three-stage');
      canvas.addEventListener('click', handleThreeCanvasClick);
      canvas.addEventListener('pointermove', handleThreeCanvasHover, { passive: true });
      canvas.addEventListener('webglcontextlost', handleWebGLContextLost, false);
      window.addEventListener('resize', () => { if (threeBoard) syncThreeBoard(); }, { passive: true });
      updateThreeCamera();
      animateThreeBoard();
    } catch (error) {
      console.warn('3D renderer could not start; using the illustrated pieces instead.', error);
      threeBoard = null;
      boardEl.classList.remove('three-ready');
      boardStage.classList.remove('three-stage');
    }
  }

  function handleWebGLContextLost(event) {
    event.preventDefault();
    if (threeBoard?.animationFrame) window.cancelAnimationFrame(threeBoard.animationFrame);
    threeBoard = null;
    boardEl.classList.remove('three-ready');
    boardStage.classList.remove('three-stage');
    render();
    showToast('حالت سه‌بعدی در دسترس نیست؛ نسخه‌ی گرافیکی جایگزین فعال شد.');
  }

  function resolveThreeSquare(event) {
    if (!threeBoard) return null;
    const { canvas, camera, raycaster, pointer, THREE } = threeBoard;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const target = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.10), target);
    if (!hit || target.x < -4 || target.x > 4 || target.z < -4 || target.z > 4) return null;
    return { y: Math.min(7, Math.max(0, Math.floor(target.z + 4))), x: Math.min(7, Math.max(0, Math.floor(target.x + 4))) };
  }

  function handleThreeCanvasClick(event) {
    const square = resolveThreeSquare(event);
    if (square) handleSquareTarget(square);
  }

  function handleThreeCanvasHover(event) {
    if (!threeBoard) return;
    const square = resolveThreeSquare(event);
    threeBoard.canvas.style.cursor = square && state.gameStarted && !state.gameOver ? 'pointer' : 'default';
  }

  function animateThreeBoard(timestamp = 0) {
    if (!threeBoard) return;
    const { renderer, scene, camera, indicatorRoot } = threeBoard;
    const time = timestamp * .001;
    indicatorRoot.children.forEach(marker => {
      const kind = marker.userData.markerKind;
      if (kind === 'legal' || kind === 'hint' || kind === 'check') {
        const pulse = 1 + Math.sin(time * 3.2 + marker.position.x) * .11;
        marker.scale.setScalar(pulse);
      }
      if (kind === 'hint') marker.rotation.y += .025;
    });
    renderer.render(scene, camera);
    threeBoard.animationFrame = window.requestAnimationFrame(animateThreeBoard);
  }

  function syncThreeBoard() {
    if (!threeBoard) return;
    const { renderer, canvas, camera, scene, pieceRoot, indicatorRoot, templates, materials, THREE } = threeBoard;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    configureThreeColors();
    updateThreeCamera();
    pieceRoot.clear();
    indicatorRoot.clear();

    if (state.lastMove) {
      makeSquareMarker(THREE, indicatorRoot, state.lastMove.from.x - 3.5, state.lastMove.from.y - 3.5, 'last', materials, .105);
      makeSquareMarker(THREE, indicatorRoot, state.lastMove.to.x - 3.5, state.lastMove.to.y - 3.5, 'last', materials, .106);
    }
    if (state.selected) makeSquareMarker(THREE, indicatorRoot, state.selected.x - 3.5, state.selected.y - 3.5, 'selected', materials, .12);
    state.legalMoves.forEach(move => {
      const occupied = state.board[move.y][move.x] || move.special === 'en-passant';
      makeSquareMarker(THREE, indicatorRoot, move.x - 3.5, move.y - 3.5, occupied ? 'capture' : 'legal', materials, .145);
    });
    if (state.hint) {
      makeSquareMarker(THREE, indicatorRoot, state.hint.from.x - 3.5, state.hint.from.y - 3.5, 'hint', materials, .19);
      makeSquareMarker(THREE, indicatorRoot, state.hint.to.x - 3.5, state.hint.to.y - 3.5, 'hint', materials, .21);
    }

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = state.board[row][col];
        if (!piece) continue;
        const model = templates[`${piece.color}${piece.type}`].clone(true);
        model.position.set(col - 3.5, .10, row - 3.5);
        model.rotation.y = piece.color === 'b' ? Math.PI : 0;
        if (state.lastMove && state.lastMove.to.x === col && state.lastMove.to.y === row) model.position.y += .055;
        pieceRoot.add(model);
        if (piece.type === 'k' && isKingInCheck(piece.color)) {
          makeSquareMarker(THREE, indicatorRoot, col - 3.5, row - 3.5, 'check', materials, .17);
        }
      }
    }
    renderer.render(scene, camera);
  }

  function renderBoard() {
    const threeCanvas = document.getElementById('threeCanvas');
    boardEl.innerHTML = '';
    if (threeCanvas) boardEl.appendChild(threeCanvas);
    const checkedWhite = isKingInCheck('w');
    const checkedBlack = isKingInCheck('b');
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const piece = state.board[y][x];
        const square = document.createElement('button');
        square.type = 'button';
        square.className = `square ${(x + y) % 2 ? 'dark' : 'light'}`;
        square.dataset.y = y;
        square.dataset.x = x;
        square.setAttribute('role', 'gridcell');
        const coordinate = squareName(y, x);
        square.setAttribute('aria-label', piece ? `${coordinate}، ${pieces[piece.type]} ${piece.color === 'w' ? 'سفید' : 'سیاه'}` : `${coordinate}، خانه خالی`);
        if ((y === 7 && x === 0) || (y === 0 && x === 7)) {
          const label = document.createElement('span');
          label.className = 'square-label';
          label.textContent = coordinate;
          square.appendChild(label);
        }
        if (sameSquare(state.selected, { y, x })) square.classList.add('selected');
        const legal = state.legalMoves.find(move => move.y === y && move.x === x);
        if (legal) {
          square.classList.add('legal');
          if (piece || legal.special === 'en-passant') square.classList.add('occupied');
        }
        if (state.lastMove && (sameSquare(state.lastMove.from, { y, x }) || sameSquare(state.lastMove.to, { y, x }))) {
          square.classList.add(sameSquare(state.lastMove.from, { y, x }) ? 'last-from' : 'last-to');
        }
        if (piece?.type === 'k' && ((piece.color === 'w' && checkedWhite) || (piece.color === 'b' && checkedBlack))) square.classList.add('in-check');
        if (state.hint && (sameSquare(state.hint.from, { y, x }) || sameSquare(state.hint.to, { y, x }))) square.classList.add('hinted');
        if (piece && !threeBoard) {
          const model = document.createElement('div');
          model.className = `piece ${piece.color} ${piece.type}${state.lastMove && sameSquare(state.lastMove.to, { y, x }) ? ' moving' : ''}`;
          model.innerHTML = pieceSvg(piece, `${y}${x}`);
          square.appendChild(model);
        }
        boardEl.appendChild(square);
      }
    }
  }

  function renderMoveList() {
    if (!state.moves.length) {
      moveListEl.innerHTML = '<div class="opening-note"><span>♟</span> بازی هنوز شروع نشده است</div>';
      return;
    }
    let html = '';
    for (let i = 0; i < state.moves.length; i += 2) {
      const white = state.moves[i];
      const black = state.moves[i + 1];
      html += `<div class="move-row"><span>${farsiMoveNumber(Math.floor(i / 2) + 1)}.</span><span class="${!black ? 'last' : ''}">${white.notation}</span><span class="${black ? 'last' : ''}">${black?.notation || ''}</span></div>`;
    }
    moveListEl.innerHTML = html;
    moveListEl.scrollTop = moveListEl.scrollHeight;
  }

  function renderCaptured() {
    const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const paintCaptured = (color, elementId, valueId) => {
      const captured = state.capturedBy[color];
      document.getElementById(elementId).innerHTML = captured.map(piece => `<span class="captured-token ${piece.color}">${unicodePieces[piece.color][piece.type]}</span>`).join('');
      document.getElementById(valueId).textContent = `+${captured.reduce((total, piece) => total + values[piece.type], 0)}`;
    };
    paintCaptured('w', 'whiteCaptured', 'whiteCapturedValue');
    paintCaptured('b', 'blackCaptured', 'blackCapturedValue');
  }

  function timeString(total) {
    const minutes = Math.max(0, Math.floor(total / 60));
    const seconds = Math.max(0, total % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function renderClocks() {
    const whiteTime = timeString(state.timers.w);
    const blackTime = timeString(state.timers.b);
    const white = document.getElementById('whiteClock');
    const black = document.getElementById('blackClock');
    white.textContent = whiteTime;
    black.textContent = blackTime;
    document.getElementById('drawerWhiteClock').textContent = whiteTime;
    document.getElementById('drawerBlackClock').textContent = blackTime;
    white.classList.toggle('active', state.gameStarted && !state.gameOver && state.turn === 'w');
    black.classList.toggle('active', state.gameStarted && !state.gameOver && state.turn === 'b');
  }

  function renderStatus() {
    const inCheck = isKingInCheck(state.turn);
    const colorName = state.turn === 'w' ? 'سفید' : 'سیاه';
    const idle = !state.gameStarted;
    document.getElementById('statusText').textContent = state.gameOver ? state.result : (idle ? 'آماده‌ی شروع دوئل' : `بازی دوستانه · نوبت ${colorName}${inCheck ? ' · کیش' : ''}`);
    document.getElementById('turnTitle').textContent = state.gameOver ? 'نبرد تمام شد' : (idle ? 'دوئل آماده است' : `نوبت ${colorName} است`);
    document.getElementById('turnHint').textContent = state.gameOver ? state.resultDescription : (idle ? 'برای آغاز، دکمه‌ی شروع دوئل را بزنید' : (inCheck ? 'شاه در کیش است؛ باید از او محافظت کنید' : `یک مهره‌ی ${colorName} را انتخاب کنید`));
    document.querySelector('.turn-piece').textContent = state.gameOver ? '♔' : unicodePieces[state.turn].p;
    document.getElementById('moveCounter').textContent = `حرکت ${farsiMoveNumber(Math.ceil(state.moves.length / 2))} از ۶۰`;
    document.getElementById('orientationText').textContent = state.flipped ? 'دید سیاه' : 'دید سفید';
    const wStatus = document.getElementById('whiteKingStatus');
    const bStatus = document.getElementById('blackKingStatus');
    const whiteChecked = isKingInCheck('w');
    const blackChecked = isKingInCheck('b');
    wStatus.textContent = whiteChecked ? 'کیش' : 'امن';
    bStatus.textContent = blackChecked ? 'کیش' : 'امن';
    wStatus.className = whiteChecked ? 'warning' : 'safe';
    bStatus.className = blackChecked ? 'warning' : 'safe';
    document.getElementById('lastMoveText').textContent = state.moves.length ? state.moves[state.moves.length - 1].notation : '—';
    document.getElementById('focusLabel').textContent = state.focused ? 'روشن' : 'خاموش';
    document.getElementById('soundLabel').textContent = soundOn ? 'روشن' : 'خاموش';
    document.getElementById('themeLabel').textContent = document.body.classList.contains('alt-light') ? 'کهربایی' : 'زمردی';
    boardStage.classList.toggle('flipped', state.flipped);
    boardStage.classList.toggle('focused', state.focused);
    renderClocks();
  }

  function render() {
    renderBoard();
    syncThreeBoard();
    renderMoveList();
    renderCaptured();
    renderStatus();
  }

  function updateCastlingRights(piece, from, captured, to) {
    const home = piece.color === 'w' ? 7 : 0;
    if (piece.type === 'k') {
      state.castling[`${piece.color}K`] = false;
      state.castling[`${piece.color}Q`] = false;
    }
    if (piece.type === 'r' && from.y === home) {
      if (from.x === 0) state.castling[`${piece.color}Q`] = false;
      if (from.x === 7) state.castling[`${piece.color}K`] = false;
    }
    if (captured?.type === 'r') {
      const capturedHome = captured.color === 'w' ? 7 : 0;
      if (to.y === capturedHome && to.x === 0) state.castling[`${captured.color}Q`] = false;
      if (to.y === capturedHome && to.x === 7) state.castling[`${captured.color}K`] = false;
    }
  }

  function makeNotation(piece, from, move, captured, promotion, suffix) {
    if (move.special === 'castle-kingside') return `O-O${suffix}`;
    if (move.special === 'castle-queenside') return `O-O-O${suffix}`;
    const capture = captured || move.special === 'en-passant';
    const prefix = piece.type === 'p' ? (capture ? files[from.x] : '') : notationPieces[piece.type];
    return `${prefix}${capture ? 'x' : ''}${squareName(move.y, move.x)}${promotion ? `=${notationPieces[promotion]}` : ''}${suffix}`;
  }

  function endGame(title, description) {
    state.gameOver = true;
    state.result = title;
    state.resultDescription = description;
    document.getElementById('endgameTitle').textContent = title;
    document.getElementById('endgameDescription').textContent = description;
    endgameModal.hidden = false;
    renderStatus();
  }

  function completeMove(from, move, promotion = null) {
    const piece = state.board[from.y][from.x];
    if (!piece || state.gameOver) return;
    const target = state.board[move.y][move.x];
    const captured = move.special === 'en-passant' ? state.board[from.y][move.x] : target;
    state.snapshots.push(makeSnapshot());
    state.board = applyMoveToBoard(state.board, from, move, promotion);
    if (captured) state.capturedBy[piece.color].push(captured);
    updateCastlingRights(piece, from, captured, { y: move.y, x: move.x });
    state.enPassant = move.special === 'double-pawn' ? { y: (from.y + move.y) / 2, x: from.x } : null;
    state.lastMove = { from: { ...from }, to: { y: move.y, x: move.x } };
    state.selected = null;
    state.legalMoves = [];
    state.hint = null;
    state.turn = opposite(piece.color);

    const enemyInCheck = isKingInCheck(state.turn);
    const replies = getAllLegalMoves(state.turn);
    let suffix = enemyInCheck ? '+' : '';
    let gameEnd = null;
    if (!replies.length) {
      if (enemyInCheck) {
        suffix = '#';
        gameEnd = {
          title: `شاه‌مات · ${piece.color === 'w' ? 'سفید' : 'سیاه'} پیروز شد`,
          description: `شاه ${piece.color === 'w' ? 'سیاه' : 'سفید'} هیچ خانه‌ی امنی ندارد. یک بازی درخشان بود.`
        };
      } else {
        gameEnd = { title: 'پات · بازی مساوی شد', description: 'بازیکنِ نوبت‌دار حرکتی قانونی ندارد، اما شاه در کیش نیست.' };
      }
    }
    const notation = makeNotation(piece, from, move, captured, promotion, suffix);
    state.moves.push({ notation, color: piece.color });
    playMoveSound(captured ? 'capture' : 'move');
    render();
    if (gameEnd) endGame(gameEnd.title, gameEnd.description);
  }

  function beginMove(from, move) {
    const piece = state.board[from.y][from.x];
    if (piece?.type === 'p' && (move.y === 0 || move.y === 7)) {
      state.pendingPromotion = { from: { ...from }, move };
      promotionChoices.innerHTML = ['q', 'r', 'b', 'n'].map(type => `<button type="button" data-promotion="${type}" aria-label="تبدیل به ${pieces[type]}">${unicodePieces[piece.color][type]}</button>`).join('');
      promotionModal.hidden = false;
      return;
    }
    completeMove(from, move);
  }

  function handleSquareTarget(target) {
    if (!target || !state.gameStarted || state.gameOver || state.pendingPromotion) return;
    const selectedMove = state.legalMoves.find(move => move.y === target.y && move.x === target.x);
    if (state.selected && selectedMove) {
      beginMove(state.selected, selectedMove);
      return;
    }
    const piece = state.board[target.y][target.x];
    if (piece?.color === state.turn) {
      state.selected = target;
      state.legalMoves = getLegalMoves(target);
      state.hint = null;
      render();
      if (!state.legalMoves.length) showToast('این مهره در حال حاضر حرکت قانونی ندارد.');
      return;
    }
    if (state.selected) {
      state.selected = null;
      state.legalMoves = [];
      render();
    } else if (piece) showToast(`نوبت مهره‌های ${state.turn === 'w' ? 'سفید' : 'سیاه'} است.`);
  }

  function handleSquareClick(event) {
    const square = event.target.closest('.square');
    if (!square) return;
    handleSquareTarget({ y: Number(square.dataset.y), x: Number(square.dataset.x) });
  }

  function undoMove() {
    if (!state.gameStarted || !state.snapshots.length || state.pendingPromotion) {
      showToast('حرکتی برای بازگشت وجود ندارد.');
      return;
    }
    restoreSnapshot(state.snapshots.pop());
    endgameModal.hidden = true;
    render();
    showToast('آخرین حرکت بازگردانده شد.');
  }

  function newGame() {
    resetState();
    state.gameStarted = true;
    promotionModal.hidden = true;
    endgameModal.hidden = true;
    closeGameMenu();
    render();
    showToast('بازی تازه آماده است؛ سفید آغاز می‌کند.');
  }

  function resignGame() {
    if (!state.gameStarted || state.gameOver) return;
    const winner = state.turn === 'w' ? 'سیاه' : 'سفید';
    endGame(`تسلیم · ${winner} پیروز شد`, `بازیکن ${state.turn === 'w' ? 'سفید' : 'سیاه'} بازی را واگذار کرد.`);
    closeGameMenu();
    render();
  }

  function giveHint() {
    if (!state.gameStarted || state.gameOver) return;
    const moves = getAllLegalMoves(state.turn);
    if (!moves.length) return;
    const central = moves.filter(({ move }) => move.x >= 2 && move.x <= 5 && move.y >= 2 && move.y <= 5);
    const suggestion = (central.length ? central : moves)[Math.floor(Math.random() * (central.length ? central.length : moves.length))];
    state.hint = { from: suggestion.from, to: { y: suggestion.move.y, x: suggestion.move.x } };
    const tip = coachTips[Math.floor(Math.random() * coachTips.length)];
    document.getElementById('coachText').textContent = `پیشنهاد: ${squareName(suggestion.from.y, suggestion.from.x)} به ${squareName(suggestion.move.y, suggestion.move.x)}. ${tip}`;
    render();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  function pgnText() {
    const rows = [];
    for (let i = 0; i < state.moves.length; i += 2) rows.push(`${Math.floor(i / 2) + 1}. ${state.moves[i].notation}${state.moves[i + 1] ? ` ${state.moves[i + 1].notation}` : ''}`);
    return `[Event "Shahmat Local Match"]\n[Date "2026.07.30"]\n\n${rows.join(' ')}`;
  }

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(pgnText());
      showToast('PGN بازی در کلیپ‌بورد کپی شد.');
    } catch {
      showToast('مرورگر اجازه‌ی کپی نداد؛ از اتصال امن یا مرورگر دیگر استفاده کنید.');
    }
  }

  function playMoveSound(kind) {
    if (!soundOn || !window.AudioContext && !window.webkitAudioContext) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = kind === 'capture' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(kind === 'capture' ? 175 : 310, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'capture' ? 85 : 245, audioContext.currentTime + .11);
      gain.gain.setValueAtTime(.045, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .13);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + .14);
    } catch { /* Sound is an optional enhancement. */ }
  }

  function openGameMenu() {
    gameMenu.classList.add('is-open');
    menuScrim.classList.add('is-open');
    gameMenu.setAttribute('aria-hidden', 'false');
    menuToggle.setAttribute('aria-expanded', 'true');
    menuToggle.classList.add('active');
  }

  function closeGameMenu() {
    gameMenu.classList.remove('is-open');
    menuScrim.classList.remove('is-open');
    gameMenu.setAttribute('aria-hidden', 'true');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.classList.remove('active');
  }

  function openMainMenu() {
    closeGameMenu();
    mainMenu.classList.remove('is-hidden');
    document.body.classList.add('menu-open');
    const startLabel = document.getElementById('startGameText');
    const startSubline = document.querySelector('#startGameButton small');
    if (state.gameOver) {
      startLabel.textContent = 'شروع بازی تازه';
      startSubline.textContent = 'چیدمان جدید · ساعت تازه';
    } else if (state.gameStarted) {
      startLabel.textContent = 'ادامه‌ی دوئل';
      startSubline.textContent = 'بازی تا بازگشت شما متوقف است';
    } else {
      startLabel.textContent = 'شروع دوئل';
      startSubline.textContent = 'دو بازیکن · یک دستگاه';
    }
  }

  function startGame() {
    if (state.gameOver) {
      resetState();
      endgameModal.hidden = true;
    }
    state.gameStarted = true;
    mainMenu.classList.add('is-hidden');
    document.body.classList.remove('menu-open');
    render();
    showToast('دوئل آغاز شد؛ نوبت مهره‌های سفید است.');
  }

  function flipThreeView() {
    if (!state.gameStarted) return;
    state.flipped = !state.flipped;
    syncThreeBoard();
    renderStatus();
  }

  function toggleFocusMode() {
    if (!state.gameStarted) return;
    state.focused = !state.focused;
    syncThreeBoard();
    renderStatus();
  }

  function toggleTheme() {
    document.body.classList.toggle('alt-light');
    syncThreeBoard();
    renderStatus();
    showToast(document.body.classList.contains('alt-light') ? 'نور کهربایی فعال شد.' : 'نور زمردی فعال شد.');
  }

  function toggleSound() {
    soundOn = !soundOn;
    renderStatus();
    showToast(soundOn ? 'صدای حرکت روشن شد.' : 'صدای حرکت خاموش شد.');
  }

  function tickClock() {
    if (!state.gameStarted || document.body.classList.contains('menu-open') || state.gameOver || state.pendingPromotion) return;
    state.timers[state.turn] -= 1;
    if (state.timers[state.turn] <= 0) {
      state.timers[state.turn] = 0;
      const winner = opposite(state.turn);
      endGame('زمان تمام شد', `زمان بازیکن ${state.turn === 'w' ? 'سفید' : 'سیاه'} به پایان رسید؛ ${winner === 'w' ? 'سفید' : 'سیاه'} برنده شد.`);
      render();
      return;
    }
    renderClocks();
  }

  function wireControls() {
    boardEl.addEventListener('click', handleSquareClick);
    document.getElementById('startGameButton').addEventListener('click', startGame);
    document.getElementById('mainGuideButton').addEventListener('click', () => {
      const guide = document.getElementById('mainGuide');
      guide.hidden = !guide.hidden;
    });
    document.getElementById('brandHome').addEventListener('click', event => { event.preventDefault(); openMainMenu(); });
    menuToggle.addEventListener('click', () => gameMenu.classList.contains('is-open') ? closeGameMenu() : openGameMenu());
    document.getElementById('menuClose').addEventListener('click', closeGameMenu);
    menuScrim.addEventListener('click', closeGameMenu);

    const closeAfter = action => () => { action(); closeGameMenu(); };
    document.getElementById('menuUndo').addEventListener('click', closeAfter(undoMove));
    document.getElementById('menuHint').addEventListener('click', closeAfter(giveHint));
    document.getElementById('menuFlip').addEventListener('click', closeAfter(flipThreeView));
    document.getElementById('menuFocus').addEventListener('click', closeAfter(toggleFocusMode));
    document.getElementById('menuTheme').addEventListener('click', toggleTheme);
    document.getElementById('menuSound').addEventListener('click', toggleSound);
    document.getElementById('menuCopyPgn').addEventListener('click', copyPgn);
    document.getElementById('menuNewGame').addEventListener('click', newGame);
    document.getElementById('menuHome').addEventListener('click', openMainMenu);
    document.getElementById('menuResign').addEventListener('click', resignGame);
    document.getElementById('modalNewGame').addEventListener('click', newGame);

    document.getElementById('closePromotion').addEventListener('click', () => {
      state.pendingPromotion = null;
      promotionModal.hidden = true;
      showToast('برای ارتقا، دوباره مقصد پیاده را انتخاب کنید.');
    });
    promotionChoices.addEventListener('click', event => {
      const button = event.target.closest('[data-promotion]');
      if (!button || !state.pendingPromotion) return;
      const pending = state.pendingPromotion;
      state.pendingPromotion = null;
      promotionModal.hidden = true;
      completeMove(pending.from, pending.move, button.dataset.promotion);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!promotionModal.hidden) {
          state.pendingPromotion = null;
          promotionModal.hidden = true;
        } else if (gameMenu.classList.contains('is-open')) {
          closeGameMenu();
        } else if (state.selected) {
          state.selected = null;
          state.legalMoves = [];
          render();
        }
      }
      if (event.key.toLowerCase() === 'f' && !event.metaKey && !event.ctrlKey && state.gameStarted) {
        flipThreeView();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoMove();
      }
    });
  }

  resetState();
  initThreeBoard();
  wireControls();
  render();
  window.setInterval(tickClock, 1000);

})();
