(function (window, document) {
  var Game = window.OthelloGame;

  function setText(element, value) {
    if (element) {
      element.textContent = value;
    }
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

  function setAvatar(element, name, pictureUrl) {
    if (!element) {
      return;
    }
    element.style.backgroundImage = pictureUrl ? ('url("' + pictureUrl + '")') : "none";
    element.textContent = pictureUrl ? "" : (name || "?").charAt(0).toUpperCase();
  }

  function createBoardElements(boardElement, onCellClick) {
    var fragment = document.createDocumentFragment();
    var row;
    var col;
    var button;

    boardElement.innerHTML = "";
    for (row = 0; row < Game.BOARD_SIZE; row += 1) {
      for (col = 0; col < Game.BOARD_SIZE; col += 1) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "cell";
        button.setAttribute("data-row", row);
        button.setAttribute("data-col", col);
        button.setAttribute("aria-label", "マス " + row + " 行 " + col + " 列");
        button.addEventListener("click", onCellClick);
        fragment.appendChild(button);
      }
    }
    boardElement.appendChild(fragment);
  }

  function getRoleName(role) {
    if (role === "host") {
      return "ホスト";
    }
    if (role === "guest") {
      return "ゲスト";
    }
    return "未確定";
  }

  function isCompactMobile() {
    return window.innerWidth <= 640;
  }

  function getMyLabel(app) {
    var label = isCompactMobile() ? "私" : "あなた (You)";
    if (app.myColor) {
      return label + " (" + Game.colorName(app.myColor) + ")";
    }
    if (app.role === "host") {
      return label + " (" + Game.colorName(app.desiredHostColor) + "予定)";
    }
    return label;
  }

  function getOpponentLabel(app) {
    var label = app.opponentMode === "com" ? "COM" : (isCompactMobile() ? "相手" : "対戦相手");
    if (app.myColor) {
      return label + " (" + Game.colorName(Game.getOpponent(app.myColor)) + ")";
    }
    if (app.role === "host") {
      return label + " (" + Game.colorName(Game.getOpponent(app.desiredHostColor)) + "予定)";
    }
    return label;
  }

  function getOpponentName(app) {
    if (app.opponentDisplayName) {
      return app.opponentDisplayName;
    }
    if (app.opponentMode === "com") {
      return "COM";
    }
    if (app.roomData && ((app.role === "host" && app.roomData.guestUserId) || (app.role === "guest" && app.roomData.hostUserId))) {
      return "対戦相手";
    }
    return "参加待ち";
  }

  function setCardColorClass(element, color) {
    if (!element) {
      return;
    }
    element.classList.remove("color-black");
    element.classList.remove("color-white");
    if (color === Game.BLACK) {
      element.classList.add("color-black");
    } else if (color === Game.WHITE) {
      element.classList.add("color-white");
    }
  }

  function getReconnectText(app) {
    var remainingMs = Math.max(0, app.reconnectDeadline - Date.now());
    var remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return app.reconnectReason + " 相手との接続を戻しています。あと" +
      remainingSeconds + "秒待ち、戻れなければ COM に切り替わります。";
  }

  function getResultCaption(app) {
    if (app.debugResult) {
      return "アニメーション確認中です。";
    }
    if (app.rematch.incoming) {
      return "相手が再戦を希望しています。続けますか？";
    }
    if (app.rematch.outgoing) {
      return "再戦リクエストを送信しました。返答を待っています。";
    }
    if (app.opponentMode === "com") {
      return "COM と続けてもう一戦しますか？";
    }
    return "このルームで続けてもう一戦しますか？";
  }

  function shouldShowStartOverlay(app) {
    if (app.game.winner || app.matchConfigured || app.reconnecting) {
      return false;
    }
    if (app.opponentMode === "com") {
      return app.role === "host";
    }
    return app.transportMode === "p2p" && (app.role === "host" || app.role === "guest");
  }

  function getStartCaption(app) {
    if (app.opponentMode === "com") {
      return app.desiredHostColor === Game.BLACK ?
        "あなたが黒で始めます。STARTで練習を始めます。" :
        "COMが黒で始めます。STARTで練習を始めます。";
    }
    if (app.role === "host") {
      return app.desiredHostColor === Game.BLACK ?
        "あなたが黒です。STARTで対局を始めます。" :
        "相手が黒です。STARTで対局を始めます。";
    }
    return "ホストが START を押すと対局が始まります。";
  }

  function create(documentRef) {
    var elements = {
      board: documentRef.getElementById("board"),
      roomInput: documentRef.getElementById("roomInput"),
      versionBadge: documentRef.getElementById("versionBadge"),
      copyRoomIdButton: documentRef.getElementById("copyRoomIdButton"),
      joinRoomButton: documentRef.getElementById("joinRoomButton"),
      shareButton: documentRef.getElementById("shareButton"),
      newRoomButton: documentRef.getElementById("newRoomButton"),
      myCard: documentRef.getElementById("myCard"),
      opponentCard: documentRef.getElementById("opponentCard"),
      myAvatar: documentRef.getElementById("myAvatar"),
      opponentAvatar: documentRef.getElementById("opponentAvatar"),
      myLabel: documentRef.getElementById("myLabel"),
      opponentLabel: documentRef.getElementById("opponentLabel"),
      myName: documentRef.getElementById("myName"),
      opponentName: documentRef.getElementById("opponentName"),
      myStatus: documentRef.getElementById("myStatus"),
      opponentStatus: documentRef.getElementById("opponentStatus"),
      myScore: documentRef.getElementById("myScore"),
      opponentScore: documentRef.getElementById("opponentScore"),
      reconnectNotice: documentRef.getElementById("reconnectNotice"),
      reconnectText: documentRef.getElementById("reconnectText"),
      retryReconnectButton: documentRef.getElementById("retryReconnectButton"),
      reloadButton: documentRef.getElementById("reloadButton"),
      startOverlay: documentRef.getElementById("startOverlay"),
      startWord: documentRef.getElementById("startWord"),
      startCaption: documentRef.getElementById("startCaption"),
      startButton: documentRef.getElementById("startButton"),
      hostSetupPanel: documentRef.getElementById("hostSetupPanel"),
      humanOpponentButton: documentRef.getElementById("humanOpponentButton"),
      comOpponentButton: documentRef.getElementById("comOpponentButton"),
      hostColorSwapButton: documentRef.getElementById("hostColorSwapButton"),
      controlHint: documentRef.getElementById("controlHint"),
      messageBox: documentRef.getElementById("messageBox"),
      transportStatus: documentRef.getElementById("transportStatus"),
      modeStatus: documentRef.getElementById("modeStatus"),
      roomSummary: documentRef.getElementById("roomSummary"),
      peerSummary: documentRef.getElementById("peerSummary"),
      debugWinButton: documentRef.getElementById("debugWinButton"),
      debugLoseButton: documentRef.getElementById("debugLoseButton"),
      debugDrawButton: documentRef.getElementById("debugDrawButton"),
      debugClearButton: documentRef.getElementById("debugClearButton"),
      resultOverlay: documentRef.getElementById("resultOverlay"),
      resultWord: documentRef.getElementById("resultWord"),
      resultCaption: documentRef.getElementById("resultCaption"),
      resultScoreline: documentRef.getElementById("resultScoreline"),
      resultPrimaryButton: documentRef.getElementById("resultPrimaryButton"),
      resultSecondaryButton: documentRef.getElementById("resultSecondaryButton")
    };

    return {
      bind: function (handlers) {
        createBoardElements(elements.board, handlers.onBoardClick);
        elements.copyRoomIdButton.addEventListener("click", handlers.onCopyRoomId);
        elements.joinRoomButton.addEventListener("click", handlers.onJoinRoom);
        elements.shareButton.addEventListener("click", handlers.onShareRoom);
        elements.newRoomButton.addEventListener("click", handlers.onNewRoom);
        elements.retryReconnectButton.addEventListener("click", handlers.onRetryReconnect);
        elements.reloadButton.addEventListener("click", handlers.onHardReload);
        elements.startButton.addEventListener("click", handlers.onStartGame);
        elements.humanOpponentButton.addEventListener("click", handlers.onSelectHuman);
        elements.comOpponentButton.addEventListener("click", handlers.onSelectCom);
        elements.hostColorSwapButton.addEventListener("click", handlers.onSwapColors);
        elements.debugWinButton.addEventListener("click", handlers.onDebugWin);
        elements.debugLoseButton.addEventListener("click", handlers.onDebugLose);
        elements.debugDrawButton.addEventListener("click", handlers.onDebugDraw);
        elements.debugClearButton.addEventListener("click", handlers.onDebugClear);
        elements.resultPrimaryButton.addEventListener("click", handlers.onResultPrimary);
        elements.resultSecondaryButton.addEventListener("click", handlers.onResultSecondary);
        elements.roomInput.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            handlers.onJoinRoom();
          }
        });
        window.addEventListener("resize", handlers.onResize);
      },

      getRoomInput: function () {
        return String(elements.roomInput.value || "").trim();
      },

      setRoomInput: function (roomId) {
        if (documentRef.activeElement !== elements.roomInput) {
          elements.roomInput.value = roomId || "";
        }
      },

      render: function (app) {
        var buttons = elements.board.querySelectorAll(".cell");
        var validMoves = Game.getValidMoves(app.game.board, app.game.currentTurn);
        var validMap = Game.getMoveMap(validMoves);
        var counts = Game.countDiscs(app.game.board);
        var row;
        var col;
        var index;
        var button;
        var key;
        var cellValue;
        var canPlay;
        var myCardColor = "";
        var opponentCardColor = "";
        var currentTurn = app.game.currentTurn;
        var outcome = app.debugResult || Game.outcomeForColor(app.game.winner, app.myColor || Game.BLACK);
        var isDebugResult = !!app.debugResult;

        if (app.myColor) {
          myCardColor = app.myColor;
          opponentCardColor = Game.getOpponent(app.myColor);
        } else if (app.role === "host") {
          myCardColor = app.desiredHostColor;
          opponentCardColor = Game.getOpponent(app.desiredHostColor);
        }

        this.setRoomInput(app.roomId);
        setText(elements.versionBadge, app.appVersion || "dev");
        setText(elements.myLabel, getMyLabel(app));
        setText(elements.opponentLabel, getOpponentLabel(app));
        setText(elements.myName, app.displayName || "あなた");
        setText(elements.opponentName, getOpponentName(app));
        setText(elements.myStatus, "役割: " + getRoleName(app.role));
        setText(elements.opponentStatus, app.status.opponent);
        setText(elements.myScore, String(app.myColor ? (app.myColor === Game.BLACK ? counts.black : counts.white) : "-"));
        setText(elements.opponentScore, String(app.myColor ? (app.myColor === Game.BLACK ? counts.white : counts.black) : "-"));
        setText(elements.messageBox, app.status.message);
        setText(elements.transportStatus, app.status.transport);
        setText(elements.modeStatus, app.status.mode);
        setText(elements.roomSummary, app.roomId ? ("ルーム " + app.roomId) : "まだルームはありません");
        setText(elements.peerSummary, app.peerId ? ("ピアID " + app.peerId) : "シグナリングサーバーに接続中…");
        setAvatar(elements.myAvatar, app.displayName || "あなた", app.pictureUrl || "");
        setAvatar(elements.opponentAvatar, app.opponentDisplayName || "相手", app.opponentPictureUrl || "");
        setCardColorClass(elements.myCard, myCardColor);
        setCardColorClass(elements.opponentCard, opponentCardColor);
        elements.myCard.classList.toggle("active-turn", !!app.myColor && !!currentTurn && currentTurn === app.myColor);
        elements.opponentCard.classList.toggle("active-turn", !!app.myColor && !!currentTurn && currentTurn === Game.getOpponent(app.myColor));

        setHidden(elements.reconnectNotice, !app.reconnecting);
        if (app.reconnecting) {
          setText(elements.reconnectText, getReconnectText(app));
        }

        setHidden(elements.hostSetupPanel, !(app.role === "host" &&
          app.transportMode !== "reconnecting" &&
          !app.matchConfigured &&
          !app.game.lastMove &&
          !app.game.winner));
        elements.humanOpponentButton.classList.toggle("active", app.opponentMode === "human");
        elements.comOpponentButton.classList.toggle("active", app.opponentMode === "com");
        elements.hostColorSwapButton.classList.toggle("is-black-start", app.desiredHostColor === Game.BLACK);
        elements.hostColorSwapButton.classList.toggle("is-white-start", app.desiredHostColor === Game.WHITE);
        elements.hostColorSwapButton.setAttribute("aria-label", app.desiredHostColor === Game.BLACK ?
          "あなたが黒です。押すと白へ切り替えます。" :
          "あなたが白です。押すと黒へ切り替えます。");
        elements.hostColorSwapButton.setAttribute("title", app.desiredHostColor === Game.BLACK ?
          "あなたが黒です。押すと白へ切り替えます。" :
          "あなたが白です。押すと黒へ切り替えます。");
        setText(elements.controlHint, app.opponentMode === "com" ?
          "黒が先手です。COM はこの端末だけで動きます。" :
          "黒が先手です。相手とつながったら START で開始します。");

        setHidden(elements.startOverlay, !shouldShowStartOverlay(app));
        if (shouldShowStartOverlay(app)) {
          setText(elements.startWord, "START");
          setText(elements.startCaption, getStartCaption(app));
          setText(elements.startButton, app.role === "host" ? "START" : "待機中");
          elements.startButton.disabled = app.role !== "host";
        }

        setHidden(elements.resultOverlay, !(isDebugResult || app.game.winner) || app.resultOverlayDismissed);
        elements.resultOverlay.classList.toggle("visible", (isDebugResult || !!app.game.winner) && !app.resultOverlayDismissed);
        elements.resultOverlay.classList.toggle("result-win", outcome === "win");
        elements.resultOverlay.classList.toggle("result-draw", outcome === "draw");
        elements.resultOverlay.classList.toggle("result-lose", outcome === "lose");
        setText(elements.resultWord, outcome === "draw" ? "DRAW" : (outcome === "win" ? "WIN" : "LOSE"));
        setText(elements.resultCaption, getResultCaption(app));
        setText(elements.resultScoreline, isDebugResult ? "Animation Preview" :
          String(app.myColor === Game.BLACK ? counts.black : counts.white) + " - " +
          String(app.myColor === Game.BLACK ? counts.white : counts.black));
        setText(elements.resultPrimaryButton, isDebugResult ? "閉じる" : (app.rematch.outgoing ? "送信中" : "はい"));
        setText(elements.resultSecondaryButton, isDebugResult ? "戻る" : (app.rematch.outgoing ? "閉じる" : "いいえ"));
        elements.resultPrimaryButton.disabled = !isDebugResult && !!app.rematch.outgoing;

        for (index = 0; index < buttons.length; index += 1) {
          button = buttons[index];
          row = Number(button.getAttribute("data-row"));
          col = Number(button.getAttribute("data-col"));
          key = row + "-" + col;
          cellValue = app.game.board[row][col];
          canPlay = !!app.myColor &&
            app.game.currentTurn === app.myColor &&
            !app.game.winner &&
            !!validMap[key];

          button.className = canPlay ? "cell valid" : "cell";
          button.disabled = !canPlay;
          button.innerHTML = "";

          if (cellValue) {
            button.className = "cell";
            button.disabled = true;
            button.innerHTML = '<span class="disc ' + (cellValue === Game.BLACK ? "black" : "white") + '"></span>';
          }
        }
      }
    };
  }

  window.OthelloUI = { create: create };
}(window, document));
