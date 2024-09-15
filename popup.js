document.addEventListener("DOMContentLoaded", () => {
  const apiUrlInput = document.getElementById("apiUrl");
  const startButton = document.getElementById("start");
  const stopButton = document.getElementById("stop");
  const clearButton = document.getElementById("clear");
  const dataContainer = document.getElementById("data");
  const statusDiv = document.getElementById("status");
  const searchInput = document.getElementById("search-input");

  const MAX_DISPLAY_ITEMS = 10; // 限制初始顯示的項目數量

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
              statusDiv.textContent = "正在抓取...";
              statusDiv.className = "success";
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
        statusDiv.textContent = "未在抓取。";
        statusDiv.className = "";
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
    chrome.storage.local.remove(["capturedData", "apiUrl"], () => {
      dataContainer.innerHTML = "";
      statusDiv.textContent = "";
      apiUrlInput.value = "";
    });
  });

  searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.trim();
    highlightKeyword(keyword);
  });

  function displayData(data) {
    // 清空容器
    dataContainer.innerHTML = "";
    // 按照 requestOrder 排序
    data.sort((a, b) => a.request.order - b.request.order);
    data.forEach((item, index) => {
      const requestResponseDiv = document.createElement("div");
      requestResponseDiv.className = "request-response";

      const title = document.createElement("h3");
      title.textContent = `請求 ${index + 1}: ${item.url}`;
      requestResponseDiv.appendChild(title);

      // 定義要顯示的部分
      const sections = [
        {
          label: "請求參數 (原始)",
          content: parseIfJSON(item.request.rawRequest),
        },
        {
          label: "請求參數資料格式",
          content: inferDataTypes(item.request.rawRequest),
        },
        {
          label: "回應資料 (原始)",
          content: parseIfJSON(item.response.rawResponse),
        },
        {
          label: "回應資料資料格式",
          content: inferDataTypes(item.response.rawResponse),
        },
      ];

      sections.forEach((section) => {
        const collapsible = document.createElement("button");
        collapsible.className = "collapsible";
        collapsible.textContent = section.label;
        requestResponseDiv.appendChild(collapsible);

        const contentDiv = document.createElement("div");
        contentDiv.className = "content";

        if (section.label.includes("資料格式")) {
          // 資料格式部分顯示類型
          if (section.content.error) {
            // 顯示錯誤訊息
            const errorMsg = document.createElement("div");
            errorMsg.textContent = section.content.error;
            errorMsg.className = "error";
            contentDiv.appendChild(errorMsg);
          } else {
            // 顯示資料類型樹狀結構
            const treeView = createTreeView(section.content);
            contentDiv.appendChild(treeView);
          }
        } else {
          // 原始資料部分顯示 JSON
          if (typeof section.content === "object") {
            const treeView = createTreeView(section.content);
            contentDiv.appendChild(treeView);
          } else {
            // 若不是物件，直接顯示文字
            const textNode = document.createElement("pre");
            textNode.textContent = section.content;
            contentDiv.appendChild(textNode);
          }
        }

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

  function createTreeView(data) {
    const container = document.createElement("div");
    container.className = "json-tree";

    if (typeof data === "object" && data !== null) {
      const ul = document.createElement("ul");
      for (const key in data) {
        if (data.hasOwnProperty(key)) {
          const li = document.createElement("li");

          const keySpan = document.createElement("span");
          keySpan.className = "key";
          keySpan.textContent = key + ": ";
          li.appendChild(keySpan);

          if (typeof data[key] === "object" && data[key] !== null) {
            const toggleBtn = document.createElement("span");
            toggleBtn.className = "toggle-btn";
            toggleBtn.textContent = "[+]";
            toggleBtn.style.cursor = "pointer";
            toggleBtn.style.color = "#007bff";
            toggleBtn.style.marginRight = "5px";
            li.insertBefore(toggleBtn, keySpan);

            const childContainer = document.createElement("div");
            childContainer.className = "child-container";
            childContainer.style.display = "none";
            li.appendChild(childContainer);

            toggleBtn.addEventListener("click", () => {
              if (childContainer.style.display === "none") {
                childContainer.style.display = "block";
                toggleBtn.textContent = "[-]";
              } else {
                childContainer.style.display = "none";
                toggleBtn.textContent = "[+]";
              }
            });

            createTreeView(data[key]).childNodes.forEach((child) => {
              childContainer.appendChild(child);
            });
          } else {
            const valueSpan = document.createElement("span");
            valueSpan.className = "value";
            valueSpan.textContent = formatValue(data[key]);
            li.appendChild(valueSpan);
          }

          ul.appendChild(li);
        }
      }
      container.appendChild(ul);
    } else {
      const span = document.createElement("span");
      span.className = "value";
      span.textContent = formatValue(data);
      container.appendChild(span);
    }

    return container;
  }

  function formatValue(value) {
    if (typeof value === "string") {
      return `"${value}"`;
    }
    return String(value);
  }

  function initCollapsibles() {
    const collapsibles = document.getElementsByClassName("collapsible");
    for (let i = 0; i < collapsibles.length; i++) {
      const content = collapsibles[i].nextElementSibling;
      content.style.display = "none"; // 預設收起
    }
  }

  function inferDataTypes(rawJson) {
    if (!rawJson) return "無資料";
    try {
      const cleanedJson = cleanJson(rawJson);
      const jsonObj = JSON.parse(cleanedJson);
      const inferred = inferDataTypesRecursive(jsonObj);
      return inferred;
    } catch (e) {
      // 若解析失敗，直接返回錯誤訊息
      return { error: "無法解析 JSON：" + e.message };
    }
  }

  function cleanJson(jsonString) {
    // 移除尾隨逗號
    return jsonString.replace(/,\s*}/g, "}").replace(/,\s*\]/g, "]");
  }

  function inferDataTypesRecursive(obj) {
    if (obj === null) return "null";
    if (Array.isArray(obj)) {
      return obj.map((item) => inferDataTypesRecursive(item));
    } else if (typeof obj === "object") {
      const result = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          result[key] = inferDataTypesRecursive(value);
        }
      }
      return result;
    } else if (typeof obj === "string") {
      if (isGUID(obj)) {
        return "GUID";
      }
      return "string";
    } else if (typeof obj === "number") {
      return "number";
    } else if (typeof obj === "boolean") {
      return "boolean";
    } else {
      return typeof obj;
    }
  }

  function isGUID(str) {
    const guidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return guidRegex.test(str);
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
    if (!keyword) {
      // 移除所有高亮
      const highlighted = dataContainer.querySelectorAll(".highlight");
      highlighted.forEach((span) => {
        span.classList.remove("highlight");
      });
      return;
    }

    const regex = new RegExp(`(${escapeRegExp(keyword)})`, "gi");

    const traverseAndHighlight = (element) => {
      if (element.nodeType === Node.TEXT_NODE) {
        const parent = element.parentNode;
        if (parent && parent.classList.contains("value")) {
          const text = element.textContent;
          const newHTML = escapeHtml(text).replace(
            regex,
            '<span class="highlight">$1</span>'
          );
          if (newHTML !== escapeHtml(text)) {
            parent.innerHTML = newHTML;
          }
        }
      } else {
        element.childNodes.forEach((child) => traverseAndHighlight(child));
      }
    };

    traverseAndHighlight(dataContainer);
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

  function parseIfJSON(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return text; // 若解析失敗，返回原始文字
    }
  }
});
