(function () {
    "use strict";

    /*
     * Sharing and invite links:
     *  - ?v=VIDEO_ID opens a video, ?u=USER_ID opens a channel
     *  - Share buttons in the watch window, on Shorts and on channels
     *  - An "Invite Friends" button in the profile popup
     *  - Small pop-up messages ("toasts") used by other features
     */

    var params = new URLSearchParams(location.search);
    var wantVideo = params.get("v");
    var wantUser = params.get("u");

    // Lets the welcome screen stay out of the way of shared links.
    window.__clipflyDeepLink = !!(wantVideo || wantUser);

    var siteBasePromise = null;
    var warnedLocal = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    /*
     * =========================================
     * TOASTS (small pop-up messages)
     * =========================================
     */

    function ensureToastStyles() {
        if (byId("clipflyToastStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyToastStyles";

        style.textContent = `
            #clipflyToasts {
                position: fixed;
                right: 20px;
                bottom: 20px;
                z-index: 99998;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                pointer-events: none;
            }

            .cft-toast {
                pointer-events: auto;
                max-width: 340px;
                margin-top: 8px;
                padding: 12px 14px;
                border-radius: 10px;
                background: #18181f;
                color: #ffffff;
                border: 1px solid #35353d;
                border-left: 4px solid #3478ff;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
                font-size: 14px;
                line-height: 1.4;
                opacity: 1;
                transform: translateY(0);
                transition: opacity 0.3s ease, transform 0.3s ease;
            }

            .cft-toast.hide {
                opacity: 0;
                transform: translateY(8px);
            }
        `;

        document.head.appendChild(style);
    }

    function toast(text, options) {
        options = options || {};

        ensureToastStyles();

        var box = byId("clipflyToasts");

        if (!box) {
            box = document.createElement("div");
            box.id = "clipflyToasts";
            document.body.appendChild(box);
        }

        var item = document.createElement("div");

        item.className = "cft-toast";
        item.textContent = text;

        if (options.onClick) {
            item.style.cursor = "pointer";

            item.addEventListener("click", function () {
                options.onClick();
                item.remove();
            });
        }

        box.appendChild(item);

        setTimeout(function () {
            item.classList.add("hide");

            setTimeout(function () {
                item.remove();
            }, 300);
        }, options.ms || 4000);
    }

    window.clipflyToast = toast;

    /*
     * =========================================
     * LINKS
     * =========================================
     */

    function pageBase() {
        return location.href.split("#")[0].split("?")[0];
    }

    // The address people should use (set once in Supabase), or this page.
    function getSiteBase() {
        if (!siteBasePromise) {
            siteBasePromise = (async function () {
                try {
                    if (window.supabaseClient) {
                        var result = await window.supabaseClient
                            .from("app_settings")
                            .select("value")
                            .eq("key", "site_url")
                            .maybeSingle();

                        if (
                            !result.error &&
                            result.data &&
                            typeof result.data.value === "string" &&
                            /^https?:\/\//i.test(result.data.value)
                        ) {
                            return {
                                base: result.data.value.replace(/\/+$/, "") + "/",
                                custom: true
                            };
                        }
                    }
                } catch (error) {
                    console.warn("Could not read the site address:", error);
                }

                return { base: pageBase(), custom: false };
            })();
        }

        return siteBasePromise;
    }

    function looksLocal() {
        var host = location.hostname;

        return (
            location.protocol === "file:" ||
            host === "localhost" ||
            host === "127.0.0.1" ||
            /^192\.168\./.test(host) ||
            /^10\./.test(host)
        );
    }

    async function makeLink(query) {
        var site = await getSiteBase();

        if (!site.custom && looksLocal() && !warnedLocal) {
            warnedLocal = true;

            toast(
                "⚠️ This link only opens on your own computer. Put Clipfly online so friends can open it.",
                { ms: 9000 }
            );
        }

        var pairs = Object.keys(query || {}).map(function (key) {
            return encodeURIComponent(key) + "=" + encodeURIComponent(query[key]);
        });

        if (pairs.length === 0) {
            return site.base;
        }

        return site.base + (site.base.indexOf("?") === -1 ? "?" : "&") + pairs.join("&");
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.warn(error);
        }

        try {
            var area = document.createElement("textarea");

            area.value = text;
            area.style.position = "fixed";
            area.style.opacity = "0";

            document.body.appendChild(area);

            area.select();

            var ok = document.execCommand("copy");

            area.remove();

            return ok;

        } catch (error) {
            return false;
        }
    }

    async function shareLink(url, title, text) {
        var isPhone =
            (navigator.maxTouchPoints || 0) > 0 &&
            /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        if (isPhone && navigator.share) {
            try {
                await navigator.share({ title: title, text: text, url: url });
                return;
            } catch (error) {
                if (error && error.name === "AbortError") {
                    return;
                }
            }
        }

        var copied = await copyText(url);

        toast(
            copied
                ? "🔗 Link copied! Paste it anywhere to share."
                : "Copy this link: " + url,
            { ms: copied ? 3500 : 12000 }
        );
    }

    async function shareVideo(video) {
        if (!video || !video.id) {
            toast("Open a video first.");
            return;
        }

        var url = await makeLink({ v: video.id });

        await shareLink(
            url,
            video.title || "Clipfly video",
            'Watch "' + (video.title || "this video") + '" on Clipfly'
        );
    }

    async function shareChannel(userId, name) {
        if (!userId) {
            return;
        }

        var url = await makeLink({ u: userId });

        await shareLink(
            url,
            "@" + (name || "User") + " on Clipfly",
            "Check out @" + (name || "this channel") + " on Clipfly"
        );
    }

    async function invite() {
        var url = await makeLink({});

        await shareLink(
            url,
            "Clipfly",
            "Join me on Clipfly: watch, upload and go live!"
        );
    }

    /*
     * =========================================
     * OPEN A VIDEO / CHANNEL FROM AN ID
     * =========================================
     */

    async function openVideoById(id) {
        if (!id || !window.supabaseClient) {
            return false;
        }

        try {
            var result = await window.supabaseClient
                .from("videos")
                .select("*")
                .eq("id", id)
                .maybeSingle();

            if (result.error) {
                throw result.error;
            }

            if (!result.data) {
                toast("That video isn't available anymore.");
                return false;
            }

            if (typeof watchVideo === "function") {
                watchVideo(result.data);
                return true;
            }

        } catch (error) {
            console.warn("Could not open the video:", error);

            toast("Couldn't open that video.");
        }

        return false;
    }

    async function openChannelById(userId) {
        if (!userId) {
            return;
        }

        var name = "User";
        var avatar = null;

        try {
            var result = await window.supabaseClient.rpc("get_channel_profiles", {
                p_ids: [userId]
            });

            var row = result && result.data && result.data[0];

            if (row) {
                name = row.username || name;
                avatar = row.avatar_url || null;
            }

        } catch (error) {
            console.warn(error);
        }

        if (typeof openUserChannel === "function") {
            openUserChannel(name, avatar, userId);
        }
    }

    window.clipflyOpenVideoById = openVideoById;
    window.clipflyOpenChannelById = openChannelById;

    // Runs when someone arrives through a shared link.
    async function handleDeepLink() {
        if (!wantVideo && !wantUser) {
            return;
        }

        var waited = 0;

        while (
            (typeof watchVideo !== "function" || !window.supabaseClient) &&
            waited < 8000
        ) {
            await sleep(200);
            waited += 200;
        }

        try {
            await window.supabaseClient.auth.getSession();
        } catch (error) {
            console.warn(error);
        }

        // Let Clipfly finish starting up first.
        await sleep(600);

        if (wantVideo) {
            await openVideoById(wantVideo);
        } else if (wantUser) {
            await openChannelById(wantUser);
        }

        try {
            history.replaceState(null, "", location.pathname);
        } catch (error) {
            console.warn(error);
        }
    }

    /*
     * =========================================
     * SHARE BUTTON: WATCH WINDOW
     * =========================================
     */

    function addWatchShareButton() {
        var row = byId("clipflyReactionRow");

        if (!row || byId("clipflyShareVideoButton")) {
            return;
        }

        var button = document.createElement("button");

        button.id = "clipflyShareVideoButton";
        button.className = "clipfly-reaction-button";
        button.type = "button";
        button.textContent = "🔗 Share";

        button.addEventListener("click", function (event) {
            event.stopPropagation();

            shareVideo(
                typeof currentWatchingVideo !== "undefined"
                    ? currentWatchingVideo
                    : null
            );
        });

        row.appendChild(button);
    }

    var originalWatchFeatures = window.createWatchFeatures;

    if (typeof originalWatchFeatures === "function") {
        window.createWatchFeatures = function () {
            var result = originalWatchFeatures.apply(this, arguments);

            try {
                addWatchShareButton();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };
    }

    /*
     * =========================================
     * SHARE BUTTON: SHORTS
     * =========================================
     */

    async function shareShortFromRail(rail) {
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
                .select("id, title")
                .eq("video_url", src)
                .limit(1);

            if (result.error) {
                throw result.error;
            }

            var row = result.data && result.data[0];

            if (!row) {
                toast("Couldn't find this short to share.");
                return;
            }

            await shareVideo(row);

        } catch (error) {
            console.warn("Could not share the short:", error);

            toast("Couldn't make a link for this short.");
        }
    }

    function addShortShare(rail) {
        if (rail.querySelector(".clipfly-share-action")) {
            return;
        }

        var button = document.createElement("button");

        button.className = "clipfly-short-action clipfly-share-action";
        button.type = "button";
        button.title = "Share";

        var icon = document.createElement("span");

        icon.className = "icon";
        icon.textContent = "🔗";

        var label = document.createElement("span");

        label.className = "count";
        label.textContent = "Share";

        button.appendChild(icon);
        button.appendChild(label);

        button.addEventListener("click", function (event) {
            event.stopPropagation();
            shareShortFromRail(rail);
        });

        rail.appendChild(button);
    }

    // The Shorts feed is built on demand, so keep an eye out for it.
    function watchShortsFeed() {
        var feed = byId("clipflyShortsFeed");

        if (!feed || feed.__shareWatched) {
            return;
        }

        feed.__shareWatched = true;

        function addAll() {
            feed.querySelectorAll(".clipfly-short-rail").forEach(addShortShare);
        }

        new MutationObserver(addAll).observe(feed, {
            childList: true,
            subtree: true
        });

        addAll();
    }

    /*
     * =========================================
     * SHARE BUTTON: CHANNEL WINDOW
     * =========================================
     */

    function addChannelShare() {
        var stats = byId("clipflyChannelStats");

        if (!stats || byId("clipflyShareChannelButton")) {
            return;
        }

        var info =
            typeof currentChannelUser !== "undefined" ? currentChannelUser : null;

        if (!info || !info.user_id) {
            return;
        }

        var button = document.createElement("button");

        button.id = "clipflyShareChannelButton";
        button.type = "button";
        button.className = "clipfly-subscribe-button";
        button.style.marginLeft = "0";
        button.textContent = "🔗 Share";

        button.addEventListener("click", function (event) {
            event.stopPropagation();

            shareChannel(info.user_id, info.username);
        });

        stats.appendChild(button);
    }

    var originalOpenChannel = window.openUserChannel;

    if (typeof originalOpenChannel === "function") {
        window.openUserChannel = function () {
            var result = originalOpenChannel.apply(this, arguments);

            try {
                addChannelShare();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };
    }

    /*
     * =========================================
     * INVITE BUTTON (profile popup)
     * =========================================
     */

    function addInviteButton() {
        var profile = byId("profileScreen");

        if (!profile || byId("clipflyInviteButton")) {
            return;
        }

        var button = document.createElement("button");

        button.id = "clipflyInviteButton";
        button.type = "button";
        button.className = "dark-button";
        button.textContent = "📣 Invite Friends";

        button.addEventListener("click", invite);

        var anchor =
            byId("clipflyChangeLanguageButton") ||
            byId("clipflySwitchBadgeButton") ||
            byId("clipflySwitchAccountButton");

        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(button, anchor.nextSibling);

        } else {
            var logout = profile.querySelector('button[onclick="logOut()"]');

            if (logout && logout.parentNode) {
                logout.parentNode.insertBefore(button, logout);
            } else {
                profile.appendChild(button);
            }
        }
    }

    /*
     * =========================================
     * START
     * =========================================
     */

    function init() {
        addInviteButton();

        setInterval(watchShortsFeed, 1500);

        if (document.readyState === "complete") {
            handleDeepLink();
        } else {
            window.addEventListener("load", handleDeepLink);
        }
    }

    window.clipflyShareVideo = shareVideo;
    window.clipflyInvite = invite;

    init();

})();