(function () {
    "use strict";

    /*
     * Profiles, channels, badges and verification applications:
     *  - shows profile pictures for everyone (not just verified accounts)
     *  - shows a subscriber count
     *  - adds Subscribe / Unsubscribe to a channel's profile window
     *  - badges: bronze (Verified), silver (Verified+), gold (Verified++)
     *    and the special paintbrush
     *  - Apply button for everyone, Applies review panel for @Clipfly
     *
     * Needs the SQL functions/tables in Supabase.
     */

    var channelRequest = 0;
    var subsRequest = 0;

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

    function say(title, text, icon) {
        if (typeof showMessage === "function") {
            showMessage(title, text, icon);
        } else {
            alert(title + "\n\n" + text);
        }
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }

        return new Date(value).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    }

    function formatCount(value) {
        var n = Number(value) || 0;
        var text;

        if (n >= 1000000) {
            text = (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
        } else if (n >= 1000) {
            text = (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K";
        } else {
            text = String(n);
        }

        return text + (n === 1 ? " subscriber" : " subscribers");
    }

    /*
     * =========================================
     * PROFILE BADGES
     * =========================================
     */

    var CHECK_PATH = "M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z";

    var BRUSH_PATH =
        "M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z";

    var BADGE_NAMES = {
        bronze: "Verified",
        silver: "Verified+",
        gold: "Verified++",
        paintbrush: "Clipfly paintbrush"
    };

    var lastProfile = null;
    var clearQueued = false;

    // Remember which profile was just checked, so the badge function can
    // tell which person it is drawing a badge for.
    function rememberProfile(profile) {
        lastProfile = profile;

        if (!clearQueued) {
            clearQueued = true;

            Promise.resolve().then(function () {
                lastProfile = null;
                clearQueued = false;
            });
        }
    }

    function trackProfile(profile) {
        if (!profile || profile.__clipflyTracked) {
            return profile;
        }

        var realVerified = !!profile.verified;
        var hasBadge = !!profile.badge;

        Object.defineProperty(profile, "verified", {
            configurable: true,
            enumerable: true,
            get: function () {
                rememberProfile(profile);

                return realVerified || hasBadge;
            }
        });

        Object.defineProperty(profile, "__clipflyTracked", { value: true });

        return profile;
    }

    function ensureBadgeStyles() {
        if (byId("clipflyBadgeStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyBadgeStyles";

        style.textContent = `
            .clipfly-verified-badge svg {
                width: 12px;
                height: 12px;
                display: block;
                fill: currentColor;
            }

            .clipfly-verified-badge.clipfly-badge-bronze {
                background: linear-gradient(135deg, #e7a56b, #b0662a);
                color: #ffffff;
            }

            .clipfly-verified-badge.clipfly-badge-silver {
                background: linear-gradient(135deg, #f1f4f9, #a7b0bf);
                color: #3b4352;
            }

            .clipfly-verified-badge.clipfly-badge-gold {
                background: linear-gradient(135deg, #ffe680, #e0a100);
                color: #5c3d00;
            }

            .clipfly-verified-badge.clipfly-badge-paintbrush {
                background: linear-gradient(135deg, #a855f7, #ec4899);
                color: #ffffff;
            }

            .clipfly-badge-paintbrush svg {
                width: 11px;
                height: 11px;
            }
        `;

        document.head.appendChild(style);
    }

    // type: "silver", "gold", "paintbrush", or anything else = bronze
    function createBadgeElement(type) {
        ensureBadgeStyles();

        var tier =
            type === "paintbrush" || type === "silver" || type === "gold"
                ? type
                : "bronze";

        var badge = document.createElement("span");

        badge.className = "clipfly-verified-badge clipfly-badge-" + tier;
        badge.title = BADGE_NAMES[tier];
        badge.setAttribute("aria-label", BADGE_NAMES[tier]);
        badge.setAttribute("data-clipfly-verified-badge", "true");

        badge.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
            (tier === "paintbrush" ? BRUSH_PATH : CHECK_PATH) +
            '"/></svg>';

        return badge;
    }

    // Replaces addVerifiedBadge from script.js so it can draw every badge.
    window.addVerifiedBadge = function (parent, verified, badge) {
        var profile = lastProfile;

        lastProfile = null;

        if (!parent || !verified) {
            return;
        }

        var type =
            badge !== undefined
                ? badge
                : (profile && profile.badge) || null;

        parent.appendChild(createBadgeElement(type));
    };

    // Replace the profile loaders so they also read the badge column.
    var originalGetProfileById = window.getProfileById;
    var originalGetProfilesByIds = window.getProfilesByIds;

    async function selectProfilesWithBadge(ids) {
        var result = await window.supabaseClient
            .from("profiles")
            .select("id, username, avatar_url, verified, badge")
            .in("id", ids);

        if (result.error) {
            throw result.error;
        }

        return result.data || [];
    }

    window.getProfilesByIds = async function (userIds) {
        var ids = Array.from(new Set((userIds || []).filter(Boolean)));
        var map = {};

        if (ids.length === 0 || !window.supabaseClient) {
            return map;
        }

        try {
            var rows = await selectProfilesWithBadge(ids);

            rows.forEach(function (profile) {
                map[profile.id] = trackProfile(profile);
            });

            return map;

        } catch (error) {
            console.warn("Badge lookup failed (did you run the SQL?):", error);

            if (typeof originalGetProfilesByIds === "function") {
                return originalGetProfilesByIds(userIds);
            }

            return map;
        }
    };

    window.getProfileById = async function (userId) {
        if (!userId || !window.supabaseClient) {
            return null;
        }

        try {
            var rows = await selectProfilesWithBadge([userId]);

            return rows.length > 0 ? trackProfile(rows[0]) : null;

        } catch (error) {
            console.warn("Badge lookup failed (did you run the SQL?):", error);

            if (typeof originalGetProfileById === "function") {
                return originalGetProfileById(userId);
            }

            return null;
        }
    };

    /*
     * =========================================
     * LOAD PROFILE INFO (picture, name, verified, subscribers)
     * =========================================
     */

    async function fetchChannelProfiles(ids) {
        var clean = Array.from(new Set((ids || []).filter(Boolean)));
        var map = {};

        if (clean.length === 0 || !window.supabaseClient) {
            return map;
        }

        try {
            var result = await window.supabaseClient.rpc(
                "get_channel_profiles",
                { p_ids: clean }
            );

            if (result.error) {
                throw result.error;
            }

            (result.data || []).forEach(function (row) {
                map[row.id] = row;
            });

        } catch (error) {
            console.warn(
                "Could not load channel info (did you run the SQL?):",
                error
            );
        }

        // Fallback if the SQL function isn't there yet.
        if (Object.keys(map).length === 0) {
            try {
                var fallback = await window.supabaseClient
                    .from("profiles")
                    .select("id, username, avatar_url, verified")
                    .in("id", clean);

                (fallback.data || []).forEach(function (profile) {
                    map[profile.id] = {
                        id: profile.id,
                        username: profile.username,
                        avatar_url: profile.avatar_url,
                        verified: profile.verified,
                        badge: null,
                        subscribers: null
                    };
                });

            } catch (error) {
                console.warn("Fallback profile load failed:", error);
            }
        }

        return map;
    }

    /*
     * =========================================
     * SUBSCRIPTIONS PAGE (replaces the one in script.js)
     * =========================================
     */

    function stillOnSubscriptions() {
        return (
            typeof currentClipflySection === "undefined" ||
            currentClipflySection === "subscriptions"
        );
    }

    window.loadSubscriptionVideos = async function () {
        var token = ++subsRequest;
        var me = window.currentUser;

        if (!me) {
            showSectionMessage(
                "Log in required",
                "Log in to see your subscriptions."
            );

            return;
        }

        try {
            var subResult = await window.supabaseClient
                .from("subscriptions")
                .select("channel_id")
                .eq("subscriber_id", me.id);

            if (subResult.error) {
                throw subResult.error;
            }

            var channelIds = (subResult.data || []).map(function (row) {
                return row.channel_id;
            });

            if (token !== subsRequest || !stillOnSubscriptions()) {
                return;
            }

            if (channelIds.length === 0) {
                showSectionMessage(
                    "No subscriptions yet",
                    "Subscribe to creators to see their channels here."
                );

                return;
            }

            var profileMap = await fetchChannelProfiles(channelIds);

            // If someone still has no profile info, use their video name.
            var missing = channelIds.filter(function (channelId) {
                return !profileMap[channelId];
            });

            if (missing.length > 0) {
                try {
                    var fallbackVideos = await window.supabaseClient
                        .from("videos")
                        .select("owner_id, username")
                        .in("owner_id", missing);

                    (fallbackVideos.data || []).forEach(function (video) {
                        if (video.owner_id && !profileMap[video.owner_id]) {
                            profileMap[video.owner_id] = {
                                id: video.owner_id,
                                username: video.username || "User",
                                avatar_url: null,
                                verified: false,
                                badge: null,
                                subscribers: null
                            };
                        }
                    });

                } catch (error) {
                    console.warn(error);
                }
            }

            if (token !== subsRequest || !stillOnSubscriptions()) {
                return;
            }

            var grid = byId("videoGrid");

            if (!grid) {
                return;
            }

            if (typeof ensureSubscriptionChannelStyles === "function") {
                ensureSubscriptionChannelStyles();
            }

            grid.innerHTML = "";

            var channelGrid = document.createElement("div");

            channelGrid.className = "clipfly-subscription-channel-grid";

            var found = 0;

            channelIds.forEach(function (channelId) {
                var profile = profileMap[channelId];

                if (!profile) {
                    return;
                }

                found++;

                var card = document.createElement("div");

                card.className = "clipfly-subscription-channel-card";

                var avatarWrap = document.createElement("div");

                avatarWrap.className = "clipfly-subscription-channel-avatar";

                if (profile.avatar_url) {
                    var avatar = document.createElement("img");

                    avatar.src = profile.avatar_url;
                    avatar.alt = "Profile picture";
                    avatar.loading = "lazy";

                    avatar.onerror = function () {
                        avatar.remove();
                        avatarWrap.textContent = "👤";
                    };

                    avatarWrap.appendChild(avatar);

                } else {
                    avatarWrap.textContent = "👤";
                }

                var info = document.createElement("div");

                info.className = "clipfly-subscription-channel-info";

                var name = document.createElement("div");

                name.className = "clipfly-subscription-channel-name";
                name.textContent = profile.username || "User";

                if (typeof addVerifiedBadge === "function") {
                    addVerifiedBadge(name, !!profile.verified, profile.badge || null);
                }

                var label = document.createElement("div");

                label.className = "clipfly-subscription-channel-label";

                label.textContent =
                    profile.subscribers !== null &&
                    profile.subscribers !== undefined
                        ? formatCount(profile.subscribers)
                        : "Subscribed channel";

                info.appendChild(name);
                info.appendChild(label);

                card.appendChild(avatarWrap);
                card.appendChild(info);

                card.addEventListener("click", function () {
                    openUserChannel(
                        profile.username || "User",
                        profile.avatar_url || null,
                        profile.id
                    );
                });

                channelGrid.appendChild(card);
            });

            if (found === 0) {
                showSectionMessage(
                    "No channels found",
                    "Your subscriptions exist, but their channel profiles could not be loaded yet."
                );

                return;
            }

            grid.appendChild(channelGrid);

        } catch (error) {
            console.error("Could not load subscriptions:", error);

            showSectionMessage(
                "Couldn't load Subscriptions",
                error.message || "Something went wrong."
            );
        }
    };

    /*
     * =========================================
     * CHANNEL WINDOW: subscriber count + Subscribe / Unsubscribe
     * =========================================
     */

    function applyChannelAvatar(url) {
        var avatar = byId("clipflyChannelAvatar");

        if (!avatar || avatar.querySelector("img")) {
            return;
        }

        var image = document.createElement("img");

        image.src = url;
        image.alt = "Profile picture";
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "cover";

        image.onerror = function () {
            image.remove();
            avatar.textContent = "👤";
        };

        avatar.innerHTML = "";
        avatar.appendChild(image);
    }

    async function refreshChannelStats(userId, request) {
        var map = await fetchChannelProfiles([userId]);
        var info = map[userId] || null;

        var me = window.currentUser;
        var subscribed = false;

        if (me && me.id !== userId) {
            try {
                var check = await window.supabaseClient
                    .from("subscriptions")
                    .select("id")
                    .eq("subscriber_id", me.id)
                    .eq("channel_id", userId)
                    .maybeSingle();

                subscribed = !!(check && check.data);

            } catch (error) {
                console.warn("Could not check subscription:", error);
            }
        }

        if (request !== channelRequest) {
            return info;
        }

        var count = byId("clipflyChannelSubCount");
        var button = byId("clipflyChannelSubButton");

        if (count) {
            count.textContent =
                info && info.subscribers !== null && info.subscribers !== undefined
                    ? "👥 " + formatCount(info.subscribers)
                    : "";
        }

        if (button) {
            if (me && me.id === userId) {
                button.style.display = "none";

            } else {
                button.style.display = "inline-block";
                button.textContent = subscribed ? "Unsubscribe" : "Subscribe";
                button.classList.toggle("subscribed", subscribed);
                button.disabled = false;
            }
        }

        return info;
    }

    async function onChannelSubscribeClick(userId, request) {
        var button = byId("clipflyChannelSubButton");

        if (button) {
            button.disabled = true;
        }

        try {
            await window.toggleSubscription(userId);
        } catch (error) {
            console.warn("Subscription change failed:", error);
        }

        await refreshChannelStats(userId, request);

        // If the Subscriptions page is behind this window, update it too.
        if (
            typeof currentClipflySection !== "undefined" &&
            currentClipflySection === "subscriptions"
        ) {
            try {
                await window.loadSubscriptionVideos();
            } catch (error) {
                console.warn(error);
            }
        }

        if (button) {
            button.disabled = false;
        }
    }

    function buildChannelStats(userId, request) {
        var handle = byId("clipflyChannelHandle");

        var old = byId("clipflyChannelStats");

        if (old) {
            old.remove();
        }

        if (!handle || !handle.parentNode || !userId) {
            return Promise.resolve(null);
        }

        if (typeof ensureNavigationStyles === "function") {
            ensureNavigationStyles();
        }

        var stats = document.createElement("div");

        stats.id = "clipflyChannelStats";
        stats.style.display = "flex";
        stats.style.alignItems = "center";
        stats.style.gap = "12px";
        stats.style.flexWrap = "wrap";
        stats.style.marginTop = "10px";

        var count = document.createElement("span");

        count.id = "clipflyChannelSubCount";
        count.style.opacity = "0.85";
        count.textContent = "👥 ...";

        var button = document.createElement("button");

        button.id = "clipflyChannelSubButton";
        button.type = "button";
        button.className = "clipfly-subscribe-button";
        button.style.marginLeft = "0";
        button.style.display = "none";

        button.addEventListener("click", function (event) {
            event.stopPropagation();
            onChannelSubscribeClick(userId, request);
        });

        stats.appendChild(count);
        stats.appendChild(button);

        handle.parentNode.appendChild(stats);

        return refreshChannelStats(userId, request);
    }

    var originalOpenChannel = window.openUserChannel;

    if (typeof originalOpenChannel === "function") {
        window.openUserChannel = async function (username, avatarURL, userId) {
            var request = ++channelRequest;

            // The window is created right away; the rest loads in the background.
            var opening = originalOpenChannel.apply(this, arguments);

            var statsPromise = buildChannelStats(userId, request);

            var result = await opening;
            var info = await statsPromise;

            if (info && request === channelRequest) {
                // Show the picture even if the account isn't verified.
                if (info.avatar_url) {
                    applyChannelAvatar(info.avatar_url);
                }

                var name = byId("clipflyChannelName");

                if (
                    info.verified &&
                    name &&
                    !name.querySelector(".clipfly-verified-badge") &&
                    typeof addVerifiedBadge === "function"
                ) {
                    addVerifiedBadge(name, true, info.badge || null);
                }
            }

            return result;
        };
    }

    /*
     * =========================================
     * VERIFICATION: ROLES
     * =========================================
     */

    var ROLES = [
        { key: "verified", label: "Verified", badge: "bronze", hint: "Bronze", level: 1 },
        { key: "verified_plus", label: "Verified+", badge: "silver", hint: "Silver", level: 2 },
        { key: "verified_plus_plus", label: "Verified++", badge: "gold", hint: "Gold", level: 3 }
    ];

    function roleByKey(key) {
        for (var i = 0; i < ROLES.length; i++) {
            if (ROLES[i].key === key) {
                return ROLES[i];
            }
        }

        return ROLES[0];
    }

    // 0 = no badge, 1 = Verified, 2 = Verified+, 3 = Verified++
    function levelOf(info) {
        if (!info) {
            return 0;
        }

        if (info.badge === "gold") {
            return 3;
        }

        if (info.badge === "silver") {
            return 2;
        }

        if (info.verified && info.badge !== "paintbrush") {
            return 1;
        }

        return 0;
    }

    function levelName(level) {
        if (level >= 3) {
            return "Verified++";
        }

        if (level === 2) {
            return "Verified+";
        }

        if (level === 1) {
            return "Verified";
        }

        return "No role yet";
    }

    async function currentUserOrNull() {
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
     * VERIFICATION: STYLES + POPUP WINDOWS
     * =========================================
     */

    function ensureVerifyStyles() {
        if (byId("clipflyVerifyStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyVerifyStyles";

        style.textContent = `
            .top-buttons {
                width: auto !important;
                flex: 0 0 auto;
            }

            .top-buttons button {
                white-space: nowrap;
            }

            #clipflyAppliesCount {
                display: none;
                min-width: 20px;
                margin-left: 6px;
                padding: 1px 7px;
                border-radius: 999px;
                background: #e53935;
                color: #ffffff;
                font-size: 12px;
                font-weight: 800;
                text-align: center;
            }

            .cfv-note {
                color: #9ca8ba;
                line-height: 1.5;
                margin-bottom: 14px;
            }

            .cfv-field {
                display: block;
            }

            .cfv-label {
                display: block;
                font-weight: 700;
                margin-bottom: 6px;
            }

            .cfv-hint {
                display: block;
                font-size: 12px;
                color: #9ca8ba;
                margin-bottom: 6px;
            }

            .cfv-role-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
            }

            @media (max-width: 520px) {
                .cfv-role-grid {
                    grid-template-columns: 1fr;
                }
            }

            .cfv-role {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 14px 8px;
                border: 2px solid #35353d;
                border-radius: 12px;
                background: #101014;
                cursor: pointer;
                text-align: center;
            }

            .cfv-role:hover {
                border-color: #4b5563;
            }

            .cfv-role.selected {
                border-color: #3478ff;
                background: rgba(52, 120, 255, 0.12);
            }

            .cfv-role.disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }

            .cfv-role input[type="radio"] {
                display: none;
            }

            .cfv-role .clipfly-verified-badge {
                width: 30px;
                height: 30px;
                margin: 0;
            }

            .cfv-role .clipfly-verified-badge svg {
                width: 18px;
                height: 18px;
            }

            .cfv-role strong {
                display: block;
                font-size: 15px;
            }

            .cfv-role small {
                display: block;
                color: #9ca8ba;
                font-size: 12px;
            }

            .cfv-status {
                min-height: 18px;
                font-size: 14px;
            }

            .cfv-pending {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 12px;
                border-radius: 10px;
                background: #101014;
                border: 1px solid #35353d;
            }

            .cfv-tabs {
                display: flex;
                gap: 8px;
                margin-bottom: 14px;
            }

            .cfv-tab {
                border: 1px solid #35353d;
                background: #101014;
                color: #ffffff;
                border-radius: 9px;
                padding: 8px 14px;
                cursor: pointer;
                font-weight: 700;
            }

            .cfv-tab.active {
                background: #3478ff;
                border-color: #3478ff;
            }

            .cfv-app {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                margin-bottom: 8px;
                border: 1px solid #35353d;
                border-radius: 12px;
                background: #101014;
                cursor: pointer;
            }

            .cfv-app:hover {
                border-color: #3478ff;
            }

            .cfv-avatar {
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

            .cfv-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .cfv-app-main {
                flex: 1;
                min-width: 0;
            }

            .cfv-app-name {
                font-weight: 700;
            }

            .cfv-app-meta {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 4px;
                margin-top: 3px;
                font-size: 13px;
                color: #9ca8ba;
            }

            .cfv-chip {
                font-size: 12px;
                font-weight: 700;
                padding: 3px 9px;
                border-radius: 999px;
                background: #1b2433;
                color: #cbd5e1;
                white-space: nowrap;
            }

            .cfv-back {
                border: none;
                background: transparent;
                color: #4b8cff;
                cursor: pointer;
                padding: 0;
                margin-bottom: 12px;
                font-size: 14px;
            }

            .cfv-back:hover {
                text-decoration: underline;
            }

            .cfv-head {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
            }

            .cfv-block {
                margin-bottom: 14px;
            }

            .cfv-block-label {
                font-size: 12px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #9ca8ba;
                margin-bottom: 5px;
            }

            .cfv-block-text {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                line-height: 1.5;
                padding: 11px 12px;
                border-radius: 10px;
                background: #101014;
                border: 1px solid #242d3d;
            }

            .cfv-block-text.empty {
                color: #6b7686;
            }

            .cfv-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-top: 18px;
            }

            .cfv-actions button {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }
        `;

        document.head.appendChild(style);
    }

    function ensurePopupShell(id, width, closeOnBackdrop) {
        var popup = byId(id);

        if (popup) {
            return popup;
        }

        popup = mk("div", "popup");

        popup.id = id;
        popup.style.display = "none";
        popup.style.zIndex = "1900";

        var box = mk("div", "popup-box");

        box.style.width = "min(" + width + "px, 94vw)";
        box.style.maxHeight = "90vh";
        box.style.overflowY = "auto";

        var close = mk("button", "close-button", "✕");

        close.type = "button";

        close.addEventListener("click", function () {
            popup.style.display = "none";

            if (id === "clipflyAppliesPopup") {
                refreshAppliesCount();
            }
        });

        var body = mk("div");

        body.id = id + "Body";

        box.appendChild(close);
        box.appendChild(body);
        popup.appendChild(box);

        if (closeOnBackdrop) {
            popup.addEventListener("click", function (event) {
                if (event.target === popup) {
                    popup.style.display = "none";

                    if (id === "clipflyAppliesPopup") {
                        refreshAppliesCount();
                    }
                }
            });
        }

        document.body.appendChild(popup);

        return popup;
    }

    function makeAvatarBox(url) {
        var box = mk("div", "cfv-avatar");

        if (url) {
            var image = document.createElement("img");

            image.src = url;
            image.alt = "";

            image.onerror = function () {
                image.remove();
                box.textContent = "👤";
            };

            box.appendChild(image);

        } else {
            box.textContent = "👤";
        }

        return box;
    }

    /*
     * =========================================
     * VERIFICATION: THE APPLY FORM
     * =========================================
     */

    async function openApply() {
        var user = await currentUserOrNull();

        if (!user) {
            say(
                "Log in required",
                "You need to be logged in to apply for a role.",
                "🔒"
            );

            return;
        }

        ensureVerifyStyles();

        var popup = ensurePopupShell("clipflyApplyPopup", 580, false);
        var body = byId("clipflyApplyPopupBody");

        body.innerHTML = "";
        body.appendChild(mk("h2", "", "📝 Apply for a role"));
        body.appendChild(mk("p", "cfv-note", "Loading..."));

        popup.style.display = "flex";

        var latest = null;
        var setupError = null;

        try {
            var result = await window.supabaseClient
                .from("verification_applications")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(1);

            if (result.error) {
                throw result.error;
            }

            latest = (result.data && result.data[0]) || null;

        } catch (error) {
            console.warn("Could not load applications:", error);

            setupError = error.message || "Something went wrong.";
        }

        var infoMap = await fetchChannelProfiles([user.id]);
        var currentLevel = levelOf(infoMap[user.id]);

        if (popup.style.display === "none") {
            return;
        }

        renderApplyBody(user, latest, currentLevel, setupError);
    }

    function renderApplyBody(user, latest, currentLevel, setupError) {
        var body = byId("clipflyApplyPopupBody");

        if (!body) {
            return;
        }

        body.innerHTML = "";

        body.appendChild(mk("h2", "", "📝 Apply for a role"));

        if (setupError) {
            body.appendChild(
                mk(
                    "p",
                    "cfv-note",
                    "Applications aren't ready yet (did you run the SQL?): " +
                        setupError
                )
            );

            return;
        }

        // An application is already waiting.
        if (latest && latest.status === "pending") {
            var waitingRole = roleByKey(latest.requested_role);

            body.appendChild(
                mk(
                    "p",
                    "cfv-note",
                    "Your application is waiting for review. Hang tight!"
                )
            );

            var waiting = mk("div", "cfv-pending");

            waiting.appendChild(createBadgeElement(waitingRole.badge));
            waiting.appendChild(
                document.createTextNode(
                    " " +
                        waitingRole.label +
                        " · sent " +
                        formatDate(latest.created_at)
                )
            );

            body.appendChild(waiting);

            return;
        }

        if (currentLevel >= 3) {
            body.appendChild(
                mk(
                    "p",
                    "cfv-note",
                    "You already have the highest role, Verified++. Nothing left to apply for!"
                )
            );

            return;
        }

        body.appendChild(
            mk(
                "p",
                "cfv-note",
                "Fill this out and the Clipfly team will take a look. Your current role: " +
                    levelName(currentLevel) +
                    "."
            )
        );

        if (latest && latest.status === "denied") {
            var deniedRole = roleByKey(latest.requested_role);

            var denied = mk(
                "p",
                "cfv-note",
                "Your last application (" +
                    deniedRole.label +
                    ") was denied on " +
                    formatDate(latest.reviewed_at) +
                    ". You can apply again."
            );

            denied.style.color = "#f87171";

            body.appendChild(denied);
        }

        var form = mk("div", "account-form");

        // ---- Question 1: the preset role question ----
        var roleField = mk("div", "cfv-field");

        roleField.appendChild(mk("span", "cfv-label", "What role do you want?"));

        var grid = mk("div", "cfv-role-grid");

        var selectedRole = null;

        ROLES.forEach(function (role) {
            var card = mk("label", "cfv-role");

            var radio = document.createElement("input");

            radio.type = "radio";
            radio.name = "clipflyRole";
            radio.value = role.key;

            if (role.level <= currentLevel) {
                radio.disabled = true;
                card.classList.add("disabled");
            }

            card.appendChild(radio);
            card.appendChild(createBadgeElement(role.badge));

            var text = mk("span");

            text.appendChild(mk("strong", "", role.label));
            text.appendChild(mk("small", "", role.hint));

            card.appendChild(text);

            radio.addEventListener("change", function () {
                selectedRole = role.key;

                var cards = grid.querySelectorAll(".cfv-role");

                for (var i = 0; i < cards.length; i++) {
                    cards[i].classList.remove("selected");
                }

                card.classList.add("selected");
            });

            grid.appendChild(card);
        });

        roleField.appendChild(grid);
        form.appendChild(roleField);

        // ---- The written questions ----
        function addField(labelText, hintText, input) {
            var wrap = mk("label", "cfv-field");

            wrap.appendChild(mk("span", "cfv-label", labelText));

            if (hintText) {
                wrap.appendChild(mk("span", "cfv-hint", hintText));
            }

            wrap.appendChild(input);

            form.appendChild(wrap);
        }

        function makeTextarea(max, placeholder) {
            var area = document.createElement("textarea");

            area.maxLength = max;
            area.placeholder = placeholder;

            return area;
        }

        var why = makeTextarea(
            1000,
            "Tell us why you should get the role you picked..."
        );

        addField("Why should you get the role you want?", "At least 10 characters.", why);

        var content = makeTextarea(500, "Gaming, comedy, music, tutorials...");

        addField("What kind of content do you make?", null, content);

        var links = document.createElement("input");

        links.type = "text";
        links.maxLength = 300;
        links.placeholder = "YouTube, TikTok, Instagram, Discord...";

        addField("Where else can people find you?", "Optional.", links);

        var extra = makeTextarea(500, "Anything else you'd like us to know?");

        addField("Anything else we should know?", "Optional.", extra);

        var status = mk("div", "cfv-status");

        function setStatus(text, isError) {
            status.textContent = text || "";
            status.style.color = isError ? "#f87171" : "#9ca8ba";
        }

        var submit = mk("button", "blue-button", "Send Application");

        submit.type = "button";

        submit.addEventListener("click", async function () {
            var whyText = why.value.trim();
            var contentText = content.value.trim();

            if (!selectedRole) {
                setStatus("Pick the role you want first.", true);
                return;
            }

            if (whyText.length < 10) {
                setStatus(
                    "Tell us a bit more about why you should get this role (at least 10 characters).",
                    true
                );

                return;
            }

            if (contentText.length < 3) {
                setStatus("Tell us what kind of content you make.", true);
                return;
            }

            submit.disabled = true;

            setStatus("Sending...", false);

            try {
                var meta = user.user_metadata || {};

                var result = await window.supabaseClient
                    .from("verification_applications")
                    .insert({
                        user_id: user.id,
                        username: String(meta.username || user.email || "User").slice(0, 60),
                        requested_role: selectedRole,
                        why: whyText,
                        content: contentText,
                        links: links.value.trim() || null,
                        extra: extra.value.trim() || null
                    });

                if (result.error) {
                    throw result.error;
                }

                body.innerHTML = "";

                body.appendChild(mk("h2", "", "Application sent! 🎉"));

                body.appendChild(
                    mk(
                        "p",
                        "cfv-note",
                        "The Clipfly team will read it soon. When they decide, your role will show up on your profile."
                    )
                );

                var done = mk("button", "blue-button", "Close");

                done.type = "button";

                done.addEventListener("click", function () {
                    byId("clipflyApplyPopup").style.display = "none";
                });

                body.appendChild(done);

            } catch (error) {
                console.error("Application failed:", error);

                submit.disabled = false;

                if (error && error.code === "23505") {
                    setStatus(
                        "You already have an application waiting for review.",
                        true
                    );

                } else {
                    setStatus(
                        error.message || "Could not send your application.",
                        true
                    );
                }
            }
        });

        form.appendChild(status);
        form.appendChild(submit);

        body.appendChild(form);
    }

    /*
     * =========================================
     * VERIFICATION: THE REVIEW PANEL (@Clipfly only)
     * =========================================
     */

    var isOfficial = false;
    var officialFor = null;
    var appliesTimer = null;
    var reviewTab = "pending";
    var reviewFlash = "";

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

    async function refreshAppliesCount() {
        var bubble = byId("clipflyAppliesCount");

        if (!isOfficial || !bubble || !window.supabaseClient) {
            return;
        }

        try {
            var result = await window.supabaseClient
                .from("verification_applications")
                .select("id", { count: "exact", head: true })
                .eq("status", "pending");

            if (result.error) {
                throw result.error;
            }

            var count = result.count || 0;

            bubble.textContent = String(count);
            bubble.style.display = count > 0 ? "inline-block" : "none";

        } catch (error) {
            console.warn("Could not count applications:", error);
        }
    }

    async function openApplies() {
        if (!isOfficial) {
            return;
        }

        ensureVerifyStyles();

        var popup = ensurePopupShell("clipflyAppliesPopup", 720, true);

        popup.style.display = "flex";

        await showAppliesList();
    }

    async function showAppliesList() {
        var body = byId("clipflyAppliesPopupBody");

        if (!body) {
            return;
        }

        body.innerHTML = "";

        body.appendChild(mk("h2", "", "📋 Applications"));

        if (reviewFlash) {
            var flash = mk("p", "cfv-note", reviewFlash);

            flash.style.color = "#4ade80";

            body.appendChild(flash);

            reviewFlash = "";
        }

        var tabs = mk("div", "cfv-tabs");

        [
            { key: "pending", label: "Pending" },
            { key: "reviewed", label: "Reviewed" }
        ].forEach(function (tab) {
            var button = mk(
                "button",
                "cfv-tab" + (reviewTab === tab.key ? " active" : ""),
                tab.label
            );

            button.type = "button";

            button.addEventListener("click", function () {
                reviewTab = tab.key;
                showAppliesList();
            });

            tabs.appendChild(button);
        });

        body.appendChild(tabs);

        var list = mk("div");

        list.appendChild(mk("p", "cfv-note", "Loading..."));

        body.appendChild(list);

        var rows = [];

        try {
            var query = window.supabaseClient
                .from("verification_applications")
                .select("*");

            if (reviewTab === "pending") {
                query = query
                    .eq("status", "pending")
                    .order("created_at", { ascending: true });

            } else {
                query = query
                    .neq("status", "pending")
                    .order("reviewed_at", { ascending: false })
                    .limit(50);
            }

            var result = await query;

            if (result.error) {
                throw result.error;
            }

            rows = result.data || [];

        } catch (error) {
            console.error("Could not load applications:", error);

            list.innerHTML = "";

            list.appendChild(
                mk(
                    "p",
                    "cfv-note",
                    "Couldn't load applications: " +
                        (error.message || "Something went wrong.")
                )
            );

            return;
        }

        var profileMap = await fetchChannelProfiles(
            rows.map(function (row) {
                return row.user_id;
            })
        );

        var popup = byId("clipflyAppliesPopup");

        if (!popup || popup.style.display === "none") {
            return;
        }

        list.innerHTML = "";

        if (rows.length === 0) {
            list.appendChild(
                mk(
                    "p",
                    "cfv-note",
                    reviewTab === "pending"
                        ? "No applications waiting. You're all caught up! 🎉"
                        : "Nothing reviewed yet."
                )
            );

            return;
        }

        rows.forEach(function (app) {
            var info = profileMap[app.user_id] || null;
            var role = roleByKey(app.requested_role);

            var card = mk("div", "cfv-app");

            card.appendChild(makeAvatarBox(info && info.avatar_url));

            var main = mk("div", "cfv-app-main");

            main.appendChild(
                mk(
                    "div",
                    "cfv-app-name",
                    "@" + (app.username || (info && info.username) || "User")
                )
            );

            var meta = mk("div", "cfv-app-meta");

            meta.appendChild(createBadgeElement(role.badge));
            meta.appendChild(
                document.createTextNode(
                    " " + role.label + " · " + formatDate(app.created_at)
                )
            );

            main.appendChild(meta);

            card.appendChild(main);

            if (app.status !== "pending") {
                card.appendChild(
                    mk(
                        "span",
                        "cfv-chip",
                        app.status === "denied"
                            ? "Denied"
                            : "Given " + roleByKey(app.granted_role).label
                    )
                );
            }

            card.addEventListener("click", function () {
                showApplicationDetail(app, info);
            });

            list.appendChild(card);
        });
    }

    function addBlock(parent, label, value) {
        var block = mk("div", "cfv-block");

        block.appendChild(mk("div", "cfv-block-label", label));

        var text = mk("div", "cfv-block-text", value || "(not given)");

        if (!value) {
            text.classList.add("empty");
        }

        block.appendChild(text);

        parent.appendChild(block);
    }

    function showApplicationDetail(app, info) {
        var body = byId("clipflyAppliesPopupBody");

        if (!body) {
            return;
        }

        body.innerHTML = "";

        var back = mk("button", "cfv-back", "← Back to applications");

        back.type = "button";

        back.addEventListener("click", showAppliesList);

        body.appendChild(back);

        var role = roleByKey(app.requested_role);
        var name = app.username || (info && info.username) || "User";

        var head = mk("div", "cfv-head");

        head.appendChild(makeAvatarBox(info && info.avatar_url));

        var headText = mk("div");

        var nameLine = mk("div", "cfv-app-name", "@" + name);

        nameLine.style.cursor = "pointer";

        nameLine.title = "Open their channel";

        nameLine.addEventListener("click", function () {
            if (typeof openUserChannel === "function") {
                openUserChannel(
                    name,
                    (info && info.avatar_url) || null,
                    app.user_id
                );
            }
        });

        var subLine = mk("div", "cfv-app-meta");

        subLine.appendChild(
            document.createTextNode("Sent " + formatDate(app.created_at))
        );

        headText.appendChild(nameLine);
        headText.appendChild(subLine);

        head.appendChild(headText);

        body.appendChild(head);

        // Requested role
        var roleBlock = mk("div", "cfv-block");

        roleBlock.appendChild(mk("div", "cfv-block-label", "Role they want"));

        var roleLine = mk("div", "cfv-block-text");

        roleLine.appendChild(createBadgeElement(role.badge));
        roleLine.appendChild(
            document.createTextNode(" " + role.label + " (" + role.hint + ")")
        );

        roleBlock.appendChild(roleLine);

        body.appendChild(roleBlock);

        // Where they are now
        var nowParts = [levelName(levelOf(info))];

        if (info && info.subscribers !== null && info.subscribers !== undefined) {
            nowParts.push(formatCount(info.subscribers));
        }

        addBlock(body, "Their account now", nowParts.join(" · "));

        addBlock(body, "Why should they get the role?", app.why);
        addBlock(body, "What kind of content do they make?", app.content);
        addBlock(body, "Where else to find them", app.links);
        addBlock(body, "Anything else", app.extra);

        if (app.status !== "pending") {
            addBlock(
                body,
                "Decision",
                (app.status === "denied"
                    ? "Denied"
                    : "Given " + roleByKey(app.granted_role).label) +
                    " on " +
                    formatDate(app.reviewed_at)
            );

            return;
        }

        var status = mk("div", "cfv-status");

        status.style.marginTop = "12px";

        var actions = mk("div", "cfv-actions");

        var buttons = [];

        function addAction(label, decision, badgeType, className) {
            var button = mk("button", className || "dark-button");

            button.type = "button";

            if (badgeType) {
                button.appendChild(createBadgeElement(badgeType));
            }

            button.appendChild(document.createTextNode(label));

            button.addEventListener("click", function () {
                decide(app, name, decision, buttons, status);
            });

            buttons.push(button);

            actions.appendChild(button);
        }

        addAction("🚫 Deny", "deny", null, "dark-button");
        addAction("Give Verified", "verified", "bronze");
        addAction("Give Verified+", "verified_plus", "silver");
        addAction("Give Verified++", "verified_plus_plus", "gold");

        body.appendChild(actions);
        body.appendChild(status);
    }

    async function decide(app, name, decision, buttons, status) {
        buttons.forEach(function (button) {
            button.disabled = true;
        });

        status.style.color = "#9ca8ba";
        status.textContent = "Saving...";

        try {
            var result = await window.supabaseClient.rpc("review_application", {
                p_application_id: app.id,
                p_decision: decision
            });

            if (result.error) {
                throw result.error;
            }

            var labels = {
                verified: "Verified",
                verified_plus: "Verified+",
                verified_plus_plus: "Verified++"
            };

            reviewFlash =
                decision === "deny"
                    ? "Denied @" + name + "'s application."
                    : "Gave @" + name + " " + labels[decision] + ".";

            refreshAppliesCount();

            await showAppliesList();

        } catch (error) {
            console.error("Review failed:", error);

            buttons.forEach(function (button) {
                button.disabled = false;
            });

            status.style.color = "#f87171";
            status.textContent =
                error.message || "Could not save that decision.";
        }
    }

    /*
     * =========================================
     * VERIFICATION: THE TOP-BAR BUTTONS
     * =========================================
     */

    function ensureApplyButton() {
        var goLive = byId("clipflyGoLiveButton");

        if (!goLive || !goLive.parentNode) {
            return null;
        }

        var button = byId("clipflyApplyButton");

        if (!button) {
            button = mk("button", "", "📝 Apply");

            button.id = "clipflyApplyButton";
            button.type = "button";

            button.addEventListener("click", openApply);

            goLive.parentNode.insertBefore(button, goLive.nextSibling);
        }

        return button;
    }

    function ensureAppliesButton() {
        var button = byId("clipflyAppliesButton");

        if (button) {
            return button;
        }

        var apply = ensureApplyButton();

        if (!apply || !apply.parentNode) {
            return null;
        }

        button = mk("button", "", "📋 Applies");

        button.id = "clipflyAppliesButton";
        button.type = "button";

        var count = mk("span", "", "0");

        count.id = "clipflyAppliesCount";

        button.appendChild(count);

        button.addEventListener("click", openApplies);

        apply.parentNode.insertBefore(button, apply.nextSibling);

        return button;
    }

    async function refreshVerifyUI(user) {
        isOfficial = user ? await checkOfficial(user) : false;

        var apply = ensureApplyButton();

        if (apply) {
            apply.style.display = isOfficial ? "none" : "";
        }

        if (isOfficial) {
            ensureAppliesButton();

            refreshAppliesCount();

            if (!appliesTimer) {
                appliesTimer = setInterval(refreshAppliesCount, 60000);
            }

        } else {
            var applies = byId("clipflyAppliesButton");

            if (applies) {
                applies.remove();
            }

            if (appliesTimer) {
                clearInterval(appliesTimer);
                appliesTimer = null;
            }

            var panel = byId("clipflyAppliesPopup");

            if (panel) {
                panel.style.display = "none";
            }
        }
    }

    function startVerifyUI() {
        ensureVerifyStyles();
        ensureApplyButton();

        if (!window.supabaseClient || !window.supabaseClient.auth) {
            return;
        }

        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            var user = session && session.user ? session.user : null;

            // Supabase advises not to await its calls inside this callback.
            setTimeout(function () {
                refreshVerifyUI(user);
            }, 0);
        });

        window.supabaseClient.auth
            .getSession()
            .then(function (result) {
                var session = result && result.data && result.data.session;

                return refreshVerifyUI(session ? session.user : null);
            })
            .catch(function (error) {
                console.warn(error);
            });
    }

    startVerifyUI();

})();
