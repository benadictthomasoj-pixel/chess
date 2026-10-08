// Test Chess Engine Logic
class ChessEngine {
  constructor() {
    this.init();
  }

  init() {
    // 0 = a8, 7 = h8, 56 = a1, 63 = h1
    this.board = new Array(64).fill(null);
    this.turn = 'w';
    this.castling = { wK: true, wQ: true, bK: true, bQ: true };
    this.enPassant = null; // square index or null
    this.halfMoves = 0;
    this.fullMoves = 1;
    this.history = []; // stack of states for undo
    this.moveLog = []; // { san, from, to, piece, captured, promo }
    this.positionCounts = {};

    this.setupStartingPosition();
    this.recordPosition();
  }

  setupStartingPosition() {
    const piecesOrder = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
      this.board[c] = { type: piecesOrder[c], color: 'b' };
      this.board[8 + c] = { type: 'p', color: 'b' };
      this.board[48 + c] = { type: 'p', color: 'w' };
      this.board[56 + c] = { type: piecesOrder[c], color: 'w' };
    }
  }

  static squareToAlgebraic(sq) {
    const file = String.fromCharCode('a'.charCodeAt(0) + (sq % 8));
    const rank = 8 - Math.floor(sq / 8);
    return `${file}${rank}`;
  }

  static algebraicToSquare(alg) {
    const file = alg.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(alg[1], 10);
    return (8 - rank) * 8 + file;
  }

  getPositionKey() {
    let key = '';
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      key += p ? `${p.color}${p.type}` : '.';
    }
    key += `|${this.turn}|`;
    key += `${this.castling.wK ? 'K' : ''}${this.castling.wQ ? 'Q' : ''}${this.castling.bK ? 'k' : ''}${this.castling.bQ ? 'q' : ''}|`;
    key += this.enPassant !== null ? this.enPassant : '-';
    return key;
  }

  recordPosition() {
    const key = this.getPositionKey();
    this.positionCounts[key] = (this.positionCounts[key] || 0) + 1;
  }

  cloneState() {
    return {
      board: this.board.map(p => (p ? { ...p } : null)),
      turn: this.turn,
      castling: { ...this.castling },
      enPassant: this.enPassant,
      halfMoves: this.halfMoves,
      fullMoves: this.fullMoves
    };
  }

  isSquareAttacked(sq, byColor, board = this.board) {
    const row = Math.floor(sq / 8);
    const col = sq % 8;

    // 1. Pawn attacks
    const pawnRowDelta = byColor === 'w' ? 1 : -1; // White pawn attacks from row + 1, Black pawn from row - 1
    const pRow = row + pawnRowDelta;
    if (pRow >= 0 && pRow < 8) {
      if (col > 0) {
        const p1 = board[pRow * 8 + (col - 1)];
        if (p1 && p1.color === byColor && p1.type === 'p') return true;
      }
      if (col < 7) {
        const p2 = board[pRow * 8 + (col + 1)];
        if (p2 && p2.color === byColor && p2.type === 'p') return true;
      }
    }

    // 2. Knight attacks
    const knightOffsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1]
    ];
    for (const [dr, dc] of knightOffsets) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = board[nr * 8 + nc];
        if (p && p.color === byColor && p.type === 'n') return true;
      }
    }

    // 3. Bishop / Queen (diagonals)
    const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diagDirs) {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = board[r * 8 + c];
        if (p) {
          if (p.color === byColor && (p.type === 'b' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // 4. Rook / Queen (orthogonals)
    const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of orthoDirs) {
      let r = row + dr;
      let c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        const p = board[r * 8 + c];
        if (p) {
          if (p.color === byColor && (p.type === 'r' || p.type === 'q')) return true;
          break;
        }
        r += dr;
        c += dc;
      }
    }

    // 5. King
    const kingDirs = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    for (const [dr, dc] of kingDirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = board[nr * 8 + nc];
        if (p && p.color === byColor && p.type === 'k') return true;
      }
    }

    return false;
  }

  findKing(color, board = this.board) {
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (p && p.color === color && p.type === 'k') return i;
    }
    return -1;
  }

  isKingInCheck(color, board = this.board) {
    const kingSq = this.findKing(color, board);
    if (kingSq === -1) return false;
    const opponent = color === 'w' ? 'b' : 'w';
    return this.isSquareAttacked(kingSq, opponent, board);
  }

  getPseudoLegalMoves(color = this.turn) {
    const moves = [];
    const board = this.board;
    const opp = color === 'w' ? 'b' : 'w';

    for (let sq = 0; sq < 64; sq++) {
      const p = board[sq];
      if (!p || p.color !== color) continue;

      const row = Math.floor(sq / 8);
      const col = sq % 8;

      if (p.type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;

        // 1 step forward
        const forwardSq = (row + dir) * 8 + col;
        if (forwardSq >= 0 && forwardSq < 64 && !board[forwardSq]) {
          if (row + dir === promoRow) {
            ['q', 'r', 'b', 'n'].forEach(promo => {
              moves.push({ from: sq, to: forwardSq, piece: p, promo });
            });
          } else {
            moves.push({ from: sq, to: forwardSq, piece: p });
          }

          // 2 steps forward
          if (row === startRow) {
            const doubleSq = (row + 2 * dir) * 8 + col;
            if (!board[doubleSq]) {
              moves.push({ from: sq, to: doubleSq, piece: p, isDoublePawn: true });
            }
          }
        }

        // Captures
        for (const dc of [-1, 1]) {
          const capCol = col + dc;
          const capRow = row + dir;
          if (capCol >= 0 && capCol < 8 && capRow >= 0 && capRow < 8) {
            const capSq = capRow * 8 + capCol;
            const targetPiece = board[capSq];
            if (targetPiece && targetPiece.color === opp) {
              if (capRow === promoRow) {
                ['q', 'r', 'b', 'n'].forEach(promo => {
                  moves.push({ from: sq, to: capSq, piece: p, captured: targetPiece, promo });
                });
              } else {
                moves.push({ from: sq, to: capSq, piece: p, captured: targetPiece });
              }
            } else if (capSq === this.enPassant) {
              // En passant capture
              const epPawnSq = sq + dc; // adjacent square where opponent pawn sits
              const epPawn = board[epPawnSq];
              if (epPawn && epPawn.color === opp && epPawn.type === 'p') {
                moves.push({ from: sq, to: capSq, piece: p, captured: epPawn, isEnPassant: true, epPawnSq });
              }
            }
          }
        }
      } else if (p.type === 'n') {
        const offsets = [
          [-2, -1], [-2, 1], [-1, -2], [-1, 2],
          [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        for (const [dr, dc] of offsets) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const destSq = nr * 8 + nc;
            const destPiece = board[destSq];
            if (!destPiece) {
              moves.push({ from: sq, to: destSq, piece: p });
            } else if (destPiece.color === opp) {
              moves.push({ from: sq, to: destSq, piece: p, captured: destPiece });
            }
          }
        }
      } else if (p.type === 'b' || p.type === 'r' || p.type === 'q') {
        const dirs = [];
        if (p.type === 'b' || p.type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
        if (p.type === 'r' || p.type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);

        for (const [dr, dc] of dirs) {
          let r = row + dr;
          let c = col + dc;
          while (r >= 0 && r < 8 && c >= 0 && c < 8) {
            const destSq = r * 8 + c;
            const destPiece = board[destSq];
            if (!destPiece) {
              moves.push({ from: sq, to: destSq, piece: p });
            } else {
              if (destPiece.color === opp) {
                moves.push({ from: sq, to: destSq, piece: p, captured: destPiece });
              }
              break;
            }
            r += dr;
            c += dc;
          }
        }
      } else if (p.type === 'k') {
        const dirs = [
          [-1, -1], [-1, 0], [-1, 1],
          [0, -1],           [0, 1],
          [1, -1],  [1, 0],  [1, 1]
        ];
        for (const [dr, dc] of dirs) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            const destSq = nr * 8 + nc;
            const destPiece = board[destSq];
            if (!destPiece) {
              moves.push({ from: sq, to: destSq, piece: p });
            } else if (destPiece.color === opp) {
              moves.push({ from: sq, to: destSq, piece: p, captured: destPiece });
            }
          }
        }

        // Castling
        if (color === 'w' && sq === 60) {
          // White Kingside: e1(60) -> g1(62), rook at h1(63) -> f1(61)
          if (this.castling.wK && !board[61] && !board[62] && board[63]?.type === 'r' && board[63]?.color === 'w') {
            if (!this.isSquareAttacked(60, 'b') && !this.isSquareAttacked(61, 'b') && !this.isSquareAttacked(62, 'b')) {
              moves.push({ from: 60, to: 62, piece: p, isCastling: 'K' });
            }
          }
          // White Queenside: e1(60) -> c1(58), rook at a1(56) -> d1(59)
          if (this.castling.wQ && !board[59] && !board[58] && !board[57] && board[56]?.type === 'r' && board[56]?.color === 'w') {
            if (!this.isSquareAttacked(60, 'b') && !this.isSquareAttacked(59, 'b') && !this.isSquareAttacked(58, 'b')) {
              moves.push({ from: 60, to: 58, piece: p, isCastling: 'Q' });
            }
          }
        } else if (color === 'b' && sq === 4) {
          // Black Kingside: e8(4) -> g8(6), rook at h8(7) -> f8(5)
          if (this.castling.bK && !board[5] && !board[6] && board[7]?.type === 'r' && board[7]?.color === 'b') {
            if (!this.isSquareAttacked(4, 'w') && !this.isSquareAttacked(5, 'w') && !this.isSquareAttacked(6, 'w')) {
              moves.push({ from: 4, to: 6, piece: p, isCastling: 'k' });
            }
          }
          // Black Queenside: e8(4) -> c8(2), rook at a8(0) -> d8(3)
          if (this.castling.bQ && !board[3] && !board[2] && !board[1] && board[0]?.type === 'r' && board[0]?.color === 'b') {
            if (!this.isSquareAttacked(4, 'w') && !this.isSquareAttacked(3, 'w') && !this.isSquareAttacked(2, 'w')) {
              moves.push({ from: 4, to: 2, piece: p, isCastling: 'q' });
            }
          }
        }
      }
    }

    return moves;
  }

  isMoveLegal(move, color = this.turn) {
    // Clone board and apply move
    const testBoard = this.board.map(p => (p ? { ...p } : null));

    if (move.isCastling) {
      // Castling legality checks were already done in pseudoLegal for intermediate square attacks,
      // but ensure king does not end in check (covered by finding king after move).
      testBoard[move.to] = move.piece;
      testBoard[move.from] = null;
      if (move.isCastling === 'K') { testBoard[61] = testBoard[63]; testBoard[63] = null; }
      else if (move.isCastling === 'Q') { testBoard[59] = testBoard[56]; testBoard[56] = null; }
      else if (move.isCastling === 'k') { testBoard[5] = testBoard[7]; testBoard[7] = null; }
      else if (move.isCastling === 'q') { testBoard[3] = testBoard[0]; testBoard[0] = null; }
    } else if (move.isEnPassant) {
      testBoard[move.to] = move.piece;
      testBoard[move.from] = null;
      testBoard[move.epPawnSq] = null; // remove captured pawn
    } else {
      testBoard[move.to] = move.promo ? { type: move.promo, color: move.piece.color } : move.piece;
      testBoard[move.from] = null;
    }

    return !this.isKingInCheck(color, testBoard);
  }

  getLegalMoves(fromSq = null) {
    const pseudo = this.getPseudoLegalMoves(this.turn);
    const legal = pseudo.filter(m => this.isMoveLegal(m, this.turn));
    if (fromSq !== null) {
      return legal.filter(m => m.from === fromSq);
    }
    return legal;
  }

  makeMove(move) {
    // Save history for undo
    this.history.push({
      board: this.board.map(p => (p ? { ...p } : null)),
      turn: this.turn,
      castling: { ...this.castling },
      enPassant: this.enPassant,
      halfMoves: this.halfMoves,
      fullMoves: this.fullMoves,
      moveLogItem: null
    });

    // Generate SAN before state mutations that affect disambiguation or check indicators
    const san = this.generateSAN(move);

    // Apply move to board
    const movedPiece = this.board[move.from];
    this.board[move.from] = null;

    if (move.isCastling) {
      this.board[move.to] = movedPiece;
      if (move.isCastling === 'K') {
        this.board[61] = this.board[63];
        this.board[63] = null;
      } else if (move.isCastling === 'Q') {
        this.board[59] = this.board[56];
        this.board[56] = null;
      } else if (move.isCastling === 'k') {
        this.board[5] = this.board[7];
        this.board[7] = null;
      } else if (move.isCastling === 'q') {
        this.board[3] = this.board[0];
        this.board[0] = null;
      }
    } else if (move.isEnPassant) {
      this.board[move.to] = movedPiece;
      this.board[move.epPawnSq] = null;
    } else {
      this.board[move.to] = move.promo ? { type: move.promo, color: movedPiece.color } : movedPiece;
    }

    // Update castling rights
    if (movedPiece.type === 'k') {
      if (movedPiece.color === 'w') {
        this.castling.wK = false;
        this.castling.wQ = false;
      } else {
        this.castling.bK = false;
        this.castling.bQ = false;
      }
    }
    if (movedPiece.type === 'r') {
      if (move.from === 56) this.castling.wQ = false;
      else if (move.from === 63) this.castling.wK = false;
      else if (move.from === 0) this.castling.bQ = false;
      else if (move.from === 7) this.castling.bK = false;
    }
    // Also if an opponent rook is captured in its corner
    if (move.to === 56) this.castling.wQ = false;
    else if (move.to === 63) this.castling.wK = false;
    else if (move.to === 0) this.castling.bQ = false;
    else if (move.to === 7) this.castling.bK = false;

    // Update en passant
    if (move.isDoublePawn) {
      const dir = movedPiece.color === 'w' ? -1 : 1;
      this.enPassant = move.from + dir * 8;
    } else {
      this.enPassant = null;
    }

    // Halfmove clock
    if (movedPiece.type === 'p' || move.captured) {
      this.halfMoves = 0;
    } else {
      this.halfMoves++;
    }

    if (this.turn === 'b') {
      this.fullMoves++;
    }

    // Switch turn
    this.turn = this.turn === 'w' ? 'b' : 'w';

    // Check check / checkmate on SAN
    let finalSan = san;
    const oppMoves = this.getLegalMoves();
    const inCheck = this.isKingInCheck(this.turn);
    if (oppMoves.length === 0) {
      if (inCheck) finalSan += '#';
    } else if (inCheck) {
      finalSan += '+';
    }

    const logItem = {
      san: finalSan,
      from: move.from,
      to: move.to,
      piece: movedPiece,
      captured: move.captured || null,
      promo: move.promo || null,
      color: movedPiece.color
    };
    this.history[this.history.length - 1].moveLogItem = logItem;
    this.moveLog.push(logItem);
    this.recordPosition();

    return logItem;
  }

  undo() {
    if (this.history.length === 0) return null;
    const key = this.getPositionKey();
    if (this.positionCounts[key]) {
      this.positionCounts[key]--;
      if (this.positionCounts[key] <= 0) delete this.positionCounts[key];
    }

    const lastState = this.history.pop();
    this.board = lastState.board;
    this.turn = lastState.turn;
    this.castling = lastState.castling;
    this.enPassant = lastState.enPassant;
    this.halfMoves = lastState.halfMoves;
    this.fullMoves = lastState.fullMoves;

    const undoneMove = this.moveLog.pop();
    return undoneMove;
  }

  generateSAN(move) {
    if (move.isCastling === 'K' || move.isCastling === 'k') return 'O-O';
    if (move.isCastling === 'Q' || move.isCastling === 'q') return 'O-O-O';

    const p = move.piece;
    const dest = ChessEngine.squareToAlgebraic(move.to);
    const from = ChessEngine.squareToAlgebraic(move.from);

    if (p.type === 'p') {
      let s = '';
      if (move.captured) {
        s += from[0] + 'x' + dest;
      } else {
        s += dest;
      }
      if (move.promo) {
        s += '=' + move.promo.toUpperCase();
      }
      return s;
    }

    let pieceChar = p.type.toUpperCase();

    // Disambiguation
    // Find all other pieces of same color & type that can legally move to move.to
    const allLegals = this.getLegalMoves().filter(m =>
      m.piece.type === p.type &&
      m.piece.color === p.color &&
      m.to === move.to &&
      m.from !== move.from
    );

    let disambig = '';
    if (allLegals.length > 0) {
      const sameFile = allLegals.some(m => m.from % 8 === move.from % 8);
      const sameRank = allLegals.some(m => Math.floor(m.from / 8) === Math.floor(move.from / 8));

      if (!sameFile) {
        disambig = from[0]; // file
      } else if (!sameRank) {
        disambig = from[1]; // rank
      } else {
        disambig = from; // both
      }
    }

    return pieceChar + disambig + (move.captured ? 'x' : '') + dest;
  }

  getGameStatus() {
    const legalMoves = this.getLegalMoves();
    const inCheck = this.isKingInCheck(this.turn);

    if (legalMoves.length === 0) {
      if (inCheck) {
        return {
          over: true,
          result: this.turn === 'w' ? '0-1' : '1-0',
          winner: this.turn === 'w' ? 'b' : 'w',
          reason: 'checkmate',
          description: `Checkmate! ${this.turn === 'w' ? 'Black' : 'White'} wins.`
        };
      } else {
        return {
          over: true,
          result: '1/2-1/2',
          winner: null,
          reason: 'stalemate',
          description: 'Draw by Stalemate.'
        };
      }
    }

    if (this.halfMoves >= 100) {
      return {
        over: true,
        result: '1/2-1/2',
        winner: null,
        reason: '50-move-rule',
        description: 'Draw by 50-move rule.'
      };
    }

    const currentKey = this.getPositionKey();
    if (this.positionCounts[currentKey] >= 3) {
      return {
        over: true,
        result: '1/2-1/2',
        winner: null,
        reason: 'threefold-repetition',
        description: 'Draw by Threefold Repetition.'
      };
    }

    if (this.hasInsufficientMaterial()) {
      return {
        over: true,
        result: '1/2-1/2',
        winner: null,
        reason: 'insufficient-material',
        description: 'Draw by Insufficient Material.'
      };
    }

    return {
      over: false,
      inCheck,
      turn: this.turn,
      description: inCheck ? `${this.turn === 'w' ? 'White' : 'Black'} is in Check!` : `${this.turn === 'w' ? 'White' : 'Black'} to move.`
    };
  }

  hasInsufficientMaterial() {
    const pieces = this.board.filter(p => p !== null);
    if (pieces.length === 2) return true; // K vs K
    if (pieces.length === 3) {
      // K+B vs K or K+N vs K
      return pieces.some(p => p.type === 'b' || p.type === 'n');
    }
    if (pieces.length === 4) {
      const bishops = pieces.filter(p => p.type === 'b');
      if (bishops.length === 2 && pieces.filter(p => p.type === 'k').length === 2) {
        // Find square colors of both bishops
        const bIndices = [];
        this.board.forEach((p, idx) => {
          if (p && p.type === 'b') bIndices.push(idx);
        });
        const isLight = idx => (Math.floor(idx / 8) + (idx % 8)) % 2 === 0;
        if (isLight(bIndices[0]) === isLight(bIndices[1])) {
          return true; // same color bishops
        }
      }
    }
    return false;
  }
}

// Quick test run
const game = new ChessEngine();
console.log("Starting legal moves count:", game.getLegalMoves().length); // should be 20 (16 pawn + 4 knight)

// Scholar's Mate Test: 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
function playBySAN(g, san) {
  const moves = g.getLegalMoves();
  const match = moves.find(m => {
    // Generate SAN
    const mSan = g.generateSAN(m);
    return mSan === san || mSan.replace(/[+#]/, '') === san.replace(/[+#]/, '');
  });
  if (!match) throw new Error("Move not found: " + san + " available: " + moves.map(m => g.generateSAN(m)).join(', '));
  return g.makeMove(match);
}

playBySAN(game, 'e4');
playBySAN(game, 'e5');
playBySAN(game, 'Qh5');
playBySAN(game, 'Nc6');
playBySAN(game, 'Bc4');
playBySAN(game, 'Nf6');
const finalMove = playBySAN(game, 'Qxf7+');
console.log("Scholar mate final move SAN:", finalMove.san);
console.log("Status after Scholar's mate:", game.getGameStatus());

// Undo test
game.undo();
console.log("After undo Qxf7#: turn is", game.turn, "status:", game.getGameStatus());
