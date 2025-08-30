document.addEventListener("DOMContentLoaded", () => {
    const logList = document.getElementById("log-list");
    const chatContainer = document.getElementById("chat-container");
    let activeLog = null;

    // ログファイルの一覧を取得してサイドバーに表示
    async function fetchLogs() {
        try {
            const response = await fetch("/viewer/api/logs");
            if (!response.ok) throw new Error("Failed to fetch logs");
            const logs = await response.json();
            
            logList.innerHTML = ""; // リストをクリア
            logs.forEach(log => {
                const link = document.createElement("a");
                link.href = `#${log.filename}`;
                // ファイル名から日時をパース
                const match = log.filename.match(/(\d{8})_(\d{6})\.json/);
                if (match) {
                    const [, dateStr, timeStr] = match;
                    const year = dateStr.slice(0, 4);
                    const month = dateStr.slice(4, 6);
                    const day = dateStr.slice(6, 8);
                    const hour = timeStr.slice(0, 2);
                    const minute = timeStr.slice(2, 4);
                    const second = timeStr.slice(4, 6);
                    const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
                    link.textContent = date.toLocaleString('ja-JP');
                } else {
                    link.textContent = log.filename;
                }
                link.dataset.filename = log.filename;
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    window.location.hash = log.filename; // URLハッシュを更新
                });
                logList.appendChild(link);
            });
            
            // URLハッシュの変更を監視
            window.addEventListener('hashchange', () => {
                const filename = window.location.hash.substring(1);
                if (filename) loadLog(filename);
            });

            // 初期読み込み時にURLハッシュを確認
            if (window.location.hash) {
                const filename = window.location.hash.substring(1);
                if (logs.some(log => log.filename === filename)) {
                    loadLog(filename);
                }
            }
        } catch (error) {
            console.error("Error fetching logs:", error);
            logList.innerHTML = "<li>Failed to load logs.</li>";
        }
    }

    // 特定のログを読み込んでチャットUIを生成
    async function loadLog(filename) {
        if (activeLog) {
            activeLog.classList.remove("active");
        }
        const newActiveLog = logList.querySelector(`a[data-filename="${filename}"]`);
        if (newActiveLog) {
            newActiveLog.classList.add("active");
            activeLog = newActiveLog;
        }

        try {
            const response = await fetch(`/viewer/api/logs/${filename}`);
            if (!response.ok) throw new Error(`Failed to fetch log: ${filename}`);
            const data = await response.json();
            
            chatContainer.innerHTML = ""; // コンテナをクリア

            // messagesが存在しない場合の処理
            if (!data.request?.body?.messages) {
                chatContainer.innerHTML = '<div class="welcome-message">No messages found in this log.</div>';
                return;
            }

            data.request.body.messages.forEach(msg => {
                const messageDiv = document.createElement("div");
                let combinedContent = "";

                if (typeof msg.content === 'string') {
                    // contentが文字列の場合
                    messageDiv.classList.add("message", msg.role);
                    combinedContent = msg.content;
                } else if (Array.isArray(msg.content)) {
                    // contentが配列の場合
                    const isToolResult = msg.content.some(part => part.type === "tool_result");
                    const roleClass = isToolResult ? 'tool' : msg.role;
                    messageDiv.classList.add("message", roleClass);

                    msg.content.forEach(part => {
                        console.log('Processing content part:', part.type, part.text?.substring(0, 100));
                        if (part.type === "text" && part.text.trim()) {
                            combinedContent += part.text + "\n";
                        } else if (part.type === "image") {
                            if (part.source && part.source.type === "base64" && part.source.data) {
                                combinedContent += `
                                    <div class="image-container">
                                        <img src="data:image/png;base64,${part.source.data}" alt="Image" />
                                    </div>`;
                            }
                        } else if (part.type === "tool_use") {
                            combinedContent += `
                                <div class="tool-call">
                                    <strong>Tool Call: ${part.name}</strong>
                                    <pre><code>${JSON.stringify(part.input, null, 2)}</code></pre>
                                </div>`;
                        } else if (part.type === "tool_result") {
                            const errorClass = part.is_error ? 'error' : '';
                            let resultContent = '';
                            
                            if (Array.isArray(part.content)) {
                                // contentが配列の場合、各要素を処理
                                part.content.forEach(item => {
                                    if (item.type === "image" && item.source && item.source.type === "base64" && item.source.data) {
                                        // 画像の場合
                                        resultContent += `
                                            <div class="image-container">
                                                <img src="data:${item.source.media_type || 'image/png'};base64,${item.source.data}" alt="Tool Result Image" />
                                            </div>`;
                                    } else {
                                        // その他の場合はJSON表示
                                        const itemStr = JSON.stringify(item, null, 2);
                                        const escapedItem = itemStr.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                                        resultContent += `<pre>${escapedItem}</pre>`;
                                    }
                                });
                            } else {
                                // contentが文字列または他のオブジェクトの場合は既存の処理
                                const content = typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2);
                                const escapedContent = content.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                                resultContent = escapedContent;
                            }
                            
                            combinedContent += `
                                <div class="tool-result ${errorClass}">
                                    <strong>Tool Result (ID: ${part.tool_use_id})</strong>
                                    ${Array.isArray(part.content) ? `<div>${resultContent}</div>` : `<p>${resultContent}</p>`}
                                </div>`;
                        }
                    });
                } else {
                    // contentが想定外の型の場合もデバッグ表示
                    console.warn('Unexpected content type:', typeof msg.content, msg.content);
                    messageDiv.classList.add("message", msg.role);
                    combinedContent = `[Unexpected content type: ${typeof msg.content}] ${JSON.stringify(msg.content)}`;
                }
                
                // combinedContentが空の場合もデバッグ表示
                if (!combinedContent.trim()) {
                    console.warn('Empty content for message:', msg);
                    combinedContent = '[Empty content]';
                }
                
                // marked.jsでMarkdownをHTMLに変換
                messageDiv.innerHTML = marked.parse(combinedContent.trim());
                chatContainer.appendChild(messageDiv);
            });
        } catch (error) {
            console.error("Error loading log:", error);
            chatContainer.innerHTML = `<div class="welcome-message error">Failed to load log file.</div>`;
        }
    }

    fetchLogs();
});