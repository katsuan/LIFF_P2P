(function (window) {
  var Game = window.OthelloGame;
  var Platform = window.OthelloPlatform;
  var Matchmaking = window.OthelloMatchmaking;
  var P2P_TIMEOUT_MS = 5000;

  function buildPageUrl(roomId, joinRequested) {
    var url = window.location.origin + window.location.pathname + "?room=" + encodeURIComponent(roomId);
    return joinRequested ? (url + "&join=1") : url;
  }

  function createState(ui) {
    return {
      ui: ui,
      userId: "",
      displayName: "",
      pictureUrl: "",
      opponentDisplayName: "",
      opponentPictureUrl: "",
      peerId: "",
      roomId: "",
      roomUrl: "",
      joinRequested: false,
      role: "",
      myColor: "",
      opponentMode: "human",
      desiredHostColor: Game.BLACK,
      currentHostColor: "",
      matchConfigured: false,
      transportMode: "matchmaking",
      roomData: null,
      roomUnsubscribe: null,
      pendingPeerTarget: "",
      p2pTimer: null,
      reconnectTimer: null,
      reconnectRetryTimer: null,
      reconnecting: false,
      reconnectReason: "",
      reconnectDeadline: 0,
      comTimer: null,
      resultOverlayDismissed: false,
      pausePersistence: false,
      rematch: { outgoing: false, incoming: false },
      game: Game.createFreshGame(),
      status: {
        message: "LIFF、Firebase、PeerJS の初期化を待っています。",
        transport: "起動中…",
        opponent: "待機中…",
        mode: "マッチング"
      }
    };
  }

  function create() {
    var ui = window.OthelloUI.create(window.document);
    var app = createState(ui);
    var storagePrefix = "liff-p2p-session-";

    function render() {
      ui.render(app);
      if (!app.pausePersistence) {
        saveLocalState();
      }
    }

    function setMessage(text) {
      app.status.message = text;
      render();
    }

    function setTransport(text) {
      app.status.transport = text;
      render();
    }

    function setOpponentStatus(text) {
      app.status.opponent = text;
      render();
    }

    function setMode(text) {
      app.status.mode = text;
      render();
    }

    function stopTimer(key) {
      if (app[key]) {
        window.clearTimeout(app[key]);
        app[key] = null;
      }
    }

    function stopRoomSubscription() {
      if (app.roomUnsubscribe) {
        app.roomUnsubscribe();
        app.roomUnsubscribe = null;
      }
    }

    function clearRematch() {
      app.rematch.outgoing = false;
      app.rematch.incoming = false;
    }

    function resetGame() {
      app.game = Game.createFreshGame();
      app.resultOverlayDismissed = false;
      render();
    }

    function setOpponentProfile(name, pictureUrl) {
      app.opponentDisplayName = name || "参加待ち";
      app.opponentPictureUrl = pictureUrl || "";
      render();
    }

    function updateRoomContext(roomId, joinRequested) {
      app.roomId = roomId;
      app.joinRequested = !!joinRequested;
      app.roomUrl = buildPageUrl(roomId, true);
      window.history.replaceState({}, "", buildPageUrl(roomId, joinRequested));
      render();
    }

    function getStorageKey() {
      return storagePrefix + app.roomId;
    }

    function saveLocalState() {
      var payload;

      if (!app.roomId || !app.userId) {
        return;
      }

      payload = {
        userId: app.userId,
        role: app.role,
        opponentMode: app.opponentMode,
        desiredHostColor: app.desiredHostColor,
        currentHostColor: app.currentHostColor,
        matchConfigured: app.matchConfigured,
        myColor: app.myColor,
        game: app.game
      };

      try {
        window.sessionStorage.setItem(getStorageKey(), JSON.stringify(payload));
      } catch (error) {}
    }

    function restoreLocalState() {
      var raw;
      var saved;

      if (!app.roomId || !app.userId || !app.role) {
        return;
      }

      try {
        raw = window.sessionStorage.getItem(getStorageKey());
        saved = raw ? JSON.parse(raw) : null;
      } catch (error) {
        saved = null;
      }

      if (!saved || saved.userId !== app.userId || saved.role !== app.role) {
        return;
      }

      app.opponentMode = saved.opponentMode || app.opponentMode;
      app.desiredHostColor = saved.desiredHostColor || app.desiredHostColor;
      app.currentHostColor = saved.currentHostColor || app.currentHostColor;
      app.matchConfigured = !!saved.matchConfigured;
      app.myColor = saved.myColor || app.myColor;
      if (saved.game && saved.game.board) {
        app.game = saved.game;
      }
    }

    function getRemotePeerId() {
      return Matchmaking.getRemotePeerId(app.roomData, app.role);
    }

    function buildPeerId() {
      var userPart = Platform.sanitizeForPeer(app.userId).slice(0, 16);
      var roomPart = Platform.sanitizeForPeer(app.roomId).slice(-10);
      return userPart + "-" + roomPart;
    }

    function prepareRoomContext() {
      var params = new URLSearchParams(window.location.search);
      updateRoomContext(params.get("room") || Platform.generateId("room"), params.get("join") === "1");
    }

    var play = window.OthelloPlay.create(app, {
      clearRematch: clearRematch,
      getRemotePeerId: getRemotePeerId,
      render: render,
      resetGame: resetGame,
      setMessage: setMessage,
      setMode: setMode,
      setOpponentProfile: setOpponentProfile,
      setOpponentStatus: setOpponentStatus,
      setTransport: setTransport,
      stopRoomSubscription: stopRoomSubscription,
      stopTimer: stopTimer
    });

    function subscribeToRoom() {
      if (app.roomUnsubscribe || !app.roomId || app.opponentMode === "com") {
        return;
      }
      app.roomUnsubscribe = Matchmaking.subscribeRoom(app.roomId, function (roomData) {
        app.roomData = roomData;
        if (!roomData) {
          setOpponentStatus("利用不可");
          setMessage("ルームが見つかりません。");
          return;
        }
        if (app.role === "host" && roomData.guestUserId) {
          setOpponentStatus("ゲストが参加しました");
        } else if (app.role === "guest") {
          setOpponentStatus(roomData.hostPeerId ? "ホストからの接続を待っています…" : "ホストの準備待ちです");
        }
        if (getRemotePeerId()) {
          play.connectToRemotePeer(getRemotePeerId());
        }
      }, function (error) {
        setMessage("ルーム監視でエラーが発生しました: " + error.message);
      });
    }

    function startGuestWaitTimer() {
      stopTimer("p2pTimer");
      app.p2pTimer = window.setTimeout(function () {
        if (!AppPeer.isConnected()) {
          setMessage("着信 P2P 接続が5秒以内に完了しませんでした。相手の復帰を待つか、新しいルームを作成してください。");
        }
      }, P2P_TIMEOUT_MS);
    }

    function handleRoomEntry(roomData) {
      var entry = Matchmaking.resolveEntry(roomData, app.userId, app.joinRequested);
      app.roomData = roomData;

      if (entry === "missing") {
        setTransport("未接続");
        setOpponentStatus("ルームなし");
        setMessage("指定したルームIDが見つかりません。入力内容を確認してください。");
        return Promise.resolve();
      }
      if (entry === "full") {
        setTransport("満室");
        setOpponentStatus("利用不可");
        setMessage("このルームはすでに2人参加しています。");
        return Promise.resolve();
      }

      app.role = entry === "join-guest" || entry === "resume-guest" ? "guest" : "host";
      app.opponentMode = "human";
      app.currentHostColor = "";
      app.matchConfigured = false;
      app.myColor = "";
      clearRematch();
      app.pausePersistence = true;
      resetGame();
      restoreLocalState();
      app.pausePersistence = false;
      render();

      if (entry === "create-host") {
        setTransport("ゲスト待機中");
        setOpponentStatus("ゲスト待機中");
        setMode("マッチング");
        setOpponentProfile("参加待ち", "");
        setMessage("ルームを作成しました。URL を共有してゲストの参加を待ってください。Firestore にはルーム情報とピアIDだけを保持します。");
        return Matchmaking.createHostRoom(app.roomId, app.userId, app.peerId).then(function () {
          subscribeToRoom();
        });
      }

      if (entry === "join-guest") {
        setTransport("ホスト待機中");
        setOpponentStatus("ルーム参加中…");
        setMode("マッチング");
        setMessage("ルームに参加しました。ホストが P2P 接続を開始するまで待機します。");
        return Matchmaking.joinGuestRoom(app.roomId, app.userId, app.peerId).then(function () {
          subscribeToRoom();
          startGuestWaitTimer();
        });
      }

      setTransport(entry === "resume-host" ? "ゲスト待機中" : "ホスト待機中");
      setOpponentStatus(entry === "resume-host" ? "ゲスト待機中" : "ホストからの接続を待っています…");
      setMode("マッチング");
      setMessage("既存のルームに再接続しました。接続状態を確認しています。");
      subscribeToRoom();
      if (getRemotePeerId()) {
        play.connectToRemotePeer(getRemotePeerId());
      } else if (entry === "resume-guest") {
        startGuestWaitTimer();
      }
      return Promise.resolve();
    }

    function selectHumanMode() {
      if (app.role !== "host" || AppPeer.isConnected() || app.game.lastMove || app.game.winner) {
        setMessage("対戦相手の種類は、接続前かつ対局前のみ変更できます。");
        return;
      }
      app.opponentMode = "human";
      app.transportMode = "matchmaking";
      app.currentHostColor = "";
      app.matchConfigured = false;
      app.myColor = "";
      clearRematch();
      resetGame();
      setOpponentProfile("参加待ち", "");
      setTransport("ゲスト待機中");
      setMode("マッチング");
      setOpponentStatus("ゲスト待機中");
      setMessage("URL を共有してゲストの参加を待ってください。");
      subscribeToRoom();
    }

    function selectComMode() {
      if (app.role !== "host" || AppPeer.isConnected() || app.game.lastMove || app.game.winner) {
        setMessage("対戦相手の種類は、接続前かつ対局前のみ変更できます。");
        return;
      }
      app.opponentMode = "com";
      app.transportMode = "com";
      stopRoomSubscription();
      clearRematch();
      setOpponentProfile("COM", "");
      setTransport("ローカル");
      setMode("COM 対戦");
      setOpponentStatus("ローカル対戦");
      play.applyMatchSettings(app.desiredHostColor, false);
      setMessage("COM 対戦を開始しました。黒が先手です。");
    }

    function handleHostColorChange(color) {
      app.desiredHostColor = color;
      if (app.opponentMode === "com") {
        play.applyMatchSettings(color, false);
        return;
      }
      if (AppPeer.isConnected() && app.transportMode === "p2p" && !app.game.lastMove && !app.game.winner) {
        play.applyMatchSettings(color, false);
        AppPeer.send({ type: "settings", hostColor: color });
      }
      render();
    }

    function bootstrapPeer() {
      return AppPeer.init(buildPeerId(), {
        onPeerOpen: function (peerId) { app.peerId = peerId; render(); },
        onIncomingConnection: function () { setOpponentStatus("ピア接続要求を受信しました"); },
        onConnectionOpen: play.startP2PPlay,
        onData: play.handlePeerData,
        onConnectionClose: function () { app.pendingPeerTarget = ""; play.beginReconnect("P2P 接続が切断されました。"); },
        onConnectionError: function (error) { app.pendingPeerTarget = ""; play.beginReconnect("P2P 接続エラーが発生しました: " + error.message); },
        onPeerError: function (error) { setMessage("PeerJS エラー: " + error.message); },
        onPeerDisconnected: function () { app.pendingPeerTarget = ""; play.beginReconnect("ピアのシグナリング接続が切断されました。"); }
      });
    }

    return {
      bootstrap: function () {
        prepareRoomContext();
        ui.bind({
          onBoardClick: function (event) {
            if (app.myColor && app.game.currentTurn === app.myColor && !app.game.winner) {
              play.sendMove(Number(event.currentTarget.getAttribute("data-row")), Number(event.currentTarget.getAttribute("data-col")));
            }
          },
          onJoinRoom: function () {
            var roomId = ui.getRoomInput();
            if (!roomId) {
              setMessage("参加したいルームIDを入力してください。");
            } else if (roomId === app.roomId && app.joinRequested) {
              setMessage("現在このルームを開いています。");
            } else {
              window.location.href = buildPageUrl(roomId, true);
            }
          },
          onCopyRoomId: function () {
            if (!app.roomId) {
              setMessage("コピーできるルームIDがまだありません。");
              return;
            }
            Platform.copyText(app.roomId).then(function (copied) {
              setMessage(copied ? "ルームIDをコピーしました。" : "ルームIDのコピーに失敗しました。");
            });
          },
          onShareRoom: function () {
            Platform.shareRoom(app.roomId, app.roomUrl).then(function (result) {
              setMessage(result.message);
            });
          },
          onNewRoom: function () { window.location.href = window.location.pathname; },
          onRetryReconnect: play.retryReconnectNow,
          onHardReload: function () { AppPeer.disconnect(); Platform.reload(buildPageUrl(app.roomId, app.joinRequested), true); },
          onSelectHuman: selectHumanMode,
          onSelectCom: selectComMode,
          onSelectBlack: function () { handleHostColorChange(Game.BLACK); },
          onSelectWhite: function () { handleHostColorChange(Game.WHITE); },
          onResultPrimary: function () { if (app.rematch.incoming) { play.acceptRematch(); } else if (!app.rematch.outgoing) { play.requestRematch(); } },
          onResultSecondary: function () {
            if (app.rematch.incoming) {
              play.rejectRematch();
            } else {
              app.resultOverlayDismissed = true;
              setMessage("この試合を終了しました。続ける場合は新しいルームを作成するか、ページを開き直してください。");
            }
          },
          onResize: render
        });

        render();
        Platform.initIdentity().then(function (identity) {
          app.userId = identity.userId;
          app.displayName = identity.displayName;
          app.pictureUrl = identity.pictureUrl;
          render();
          Matchmaking.init();
          return bootstrapPeer();
        }).then(function () {
          return Matchmaking.fetchRoom(app.roomId).then(handleRoomEntry);
        }).catch(function (error) {
          setTransport("エラー");
          setOpponentStatus("利用不可");
          setMode("停止");
          setMessage(error.message || String(error));
        });
      }
    };
  }

  window.OthelloSession = { create: create };
}(window));
