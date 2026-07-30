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
            if (target.color !== piece.color) moves.push({ y: targetY, x: targetX, special: null });
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

  function renderBoard() {
    boardEl.innerHTML = '';
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
        if (piece) {
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

  function handleSquareClick(event) {
    const square = event.target.closest('.square');
    if (!square || !state.gameStarted || state.gameOver || state.pendingPromotion) return;
    const target = { y: Number(square.dataset.y), x: Number(square.dataset.x) };
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

  function toggleTheme() {
    document.body.classList.toggle('alt-light');
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
    document.getElementById('menuFlip').addEventListener('click', closeAfter(() => { if (state.gameStarted) { state.flipped = !state.flipped; renderStatus(); } }));
    document.getElementById('menuFocus').addEventListener('click', closeAfter(() => { if (state.gameStarted) { state.focused = !state.focused; renderStatus(); } }));
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
        state.flipped = !state.flipped;
        renderStatus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoMove();
      }
    });
  }

  resetState();
  wireControls();
  render();
  window.setInterval(tickClock, 1000);

})();
