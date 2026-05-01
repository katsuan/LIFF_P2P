(function (window) {
  function resolveEntry(roomData, userId, joinRequested) {
    if (!roomData) {
      return joinRequested ? "missing" : "create-host";
    }
    if (roomData.hostUserId === userId) {
      return "resume-host";
    }
    if (roomData.guestUserId === userId) {
      return "resume-guest";
    }
    if (!roomData.guestUserId) {
      return "join-guest";
    }
    return "full";
  }

  function buildHostPayload(roomId, userId, peerId) {
    return {
      roomId: roomId,
      hostUserId: userId,
      guestUserId: "",
      hostPeerId: peerId,
      guestPeerId: "",
      status: "waiting"
    };
  }

  function buildGuestPayload(userId, peerId) {
    return {
      guestUserId: userId,
      guestPeerId: peerId,
      status: "ready"
    };
  }

  function buildPromotedHostPayload(userId, peerId) {
    return {
      hostUserId: userId,
      hostPeerId: peerId,
      guestUserId: "",
      guestPeerId: "",
      status: "waiting"
    };
  }

  function fetchRoom(roomId) {
    return AppFirebase.getRoom(roomId);
  }

  function init() {
    return AppFirebase.init();
  }

  function createHostRoom(roomId, userId, peerId) {
    return AppFirebase.createRoom(roomId, buildHostPayload(roomId, userId, peerId));
  }

  function resetHostRoom(roomId, userId, peerId) {
    return AppFirebase.updateRoom(roomId, buildHostPayload(roomId, userId, peerId));
  }

  function joinGuestRoom(roomId, userId, peerId) {
    return AppFirebase.updateRoom(roomId, buildGuestPayload(userId, peerId));
  }

  function promoteGuestToHost(roomId, userId, peerId) {
    return AppFirebase.updateRoom(roomId, buildPromotedHostPayload(userId, peerId));
  }

  function subscribeRoom(roomId, onData, onError) {
    return AppFirebase.subscribeRoom(roomId, onData, onError);
  }

  function getRemotePeerId(roomData, role) {
    if (!roomData) {
      return "";
    }
    return role === "host" ? (roomData.guestPeerId || "") : (roomData.hostPeerId || "");
  }

  window.OthelloMatchmaking = {
    init: init,
    resolveEntry: resolveEntry,
    fetchRoom: fetchRoom,
    createHostRoom: createHostRoom,
    resetHostRoom: resetHostRoom,
    joinGuestRoom: joinGuestRoom,
    promoteGuestToHost: promoteGuestToHost,
    subscribeRoom: subscribeRoom,
    getRemotePeerId: getRemotePeerId
  };
}(window));
