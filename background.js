let isCapturing = false;
let apiUrlPattern = "";
let capturedData = [];
let debuggingTabId = null;
let requestMap = {};
let requestCounter = 1; // 用於追蹤請求順序

// 監聽來自 popup.js 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "startCapturing") {
    apiUrlPattern = message.apiUrl;
    startCapturing(sendResponse);
    return true; // 表示我們會異步回覆
  } else if (message.action === "stopCapturing") {
    stopCapturing(sendResponse);
    return true; // 表示我們會異步回覆
  }
});

function startCapturing(sendResponse) {
  if (isCapturing) {
    sendResponse({ success: false, error: "已經在抓取中。" });
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      sendResponse({ success: false, error: "沒有活動的標籤頁。" });
      return;
    }
    const tab = tabs[0];
    debuggingTabId = tab.id;

    chrome.debugger.attach({ tabId: debuggingTabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
        return;
      }

      isCapturing = true;
      capturedData = [];
      requestMap = {};
      requestCounter = 1; // 重置請求計數器
      chrome.storage.local.set({ isCapturing: true });

      chrome.debugger.sendCommand(
        { tabId: debuggingTabId },
        "Network.enable",
        {},
        () => {
          chrome.debugger.onEvent.addListener(onEvent);
          sendResponse({ success: true });
        }
      );
    });
  });
}

function stopCapturing(sendResponse) {
  if (!isCapturing) {
    sendResponse({ success: false, error: "目前未在抓取。" });
    return;
  }

  if (debuggingTabId === null) {
    sendResponse({ success: false, error: "沒有正在抓取的標籤頁。" });
    return;
  }

  chrome.debugger.detach({ tabId: debuggingTabId }, () => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }

    isCapturing = false;
    debuggingTabId = null;
    chrome.storage.local.set({ isCapturing: false });

    // 保存資料
    chrome.storage.local.set({ capturedData: capturedData }, () => {
      sendResponse({ success: true });
    });
  });
}

function onEvent(debuggeeId, message, params) {
  if (debuggeeId.tabId !== debuggingTabId) return;

  if (message === "Network.requestWillBeSent") {
    const requestId = params.requestId;
    const request = params.request;
    const method = request.method;
    const url = request.url;
    const headers = request.headers;
    let rawRequest = "";

    if (method.toUpperCase() === "GET") {
      try {
        const urlObj = new URL(url);
        const paramsObj = {};
        urlObj.searchParams.forEach((value, key) => {
          paramsObj[key] = value;
        });
        rawRequest = JSON.stringify(paramsObj, null, 2);
      } catch (e) {
        rawRequest = "無法解析 GET 請求的 URL 參數。";
      }
    } else {
      rawRequest = request.postData || "";
    }

    requestMap[requestId] = {
      method: method,
      url: url,
      headers: headers,
      rawRequest: rawRequest,
      order: requestCounter++, // 分配序號
    };
  }

  if (message === "Network.responseReceived") {
    const requestId = params.requestId;
    const response = params.response;
    if (response.url.includes(apiUrlPattern)) {
      const requestDetails = requestMap[requestId];
      if (!requestDetails) return;

      chrome.debugger.sendCommand(
        { tabId: debuggingTabId },
        "Network.getResponseBody",
        { requestId: requestId },
        (result) => {
          if (!result) return;

          let responseBody = result.body;
          let rawResponse = responseBody; // 保留原始回應字串

          // 將捕獲的資料存儲到 capturedData 中
          const parsedData = {
            url: response.url,
            request: {
              rawRequest: requestDetails.rawRequest,
              order: requestDetails.order, // 保留序號
            },
            response: {
              rawResponse: rawResponse,
            },
          };

          capturedData.push(parsedData);
        }
      );
    }
  }
}
