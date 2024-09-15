document.addEventListener("DOMContentLoaded", () => {
  const apiUrlInput = document.getElementById("apiUrl");
  const startButton = document.getElementById("start");
  const stopButton = document.getElementById("stop");
  const clearButton = document.getElementById("clear");
  const dataContainer = document.getElementById("data");
  const statusDiv = document.getElementById("status");
  const searchInput = document.getElementById("search-input");

  // 從儲存中載入 API URL、抓取狀態和已解析的資料
  chrome.storage.local.get(
    ["apiUrl", "isCapturing", "capturedData"],
    (result) => {
      if (result.apiUrl) {
        apiUrlInput.value = result.apiUrl;
      }
      updateStatus(result.isCapturing);
      if (result.capturedData) {
        displayData(result.capturedData);
      }
    }
  );

  startButton.addEventListener("click", () => {
    const apiUrl = apiUrlInput.value.trim();
    if (apiUrl) {
      chrome.storage.local.set({ apiUrl }, () => {
        // 發送訊息給背景腳本，開始抓取
        chrome.runtime.sendMessage(
          { action: "startCapturing", apiUrl },
          (response) => {
            console.log("收到背景腳本的回應:", response);
            if (response && response.success) {
              updateStatus(true);
              chrome.storage.local.set({ isCapturing: true });
            } else {
              statusDiv.textContent =
                "無法啟動抓取：" + (response.error || "未知錯誤");
              statusDiv.className = "error";
            }
          }
        );
      });
    } else {
      statusDiv.textContent = "請輸入有效的 API URL。";
      statusDiv.className = "error";
    }
  });

  stopButton.addEventListener("click", () => {
    // 發送訊息給背景腳本，停止抓取
    chrome.runtime.sendMessage({ action: "stopCapturing" }, (response) => {
      console.log("收到背景腳本的回應:", response);
      if (response && response.success) {
        updateStatus(false);
        chrome.storage.local.set({ isCapturing: false });
        // 從儲存中取得抓取的資料並顯示
        chrome.storage.local.get("capturedData", (result) => {
          if (result.capturedData) {
            displayData(result.capturedData);
          }
        });
      } else {
        statusDiv.textContent =
          "無法停止抓取：" + (response.error || "未知錯誤");
        statusDiv.className = "error";
      }
    });
  });

  clearButton.addEventListener("click", () => {
    chrome.storage.local.remove("capturedData", () => {
      dataContainer.innerHTML = "";
      statusDiv.textContent = "";
    });
  });

  searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.trim();
    highlightKeyword(keyword);
  });

  function displayData(data) {
    // 清空容器
    dataContainer.innerHTML = "";
    data.forEach((item, index) => {
      const requestResponseDiv = document.createElement("div");
      requestResponseDiv.className = "request-response";

      const title = document.createElement("h3");
      title.textContent = `請求 ${index + 1}: ${item.url}`;
      requestResponseDiv.appendChild(title);

      // 添加可折疊按鈕和內容容器
      const sections = [
        { label: "請求參數", content: formatData(item.request) },
        {
          label: "請求參數資料格式",
          content: formatData(inferDataTypes(item.request)),
        },
        { label: "回應資料", content: formatData(item.response) },
        {
          label: "回應資料格式",
          content: formatData(inferDataTypes(item.response)),
        },
      ];

      sections.forEach((section) => {
        const collapsible = document.createElement("button");
        collapsible.className = "collapsible";
        collapsible.textContent = section.label;
        requestResponseDiv.appendChild(collapsible);

        const contentDiv = document.createElement("div");
        contentDiv.className = "content";

        const pre = document.createElement("pre");
        pre.textContent = section.content;
        contentDiv.appendChild(pre);

        requestResponseDiv.appendChild(contentDiv);

        collapsible.addEventListener("click", function () {
          this.classList.toggle("active");
          if (contentDiv.style.display === "block") {
            contentDiv.style.display = "none";
          } else {
            contentDiv.style.display = "block";
          }
        });
      });

      dataContainer.appendChild(requestResponseDiv);
    });

    // 初始化折疊功能
    initCollapsibles();
  }

  function initCollapsibles() {
    const collapsibles = document.getElementsByClassName("collapsible");
    for (let i = 0; i < collapsibles.length; i++) {
      const content = collapsibles[i].nextElementSibling;
      content.style.display = "none"; // 預設收起
    }
  }

  function formatData(data) {
    if (!data) return "無資料";
    return JSON.stringify(data, null, 2);
  }

  function inferDataTypes(obj) {
    if (obj === null) return "null";
    if (Array.isArray(obj)) {
      return obj.map((item) => inferDataTypes(item));
    } else if (typeof obj === "object") {
      const result = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          result[key] = inferDataTypes(value);
        }
      }
      return result;
    } else {
      return typeof obj;
    }
  }

  function updateStatus(isCapturing) {
    if (isCapturing) {
      statusDiv.textContent = "正在抓取...";
      statusDiv.className = "success";
      startButton.disabled = true;
      stopButton.disabled = false;
    } else {
      statusDiv.textContent = "未在抓取。";
      statusDiv.className = "";
      startButton.disabled = false;
      stopButton.disabled = true;
    }
  }

  function highlightKeyword(keyword) {
    const preElements = dataContainer.getElementsByTagName("pre");
    for (let pre of preElements) {
      const text = pre.textContent;
      if (keyword === "") {
        pre.innerHTML = escapeHtml(text);
      } else {
        const regex = new RegExp(`(${escapeRegExp(keyword)})`, "gi");
        const newText = escapeHtml(text).replace(
          regex,
          '<span class="highlight">$1</span>'
        );
        pre.innerHTML = newText;
      }
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
});
