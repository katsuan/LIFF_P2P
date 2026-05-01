(function (window) {
  var BOARD_SIZE = 8;
  var BLACK = "B";
  var WHITE = "W";

  function getOpponent(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  function colorName(color) {
    return color === BLACK ? "黒" : "白";
  }

  function createInitialBoard() {
    var board = [];
    var row;
    var col;

    for (row = 0; row < BOARD_SIZE; row += 1) {
      board[row] = [];
      for (col = 0; col < BOARD_SIZE; col += 1) {
        board[row][col] = "";
      }
    }

    board[3][3] = WHITE;
    board[3][4] = BLACK;
    board[4][3] = BLACK;
    board[4][4] = WHITE;
    return board;
  }

  function createFreshGame() {
    return {
      board: createInitialBoard(),
      currentTurn: BLACK,
      version: 0,
      winner: "",
      message: "黒が先手です。両プレイヤーの接続を待っています。",
      lastMove: null
    };
  }

  function serializeBoard(board) {
    var rows = [];
    var row;
    var col;
    var text;

    for (row = 0; row < BOARD_SIZE; row += 1) {
      text = "";
      for (col = 0; col < BOARD_SIZE; col += 1) {
        text += board[row][col] || ".";
      }
      rows.push(text);
    }

    return rows;
  }

  function deserializeBoard(rows) {
    var board = [];
    var row;
    var col;
    var rowText;

    for (row = 0; row < BOARD_SIZE; row += 1) {
      board[row] = [];
      rowText = rows && rows[row] ? rows[row] : "........";
      for (col = 0; col < BOARD_SIZE; col += 1) {
        board[row][col] = rowText.charAt(col) === "." ? "" : rowText.charAt(col);
      }
    }

    return board;
  }

  function isOnBoard(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function getFlips(board, row, col, color) {
    var opponent = getOpponent(color);
    var directions = [
      [-1, -1], [-1, 0], [-1, 1],
      [0, -1],           [0, 1],
      [1, -1],  [1, 0],  [1, 1]
    ];
    var dirIndex;
    var direction;
    var currentRow;
    var currentCol;
    var pending;
    var flips = [];

    if (!isOnBoard(row, col) || board[row][col]) {
      return flips;
    }

    for (dirIndex = 0; dirIndex < directions.length; dirIndex += 1) {
      direction = directions[dirIndex];
      currentRow = row + direction[0];
      currentCol = col + direction[1];
      pending = [];

      while (isOnBoard(currentRow, currentCol) && board[currentRow][currentCol] === opponent) {
        pending.push({ row: currentRow, col: currentCol });
        currentRow += direction[0];
        currentCol += direction[1];
      }

      if (pending.length &&
          isOnBoard(currentRow, currentCol) &&
          board[currentRow][currentCol] === color) {
        flips = flips.concat(pending);
      }
    }

    return flips;
  }

  function getValidMoves(board, color) {
    var moves = [];
    var row;
    var col;
    var flips;

    if (!color) {
      return moves;
    }

    for (row = 0; row < BOARD_SIZE; row += 1) {
      for (col = 0; col < BOARD_SIZE; col += 1) {
        flips = getFlips(board, row, col, color);
        if (flips.length) {
          moves.push({ row: row, col: col, flips: flips });
        }
      }
    }

    return moves;
  }

  function getMoveMap(validMoves) {
    var output = {};
    var index;
    var key;

    for (index = 0; index < validMoves.length; index += 1) {
      key = validMoves[index].row + "-" + validMoves[index].col;
      output[key] = validMoves[index];
    }

    return output;
  }

  function countDiscs(board) {
    var black = 0;
    var white = 0;
    var row;
    var col;

    for (row = 0; row < BOARD_SIZE; row += 1) {
      for (col = 0; col < BOARD_SIZE; col += 1) {
        if (board[row][col] === BLACK) {
          black += 1;
        } else if (board[row][col] === WHITE) {
          white += 1;
        }
      }
    }

    return { black: black, white: white };
  }

  function applyMove(board, row, col, color) {
    var flips = getFlips(board, row, col, color);
    var index;

    if (!flips.length) {
      return false;
    }

    board[row][col] = color;
    for (index = 0; index < flips.length; index += 1) {
      board[flips[index].row][flips[index].col] = color;
    }

    return true;
  }

  function resolveTurnAfterMove(game, lastColor) {
    var nextColor = getOpponent(lastColor);
    var nextMoves = getValidMoves(game.board, nextColor);
    var sameMoves = getValidMoves(game.board, lastColor);
    var counts;

    if (nextMoves.length) {
      game.currentTurn = nextColor;
      game.winner = "";
      return colorName(nextColor) + "の手番です。";
    }

    if (sameMoves.length) {
      game.currentTurn = lastColor;
      game.winner = "";
      return colorName(nextColor) + "は置ける場所がありません。もう一度" + colorName(lastColor) + "の手番です。";
    }

    counts = countDiscs(game.board);
    game.currentTurn = "";
    game.winner = counts.black === counts.white ? "引き分け" : (counts.black > counts.white ? "黒" : "白");

    if (game.winner === "引き分け") {
      return "ゲーム終了。 " + counts.black + "対" + counts.white + "で引き分けです。";
    }

    return "ゲーム終了。 " + game.winner + "の勝ちです。スコアは " + counts.black + "対" + counts.white + " です。";
  }

  function outcomeForColor(winner, color) {
    if (!winner) {
      return "";
    }
    if (winner === "引き分け") {
      return "draw";
    }
    return colorName(color) === winner ? "win" : "lose";
  }

  window.OthelloGame = {
    BOARD_SIZE: BOARD_SIZE,
    BLACK: BLACK,
    WHITE: WHITE,
    createFreshGame: createFreshGame,
    createInitialBoard: createInitialBoard,
    serializeBoard: serializeBoard,
    deserializeBoard: deserializeBoard,
    getOpponent: getOpponent,
    colorName: colorName,
    getValidMoves: getValidMoves,
    getMoveMap: getMoveMap,
    countDiscs: countDiscs,
    applyMove: applyMove,
    resolveTurnAfterMove: resolveTurnAfterMove,
    outcomeForColor: outcomeForColor
  };
}(window));
