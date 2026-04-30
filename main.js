(function (window, document) {
  var BOARD_SIZE = 8;
  var BLACK = "B";
  var WHITE = "W";
  var P2P_TIMEOUT_MS = 5000;
  var RECONNECT_TIMEOUT_MS = 8000;
  var RECONNECT_RETRY_MS = 1500;

  var app = {
    userId: "",
    displayName: "",
    pictureUrl: "",
    opponentDisplayName: "",
    opponentPictureUrl: "",
    peerId: "",
    roomId: "",
    roomUrl: "",
    role: "",
    myColor: "",
    opponentMode: "human",
    desiredHostColor: BLACK,
    currentHostColor: "",
    matchConfigured: false,
    roomData: null,
    roomUnsubscribe: null,
    pendingPeerTarget: "",
    p2pTimer: null,
    reconnectTimer: null,
    reconnectRetryTimer: null,
    reconnecting: false,
    resultOverlayDismissed: false,
    comTimer: null,
    transportMode: "matchmaking",
    rematch: {
      outgoing: null,
      incoming: null
    },
    initializedGame: false,
    game: createFreshGame(),
    elements: {}
  };

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

  function cacheElements() {
    app.elements.board = document.getElementById("board");
    app.elements.shareUrl = document.getElementById("shareUrl");
    app.elements.joinRoomButton = document.getElementById("joinRoomButton");
    app.elements.copyLinkButton = document.getElementById("copyLinkButton");
    app.elements.newRoomButton = document.getElementById("newRoomButton");
    app.elements.myCard = document.getElementById("myCard");
    app.elements.opponentCard = document.getElementById("opponentCard");
    app.elements.resultOverlay = document.getElementById("resultOverlay");
    app.elements.resultWord = document.getElementById("resultWord");
    app.elements.resultCaption = document.getElementById("resultCaption");
    app.elements.resultScoreline = document.getElementById("resultScoreline");
    app.elements.resultPrimaryButton = document.getElementById("resultPrimaryButton");
    app.elements.resultSecondaryButton = document.getElementById("resultSecondaryButton");
    app.elements.overlayMyName = document.getElementById("overlayMyName");
    app.elements.overlayOpponentName = document.getElementById("overlayOpponentName");
    app.elements.userSummary = document.getElementById("userSummary");
    app.elements.roomSummary = document.getElementById("roomSummary");
    app.elements.peerSummary = document.getElementById("peerSummary");
    app.elements.transportStatus = document.getElementById("transportStatus");
    app.elements.opponentStatus = document.getElementById("opponentStatus");
    app.elements.opponentName = document.getElementById("opponentName");
    app.elements.myLabel = document.getElementById("myLabel");
    app.elements.myStatus = document.getElementById("myStatus");
    app.elements.opponentLabel = document.getElementById("opponentLabel");
    app.elements.myScore = document.getElementById("myScore");
    app.elements.opponentScore = document.getElementById("opponentScore");
    app.elements.modeStatus = document.getElementById("modeStatus");
    app.elements.messageBox = document.getElementById("messageBox");
    app.elements.myAvatar = document.getElementById("myAvatar");
    app.elements.opponentAvatar = document.getElementById("opponentAvatar");
    app.elements.hostSetupPanel = document.getElementById("hostSetupPanel");
    app.elements.humanOpponentButton = document.getElementById("humanOpponentButton");
    app.elements.comOpponentButton = document.getElementById("comOpponentButton");
    app.elements.hostBlackButton = document.getElementById("hostBlackButton");
    app.elements.hostWhiteButton = document.getElementById("hostWhiteButton");
    app.elements.controlHint = document.getElementById("controlHint");
  }

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
  }

  function setMessage(message) {
    app.game.message = message;
    setText(app.elements.messageBox, message);
  }

  function setTransportStatus(value) {
    setText(app.elements.transportStatus, value);
  }

  function setOpponentStatus(value) {
    setText(app.elements.opponentStatus, value);
  }

  function setModeStatus(value) {
    setText(app.elements.modeStatus, value);
  }

  function setHidden(element, shouldHide) {
    if (!element) {
      return;
    }

    if (shouldHide) {
      element.classList.add("hidden");
    } else {
      element.classList.remove("hidden");
    }
  }

  function showElement(element, shouldShow) {
    if (!element) {
      return;
    }

    element.style.display = shouldShow ? "" : "none";
  }

  function isCompactMobile() {
    return window.innerWidth <= 640;
  }

  function getMyBaseLabel() {
    return isCompactMobile() ? "私" : "あなた (You)";
  }

  function getOpponentBaseLabel() {
    if (isComMode()) {
      return "COM";
    }

    return isCompactMobile() ? "相手" : "対戦相手";
  }

  function getInitial(name) {
    return (name || "?").charAt(0).toUpperCase();
  }

  function setAvatar(element, name, pictureUrl) {
    if (!element) {
      return;
    }

    element.style.backgroundImage = pictureUrl ? ('url("' + pictureUrl + '")') : "none";
    element.textContent = pictureUrl ? "" : getInitial(name);
  }

  function updateRoomUrl(roomId) {
    app.roomId = roomId;
    app.roomUrl = window.location.origin + window.location.pathname + "?room=" + encodeURIComponent(roomId);
    app.elements.shareUrl.value = roomId;
    setText(app.elements.roomSummary, "ルーム " + roomId);
    window.history.replaceState({}, "", "?room=" + encodeURIComponent(roomId));
  }

  function colorName(color) {
    return color === BLACK ? "黒" : "白";
  }

  function buttonColorLabel(color) {
    return color === BLACK ? "ホストが黒" : "ホストが白";
  }

  function scoreForColor(counts, color) {
    if (color === BLACK) {
      return counts.black;
    }

    if (color === WHITE) {
      return counts.white;
    }

    return "-";
  }

  function roleName(role) {
    if (role === "host") {
      return "ホスト";
    }

    if (role === "guest") {
      return "ゲスト";
    }

    return "未確定";
  }

  function getOpponent(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  function generateId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 10);
  }

  function getStableDebugUserId() {
    var storageKey = "liff-p2p-debug-user-id";
    var existingId = "";

    try {
      existingId = window.localStorage.getItem(storageKey) || "";
      if (!existingId) {
        existingId = generateId("debug-user");
        window.localStorage.setItem(storageKey, existingId);
      }
    } catch (error) {
      existingId = generateId("debug-user");
    }

    return existingId;
  }

  function sanitizeForPeer(value) {
    return String(value || "player").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28) || "player";
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
    var dir;
    var currentRow;
    var currentCol;
    var pending;
    var flips = [];

    if (!isOnBoard(row, col) || board[row][col]) {
      return flips;
    }

    for (dirIndex = 0; dirIndex < directions.length; dirIndex += 1) {
      dir = directions[dirIndex];
      currentRow = row + dir[0];
      currentCol = col + dir[1];
      pending = [];

      while (isOnBoard(currentRow, currentCol) && board[currentRow][currentCol] === opponent) {
        pending.push({ row: currentRow, col: currentCol });
        currentRow += dir[0];
        currentCol += dir[1];
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

    for (row = 0; row < BOARD_SIZE; row += 1) {
      for (col = 0; col < BOARD_SIZE; col += 1) {
        flips = getFlips(board, row, col, color);
        if (flips.length) {
          moves.push({
            row: row,
            col: col,
            flips: flips
          });
        }
      }
    }

    return moves;
  }

  function getMoveMap(validMoves) {
    var output = {};
    var i;
    var key;

    for (i = 0; i < validMoves.length; i += 1) {
      key = validMoves[i].row + "-" + validMoves[i].col;
      output[key] = validMoves[i];
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

    return {
      black: black,
      white: white
    };
  }

  function resolveTurnAfterMove(lastColor) {
    var nextColor = getOpponent(lastColor);
    var nextMoves = getValidMoves(app.game.board, nextColor);
    var sameColorMoves = getValidMoves(app.game.board, lastColor);
    var counts;

    if (nextMoves.length) {
      app.game.currentTurn = nextColor;
      app.game.winner = "";
      return colorName(nextColor) + "の手番です。";
    }

    if (sameColorMoves.length) {
      app.game.currentTurn = lastColor;
      app.game.winner = "";
      return colorName(nextColor) + "は置ける場所がありません。もう一度" + colorName(lastColor) + "の手番です。";
    }

    counts = countDiscs(app.game.board);
    app.game.currentTurn = "";
    app.game.winner = counts.black === counts.white ?
      "引き分け" :
      (counts.black > counts.white ? "黒" : "白");

    if (app.game.winner === "引き分け") {
      return "ゲーム終了。 " + counts.black + "対" + counts.white + "で引き分けです。";
    }

    return "ゲーム終了。 " + app.game.winner + "の勝ちです。スコアは " + counts.black + "対" + counts.white + " です。";
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

  function createBoardUI() {
    var fragment = document.createDocumentFragment();
    var row;
    var col;
    var button;

    app.elements.board.innerHTML = "";

    for (row = 0; row < BOARD_SIZE; row += 1) {
      for (col = 0; col < BOARD_SIZE; col += 1) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "cell";
        button.setAttribute("data-row", row);
        button.setAttribute("data-col", col);
        button.setAttribute("aria-label", "マス " + row + " 行 " + col + " 列");
        button.addEventListener("click", onBoardClick);
        fragment.appendChild(button);
      }
    }

    app.elements.board.appendChild(fragment);
  }

  function renderBoard() {
    var buttons = app.elements.board.querySelectorAll(".cell");
    var validMoves = getValidMoves(app.game.board, app.game.currentTurn || BLACK);
    var validMap = getMoveMap(validMoves);
    var counts = countDiscs(app.game.board);
    var i;
    var row;
    var col;
    var cellValue;
    var button;
    var key;
    var canPlay;

    setText(app.elements.myScore, String(scoreForColor(counts, app.myColor)));
    setText(app.elements.opponentScore, String(scoreForColor(counts, app.myColor ? getOpponent(app.myColor) : "")));
    updateTurnHighlight();
    updateResultOverlay(counts);

    for (i = 0; i < buttons.length; i += 1) {
      button = buttons[i];
      row = Number(button.getAttribute("data-row"));
      col = Number(button.getAttribute("data-col"));
      cellValue = app.game.board[row][col];
      key = row + "-" + col;
      canPlay = app.game.currentTurn &&
        app.game.currentTurn === app.myColor &&
        !app.game.winner &&
        !!validMap[key];

      button.disabled = !canPlay;
      button.className = canPlay ? "cell valid" : "cell";
      button.innerHTML = "";

      if (cellValue) {
        button.className = "cell";
        button.disabled = true;
        button.innerHTML = '<span class="disc ' + (cellValue === BLACK ? "black" : "white") + '"></span>';
      }
    }
  }

  function getResultOutcome() {
    if (!app.game.winner) {
      return "";
    }

    if (app.game.winner === "引き分け") {
      return "draw";
    }

    if (app.myColor && colorName(app.myColor) === app.game.winner) {
      return "win";
    }

    return "lose";
  }

  function hideResultOverlay() {
    app.resultOverlayDismissed = true;

    if (!app.elements.resultOverlay) {
      return;
    }

    setHidden(app.elements.resultOverlay, true);
    app.elements.resultOverlay.classList.remove("visible");
    app.elements.resultOverlay.classList.remove("result-win");
    app.elements.resultOverlay.classList.remove("result-draw");
    app.elements.resultOverlay.classList.remove("result-lose");
  }

  function updateResultOverlay(counts) {
    var showOverlay = !!app.game.winner && !app.resultOverlayDismissed;
    var outcome = getResultOutcome();
    var outgoingPending = !!app.rematch.outgoing;
    var incomingPending = !!app.rematch.incoming;
    var primaryText = "はい";
    var secondaryText = "いいえ";
    var caption = "このルームで続けてもう一戦しますか？";
    var word = "RESULT";

    if (!app.elements.resultOverlay) {
      return;
    }

    if (!showOverlay) {
      setHidden(app.elements.resultOverlay, true);
      app.elements.resultOverlay.classList.remove("visible");
      app.elements.resultOverlay.classList.remove("result-win");
      app.elements.resultOverlay.classList.remove("result-draw");
      app.elements.resultOverlay.classList.remove("result-lose");
      return;
    }

    if (outcome === "win") {
      word = "WIN";
    } else if (outcome === "draw") {
      word = "DRAW";
    } else if (outcome === "lose") {
      word = "LOSE";
    }

    if (incomingPending) {
      caption = "相手が再戦を希望しています。続けますか？";
    } else if (outgoingPending) {
      caption = "再戦リクエストを送信しました。返答を待っています。";
      primaryText = "送信中";
      secondaryText = "閉じる";
    } else if (app.transportMode === "com") {
      caption = "COM と続けてもう一戦しますか？";
    }

    setHidden(app.elements.resultOverlay, false);
    app.elements.resultOverlay.classList.add("visible");
    app.elements.resultOverlay.classList.toggle("result-win", outcome === "win");
    app.elements.resultOverlay.classList.toggle("result-draw", outcome === "draw");
    app.elements.resultOverlay.classList.toggle("result-lose", outcome === "lose");
    setText(app.elements.resultWord, word);
    setText(app.elements.resultCaption, caption);
    setText(app.elements.resultScoreline, String(scoreForColor(counts, app.myColor)) + " - " + String(scoreForColor(counts, app.myColor ? getOpponent(app.myColor) : "")));
    setText(app.elements.overlayMyName, "私");
    setText(app.elements.overlayOpponentName, getOpponentBaseLabel());
    setText(app.elements.resultPrimaryButton, primaryText);
    setText(app.elements.resultSecondaryButton, secondaryText);
    app.elements.resultPrimaryButton.disabled = outgoingPending;
    showElement(app.elements.resultPrimaryButton, true);
    showElement(app.elements.resultSecondaryButton, true);
  }

  function updateTurnHighlight() {
    var opponentColor = app.myColor ? getOpponent(app.myColor) : "";
    var currentTurn = app.game.currentTurn;
    var myTurn = !!currentTurn && currentTurn === app.myColor;
    var opponentTurn = !!currentTurn && currentTurn === opponentColor;

    if (app.elements.myCard) {
      app.elements.myCard.classList.toggle("active-turn", myTurn);
    }

    if (app.elements.opponentCard) {
      app.elements.opponentCard.classList.toggle("active-turn", opponentTurn);
    }
  }

  function resetGameState() {
    app.game = createFreshGame();
    app.resultOverlayDismissed = false;
    app.initializedGame = true;
    renderBoard();
  }

  function clearRematchState() {
    app.rematch.outgoing = null;
    app.rematch.incoming = null;
  }

  function clearComTimer() {
    if (app.comTimer) {
      window.clearTimeout(app.comTimer);
      app.comTimer = null;
    }
  }

  function stopReconnectTimer() {
    if (app.reconnectTimer) {
      window.clearTimeout(app.reconnectTimer);
      app.reconnectTimer = null;
    }
  }

  function stopReconnectRetryTimer() {
    if (app.reconnectRetryTimer) {
      window.clearTimeout(app.reconnectRetryTimer);
      app.reconnectRetryTimer = null;
    }
  }

  function hasPlayedMove() {
    return !!app.game.lastMove || app.game.version > 0;
  }

  function isComMode() {
    return app.opponentMode === "com";
  }

  function updateHostSetupUI() {
    var visible = app.role === "host" &&
      app.transportMode !== "reconnecting" &&
      (!app.matchConfigured || (!hasPlayedMove() && !app.game.winner));

    setHidden(app.elements.hostSetupPanel, !visible);

    if (!visible) {
      return;
    }

    app.elements.humanOpponentButton.classList.toggle("active", app.opponentMode === "human");
    app.elements.comOpponentButton.classList.toggle("active", app.opponentMode === "com");
    app.elements.hostBlackButton.classList.toggle("active", app.desiredHostColor === BLACK);
    app.elements.hostWhiteButton.classList.toggle("active", app.desiredHostColor === WHITE);

    if (isComMode()) {
      setText(app.elements.controlHint, "COM はこの端末だけで対戦します。Firestore も P2P も使いません。");
    } else if (!AppPeer.isConnected()) {
      setText(app.elements.controlHint, "接続後にこの設定を相手へ同期します。");
    } else if (!app.matchConfigured) {
      setText(app.elements.controlHint, "接続済みです。この設定で対局を開始します。");
    } else if (!hasPlayedMove()) {
      setText(app.elements.controlHint, "初手前なら色設定を変更できます。");
    } else {
      setText(app.elements.controlHint, "対局中は色設定を変更できません。");
    }
  }

  function updateRematchUI() {
    updateResultOverlay(countDiscs(app.game.board));
  }

  function setCardColorClass(element, color) {
    if (!element) {
      return;
    }

    element.classList.remove("color-black");
    element.classList.remove("color-white");

    if (color === BLACK) {
      element.classList.add("color-black");
    } else if (color === WHITE) {
      element.classList.add("color-white");
    }
  }

  function updateRoleUI() {
    var myLabel = getMyBaseLabel();
    var opponentLabel = getOpponentBaseLabel();
    var myCardColor = "";
    var opponentCardColor = "";

    if (app.myColor) {
      myLabel += " (" + colorName(app.myColor) + ")";
      opponentLabel += " (" + colorName(getOpponent(app.myColor)) + ")";
      myCardColor = app.myColor;
      opponentCardColor = getOpponent(app.myColor);
    } else if (app.role === "host") {
      myLabel += " (" + colorName(app.desiredHostColor) + "予定)";
      opponentLabel += " (" + colorName(getOpponent(app.desiredHostColor)) + "予定)";
      myCardColor = app.desiredHostColor;
      opponentCardColor = getOpponent(app.desiredHostColor);
    }

    setText(app.elements.myLabel, myLabel);
    setText(app.elements.myStatus, "役割: " + roleName(app.role));
    setText(app.elements.opponentLabel, opponentLabel);
    setCardColorClass(app.elements.myCard, myCardColor);
    setCardColorClass(app.elements.opponentCard, opponentCardColor);
    updateHostSetupUI();
    updateRematchUI();
    renderBoard();
  }

  function updateIdentityUI() {
    setText(app.elements.userSummary, app.displayName || "あなた");
    setText(app.elements.peerSummary, app.peerId ? ("ピアID " + app.peerId) : "シグナリングサーバーに接続中…");
    setAvatar(app.elements.myAvatar, app.displayName, app.pictureUrl);
    if (app.game.winner) {
      updateResultOverlay(countDiscs(app.game.board));
    }
  }

  function updateOpponentUI(name, pictureUrl) {
    app.opponentDisplayName = name || "参加待ち";
    app.opponentPictureUrl = pictureUrl || "";
    setText(app.elements.opponentName, name || "参加待ち");
    setAvatar(app.elements.opponentAvatar, name || "?", pictureUrl || "");
    renderBoard();
  }

  function sendProfileSnapshot() {
    if (!AppPeer.isConnected()) {
      return;
    }

    // Profile data is exchanged only after P2P opens so Firestore stays matchmaking-only.
    AppPeer.send({
      type: "profile_sync",
      displayName: app.displayName || "LINE ユーザー",
      pictureUrl: app.pictureUrl || ""
    });
  }

  function handleResultPrimaryAction() {
    if (!app.game.winner) {
      return;
    }

    app.resultOverlayDismissed = false;

    if (app.rematch.incoming) {
      acceptRematch();
      return;
    }

    if (app.rematch.outgoing) {
      return;
    }

    requestRematch(false);
  }

  function handleResultSecondaryAction() {
    if (!app.game.winner) {
      return;
    }

    if (app.rematch.incoming) {
      rejectRematch();
      app.resultOverlayDismissed = true;
      return;
    }

    hideResultOverlay();
    setMessage("この試合を終了しました。同じルームで再開する場合は「はい」を選んでください。");
  }

  function chooseComMove() {
    var validMoves = getValidMoves(app.game.board, app.game.currentTurn);
    var bestMove = null;
    var bestScore = -1;
    var i;
    var move;
    var positionalBonus;

    for (i = 0; i < validMoves.length; i += 1) {
      move = validMoves[i];
      positionalBonus = 0;

      if ((move.row === 0 || move.row === 7) && (move.col === 0 || move.col === 7)) {
        positionalBonus = 100;
      } else if (move.row === 0 || move.row === 7 || move.col === 0 || move.col === 7) {
        positionalBonus = 10;
      }

      move.score = move.flips.length + positionalBonus;

      if (move.score > bestScore) {
        bestScore = move.score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  function maybeScheduleComTurn() {
    var nextMove;

    clearComTimer();
    if (!isComMode() || app.transportMode !== "com" || app.game.winner || !app.matchConfigured) {
      return;
    }

    if (!app.game.currentTurn || app.game.currentTurn === app.myColor) {
      return;
    }

    nextMove = chooseComMove();
    if (!nextMove) {
      return;
    }

    app.comTimer = window.setTimeout(function () {
      app.comTimer = null;
      makeMove(nextMove.row, nextMove.col, app.game.currentTurn, "com", app.game.version + 1);
    }, 420);
  }

  function scheduleReconnectAttempt() {
    if (!app.reconnecting || app.role !== "host" || !app.roomData || !app.roomData.guestPeerId || AppPeer.isConnected()) {
      return;
    }

    stopReconnectRetryTimer();
    app.reconnectRetryTimer = window.setTimeout(function () {
      app.reconnectRetryTimer = null;
      tryConnectToGuest(app.roomData.guestPeerId);
      scheduleReconnectAttempt();
    }, RECONNECT_RETRY_MS);
  }

  function buildStateSnapshot() {
    return {
      type: "state_sync",
      board: serializeBoard(app.game.board),
      currentTurn: app.game.currentTurn || "",
      version: app.game.version || 0,
      winner: app.game.winner || "",
      message: app.game.message || "",
      matchConfigured: !!app.matchConfigured,
      hostColor: app.currentHostColor || app.desiredHostColor || ""
    };
  }

  function sendStateSnapshot() {
    if (!AppPeer.isConnected() || isComMode()) {
      return;
    }

    AppPeer.send(buildStateSnapshot());
  }

  function boardsMatch(rows) {
    return serializeBoard(app.game.board).join("|") === (rows || []).join("|");
  }

  function applyStateSnapshot(data) {
    var incomingVersion = Number(data.version || 0);
    var localVersion = Number(app.game.version || 0);
    var shouldAdopt = false;

    if (!data || !data.board) {
      return;
    }

    if (incomingVersion > localVersion) {
      shouldAdopt = true;
    } else if (incomingVersion === localVersion) {
      if (!app.matchConfigured && data.matchConfigured) {
        shouldAdopt = true;
      } else if (!boardsMatch(data.board)) {
        switchToComTakeover("再接続後の盤面が一致しません。");
        return;
      }
    }

    if (!shouldAdopt && !(incomingVersion === localVersion && data.matchConfigured && !app.matchConfigured)) {
      return;
    }

    if (data.hostColor) {
      app.currentHostColor = data.hostColor;
      app.desiredHostColor = data.hostColor;
      app.matchConfigured = !!data.matchConfigured;
      app.myColor = app.role === "host" ? data.hostColor : getOpponent(data.hostColor);
    }

    app.game.board = deserializeBoard(data.board);
    app.game.currentTurn = data.currentTurn || "";
    app.game.version = incomingVersion;
    app.game.winner = data.winner || "";
    if (app.game.winner) {
      app.resultOverlayDismissed = false;
    }
    app.game.message = data.message || app.game.message;
    renderBoard();
    updateRoleUI();
    updateRematchUI();
    setMessage(app.game.message);
  }

  function switchToComTakeover(reason) {
    var hostColor = app.currentHostColor || app.desiredHostColor || "";

    app.reconnecting = false;
    stopReconnectTimer();
    stopReconnectRetryTimer();
    stopP2PTimer();
    stopRoomSubscription();
    clearRematchState();
    app.pendingPeerTarget = "";
    app.opponentMode = "com";
    app.transportMode = "com";

    if (!hostColor && app.myColor) {
      hostColor = app.role === "host" ? app.myColor : getOpponent(app.myColor);
      app.currentHostColor = hostColor;
      app.desiredHostColor = hostColor;
    }

    app.matchConfigured = true;
    setTransportStatus("ローカル");
    setModeStatus("COM 引き継ぎ");
    setOpponentStatus("切断のため COM に切替");
    updateOpponentUI("COM", "");
    updateRoleUI();
    updateRematchUI();
    setMessage(reason + " 相手の代わりに COM が続けます。");
    renderBoard();
    maybeScheduleComTurn();
  }

  function applyMatchSettings(hostColor, isRematch) {
    app.currentHostColor = hostColor;
    app.desiredHostColor = hostColor;
    app.matchConfigured = true;
    app.myColor = app.role === "host" ? hostColor : getOpponent(hostColor);
    app.resultOverlayDismissed = false;
    clearRematchState();
    updateRoleUI();
    resetGameState();
    setMessage(isRematch ? "再戦を開始しました。黒が先手です。" : "対局を開始しました。黒が先手です。");
    maybeScheduleComTurn();
  }

  function broadcastMatchSettings(hostColor, isRematch) {
    applyMatchSettings(hostColor, isRematch);
    AppPeer.send({
      type: "match_settings",
      hostColor: hostColor,
      isRematch: !!isRematch
    });
  }

  function startRematch(swapColors) {
    var baseHostColor = app.currentHostColor || app.desiredHostColor || BLACK;
    var nextHostColor = swapColors ? getOpponent(baseHostColor) : baseHostColor;

    if (!AppPeer.isConnected()) {
      return;
    }

    try {
      AppPeer.send({
        type: "rematch_start",
        hostColor: nextHostColor,
        swapColors: !!swapColors
      });
      applyMatchSettings(nextHostColor, true);
    } catch (error) {
      beginReconnectFlow("再戦開始メッセージの送信に失敗しました。 " + error.message);
    }
  }

  function stopRoomSubscription() {
    if (app.roomUnsubscribe) {
      app.roomUnsubscribe();
      app.roomUnsubscribe = null;
    }
  }

  function stopP2PTimer() {
    if (app.p2pTimer) {
      window.clearTimeout(app.p2pTimer);
      app.p2pTimer = null;
    }
  }

  function startP2PTimer(label) {
    stopP2PTimer();

    app.p2pTimer = window.setTimeout(function () {
      if (!AppPeer.isConnected()) {
        if (app.matchConfigured || hasPlayedMove()) {
          beginReconnectFlow(label + "が5秒以内に完了しなかったため、再接続を試みます。");
        } else {
          setTransportStatus("接続待機");
          setOpponentStatus("接続未完了");
          setMessage(label + "が5秒以内に完了しませんでした。相手の復帰を待つか、新しいルームを作成してください。");
        }
      }
    }, P2P_TIMEOUT_MS);
  }

  function beginReconnectFlow(reason) {
    if (isComMode() || !app.roomId) {
      return;
    }

    if (app.reconnecting) {
      return;
    }

    // Peer IDs are stable per user+room, so reconnect can retry without extra Firestore writes.
    app.reconnecting = true;
    app.pendingPeerTarget = "";
    app.transportMode = "reconnecting";
    stopP2PTimer();
    stopReconnectTimer();
    stopReconnectRetryTimer();
    setTransportStatus("再接続中");
    setModeStatus("P2P 再接続");
    setOpponentStatus("再接続待ち…");
    setMessage(reason + " 同じルームで再接続を試みます。");
    updateRematchUI();

    if (app.role === "host" && app.roomData && app.roomData.guestPeerId) {
      tryConnectToGuest(app.roomData.guestPeerId);
      scheduleReconnectAttempt();
    }

    app.reconnectTimer = window.setTimeout(function () {
      app.reconnectTimer = null;
      if (!AppPeer.isConnected()) {
        switchToComTakeover("P2P の再接続に失敗しました。");
      }
    }, RECONNECT_TIMEOUT_MS);
  }

  function startP2PPlay() {
    if (app.transportMode === "p2p" && !app.reconnecting) {
      return;
    }

    // Once P2P is ready, gameplay is authoritative on the peers and Firestore is unsubscribed.
    app.reconnecting = false;
    stopReconnectTimer();
    stopReconnectRetryTimer();
    app.opponentMode = "human";
    app.transportMode = "p2p";
    stopP2PTimer();
    stopRoomSubscription();
    setTransportStatus("WebRTC 接続済み");
    setModeStatus("P2P 対戦");
    setOpponentStatus("接続済み");

    if (!app.initializedGame) {
      resetGameState();
    } else {
      renderBoard();
    }

    if (app.role === "host") {
      try {
        if (app.matchConfigured) {
          sendStateSnapshot();
          sendProfileSnapshot();
          setMessage("P2P 接続が再開されました。対局を同期しています。");
        } else {
          broadcastMatchSettings(app.desiredHostColor, false);
          sendStateSnapshot();
          sendProfileSnapshot();
        }
      } catch (error) {
        beginReconnectFlow("初期設定の送信に失敗しました。 " + error.message);
      }
      return;
    }

    if (app.matchConfigured) {
      try {
        sendStateSnapshot();
        sendProfileSnapshot();
      } catch (error) {
        beginReconnectFlow("再接続後の状態同期に失敗しました。 " + error.message);
        return;
      }
      setMessage("P2P 接続が再開されました。対局を同期しています。");
    } else {
      try {
        sendProfileSnapshot();
      } catch (error) {
        beginReconnectFlow("プロフィール同期の送信に失敗しました。 " + error.message);
        return;
      }
      setMessage("P2P 接続が確立されました。ホストの開始設定を待っています。");
    }
    updateRoleUI();
  }

  function finalizeIncomingRematch() {
    if (!app.rematch.incoming || app.role !== "host") {
      return;
    }

    startRematch(!!app.rematch.incoming.swapColors);
  }

  function requestRematch(swapColors) {
    if (app.transportMode === "com") {
      startComMatch(swapColors ? getOpponent(app.currentHostColor || app.desiredHostColor || BLACK) : (app.currentHostColor || app.desiredHostColor || BLACK), true);
      return;
    }

    if (!AppPeer.isConnected()) {
      return;
    }

    app.rematch.outgoing = {
      swapColors: !!swapColors
    };
    app.rematch.incoming = null;
    app.resultOverlayDismissed = false;
    updateRematchUI();

    try {
      AppPeer.send({
        type: "rematch_request",
        swapColors: !!swapColors
      });
      setMessage(swapColors ? "色を入れ替える再戦をリクエストしました。" : "同じ色での再戦をリクエストしました。");
    } catch (error) {
      clearRematchState();
      updateRematchUI();
      beginReconnectFlow("再戦リクエストの送信に失敗しました。 " + error.message);
    }
  }

  function makeMove(row, col, color, source, incomingVersion) {
    var expectedVersion = app.game.version + 1;
    var applied;
    var moveMessage;

    if (incomingVersion && incomingVersion !== expectedVersion) {
      switchToComTakeover("ピア間で盤面バージョンの不一致を検出しました。");
      return false;
    }

    applied = applyMove(app.game.board, row, col, color);

    if (!applied) {
      if (source === "remote") {
        switchToComTakeover("相手から無効な手が送信されました。");
        return false;
      }

      return false;
    }

    app.game.version = incomingVersion || expectedVersion;
    app.game.lastMove = {
      row: row,
      col: col,
      color: color
    };
    moveMessage = resolveTurnAfterMove(color);
    if (app.game.winner) {
      app.resultOverlayDismissed = false;
    }
    setMessage(moveMessage);
    renderBoard();
    updateRematchUI();
    maybeScheduleComTurn();

    return true;
  }

  function sendMove(row, col) {
    var nextVersion = app.game.version + 1;
    var payload = {
      type: "move",
      color: app.myColor,
      position: {
        row: row,
        col: col
      },
      version: nextVersion
    };

    if (!makeMove(row, col, app.myColor, "local", nextVersion)) {
      return;
    }

    if (app.transportMode === "p2p") {
      try {
        AppPeer.send(payload);
      } catch (error) {
        beginReconnectFlow("P2P 送信に失敗しました。 " + error.message);
      }
    }
  }

  function onBoardClick(event) {
    var row = Number(event.currentTarget.getAttribute("data-row"));
    var col = Number(event.currentTarget.getAttribute("data-col"));

    if (!app.myColor || app.game.currentTurn !== app.myColor || app.game.winner) {
      return;
    }

    sendMove(row, col);
  }

  function handlePeerData(data) {
    if (!data || !data.type) {
      return;
    }

    if (data.type === "move" && data.position) {
      makeMove(Number(data.position.row), Number(data.position.col), data.color, "remote", Number(data.version));
      return;
    }

    if (data.type === "match_settings") {
      app.opponentMode = "human";
      applyMatchSettings(data.hostColor, !!data.isRematch);
      return;
    }

    if (data.type === "state_sync") {
      applyStateSnapshot(data);
      return;
    }

    if (data.type === "profile_sync") {
      updateOpponentUI(data.displayName || "対戦相手", data.pictureUrl || "");
      return;
    }

    if (data.type === "rematch_request") {
      app.rematch.incoming = {
        swapColors: !!data.swapColors
      };
      app.rematch.outgoing = null;
      app.resultOverlayDismissed = false;
      updateRematchUI();
      setMessage(data.swapColors ?
        "相手が色を入れ替えて再戦したいようです。" :
        "相手が同じ色で再戦したいようです。");
      return;
    }

    if (data.type === "rematch_accept") {
      if (app.role === "host" && (app.rematch.outgoing || app.rematch.incoming)) {
        finalizeIncomingRematch();
      } else {
        setMessage("相手が再戦を承認しました。開始を待っています。");
      }
      return;
    }

    if (data.type === "rematch_reject") {
      clearRematchState();
      app.resultOverlayDismissed = false;
      updateRematchUI();
      setMessage("相手は再戦しませんでした。");
      return;
    }

    if (data.type === "rematch_start") {
      applyMatchSettings(data.hostColor, true);
    }
  }

  function tryConnectToGuest(guestPeerId) {
    if (!guestPeerId || app.pendingPeerTarget === guestPeerId || AppPeer.isConnected()) {
      return;
    }

    app.pendingPeerTarget = guestPeerId;
    setOpponentStatus("ピアに接続中…");
    startP2PTimer("P2P 接続");
    AppPeer.connectTo(guestPeerId);
  }

  function handleRoomSnapshot(roomData) {
    app.roomData = roomData;

    if (!roomData) {
      setMessage("ルームが見つかりません。");
      setOpponentStatus("利用不可");
      updateOpponentUI("不明", "");
      return;
    }

    if (app.role === "host" && isComMode()) {
      return;
    }

    if (app.role === "host") {
      if (roomData.guestUserId) {
        setOpponentStatus("ゲストが参加しました");
      }
      if (roomData.guestPeerId) {
        tryConnectToGuest(roomData.guestPeerId);
      }
    } else {
      setOpponentStatus(roomData.hostPeerId ? "ホストからの接続を待っています…" : "ホストの準備待ちです");
    }
  }

  function subscribeToRoom() {
    if (app.roomUnsubscribe || !app.roomId) {
      return;
    }

    // Firestore is used only until peers discover each other and establish the direct channel.
    app.roomUnsubscribe = AppFirebase.subscribeRoom(app.roomId, handleRoomSnapshot, function (error) {
      setMessage("ルーム監視でエラーが発生しました: " + error.message);
    });
  }

  function buildRoomPayload() {
    return {
      roomId: app.roomId,
      hostUserId: app.userId,
      guestUserId: "",
      hostPeerId: app.peerId,
      guestPeerId: "",
      status: "waiting"
    };
  }

  function createHostRoom(roomId) {
    app.role = "host";
    app.opponentMode = "human";
    app.myColor = BLACK;
    updateRoleUI();
    updateRoomUrl(roomId);
    setTransportStatus("ゲスト待機中");
    setModeStatus("マッチング");
    setOpponentStatus("ゲスト待機中");
    setMessage("ルームを作成しました。URL を共有してゲストの参加を待ってください。Firestore にはルーム情報とピアIDだけを保持します。");
    app.currentHostColor = "";
    app.matchConfigured = false;
    app.myColor = "";
    clearRematchState();
    clearComTimer();
    resetGameState();

    return AppFirebase.createRoom(roomId, buildRoomPayload()).then(function () {
      subscribeToRoom();
      updateRoleUI();
    });
  }

  function joinAsGuest(roomData) {
    app.role = "guest";
    app.opponentMode = "human";
    app.myColor = WHITE;
    updateRoleUI();
    setTransportStatus("ホスト待機中");
    setModeStatus("マッチング");
    setOpponentStatus("ルーム参加中…");
    setMessage("ルームに参加しました。ホストが P2P 接続を開始するまで待機します。");
    app.currentHostColor = "";
    app.matchConfigured = false;
    app.myColor = "";
    clearRematchState();
    clearComTimer();
    resetGameState();

    return AppFirebase.updateRoom(app.roomId, {
      guestUserId: app.userId,
      guestPeerId: app.peerId,
      status: "ready"
    }).then(function () {
      subscribeToRoom();
      startP2PTimer("着信 P2P 接続");
    });
  }

  function resumeExistingRole(roomData, role) {
    app.role = role;
    app.opponentMode = "human";
    app.currentHostColor = "";
    app.matchConfigured = false;
    app.myColor = "";
    clearRematchState();
    clearComTimer();
    updateRoleUI();
    resetGameState();

    setTransportStatus(role === "host" ? "ゲスト待機中" : "ホスト待機中");
    setModeStatus("マッチング");
    setOpponentStatus(role === "host" ? "ゲスト待機中" : "ホストからの接続を待っています…");
    setMessage("既存のルームに再接続しました。接続状態を確認しています。");
    subscribeToRoom();

    if (role === "host" && roomData.guestPeerId) {
      tryConnectToGuest(roomData.guestPeerId);
    } else if (role === "guest") {
      startP2PTimer("着信 P2P 接続");
    }

    return Promise.resolve();
  }

  function loadOrCreateRoom() {
    return AppFirebase.getRoom(app.roomId).then(function (roomData) {
      if (!roomData) {
        return createHostRoom(app.roomId);
      }

      if (roomData.hostUserId === app.userId) {
        return resumeExistingRole(roomData, "host");
      }

      if (roomData.guestUserId === app.userId) {
        return resumeExistingRole(roomData, "guest");
      }

      if (!roomData.guestUserId) {
        return joinAsGuest(roomData);
      }

      setTransportStatus("満室");
      setOpponentStatus("利用不可");
      setMessage("このルームはすでに2人参加しています。");
    });
  }

  function buildPeerId() {
    var userPart = sanitizeForPeer(app.userId).slice(0, 16);
    var roomPart = sanitizeForPeer(app.roomId).slice(-10);
    return userPart + "-" + roomPart;
  }

  function prepareRoomId() {
    var params = new URLSearchParams(window.location.search);
    var requestedRoomId = params.get("room");

    updateRoomUrl(requestedRoomId || generateId("room"));
  }

  function initLiffIdentity() {
    return new Promise(function (resolve) {
      if (!window.liff || !window.APP_CONFIG.liffId || window.APP_CONFIG.liffId === "YOUR_LIFF_ID") {
        app.userId = getStableDebugUserId();
        app.displayName = "デバッグユーザー";
        app.pictureUrl = "";
        resolve();
        return;
      }

      liff.init({ liffId: window.APP_CONFIG.liffId }).then(function () {
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        liff.getProfile().then(function (profile) {
          app.userId = profile.userId;
          app.displayName = profile.displayName || "LINE ユーザー";
          app.pictureUrl = profile.pictureUrl || "";
          resolve();
        }).catch(function () {
          app.userId = getStableDebugUserId();
          app.displayName = "LINE ユーザー";
          app.pictureUrl = "";
          resolve();
        });
      }).catch(function () {
        app.userId = getStableDebugUserId();
        app.displayName = "デバッグユーザー";
        app.pictureUrl = "";
        resolve();
      });
    });
  }

  function wirePeerHandlers() {
    return AppPeer.init(buildPeerId(), {
      onPeerOpen: function (id) {
        app.peerId = id;
        updateIdentityUI();
      },
      onIncomingConnection: function () {
        setOpponentStatus("ピア接続要求を受信しました");
      },
      onConnectionOpen: function () {
        startP2PPlay();
      },
      onData: function (data) {
        handlePeerData(data);
      },
      onConnectionClose: function () {
        app.pendingPeerTarget = "";
        if (app.transportMode !== "com") {
          beginReconnectFlow("P2P 接続が切断されました。");
        }
      },
      onConnectionError: function (error) {
        app.pendingPeerTarget = "";
        if (app.transportMode !== "com") {
          beginReconnectFlow("P2P 接続エラーが発生しました: " + error.message);
        }
      },
      onPeerError: function (error) {
        setMessage("PeerJS エラー: " + error.message);
      },
      onPeerDisconnected: function () {
        app.pendingPeerTarget = "";
        if (app.transportMode !== "com") {
          beginReconnectFlow("ピアのシグナリング接続が切断されました。");
        }
      }
    });
  }

  function copyTextToClipboard(text, successMessage) {
    var tempInput;

    if (!text) {
      return Promise.resolve(false);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        setMessage(successMessage || "共有 URL をクリップボードにコピーしました。");
        return true;
      }).catch(function () {
        setMessage("コピーに失敗しました。URL を手動でコピーしてください。");
        return false;
      });
    }

    tempInput = document.createElement("textarea");
    tempInput.value = text;
    tempInput.setAttribute("readonly", "readonly");
    tempInput.style.position = "absolute";
    tempInput.style.left = "-9999px";
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    setMessage(successMessage || "共有 URL をクリップボードにコピーしました。");
    return Promise.resolve(true);
  }

  function buildShareUrl() {
    if (!app.roomUrl) {
      return Promise.resolve("");
    }

    if (!window.liff || !liff.permanentLink || typeof liff.permanentLink.createUrlBy !== "function") {
      return Promise.resolve(app.roomUrl);
    }

    try {
      return Promise.resolve(liff.permanentLink.createUrlBy(app.roomUrl)).catch(function () {
        return app.roomUrl;
      });
    } catch (error) {
      return Promise.resolve(app.roomUrl);
    }
  }

  function handleCopyLink() {
    buildShareUrl().then(function (shareUrl) {
      if (window.liff &&
          typeof liff.isApiAvailable === "function" &&
          liff.isApiAvailable("shareTargetPicker") &&
          typeof liff.shareTargetPicker === "function") {
        return liff.shareTargetPicker([
          {
            type: "text",
            text: "オセロで対戦しよう\n" + (shareUrl || app.roomUrl)
          }
        ]).then(function (result) {
          if (result) {
            setMessage("LINE で招待メッセージを送信しました。");
            return true;
          }

          setMessage("招待がキャンセルされました。必要であれば URL を共有してください。");
          return false;
        }).catch(function () {
          return copyTextToClipboard(shareUrl || app.roomUrl, "LINE 共有に失敗したため、招待 URL をコピーしました。");
        });
      }

      return copyTextToClipboard(shareUrl || app.roomUrl, "LINE 共有に未対応のため、招待 URL をコピーしました。");
    }).catch(function () {
      return copyTextToClipboard(app.roomUrl, "招待 URL をクリップボードにコピーしました。");
    });
  }

  function handleNewRoom() {
    window.location.href = window.location.pathname;
  }

  function handleJoinRoom() {
    var nextRoomId = String(app.elements.shareUrl.value || "").trim();

    if (!nextRoomId || nextRoomId === "ルーム作成中…") {
      setMessage("参加したいルームIDを入力してください。");
      return;
    }

    if (nextRoomId === app.roomId) {
      setMessage("現在このルームを開いています。");
      return;
    }

    window.location.href = window.location.pathname + "?room=" + encodeURIComponent(nextRoomId);
  }

  function handleHostColorChange(color) {
    if (app.role !== "host") {
      return;
    }

    if (hasPlayedMove() && !app.game.winner) {
      setMessage("対局中は開始色を変更できません。");
      return;
    }

    app.desiredHostColor = color;
    updateRoleUI();

    if (isComMode()) {
      startComMatch(color, false);
      return;
    }

    if (AppPeer.isConnected() && app.transportMode === "p2p") {
      try {
        broadcastMatchSettings(color, false);
      } catch (error) {
        beginReconnectFlow("開始設定の送信に失敗しました。 " + error.message);
      }
    }
  }

  function startComMatch(hostColor, isRematch) {
    app.opponentMode = "com";
    app.reconnecting = false;
    stopReconnectTimer();
    stopReconnectRetryTimer();
    app.transportMode = "com";
    setTransportStatus("ローカル");
    setModeStatus("COM 対戦");
    setOpponentStatus("ローカル対戦");
    updateOpponentUI("COM", "");
    stopP2PTimer();
    stopRoomSubscription();
    clearRematchState();
    applyMatchSettings(hostColor, isRematch);
    setMessage(isRematch ? "COM と再戦を開始しました。黒が先手です。" : "COM 対戦を開始しました。黒が先手です。");
  }

  function setOpponentMode(mode) {
    var canSwitch = app.role === "host" &&
      !hasPlayedMove() &&
      !app.game.winner &&
      (!app.roomData || !app.roomData.guestUserId) &&
      !AppPeer.isConnected();

    if (app.role !== "host" || mode === app.opponentMode) {
      return;
    }

    if (!canSwitch) {
      setMessage("対戦相手の種類は、接続前かつ対局前のみ変更できます。");
      return;
    }

    app.opponentMode = mode;

    if (mode === "com") {
      startComMatch(app.desiredHostColor, false);
      return;
    }

    clearComTimer();
    app.transportMode = "matchmaking";
    app.matchConfigured = false;
    app.currentHostColor = "";
    app.myColor = "";
    clearRematchState();
    resetGameState();
    setTransportStatus("ゲスト待機中");
    setModeStatus("マッチング");
    setOpponentStatus("ゲスト待機中");
    updateOpponentUI("参加待ち", "");
    setMessage("URL を共有してゲストの参加を待ってください。");
    subscribeToRoom();
    updateRoleUI();
  }

  function acceptRematch() {
    if (!app.rematch.incoming || !AppPeer.isConnected()) {
      return;
    }

    try {
      AppPeer.send({
        type: "rematch_accept",
        swapColors: !!app.rematch.incoming.swapColors
      });
    } catch (error) {
      beginReconnectFlow("再戦承認の送信に失敗しました。 " + error.message);
      return;
    }

    if (app.role === "host") {
      finalizeIncomingRematch();
      return;
    }

    app.rematch.outgoing = {
      swapColors: !!app.rematch.incoming.swapColors
    };
    app.rematch.incoming = null;
    app.resultOverlayDismissed = false;
    updateRematchUI();
    setMessage("再戦を承認しました。ホストの開始を待っています。");
  }

  function rejectRematch() {
    if (!AppPeer.isConnected()) {
      return;
    }

    clearRematchState();
    app.resultOverlayDismissed = true;
    updateRematchUI();

    try {
      AppPeer.send({
        type: "rematch_reject"
      });
    } catch (error) {
      beginReconnectFlow("再戦辞退の送信に失敗しました。 " + error.message);
      return;
    }

    setMessage("再戦を終了しました。");
  }

  function bootstrap() {
    cacheElements();
    createBoardUI();
    renderBoard();

    app.elements.resultPrimaryButton.addEventListener("click", handleResultPrimaryAction);
    app.elements.resultSecondaryButton.addEventListener("click", handleResultSecondaryAction);
    app.elements.joinRoomButton.addEventListener("click", handleJoinRoom);
    app.elements.copyLinkButton.addEventListener("click", handleCopyLink);
    app.elements.newRoomButton.addEventListener("click", handleNewRoom);
    app.elements.shareUrl.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        handleJoinRoom();
      }
    });
    app.elements.humanOpponentButton.addEventListener("click", function () {
      setOpponentMode("human");
    });
    app.elements.comOpponentButton.addEventListener("click", function () {
      setOpponentMode("com");
    });
    app.elements.hostBlackButton.addEventListener("click", function () {
      handleHostColorChange(BLACK);
    });
    app.elements.hostWhiteButton.addEventListener("click", function () {
      handleHostColorChange(WHITE);
    });
    window.addEventListener("resize", function () {
      updateRoleUI();
    });
    updateRoleUI();
    updateOpponentUI("", "");

    initLiffIdentity().then(function () {
      updateIdentityUI();
      prepareRoomId();
      AppFirebase.init();
      return wirePeerHandlers();
    }).then(function () {
      updateIdentityUI();
      return loadOrCreateRoom();
    }).catch(function (error) {
      setTransportStatus("エラー");
      setOpponentStatus("利用不可");
      setModeStatus("停止");
      setMessage(error.message || String(error));
    });
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
}(window, document));
