(function (window) {
  var Game = window.OthelloGame;
  var Platform = window.OthelloPlatform;
  var Matchmaking = window.OthelloMatchmaking;
  var P2P_TIMEOUT_MS = 5000;
  var LOBBY_ROOM_ID = "lobby";

  function buildPageUrl(roomId, joinRequested) {
    var baseUrl = Platform.getAppBaseUrl();
    var currentParams = new URLSearchParams(window.location.search);
    var nextParams = new URLSearchParams();

    if (currentParams.get("vscode-livepreview") === "true") {
      nextParams.set("vscode-livepreview", "true");
    }

    if (roomId) {
      nextParams.set("room", roomId);
      if (joinRequested) {
        nextParams.set("join", "1");
      }
    }

    return nextParams.toString() ? (baseUrl + "?" + nextParams.toString()) : baseUrl;
  }

  function createState(ui) {
    return {
      ui: ui,
      userId: "",
      appVersion: window.APP_CONFIG && window.APP_CONFIG.appVersion ? window.APP_CONFIG.appVersion : "",
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
      reconnectTickTimer: null,
      reconnecting: false,
      reconnectReason: "",
      reconnectDeadline: 0,
      staleGuest: false,
      hostTransferred: false,
      localStartReady: false,
      remoteStartReady: false,
      spectatorMode: false,
      resumePending: false,
      resumeRequesterName: "",
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

    function syncReconnectTicker() {
      if (app.reconnecting) {
        if (!app.reconnectTickTimer) {
          app.reconnectTickTimer = window.setInterval(function () {
            ui.render(app);
          }, 250);
        }
        return;
      }

      if (app.reconnectTickTimer) {
        window.clearInterval(app.reconnectTickTimer);
        app.reconnectTickTimer = null;
      }
    }

    function renderView(skipPersistence) {
      ui.render(app);
      syncReconnectTicker();
      if (!skipPersistence && !app.pausePersistence) {
        saveLocalState();
      }
    }

    function render() {
      renderView(false);
    }

    function finishBoot() {
      if (window.document && window.document.body) {
        window.document.body.classList.remove("boot-loading");
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

    function clearResumeState() {
      app.spectatorMode = false;
      app.resumePending = false;
      app.resumeRequesterName = "";
    }

    function clearStartReady() {
      app.localStartReady = false;
      app.remoteStartReady = false;
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

    function updateRoomContext(roomId, joinRequested, skipHistory) {
      app.roomId = roomId || "";
      app.joinRequested = !!joinRequested;
      app.roomUrl = roomId ? buildPageUrl(roomId, true) : "";
      if (!skipHistory) {
        window.history.replaceState({}, "", buildPageUrl(roomId, joinRequested));
      }
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
        hostTransferred: app.hostTransferred,
        localStartReady: app.localStartReady,
        remoteStartReady: app.remoteStartReady,
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
        return false;
      }

      app.opponentMode = saved.opponentMode || app.opponentMode;
      app.desiredHostColor = saved.desiredHostColor || app.desiredHostColor;
      app.currentHostColor = saved.currentHostColor || app.currentHostColor;
      app.hostTransferred = !!saved.hostTransferred;
      app.localStartReady = !!saved.localStartReady;
      app.remoteStartReady = !!saved.remoteStartReady;
      app.matchConfigured = !!saved.matchConfigured;
      app.myColor = saved.myColor || app.myColor;
      clearResumeState();
      if (saved.game && saved.game.board) {
        app.game = saved.game;
      }
      return true;
    }

    function getRemotePeerId() {
      return Matchmaking.getRemotePeerId(app.roomData, app.role);
    }

    function buildPeerId() {
      var userPart = Platform.sanitizeForPeer(app.userId).slice(0, 16);
      var roomPart = Platform.sanitizeForPeer(app.roomId || LOBBY_ROOM_ID).slice(-10);
      return userPart + "-" + roomPart;
    }

    function prepareRoomContext() {
      var params = new URLSearchParams(window.location.search);
      updateRoomContext(params.get("room") || "", params.get("join") === "1", true);
    }

    function syncBrowserUrl() {
      window.history.replaceState({}, "", buildPageUrl(app.roomId, app.joinRequested));
    }

    function isActiveMatch() {
      return !app.game.winner && (app.matchConfigured || !!app.game.lastMove);
    }

    function applyPromotedHostRoom(roomData) {
      app.role = "host";
      app.joinRequested = false;
      app.hostTransferred = true;
      app.staleGuest = false;
      app.pendingPeerTarget = "";
      app.roomData = roomData || app.roomData || {};
      app.roomData.roomId = app.roomId;
      app.roomData.hostUserId = app.userId;
      app.roomData.hostPeerId = app.peerId;
      app.roomData.guestUserId = "";
      app.roomData.guestPeerId = "";
      app.roomData.status = "waiting";
      syncBrowserUrl();
    }

    function promoteCurrentGuestToHost(reason) {
      var activeMatch = isActiveMatch();
      var nextHostColor = app.myColor || app.currentHostColor || app.desiredHostColor || Game.BLACK;

      if (app.role !== "guest" || app.opponentMode === "com" || !app.roomId) {
        return Promise.resolve(false);
      }

      stopRoomSubscription();
      setTransport("ルーム引継ぎ中");
      setMode(activeMatch ? "COM 引継ぎ" : "マッチング");
      setOpponentStatus("ホスト譲渡中");
      setMessage(reason + " このルームを引き継いでいます。");

      return Matchmaking.promoteGuestToHost(app.roomId, app.userId, app.peerId).then(function () {
        applyPromotedHostRoom();
        app.currentHostColor = nextHostColor;
        app.desiredHostColor = nextHostColor;

        if (activeMatch) {
          play.switchToCom(reason + " このルームを引き継ぎました。");
        } else {
          app.opponentMode = "human";
          app.transportMode = "matchmaking";
          clearStartReady();
          app.matchConfigured = false;
          app.myColor = "";
          clearResumeState();
          clearRematch();
          resetGame();
          setOpponentProfile("参加待ち", "");
          setTransport("ゲスト待機中");
          setMode("マッチング");
          setOpponentStatus("このルームを引き継ぎました");
          setMessage("ホストの復帰待ちは終了しました。このルームを引き継いだので、友だちを待つか COM に切り替えられます。");
          subscribeToRoom();
        }
        render();
        return true;
      }).catch(function () {
        return false;
      });
    }

    function reopenHostWaitingRoom(reason) {
      if (app.role !== "host" || app.opponentMode === "com" || !app.roomId || isActiveMatch()) {
        return Promise.resolve(false);
      }

      stopRoomSubscription();
      setTransport("待機へ戻しています");
      setMode("マッチング");
      setOpponentStatus("参加待ちへ戻しています");
      setMessage(reason + " 相手の席を開放して待機状態へ戻しています。");

      return Matchmaking.resetHostRoom(app.roomId, app.userId, app.peerId).then(function () {
        app.roomData = app.roomData || {};
        app.roomData.roomId = app.roomId;
        app.roomData.hostUserId = app.userId;
        app.roomData.hostPeerId = app.peerId;
        app.roomData.guestUserId = "";
        app.roomData.guestPeerId = "";
        app.roomData.status = "waiting";
        app.staleGuest = false;
        app.hostTransferred = false;
        app.opponentMode = "human";
        app.currentHostColor = "";
        clearStartReady();
        app.matchConfigured = false;
        app.myColor = "";
        clearResumeState();
        clearRematch();
        resetGame();
        setOpponentProfile("参加待ち", "");
        setTransport("ゲスト待機中");
        setMode("マッチング");
        setOpponentStatus("ゲスト待機中");
        setMessage("相手の復帰待ちは終了しました。新しく参加を待つか、COM に切り替えられます。");
        subscribeToRoom();
        render();
        return true;
      }).catch(function () {
        return false;
      });
    }

    function handleReconnectTimeout(reason) {
      if (app.role === "guest" && app.opponentMode === "human") {
        return promoteCurrentGuestToHost(reason);
      }
      if (app.role === "host" && app.opponentMode === "human") {
        return reopenHostWaitingRoom(reason);
      }
      return false;
    }

    var play = window.OthelloPlay.create(app, {
      clearRematch: clearRematch,
      getRemotePeerId: getRemotePeerId,
      onReconnectTimeout: handleReconnectTimeout,
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
          setOpponentStatus(app.staleGuest ? "切断済み" : "ゲストが参加しました");
        } else if (app.role === "guest") {
          setOpponentStatus(roomData.hostPeerId ? "ホストからの接続を待っています…" : "ホストの準備待ちです");
        }
        if (getRemotePeerId() && !app.staleGuest) {
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
      var entry;

      if (!app.roomId) {
        app.roomData = null;
        app.role = "";
        app.opponentMode = "human";
        app.currentHostColor = "";
        app.hostTransferred = false;
        clearStartReady();
        app.matchConfigured = false;
        app.myColor = "";
        clearResumeState();
        clearRematch();
        app.pausePersistence = true;
        resetGame();
        app.pausePersistence = false;
        setTransport("未接続");
        setOpponentStatus("待機中…");
        setMode("ロビー");
        setOpponentProfile("参加待ち", "");
        setMessage("ルームIDを入力するか、新しいルームを作成してください。");
        return Promise.resolve();
      }

      entry = Matchmaking.resolveEntry(roomData, app.userId, app.joinRequested);
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
      app.hostTransferred = false;
      clearStartReady();
      app.matchConfigured = false;
      app.myColor = "";
      clearResumeState();
      clearRematch();
      app.pausePersistence = true;
      resetGame();
      app.staleGuest = false;
      app.hadLocalSession = restoreLocalState();
      app.pausePersistence = false;
      render();

      if (entry === "resume-host" &&
          !!roomData.guestUserId &&
          !app.hadLocalSession &&
          !app.joinRequested) {
        app.staleGuest = true;
        setOpponentProfile("参加待ち", "");
      }

      if (entry === "create-host") {
        setTransport("ゲスト待機中");
        setOpponentStatus("ゲスト待機中");
        setMode("マッチング");
        setOpponentProfile("参加待ち", "");
        setMessage("ルームを作成しました。友だちを招待して参加を待っています。");
        return Matchmaking.createHostRoom(app.roomId, app.userId, app.peerId).then(function () {
          subscribeToRoom();
        });
      }

      if (entry === "join-guest") {
        setTransport("ホスト待機中");
        setOpponentStatus("ルーム参加中…");
        setMode("マッチング");
        setMessage("ルームに参加しました。ホストが接続を始めるまで待っています。");
        return Matchmaking.joinGuestRoom(app.roomId, app.userId, app.peerId).then(function () {
          subscribeToRoom();
          startGuestWaitTimer();
        });
      }

      setTransport(entry === "resume-host" ? "ゲスト待機中" : "ホスト待機中");
      setOpponentStatus(entry === "resume-host" ?
        (app.staleGuest ? "切断済み" : "ゲスト待機中") :
        "ホストからの接続を待っています…");
      setMode("マッチング");
      setMessage(app.staleGuest ?
        "以前の対戦相手は切断済みです。再接続を待つか、COM に切り替えられます。" :
        "既存のルームに再接続しました。接続状態を確認しています。");
      subscribeToRoom();
      if (getRemotePeerId() && !app.staleGuest) {
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
      clearResumeState();
      clearStartReady();
      app.currentHostColor = "";
      app.matchConfigured = false;
      app.myColor = "";
      clearRematch();
      resetGame();
      setOpponentProfile("参加待ち", "");
      setTransport("ゲスト待機中");
      setMode("マッチング");
      setOpponentStatus("ゲスト待機中");
      setMessage("友だちとの対戦に戻しました。相手の参加を待っています。");
      subscribeToRoom();
    }

    function selectComMode() {
      if (app.role !== "host" || AppPeer.isConnected() || app.game.lastMove || app.game.winner) {
        setMessage("対戦相手の種類は、接続前かつ対局前のみ変更できます。");
        return;
      }
      app.opponentMode = "com";
      app.transportMode = "com";
      clearResumeState();
      clearStartReady();
      app.currentHostColor = "";
      app.matchConfigured = false;
      app.myColor = "";
      stopRoomSubscription();
      clearRematch();
      resetGame();
      setOpponentProfile("COM", "");
      setTransport("ローカル");
      setMode("COM 準備");
      setOpponentStatus("START 待ち");
      setMessage("COM と練習できます。色を決めて START を押してください。");
    }

    function handleHostColorChange(color) {
      var canSyncWithPeer = app.opponentMode === "human" &&
        AppPeer.isConnected() &&
        !app.matchConfigured &&
        !app.game.lastMove &&
        !app.game.winner;

      if (app.role !== "host" && !canSyncWithPeer) {
        setMessage("色変更は、P2P 接続後の開始前のみ両者で変更できます。");
        return;
      }

      app.desiredHostColor = color;
      clearStartReady();
      render();
      if (canSyncWithPeer) {
        play.syncSetupState();
      }
    }

    function toggleHostColor() {
      handleHostColorChange(app.desiredHostColor === Game.BLACK ? Game.WHITE : Game.BLACK);
    }

    function bootstrapPeer() {
      return AppPeer.init(buildPeerId(), {
        onPeerOpen: function (peerId) { app.peerId = peerId; render(); },
        onIncomingConnection: function () { setOpponentStatus("ピア接続要求を受信しました"); },
        onConnectionOpen: play.startP2PPlay,
        onData: play.handlePeerData,
        onConnectionClose: function () {
          app.pendingPeerTarget = "";
          if (!play.handleResumeConnectionLost()) {
            play.beginReconnect("P2P 接続が切断されました。");
          }
        },
        onConnectionError: function (error) {
          app.pendingPeerTarget = "";
          if (!play.handleResumeConnectionLost()) {
            play.beginReconnect("P2P 接続エラーが発生しました: " + error.message);
          }
        },
        onPeerError: function (error) { setMessage("PeerJS エラー: " + error.message); },
        onPeerDisconnected: function () {
          app.pendingPeerTarget = "";
          if (!play.handleResumeConnectionLost()) {
            play.beginReconnect("ピアのシグナリング接続が切断されました。");
          }
        }
      });
    }

    return {
      bootstrap: function () {
        prepareRoomContext();
        ui.bind({
          onBoardClick: function (event) {
            if (app.myColor && !app.spectatorMode && !app.resumePending && app.game.currentTurn === app.myColor && !app.game.winner) {
              play.sendMove(Number(event.currentTarget.getAttribute("data-row")), Number(event.currentTarget.getAttribute("data-col")));
            }
          },
          onJoinRoom: function () {
            var roomId = ui.getRoomInput();
            if (!roomId) {
              setMessage("参加したいルームIDを入力してください。");
            } else if (roomId === app.roomId) {
              if (app.reconnecting) {
                setMessage("再接続は上のバナーから行えます。");
              } else {
                setMessage("現在このルームを開いています。別のルームIDを入力してください。");
              }
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
            if (!app.roomUrl) {
              setMessage("先にルームを作成してから招待してください。");
              return;
            }
            Platform.shareRoom(app.roomId, app.roomUrl).then(function (result) {
              setMessage(result.message);
            });
          },
          onNewRoom: function () { window.location.href = buildPageUrl(Platform.generateId("room"), false); },
          onRetryReconnect: play.retryReconnectNow,
          onHardReload: function () { AppPeer.disconnect(); Platform.reload(buildPageUrl(app.roomId, app.joinRequested), true); },
          onStartGame: play.startMatch,
          onResumeContinue: play.resumeCurrentGame,
          onResumeRestart: play.restartReturnedGame,
          onSelectHuman: selectHumanMode,
          onSelectCom: selectComMode,
          onSwapColors: toggleHostColor,
          onResultPrimary: function () {
            if (app.rematch.incoming) {
              play.acceptRematch();
            } else if (!app.rematch.outgoing) {
              play.requestRematch();
            }
          },
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
        Platform.loadVersionInfo().then(function (version) {
          if (version) {
            app.appVersion = version;
            render();
          }
        });
        Platform.initIdentity().then(function (identity) {
          app.userId = identity.userId;
          app.displayName = identity.displayName;
          app.pictureUrl = identity.pictureUrl;
          syncBrowserUrl();
          render();
          Matchmaking.init();
          return bootstrapPeer();
        }).then(function () {
          if (!app.roomId) {
            return handleRoomEntry(null);
          }
          return Matchmaking.fetchRoom(app.roomId).then(handleRoomEntry);
        }).then(function () {
          finishBoot();
        }).catch(function (error) {
          finishBoot();
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
