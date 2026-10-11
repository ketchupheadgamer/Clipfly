(function () {
    "use strict";

    /*
     * Clipfly Shorts: a vertical, one-at-a-time scrolling feed.
     * A "Short" is any video with #shorts (or #short) in its title.
     * Shorts come in a fresh random order every time the tab is opened.
     * Uses the existing video_reactions and video_comments tables.
     *
     * This file also holds the comment system with replies, which is used
     * by the Shorts comment panel AND by the normal video watch window.
     */

    var PAGE_SIZE = 10;

    var COMMENT_COLUMNS =
        "id, video_id, user_id, username, avatar_url, comment, created_at, parent_id";

    var COMMENT_COLUMNS_OLD =
        "id, video_id, user_id, username, avatar_url, comment, created_at";

    var view = null;
    var stage = null;
    var feed = null;
    var panel = null;

    var state = newState();
    var activeObserver = null;
    var nearObserver = null;

    var visible = false;
    var suspended = false;
    var shortsMuted = false;
    var commentsOpen = false;
    var wheelLocked = false;
    var wheelTimer = null;

    function newState() {
        return {
            items: [],
            ids: null,
            queue: [],
            pos: 0,
            lastId: null,
            done: false,
            loading: false,
            active: -1
        };
    }

    /*
     * =========================================
     * SMALL HELPERS
     * =========================================
     */

    function byId(id) {
        return document.getElementById(id);
    }

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

    function compact(value) {
        var n = Number(value) || 0;

        if (n >= 1000000) {
            return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
        }

        if (n >= 1000) {
            return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
        }

        return String(n);
    }

    function say(title, text, icon) {
        if (typeof showMessage === "function") {
            showMessage(title, text, icon);
        } else {
            alert(title + "\n\n" + text);
        }
    }

    function shuffle(list) {
        var copy = list.slice();

        for (var i = copy.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = copy[i];

            copy[i] = copy[j];
            copy[j] = temp;
        }

        return copy;
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

    function anotherPopupOpen() {
        var popups = document.querySelectorAll(".popup, #clipflyChannelPopup");

        for (var i = 0; i < popups.length; i++) {
            if (window.getComputedStyle(popups[i]).display !== "none") {
                return true;
            }
        }

        return false;
    }

    /*
     * =========================================
     * COMMENTS WITH REPLIES
     * A reply is a comment whose parent_id points at the comment it
     * answers. Like YouTube, replies sit one level deep.
     * =========================================
     */

    function ensureCommentStyles() {
        if (byId("clipflyCommentStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyCommentStyles";

        style.textContent = `
            .cfc-empty {
                padding: 24px 0;
                text-align: center;
                opacity: 0.65;
            }

            .cfc-comment {
                display: flex;
                gap: 10px;
                padding: 10px 0;
                border-top: 1px solid rgba(255, 255, 255, 0.07);
            }

            .cfc-comment:first-child {
                border-top: none;
            }

            .cfc-comment.cfc-reply {
                border-top: none;
                padding: 8px 0 4px;
            }

            .cfc-avatar {
                width: 36px;
                height: 36px;
                min-width: 36px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                cursor: pointer;
            }

            .cfc-reply .cfc-avatar {
                width: 28px;
                height: 28px;
                min-width: 28px;
                font-size: 14px;
            }

            .cfc-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .cfc-body {
                flex: 1;
                min-width: 0;
            }

            .cfc-top {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 3px;
            }

            .cfc-name {
                display: inline-flex;
                align-items: center;
                font-weight: 700;
                font-size: 14px;
            }

            .cfc-date {
                font-size: 12px;
                opacity: 0.6;
            }

            .cfc-delete {
                margin-left: auto;
                border: none;
                background: transparent;
                color: inherit;
                opacity: 0.6;
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 6px;
            }

            .cfc-delete:hover {
                opacity: 1;
                background: rgba(255, 255, 255, 0.08);
            }

            .cfc-text {
                font-size: 14px;
                line-height: 1.4;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
            }

            .cfc-actions {
                margin-top: 4px;
            }

            .cfc-link {
                border: none;
                background: transparent;
                color: inherit;
                opacity: 0.7;
                cursor: pointer;
                font-size: 13px;
                font-weight: 700;
                padding: 4px 8px 4px 0;
            }

            .cfc-link:hover {
                opacity: 1;
            }

            .cfc-replybox {
                display: none;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                margin-top: 6px;
            }

            .cfc-replybox input {
                flex: 1;
                min-width: 120px;
                padding: 9px 11px;
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.06);
                color: inherit;
                outline: none;
                font-family: inherit;
                font-size: 14px;
            }

            .cfc-replybox input:focus {
                border-color: #3b82f6;
            }

            .cfc-send {
                border: none;
                border-radius: 10px;
                padding: 9px 14px;
                background: #3b82f6;
                color: #ffffff;
                cursor: pointer;
                font-weight: 700;
                font-size: 13px;
            }

            .cfc-send:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .cfc-cancel {
                border: none;
                background: transparent;
                color: inherit;
                opacity: 0.7;
                cursor: pointer;
                font-size: 13px;
                font-weight: 700;
            }

            .cfc-toggle {
                border: none;
                background: transparent;
                color: #60a5fa;
                cursor: pointer;
                font-size: 13px;
                font-weight: 700;
                padding: 6px 0;
            }

            .cfc-toggle:hover {
                text-decoration: underline;
            }

            .cfc-replies {
                margin-top: 2px;
            }
        `;

        document.head.appendChild(style);
    }

    function makeCommentAvatar(comment) {
        var avatar = el("div", "cfc-avatar");

        avatar.title = "Open @" + (comment.username || "User") + "'s channel";

        if (comment.avatar_url) {
            var image = document.createElement("img");

            image.src = comment.avatar_url;
            image.alt = "";

            image.onerror = function () {
                image.remove();
                avatar.textContent = "👤";
            };

            avatar.appendChild(image);

        } else {
            avatar.textContent = "👤";
        }

        avatar.addEventListener("click", function (event) {
            event.stopPropagation();

            if (typeof openUserChannel === "function") {
                openUserChannel(
                    comment.username || "User",
                    comment.avatar_url || null,
                    comment.user_id || null
                );
            }
        });

        return avatar;
    }

    function buildReplyBox(ctx, threadTop, target, isReply) {
        var box = el("div", "cfc-replybox");

        var input = document.createElement("input");

        input.type = "text";
        input.maxLength = 1000;
        input.autocomplete = "off";
        input.placeholder = "Reply to @" + (target.username || "User") + "...";

        var mention = isReply ? "@" + (target.username || "User") + " " : "";

        var send = el("button", "cfc-send", "Reply");

        send.type = "button";

        var cancel = el("button", "cfc-cancel", "Cancel");

        cancel.type = "button";

        cancel.addEventListener("click", function () {
            box.style.display = "none";
        });

        async function submit() {
            var text = input.value.trim();

            if (!text || text === mention.trim()) {
                return;
            }

            var user = await getUser();

            if (!user) {
                say(
                    "Log in required",
                    "You need to be logged in to reply to comments.",
                    "🔒"
                );

                return;
            }

            var meta = user.user_metadata || {};

            send.disabled = true;
            send.textContent = "Posting...";

            try {
                var result = await window.supabaseClient
                    .from("video_comments")
                    .insert({
                        video_id: ctx.videoId,
                        user_id: user.id,
                        username: meta.username || "User",
                        avatar_url: meta.avatar_url || null,
                        comment: text,
                        parent_id: threadTop.id
                    });

                if (result.error) {
                    throw result.error;
                }

                // Keep this thread open so the new reply is visible.
                ctx.list.__cfcOpen[threadTop.id] = true;

                await renderComments(ctx.list, ctx.videoId, ctx.options);

            } catch (error) {
                console.error("Reply failed:", error);

                send.disabled = false;
                send.textContent = "Reply";

                say(
                    "Reply failed",
                    error.message || "Could not post your reply.",
                    "❌"
                );
            }
        }

        send.addEventListener("click", submit);

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                submit();
            }
        });

        box.appendChild(input);
        box.appendChild(send);
        box.appendChild(cancel);

        box.openBox = function () {
            box.style.display = "flex";

            if (!input.value) {
                input.value = mention;
            }

            input.focus();

            try {
                input.setSelectionRange(input.value.length, input.value.length);
            } catch (error) {
                console.warn(error);
            }
        };

        return box;
    }

    async function deleteOwnComment(ctx, comment, replyCount) {
        var user = await getUser();

        if (!user || !comment.id) {
            return;
        }

        var message =
            replyCount > 0
                ? "Delete your comment? Its " +
                  replyCount +
                  (replyCount === 1 ? " reply" : " replies") +
                  " will be deleted too."
                : "Delete your comment?";

        if (!window.confirm(message)) {
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("video_comments")
                .delete()
                .eq("id", comment.id)
                .eq("user_id", user.id);

            if (result.error) {
                throw result.error;
            }

            await renderComments(ctx.list, ctx.videoId, ctx.options);

        } catch (error) {
            console.error("Delete comment failed:", error);

            say(
                "Delete failed",
                error.message || "Could not delete your comment.",
                "❌"
            );
        }
    }

    function buildCommentRow(ctx, comment, threadTop, isReply, replyCount) {
        var row = el("div", "cfc-comment" + (isReply ? " cfc-reply" : ""));

        row.appendChild(makeCommentAvatar(comment));

        var body = el("div", "cfc-body");
        var top = el("div", "cfc-top");

        var name = el("span", "cfc-name");

        name.appendChild(
            document.createTextNode("@" + (comment.username || "User"))
        );

        var profile = ctx.profiles[comment.user_id];

        if (typeof addVerifiedBadge === "function") {
            addVerifiedBadge(name, !!(profile && profile.verified));
        }

        var date = el(
            "span",
            "cfc-date",
            new Date(comment.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric"
            })
        );

        top.appendChild(name);
        top.appendChild(date);

        if (ctx.me && comment.user_id === ctx.me.id) {
            var remove = el("button", "cfc-delete", "🗑️");

            remove.type = "button";
            remove.title = "Delete comment";

            remove.addEventListener("click", function () {
                deleteOwnComment(ctx, comment, replyCount);
            });

            top.appendChild(remove);
        }

        var text = el("div", "cfc-text", comment.comment);

        body.appendChild(top);
        body.appendChild(text);

        if (ctx.canReply) {
            var actions = el("div", "cfc-actions");

            var replyButton = el("button", "cfc-link", "Reply");

            replyButton.type = "button";

            var box = buildReplyBox(ctx, threadTop, comment, isReply);

            replyButton.addEventListener("click", function () {
                if (box.style.display === "flex") {
                    box.style.display = "none";
                } else {
                    box.openBox();
                }
            });

            actions.appendChild(replyButton);

            body.appendChild(actions);
            body.appendChild(box);
        }

        row.appendChild(body);

        return row;
    }

    function buildThread(ctx, comment, replyList) {
        var row = buildCommentRow(ctx, comment, comment, false, replyList.length);

        if (replyList.length === 0) {
            return row;
        }

        var body = row.querySelector(".cfc-body");

        var holder = el("div", "cfc-replies");

        holder.style.display = ctx.list.__cfcOpen[comment.id] ? "block" : "none";

        var toggle = el("button", "cfc-toggle");

        toggle.type = "button";

        function refreshLabel() {
            var count = replyList.length;

            toggle.textContent =
                (holder.style.display === "none" ? "▾ " : "▴ ") +
                count +
                (count === 1 ? " reply" : " replies");
        }

        toggle.addEventListener("click", function () {
            var opening = holder.style.display === "none";

            holder.style.display = opening ? "block" : "none";

            ctx.list.__cfcOpen[comment.id] = opening;

            refreshLabel();
        });

        replyList.forEach(function (reply) {
            holder.appendChild(
                buildCommentRow(ctx, reply, comment, true, 0)
            );
        });

        refreshLabel();

        body.appendChild(toggle);
        body.appendChild(holder);

        return row;
    }

    async function renderComments(list, videoId, options) {
        options = options || {};

        if (!list || !videoId || !window.supabaseClient) {
            return;
        }

        ensureCommentStyles();

        var token = (list.__cfcToken || 0) + 1;

        list.__cfcToken = token;

        var keepScroll = list.scrollTop;

        if (!list.__cfcOpen) {
            list.__cfcOpen = {};
        }

        if (list.__cfcVideo !== videoId) {
            list.__cfcVideo = videoId;
            list.__cfcOpen = {};

            keepScroll = 0;

            list.innerHTML = "";
            list.appendChild(el("div", "cfc-empty", "Loading comments..."));
        }

        var canReply = true;
        var comments = [];

        try {
            var result = await window.supabaseClient
                .from("video_comments")
                .select(COMMENT_COLUMNS)
                .eq("video_id", videoId)
                .order("created_at", { ascending: false });

            if (result.error) {
                // The reply column isn't there yet (SQL not run): show
                // normal comments without reply buttons.
                canReply = false;

                result = await window.supabaseClient
                    .from("video_comments")
                    .select(COMMENT_COLUMNS_OLD)
                    .eq("video_id", videoId)
                    .order("created_at", { ascending: false });

                if (result.error) {
                    throw result.error;
                }
            }

            comments = result.data || [];

        } catch (error) {
            console.error("Could not load comments:", error);

            if (token === list.__cfcToken) {
                list.innerHTML = "";
                list.appendChild(el("div", "cfc-empty", "Could not load comments."));
            }

            return;
        }

        var profiles = {};

        try {
            if (typeof getProfilesByIds === "function") {
                profiles = await getProfilesByIds(
                    comments.map(function (comment) {
                        return comment.user_id;
                    })
                );
            }
        } catch (error) {
            profiles = {};
        }

        if (token !== list.__cfcToken) {
            return;
        }

        if (options.onCount) {
            options.onCount(comments.length);
        }

        var topLevel = [];
        var replies = {};

        comments.forEach(function (comment) {
            if (canReply && comment.parent_id) {
                if (!replies[comment.parent_id]) {
                    replies[comment.parent_id] = [];
                }

                replies[comment.parent_id].push(comment);

            } else {
                topLevel.push(comment);
            }
        });

        // Replies read oldest first, like YouTube.
        Object.keys(replies).forEach(function (key) {
            replies[key].sort(function (a, b) {
                return new Date(a.created_at) - new Date(b.created_at);
            });
        });

        list.innerHTML = "";

        if (topLevel.length === 0) {
            list.appendChild(
                el("div", "cfc-empty", "No comments yet. Be the first! 💬")
            );

            return;
        }

        var ctx = {
            list: list,
            videoId: videoId,
            options: options,
            canReply: canReply,
            me: window.currentUser,
            profiles: profiles
        };

        topLevel.forEach(function (comment) {
            list.appendChild(buildThread(ctx, comment, replies[comment.id] || []));
        });

        list.scrollTop = keepScroll;
    }

    /*
     * =========================================
     * STYLES (Shorts)
     * =========================================
     */

    function ensureStyles() {
        if (byId("clipflyShortsStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyShortsStyles";

        style.textContent = `
            #clipflyShortsView {
                position: fixed;
                top: 72px;
                left: 240px;
                right: 0;
                bottom: 0;
                z-index: 800;
                display: none;
                justify-content: center;
                background: #05070b;
            }

            @media (max-width: 900px) {
                #clipflyShortsView { left: 190px; }
            }

            @media (max-width: 650px) {
                #clipflyShortsView { top: 64px; left: 65px; }
                #clipflyShortsNav { display: none !important; }
            }

            #clipflyShortsStage {
                position: relative;
                height: 100%;
                width: min(440px, 100%);
                background: #000;
                overflow: hidden;
            }

            #clipflyShortsFeed {
                position: relative;
                height: 100%;
                width: 100%;
                overflow-y: scroll;
                scroll-snap-type: y mandatory;
                overscroll-behavior: contain;
                scrollbar-width: none;
            }

            #clipflyShortsFeed::-webkit-scrollbar {
                display: none;
            }

            #clipflyShortsMessage {
                position: absolute;
                inset: 0;
                z-index: 2;
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 30px;
                color: #9ca8ba;
                pointer-events: none;
            }

            #clipflyShortsMessage h2 {
                color: #ffffff;
                margin-bottom: 8px;
            }

            .clipfly-short {
                position: relative;
                height: 100%;
                width: 100%;
                scroll-snap-align: start;
                scroll-snap-stop: always;
                background: #000;
                overflow: hidden;
            }

            .clipfly-short video {
                display: block;
                width: 100%;
                height: 100%;
                object-fit: contain;
                background: #000;
                cursor: pointer;
            }

            .clipfly-short-play {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 64px;
                color: #ffffff;
                opacity: 0;
                transition: opacity 0.15s ease;
                pointer-events: none;
                text-shadow: 0 2px 14px rgba(0, 0, 0, 0.7);
            }

            .clipfly-short.paused .clipfly-short-play {
                opacity: 0.9;
            }

            .clipfly-short-error {
                position: absolute;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 20px;
                color: #9ca8ba;
                pointer-events: none;
            }

            .clipfly-short.failed .clipfly-short-error {
                display: flex;
            }

            .clipfly-short-info {
                position: absolute;
                left: 0;
                right: 74px;
                bottom: 0;
                padding: 50px 14px 18px;
                background: linear-gradient(transparent, rgba(0, 0, 0, 0.78));
                color: #ffffff;
                pointer-events: none;
                z-index: 3;
            }

            .clipfly-short-user {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-bottom: 6px;
                font-size: 16px;
                font-weight: 800;
                cursor: pointer;
                pointer-events: auto;
                text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
            }

            .clipfly-short-user:hover {
                text-decoration: underline;
            }

            .clipfly-short-title {
                font-size: 15px;
                line-height: 1.35;
                word-break: break-word;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
            }

            .clipfly-short-rail {
                position: absolute;
                right: 10px;
                bottom: 90px;
                z-index: 4;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 14px;
            }

            .clipfly-short-action {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                padding: 0;
                border: none;
                background: none;
                color: #ffffff;
                cursor: pointer;
                font-size: 12px;
                font-weight: 700;
                text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
            }

            .clipfly-short-action .icon {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: rgba(30, 36, 50, 0.78);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                transition: background 0.15s ease, transform 0.1s ease;
            }

            .clipfly-short-action:hover .icon {
                background: rgba(60, 70, 95, 0.92);
            }

            .clipfly-short-action:active .icon {
                transform: scale(0.92);
            }

            .clipfly-short-action.active .icon {
                background: #3b82f6;
            }

            .clipfly-short-progress {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                height: 3px;
                background: rgba(255, 255, 255, 0.25);
                z-index: 4;
            }

            .clipfly-short-progress div {
                width: 0%;
                height: 100%;
                background: #3b82f6;
            }

            #clipflyShortsMute {
                position: absolute;
                top: 12px;
                right: 12px;
                z-index: 7;
                width: 40px;
                height: 40px;
                border: none;
                border-radius: 50%;
                background: rgba(20, 26, 38, 0.8);
                color: #ffffff;
                font-size: 18px;
                cursor: pointer;
            }

            #clipflyShortsNav {
                position: absolute;
                right: 24px;
                top: 50%;
                transform: translateY(-50%);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .clipfly-shorts-nav-button {
                width: 46px;
                height: 46px;
                border: 1px solid #242d3d;
                border-radius: 50%;
                background: #101522;
                color: #ffffff;
                font-size: 20px;
                cursor: pointer;
            }

            .clipfly-shorts-nav-button:hover {
                background: #171e2d;
            }

            #clipflyShortsComments {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                height: 68%;
                z-index: 6;
                display: none;
                flex-direction: column;
                background: #101522;
                border-top: 1px solid #242d3d;
                border-radius: 16px 16px 0 0;
                box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.5);
                color: #ffffff;
            }

            #clipflyShortsComments.open {
                display: flex;
            }

            .clipfly-shorts-comments-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                border-bottom: 1px solid #242d3d;
                font-weight: 800;
            }

            .clipfly-shorts-comments-head button {
                width: 32px;
                height: 32px;
                border: none;
                border-radius: 8px;
                background: #1b2433;
                color: #ffffff;
                cursor: pointer;
            }

            #clipflyShortsCommentList {
                flex: 1;
                overflow-y: auto;
                padding: 6px 16px;
                overscroll-behavior: contain;
            }

            #clipflyShortsCommentForm {
                display: flex;
                gap: 8px;
                padding: 10px 12px;
                border-top: 1px solid #242d3d;
                background: #0c111b;
            }

            #clipflyShortsCommentInput {
                flex: 1;
                min-width: 0;
                padding: 10px 12px;
                border: 1px solid #242d3d;
                border-radius: 10px;
                background: #090e17;
                color: #ffffff;
                outline: none;
                font-family: inherit;
                font-size: 14px;
            }

            #clipflyShortsCommentInput:focus {
                border-color: #3b82f6;
            }
        `;

        document.head.appendChild(style);
    }

    /*
     * =========================================
     * BUILD THE SHORTS VIEW (once)
     * =========================================
     */

    function ensureView() {
        if (view) {
            return view;
        }

        ensureStyles();

        view = el("div");
        view.id = "clipflyShortsView";

        stage = el("div");
        stage.id = "clipflyShortsStage";

        feed = el("div");
        feed.id = "clipflyShortsFeed";

        var message = el("div");
        message.id = "clipflyShortsMessage";

        var mute = el("button", "", "🔊");
        mute.id = "clipflyShortsMute";
        mute.type = "button";
        mute.title = "Mute / unmute";
        mute.addEventListener("click", toggleMute);

        panel = buildCommentsPanel();

        stage.appendChild(feed);
        stage.appendChild(message);
        stage.appendChild(mute);
        stage.appendChild(panel);

        var nav = el("div");
        nav.id = "clipflyShortsNav";

        var up = el("button", "clipfly-shorts-nav-button", "↑");
        up.type = "button";
        up.title = "Previous short";
        up.addEventListener("click", function () {
            goTo(state.active - 1);
        });

        var down = el("button", "clipfly-shorts-nav-button", "↓");
        down.type = "button";
        down.title = "Next short";
        down.addEventListener("click", function () {
            goTo(state.active + 1);
        });

        nav.appendChild(up);
        nav.appendChild(down);

        view.appendChild(stage);
        view.appendChild(nav);

        document.body.appendChild(view);

        // One scroll = one short (like TikTok on desktop).
        feed.addEventListener(
            "wheel",
            function (event) {
                event.preventDefault();

                clearTimeout(wheelTimer);

                wheelTimer = setTimeout(function () {
                    wheelLocked = false;
                }, 160);

                if (wheelLocked || Math.abs(event.deltaY) < 4) {
                    return;
                }

                wheelLocked = true;

                goTo(state.active + (event.deltaY > 0 ? 1 : -1));
            },
            { passive: false }
        );

        return view;
    }

    function setMessage(title, text) {
        var box = byId("clipflyShortsMessage");

        if (!box) {
            return;
        }

        box.innerHTML = "";

        box.appendChild(el("h2", "", title));

        if (text) {
            box.appendChild(el("p", "", text));
        }

        box.style.display = "flex";
    }

    function hideMessage() {
        var box = byId("clipflyShortsMessage");

        if (box) {
            box.style.display = "none";
        }
    }

    /*
     * =========================================
     * SHOW / HIDE
     * =========================================
     */

    async function showShorts() {
        ensureView();

        resetFeed();

        visible = true;
        view.style.display = "flex";

        updateMuteButton();
        setupObservers();
        setMessage("Loading Shorts...", "");

        await loadMore(true);
    }

    function hideShorts() {
        if (!view || !visible) {
            return;
        }

        visible = false;
        view.style.display = "none";

        resetFeed();
    }

    function resetFeed() {
        if (activeObserver) {
            activeObserver.disconnect();
        }

        if (nearObserver) {
            nearObserver.disconnect();
        }

        activeObserver = null;
        nearObserver = null;

        state.items.forEach(function (item) {
            unloadSrc(item);
        });

        state = newState();

        if (feed) {
            feed.innerHTML = "";
            feed.scrollTop = 0;
        }

        closeComments();
        hideMessage();
    }

    /*
     * =========================================
     * LOADING SHORTS (random order)
     * =========================================
     */

    async function fetchStats(ids, userId) {
        var stats = {};

        ids.forEach(function (id) {
            stats[id] = { likes: 0, dislikes: 0, comments: 0, mine: null };
        });

        if (ids.length === 0 || !window.supabaseClient) {
            return stats;
        }

        var me =
            userId !== undefined
                ? userId
                : window.currentUser
                    ? window.currentUser.id
                    : null;

        try {
            var reactions = await window.supabaseClient
                .from("video_reactions")
                .select("video_id, user_id, reaction")
                .in("video_id", ids);

            (reactions.data || []).forEach(function (row) {
                var stat = stats[row.video_id];

                if (!stat) {
                    return;
                }

                if (row.reaction === "like") {
                    stat.likes++;
                } else if (row.reaction === "dislike") {
                    stat.dislikes++;
                }

                if (me && row.user_id === me) {
                    stat.mine = row.reaction;
                }
            });

        } catch (error) {
            console.warn("Could not load reactions:", error);
        }

        try {
            var comments = await window.supabaseClient
                .from("video_comments")
                .select("video_id")
                .in("video_id", ids);

            (comments.data || []).forEach(function (row) {
                if (stats[row.video_id]) {
                    stats[row.video_id].comments++;
                }
            });

        } catch (error) {
            console.warn("Could not load comment counts:", error);
        }

        return stats;
    }

    // Gets the id of every Short (just the ids, so it's fast).
    async function fetchShortIds() {
        var ids = [];
        var from = 0;

        while (ids.length < 5000) {
            var result = await window.supabaseClient
                .from("videos")
                .select("id")
                .ilike("title", "%#short%")
                .order("id", { ascending: true })
                .range(from, from + 999);

            if (result.error) {
                throw result.error;
            }

            var rows = result.data || [];

            if (rows.length === 0) {
                break;
            }

            rows.forEach(function (row) {
                ids.push(row.id);
            });

            from += rows.length;
        }

        return ids;
    }

    async function loadMore(first) {
        var s = state;

        if (s.loading || s.done) {
            return;
        }

        s.loading = true;

        try {
            // First time: get every Short and shuffle them.
            if (!s.ids) {
                var allIds = await fetchShortIds();

                if (s !== state) {
                    return;
                }

                s.ids = allIds;
                s.queue = shuffle(allIds);
                s.pos = 0;
            }

            if (s.ids.length === 0) {
                s.done = true;

                setMessage(
                    "No Shorts yet",
                    "Upload a video with #shorts in the title to put it here."
                );

                return;
            }

            var rows = [];

            for (var attempt = 0; attempt < 5 && rows.length === 0; attempt++) {
                // Out of shorts? Reshuffle so the feed never ends.
                if (s.pos >= s.queue.length) {
                    if (s.ids.length < 2) {
                        s.done = true;
                        break;
                    }

                    var again = shuffle(s.ids);

                    // Don't show the same short twice in a row.
                    if (again[0] === s.lastId) {
                        var swap = again[0];

                        again[0] = again[1];
                        again[1] = swap;
                    }

                    s.queue = again;
                    s.pos = 0;
                }

                var batch = s.queue.slice(s.pos, s.pos + PAGE_SIZE);

                s.pos += batch.length;

                if (batch.length > 0) {
                    s.lastId = batch[batch.length - 1];
                }

                var result = await window.supabaseClient
                    .from("videos")
                    .select("*")
                    .in("id", batch);

                if (result.error) {
                    throw result.error;
                }

                if (s !== state) {
                    return;
                }

                // The database returns them in any order, so put them back
                // into the shuffled order.
                var videoMap = {};

                (result.data || []).forEach(function (video) {
                    videoMap[video.id] = video;
                });

                rows = batch
                    .map(function (id) {
                        return videoMap[id];
                    })
                    .filter(Boolean);
            }

            if (s !== state) {
                return;
            }

            var stats = await fetchStats(
                rows.map(function (row) {
                    return row.id;
                })
            );

            var profiles = {};

            try {
                if (typeof getProfilesByIds === "function") {
                    profiles = await getProfilesByIds(
                        rows.map(function (row) {
                            return row.owner_id;
                        })
                    );
                }
            } catch (error) {
                profiles = {};
            }

            if (s !== state) {
                return;
            }

            rows.forEach(function (video) {
                addShort(video, stats[video.id], profiles[video.owner_id]);
            });

            if (s.items.length === 0) {
                setMessage(
                    "No Shorts yet",
                    "Upload a video with #shorts in the title to put it here."
                );
            } else {
                hideMessage();
            }

        } catch (error) {
            console.error("Could not load shorts:", error);

            if (s === state && s.items.length === 0) {
                setMessage(
                    "Couldn't load Shorts",
                    error.message || "Something went wrong."
                );
            }

        } finally {
            s.loading = false;
        }
    }

    /*
     * =========================================
     * ONE SHORT
     * =========================================
     */

    function makeAction(icon, title, onClick) {
        var button = el("button", "clipfly-short-action");

        button.type = "button";
        button.title = title;

        var iconEl = el("span", "icon", icon);
        var count = el("span", "count", "0");

        button.appendChild(iconEl);
        button.appendChild(count);

        button.addEventListener("click", function (event) {
            event.stopPropagation();
            onClick();
        });

        return { button: button, count: count };
    }

    function updateItemUI(item) {
        item.likeCount.textContent = compact(item.likes);
        item.dislikeCount.textContent = compact(item.dislikes);
        item.commentCountEl.textContent = compact(item.comments);

        item.likeButton.classList.toggle("active", item.mine === "like");
        item.dislikeButton.classList.toggle("active", item.mine === "dislike");
    }

    // If the same short shows up again later, keep its numbers matching.
    function syncCopies(item) {
        state.items.forEach(function (other) {
            if (other !== item && other.video.id === item.video.id) {
                other.likes = item.likes;
                other.dislikes = item.dislikes;
                other.comments = item.comments;
                other.mine = item.mine;

                updateItemUI(other);
            }
        });
    }

    function addShort(video, stat, profile) {
        stat = stat || { likes: 0, dislikes: 0, comments: 0, mine: null };

        var item = {
            video: video,
            index: state.items.length,
            likes: stat.likes,
            dislikes: stat.dislikes,
            comments: stat.comments,
            mine: stat.mine,
            loaded: false,
            userPaused: false,
            busy: false
        };

        var card = el("div", "clipfly-short");

        card.dataset.index = String(item.index);

        var videoEl = document.createElement("video");

        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.setAttribute("playsinline", "");
        videoEl.preload = "none";
        videoEl.muted = shortsMuted;

        if (video.thumbnail_url) {
            videoEl.poster = video.thumbnail_url;
        }

        videoEl.addEventListener("click", function () {
            if (videoEl.paused) {
                item.userPaused = false;
                card.classList.remove("paused");
                playItem(item);
            } else {
                item.userPaused = true;
                videoEl.pause();
                card.classList.add("paused");
            }
        });

        var progress = el("div", "clipfly-short-progress");
        var fill = el("div");

        progress.appendChild(fill);

        videoEl.addEventListener("timeupdate", function () {
            if (videoEl.duration) {
                fill.style.width =
                    (videoEl.currentTime / videoEl.duration) * 100 + "%";
            }
        });

        videoEl.addEventListener("error", function () {
            if (item.loaded) {
                card.classList.add("failed");
            }
        });

        var playIcon = el("div", "clipfly-short-play", "▶");
        var errorBox = el("div", "clipfly-short-error", "This video couldn't be played.");

        // Bottom-left: username + title
        var info = el("div", "clipfly-short-info");

        var user = el("div", "clipfly-short-user");

        user.appendChild(
            document.createTextNode("@" + (video.username || "User"))
        );

        if (typeof addVerifiedBadge === "function") {
            addVerifiedBadge(user, !!(profile && profile.verified));
        }

        user.addEventListener("click", function (event) {
            event.stopPropagation();

            if (typeof openUserChannel === "function") {
                openUserChannel(
                    video.username || "User",
                    null,
                    video.owner_id || null
                );
            }
        });

        var title = el("div", "clipfly-short-title", video.title || "Untitled Short");

        info.appendChild(user);
        info.appendChild(title);

        // Right side: like, dislike, comments
        var rail = el("div", "clipfly-short-rail");

        var like = makeAction("👍", "Like", function () {
            react(item, "like");
        });

        var dislike = makeAction("👎", "Dislike", function () {
            react(item, "dislike");
        });

        var comment = makeAction("💬", "Comments", function () {
            toggleComments(item);
        });

        item.likeButton = like.button;
        item.likeCount = like.count;
        item.dislikeButton = dislike.button;
        item.dislikeCount = dislike.count;
        item.commentCountEl = comment.count;

        rail.appendChild(like.button);
        rail.appendChild(dislike.button);
        rail.appendChild(comment.button);

        card.appendChild(videoEl);
        card.appendChild(playIcon);
        card.appendChild(errorBox);
        card.appendChild(info);
        card.appendChild(rail);
        card.appendChild(progress);

        item.el = card;
        item.videoEl = videoEl;

        updateItemUI(item);

        state.items.push(item);
        feed.appendChild(card);

        if (activeObserver) {
            activeObserver.observe(card);
        }

        if (nearObserver) {
            nearObserver.observe(card);
        }
    }

    /*
     * =========================================
     * PLAYING (only the short on screen plays)
     * =========================================
     */

    function ensureSrc(item) {
        if (!item || item.loaded) {
            return;
        }

        item.videoEl.preload = "metadata";
        item.videoEl.src = item.video.video_url;
        item.loaded = true;
        item.el.classList.remove("failed");
    }

    function unloadSrc(item) {
        if (!item || !item.loaded) {
            return;
        }

        try {
            item.videoEl.pause();
            item.videoEl.removeAttribute("src");
            item.videoEl.load();
        } catch (error) {
            console.warn(error);
        }

        item.loaded = false;
    }

    function playItem(item) {
        if (!item || !visible || suspended) {
            return;
        }

        var video = item.videoEl;

        ensureSrc(item);

        video.preload = "auto";
        video.muted = shortsMuted;

        var promise = video.play();

        if (promise && promise.catch) {
            promise.catch(function (error) {
                // Browsers sometimes block sound until you interact.
                if (error && error.name === "NotAllowedError" && !video.muted) {
                    shortsMuted = true;
                    applyMute();
                    video.play().catch(function () {});
                }
            });
        }
    }

    function setActive(index) {
        if (index === state.active) {
            return;
        }

        var previous = state.items[state.active];

        if (previous) {
            previous.videoEl.pause();

            try {
                previous.videoEl.currentTime = 0;
            } catch (error) {
                console.warn(error);
            }
        }

        state.active = index;

        var item = state.items[index];

        if (!item) {
            return;
        }

        item.userPaused = false;
        item.el.classList.remove("paused");

        ensureSrc(state.items[index + 1]);
        ensureSrc(state.items[index - 1]);

        playItem(item);

        if (commentsOpen) {
            loadComments(item);
        }

        if (index >= state.items.length - 3) {
            loadMore(false);
        }
    }

    function setupObservers() {
        activeObserver = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                        setActive(Number(entry.target.dataset.index));
                    }
                });
            },
            { root: feed, threshold: [0.6] }
        );

        nearObserver = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    var item = state.items[Number(entry.target.dataset.index)];

                    if (!item) {
                        return;
                    }

                    if (entry.isIntersecting) {
                        ensureSrc(item);
                    } else if (state.active !== item.index) {
                        unloadSrc(item);
                    }
                });
            },
            { root: feed, rootMargin: "100% 0px 100% 0px", threshold: 0 }
        );
    }

    function goTo(index) {
        if (!feed || state.items.length === 0) {
            return;
        }

        index = Math.max(0, Math.min(state.items.length - 1, index));

        feed.scrollTo({
            top: index * feed.clientHeight,
            behavior: "smooth"
        });
    }

    /*
     * =========================================
     * SOUND
     * =========================================
     */

    function updateMuteButton() {
        var button = byId("clipflyShortsMute");

        if (button) {
            button.textContent = shortsMuted ? "🔇" : "🔊";
        }
    }

    function applyMute() {
        state.items.forEach(function (item) {
            item.videoEl.muted = shortsMuted;
        });

        updateMuteButton();
    }

    function toggleMute() {
        shortsMuted = !shortsMuted;

        applyMute();

        var item = state.items[state.active];

        if (item && !shortsMuted && item.videoEl.paused && !item.userPaused) {
            playItem(item);
        }
    }

    /*
     * =========================================
     * LIKE / DISLIKE
     * =========================================
     */

    async function react(item, kind) {
        var user = await getUser();

        if (!user) {
            say(
                "Log in required",
                "You need to be logged in to like or dislike videos.",
                "🔒"
            );

            return;
        }

        if (item.busy) {
            return;
        }

        item.busy = true;

        var before = {
            likes: item.likes,
            dislikes: item.dislikes,
            mine: item.mine
        };

        var next = item.mine === kind ? null : kind;

        if (item.mine === "like") {
            item.likes = Math.max(0, item.likes - 1);
        }

        if (item.mine === "dislike") {
            item.dislikes = Math.max(0, item.dislikes - 1);
        }

        if (next === "like") {
            item.likes++;
        }

        if (next === "dislike") {
            item.dislikes++;
        }

        item.mine = next;

        updateItemUI(item);
        syncCopies(item);

        try {
            var existing = await window.supabaseClient
                .from("video_reactions")
                .select("id, reaction")
                .eq("video_id", item.video.id)
                .eq("user_id", user.id)
                .maybeSingle();

            if (existing.error) {
                throw existing.error;
            }

            var row = existing.data;
            var write;

            if (next === null) {
                if (row) {
                    write = await window.supabaseClient
                        .from("video_reactions")
                        .delete()
                        .eq("id", row.id)
                        .eq("user_id", user.id);

                    if (write.error) {
                        throw write.error;
                    }
                }

            } else if (row) {
                write = await window.supabaseClient
                    .from("video_reactions")
                    .update({ reaction: next })
                    .eq("id", row.id)
                    .eq("user_id", user.id);

                if (write.error) {
                    throw write.error;
                }

            } else {
                write = await window.supabaseClient
                    .from("video_reactions")
                    .insert({
                        video_id: item.video.id,
                        user_id: user.id,
                        reaction: next
                    });

                if (write.error) {
                    throw write.error;
                }
            }

        } catch (error) {
            console.error("Reaction failed:", error);

            item.likes = before.likes;
            item.dislikes = before.dislikes;
            item.mine = before.mine;

            updateItemUI(item);
            syncCopies(item);

            say(
                "Reaction failed",
                error.message || "Could not save your reaction.",
                "❌"
            );

        } finally {
            item.busy = false;
        }
    }

    /*
     * =========================================
     * SHORTS COMMENT PANEL
     * =========================================
     */

    function buildCommentsPanel() {
        var box = el("div");

        box.id = "clipflyShortsComments";

        var head = el("div", "clipfly-shorts-comments-head");

        var title = el("span", "", "Comments");

        title.id = "clipflyShortsCommentsTitle";

        var close = el("button", "", "✕");

        close.type = "button";
        close.addEventListener("click", closeComments);

        head.appendChild(title);
        head.appendChild(close);

        var list = el("div");

        list.id = "clipflyShortsCommentList";

        var form = el("div");

        form.id = "clipflyShortsCommentForm";

        var input = document.createElement("input");

        input.id = "clipflyShortsCommentInput";
        input.type = "text";
        input.maxLength = 1000;
        input.placeholder = "Add a comment...";
        input.autocomplete = "off";

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                postComment();
            }
        });

        var post = el("button", "blue-button", "Post");

        post.id = "clipflyShortsCommentPost";
        post.type = "button";
        post.addEventListener("click", postComment);

        form.appendChild(input);
        form.appendChild(post);

        box.appendChild(head);
        box.appendChild(list);
        box.appendChild(form);

        return box;
    }

    function toggleComments(item) {
        if (commentsOpen && state.items[state.active] === item) {
            closeComments();
            return;
        }

        commentsOpen = true;

        if (panel) {
            panel.classList.add("open");
        }

        loadComments(item);
    }

    function closeComments() {
        commentsOpen = false;

        if (panel) {
            panel.classList.remove("open");
        }
    }

    async function loadComments(item) {
        var list = byId("clipflyShortsCommentList");
        var title = byId("clipflyShortsCommentsTitle");

        if (!list) {
            return;
        }

        await renderComments(list, item.video.id, {
            onCount: function (count) {
                item.comments = count;

                updateItemUI(item);
                syncCopies(item);

                if (title) {
                    title.textContent = "Comments (" + count + ")";
                }
            }
        });
    }

    async function postComment() {
        var item = state.items[state.active];

        if (!item) {
            return;
        }

        var user = await getUser();

        if (!user) {
            say(
                "Log in required",
                "You need to be logged in to comment on videos.",
                "🔒"
            );

            return;
        }

        var input = byId("clipflyShortsCommentInput");
        var button = byId("clipflyShortsCommentPost");

        if (!input) {
            return;
        }

        var text = input.value.trim();

        if (!text) {
            return;
        }

        var meta = user.user_metadata || {};

        if (button) {
            button.disabled = true;
            button.textContent = "Posting...";
        }

        try {
            var result = await window.supabaseClient
                .from("video_comments")
                .insert({
                    video_id: item.video.id,
                    user_id: user.id,
                    username: meta.username || "User",
                    avatar_url: meta.avatar_url || null,
                    comment: text
                });

            if (result.error) {
                throw result.error;
            }

            input.value = "";

            await loadComments(item);

        } catch (error) {
            console.error("Comment failed:", error);

            say(
                "Comment failed",
                error.message || "Could not post your comment.",
                "❌"
            );

        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "Post";
            }
        }
    }

    /*
     * =========================================
     * PAUSE / RESUME (other windows, other tabs)
     * =========================================
     */

    function pauseShorts() {
        suspended = true;

        var item = state.items[state.active];

        if (item) {
            item.videoEl.pause();
        }
    }

    function resumeShorts() {
        suspended = false;

        if (!visible || anotherPopupOpen()) {
            return;
        }

        var item = state.items[state.active];

        if (item && !item.userPaused) {
            playItem(item);
        }
    }

    function wrapGlobal(name, before, after) {
        var original = window[name];

        if (typeof original !== "function") {
            return;
        }

        window[name] = function () {
            try {
                if (before) {
                    before.apply(this, arguments);
                }
            } catch (error) {
                console.warn(error);
            }

            var result = original.apply(this, arguments);

            try {
                if (after) {
                    after();
                }
            } catch (error) {
                console.warn(error);
            }

            return result;
        };
    }

    /*
     * =========================================
     * KEYBOARD
     * =========================================
     */

    function onKeyDown(event) {
        if (!visible) {
            return;
        }

        if (event.key === "Escape" && commentsOpen) {
            closeComments();
            return;
        }

        var tag =
            (document.activeElement && document.activeElement.tagName) || "";

        if (tag === "INPUT" || tag === "TEXTAREA") {
            return;
        }

        if (anotherPopupOpen()) {
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            goTo(state.active + 1);

        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            goTo(state.active - 1);

        } else if (event.key === "m" || event.key === "M") {
            toggleMute();
        }
    }

    /*
     * =========================================
     * ACCOUNT SWITCHING: refresh like highlights
     * =========================================
     */

    function watchLogin() {
        if (!window.supabaseClient || !window.supabaseClient.auth) {
            return;
        }

        var lastId;

        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            var id = session && session.user ? session.user.id : null;
            var changed = lastId !== undefined && id !== lastId;

            lastId = id;

            if (!changed || !visible || state.items.length === 0) {
                return;
            }

            setTimeout(async function () {
                var items = state.items.slice();

                var uniqueIds = Array.from(
                    new Set(
                        items.map(function (item) {
                            return item.video.id;
                        })
                    )
                );

                var stats = await fetchStats(uniqueIds, id);

                items.forEach(function (item) {
                    var stat = stats[item.video.id];

                    if (!stat) {
                        return;
                    }

                    item.likes = stat.likes;
                    item.dislikes = stat.dislikes;
                    item.comments = stat.comments;
                    item.mine = stat.mine;

                    updateItemUI(item);
                });
            }, 0);
        });
    }

    /*
     * =========================================
     * START
     * =========================================
     */

    function init() {
        // The sidebar "Shorts" button calls this.
        window.loadShortVideos = showShorts;

        // The normal video watch window uses the same comments with replies.
        window.loadComments = function (videoId) {
            var list = byId("clipflyCommentsList");

            if (!list || !videoId) {
                return Promise.resolve();
            }

            return renderComments(list, videoId, {
                onCount: function (count) {
                    var title = byId("clipflyCommentsTitle");

                    if (title) {
                        title.textContent = "Comments (" + count + ")";
                    }
                }
            });
        };

        wrapGlobal(
            "openClipflySection",
            function (section) {
                if (section !== "shorts") {
                    hideShorts();
                }
            },
            null
        );

        wrapGlobal("searchVideos", hideShorts, null);
        wrapGlobal("watchVideo", pauseShorts, null);
        wrapGlobal("closeWatch", null, resumeShorts);
        wrapGlobal("openUserChannel", pauseShorts, null);
        wrapGlobal("closeUserChannel", null, resumeShorts);

        document.addEventListener("keydown", onKeyDown);

        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                pauseShorts();
            } else {
                resumeShorts();
            }
        });

        watchLogin();
    }

    init();

})();
