(function (window) {
  window.APP_CONFIG = window.APP_CONFIG || {};

  // host、path、secure、port を設定すると独自の PeerJS サーバーを使えます。
  // host を空にすると PeerJS のデフォルト設定を使います。
  window.APP_CONFIG.peer = window.APP_CONFIG.peer || {
    host: "",
    port: 443,
    path: "/",
    secure: true,
    debug: 1
  };

  function buildPeerOptions() {
    var config = window.APP_CONFIG.peer || {};
    var options = {
      debug: typeof config.debug === "number" ? config.debug : 1
    };

    if (config.host) {
      options.host = config.host;
      options.port = config.port || 443;
      options.path = config.path || "/";
      options.secure = config.secure !== false;
    }

    return options;
  }

  function attachConnectionHandlers(state, conn) {
    conn.on("open", function () {
      state.connection = conn;
      if (state.handlers.onConnectionOpen) {
        state.handlers.onConnectionOpen(conn);
      }
    });

    conn.on("data", function (data) {
      if (state.handlers.onData) {
        state.handlers.onData(data, conn);
      }
    });

    conn.on("close", function () {
      if (state.connection && state.connection.connectionId === conn.connectionId) {
        state.connection = null;
      }

      if (state.handlers.onConnectionClose) {
        state.handlers.onConnectionClose(conn);
      }
    });

    conn.on("error", function (error) {
      if (state.handlers.onConnectionError) {
        state.handlers.onConnectionError(error, conn);
      }
    });
  }

  var AppPeer = {
    state: {
      peer: null,
      peerId: null,
      connection: null,
      handlers: {}
    },

    init: function (peerId, handlers) {
      var self = this;

      self.state.handlers = handlers || {};

      return new Promise(function (resolve, reject) {
        var peer = new Peer(peerId, buildPeerOptions());

        self.state.peer = peer;
        self.state.peerId = peerId;

        peer.on("open", function (id) {
          if (self.state.handlers.onPeerOpen) {
            self.state.handlers.onPeerOpen(id);
          }
          resolve(id);
        });

        peer.on("connection", function (conn) {
          if (self.state.connection && self.state.connection.open) {
            conn.close();
            return;
          }

          attachConnectionHandlers(self.state, conn);

          if (self.state.handlers.onIncomingConnection) {
            self.state.handlers.onIncomingConnection(conn);
          }
        });

        peer.on("error", function (error) {
          if (self.state.handlers.onPeerError) {
            self.state.handlers.onPeerError(error);
          }
          reject(error);
        });

        peer.on("disconnected", function () {
          if (self.state.handlers.onPeerDisconnected) {
            self.state.handlers.onPeerDisconnected();
          }
        });
      });
    },

    connectTo: function (peerId) {
      if (!this.state.peer) {
        throw new Error("Peer が初期化されていません。");
      }

      if (this.state.connection && this.state.connection.open) {
        return this.state.connection;
      }

      var conn = this.state.peer.connect(peerId, {
        reliable: true,
        serialization: "json"
      });

      attachConnectionHandlers(this.state, conn);
      return conn;
    },

    send: function (payload) {
      if (!this.state.connection || !this.state.connection.open) {
        throw new Error("P2P 接続がまだ開いていません。");
      }

      this.state.connection.send(payload);
    },

    disconnect: function () {
      if (this.state.connection) {
        this.state.connection.close();
        this.state.connection = null;
      }
    },

    getPeerId: function () {
      return this.state.peerId;
    },

    isConnected: function () {
      return !!(this.state.connection && this.state.connection.open);
    }
  };

  window.AppPeer = AppPeer;
}(window));
