(function () {
    "use strict";

    /*
     * Clipfly Shorts: a vertical, one-at-a-time scrolling feed.
     * A "Short" is any video with #shorts (or #short) in its title.
     * Uses the existing video_reactions and video_comments tables.
     */

    var PAGE_SIZE = 10;

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
    var commentsToken = 0;
    var wheelLocked = false;
    var wheelTimer = null;

    function newState() {
        return {
            items: [],
            offset: 0,
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
     * STYLES
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

            .clipfly-shorts-empty {
                padding: 24px 0;
                text-align: center;
                color: #9ca8ba;
            }

            .clipfly-shorts-comment {
                display: flex;
                gap: 10px;
                padding: 10px 0;
            }

            .clipfly-shorts-comment-avatar {
                width: 36px;
                height: 36px;
                min-width: 36px;
                border-radius: 50%;
                background: #292930;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                cursor: pointer;
            }

            .clipfly-shorts-comment-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .clipfly-shorts-comment-body {
                flex: 1;
                min-width: 0;
            }

            .clipfly-shorts-comment-top {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 3px;
            }

            .clipfly-shorts-comment-name {
                display: inline-flex;
                align-items: center;
                font-weight: 700;
                font-size: 14px;
            }

            .clipfly-shorts-comment-date {
                font-size: 12px;
                color: #9ca8ba;
            }

            .clipfly-shorts-comment-delete {
                margin-left: auto;
                border: none;
                background: transparent;
                color: #9ca8ba;
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 6px;
            }

            .clipfly-shorts-comment-delete:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
            }

            .clipfly-shorts-comment-text {
                font-size: 14px;
                line-height: 1.4;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
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
     * LOADING SHORTS
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

    async function loadMore(first) {
        var s = state;

        if (s.loading || s.done) {
            return;
        }

        s.loading = true;

        try {
            var result = await window.supabaseClient
                .from("videos")
                .select("*")
                .ilike("title", "%#short%")
                .order("id", { ascending: false })
                .range(s.offset, s.offset + PAGE_SIZE - 1);

            if (result.error) {
                throw result.error;
            }

            var rows = result.data || [];

            if (s !== state) {
                return;
            }

            s.offset += rows.length;

            if (rows.length < PAGE_SIZE) {
                s.done = true;
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

        try {
            var table = window.supabaseClient.from("video_reactions");

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
     * COMMENTS
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
        commentsToken++;

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

        var token = ++commentsToken;

        list.innerHTML = "";
        list.appendChild(
            el("div", "clipfly-shorts-empty", "Loading comments...")
        );

        try {
            var result = await window.supabaseClient
                .from("video_comments")
                .select(
                    "id, video_id, user_id, username, avatar_url, comment, created_at"
                )
                .eq("video_id", item.video.id)
                .order("created_at", { ascending: false });

            if (result.error) {
                throw result.error;
            }

            var comments = result.data || [];
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

            if (token !== commentsToken) {
                return;
            }

            item.comments = comments.length;

            updateItemUI(item);

            if (title) {
                title.textContent = "Comments (" + comments.length + ")";
            }

            list.innerHTML = "";

            if (comments.length === 0) {
                list.appendChild(
                    el(
                        "div",
                        "clipfly-shorts-empty",
                        "No comments yet. Be the first! 💬"
                    )
                );

                return;
            }

            var me = window.currentUser;

            comments.forEach(function (comment) {
                var row = el("div", "clipfly-shorts-comment");

                var avatar = el("div", "clipfly-shorts-comment-avatar");

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

                avatar.addEventListener("click", function () {
                    if (typeof openUserChannel === "function") {
                        openUserChannel(
                            comment.username || "User",
                            comment.avatar_url || null,
                            comment.user_id || null
                        );
                    }
                });

                var body = el("div", "clipfly-shorts-comment-body");
                var top = el("div", "clipfly-shorts-comment-top");

                var name = el("span", "clipfly-shorts-comment-name");

                name.appendChild(
                    document.createTextNode("@" + (comment.username || "User"))
                );

                var profile = profiles[comment.user_id];

                if (typeof addVerifiedBadge === "function") {
                    addVerifiedBadge(name, !!(profile && profile.verified));
                }

                var date = el(
                    "span",
                    "clipfly-shorts-comment-date",
                    new Date(comment.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                    })
                );

                top.appendChild(name);
                top.appendChild(date);

                if (me && comment.user_id === me.id) {
                    var remove = el("button", "clipfly-shorts-comment-delete", "🗑️");

                    remove.type = "button";
                    remove.title = "Delete comment";

                    remove.addEventListener("click", function () {
                        deleteComment(item, comment.id);
                    });

                    top.appendChild(remove);
                }

                var text = el(
                    "div",
                    "clipfly-shorts-comment-text",
                    comment.comment
                );

                body.appendChild(top);
                body.appendChild(text);

                row.appendChild(avatar);
                row.appendChild(body);

                list.appendChild(row);
            });

        } catch (error) {
            console.error("Could not load comments:", error);

            if (token === commentsToken) {
                list.innerHTML = "";

                list.appendChild(
                    el(
                        "div",
                        "clipfly-shorts-empty",
                        "Could not load comments."
                    )
                );
            }
        }
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

    async function deleteComment(item, commentId) {
        var user = await getUser();

        if (!user || !commentId) {
            return;
        }

        if (!window.confirm("Delete your comment?")) {
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("video_comments")
                .delete()
                .eq("id", commentId)
                .eq("user_id", user.id);

            if (result.error) {
                throw result.error;
            }

            await loadComments(item);

        } catch (error) {
            console.error("Delete comment failed:", error);

            say(
                "Delete failed",
                error.message || "Could not delete your comment.",
                "❌"
            );
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

                var stats = await fetchStats(
                    items.map(function (item) {
                        return item.video.id;
                    }),
                    id
                );

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