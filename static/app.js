document.addEventListener("DOMContentLoaded", () => {
    const logList = document.getElementById("log-list");
    const chatContainer = document.getElementById("chat-container");
    let activeLog = null;

    // Fetch log files list and display in sidebar
    async function fetchLogs() {
        try {
            const response = await fetch("/viewer/api/logs");
            if (!response.ok) throw new Error("Failed to fetch logs");
            const logs = await response.json();
            
            logList.innerHTML = ""; // Clear the list
            
            // Group logs in hierarchical structure
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
                    // Flat structure logs (backward compatibility)
                    if (!logGroups['legacy']) {
                        logGroups['legacy'] = { 'files': [] };
                    }
                    logGroups['legacy']['files'].push(log);
                }
            });
            
            // Generate HTML with hierarchical structure
            Object.keys(logGroups).sort().reverse().forEach(userId => {
                const userDiv = document.createElement("div");
                userDiv.className = "log-user-group";
                
                const userHeader = document.createElement("h3");
                userHeader.textContent = userId;
                userHeader.className = "log-user-header";
                userHeader.addEventListener("click", () => toggleUserGroup(userDiv));
                userDiv.appendChild(userHeader);
                
                const userSessionsContainer = document.createElement("div");
                userSessionsContainer.className = "log-user-sessions";
                
                Object.keys(logGroups[userId]).sort().reverse().forEach(sessionId => {
                    const sessionDiv = document.createElement("div");
                    sessionDiv.className = "log-session-group";
                    
                    const sessionHeader = document.createElement("h4");
                    sessionHeader.className = "log-session-header collapsed";
                    
                    const sessionText = document.createElement("span");
                    sessionText.textContent = `Session: ${sessionId}`;
                    sessionText.className = "session-text";
                    sessionText.addEventListener("click", () => toggleSessionGroup(sessionDiv));
                    
                    const deleteButton = document.createElement("button");
                    deleteButton.innerHTML = "🗑️";
                    deleteButton.className = "delete-session-button";
                    deleteButton.title = "Delete Session";
                    deleteButton.addEventListener("click", (e) => {
                        e.stopPropagation();
                        deleteSession(userId, sessionId, sessionDiv);
                    });
                    
                    sessionHeader.appendChild(sessionText);
                    sessionHeader.appendChild(deleteButton);
                    sessionDiv.appendChild(sessionHeader);
                    
                    const fileList = document.createElement("div");
                    fileList.className = "log-file-list collapsed";
                    
                    logGroups[userId][sessionId].forEach(log => {
                        const link = document.createElement("a");
                        link.href = `#${log.path}`;
                        
                        // Parse date and time from filename
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
                            window.location.hash = log.path; // Update URL hash
                        });
                        fileList.appendChild(link);
                    });
                    
                    sessionDiv.appendChild(fileList);
                    userSessionsContainer.appendChild(sessionDiv);
                });
                
                userDiv.appendChild(userSessionsContainer);
                logList.appendChild(userDiv);
            });
            
            // Monitor URL hash changes
            window.addEventListener('hashchange', () => {
                const path = window.location.hash.substring(1);
                if (path) loadLog(path);
            });

            // Check URL hash on initial load
            if (window.location.hash) {
                const path = window.location.hash.substring(1);
                // Always try to load the path, even if it doesn't exist in the logs list
                // The backend will handle redirecting to the latest file in the session
                if (path) {
                    loadLog(path);
                }
            }
        } catch (error) {
            console.error("Error fetching logs:", error);
            logList.innerHTML = "<li>Failed to load logs.</li>";
        }
    }

    // Load specific log and generate chat UI
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
            
            // Check if we were redirected to a different path
            const requestedUrl = `/viewer/api/logs/${path}`;
            const finalUrl = response.url;
            
            if (finalUrl !== `${window.location.origin}${requestedUrl}`) {
                // Extract the new path from the redirected URL
                const urlMatch = finalUrl.match(/\/viewer\/api\/logs\/(.+)$/);
                if (urlMatch) {
                    const newPath = urlMatch[1];
                    // Update the browser hash to reflect the redirect
                    window.location.hash = newPath;
                    // Also update the active log highlighting for the redirected path
                    if (activeLog) {
                        activeLog.classList.remove("active");
                    }
                    const redirectedActiveLog = logList.querySelector(`a[data-path="${newPath}"]`);
                    if (redirectedActiveLog) {
                        redirectedActiveLog.classList.add("active");
                        activeLog = redirectedActiveLog;
                    }
                }
            }
            
            const data = await response.json();
            
            chatContainer.innerHTML = ""; // Clear container

            // Handle cases where messages don't exist
            if (!data.request?.body?.messages) {
                chatContainer.innerHTML = '<div class="welcome-message">No messages found in this log.</div>';
                return;
            }

            // Display system prompt first if it exists (collapsed by default)
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

            // Display tools after system prompt if they exist (collapsed by default)
            if (data.request?.body?.tools && Array.isArray(data.request.body.tools)) {
                const toolsDiv = document.createElement("div");
                toolsDiv.classList.add("message", "tools");
                
                let toolsHtml = "";
                data.request.body.tools.forEach((tool, index) => {
                    toolsHtml += `<div class="tool-item">`;
                    toolsHtml += `<div class="tool-header">${index + 1}. <strong>${tool.name}</strong></div>`;
                    if (tool.description) {
                        // Convert newlines to <br> tags and display as is
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
                    // When content is a string
                    messageDiv.classList.add("message", msg.role);
                    combinedContent = msg.content;
                } else if (Array.isArray(msg.content)) {
                    // When content is an array
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
                                // When content is an array, process each element
                                part.content.forEach(item => {
                                    if (item.type === "image" && item.source && item.source.type === "base64" && item.source.data) {
                                        // For images
                                        resultContent += `
                                            <div class="image-container">
                                                <img src="data:${item.source.media_type || 'image/png'};base64,${item.source.data}" alt="Tool Result Image" />
                                            </div>`;
                                    } else {
                                        // For other cases, display as JSON
                                        const itemStr = JSON.stringify(item, null, 2);
                                        const escapedItem = itemStr.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                                        resultContent += `<pre>${escapedItem}</pre>`;
                                    }
                                });
                            } else {
                                // For string or other object content, use existing processing
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
                    // Debug display for unexpected content types
                    console.warn('Unexpected content type:', typeof msg.content, msg.content);
                    messageDiv.classList.add("message", msg.role);
                    combinedContent = `[Unexpected content type: ${typeof msg.content}] ${JSON.stringify(msg.content)}`;
                }
                
                // Debug display for empty combinedContent
                if (!combinedContent.trim()) {
                    console.warn('Empty content for message:', msg);
                    combinedContent = '[Empty content]';
                }
                
                // Convert Markdown to HTML using marked.js
                messageDiv.innerHTML = marked.parse(combinedContent.trim());
                chatContainer.appendChild(messageDiv);
            });
        } catch (error) {
            console.error("Error loading log:", error);
            chatContainer.innerHTML = `<div class="welcome-message error">Failed to load log file.</div>`;
        }
    }

    // Event listener for refresh button
    const refreshButton = document.getElementById("refresh-logs");
    refreshButton.addEventListener("click", () => {
        fetchLogs();
    });

    // Session deletion functionality
    async function deleteSession(userId, sessionId, sessionDiv) {
        if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
            return;
        }
        
        // Need to identify the actual folder name from sessionId
        // Folder name format is "timestamp_sessionId"
        const sessionFolders = sessionDiv.parentElement.querySelectorAll('.log-session-group');
        let sessionFolder = null;
        
        // Identify folder name corresponding to current sessionDiv
        // Extract sessionId from session header and get actual folder name from log file paths
        const fileLinks = sessionDiv.querySelectorAll('.log-file-list a');
        if (fileLinks.length > 0) {
            const firstFilePath = fileLinks[0].dataset.path;
            const pathParts = firstFilePath.split('/');
            if (pathParts.length >= 2) {
                sessionFolder = pathParts[1]; // Format: userId/sessionFolder/filename.json
            }
        }
        
        if (!sessionFolder) {
            alert('Failed to delete session. Folder not found.');
            return;
        }
        
        try {
            const response = await fetch(`/viewer/api/sessions/${userId}/${sessionFolder}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // Remove session from UI
                sessionDiv.remove();
                
                // If active log belongs to this session, clear chat container
                if (activeLog && fileLinks.length > 0) {
                    const activeLogPath = activeLog.dataset.path;
                    const sessionPaths = Array.from(fileLinks).map(link => link.dataset.path);
                    if (sessionPaths.includes(activeLogPath)) {
                        chatContainer.innerHTML = '<div class="welcome-message">Select a log from the left sidebar to view the conversation.</div>';
                        activeLog = null;
                    }
                }
            } else {
                const errorData = await response.text();
                alert('Failed to delete session: ' + errorData);
            }
        } catch (error) {
            console.error('Error deleting session:', error);
            alert('An error occurred while deleting the session.');
        }
    }

    fetchLogs();
});

// User group collapse functionality
function toggleUserGroup(userDiv) {
    const userHeader = userDiv.querySelector('.log-user-header');
    const userSessions = userDiv.querySelector('.log-user-sessions');
    
    if (userSessions.classList.contains('collapsed')) {
        // Expand
        userSessions.classList.remove('collapsed');
        userHeader.classList.remove('collapsed');
    } else {
        // Collapse
        userSessions.classList.add('collapsed');
        userHeader.classList.add('collapsed');
    }
}

// Session group collapse functionality
function toggleSessionGroup(sessionDiv) {
    const sessionHeader = sessionDiv.querySelector('.log-session-header');
    const fileList = sessionDiv.querySelector('.log-file-list');
    
    if (fileList.classList.contains('collapsed')) {
        // Expand
        fileList.classList.remove('collapsed');
        sessionHeader.classList.remove('collapsed');
    } else {
        // Collapse
        fileList.classList.add('collapsed');
        sessionHeader.classList.add('collapsed');
    }
}

// Content expand/collapse functionality
function toggleCollapsible(sectionId) {
    const content = document.getElementById(`${sectionId}-content`);
    const arrow = document.getElementById(`${sectionId}-arrow`);
    
    if (content.classList.contains('collapsed')) {
        // Expand
        content.classList.remove('collapsed');
        arrow.textContent = '▼';
    } else {
        // Collapse
        content.classList.add('collapsed');
        arrow.textContent = '▶';
    }
}


