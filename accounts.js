(function () {
    "use strict";

    /*
     * Discord-style account switcher.
     * Saved logins are kept in this browser, so you can switch
     * accounts without typing a password again.
     */

    var STORAGE_KEY = "clipfly_saved_accounts";
    var MAX_ACCOUNTS = 8;

    var activeId = null;
    var busy = false;

    /*
     * =========================================
     * RENDER GUARD (fixes duplicated videos)
     *
     * Several things can ask for a video refresh at the
     * same moment (switching accounts, the moderator check,
     * the live section...). Without a guard they would each
     * add the whole list. This makes sure only one refresh
     * draws at a time, and only the newest request is kept.
     * =========================================
     */

    function installRenderGuard() {
        var original = window.displayVideos;

        if (
            typeof original !== "function" ||
            original.__clipflyGuarded
        ) {
            return;
        }

        var running = null;
        var queued = null;

        var guarded = function () {
            queued = { self: this, args: arguments };

            if (running) {
                return running;
            }

            running = (async function () {
                while (queued) {
                    var job = queued;

                    queued = null;

                    try {
                        await original.apply(job.self, job.args);
                    } catch (error) {
                        console.warn("Could not draw videos:", error);
                    }
                }

                running = null;
            })();

            return running;
        };

        guarded.__clipflyGuarded = true;

        window.displayVideos = guarded;
    }

    /*
     * =========================================
     * SAVED ACCOUNTS
     * =========================================
     */

    function loadSaved() {
        try {
            var list = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

            if (!Array.isArray(list)) {
                return [];
            }

            return list.filter(function (account) {
                return account && account.id && account.refresh_token;
            });

        } catch (error) {
            return [];
        }
    }

    function writeSaved(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (error) {
            console.warn("Could not save accounts:", error);
        }
    }

    function saveSession(session) {
        if (!session || !session.user || !session.refresh_token) {
            return;
        }

        var user = session.user;
        var meta = user.user_metadata || {};

        var entry = {
            id: user.id,
            email: user.email || "",
            username: meta.username || user.email || "User",
            avatar_url: meta.avatar_url || "",
            access_token: session.access_token,
            refresh_token: session.refresh_token
        };

        var list = loadSaved();

        var index = list.findIndex(function (account) {
            return account.id === entry.id;
        });

        if (index >= 0) {
            list[index] = entry;
        } else {
            list.push(entry);
        }

        while (list.length > MAX_ACCOUNTS) {
            var drop = list.findIndex(function (account) {
                return account.id !== entry.id;
            });

            if (drop < 0) {
                break;
            }

            list.splice(drop, 1);
        }

        writeSaved(list);
    }

    function removeAccount(id) {
        writeSaved(
            loadSaved().filter(function (account) {
                return account.id !== id;
            })
        );
    }

    async function saveCurrentSession() {
        try {
            var result = await window.supabaseClient.auth.getSession();
            var session = result && result.data && result.data.session;

            if (session) {
                saveSession(session);
                activeId = session.user.id;
            }

        } catch (error) {
            console.warn("Could not save current account:", error);
        }
    }

    /*
     * =========================================
     * SMALL HELPERS
     * =========================================
     */

    function el(tag, className, text) {
        var node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined) {
            node.textContent = text;
        }

        return node;
    }

    function say(title, text, icon) {
        if (typeof showMessage === "function") {
            showMessage(title, text, icon);
        } else {
            alert(title + "\n\n" + text);
        }
    }

    function isLiveNow() {
        var bar = document.getElementById("clipflyLiveBar");

        return !!bar && bar.style.display === "flex";
    }

    function ensureStyles() {
        if (document.getElementById("clipflySwitcherStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflySwitcherStyles";

        style.textContent = `
            .clipfly-sw-row {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                margin-bottom: 8px;
                border-radius: 12px;
                background: #101014;
                border: 1px solid #35353d;
                cursor: pointer;
            }

            .clipfly-sw-row:hover {
                border-color: #3478ff;
            }

            .clipfly-sw-row.current {
                cursor: default;
                border-color: #3478ff;
                background: rgba(52, 120, 255, 0.12);
            }

            .clipfly-sw-avatar {
                width: 42px;
                height: 42px;
                min-width: 42px;
                border-radius: 50%;
                background: #292930;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                font-size: 20px;
            }

            .clipfly-sw-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .clipfly-sw-info {
                flex: 1;
                min-width: 0;
            }

            .clipfly-sw-name {
                font-weight: 700;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .clipfly-sw-email {
                font-size: 12px;
                color: #9999a5;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .clipfly-sw-current {
                font-size: 13px;
                font-weight: 700;
                color: #4b8cff;
                white-space: nowrap;
            }

            .clipfly-sw-forget {
                border: 0;
                background: transparent;
                color: #9999a5;
                cursor: pointer;
                font-size: 16px;
                padding: 6px 9px;
                border-radius: 8px;
            }

            .clipfly-sw-forget:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }

            .clipfly-sw-back {
                border: 0;
                background: transparent;
                color: #4b8cff;
                cursor: pointer;
                font-size: 14px;
                padding: 0;
                margin-bottom: 10px;
            }

            .clipfly-sw-back:hover {
                text-decoration: underline;
            }

            .clipfly-sw-status {
                display: none;
                margin-top: 14px;
                padding: 11px 12px;
                border-radius: 10px;
                background: #101014;
                font-size: 14px;
                line-height: 1.4;
            }

            .clipfly-sw-empty {
                color: #9999a5;
                text-align: center;
                padding: 14px 0 18px;
            }
        `;

        document.head.appendChild(style);
    }

    function setStatus(text, isError) {
        var node = document.getElementById("clipflySwStatus");

        if (!node) {
            return;
        }

        node.textContent = text || "";
        node.style.display = text ? "block" : "none";
        node.style.color = isError ? "#ff6b6b" : "#9999a5";
    }

    /*
     * =========================================
     * THE SWITCH ACCOUNT WINDOW
     * =========================================
     */

    function ensurePopup() {
        var popup = document.getElementById("clipflySwitchPopup");

        if (popup) {
            return popup;
        }

        popup = el("div", "popup");

        popup.id = "clipflySwitchPopup";
        popup.style.display = "none";
        popup.style.zIndex = "2100";

        var box = el("div", "popup-box");

        box.id = "clipflySwitchBox";
        box.style.width = "min(450px, 94vw)";

        popup.appendChild(box);

        popup.addEventListener("click", function (event) {
            if (event.target === popup) {
                closeSwitcher();
            }
        });

        document.body.appendChild(popup);

        return popup;
    }

    function addCloseButton(box) {
        var close = el("button", "close-button", "✕");

        close.type = "button";

        close.addEventListener("click", closeSwitcher);

        box.appendChild(close);
    }

    function closeSwitcher() {
        var popup = document.getElementById("clipflySwitchPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    async function openSwitcher() {
        if (isLiveNow()) {
            say(
                "You're live",
                "End your livestream before switching accounts.",
                "🔴"
            );

            return;
        }

        ensureStyles();

        var popup = ensurePopup();

        await saveCurrentSession();

        showList();

        popup.style.display = "flex";
    }

    function makeAvatar(account) {
        var wrap = el("div", "clipfly-sw-avatar");

        if (account.avatar_url) {
            var img = document.createElement("img");

            img.src = account.avatar_url;
            img.alt = "";

            img.onerror = function () {
                img.remove();
                wrap.textContent = "👤";
            };

            wrap.appendChild(img);

        } else {
            wrap.textContent = "👤";
        }

        return wrap;
    }

    function showList() {
        var box = document.getElementById("clipflySwitchBox");

        if (!box) {
            return;
        }

        box.innerHTML = "";

        addCloseButton(box);

        box.appendChild(el("h2", "", "Switch account"));

        box.appendChild(
            el(
                "p",
                "",
                "Pick an account to switch to, or add another one."
            )
        );

        var accounts = loadSaved().sort(function (a, b) {
            return (b.id === activeId) - (a.id === activeId);
        });

        var list = el("div", "");

        if (accounts.length === 0) {
            list.appendChild(
                el("div", "clipfly-sw-empty", "No saved accounts yet.")
            );
        }

        accounts.forEach(function (account) {
            var isCurrent = account.id === activeId;

            var row = el(
                "div",
                "clipfly-sw-row" + (isCurrent ? " current" : "")
            );

            row.appendChild(makeAvatar(account));

            var info = el("div", "clipfly-sw-info");

            info.appendChild(
                el("div", "clipfly-sw-name", "@" + account.username)
            );

            info.appendChild(
                el("div", "clipfly-sw-email", account.email)
            );

            row.appendChild(info);

            if (isCurrent) {
                row.appendChild(el("div", "clipfly-sw-current", "✓ Current"));

            } else {
                var forget = el("button", "clipfly-sw-forget", "✕");

                forget.type = "button";
                forget.title = "Remove from this device";

                forget.addEventListener("click", function (event) {
                    event.stopPropagation();

                    removeAccount(account.id);

                    showList();
                    updateEntryButtons();
                });

                row.appendChild(forget);

                row.addEventListener("click", function () {
                    switchTo(account.id);
                });
            }

            list.appendChild(row);
        });

        box.appendChild(list);

        var add = el("button", "dark-button", "➕ Add another account");

        add.type = "button";
        add.style.width = "100%";
        add.style.marginTop = "6px";

        add.addEventListener("click", function () {
            showForm("login");
        });

        box.appendChild(add);

        var status = el("div", "clipfly-sw-status");

        status.id = "clipflySwStatus";

        box.appendChild(status);
    }

    function makeInput(type, placeholder, id, autocomplete, maxLength) {
        var input = document.createElement("input");

        input.type = type;
        input.placeholder = placeholder;
        input.id = id;
        input.autocomplete = autocomplete;

        if (maxLength) {
            input.maxLength = maxLength;
        }

        return input;
    }

    function showForm(mode) {
        var box = document.getElementById("clipflySwitchBox");

        if (!box) {
            return;
        }

        box.innerHTML = "";

        addCloseButton(box);

        var back = el("button", "clipfly-sw-back", "← Back");

        back.type = "button";

        back.addEventListener("click", showList);

        box.appendChild(back);

        box.appendChild(
            el(
                "h2",
                "",
                mode === "login"
                    ? "Log in to another account"
                    : "Create a new account"
            )
        );

        box.appendChild(
            el(
                "p",
                "",
                "Your current account stays saved, so you can switch back anytime."
            )
        );

        var form = el("div", "account-form");

        var email = makeInput("email", "Email", "clipflySwEmail", "off");

        form.appendChild(email);

        var username = null;

        if (mode === "create") {
            username = makeInput(
                "text",
                "Username",
                "clipflySwUsername",
                "off",
                30
            );

            form.appendChild(username);
        }

        var password = makeInput(
            "password",
            "Password",
            "clipflySwPassword",
            "new-password"
        );

        form.appendChild(password);

        var submit = el(
            "button",
            "blue-button",
            mode === "login" ? "Log In" : "Create Account"
        );

        submit.type = "button";

        submit.addEventListener("click", function () {
            submitForm(mode, submit);
        });

        form.appendChild(submit);

        [email, username, password].forEach(function (input) {
            if (!input) {
                return;
            }

            input.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    submitForm(mode, submit);
                }
            });
        });

        box.appendChild(form);

        var status = el("div", "clipfly-sw-status");

        status.id = "clipflySwStatus";

        box.appendChild(status);

        var switchLine = el("div", "account-switch");

        switchLine.appendChild(
            document.createTextNode(
                mode === "login"
                    ? "Don't have an account? "
                    : "Have an account already? "
            )
        );

        var link = el(
            "button",
            "",
            mode === "login" ? "Create one" : "Log in here"
        );

        link.type = "button";

        link.addEventListener("click", function () {
            showForm(mode === "login" ? "create" : "login");
        });

        switchLine.appendChild(link);

        box.appendChild(switchLine);

        setTimeout(function () {
            email.focus();
        }, 50);
    }

    /*
     * =========================================
     * ADD ACCOUNT (log in or create)
     * =========================================
     */

    async function submitForm(mode, submitButton) {
        if (busy) {
            return;
        }

        if (isLiveNow()) {
            setStatus("End your livestream before switching accounts.", true);
            return;
        }

        var emailInput = document.getElementById("clipflySwEmail");
        var usernameInput = document.getElementById("clipflySwUsername");
        var passwordInput = document.getElementById("clipflySwPassword");

        var email = emailInput ? emailInput.value.trim() : "";
        var username = usernameInput ? usernameInput.value.trim() : "";
        var password = passwordInput ? passwordInput.value : "";

        if (!email || !password || (mode === "create" && !username)) {
            setStatus("Please fill in everything.", true);
            return;
        }

        if (mode === "create" && username.length < 3) {
            setStatus("Your username needs to be at least 3 characters.", true);
            return;
        }

        if (mode === "create" && password.length < 6) {
            setStatus("Your password needs to be at least 6 characters.", true);
            return;
        }

        busy = true;

        if (submitButton) {
            submitButton.disabled = true;
        }

        setStatus(mode === "login" ? "Logging in..." : "Creating account...", false);

        var switchedUser = null;

        try {
            // Make sure the account we're leaving is saved first.
            await saveCurrentSession();

            var auth = window.supabaseClient.auth;

            var result =
                mode === "login"
                    ? await auth.signInWithPassword({
                          email: email,
                          password: password
                      })
                    : await auth.signUp({
                          email: email,
                          password: password,
                          options: { data: { username: username } }
                      });

            if (result.error) {
                throw result.error;
            }

            var session = result.data && result.data.session;

            if (!session) {
                setStatus(
                    "Account created! Check your email to confirm it, then log in here.",
                    false
                );

                return;
            }

            saveSession(session);

            activeId = session.user.id;
            window.currentUser = session.user;

            switchedUser = session.user;

        } catch (error) {
            console.warn("Add account failed:", error);

            setStatus(error.message || "Something went wrong.", true);

        } finally {
            busy = false;

            if (submitButton) {
                submitButton.disabled = false;
            }
        }

        if (switchedUser) {
            await finishSwitch(switchedUser);
        }
    }

    /*
     * =========================================
     * SWITCH TO A SAVED ACCOUNT
     * =========================================
     */

    async function switchTo(id) {
        if (busy || id === activeId) {
            return;
        }

        if (isLiveNow()) {
            setStatus("End your livestream before switching accounts.", true);
            return;
        }

        var entry = loadSaved().find(function (account) {
            return account.id === id;
        });

        if (!entry) {
            return;
        }

        busy = true;

        setStatus("Switching to @" + entry.username + "...", false);

        var switchedUser = null;

        try {
            var result = await window.supabaseClient.auth.setSession({
                access_token: entry.access_token,
                refresh_token: entry.refresh_token
            });

            if (result.error) {
                throw result.error;
            }

            var session = result.data && result.data.session;

            if (!session) {
                throw new Error("Session expired");
            }

            saveSession(session);

            activeId = session.user.id;
            window.currentUser = session.user;

            switchedUser = session.user;

        } catch (error) {
            console.warn("Could not switch accounts:", error);

            var networkProblem =
                error &&
                (error.name === "AuthRetryableFetchError" ||
                    /network|fetch/i.test(error.message || ""));

            if (networkProblem) {
                setStatus(
                    "Couldn't reach Clipfly. Check your connection and try again.",
                    true
                );

            } else {
                removeAccount(id);

                showList();

                setStatus(
                    "The saved login for @" +
                        entry.username +
                        " expired. Use Add another account to log in again.",
                    true
                );
            }

        } finally {
            busy = false;
        }

        if (switchedUser) {
            await finishSwitch(switchedUser);
        }
    }

    async function finishSwitch(user) {
        closeSwitcher();

        if (typeof closeAccount === "function") {
            closeAccount();
        }

        if (typeof selectedProfilePicture !== "undefined") {
            selectedProfilePicture = null;
        }

        updateEntryButtons();

        try {
            if (typeof openClipflySection === "function") {
                await openClipflySection(
                    typeof currentClipflySection !== "undefined"
                        ? currentClipflySection
                        : "home"
                );
            }

        } catch (error) {
            console.warn("Could not refresh after switching:", error);
        }

        var name =
            (user.user_metadata && user.user_metadata.username) ||
            user.email ||
            "User";

        say("Switched account", "You're now @" + name + ".", "🔄");
    }

    /*
     * =========================================
     * BUTTONS INSIDE THE ACCOUNT POPUP
     * =========================================
     */

    function addProfileButton() {
        var profile = document.getElementById("profileScreen");

        if (
            !profile ||
            document.getElementById("clipflySwitchAccountButton")
        ) {
            return;
        }

        var button = el("button", "dark-button", "🔄 Switch Account");

        button.id = "clipflySwitchAccountButton";
        button.type = "button";

        button.addEventListener("click", openSwitcher);

        var logout = profile.querySelector('button[onclick="logOut()"]');

        if (logout && logout.parentNode) {
            logout.parentNode.insertBefore(button, logout);
        } else {
            profile.appendChild(button);
        }
    }

    // On the login / create screens, show a shortcut if accounts are saved.
    function updateEntryButtons() {
        var hasSaved = loadSaved().length > 0;

        ["loginScreen", "createAccountScreen"].forEach(function (screenId) {
            var screen = document.getElementById(screenId);

            if (!screen) {
                return;
            }

            var button = screen.querySelector(".clipfly-sw-entry");

            if (!button) {
                button = el(
                    "button",
                    "dark-button clipfly-sw-entry",
                    "🔄 Switch to a saved account"
                );

                button.type = "button";
                button.style.width = "100%";
                button.style.marginTop = "14px";

                button.addEventListener("click", openSwitcher);

                screen.appendChild(button);
            }

            button.style.display = hasSaved ? "block" : "none";
        });
    }

    function wrap(name, after) {
        var original = window[name];

        if (typeof original !== "function") {
            return;
        }

        window[name] = function () {
            var result = original.apply(this, arguments);

            try {
                after();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };
    }

    /*
     * =========================================
     * START
     * =========================================
     */

    function init() {
        installRenderGuard();

        ensureStyles();

        addProfileButton();
        updateEntryButtons();

        wrap("showLoginScreen", updateEntryButtons);
        wrap("showCreateAccountScreen", updateEntryButtons);
        wrap("showProfileScreen", updateEntryButtons);
        wrap("openAccount", updateEntryButtons);

        // Logging out removes that account from the saved list.
        var originalLogOut = window.logOut;

        if (typeof originalLogOut === "function") {
            window.logOut = async function () {
                var leavingId =
                    activeId ||
                    (window.currentUser && window.currentUser.id) ||
                    null;

                var result = await originalLogOut.apply(this, arguments);

                try {
                    var check = await window.supabaseClient.auth.getSession();
                    var session = check && check.data && check.data.session;

                    if (
                        leavingId &&
                        (!session || session.user.id !== leavingId)
                    ) {
                        removeAccount(leavingId);
                    }

                } catch (error) {
                    console.warn(error);
                }

                updateEntryButtons();

                return result;
            };
        }

        window.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeSwitcher();
            }
        });

        if (window.supabaseClient && window.supabaseClient.auth) {
            // Keep the saved login up to date whenever it changes.
            window.supabaseClient.auth.onAuthStateChange(
                function (event, session) {
                    if (session && session.user) {
                        activeId = session.user.id;
                        saveSession(session);
                    } else {
                        activeId = null;
                    }

                    updateEntryButtons();
                }
            );

            saveCurrentSession().then(updateEntryButtons);
        }
    }

    window.openAccountSwitcher = openSwitcher;

    init();

})();