(function () {
    "use strict";

    /*
     * Notifications: a bell in the top bar that tells you when someone
     * subscribes, comments, replies or likes your video.
     * Needs the notifications SQL in Supabase.
     */

    var baseTitle = document.title || "Clipfly";
    var me = null;
    var channel = null;
    var pollTimer = null;
    var unread = 0;

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

    function toast(text, options) {
        if (typeof window.clipflyToast === "function") {
            window.clipflyToast(text, options);
        }
    }

    function timeAgo(value) {
        var seconds = Math.max(
            0,
            Math.floor((Date.now() - new Date(value).getTime()) / 1000)
        );

        if (seconds < 60) {
            return "just now";
        }

        var minutes = Math.floor(seconds / 60);

        if (minutes < 60) {
            return minutes + "m ago";
        }

        var hours = Math.floor(minutes / 60);

        if (hours < 24) {
            return hours + "h ago";
        }

        var days = Math.floor(hours / 24);

        if (days < 30) {
            return days + "d ago";
        }

        return new Date(value).toLocaleDateString();
    }

    var ICONS = {
        subscribe: "👥",
        comment: "💬",
        reply: "↩️",
        like: "👍"
    };

    /*
     * =========================================
     * STYLES
     * =========================================
     */

    function ensureStyles() {
        if (byId("clipflyNotifStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyNotifStyles";

        style.textContent = `
            #clipflyBellCount {
                display: none;
                min-width: 18px;
                margin-left: 6px;
                padding: 1px 6px;
                border-radius: 999px;
                background: #e53935;
                color: #ffffff;
                font-size: 12px;
                font-weight: 800;
                text-align: center;
            }

            .cfn-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                flex-wrap: wrap;
                margin-bottom: 14px;
                padding-right: 40px;
            }

            .cfn-head h2 {
                margin: 0;
            }

            .cfn-tools {
                display: flex;
                gap: 8px;
            }

            .cfn-tools button {
                padding: 7px 12px;
                font-size: 13px;
            }

            .cfn-note {
                color: #9ca8ba;
                line-height: 1.5;
                padding: 18px 0;
                text-align: center;
            }

            .cfn-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                margin-bottom: 8px;
                border-radius: 12px;
                background: #101014;
                border: 1px solid #35353d;
                cursor: pointer;
            }

            .cfn-item:hover {
                border-color: #3478ff;
            }

            .cfn-item.unread {
                background: rgba(52, 120, 255, 0.12);
                border-color: #3478ff;
            }

            .cfn-icon {
                width: 38px;
                min-width: 38px;
                height: 38px;
                border-radius: 50%;
                background: #1b2433;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
            }

            .cfn-text {
                flex: 1;
                min-width: 0;
                overflow-wrap: anywhere;
                line-height: 1.35;
            }

            .cfn-time {
                margin-top: 3px;
                font-size: 12px;
                color: #9ca8ba;
            }
        `;

        document.head.appendChild(style);
    }

    /*
     * =========================================
     * THE BELL
     * =========================================
     */

    function setUnread(count) {
        unread = Math.max(0, count);

        var bubble = byId("clipflyBellCount");

        if (bubble) {
            bubble.textContent = unread > 99 ? "99+" : String(unread);
            bubble.style.display = unread > 0 ? "inline-block" : "none";
        }

        document.title = (unread > 0 ? "(" + unread + ") " : "") + baseTitle;
    }

    function ensureBell() {
        var bar = document.querySelector(".top-buttons");

        if (!bar) {
            return null;
        }

        var button = byId("clipflyBellButton");

        if (button) {
            return button;
        }

        ensureStyles();

        button = mk("button", "", "🔔");

        button.id = "clipflyBellButton";
        button.type = "button";
        button.title = "Notifications";
        button.style.display = "none";

        var bubble = mk("span", "", "0");

        bubble.id = "clipflyBellCount";

        button.appendChild(bubble);

        button.addEventListener("click", openNotifications);

        bar.insertBefore(button, bar.firstChild);

        return button;
    }

    async function refreshUnread() {
        if (!me || !window.supabaseClient) {
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("notifications")
                .select("id", { count: "exact", head: true })
                .eq("is_read", false);

            if (result.error) {
                throw result.error;
            }

            setUnread(result.count || 0);

        } catch (error) {
            console.warn("Could not count notifications (did you run the SQL?):", error);
        }
    }

    /*
     * =========================================
     * THE LIST WINDOW
     * =========================================
     */

    function ensurePopup() {
        var popup = byId("clipflyNotifPopup");

        if (popup) {
            return popup;
        }

        popup = mk("div", "popup");

        popup.id = "clipflyNotifPopup";
        popup.style.display = "none";
        popup.style.zIndex = "1900";

        var box = mk("div", "popup-box");

        box.style.width = "min(520px, 94vw)";

        var close = mk("button", "close-button", "✕");

        close.type = "button";

        close.addEventListener("click", closePopup);

        var body = mk("div");

        body.id = "clipflyNotifBody";

        box.appendChild(close);
        box.appendChild(body);
        popup.appendChild(box);

        popup.addEventListener("click", function (event) {
            if (event.target === popup) {
                closePopup();
            }
        });

        document.body.appendChild(popup);

        return popup;
    }

    function closePopup() {
        var popup = byId("clipflyNotifPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    function isPopupOpen() {
        var popup = byId("clipflyNotifPopup");

        return !!popup && popup.style.display !== "none";
    }

    async function openItem(row) {
        closePopup();

        try {
            await window.supabaseClient
                .from("notifications")
                .update({ is_read: true })
                .eq("id", row.id);

            refreshUnread();

        } catch (error) {
            console.warn(error);
        }

        if (row.type === "subscribe") {
            if (typeof window.clipflyOpenChannelById === "function" && row.actor_id) {
                window.clipflyOpenChannelById(row.actor_id);

            } else if (typeof openUserChannel === "function" && row.actor_id) {
                openUserChannel(row.actor_name || "User", null, row.actor_id);
            }

        } else if (
            row.video_id &&
            typeof window.clipflyOpenVideoById === "function"
        ) {
            window.clipflyOpenVideoById(row.video_id);
        }
    }

    async function markAllRead() {
        if (!me) {
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("notifications")
                .update({ is_read: true })
                .eq("user_id", me.id)
                .eq("is_read", false);

            if (result.error) {
                throw result.error;
            }

            setUnread(0);

            var body = byId("clipflyNotifBody");

            if (body) {
                body.querySelectorAll(".cfn-item.unread").forEach(function (item) {
                    item.classList.remove("unread");
                });
            }

        } catch (error) {
            console.warn("Could not mark notifications read:", error);
        }
    }

    async function clearAll() {
        if (!me || !window.confirm("Delete all your notifications?")) {
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("notifications")
                .delete()
                .eq("user_id", me.id);

            if (result.error) {
                throw result.error;
            }

            setUnread(0);

            await loadList();

        } catch (error) {
            console.warn("Could not clear notifications:", error);
        }
    }

    async function loadList() {
        var body = byId("clipflyNotifBody");

        if (!body || !me) {
            return;
        }

        body.innerHTML = "";

        var head = mk("div", "cfn-head");

        head.appendChild(mk("h2", "", "🔔 Notifications"));

        var tools = mk("div", "cfn-tools");

        var read = mk("button", "dark-button", "Mark all read");

        read.type = "button";
        read.addEventListener("click", markAllRead);

        var clear = mk("button", "dark-button", "Clear all");

        clear.type = "button";
        clear.addEventListener("click", clearAll);

        tools.appendChild(read);
        tools.appendChild(clear);

        head.appendChild(tools);

        body.appendChild(head);

        var list = mk("div");

        list.appendChild(mk("div", "cfn-note", "Loading..."));

        body.appendChild(list);

        var rows = [];

        try {
            var result = await window.supabaseClient
                .from("notifications")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);

            if (result.error) {
                throw result.error;
            }

            rows = result.data || [];

        } catch (error) {
            console.warn("Could not load notifications:", error);

            list.innerHTML = "";

            list.appendChild(
                mk(
                    "div",
                    "cfn-note",
                    "Couldn't load notifications (did you run the SQL?)."
                )
            );

            return;
        }

        list.innerHTML = "";

        if (rows.length === 0) {
            list.appendChild(
                mk(
                    "div",
                    "cfn-note",
                    "Nothing yet. When someone subscribes, comments, replies or likes your video, you'll see it here."
                )
            );

            return;
        }

        var hadUnread = false;

        rows.forEach(function (row) {
            var item = mk("div", "cfn-item" + (row.is_read ? "" : " unread"));

            if (!row.is_read) {
                hadUnread = true;
            }

            item.appendChild(mk("div", "cfn-icon", ICONS[row.type] || "🔔"));

            var text = mk("div", "cfn-text");

            text.appendChild(document.createTextNode(row.message));
            text.appendChild(mk("div", "cfn-time", timeAgo(row.created_at)));

            item.appendChild(text);

            item.addEventListener("click", function () {
                openItem(row);
            });

            list.appendChild(item);
        });

        // Opening the list counts as seeing everything.
        if (hadUnread) {
            setTimeout(function () {
                if (isPopupOpen()) {
                    markAllRead();
                }
            }, 1500);
        }
    }

    function openNotifications() {
        if (!me) {
            return;
        }

        ensureStyles();

        var popup = ensurePopup();

        popup.style.display = "flex";

        loadList();
    }

    /*
     * =========================================
     * LIVE UPDATES
     * =========================================
     */

    function onNew(row) {
        if (!row) {
            return;
        }

        setUnread(unread + 1);

        toast("🔔 " + row.message, {
            ms: 6000,
            onClick: function () {
                openItem(row);
            }
        });

        if (isPopupOpen()) {
            loadList();
        }
    }

    function stopListening() {
        if (channel && window.supabaseClient) {
            try {
                window.supabaseClient.removeChannel(channel);
            } catch (error) {
                console.warn(error);
            }
        }

        channel = null;

        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startFor(user) {
        stopListening();

        me = user;

        var bell = ensureBell();

        if (!user) {
            if (bell) {
                bell.style.display = "none";
            }

            setUnread(0);
            closePopup();

            return;
        }

        if (bell) {
            bell.style.display = "";
        }

        refreshUnread();

        try {
            channel = window.supabaseClient
                .channel("clipfly-notifs-" + user.id)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "notifications",
                        filter: "user_id=eq." + user.id
                    },
                    function (payload) {
                        onNew(payload && payload.new);
                    }
                )
                .subscribe();

        } catch (error) {
            console.warn("Could not listen for notifications:", error);
        }

        // Backup in case the live connection drops.
        pollTimer = setInterval(function () {
            if (!document.hidden) {
                refreshUnread();
            }
        }, 60000);
    }

    /*
     * =========================================
     * START
     * =========================================
     */

    function init() {
        ensureBell();

        if (!window.supabaseClient || !window.supabaseClient.auth) {
            return;
        }

        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            var user = session && session.user ? session.user : null;

            // Supabase advises not to await its calls inside this callback.
            setTimeout(function () {
                if (user && me && me.id === user.id) {
                    return;
                }

                startFor(user);
            }, 0);
        });

        window.supabaseClient.auth
            .getSession()
            .then(function (result) {
                var session = result && result.data && result.data.session;

                if (session && session.user && (!me || me.id !== session.user.id)) {
                    startFor(session.user);
                }
            })
            .catch(function (error) {
                console.warn(error);
            });
    }

    init();

})();