(function (window) {
  window.APP_CONFIG = window.APP_CONFIG || {};

  // このアプリは script 読み込み版の Firebase SDK を使うため、
  // ここでは Web アプリ設定値だけを保持します。
  window.APP_CONFIG.liffId = window.APP_CONFIG.liffId || "2009933824-5iRGM5NO";
  window.APP_CONFIG.firebase = window.APP_CONFIG.firebase || {
    apiKey: "AIzaSyDsgzpMW7l9vI0o39OQ5RvBvBk-lh6oNs4",
    authDomain: "liff-p2p.firebaseapp.com",
    projectId: "liff-p2p",
    storageBucket: "liff-p2p.firebasestorage.app",
    messagingSenderId: "762153086267",
    appId: "1:762153086267:web:ab5d8b98a35496482c9b1e"
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
    }
  };

  window.AppFirebase = AppFirebase;
}(window));
