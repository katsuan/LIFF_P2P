(function (window, document) {
  function generateId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 10);
  }

  function sanitizeForPeer(value) {
    return String(value || "player").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28) || "player";
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

  function getLoginAttemptKey() {
    return "liff-p2p-login-attempted";
  }

  function hasLoginAttempted() {
    try {
      return window.sessionStorage.getItem(getLoginAttemptKey()) === "1";
    } catch (error) {
      return false;
    }
  }

  function markLoginAttempted() {
    try {
      window.sessionStorage.setItem(getLoginAttemptKey(), "1");
    } catch (error) {}
  }

  function clearLoginAttempt() {
    try {
      window.sessionStorage.removeItem(getLoginAttemptKey());
    } catch (error) {}
  }

  function initIdentity() {
    return new Promise(function (resolve, reject) {
      if (!window.liff || !window.APP_CONFIG.liffId || window.APP_CONFIG.liffId === "YOUR_LIFF_ID") {
        resolve({
          userId: getStableDebugUserId(),
          displayName: "デバッグユーザー",
          pictureUrl: ""
        });
        return;
      }

      liff.init({ liffId: window.APP_CONFIG.liffId }).then(function () {
        if (!liff.isLoggedIn()) {
          if (liff.isInClient()) {
            reject(new Error("LINE ログインを完了できませんでした。LIFF のエンドポイントURLを確認してください。"));
            return;
          }

          if (hasLoginAttempted()) {
            reject(new Error("LINE ログインが完了しませんでした。ブラウザを閉じて、もう一度開き直してください。"));
            return;
          }

          markLoginAttempted();
          liff.login({ redirectUri: window.location.href });
          return;
        }

        clearLoginAttempt();
        liff.getProfile().then(function (profile) {
          resolve({
            userId: profile.userId,
            displayName: profile.displayName || "LINE ユーザー",
            pictureUrl: profile.pictureUrl || ""
          });
        }).catch(function () {
          resolve({
            userId: getStableDebugUserId(),
            displayName: "LINE ユーザー",
            pictureUrl: ""
          });
        });
      }).catch(function () {
        resolve({
          userId: getStableDebugUserId(),
          displayName: "デバッグユーザー",
          pictureUrl: ""
        });
      });
    });
  }

  function copyText(text) {
    var textarea;

    if (!text) {
      return Promise.resolve(false);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
    }

    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return Promise.resolve(true);
  }

  function buildShareUrl(url) {
    if (!url) {
      return Promise.resolve("");
    }

    if (!window.liff || !liff.permanentLink || typeof liff.permanentLink.createUrlBy !== "function") {
      return Promise.resolve(url);
    }

    try {
      return Promise.resolve(liff.permanentLink.createUrlBy(url)).catch(function () {
        return url;
      });
    } catch (error) {
      return Promise.resolve(url);
    }
  }

  function buildFlexInviteMessage(roomId, shareUrl) {
    return {
      type: "flex",
      altText: "オセロの招待が届いています。ルームID: " + roomId,
      contents: {
        type: "bubble",
        size: "kilo",
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "オセロで対戦しよう",
              weight: "bold",
              size: "xl",
              color: "#183B2B"
            },
            {
              type: "text",
              text: "このメッセージからルームに参加できます。",
              wrap: true,
              size: "sm",
              color: "#5B6E63"
            },
            {
              type: "box",
              layout: "vertical",
              margin: "md",
              paddingAll: "14px",
              backgroundColor: "#F5F1E8",
              cornerRadius: "16px",
              contents: [
                {
                  type: "text",
                  text: "ルームID",
                  size: "xs",
                  color: "#7A877F"
                },
                {
                  type: "text",
                  text: roomId,
                  margin: "sm",
                  weight: "bold",
                  size: "lg",
                  color: "#183B2B",
                  wrap: true
                }
              ]
            }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              height: "sm",
              color: "#E3722C",
              action: {
                type: "uri",
                label: "このルームに参加",
                uri: shareUrl
              }
            }
          ]
        }
      }
    };
  }

  function shareRoom(roomId, url) {
    return buildShareUrl(url).then(function (shareUrl) {
      if (window.liff &&
          typeof liff.isApiAvailable === "function" &&
          liff.isApiAvailable("shareTargetPicker") &&
          typeof liff.shareTargetPicker === "function") {
        return liff.shareTargetPicker([
          buildFlexInviteMessage(roomId, shareUrl)
        ]).then(function (result) {
          if (result) {
            return { status: "shared", message: "LINE で招待メッセージを送信しました。" };
          }
          return { status: "cancelled", message: "招待がキャンセルされました。" };
        }).catch(function () {
          return copyText(shareUrl).then(function () {
            return {
              status: "copied",
              message: "LINE 共有に失敗したため、招待 URL をコピーしました。"
            };
          });
        });
      }

      return copyText(shareUrl).then(function () {
        return {
          status: "copied",
          message: "LINE 共有に未対応のため、招待 URL をコピーしました。"
        };
      });
    });
  }

  function clearAppStorage() {
    var index;
    var key;
    var keys = [];

    try {
      for (index = 0; index < window.localStorage.length; index += 1) {
        key = window.localStorage.key(index);
        if (key && key.indexOf("liff-p2p") === 0) {
          keys.push(key);
        }
      }
      for (index = 0; index < keys.length; index += 1) {
        window.localStorage.removeItem(keys[index]);
      }
    } catch (error) {}

    try {
      window.sessionStorage.clear();
    } catch (error2) {}
  }

  function reload(url, clearStorage) {
    if (clearStorage) {
      clearAppStorage();
    }
    window.location.href = url || window.location.href;
  }

  window.OthelloPlatform = {
    generateId: generateId,
    sanitizeForPeer: sanitizeForPeer,
    initIdentity: initIdentity,
    copyText: copyText,
    shareRoom: shareRoom,
    reload: reload
  };
}(window, document));
