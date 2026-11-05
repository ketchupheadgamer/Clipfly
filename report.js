(function () {
    "use strict";

    /*
     * Reports: anyone can report a video or a channel, and the official
     * Clipfly account gets a "Reports" button (with a count) and an inbox.
     * Needs the reports SQL in Supabase.
     */

    var REASONS = [
        ["spam", "Spam or scam"],
        ["harassment", "Harassment or hate"],
        ["inappropriate", "Adult or inappropriate content"],
        ["dangerous", "Violent or dangerous content"],
        ["copyright", "Stolen or copyrighted content"],
        ["other", "Something else"]
    ];

    var REASON_LABEL = {};

    REASONS.forEach(function (item) {
        REASON_LABEL[item[0]] = item[1];
    });

    var isOfficial = false;
    var officialFor = null;
    var countTimer = null;
    var flash = "";

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
        } else {
            alert(text);
        }
    }

    function say(title, text, icon) {
        if (typeof showMessage === "function") {
            showMessage(title, text, icon);
        } else {
            alert(title + "\n\n" + text);
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

    async function getUser() {
        if (window.currentUser) {
            return window.currentUser;
        }

        if (typeof refreshCurrentUser === "function") {
            try {
                return await refreshCurrentUser();
            } catch (error) {
                return null;
            }
        }

        return null;
    }

    /*
     * =========================================
     * STYLES
     * =========================================
     */

    function ensureStyles() {
        if (byId("clipflyReportStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyReportStyles";

        style.textContent = `
            #clipflyReportsCount {
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

            .cfr-note {
                color: #9ca8ba;
                line-height: 1.5;
                margin-bottom: 14px;
            }

            .cfr-label {
                display: block;
                font-weight: 700;
                margin-bottom: 6px;
            }

            .cfr-select {
                width: 100%;
                box-sizing: border-box;
                padding: 12px;
                border-radius: 10px;
                border: 1px solid #35353d;
                background: #101014;
                color: #ffffff;
                outline: none;
                font-family: inherit;
                font-size: 15px;
            }

            .cfr-status {
                min-height: 18px;
                font-size: 14px;
            }

            .cfr-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 6px;
            }

            .cfr-card {
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

            .cfr-card:hover {
                border-color: #3478ff;
            }

            .cfr-icon {
                width: 40px;
                min-width: 40px;
                height: 40px;
                border-radius: 50%;
                background: #1b2433;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
            }

            .cfr-main {
                flex: 1;
                min-width: 0;
            }

            .cfr-title {
                font-weight: 700;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .cfr-meta {
                margin-top: 3px;
                font-size: 13px;
                color: #9ca8ba;
            }

            .cfr-back {
                border: none;
                background: transparent;
                color: #4b8cff;
                cursor: pointer;
                padding: 0;
                margin-bottom: 12px;
                font-size: 14px;
            }

            .cfr-back:hover {
                text-decoration: underline;
            }

            .cfr-block {
                margin-bottom: 14px;
            }

            .cfr-block-label {
                font-size: 12px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #9ca8ba;
                margin-bottom: 5px;
            }

            .cfr-block-text {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                line-height: 1.5;
                padding: 11px 12px;
                border-radius: 10px;
                background: #101014;
                border: 1px solid #242d3d;
            }

            .cfr-block-text.empty {
                color: #6b7686;
            }
        `;

        document.head.appendChild(style);
    }

    function ensurePopup(id, width, zIndex) {
        var popup = byId(id);

        if (popup) {
            return popup;
        }

        popup = mk("div", "popup");

        popup.id = id;
        popup.style.display = "none";
        popup.style.zIndex = String(zIndex);

        var box = mk("div", "popup-box");

        box.style.width = "min(" + width + "px, 94vw)";
        box.style.maxHeight = "90vh";
        box.style.overflowY = "auto";

        var close = mk("button", "close-button", "✕");

        close.type = "button";

        close.addEventListener("click", function () {
            popup.style.display = "none";

            if (id === "clipflyReportsInbox") {
                refreshCount();
            }
        });

        var body = mk("div");

        body.id = id + "Body";

        box.appendChild(close);
        box.appendChild(body);
        popup.appendChild(box);

        document.body.appendChild(popup);

        return popup;
    }

    /*
     * =========================================
     * SENDING A REPORT
     * =========================================
     */

    function closeReportDialog() {
        var popup = byId("clipflyReportPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    // target: { type: "video" | "channel", id, title, ownerId }
    async function openReportDialog(target) {
        var user = await getUser();

        if (!user) {
            say(
                "Log in required",
                "You need to be logged in to send a report.",
                "🔒"
            );

            return;
        }

        if (
            (target.type === "channel" && target.id === user.id) ||
            (target.ownerId && target.ownerId === user.id)
        ) {
            toast("You can't report your own " + target.type + ".");
            return;
        }

        ensureStyles();

        var popup = ensurePopup("clipflyReportPopup", 480, 100000);
        var body = byId("clipflyReportPopupBody");

        body.innerHTML = "";

        body.appendChild(mk("h2", "", "🚩 Report"));

        var name =
            target.type === "channel"
                ? "@" + (target.title || "this channel")
                : '"' + (target.title || "this video") + '"';

        body.appendChild(
            mk(
                "p",
                "cfr-note",
                "Tell us what's wrong with " +
                    name +
                    ". Your report is private and only the Clipfly team sees it."
            )
        );

        var form = mk("div", "account-form");

        var reasonField = mk("label");

        reasonField.appendChild(mk("span", "cfr-label", "What's the problem?"));

        var select = document.createElement("select");

        select.className = "cfr-select";

        REASONS.forEach(function (item) {
            var option = document.createElement("option");

            option.value = item[0];
            option.textContent = item[1];

            select.appendChild(option);
        });

        reasonField.appendChild(select);

        var detailsField = mk("label");

        detailsField.appendChild(
            mk("span", "cfr-label", "Anything else we should know? (optional)")
        );

        var details = document.createElement("textarea");

        details.maxLength = 500;
        details.placeholder = "Add any details that would help...";

        detailsField.appendChild(details);

        var status = mk("div", "cfr-status");

        function setStatus(text, isError) {
            status.textContent = text || "";
            status.style.color = isError ? "#f87171" : "#9ca8ba";
        }

        var actions = mk("div", "cfr-actions");

        var cancel = mk("button", "dark-button", "Cancel");

        cancel.type = "button";
        cancel.addEventListener("click", closeReportDialog);

        var send = mk("button", "blue-button", "Send report");

        send.type = "button";

        send.addEventListener("click", async function () {
            send.disabled = true;

            setStatus("Sending...", false);

            try {
                var meta = user.user_metadata || {};

                var result = await window.supabaseClient
                    .from("reports")
                    .insert({
                        reporter_id: user.id,
                        reporter_name: String(meta.username || "User").slice(0, 60),
                        target_type: target.type,
                        target_id: String(target.id),
                        target_title: String(target.title || "").slice(0, 120),
                        target_owner_id: target.ownerId || null,
                        reason: select.value,
                        details: details.value.trim() || null
                    });

                if (result.error) {
                    throw result.error;
                }

                closeReportDialog();

                toast("🚩 Thanks! The Clipfly team will take a look.", { ms: 5000 });

            } catch (error) {
                console.warn("Report failed:", error);

                send.disabled = false;

                if (error && error.code === "23505") {
                    setStatus("You already reported this. Thank you!", true);
                } else {
                    setStatus(
                        error.message || "Could not send your report.",
                        true
                    );
                }
            }
        });

        actions.appendChild(cancel);
        actions.appendChild(send);

        form.appendChild(reasonField);
        form.appendChild(detailsField);
        form.appendChild(status);
        form.appendChild(actions);

        body.appendChild(form);

        popup.style.display = "flex";
    }

    /*
     * =========================================
     * REPORT BUTTONS: WATCH WINDOW
     * =========================================
     */

    function addWatchReport() {
        var row = byId("clipflyReactionRow");

        if (!row || byId("clipflyReportVideoButton")) {
            return;
        }

        var button = document.createElement("button");

        button.id = "clipflyReportVideoButton";
        button.className = "clipfly-reaction-button";
        button.type = "button";
        button.textContent = "🚩 Report";

        button.addEventListener("click", function (event) {
            event.stopPropagation();

            var video =
                typeof currentWatchingVideo !== "undefined"
                    ? currentWatchingVideo
                    : null;

            if (!video) {
                return;
            }

            openReportDialog({
                type: "video",
                id: video.id,
                title: video.title || "this video",
                ownerId: video.owner_id || null
            });
        });

        row.appendChild(button);
    }

    var originalWatchFeatures = window.createWatchFeatures;

    if (typeof originalWatchFeatures === "function") {
        window.createWatchFeatures = function () {
            var result = originalWatchFeatures.apply(this, arguments);

            try {
                addWatchReport();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };
    }

    /*
     * =========================================
     * REPORT BUTTONS: SHORTS
     * =========================================
     */

    async function reportShortFromRail(rail) {
        var card = rail.closest(".clipfly-short");
        var video = card ? card.querySelector("video") : null;
        var src = video ? video.getAttribute("src") || video.currentSrc : "";

        if (!src) {
            toast("Let the short load for a second, then try again.");
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("videos")
                .select("id, title, owner_id")
                .eq("video_url", src)
                .limit(1);

            if (result.error) {
                throw result.error;
            }

            var row = result.data && result.data[0];

            if (!row) {
                toast("Couldn't find this short.");
                return;
            }

            openReportDialog({
                type: "video",
                id: row.id,
                title: row.title || "this short",
                ownerId: row.owner_id || null
            });

        } catch (error) {
            console.warn("Could not report the short:", error);

            toast("Couldn't start the report.");
        }
    }

    function addShortReport(rail) {
        if (rail.querySelector(".clipfly-report-action")) {
            return;
        }

        var button = document.createElement("button");

        button.className = "clipfly-short-action clipfly-report-action";
        button.type = "button";
        button.title = "Report";

        var icon = document.createElement("span");

        icon.className = "icon";
        icon.textContent = "🚩";

        var label = document.createElement("span");

        label.className = "count";
        label.textContent = "Report";

        button.appendChild(icon);
        button.appendChild(label);

        button.addEventListener("click", function (event) {
            event.stopPropagation();
            reportShortFromRail(rail);
        });

        rail.appendChild(button);
    }

    function watchShortsFeed() {
        var feed = byId("clipflyShortsFeed");

        if (!feed || feed.__reportWatched) {
            return;
        }

        feed.__reportWatched = true;

        function addAll() {
            feed.querySelectorAll(".clipfly-short-rail").forEach(addShortReport);
        }

        new MutationObserver(addAll).observe(feed, {
            childList: true,
            subtree: true
        });

        addAll();
    }

    /*
     * =========================================
     * REPORT BUTTON: CHANNEL WINDOW
     * =========================================
     */

    function addChannelReport() {
        var stats = byId("clipflyChannelStats");

        if (!stats || byId("clipflyReportChannelButton")) {
            return;
        }

        var info =
            typeof currentChannelUser !== "undefined" ? currentChannelUser : null;

        if (!info || !info.user_id) {
            return;
        }

        var me = window.currentUser;

        if (me && me.id === info.user_id) {
            return;
        }

        var button = document.createElement("button");

        button.id = "clipflyReportChannelButton";
        button.type = "button";
        button.className = "clipfly-subscribe-button subscribed";
        button.style.marginLeft = "0";
        button.textContent = "🚩 Report";

        button.addEventListener("click", function (event) {
            event.stopPropagation();

            openReportDialog({
                type: "channel",
                id: info.user_id,
                title: info.username || "User",
                ownerId: info.user_id
            });
        });

        stats.appendChild(button);
    }

    var originalOpenChannel = window.openUserChannel;

    if (typeof originalOpenChannel === "function") {
        window.openUserChannel = function () {
            var result = originalOpenChannel.apply(this, arguments);

            try {
                addChannelReport();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };
    }

    /*
     * =========================================
     * THE MODERATOR INBOX (official account only)
     * =========================================
     */

    async function checkOfficial(user) {
        if (!user || !window.supabaseClient) {
            officialFor = null;

            return false;
        }

        if (officialFor === user.id) {
            return isOfficial;
        }

        var answer = false;

        try {
            var result = await window.supabaseClient
                .from("admins")
                .select("user_id")
                .eq("user_id", user.id)
                .maybeSingle();

            if (result.error) {
                throw result.error;
            }

            answer = !!result.data;

        } catch (error) {
            console.warn("Could not check official status:", error);
        }

        officialFor = user.id;

        return answer;
    }

    async function refreshCount() {
        var bubble = byId("clipflyReportsCount");

        if (!isOfficial || !bubble || !window.supabaseClient) {
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("reports")
                .select("id", { count: "exact", head: true })
                .eq("status", "open");

            if (result.error) {
                throw result.error;
            }

            var count = result.count || 0;

            bubble.textContent = String(count);
            bubble.style.display = count > 0 ? "inline-block" : "none";

        } catch (error) {
            console.warn("Could not count reports (did you run the SQL?):", error);
        }
    }

    function ensureReportsButton() {
        var bar = document.querySelector(".top-buttons");

        if (!bar) {
            return null;
        }

        var button = byId("clipflyReportsButton");

        if (button) {
            return button;
        }

        ensureStyles();

        button = mk("button", "", "🚩 Reports");

        button.id = "clipflyReportsButton";
        button.type = "button";

        var bubble = mk("span", "", "0");

        bubble.id = "clipflyReportsCount";

        button.appendChild(bubble);

        button.addEventListener("click", openInbox);

        var anchor =
            byId("clipflyAppliesButton") ||
            byId("clipflyApplyButton") ||
            byId("clipflyGoLiveButton");

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(button, anchor.nextSibling);
        } else {
            bar.appendChild(button);
        }

        return button;
    }

    function openInbox() {
        if (!isOfficial) {
            return;
        }

        ensureStyles();

        var popup = ensurePopup("clipflyReportsInbox", 680, 1900);

        popup.style.display = "flex";

        showInbox();
    }

    async function resolveReport(report, action, message) {
        try {
            var result = await window.supabaseClient.rpc("resolve_report", {
                p_report_id: report.id,
                p_action: action
            });

            if (result.error) {
                throw result.error;
            }

            flash = message;

            refreshCount();

            await showInbox();

        } catch (error) {
            console.error("Could not close the report:", error);

            say(
                "Couldn't close the report",
                error.message || "Something went wrong.",
                "❌"
            );
        }
    }

    async function showInbox() {
        var body = byId("clipflyReportsInboxBody");

        if (!body) {
            return;
        }

        body.innerHTML = "";

        body.appendChild(mk("h2", "", "🚩 Reports"));

        if (flash) {
            var note = mk("p", "cfr-note", flash);

            note.style.color = "#4ade80";

            body.appendChild(note);

            flash = "";
        }

        var list = mk("div");

        list.appendChild(mk("p", "cfr-note", "Loading..."));

        body.appendChild(list);

        var rows = [];

        try {
            var result = await window.supabaseClient
                .from("reports")
                .select("*")
                .eq("status", "open")
                .order("created_at", { ascending: true });

            if (result.error) {
                throw result.error;
            }

            rows = result.data || [];

        } catch (error) {
            console.warn("Could not load reports:", error);

            list.innerHTML = "";

            list.appendChild(
                mk(
                    "p",
                    "cfr-note",
                    "Couldn't load reports: " +
                        (error.message || "Something went wrong.")
                )
            );

            return;
        }

        list.innerHTML = "";

        if (rows.length === 0) {
            list.appendChild(
                mk("p", "cfr-note", "No open reports. Nice and quiet! 🎉")
            );

            return;
        }

        rows.forEach(function (report) {
            var card = mk("div", "cfr-card");

            card.appendChild(
                mk("div", "cfr-icon", report.target_type === "channel" ? "👤" : "🎬")
            );

            var main = mk("div", "cfr-main");

            main.appendChild(
                mk(
                    "div",
                    "cfr-title",
                    (report.target_type === "channel" ? "@" : "") +
                        (report.target_title || "Untitled")
                )
            );

            main.appendChild(
                mk(
                    "div",
                    "cfr-meta",
                    (REASON_LABEL[report.reason] || report.reason) +
                        " · by @" +
                        (report.reporter_name || "User") +
                        " · " +
                        timeAgo(report.created_at)
                )
            );

            card.appendChild(main);

            card.addEventListener("click", function () {
                showDetail(report);
            });

            list.appendChild(card);
        });
    }

    function addBlock(parent, label, value) {
        var block = mk("div", "cfr-block");

        block.appendChild(mk("div", "cfr-block-label", label));

        var text = mk("div", "cfr-block-text", value || "(nothing)");

        if (!value) {
            text.classList.add("empty");
        }

        block.appendChild(text);

        parent.appendChild(block);
    }

    async function showDetail(report) {
        var body = byId("clipflyReportsInboxBody");

        if (!body) {
            return;
        }

        body.innerHTML = "";

        var back = mk("button", "cfr-back", "← Back to reports");

        back.type = "button";
        back.addEventListener("click", showInbox);

        body.appendChild(back);

        body.appendChild(
            mk(
                "h2",
                "",
                report.target_type === "channel"
                    ? "Report on @" + (report.target_title || "User")
                    : "Report on a video"
            )
        );

        addBlock(body, "Problem", REASON_LABEL[report.reason] || report.reason);

        if (report.target_type === "video") {
            addBlock(body, "Video", report.target_title);
        }

        addBlock(body, "Sent by", "@" + (report.reporter_name || "User"));
        addBlock(body, "When", timeAgo(report.created_at));
        addBlock(body, "Their details", report.details);

        var status = mk("div", "cfr-status");

        status.style.marginTop = "10px";

        var actions = mk("div", "cfr-actions");

        body.appendChild(actions);
        body.appendChild(status);

        function addAction(label, className, handler) {
            var button = mk("button", className || "dark-button", label);

            button.type = "button";

            button.addEventListener("click", handler);

            actions.appendChild(button);

            return button;
        }

        if (report.target_type === "channel") {
            addAction("👁 Open channel", "dark-button", function () {
                if (typeof window.clipflyOpenChannelById === "function") {
                    window.clipflyOpenChannelById(report.target_id);
                }
            });

            addAction("✅ Mark handled", "blue-button", function () {
                resolveReport(report, "resolve", "Report marked as handled.");
            });

            addAction("🚫 Dismiss", "dark-button", function () {
                resolveReport(report, "dismiss", "Report dismissed.");
            });

            return;
        }

        // A video report: find the video first.
        var video = null;

        try {
            var found = await window.supabaseClient
                .from("videos")
                .select("*")
                .eq("id", report.target_id)
                .maybeSingle();

            video = (found && found.data) || null;

        } catch (error) {
            console.warn(error);
        }

        if (!video) {
            status.style.color = "#9ca8ba";
            status.textContent = "This video is already gone.";

            addAction("✅ Mark handled", "blue-button", function () {
                resolveReport(report, "resolve", "Report marked as handled.");
            });

            return;
        }

        addAction("👁 Open video", "dark-button", function () {
            if (typeof watchVideo === "function") {
                watchVideo(video);
            }
        });

        addAction("🗑️ Delete video", "dark-button", async function () {
            if (typeof window.deleteVideo !== "function") {
                status.style.color = "#f87171";
                status.textContent = "Moderator delete isn't available.";
                return;
            }

            await window.deleteVideo(
                Object.assign({}, video, { __clipflyModerated: true })
            );

            // Did it really get deleted?
            var check = await window.supabaseClient
                .from("videos")
                .select("id")
                .eq("id", report.target_id)
                .maybeSingle();

            if (check && !check.data) {
                resolveReport(report, "resolve", "Video deleted and report closed.");

            } else {
                status.style.color = "#f87171";
                status.textContent =
                    "The video is still there (the delete was cancelled or didn't work).";
            }
        });

        addAction("🚫 Dismiss", "dark-button", function () {
            resolveReport(report, "dismiss", "Report dismissed.");
        });
    }

    async function refreshOfficialUI(user) {
        isOfficial = user ? await checkOfficial(user) : false;

        if (isOfficial) {
            ensureReportsButton();

            refreshCount();

            if (!countTimer) {
                countTimer = setInterval(refreshCount, 60000);
            }

        } else {
            var button = byId("clipflyReportsButton");

            if (button) {
                button.remove();
            }

            var popup = byId("clipflyReportsInbox");

            if (popup) {
                popup.style.display = "none";
            }

            if (countTimer) {
                clearInterval(countTimer);
                countTimer = null;
            }
        }
    }

    /*
     * =========================================
     * START
     * =========================================
     */

    function init() {
        setInterval(watchShortsFeed, 1500);

        if (!window.supabaseClient || !window.supabaseClient.auth) {
            return;
        }

        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            var user = session && session.user ? session.user : null;

            // Supabase advises not to await its calls inside this callback.
            setTimeout(function () {
                refreshOfficialUI(user);
            }, 0);
        });

        window.supabaseClient.auth
            .getSession()
            .then(function (result) {
                var session = result && result.data && result.data.session;

                return refreshOfficialUI(session ? session.user : null);
            })
            .catch(function (error) {
                console.warn(error);
            });
    }

    init();

})();