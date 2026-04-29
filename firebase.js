(function (window) {
  window.APP_CONFIG = window.APP_CONFIG || {};

  // ここに LIFF と Firebase の実際の設定値を入れてください。
  window.APP_CONFIG.liffId = window.APP_CONFIG.liffId || "YOUR_LIFF_ID";
  window.APP_CONFIG.firebase = window.APP_CONFIG.firebase || {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID"
  };

  var firebaseApp = null;
  var firestoreDb = null;

  function hasFirebaseConfig() {
    var config = window.APP_CONFIG.firebase || {};
    return config.apiKey &&
      config.apiKey !== "YOUR_FIREBASE_API_KEY" &&
      config.projectId &&
      config.projectId !== "YOUR_FIREBASE_PROJECT_ID";
  }

  function ensureInitialized() {
    if (!hasFirebaseConfig()) {
      throw new Error("Firebase の設定が不足しています。firebase.js の APP_CONFIG.firebase を更新してください。");
    }

    if (!firebaseApp) {
      firebaseApp = firebase.apps && firebase.apps.length ?
        firebase.app() :
        firebase.initializeApp(window.APP_CONFIG.firebase);
      firestoreDb = firebase.firestore();
    }

    return firestoreDb;
  }

  function roomsCollection() {
    return ensureInitialized().collection("rooms");
  }

  function roomDoc(roomId) {
    return roomsCollection().doc(roomId);
  }

  var AppFirebase = {
    init: function () {
      return ensureInitialized();
    },

    getRoom: function (roomId) {
      return roomDoc(roomId).get().then(function (snapshot) {
        if (!snapshot.exists) {
          return null;
        }

        return snapshot.data();
      });
    },

    createRoom: function (roomId, payload) {
      return roomDoc(roomId).set(payload);
    },

    updateRoom: function (roomId, payload) {
      return roomDoc(roomId).set(payload, { merge: true });
    },

    subscribeRoom: function (roomId, onData, onError) {
      return roomDoc(roomId).onSnapshot(function (snapshot) {
        if (!snapshot.exists) {
          onData(null);
          return;
        }

        onData(snapshot.data());
      }, onError);
    },

    activateFallback: function (roomId, payload) {
      var data = {};

      for (var key in payload) {
        if (payload.hasOwnProperty(key)) {
          data[key] = payload[key];
        }
      }

      data.transportMode = "firestore";
      data.status = "playing";
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

      return roomDoc(roomId).set(data, { merge: true });
    },

    saveFallbackState: function (roomId, payload) {
      var data = {};

      for (var key in payload) {
        if (payload.hasOwnProperty(key)) {
          data[key] = payload[key];
        }
      }

      data.transportMode = "firestore";
      data.status = "playing";
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

      return roomDoc(roomId).set(data, { merge: true });
    }
  };

  window.AppFirebase = AppFirebase;
}(window));
