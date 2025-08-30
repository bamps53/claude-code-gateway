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
            
            // ログを階層構造でグループ化
            const logGroups = {};
            logs.forEach(log => {
                const pathParts = log.path.split('/');
                if (pathParts.length >= 2) {
                    const userId = pathParts[0];
                    const sessionId = pathParts[1];
                    if (!logGroups[userId]) {
                        logGroups[userId] = {};
                    }
                    if (!logGroups[userId][sessionId]) {
                        logGroups[userId][sessionId] = [];
                    }
                    logGroups[userId][sessionId].push(log);
                } else {
                    // フラット構造のログ（下位互換）
                    if (!logGroups['legacy']) {
                        logGroups['legacy'] = { 'files': [] };
                    }
                    logGroups['legacy']['files'].push(log);
                }
            });
            
            // 階層構造でHTML生成
            Object.keys(logGroups).sort().forEach(userId => {
                const userDiv = document.createElement("div");
                userDiv.className = "log-user-group";
                
                const userHeader = document.createElement("h3");
                userHeader.textContent = userId;
                userHeader.className = "log-user-header";
                userHeader.addEventListener("click", () => toggleUserGroup(userDiv));
                userDiv.appendChild(userHeader);
                
                const userSessionsContainer = document.createElement("div");
                userSessionsContainer.className = "log-user-sessions";
                
                Object.keys(logGroups[userId]).sort().forEach(sessionId => {
                    const sessionDiv = document.createElement("div");
                    sessionDiv.className = "log-session-group";
                    
                    const sessionHeader = document.createElement("h4");
                    sessionHeader.textContent = `Session: ${sessionId}`;
                    sessionHeader.className = "log-session-header";
                    sessionHeader.addEventListener("click", () => toggleSessionGroup(sessionDiv));
                    sessionDiv.appendChild(sessionHeader);
                    
                    const fileList = document.createElement("div");
                    fileList.className = "log-file-list";
                    
                    logGroups[userId][sessionId].forEach(log => {
                        const link = document.createElement("a");
                        link.href = `#${log.path}`;
                        
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
                        
                        link.dataset.path = log.path;
                        link.addEventListener("click", (e) => {
                            e.preventDefault();
                            window.location.hash = log.path; // URLハッシュを更新
                        });
                        fileList.appendChild(link);
                    });
                    
                    sessionDiv.appendChild(fileList);
                    userSessionsContainer.appendChild(sessionDiv);
                });
                
                userDiv.appendChild(userSessionsContainer);
                logList.appendChild(userDiv);
            });
            
            // URLハッシュの変更を監視
            window.addEventListener('hashchange', () => {
                const path = window.location.hash.substring(1);
                if (path) loadLog(path);
            });

            // 初期読み込み時にURLハッシュを確認
            if (window.location.hash) {
                const path = window.location.hash.substring(1);
                if (logs.some(log => log.path === path || log.filename === path)) {
                    loadLog(path);
                }
            }
        } catch (error) {
            console.error("Error fetching logs:", error);
            logList.innerHTML = "<li>Failed to load logs.</li>";
        }
    }

    // 特定のログを読み込んでチャットUIを生成
    async function loadLog(path) {
        if (activeLog) {
            activeLog.classList.remove("active");
        }
        const newActiveLog = logList.querySelector(`a[data-path="${path}"]`);
        if (newActiveLog) {
            newActiveLog.classList.add("active");
            activeLog = newActiveLog;
        }

        try {
            const response = await fetch(`/viewer/api/logs/${path}`);
            if (!response.ok) throw new Error(`Failed to fetch log: ${path}`);
            const data = await response.json();
            
            chatContainer.innerHTML = ""; // コンテナをクリア

            // messagesが存在しない場合の処理
            if (!data.request?.body?.messages) {
                chatContainer.innerHTML = '<div class="welcome-message">No messages found in this log.</div>';
                return;
            }

            // System promptが存在する場合、最初に表示（デフォルトで折りたたみ）
            if (data.request?.body?.system && Array.isArray(data.request.body.system)) {
                const systemDiv = document.createElement("div");
                systemDiv.classList.add("message", "system");
                
                let systemContent = "";
                data.request.body.system.forEach(part => {
                    if (part.type === "text" && part.text) {
                        systemContent += part.text + "\n";
                    }
                });
                
                if (systemContent.trim()) {
                    const systemId = "system-prompt";
                    systemDiv.innerHTML = `
                        <div class="collapsible-header" onclick="toggleCollapsible('${systemId}')">
                            <strong>📋 System Prompt</strong> <span class="collapse-arrow" id="${systemId}-arrow">▶</span>
                        </div>
                        <div class="collapsible-content collapsed" id="${systemId}-content">
                            ${marked.parse(systemContent.trim())}
                        </div>
                    `;
                    chatContainer.appendChild(systemDiv);
                }
            }

            // Toolsが存在する場合、system promptの後に表示（デフォルトで折りたたみ）
            if (data.request?.body?.tools && Array.isArray(data.request.body.tools)) {
                const toolsDiv = document.createElement("div");
                toolsDiv.classList.add("message", "tools");
                
                let toolsHtml = "";
                data.request.body.tools.forEach((tool, index) => {
                    toolsHtml += `<div class="tool-item">`;
                    toolsHtml += `<div class="tool-header">${index + 1}. <strong>${tool.name}</strong></div>`;
                    if (tool.description) {
                        // 改行を<br>に変換してそのまま表示
                        const description = tool.description.split('\n').join('<br>');
                        toolsHtml += `<div class="tool-description">${description}</div>`;
                    }
                    toolsHtml += `</div>`;
                });
                
                const toolsId = "available-tools";
                toolsDiv.innerHTML = `
                    <div class="collapsible-header" onclick="toggleCollapsible('${toolsId}')">
                        <strong>🔧 Available Tools (${data.request.body.tools.length})</strong> <span class="collapse-arrow" id="${toolsId}-arrow">▶</span>
                    </div>
                    <div class="collapsible-content collapsed" id="${toolsId}-content">
                        ${toolsHtml}
                    </div>
                `;
                chatContainer.appendChild(toolsDiv);
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
                        console.log('Processing content part:', part.type, part.text);
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

// ユーザーグループの折りたたみ機能
function toggleUserGroup(userDiv) {
    const userHeader = userDiv.querySelector('.log-user-header');
    const userSessions = userDiv.querySelector('.log-user-sessions');
    
    if (userSessions.classList.contains('collapsed')) {
        // 展開
        userSessions.classList.remove('collapsed');
        userHeader.classList.remove('collapsed');
    } else {
        // 折りたたみ
        userSessions.classList.add('collapsed');
        userHeader.classList.add('collapsed');
    }
}

// セッショングループの折りたたみ機能
function toggleSessionGroup(sessionDiv) {
    const sessionHeader = sessionDiv.querySelector('.log-session-header');
    const fileList = sessionDiv.querySelector('.log-file-list');
    
    if (fileList.classList.contains('collapsed')) {
        // 展開
        fileList.classList.remove('collapsed');
        sessionHeader.classList.remove('collapsed');
    } else {
        // 折りたたみ
        fileList.classList.add('collapsed');
        sessionHeader.classList.add('collapsed');
    }
}

// コンテンツの展開/折りたたみ機能
function toggleCollapsible(sectionId) {
    const content = document.getElementById(`${sectionId}-content`);
    const arrow = document.getElementById(`${sectionId}-arrow`);
    
    if (content.classList.contains('collapsed')) {
        // 展開
        content.classList.remove('collapsed');
        arrow.textContent = '▼';
    } else {
        // 折りたたみ
        content.classList.add('collapsed');
        arrow.textContent = '▶';
    }
}

