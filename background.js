let isCapturing = false;
let apiUrlPattern = "";
let capturedData = [];
let debuggingTabId = null;
let requestMap = {};

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
    requestMap[requestId] = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      postData: request.postData || null,
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
          let parsedResponse;
          try {
            parsedResponse = JSON.parse(responseBody);
          } catch (e) {
            parsedResponse = responseBody;
          }

          let queryParams = {};
          try {
            const url = new URL(requestDetails.url);
            url.searchParams.forEach((value, key) => {
              queryParams[key] = value;
            });
          } catch (e) {
            // URL 解析失敗，保持空對象
          }

          // 對於請求參數中的 `data` 字段，進行 URL 解碼和 JSON 解析
          if (queryParams.data) {
            try {
              const decodedData = decodeURIComponent(queryParams.data);
              queryParams.data = JSON.parse(decodedData);
            } catch (e) {
              // 保持原樣
            }
          }

          // 如果有請求體，嘗試解析為 JSON
          let requestBody = null;
          if (requestDetails.postData) {
            try {
              requestBody = JSON.parse(requestDetails.postData);
            } catch (e) {
              // 保持原樣
              requestBody = requestDetails.postData;
            }
          }

          // 組合請求資料
          const combinedRequestData = {
            method: requestDetails.method,
            url: requestDetails.url,
            headers: requestDetails.headers,
            queryParams: queryParams,
            body: requestBody,
          };

          const parsedData = {
            url: response.url,
            request: combinedRequestData,
            response: parsedResponse,
          };

          capturedData.push(parsedData);
        }
      );
    }
  }
}
