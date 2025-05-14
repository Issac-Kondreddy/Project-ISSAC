// static/js/chat.js
document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY       = "issac_token";
  const USER_KEY        = "issac_user";
  let sessionId         = null;
  let mediaRecorder     = null;
  let audioChunks       = [];

  // Element refs
  const sidebarGreeting = document.getElementById("sidebar-greeting");
  const sessionListEl   = document.getElementById("session-list");
  const btnNewChat      = document.getElementById("btn-new-chat");
  const chatGreetingEl  = document.getElementById("chat-greeting");
  const messagesDiv     = document.getElementById("messages");
  const input           = document.getElementById("chat-input");
  const sendBtn         = document.getElementById("send-btn");
  const micBtn          = document.getElementById("mic-btn");
  const logoutBtn       = document.getElementById("logout-btn");

  function getSessionsKey() {
    const user = localStorage.getItem(USER_KEY);
    return `issac_sessions_${user}`;
  }

  function authFetch(url, opts = {}) {
    opts.headers = opts.headers || {};
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) opts.headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, opts);
  }

  function updateGreetings() {
    const h = new Date().getHours();
    const greet = h < 12
      ? "Good morning"
      : h < 17
      ? "Good afternoon"
      : "Good evening";
    const user = localStorage.getItem(USER_KEY) || "";
    sidebarGreeting.textContent = `${greet}, ${user}`;
    chatGreetingEl.innerHTML = `<strong>${greet}, ${user}.</strong><br/>How can I help you today?`;
  }

  function loadSessions() {
    return JSON.parse(localStorage.getItem(getSessionsKey()) || "[]");
  }
  function saveSessions(sessions) {
    localStorage.setItem(getSessionsKey(), JSON.stringify(sessions));
  }

  function refreshSessionList() {
    sessionListEl.innerHTML = "";
    loadSessions().forEach(s => {
      const li = document.createElement("li");
      li.textContent = s.name;
      if (s.id === sessionId) li.classList.add("active");
      li.onclick = () => {
        sessionId = s.id;
        refreshSessionList();
        loadHistory();
      };
      sessionListEl.appendChild(li);
    });
  }

  btnNewChat.onclick = () => {
    const name = prompt("Enter a name for your new chat:");
    if (!name) return;
    sessionId = null;
    messagesDiv.innerHTML = "";
    const sessions = loadSessions();
    sessions.unshift({ id: null, name });
    saveSessions(sessions);
    refreshSessionList();
  };

  function showLoader() {
    removeLoader();
    const lb = document.createElement("div");
    lb.className = "bubble loader";
    lb.id = "loader";
    lb.innerText = "…";
    messagesDiv.appendChild(lb);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
  function removeLoader() {
    const lb = document.getElementById("loader");
    if (lb) lb.remove();
  }

  function appendBubble(text, cls) {
    const b = document.createElement("div");
    b.className = `bubble ${cls}`;
    b.innerText = text;
    messagesDiv.appendChild(b);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function loadHistory() {
    if (!sessionId) return;
    messagesDiv.innerHTML = "";
    try {
      const res = await authFetch(`/api/history/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { history } = await res.json();
      history.forEach(m =>
        appendBubble(m.content, m.role === "user" ? "user" : "assist")
      );
    } catch (err) {
      console.error("loadHistory error", err);
      appendBubble("⚠️ Failed to load history", "assist");
    }
  }

  async function sendText(msg) {
    appendBubble(msg, "user");
    showLoader();
    try {
      const res = await authFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, session_id: sessionId })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { reply, session_id } = await res.json();
      sessionId = session_id;

      // Patch new session ID if needed
      const sessions = loadSessions();
      if (sessions[0] && sessions[0].id === null) {
        sessions[0].id = sessionId;
        saveSessions(sessions);
        refreshSessionList();
      }

      removeLoader();
      appendBubble(reply, "assist");
    } catch (err) {
      console.error("sendText error", err);
      removeLoader();
      appendBubble(`⚠️ ${err.message}`, "assist");
    }
  }

  // ── FULL VOICE MODE HOOKUP ──────────────────────────────────────────────────
  micBtn.onclick = async () => {
    try {
      // If already recording, stop
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        micBtn.textContent = "🎤";
        return;
      }

      // Start new recording
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Audio recording not supported in this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks   = [];
      micBtn.textContent = "⏹";

      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        showLoader();
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "voice.webm");
        if (sessionId) form.append("session_id", sessionId);

        // Send to /api/voice
        const res = await authFetch("/api/voice", {
          method: "POST",
          body: form
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { transcript, reply, session_id } = await res.json();
        sessionId = session_id;

        // Patch session ID
        const sessions = loadSessions();
        if (sessions[0] && sessions[0].id === null) {
          sessions[0].id = sessionId;
          saveSessions(sessions);
          refreshSessionList();
        }

        removeLoader();
        appendBubble(transcript, "user");
        appendBubble(reply,     "assist");
      };

      mediaRecorder.start();
    } catch (err) {
      console.error("Voice error", err);
      alert("Voice recording failed: " + err.message);
      micBtn.textContent = "🎤";
    }
  };

  logoutBtn.onclick = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.reload();
  };

  function initChat() {
    updateGreetings();
    refreshSessionList();
    loadHistory();

    sendBtn.onclick = () => {
      const txt = input.value.trim();
      if (!txt) return;
      input.value = "";
      sendText(txt);
    };
    input.addEventListener("keypress", e => {
      if (e.key === "Enter" && input.value.trim()) {
        sendText(input.value.trim());
        input.value = "";
      }
    });
  }

  window.initChat = initChat;
});
