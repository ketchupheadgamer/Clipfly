(function () {
    "use strict";

    /*
     * Welcome screen for new visitors, plus an "About" button in the sidebar
     * that shows it again (with the house rules).
     */

    var SEEN_KEY = "clipfly_welcome_seen";

    function byId(id) {
        return document.getElementById(id);
    }

    function mk(tag, className, text) {
        var node = document.createElement(tag);

        if (className) {
            node.className = className;
        }

        if (text !== undefined) {
            node.textContent = text;
        }

        return node;
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    function markSeen() {
        try {
            localStorage.setItem(SEEN_KEY, "1");
        } catch (error) {
            console.warn(error);
        }
    }

    function ensureStyles() {
        if (byId("clipflyWelcomeStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyWelcomeStyles";

        style.textContent = `
            .cfw-sub {
                color: #9ca8ba;
                line-height: 1.5;
                margin-bottom: 4px;
            }

            .cfw-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
                margin: 16px 0;
            }

            @media (max-width: 520px) {
                .cfw-grid {
                    grid-template-columns: 1fr;
                }
            }

            .cfw-card {
                padding: 12px;
                border-radius: 12px;
                background: #101014;
                border: 1px solid #35353d;
            }

            .cfw-card strong {
                display: block;
                margin-bottom: 4px;
            }

            .cfw-card span {
                color: #9ca8ba;
                font-size: 13px;
                line-height: 1.4;
            }

            .cfw-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 6px;
            }

            .cfw-rules {
                margin-top: 16px;
                padding: 12px;
                border-radius: 12px;
                background: #101014;
                border: 1px solid #242d3d;
            }

            .cfw-rules summary {
                cursor: pointer;
                font-weight: 700;
            }

            .cfw-rules ul {
                margin: 10px 0 0 18px;
                padding: 0;
                color: #cbd5e1;
                line-height: 1.6;
                font-size: 14px;
            }
        `;

        document.head.appendChild(style);
    }

    function ensurePopup() {
        var popup = byId("clipflyWelcomePopup");

        if (popup) {
            return popup;
        }

        popup = mk("div", "popup");

        popup.id = "clipflyWelcomePopup";
        popup.style.display = "none";
        popup.style.zIndex = "1900";

        var box = mk("div", "popup-box");

        box.style.width = "min(560px, 94vw)";

        var close = mk("button", "close-button", "✕");

        close.type = "button";

        close.addEventListener("click", closeWelcome);

        var body = mk("div");

        body.id = "clipflyWelcomeBody";

        box.appendChild(close);
        box.appendChild(body);
        popup.appendChild(box);

        popup.addEventListener("click", function (event) {
            if (event.target === popup) {
                closeWelcome();
            }
        });

        document.body.appendChild(popup);

        return popup;
    }

    function closeWelcome() {
        markSeen();

        var popup = byId("clipflyWelcomePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    function openWelcome() {
        ensureStyles();

        var popup = ensurePopup();
        var body = byId("clipflyWelcomeBody");

        var loggedIn = !!window.currentUser;

        body.innerHTML = "";

        body.appendChild(mk("h2", "", "Welcome to Clipfly! 🎬"));

        body.appendChild(
            mk(
                "p",
                "cfw-sub",
                "A friendly place to watch, upload and go live with other people."
            )
        );

        var grid = mk("div", "cfw-grid");

        [
            ["🎞 Shorts", "Swipe through quick videos, one after another."],
            ["🔴 Live", "Share your screen with a live chat and a microphone."],
            ["🏆 Rankings & badges", "Climb the Most subs podium and earn Verified badges."],
            ["💬 Comments & replies", "Join the conversation and make new friends."]
        ].forEach(function (item) {
            var card = mk("div", "cfw-card");

            card.appendChild(mk("strong", "", item[0]));
            card.appendChild(mk("span", "", item[1]));

            grid.appendChild(card);
        });

        body.appendChild(grid);

        var actions = mk("div", "cfw-actions");

        if (!loggedIn) {
            var join = mk("button", "blue-button", "Create free account");

            join.type = "button";

            join.addEventListener("click", function () {
                closeWelcome();

                if (typeof openAccount === "function") {
                    openAccount();
                }
            });

            actions.appendChild(join);
        }

        var shorts = mk(
            "button",
            loggedIn ? "blue-button" : "dark-button",
            "🎞 Watch Shorts"
        );

        shorts.type = "button";

        shorts.addEventListener("click", function () {
            closeWelcome();

            if (typeof openShorts === "function") {
                openShorts();
            }
        });

        actions.appendChild(shorts);

        var later = mk(
            "button",
            "dark-button",
            loggedIn ? "Got it" : "Just look around"
        );

        later.type = "button";

        later.addEventListener("click", closeWelcome);

        actions.appendChild(later);

        body.appendChild(actions);

        var rules = document.createElement("details");

        rules.className = "cfw-rules";

        rules.appendChild(mk("summary", "", "📜 House rules"));

        var list = document.createElement("ul");

        [
            "Be kind and respectful to everyone.",
            "No hate, harassment or bullying.",
            "No adult, violent or dangerous content.",
            "No spam, scams or fake accounts.",
            "Only post things you made or have permission to share.",
            "Moderators can remove content or accounts that break these rules."
        ].forEach(function (rule) {
            list.appendChild(mk("li", "", rule));
        });

        rules.appendChild(list);

        body.appendChild(rules);

        popup.style.display = "flex";
    }

    // Shows once to brand-new visitors who aren't logged in.
    async function maybeShow() {
        try {
            if (localStorage.getItem(SEEN_KEY) === "1") {
                return;
            }
        } catch (error) {
            console.warn(error);
        }

        // Someone who opened a shared video doesn't want a pop-up in the way.
        if (window.__clipflyDeepLink) {
            return;
        }

        var session = null;

        try {
            var result = await window.supabaseClient.auth.getSession();

            session = result && result.data && result.data.session;

        } catch (error) {
            console.warn(error);
        }

        if (session) {
            markSeen();
            return;
        }

        await sleep(900);

        openWelcome();
    }

    function addAboutButton() {
        var sidebar = document.querySelector(".sidebar");

        if (!sidebar || byId("clipflyAboutButton")) {
            return;
        }

        var button = mk("button", "", "ℹ️ About");

        button.id = "clipflyAboutButton";
        button.type = "button";

        button.addEventListener("click", openWelcome);

        sidebar.appendChild(button);
    }

    window.openWelcome = openWelcome;

    addAboutButton();

    maybeShow();

})();