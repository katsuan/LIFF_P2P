(function (window, document) {
  var BOARD_SIZE = 8;
  var BLACK = "B";
  var WHITE = "W";
  var P2P_TIMEOUT_MS = 5000;

  var app = {
    userId: "",
    displayName: "",
    pictureUrl: "",
    peerId: "",
    roomId: "",
    roomUrl: "",
    role: "",
    myColor: "",
    desiredHostColor: BLACK,
    currentHostColor: "",
    matchConfigured: false,
    roomData: null,
    roomUnsubscribe: null,
    fallbackUnsubscribe: null,
    pendingPeerTarget: "",
    p2pTimer: null,
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
    app.elements.copyLinkButton = document.getElementById("copyLinkButton");
    app.elements.newRoomButton = document.getElementById("newRoomButton");
    app.elements.userSummary = document.getElementById("userSummary");
    app.elements.roomSummary = document.getElementById("roomSummary");
    app.elements.peerSummary = document.getElementById("peerSummary");
    app.elements.transportStatus = document.getElementById("transportStatus");
    app.elements.opponentStatus = document.getElementById("opponentStatus");
    app.elements.opponentName = document.getElementById("opponentName");
    app.elements.turnStatus = document.getElementById("turnStatus");
    app.elements.modeStatus = document.getElementById("modeStatus");
    app.elements.roleBadge = document.getElementById("roleBadge");
    app.elements.colorBadge = document.getElementById("colorBadge");
    app.elements.messageBox = document.getElementById("messageBox");
    app.elements.blackScore = document.getElementById("blackScore");
    app.elements.whiteScore = document.getElementById("whiteScore");
    app.elements.myAvatar = document.getElementById("myAvatar");
    app.elements.opponentAvatar = document.getElementById("opponentAvatar");
    app.elements.hostSetupPanel = document.getElementById("hostSetupPanel");
    app.elements.hostBlackButton = document.getElementById("hostBlackButton");
    app.elements.hostWhiteButton = document.getElementById("hostWhiteButton");
    app.elements.controlHint = document.getElementById("controlHint");
    app.elements.rematchPanel = document.getElementById("rematchPanel");
    app.elements.rematchActions = document.getElementById("rematchActions");
    app.elements.rematchDecision = document.getElementById("rematchDecision");
    app.elements.sameRematchButton = document.getElementById("sameRematchButton");
    app.elements.swapRematchButton = document.getElementById("swapRematchButton");
    app.elements.acceptRematchButton = document.getElementById("acceptRematchButton");
    app.elements.rejectRematchButton = document.getElementById("rejectRematchButton");
    app.elements.rematchHint = document.getElementById("rematchHint");
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
    app.elements.shareUrl.value = app.roomUrl;
    setText(app.elements.roomSummary, "ルーム " + roomId);
    window.history.replaceState({}, "", "?room=" + encodeURIComponent(roomId));
  }

  function colorName(color) {
    return color === BLACK ? "黒" : "白";
  }

  function buttonColorLabel(color) {
    return color === BLACK ? "ホストが黒" : "ホストが白";
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

    setText(app.elements.blackScore, String(counts.black));
    setText(app.elements.whiteScore, String(counts.white));

    if (!app.game.currentTurn) {
      setText(app.elements.turnStatus, app.game.winner ? (app.game.winner + "の勝ち") : "ゲーム終了");
    } else {
      setText(app.elements.turnStatus, colorName(app.game.currentTurn) + "の手番");
    }

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

  function resetGameState() {
    app.game = createFreshGame();
    app.initializedGame = true;
    renderBoard();
  }

  function clearRematchState() {
    app.rematch.outgoing = null;
    app.rematch.incoming = null;
  }

  function hasPlayedMove() {
    return !!app.game.lastMove || app.game.version > 0;
  }

  function updateHostSetupUI() {
    var visible = app.role === "host" &&
      app.transportMode !== "firestore" &&
      (!app.matchConfigured || (!hasPlayedMove() && !app.game.winner));

    setHidden(app.elements.hostSetupPanel, !visible);

    if (!visible) {
      return;
    }

    app.elements.hostBlackButton.classList.toggle("active", app.desiredHostColor === BLACK);
    app.elements.hostWhiteButton.classList.toggle("active", app.desiredHostColor === WHITE);

    if (!AppPeer.isConnected()) {
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
    var showPanel = app.game.winner && app.transportMode === "p2p" && AppPeer.isConnected();
    var decisionText = "ゲーム終了後に同じルームで再戦できます。";

    setHidden(app.elements.rematchPanel, !showPanel);
    if (!showPanel) {
      return;
    }

    setHidden(app.elements.rematchActions, !!app.rematch.incoming || !!app.rematch.outgoing);
    setHidden(app.elements.rematchDecision, !app.rematch.incoming);

    if (app.rematch.incoming) {
      decisionText = app.rematch.incoming.swapColors ?
        "相手が色を入れ替えて再戦を希望しています。" :
        "相手が同じ色での再戦を希望しています。";
    } else if (app.rematch.outgoing) {
      decisionText = "再戦リクエストを送信しました。返答を待っています。";
    }

    setText(app.elements.rematchHint, decisionText);
  }

  function updateRoleUI() {
    var colorLabel = "未確定";

    if (app.myColor) {
      colorLabel = colorName(app.myColor);
    } else if (app.role === "host") {
      colorLabel = buttonColorLabel(app.desiredHostColor) + "予定";
    }

    setText(app.elements.roleBadge, "役割: " + roleName(app.role));
    setText(app.elements.colorBadge, "色: " + colorLabel);
    updateHostSetupUI();
    updateRematchUI();
  }

  function updateIdentityUI() {
    setText(app.elements.userSummary, app.displayName || "あなた");
    setText(app.elements.peerSummary, app.peerId ? ("ピアID " + app.peerId) : "シグナリングサーバーに接続中…");
    setAvatar(app.elements.myAvatar, app.displayName, app.pictureUrl);
  }

  function updateOpponentUI(name, pictureUrl) {
    setText(app.elements.opponentName, name || "参加待ち");
    setAvatar(app.elements.opponentAvatar, name || "?", pictureUrl || "");
  }

  function syncOpponentProfile(roomData) {
    var opponentName = "";
    var opponentPictureUrl = "";

    if (!roomData) {
      updateOpponentUI("", "");
      return;
    }

    if (app.role === "host") {
      opponentName = roomData.guestDisplayName || "";
      opponentPictureUrl = roomData.guestPictureUrl || "";
    } else if (app.role === "guest") {
      opponentName = roomData.hostDisplayName || "";
      opponentPictureUrl = roomData.hostPictureUrl || "";
    }

    updateOpponentUI(opponentName, opponentPictureUrl);
  }

  function applyMatchSettings(hostColor, isRematch) {
    app.currentHostColor = hostColor;
    app.desiredHostColor = hostColor;
    app.matchConfigured = true;
    app.myColor = app.role === "host" ? hostColor : getOpponent(hostColor);
    clearRematchState();
    updateRoleUI();
    resetGameState();
    setMessage(isRematch ? "再戦を開始しました。黒が先手です。" : "対局を開始しました。黒が先手です。");
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
      activateFirestoreFallback("再戦開始メッセージの送信に失敗しました。 " + error.message);
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
      if (!AppPeer.isConnected() && app.transportMode !== "firestore") {
        activateFirestoreFallback(label + "が5秒以内に完了しなかったため、Firestore フォールバックへ切り替えます。");
      }
    }, P2P_TIMEOUT_MS);
  }

  function buildFallbackPayload(reason) {
    return {
      fallbackReason: reason,
      board: serializeBoard(app.game.board),
      currentTurn: app.game.currentTurn || "",
      version: app.game.version,
      winner: app.game.winner || "",
      message: app.game.message || "",
      lastMove: app.game.lastMove || null
    };
  }

  function listenForFallbackState() {
    if (app.fallbackUnsubscribe) {
      return;
    }

    app.fallbackUnsubscribe = AppFirebase.subscribeRoom(app.roomId, function (roomData) {
      if (!roomData || roomData.transportMode !== "firestore") {
        return;
      }

      syncFromFallbackSnapshot(roomData);
    }, function (error) {
      setMessage("フォールバック監視でエラーが発生しました: " + error.message);
    });
  }

  function syncFromFallbackSnapshot(roomData) {
    var snapshotVersion;

    if (!roomData || !roomData.board) {
      return;
    }

    snapshotVersion = Number(roomData.version || 0);
    if (snapshotVersion < app.game.version) {
      return;
    }

    app.game.board = deserializeBoard(roomData.board);
    app.game.currentTurn = roomData.currentTurn || "";
    app.game.version = snapshotVersion;
    app.game.winner = roomData.winner || "";
    app.game.message = roomData.message || app.game.message;
    app.game.lastMove = roomData.lastMove || null;

    setMessage(app.game.message);
    renderBoard();
    updateRematchUI();
  }

  function activateFirestoreFallback(reason) {
    if (!app.roomId) {
      return;
    }

    app.transportMode = "firestore";
    setTransportStatus("Firestore フォールバック");
    setModeStatus("フォールバック同期");
    setOpponentStatus("Firestore 経由で接続中");
    setMessage(reason + " 以後の対局同期は Firestore で行います。");
    stopP2PTimer();
    stopRoomSubscription();
    listenForFallbackState();

    AppFirebase.activateFallback(app.roomId, buildFallbackPayload(reason)).catch(function (error) {
      setMessage("Firestore フォールバックへの切り替えに失敗しました: " + error.message);
    });
  }

  function startP2PPlay() {
    if (app.transportMode === "p2p") {
      return;
    }

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
        broadcastMatchSettings(app.desiredHostColor, false);
      } catch (error) {
        activateFirestoreFallback("初期設定の送信に失敗しました。 " + error.message);
      }
      return;
    }

    setMessage("P2P 接続が確立されました。ホストの開始設定を待っています。");
    updateRoleUI();
  }

  function finalizeIncomingRematch() {
    if (!app.rematch.incoming || app.role !== "host") {
      return;
    }

    startRematch(!!app.rematch.incoming.swapColors);
  }

  function requestRematch(swapColors) {
    if (!AppPeer.isConnected()) {
      return;
    }

    app.rematch.outgoing = {
      swapColors: !!swapColors
    };
    app.rematch.incoming = null;
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
      activateFirestoreFallback("再戦リクエストの送信に失敗しました。 " + error.message);
    }
  }

  function persistFallbackMove() {
    AppFirebase.saveFallbackState(app.roomId, {
      board: serializeBoard(app.game.board),
      currentTurn: app.game.currentTurn || "",
      version: app.game.version,
      winner: app.game.winner || "",
      message: app.game.message,
      lastMove: app.game.lastMove || null
    }).catch(function (error) {
      setMessage("フォールバック時の盤面同期に失敗しました: " + error.message);
    });
  }

  function makeMove(row, col, color, source, incomingVersion) {
    var expectedVersion = app.game.version + 1;
    var applied;
    var moveMessage;

    if (incomingVersion && incomingVersion !== expectedVersion) {
      activateFirestoreFallback("ピア間で盤面バージョンの不一致を検出しました。");
      return false;
    }

    applied = applyMove(app.game.board, row, col, color);

    if (!applied) {
      if (source === "remote") {
        activateFirestoreFallback("相手から無効な手が送信されました。");
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
    setMessage(moveMessage);
    renderBoard();
    updateRematchUI();

    if (app.transportMode === "firestore") {
      persistFallbackMove();
    }

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
        activateFirestoreFallback("P2P 送信に失敗しました。 " + error.message);
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
      applyMatchSettings(data.hostColor, !!data.isRematch);
      return;
    }

    if (data.type === "rematch_request") {
      app.rematch.incoming = {
        swapColors: !!data.swapColors
      };
      app.rematch.outgoing = null;
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

    syncOpponentProfile(roomData);

    if (roomData.transportMode === "firestore") {
      app.transportMode = "firestore";
      setTransportStatus("Firestore フォールバック");
      setModeStatus("フォールバック同期");
      setOpponentStatus(roomData.guestUserId ? "Firestore 経由で接続中" : "ゲスト待機中");
      stopP2PTimer();
      stopRoomSubscription();
      listenForFallbackState();
      syncFromFallbackSnapshot(roomData);
      updateRoleUI();
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

    app.roomUnsubscribe = AppFirebase.subscribeRoom(app.roomId, handleRoomSnapshot, function (error) {
      setMessage("ルーム監視でエラーが発生しました: " + error.message);
    });
  }

  function buildRoomPayload() {
    return {
      roomId: app.roomId,
      hostUserId: app.userId,
      hostDisplayName: app.displayName,
      hostPictureUrl: app.pictureUrl || "",
      guestUserId: "",
      guestDisplayName: "",
      guestPictureUrl: "",
      hostPeerId: app.peerId,
      guestPeerId: "",
      status: "waiting",
      transportMode: "p2p"
    };
  }

  function createHostRoom(roomId) {
    app.role = "host";
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
    resetGameState();

    return AppFirebase.createRoom(roomId, buildRoomPayload()).then(function () {
      subscribeToRoom();
      updateRoleUI();
    });
  }

  function joinAsGuest(roomData) {
    app.role = "guest";
    app.myColor = WHITE;
    updateRoleUI();
    syncOpponentProfile(roomData);
    setTransportStatus("ホスト待機中");
    setModeStatus("マッチング");
    setOpponentStatus("ルーム参加中…");
    setMessage("ルームに参加しました。ホストが P2P 接続を開始するまで待機します。");
    app.currentHostColor = "";
    app.matchConfigured = false;
    app.myColor = "";
    clearRematchState();
    resetGameState();

    return AppFirebase.updateRoom(app.roomId, {
      guestUserId: app.userId,
      guestDisplayName: app.displayName,
      guestPictureUrl: app.pictureUrl || "",
      guestPeerId: app.peerId,
      status: "ready"
    }).then(function () {
      subscribeToRoom();
      startP2PTimer("着信 P2P 接続");
    });
  }

  function resumeExistingRole(roomData, role) {
    app.role = role;
    app.currentHostColor = "";
    app.matchConfigured = false;
    app.myColor = "";
    clearRematchState();
    updateRoleUI();
    syncOpponentProfile(roomData);
    resetGameState();

    if (roomData.transportMode === "firestore" && roomData.board) {
      app.transportMode = "firestore";
      setTransportStatus("Firestore フォールバック");
      setModeStatus("フォールバック同期");
      setOpponentStatus("Firestore 経由で接続中");
      stopP2PTimer();
      listenForFallbackState();
      syncFromFallbackSnapshot(roomData);
      return Promise.resolve();
    }

    setTransportStatus(role === "host" ? "ゲスト待機中" : "ホスト待機中");
    setModeStatus("マッチング");
    setOpponentStatus(role === "host" ? "ゲスト待機中" : "ホストからの接続を待っています…");
    setMessage("既存のルームに再接続しました。接続状態を確認しています。");
    subscribeToRoom();

    return refreshOwnPeerId(roomData).then(function () {
      if (role === "host" && roomData.guestPeerId) {
        tryConnectToGuest(roomData.guestPeerId);
      } else if (role === "guest") {
        startP2PTimer("着信 P2P 接続");
      }
    });
  }

  function refreshOwnPeerId(roomData) {
    if (app.role === "host" && (
        roomData.hostPeerId !== app.peerId ||
        roomData.hostDisplayName !== app.displayName ||
        roomData.hostPictureUrl !== (app.pictureUrl || ""))) {
      return AppFirebase.updateRoom(app.roomId, {
        hostPeerId: app.peerId,
        hostDisplayName: app.displayName,
        hostPictureUrl: app.pictureUrl || ""
      });
    }

    if (app.role === "guest" && (
        roomData.guestPeerId !== app.peerId ||
        roomData.guestDisplayName !== app.displayName ||
        roomData.guestPictureUrl !== (app.pictureUrl || ""))) {
      return AppFirebase.updateRoom(app.roomId, {
        guestPeerId: app.peerId,
        guestDisplayName: app.displayName,
        guestPictureUrl: app.pictureUrl || ""
      });
    }

    return Promise.resolve();
  }

  function loadOrCreateRoom() {
    var params = new URLSearchParams(window.location.search);
    var requestedRoomId = params.get("room");

    if (!requestedRoomId) {
      return createHostRoom(generateId("room"));
    }

    updateRoomUrl(requestedRoomId);

    return AppFirebase.getRoom(requestedRoomId).then(function (roomData) {
      if (!roomData) {
        return createHostRoom(requestedRoomId);
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
    return sanitizeForPeer(app.userId) + "-" + Math.random().toString(36).slice(2, 8);
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
        if (app.transportMode !== "firestore") {
          activateFirestoreFallback("P2P 接続が切断されました。");
        }
      },
      onConnectionError: function (error) {
        activateFirestoreFallback("P2P 接続エラーが発生しました: " + error.message);
      },
      onPeerError: function (error) {
        setMessage("PeerJS エラー: " + error.message);
      },
      onPeerDisconnected: function () {
        if (app.transportMode !== "firestore") {
          activateFirestoreFallback("ピアのシグナリング接続が切断されました。");
        }
      }
    });
  }

  function handleCopyLink() {
    if (!app.roomUrl) {
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(app.roomUrl).then(function () {
        setMessage("共有 URL をクリップボードにコピーしました。");
      }).catch(function () {
        setMessage("コピーに失敗しました。URL を手動でコピーしてください。");
      });
      return;
    }

    app.elements.shareUrl.select();
    document.execCommand("copy");
    setMessage("共有 URL をクリップボードにコピーしました。");
  }

  function handleNewRoom() {
    window.location.href = window.location.pathname;
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

    if (AppPeer.isConnected() && app.transportMode === "p2p") {
      try {
        broadcastMatchSettings(color, false);
      } catch (error) {
        activateFirestoreFallback("開始設定の送信に失敗しました。 " + error.message);
      }
    }
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
      activateFirestoreFallback("再戦承認の送信に失敗しました。 " + error.message);
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
    updateRematchUI();
    setMessage("再戦を承認しました。ホストの開始を待っています。");
  }

  function rejectRematch() {
    if (!AppPeer.isConnected()) {
      return;
    }

    clearRematchState();
    updateRematchUI();

    try {
      AppPeer.send({
        type: "rematch_reject"
      });
    } catch (error) {
      activateFirestoreFallback("再戦辞退の送信に失敗しました。 " + error.message);
      return;
    }

    setMessage("再戦を終了しました。");
  }

  function bootstrap() {
    cacheElements();
    createBoardUI();
    renderBoard();

    app.elements.copyLinkButton.addEventListener("click", handleCopyLink);
    app.elements.newRoomButton.addEventListener("click", handleNewRoom);
    app.elements.hostBlackButton.addEventListener("click", function () {
      handleHostColorChange(BLACK);
    });
    app.elements.hostWhiteButton.addEventListener("click", function () {
      handleHostColorChange(WHITE);
    });
    app.elements.sameRematchButton.addEventListener("click", function () {
      requestRematch(false);
    });
    app.elements.swapRematchButton.addEventListener("click", function () {
      requestRematch(true);
    });
    app.elements.acceptRematchButton.addEventListener("click", acceptRematch);
    app.elements.rejectRematchButton.addEventListener("click", rejectRematch);
    updateRoleUI();
    updateOpponentUI("", "");

    initLiffIdentity().then(function () {
      updateIdentityUI();
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
