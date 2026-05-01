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

  function isCompactMobile() {
    return window.innerWidth <= 640;
  }

  function isHumanP2PSetup(app) {
    return app.opponentMode === "human" &&
      app.transportMode === "p2p" &&
      !app.matchConfigured &&
      !app.game.lastMove &&
      !app.game.winner;
  }

  function getMyLabel(app) {
    var label = isCompactMobile() ? "私" : "あなた (You)";
    if (app.myColor) {
      return label + " (" + Game.colorName(app.myColor) + ")";
    }
    if (app.role === "host") {
      return label + " (" + Game.colorName(app.desiredHostColor) + "予定)";
    }
    if (app.role === "guest" && app.opponentMode === "human" && !app.matchConfigured) {
      return label + " (" + Game.colorName(Game.getOpponent(app.desiredHostColor)) + "予定)";
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
    if (app.role === "guest" && app.opponentMode === "human" && !app.matchConfigured) {
      return label + " (" + Game.colorName(app.desiredHostColor) + "予定)";
    }
    return label;
  }

  function getOpponentName(app) {
    if (app.staleGuest) {
      return "参加待ち";
    }
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

  function getMyStatusText(app) {
    if (app.spectatorMode) {
      return "観戦中";
    }
    if (app.resumePending) {
      return "再開方法を選択中";
    }
    if (isHumanP2PSetup(app)) {
      return app.localStartReady ? "START 準備OK" : "START 前";
    }
    if (app.opponentMode === "com" && !app.matchConfigured && !app.game.lastMove && !app.game.winner) {
      return "START 待ち";
    }
    return app.role ? "接続済み" : "待機中…";
  }

  function getOpponentStatusText(app) {
    if (app.spectatorMode) {
      return "選択待ち";
    }
    if (app.resumePending) {
      return "復帰しました";
    }
    if (isHumanP2PSetup(app)) {
      return app.remoteStartReady ? "START 準備OK" : "START 前";
    }
    return app.status.opponent;
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
    return app.reconnectReason + " 相手との接続を戻しています。[あと" +
      remainingSeconds + "秒待ち] 戻れなければ COM に切り替わります。";
  }

  function shouldShowMessageBox(app) {
    if (!app.status.message || app.reconnecting) {
      return false;
    }

    if (app.game.lastMove || app.game.winner || app.rematch.incoming || app.rematch.outgoing) {
      return true;
    }

    if (/エラー|失敗|満室|見つかりません|コピー|送信|終了/.test(app.status.message)) {
      return true;
    }

    if (!app.roomId || app.status.mode === "ロビー" || app.status.mode === "マッチング") {
      return false;
    }

    if (app.status.mode.indexOf("準備") !== -1) {
      return false;
    }

    return false;
  }

  function hasJoinedOpponent(app) {
    return app.opponentMode === "human" &&
      !!app.roomData &&
      !!app.roomData.guestUserId &&
      !app.staleGuest;
  }

  function getRoomFlow(app) {
    var joinedOpponent = hasJoinedOpponent(app);
    var isPlaying = app.matchConfigured || !!app.game.lastMove;

    if (!app.roomId) {
      return {
        label: "はじめる",
        title: "新しい対局を作るか、招待されたルームに参加します。",
        hint: "友だちと遊ぶ時は、先に対局を作ってから招待します。",
        toolsSummary: "別のルームに参加",
        joinLabel: "参加する",
        newRoomLabel: "新しい対局を作る",
        showCurrentRoom: false,
        showShare: false,
        actionNote: ""
      };
    }

    if (app.opponentMode === "com") {
      return {
        label: app.hostTransferred ? "引継ぎ中" : "ひとりで",
        title: "このルームで対局を進めます。",
        hint: app.hostTransferred && (app.matchConfigured || app.game.lastMove) && !app.game.winner ?
          "このルームはあなたが引き継ぎました。相手が戻ると、今の盤面から再開するか選べます。" :
          "ひとりで練習します。色を決めて START を押します。",
        toolsSummary: "別のルームに参加 / 新しい対局",
        joinLabel: "別のルームに参加",
        newRoomLabel: "別の対局を作る",
        showCurrentRoom: true,
        showShare: false,
        actionNote: "招待は使いません"
      };
    }

    if (app.role === "host" && !joinedOpponent && !isPlaying && !app.game.winner) {
      return {
        label: app.hostTransferred ? "引継ぎ済み" : "招待中",
        title: app.hostTransferred ? "このルームを引き継ぎました。" : "このルームで対局を進めます。",
        hint: app.hostTransferred ?
          "友だちの参加を待つか、COM に切り替えて続けられます。" :
          "友だちを招待して参加を待っています。",
        toolsSummary: "別のルームに参加 / 新しい対局",
        joinLabel: "別のルームに参加",
        newRoomLabel: "別の対局を作る",
        showCurrentRoom: true,
        showShare: true,
        actionNote: ""
      };
    }

    if (app.role === "guest" && !isPlaying && !app.game.winner) {
      return {
        label: "参加中",
        title: "このルームで対局を進めます。",
        hint: "相手とつながると、色を決めて2人で START します。",
        toolsSummary: "別のルームに参加 / 新しい対局",
        joinLabel: "別のルームに参加",
        newRoomLabel: "別の対局を作る",
        showCurrentRoom: true,
        showShare: false,
        actionNote: ""
      };
    }

    if (app.role === "host" && joinedOpponent && !isPlaying && !app.game.winner) {
      return {
        label: "準備完了",
        title: "このルームで対局を進めます。",
        hint: "相手とつながると、色を決めて2人で START します。",
        toolsSummary: "別のルームに参加 / 新しい対局",
        joinLabel: "別のルームに参加",
        newRoomLabel: "別の対局を作る",
        showCurrentRoom: true,
        showShare: false,
        actionNote: ""
      };
    }

    return {
      label: app.game.winner ? "対局終了" : "対局中",
      title: app.game.winner ?
        "このルームで対局を終えました。" :
        "このルームで対局を進めています。",
      hint: "別のルームへ移る時だけ、下のメニューを使います。",
      toolsSummary: "別のルームに参加 / 新しい対局",
      joinLabel: "別のルームに参加",
      newRoomLabel: "別の対局を作る",
      showCurrentRoom: true,
      showShare: false,
      actionNote: ""
    };
  }

  function getResultCaption(app) {
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
    if (app.game.winner || app.matchConfigured || app.reconnecting || app.resumePending || app.spectatorMode) {
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
    return app.desiredHostColor === Game.BLACK ?
      "あなたが黒です。2人とも START を押すと対局が始まります。" :
      "相手が黒です。2人とも START を押すと対局が始まります。";
  }

  function create(documentRef) {
    var elements = {
      board: documentRef.getElementById("board"),
      roomInput: documentRef.getElementById("roomInput"),
      versionBadge: documentRef.getElementById("versionBadge"),
      roomStateLabel: documentRef.getElementById("roomStateLabel"),
      roomStateTitle: documentRef.getElementById("roomStateTitle"),
      roomStateHint: documentRef.getElementById("roomStateHint"),
      roomCurrentRow: documentRef.getElementById("roomCurrentRow"),
      roomCurrentId: documentRef.getElementById("roomCurrentId"),
      hostInviteActions: documentRef.getElementById("hostInviteActions"),
      roomActionRow: documentRef.getElementById("roomActionRow"),
      roomActionNote: documentRef.getElementById("roomActionNote"),
      roomTools: documentRef.getElementById("roomTools"),
      roomToolsSummary: documentRef.getElementById("roomToolsSummary"),
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
      resumeNotice: documentRef.getElementById("resumeNotice"),
      resumeText: documentRef.getElementById("resumeText"),
      resumeActions: documentRef.getElementById("resumeActions"),
      resumeContinueButton: documentRef.getElementById("resumeContinueButton"),
      resumeRestartButton: documentRef.getElementById("resumeRestartButton"),
      startOverlay: documentRef.getElementById("startOverlay"),
      startWord: documentRef.getElementById("startWord"),
      startCaption: documentRef.getElementById("startCaption"),
      startButton: documentRef.getElementById("startButton"),
      hostSetupPanel: documentRef.getElementById("hostSetupPanel"),
      hostSetupOpponentSlot: documentRef.getElementById("hostSetupOpponentSlot"),
      humanOpponentButton: documentRef.getElementById("humanOpponentButton"),
      comOpponentButton: documentRef.getElementById("comOpponentButton"),
      hostColorSwapButton: documentRef.getElementById("hostColorSwapButton"),
      controlHint: documentRef.getElementById("controlHint"),
      messageBox: documentRef.getElementById("messageBox"),
      transportStatus: documentRef.getElementById("transportStatus"),
      modeStatus: documentRef.getElementById("modeStatus"),
      roomSummary: documentRef.getElementById("roomSummary"),
      peerSummary: documentRef.getElementById("peerSummary"),
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
        elements.resumeContinueButton.addEventListener("click", handlers.onResumeContinue);
        elements.resumeRestartButton.addEventListener("click", handlers.onResumeRestart);
        elements.startButton.addEventListener("click", handlers.onStartGame);
        elements.humanOpponentButton.addEventListener("click", handlers.onSelectHuman);
        elements.comOpponentButton.addEventListener("click", handlers.onSelectCom);
        elements.hostColorSwapButton.addEventListener("click", handlers.onSwapColors);
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
        var outcome = Game.outcomeForColor(app.game.winner, app.myColor || Game.BLACK);
        var roomFlow = getRoomFlow(app);
        var showMessage = shouldShowMessageBox(app);
        var isOpponentTurn = !!app.myColor && !!currentTurn && currentTurn === Game.getOpponent(app.myColor);
        var isMyTurn = !!app.myColor && !!currentTurn && currentTurn === app.myColor;

        if (app.myColor) {
          myCardColor = app.myColor;
          opponentCardColor = Game.getOpponent(app.myColor);
        } else if (app.role === "host") {
          myCardColor = app.desiredHostColor;
          opponentCardColor = Game.getOpponent(app.desiredHostColor);
        }

        this.setRoomInput(app.roomId);
        setText(elements.versionBadge, app.appVersion || "dev");
        setText(elements.roomStateLabel, roomFlow.label);
        setText(elements.roomStateTitle, roomFlow.title);
        setText(elements.roomStateHint, roomFlow.hint);
        setText(elements.roomToolsSummary, roomFlow.toolsSummary);
        setText(elements.joinRoomButton, roomFlow.joinLabel);
        setText(elements.newRoomButton, roomFlow.newRoomLabel);
        setText(elements.roomCurrentId, app.roomId ? ("ルームID: " + app.roomId) : "ルーム未作成");
        setText(elements.myLabel, getMyLabel(app));
        setText(elements.opponentLabel, getOpponentLabel(app));
        setText(elements.myName, app.displayName || "あなた");
        setText(elements.opponentName, getOpponentName(app));
        setText(elements.myStatus, getMyStatusText(app));
        setText(elements.opponentStatus, getOpponentStatusText(app));
        setText(elements.myScore, String(app.myColor ? (app.myColor === Game.BLACK ? counts.black : counts.white) : "-"));
        setText(elements.opponentScore, String(app.myColor ? (app.myColor === Game.BLACK ? counts.white : counts.black) : "-"));
        setHidden(elements.messageBox, !showMessage);
        if (showMessage) {
          setText(elements.messageBox, app.status.message);
        }
        setText(elements.transportStatus, app.status.transport);
        setText(elements.modeStatus, app.status.mode);
        setText(elements.roomSummary, app.roomId ? ("ルーム " + app.roomId) : "まだルームはありません");
        setText(elements.peerSummary, app.peerId ? ("ピアID " + app.peerId) : "シグナリングサーバーに接続中…");
        setAvatar(elements.myAvatar, app.displayName || "あなた", app.pictureUrl || "");
        setAvatar(elements.opponentAvatar, app.opponentDisplayName || "相手", app.opponentPictureUrl || "");
        setHidden(elements.roomCurrentRow, !roomFlow.showCurrentRoom);
        setHidden(elements.copyRoomIdButton, !app.roomId);
        setHidden(elements.roomActionRow, !app.roomId);
        setHidden(elements.shareButton, !roomFlow.showShare);
        setHidden(elements.roomActionNote, roomFlow.showShare || !roomFlow.actionNote);
        if (!roomFlow.showShare && roomFlow.actionNote) {
          setText(elements.roomActionNote, roomFlow.actionNote);
        }
        if (!app.roomId) {
          elements.roomTools.open = true;
        }
        elements.newRoomButton.classList.toggle("button-primary", !app.roomId);
        elements.newRoomButton.classList.toggle("button-secondary", !!app.roomId);
        setCardColorClass(elements.myCard, myCardColor);
        setCardColorClass(elements.opponentCard, opponentCardColor);
        elements.myCard.classList.toggle("active-turn", !!app.myColor && !!currentTurn && currentTurn === app.myColor);
        elements.opponentCard.classList.toggle("active-turn", isOpponentTurn);

        setHidden(elements.reconnectNotice, !app.reconnecting);
        if (app.reconnecting) {
          setText(elements.reconnectText, getReconnectText(app));
        }

        setHidden(elements.resumeNotice, !(app.resumePending || app.spectatorMode));
        setHidden(elements.resumeActions, !app.resumePending);
        if (app.resumePending) {
          setText(elements.resumeText,
            (app.resumeRequesterName || "相手") + " が戻りました。今の盤面から再開するか、最初からやり直すか選んでください。");
        } else if (app.spectatorMode) {
          setText(elements.resumeText, "相手が COM で継続中です。今の盤面を表示しています。再開方法の選択を待っています。");
        }

        setHidden(elements.hostSetupPanel, !(
          app.transportMode !== "reconnecting" &&
          !app.matchConfigured &&
          !app.game.lastMove &&
          !app.game.winner &&
          ((app.role === "host") || isHumanP2PSetup(app))
        ));
        setHidden(elements.hostSetupOpponentSlot, app.role !== "host" ||
          (app.opponentMode === "human" &&
          !!app.roomData &&
          !!app.roomData.guestUserId &&
          !app.staleGuest));
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
          (isHumanP2PSetup(app) ?
            "黒が先手です。色を変えると START 準備は解除されます。" :
            "黒が先手です。相手とつながったら 2人で START します。"));

        setHidden(elements.startOverlay, !shouldShowStartOverlay(app));
        if (shouldShowStartOverlay(app)) {
          setText(elements.startWord, "START");
          setText(elements.startCaption, getStartCaption(app));
          setText(elements.startButton, app.opponentMode === "human" && app.localStartReady ? "準備OK" : "START");
          elements.startButton.disabled = app.opponentMode === "com" ? app.role !== "host" : !!app.localStartReady;
        }

        setHidden(elements.resultOverlay, !app.game.winner || app.resultOverlayDismissed);
        elements.resultOverlay.classList.toggle("visible", !!app.game.winner && !app.resultOverlayDismissed);
        elements.resultOverlay.classList.toggle("result-win", outcome === "win");
        elements.resultOverlay.classList.toggle("result-draw", outcome === "draw");
        elements.resultOverlay.classList.toggle("result-lose", outcome === "lose");
        setText(elements.resultWord, outcome === "draw" ? "DRAW" : (outcome === "win" ? "WIN" : "LOSE"));
        setText(elements.resultCaption, getResultCaption(app));
        setText(elements.resultScoreline, String(app.myColor === Game.BLACK ? counts.black : counts.white) + " - " +
          String(app.myColor === Game.BLACK ? counts.white : counts.black));
        setText(elements.resultPrimaryButton, app.rematch.outgoing ? "送信中" : "はい");
        setText(elements.resultSecondaryButton, app.rematch.outgoing ? "閉じる" : "いいえ");
        elements.resultPrimaryButton.disabled = !!app.rematch.outgoing;

        for (index = 0; index < buttons.length; index += 1) {
          button = buttons[index];
          row = Number(button.getAttribute("data-row"));
          col = Number(button.getAttribute("data-col"));
          key = row + "-" + col;
          cellValue = app.game.board[row][col];
          canPlay = false;

          if (!cellValue && !app.game.winner && !!validMap[key]) {
            button.className = isMyTurn ? "cell valid" : "cell opponent-valid";
          } else {
            button.className = "cell";
          }

          canPlay = !!app.myColor &&
            !app.spectatorMode &&
            !app.resumePending &&
            isMyTurn &&
            !app.game.winner &&
            !!validMap[key];

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
