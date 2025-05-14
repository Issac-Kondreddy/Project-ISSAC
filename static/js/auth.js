// static/js/auth.js
document.addEventListener("DOMContentLoaded", () => {
  const TOKEN_KEY   = "issac_token";
  const USER_KEY    = "issac_user";
  const authView    = document.getElementById("auth-view");
  const chatView    = document.getElementById("chat-view");
  const tabLogin    = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const form        = document.getElementById("auth-form");
  const msgElem     = document.getElementById("auth-msg");
  const submitBtn   = document.getElementById("auth-submit");
  let mode = "login";

  function showLoginTab() {
    mode = "login";
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    submitBtn.innerText = "Login";
    msgElem.innerText = "";
  }
  function showRegisterTab() {
    mode = "register";
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    submitBtn.innerText = "Register";
    msgElem.innerText = "";
  }

  function updateView() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      authView.classList.add("hidden");
      chatView.classList.remove("hidden");
      window.initChat();
    } else {
      authView.classList.remove("hidden");
      chatView.classList.add("hidden");
      showLoginTab();
    }
  }

  tabLogin.addEventListener("click", showLoginTab);
  tabRegister.addEventListener("click", showRegisterTab);

  form.addEventListener("submit", async e => {
    e.preventDefault();
    msgElem.innerText = "";
    const username = form.querySelector("#auth-username").value.trim();
    const password = form.querySelector("#auth-password").value.trim();
    if (!username || !password) {
      msgElem.innerText = "Both fields are required.";
      return;
    }
    try {
      const res = await fetch(`/api/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (mode === "login") {
        if (res.ok && data.access_token) {
          localStorage.setItem(TOKEN_KEY, data.access_token);
          localStorage.setItem(USER_KEY, username);
          updateView();
        } else {
          msgElem.innerText = data.msg || data.error || "Login failed.";
        }
      } else {
        if (res.ok) {
          msgElem.innerText = data.msg || "Registered! Please log in.";
          showLoginTab();
        } else {
          msgElem.innerText = data.msg || data.error || "Registration failed.";
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      msgElem.innerText = "Network error. Try again.";
    }
  });

  updateView();
});
