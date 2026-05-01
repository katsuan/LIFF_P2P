(function (window) {
  var Game = window.OthelloGame;
  var RECONNECT_TIMEOUT_MS = 8000;
  var RECONNECT_RETRY_MS = 1500;

  function create(app, deps) {
    function stopReconnectTimers() {
      deps.stopTimer("reconnectTimer");
      deps.stopTimer("reconnectRetryTimer");
    }

    function clearResumeState() {
      app.spectatorMode = false;
      app.resumePending = false;
      app.resumeRequesterName = "";
    }

    function buildStatePayload(type) {
      return {
        type: type || "state",
        board: Game.serializeBoard(app.game.board),
        currentTurn: app.game.currentTurn,
        version: app.game.version,
        winner: app.game.winner,
        message: app.game.message,
        matchConfigured: app.matchConfigured,
        hostColor: app.currentHostColor || app.desiredHostColor
      };
    }

    function maybeScheduleComTurn() {
      var moves;
      var bestMove;
      var index;
      var score;

      deps.stopTimer("comTimer");
      if (app.opponentMode !== "com" || app.transportMode !== "com" || app.game.winner || !app.matchConfigured || app.resumePending) {
        return;
      }
      if (!app.game.currentTurn || app.game.currentTurn === app.myColor) {
        return;
      }

      moves = Game.getValidMoves(app.game.board, app.game.currentTurn);
      for (index = 0; index < moves.length; index += 1) {
        score = moves[index].flips.length;
        if ((moves[index].row === 0 || moves[index].row === 7) && (moves[index].col === 0 || moves[index].col === 7)) {
          score += 100;
        } else if (moves[index].row === 0 || moves[index].row === 7 || moves[index].col === 0 || moves[index].col === 7) {
          score += 10;
        }
        if (!bestMove || score > bestMove.score) {
          bestMove = { row: moves[index].row, col: moves[index].col, score: score };
        }
      }

      if (!bestMove) {
        return;
      }

      app.comTimer = window.setTimeout(function () {
        makeMove(bestMove.row, bestMove.col, app.game.currentTurn, "com", app.game.version + 1);
      }, 420);
    }

    function applyMatchSettings(hostColor, isRematch) {
      app.currentHostColor = hostColor;
      app.desiredHostColor = hostColor;
      app.matchConfigured = true;
      app.myColor = app.role === "host" ? hostColor : Game.getOpponent(hostColor);
      clearResumeState();
      deps.clearRematch();
      deps.resetGame();
      deps.setMessage(isRematch ? "再戦を開始しました。黒が先手です。" : "対局を開始しました。黒が先手です。");
      maybeScheduleComTurn();
    }

    function prepareRematchSetup() {
      var seededColor = app.currentHostColor || app.desiredHostColor || Game.BLACK;

      deps.clearRematch();
      clearResumeState();
      app.currentHostColor = "";
      app.desiredHostColor = seededColor;
      app.matchConfigured = false;
      app.myColor = "";
      deps.resetGame();

      if (app.opponentMode === "com") {
        deps.setTransport("ローカル");
        deps.setMode("COM 再戦準備");
        deps.setOpponentStatus("START 待ち");
        deps.setMessage("再戦の設定を選んで START を押してください。");
        return;
      }

      deps.setMode("再戦準備");
      deps.setOpponentStatus(app.role === "host" ? "START 待ち" : "ホストの設定待ち");
      deps.setMessage(app.role === "host" ?
        "再戦の設定を選んで START を押してください。" :
        "ホストが再戦の設定を選んでいます。");
    }

    function startMatch() {
      if (app.matchConfigured) {
        return;
      }

      if (app.opponentMode === "com") {
        applyMatchSettings(app.desiredHostColor, false);
        return;
      }

      if (!AppPeer.isConnected()) {
        deps.setMessage("相手との接続が完了してから START できます。");
        return;
      }

      applyMatchSettings(app.desiredHostColor, false);
      try {
        AppPeer.send({ type: "start", hostColor: app.desiredHostColor });
        sendProfile();
      } catch (error) {
        beginReconnect("開始メッセージの送信に失敗しました。 " + error.message);
      }
    }

    function sendStateSnapshot() {
      if (!AppPeer.isConnected() || app.opponentMode === "com") {
        return;
      }
      AppPeer.send(buildStatePayload("state"));
    }

    function sendProfile() {
      if (!AppPeer.isConnected()) {
        return;
      }
      AppPeer.send({
        type: "profile",
        displayName: app.displayName || "LINE ユーザー",
        pictureUrl: app.pictureUrl || ""
      });
    }

    function connectToRemotePeer(peerId) {
      if (!peerId || peerId === app.pendingPeerTarget || AppPeer.isConnected()) {
        return;
      }
      app.pendingPeerTarget = peerId;
      deps.setOpponentStatus("ピアに接続中…");
      AppPeer.connectTo(peerId);
    }

    function scheduleReconnectRetry() {
      deps.stopTimer("reconnectRetryTimer");
      if (!app.reconnecting || AppPeer.isConnected() || !deps.getRemotePeerId()) {
        return;
      }
      app.reconnectRetryTimer = window.setTimeout(function () {
        connectToRemotePeer(deps.getRemotePeerId());
        scheduleReconnectRetry();
      }, RECONNECT_RETRY_MS);
    }

    function switchToCom(reason) {
      app.reconnecting = false;
      app.reconnectReason = "";
      app.reconnectDeadline = 0;
      clearResumeState();
      app.transportMode = "com";
      app.opponentMode = "com";
      deps.stopTimer("p2pTimer");
      stopReconnectTimers();
      deps.stopRoomSubscription();
      deps.clearRematch();
      app.pendingPeerTarget = "";
      deps.setOpponentProfile("COM", "");
      deps.setTransport("ローカル");
      deps.setMode("COM 引き継ぎ");
      deps.setOpponentStatus("切断のため COM に切替");
      deps.setMessage(reason + " 相手の代わりに COM が続けます。");
      maybeScheduleComTurn();
    }

    function beginResumeChoice() {
      clearResumeState();
      app.staleGuest = false;
      deps.stopTimer("comTimer");
      app.resumePending = true;
      app.resumeRequesterName = app.opponentDisplayName || "相手";
      app.pendingPeerTarget = "";
      deps.setTransport("復帰確認");
      deps.setMode("復帰選択");
      deps.setOpponentStatus("復帰しました");
      deps.setMessage((app.resumeRequesterName || "相手") + " が戻りました。再開方法を選んでください。");
      try {
        sendProfile();
        AppPeer.send({
          type: "resume-preview",
          displayName: app.displayName || "LINE ユーザー",
          pictureUrl: app.pictureUrl || "",
          payload: buildStatePayload("resume-preview")
        });
      } catch (error) {
        clearResumeState();
        deps.setTransport("ローカル");
        deps.setMode("COM 引き継ぎ");
        deps.setOpponentStatus("COM 継続中");
        deps.setMessage("復帰した相手への通知に失敗しました。COM を続けます。");
        maybeScheduleComTurn();
        return;
      }
      deps.render();
    }

    function applySharedState(payload) {
      app.currentHostColor = payload.hostColor || app.currentHostColor;
      app.desiredHostColor = payload.hostColor || app.desiredHostColor;
      app.matchConfigured = !!payload.matchConfigured;
      if (payload.hostColor) {
        app.myColor = app.role === "host" ? payload.hostColor : Game.getOpponent(payload.hostColor);
      }
      app.game.board = Game.deserializeBoard(payload.board);
      app.game.currentTurn = payload.currentTurn || "";
      app.game.version = Number(payload.version || 0);
      app.game.winner = payload.winner || "";
      app.game.message = payload.message || app.game.message;
      app.resultOverlayDismissed = false;
    }

    function enterSpectatorMode(data) {
      clearResumeState();
      app.spectatorMode = true;
      app.opponentMode = "human";
      app.transportMode = "spectator";
      if (data.displayName || data.pictureUrl) {
        deps.setOpponentProfile(data.displayName || "対戦相手", data.pictureUrl || "");
      }
      applySharedState(data.payload || data);
      deps.setTransport("観戦中");
      deps.setMode("復帰待機");
      deps.setOpponentStatus("選択待ち");
      deps.setMessage("相手が COM で継続中です。今の盤面を表示しています。再開方法の選択を待っています。");
      deps.render();
    }

    function finalizeP2PResume(message) {
      clearResumeState();
      app.reconnecting = false;
      app.reconnectReason = "";
      app.reconnectDeadline = 0;
      app.opponentMode = "human";
      app.transportMode = "p2p";
      deps.stopTimer("p2pTimer");
      stopReconnectTimers();
      deps.stopRoomSubscription();
      deps.setTransport("WebRTC 接続済み");
      deps.setMode("P2P 対戦");
      deps.setOpponentStatus("接続済み");
      deps.setMessage(message);
      deps.render();
    }

    function resumeCurrentGame() {
      if (!app.resumePending || !AppPeer.isConnected()) {
        return;
      }
      clearResumeState();
      app.opponentMode = "human";
      app.transportMode = "p2p";
      deps.setTransport("WebRTC 接続済み");
      deps.setMode("P2P 対戦");
      deps.setOpponentStatus("接続済み");
      deps.setMessage("今の盤面から対局を再開しました。");
      try {
        sendProfile();
        AppPeer.send({
          type: "resume-continue",
          payload: buildStatePayload("resume-continue")
        });
      } catch (error) {
        beginReconnect("対局再開の送信に失敗しました。 " + error.message);
        return;
      }
      deps.render();
    }

    function restartReturnedGame() {
      if (!app.resumePending || !AppPeer.isConnected()) {
        return;
      }
      clearResumeState();
      app.opponentMode = "human";
      try {
        AppPeer.send({
          type: "resume-restart",
          hostColor: app.currentHostColor || app.desiredHostColor || Game.BLACK
        });
      } catch (error) {
        beginReconnect("やり直しの送信に失敗しました。 " + error.message);
        return;
      }
      prepareRematchSetup();
      if (app.role === "host") {
        deps.setMessage("最初からやり直します。色を決めて START を押してください。");
      } else {
        deps.setMessage("最初からやり直します。ホストの設定を待っています。");
      }
      deps.render();
    }

    function handleResumeConnectionLost() {
      if (app.resumePending) {
        clearResumeState();
        deps.setTransport("ローカル");
        deps.setMode("COM 引き継ぎ");
        deps.setOpponentStatus("COM 継続中");
        deps.setMessage("復帰した相手との接続が切れました。COM を続けます。");
        maybeScheduleComTurn();
        deps.render();
        return true;
      }
      if (app.spectatorMode) {
        clearResumeState();
        deps.setTransport("ホスト待機中");
        deps.setMode("マッチング");
        deps.setOpponentStatus("再接続待ち");
        deps.setMessage("相手との接続が切れました。再接続を待っています。");
        deps.render();
        return true;
      }
      return false;
    }

    function beginReconnect(reason) {
      if (app.opponentMode === "com" || !app.roomId || app.reconnecting) {
        return;
      }
      app.reconnecting = true;
      app.reconnectReason = reason;
      app.reconnectDeadline = Date.now() + RECONNECT_TIMEOUT_MS;
      app.transportMode = "reconnecting";
      app.pendingPeerTarget = "";
      deps.stopTimer("p2pTimer");
      stopReconnectTimers();
      deps.setTransport("再接続中");
      deps.setMode("P2P 再接続");
      deps.setOpponentStatus("再接続待ち…");
      deps.setMessage(reason + " 同じルームで再接続を試みます。");
      connectToRemotePeer(deps.getRemotePeerId());
      scheduleReconnectRetry();
      app.reconnectTimer = window.setTimeout(function () {
        if (!AppPeer.isConnected()) {
          switchToCom("P2P の再接続に失敗しました。");
        }
      }, RECONNECT_TIMEOUT_MS);
      deps.render();
    }

    function retryReconnectNow() {
      if (!app.reconnecting) {
        return;
      }
      app.reconnectDeadline = Date.now() + RECONNECT_TIMEOUT_MS;
      connectToRemotePeer(deps.getRemotePeerId());
      scheduleReconnectRetry();
      deps.setMessage("再接続をもう一度試しています。");
    }

    function startP2PPlay() {
      if (app.transportMode === "com" && app.matchConfigured && !app.game.winner) {
        beginResumeChoice();
        return;
      }

      if (app.matchConfigured && !app.reconnecting && app.transportMode !== "com") {
        clearResumeState();
        deps.stopTimer("p2pTimer");
        deps.stopRoomSubscription();
        deps.setTransport("同期確認中");
        deps.setMode("状態同期");
        deps.setOpponentStatus("盤面を確認中");
        sendProfile();
        deps.render();
        return;
      }

      app.reconnecting = false;
      app.reconnectReason = "";
      app.reconnectDeadline = 0;
      app.staleGuest = false;
      clearResumeState();
      app.opponentMode = "human";
      app.transportMode = "p2p";
      deps.stopTimer("p2pTimer");
      stopReconnectTimers();
      deps.stopRoomSubscription();
      deps.setTransport("WebRTC 接続済み");
      deps.setMode("P2P 対戦");
      deps.setOpponentStatus("接続済み");
      deps.render();

      if (app.role === "host") {
        if (app.matchConfigured) {
          sendStateSnapshot();
          sendProfile();
          deps.setMessage("P2P 接続が再開されました。対局を同期しています。");
        } else {
          sendProfile();
          deps.setMessage("P2P 接続が確立されました。START で対局を始めます。");
        }
        return;
      }

      sendProfile();
      deps.setMessage("P2P 接続が確立されました。ホストの開始設定を待っています。");
    }

    function makeMove(row, col, color, source, version) {
      var expectedVersion = app.game.version + 1;
      var message;

      if (version && version !== expectedVersion) {
        if (source === "remote") {
          switchToCom("ピア間で盤面バージョンの不一致を検出しました。");
        }
        return false;
      }
      if (!Game.applyMove(app.game.board, row, col, color)) {
        if (source === "remote") {
          switchToCom("相手から無効な手が送信されました。");
        }
        return false;
      }

      app.game.version = version || expectedVersion;
      app.game.lastMove = { row: row, col: col, color: color };
      message = Game.resolveTurnAfterMove(app.game, color);
      app.game.message = message;
      app.resultOverlayDismissed = false;
      deps.setMessage(message);
      maybeScheduleComTurn();
      return true;
    }

    function sendMove(row, col) {
      var nextVersion = app.game.version + 1;
      if (!makeMove(row, col, app.myColor, "local", nextVersion)) {
        return;
      }
      if (app.transportMode === "p2p") {
        try {
          AppPeer.send({ type: "move", color: app.myColor, row: row, col: col, version: nextVersion });
        } catch (error) {
          beginReconnect("P2P 送信に失敗しました。 " + error.message);
        }
      }
    }

    function requestRematch() {
      if (app.opponentMode === "com") {
        prepareRematchSetup();
        return;
      }
      if (!AppPeer.isConnected()) {
        return;
      }
      app.rematch.outgoing = true;
      app.rematch.incoming = false;
      app.resultOverlayDismissed = false;
      deps.render();
      try {
        AppPeer.send({ type: "rematch-request" });
        deps.setMessage("再戦リクエストを送信しました。返答を待っています。");
      } catch (error) {
        app.rematch.outgoing = false;
        beginReconnect("再戦リクエストの送信に失敗しました。 " + error.message);
      }
    }

    function acceptRematch() {
      if (!app.rematch.incoming || !AppPeer.isConnected()) {
        return;
      }
      try {
        AppPeer.send({ type: "rematch-accept" });
      } catch (error) {
        beginReconnect("再戦承認の送信に失敗しました。 " + error.message);
        return;
      }
      app.rematch.incoming = false;
      if (app.role === "host") {
        AppPeer.send({ type: "rematch-setup" });
        prepareRematchSetup();
      } else {
        app.rematch.outgoing = true;
        deps.setMessage("再戦を承認しました。ホストが設定を選んでいます。");
      }
      deps.render();
    }

    function rejectRematch() {
      deps.clearRematch();
      app.resultOverlayDismissed = true;
      deps.render();
      if (AppPeer.isConnected()) {
        try {
          AppPeer.send({ type: "rematch-reject" });
        } catch (error) {
          beginReconnect("再戦辞退の送信に失敗しました。 " + error.message);
        }
      }
      deps.setMessage("この試合を終了しました。続ける場合は新しいルームを作成するか、ページを開き直してください。");
    }

    function handlePeerData(data) {
      if (!data || !data.type) {
        return;
      }
      if (data.type === "move") {
        makeMove(Number(data.row), Number(data.col), data.color, "remote", Number(data.version));
      } else if (data.type === "start") {
        applyMatchSettings(data.hostColor, false);
      } else if (data.type === "profile") {
        deps.setOpponentProfile(data.displayName || "対戦相手", data.pictureUrl || "");
      } else if (data.type === "state") {
        applySharedState(data);
        finalizeP2PResume("P2P 接続が再開されました。対局を同期しています。");
      } else if (data.type === "resume-preview") {
        enterSpectatorMode(data);
      } else if (data.type === "resume-continue") {
        applySharedState(data.payload || data);
        finalizeP2PResume("今の盤面から対局を再開しました。");
      } else if (data.type === "resume-restart") {
        clearResumeState();
        app.opponentMode = "human";
        app.currentHostColor = data.hostColor || app.currentHostColor;
        app.desiredHostColor = data.hostColor || app.desiredHostColor;
        prepareRematchSetup();
        if (app.role === "host") {
          deps.setMessage("最初からやり直します。色を決めて START を押してください。");
        } else {
          deps.setMessage("最初からやり直します。ホストの設定を待っています。");
        }
      } else if (data.type === "rematch-request") {
        app.rematch.incoming = true;
        app.rematch.outgoing = false;
        app.resultOverlayDismissed = false;
        deps.setMessage("相手が再戦を希望しています。");
      } else if (data.type === "rematch-accept") {
        if (app.role === "host" && app.rematch.outgoing) {
          AppPeer.send({ type: "rematch-setup" });
          prepareRematchSetup();
        } else {
          deps.setMessage("相手が再戦を承認しました。ホストが設定を選んでいます。");
        }
      } else if (data.type === "rematch-reject") {
        deps.clearRematch();
        app.resultOverlayDismissed = false;
        deps.setMessage("相手は再戦しませんでした。");
      } else if (data.type === "rematch-setup") {
        prepareRematchSetup();
      } else if (data.type === "rematch-start") {
        applyMatchSettings(data.hostColor, true);
      }
      deps.render();
    }

    return {
      applyMatchSettings: applyMatchSettings,
      beginReconnect: beginReconnect,
      connectToRemotePeer: connectToRemotePeer,
      handlePeerData: handlePeerData,
      makeMove: makeMove,
      requestRematch: requestRematch,
      acceptRematch: acceptRematch,
      rejectRematch: rejectRematch,
      resumeCurrentGame: resumeCurrentGame,
      restartReturnedGame: restartReturnedGame,
      retryReconnectNow: retryReconnectNow,
      handleResumeConnectionLost: handleResumeConnectionLost,
      startMatch: startMatch,
      sendMove: sendMove,
      startP2PPlay: startP2PPlay,
      switchToCom: switchToCom
    };
  }

  window.OthelloPlay = { create: create };
}(window));
