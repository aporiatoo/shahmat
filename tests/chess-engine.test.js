/*
 * Dependency-free regression tests for Shahmat's chess rules.
 * Run from the repository root with: node tests/chess-engine.test.js
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appPath = path.join(__dirname, '..', 'app.js');
let source = fs.readFileSync(appPath, 'utf8');
const bootSequence = `  resetState();
  restorePersistedGame();
  initThreeBoard();
  wireControls();
  render();
  if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.setInterval(tickClock, 1000);

})();`;
const testExports = `  resetState();
  globalThis.__shahmatTest = {
    resetState,
    getState: () => state,
    makePiece,
    getLegalMoves,
    getAllLegalMoves,
    isKingInCheck,
    isSquareAttacked,
    pseudoMoves,
    applyMoveToBoard,
    toFen,
    loadFen,
    hasInsufficientMaterial,
    positionKey,
    persistGame,
    restorePersistedGame
  };
})();`;

assert.ok(source.includes(bootSequence), 'The test harness needs the expected application boot sequence.');
source = source.replace(bootSequence, testExports);

const noop = () => {};
const fakeElement = {
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop,
  setAttribute: noop,
  appendChild: noop,
  querySelector: () => fakeElement,
  closest: () => null,
  style: {},
  innerHTML: '',
  hidden: false
};
const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
const context = {
  console,
  localStorage,
  document: {
    getElementById: () => fakeElement,
    querySelector: () => fakeElement,
    addEventListener: noop,
    body: { classList: { contains: () => false, add: noop, remove: noop, toggle: noop } }
  },
  window: { setInterval: noop, requestAnimationFrame: noop, cancelAnimationFrame: noop },
  navigator: { clipboard: { writeText: async () => {} } },
  setTimeout: noop,
  clearTimeout: noop,
  performance: { now: () => 0 }
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: 'app.js' });
const chess = context.__shahmatTest;

function emptyPosition(turn = 'w') {
  const state = chess.getState();
  state.board = Array.from({ length: 8 }, () => Array(8).fill(null));
  state.turn = turn;
  state.selected = null;
  state.legalMoves = [];
  state.lastMove = null;
  state.castling = { wK: false, wQ: false, bK: false, bQ: false };
  state.enPassant = null;
  state.gameOver = false;
  state.halfmoveClock = 0;
  state.fullmoveNumber = 1;
  state.positionHistory = [];
  return state;
}

function place(type, color, y, x) {
  chess.getState().board[y][x] = chess.makePiece(type, color);
}

function hasMove(moves, y, x, special = undefined) {
  return moves.some(move => move.y === y && move.x === x && (special === undefined || move.special === special));
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test('initial position has exactly 20 legal white moves', () => {
  chess.resetState();
  assert.equal(chess.getAllLegalMoves('w').length, 20);
  assert.equal(chess.getAllLegalMoves('b').length, 20);
});

test('initial e-pawn can advance one or two squares', () => {
  chess.resetState();
  const moves = chess.getLegalMoves({ y: 6, x: 4 });
  assert.ok(hasMove(moves, 5, 4));
  assert.ok(hasMove(moves, 4, 4, 'double-pawn'));
});

test('a blocked pawn cannot advance through a piece', () => {
  chess.resetState();
  chess.getState().board[5][4] = chess.makePiece('n', 'w');
  assert.equal(chess.getLegalMoves({ y: 6, x: 4 }).length, 0);
});

test('a knight jumps over surrounding pieces', () => {
  chess.resetState();
  const moves = chess.getLegalMoves({ y: 7, x: 1 });
  assert.ok(hasMove(moves, 5, 0));
  assert.ok(hasMove(moves, 5, 2));
});

test('a sliding piece cannot jump over a blocker', () => {
  chess.resetState();
  assert.equal(chess.getLegalMoves({ y: 7, x: 0 }).length, 0);
});

test('a pinned piece cannot expose its king', () => {
  emptyPosition();
  place('k', 'w', 7, 4); // White king e1
  place('r', 'w', 6, 4); // White rook e2
  place('r', 'b', 0, 4); // Black rook e8
  place('k', 'b', 0, 0); // Black king a8
  const moves = chess.getLegalMoves({ y: 6, x: 4 });
  assert.equal(hasMove(moves, 6, 3), false);
  assert.ok(hasMove(moves, 5, 4));
});

test('king cannot move into an attacked square', () => {
  emptyPosition();
  place('k', 'w', 7, 4);
  place('r', 'b', 0, 4);
  place('k', 'b', 0, 0);
  const moves = chess.getLegalMoves({ y: 7, x: 4 });
  assert.equal(hasMove(moves, 6, 4), false);
});

test('king cannot move next to the opposing king', () => {
  emptyPosition();
  place('k', 'w', 7, 4);
  place('k', 'b', 5, 4);
  assert.equal(hasMove(chess.getLegalMoves({ y: 7, x: 4 }), 6, 4), false);
});

test('kingside castling is legal on a clear, safe path', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('r', 'w', 7, 7);
  place('k', 'b', 0, 0);
  state.castling.wK = true;
  assert.ok(hasMove(chess.getLegalMoves({ y: 7, x: 4 }), 7, 6, 'castle-kingside'));
});

test('queenside castling is legal on a clear, safe path', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('r', 'w', 7, 0);
  place('k', 'b', 0, 7);
  state.castling.wQ = true;
  assert.ok(hasMove(chess.getLegalMoves({ y: 7, x: 4 }), 7, 2, 'castle-queenside'));
});

test('castling is rejected while the king is checked', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('r', 'w', 7, 7);
  place('r', 'b', 0, 4);
  place('k', 'b', 0, 0);
  state.castling.wK = true;
  assert.equal(hasMove(chess.getLegalMoves({ y: 7, x: 4 }), 7, 6, 'castle-kingside'), false);
});

test('castling is rejected when its passing square is attacked', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('r', 'w', 7, 7);
  place('r', 'b', 0, 5); // Attacks f1
  place('k', 'b', 0, 0);
  state.castling.wK = true;
  assert.equal(hasMove(chess.getLegalMoves({ y: 7, x: 4 }), 7, 6, 'castle-kingside'), false);
});

test('castling moves both king and rook on the simulated board', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('r', 'w', 7, 7);
  place('k', 'b', 0, 0);
  state.castling.wK = true;
  const castle = chess.getLegalMoves({ y: 7, x: 4 }).find(move => move.special === 'castle-kingside');
  const boardAfter = chess.applyMoveToBoard(state.board, { y: 7, x: 4 }, castle);
  assert.equal(boardAfter[7][6].type, 'k');
  assert.equal(boardAfter[7][5].type, 'r');
  assert.equal(boardAfter[7][7], null);
});

test('en passant is offered after an adjacent double-pawn advance', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('k', 'b', 0, 4);
  place('p', 'w', 3, 4); // White pawn e5
  place('p', 'b', 3, 3); // Black pawn d5
  state.enPassant = { y: 2, x: 3 };
  assert.ok(hasMove(chess.getLegalMoves({ y: 3, x: 4 }), 2, 3, 'en-passant'));
});

test('en passant removes the passed pawn on the simulated board', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('k', 'b', 0, 4);
  place('p', 'w', 3, 4);
  place('p', 'b', 3, 3);
  state.enPassant = { y: 2, x: 3 };
  const move = chess.getLegalMoves({ y: 3, x: 4 }).find(item => item.special === 'en-passant');
  const boardAfter = chess.applyMoveToBoard(state.board, { y: 3, x: 4 }, move);
  assert.equal(boardAfter[2][3].type, 'p');
  assert.equal(boardAfter[3][3], null);
});

test('en passant is rejected when it exposes the moving side king', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('k', 'b', 0, 0);
  place('r', 'b', 0, 4);
  place('p', 'w', 3, 4);
  place('p', 'b', 3, 3);
  state.enPassant = { y: 2, x: 3 };
  assert.equal(hasMove(chess.getLegalMoves({ y: 3, x: 4 }), 2, 3, 'en-passant'), false);
});

test('a king is checked but never offered as a capturable target to a queen', () => {
  emptyPosition();
  place('k', 'w', 7, 0);
  place('q', 'w', 1, 4); // White queen e7
  place('k', 'b', 0, 4); // Black king e8
  assert.equal(chess.isKingInCheck('b'), true);
  assert.equal(hasMove(chess.getLegalMoves({ y: 1, x: 4 }), 0, 4), false);
});

test('a king is never offered as a capturable target to a rook, bishop, knight or pawn', () => {
  const cases = [
    { attacker: 'r', from: [1, 4], king: [0, 4] },
    { attacker: 'b', from: [2, 2], king: [0, 4] },
    { attacker: 'n', from: [2, 3], king: [0, 4] },
    { attacker: 'p', from: [1, 3], king: [0, 4] }
  ];
  cases.forEach(({ attacker, from, king }) => {
    emptyPosition();
    place('k', 'w', 7, 0);
    place(attacker, 'w', from[0], from[1]);
    place('k', 'b', king[0], king[1]);
    assert.equal(hasMove(chess.getLegalMoves({ y: from[0], x: from[1] }), king[0], king[1]), false, attacker);
  });
});

test('a pawn can legally reach its promotion rank and change type in simulation', () => {
  const state = emptyPosition();
  place('k', 'w', 7, 4);
  place('k', 'b', 0, 4);
  place('p', 'w', 1, 0);
  const move = chess.getLegalMoves({ y: 1, x: 0 }).find(item => item.y === 0 && item.x === 0);
  assert.ok(move);
  const boardAfter = chess.applyMoveToBoard(state.board, { y: 1, x: 0 }, move, 'q');
  assert.equal(boardAfter[0][0].type, 'q');
});

test('black pawns mirror white pawn movement', () => {
  chess.resetState();
  const moves = chess.getLegalMoves({ y: 1, x: 4 });
  assert.ok(hasMove(moves, 2, 4));
  assert.ok(hasMove(moves, 3, 4, 'double-pawn'));
});

test('a textbook stalemate has no legal move while the black king is not checked', () => {
  emptyPosition('b');
  place('k', 'b', 0, 0); // a8
  place('k', 'w', 2, 2); // c6
  place('q', 'w', 1, 2); // c7
  assert.equal(chess.isKingInCheck('b'), false);
  assert.equal(chess.getAllLegalMoves('b').length, 0);
});

test('a textbook corner checkmate has no legal reply', () => {
  emptyPosition('b');
  place('k', 'b', 0, 0); // a8
  place('k', 'w', 2, 2); // c6
  place('q', 'w', 1, 1); // b7
  assert.equal(chess.isKingInCheck('b'), true);
  assert.equal(chess.getAllLegalMoves('b').length, 0);
});

test('FEN serialisation preserves the initial board and counters', () => {
  chess.resetState();
  assert.equal(chess.toFen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('FEN loading restores board, turn, castling and en passant', () => {
  chess.resetState();
  chess.loadFen('r3k2r/ppp2ppp/2n1bn2/3qp3/3P4/2N1PN2/PPP2PPP/R3K2R b KQkq d3 7 12');
  const state = chess.getState();
  assert.equal(state.turn, 'b');
  assert.equal(state.board[0][4].type, 'k');
  assert.equal(state.board[7][4].color, 'w');
  assert.equal(state.castling.bQ, true);
  assert.equal(state.enPassant.x, 3);
  assert.equal(state.enPassant.y, 5);
  assert.equal(state.halfmoveClock, 7);
  assert.equal(state.fullmoveNumber, 12);
});

test('local persistence restores a paused resumable solo game with settings', () => {
  chess.resetState();
  const before = chess.getState();
  before.timers = { w: 543, b: 411 };
  before.mode = 'bot';
  before.botColor = 'b';
  before.flipped = true;
  before.focused = true;
  before.gameStarted = true;
  before.resumable = true;
  chess.persistGame();
  chess.resetState();
  assert.equal(chess.restorePersistedGame(), true);
  const after = chess.getState();
  assert.equal(after.timers.w, 543);
  assert.equal(after.timers.b, 411);
  assert.equal(after.mode, 'bot');
  assert.equal(after.flipped, false);
  assert.equal(after.focused, true);
  assert.equal(after.gameStarted, false);
  assert.equal(after.resumable, true);
});

test('invalid FEN input is rejected without silently changing position', () => {
  chess.resetState();
  assert.throws(() => chess.loadFen('not a valid FEN'));
  assert.equal(chess.toFen(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('insufficient material detects bare kings and a single minor piece', () => {
  emptyPosition();
  place('k', 'w', 7, 4);
  place('k', 'b', 0, 4);
  assert.equal(chess.hasInsufficientMaterial(), true);
  place('n', 'w', 5, 2);
  assert.equal(chess.hasInsufficientMaterial(), true);
  place('p', 'b', 1, 0);
  assert.equal(chess.hasInsufficientMaterial(), false);
});

console.log('\nAll chess-engine regression tests passed.');
