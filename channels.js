(function () {
    "use strict";

    /*
     * Channel pages, the Subscriptions list and profile badges:
     *  - shows profile pictures for everyone (not just verified accounts)
     *  - shows a subscriber count
     *  - adds Subscribe / Unsubscribe to a channel's profile window
     *  - shows a paintbrush badge for accounts with badge = 'paintbrush'
     *    in the Supabase profiles table (everyone else keeps the blue check)
     *
     * Needs the SQL functions/columns in Supabase.
     */

    var channelRequest = 0;
    var subsRequest = 0;

    function byId(id) {
        return document.getElementById(id);
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
            .clipfly-verified-badge.clipfly-badge-paintbrush {
                background: linear-gradient(135deg, #a855f7, #ec4899);
                color: #ffffff;
            }

            .clipfly-badge-paintbrush svg {
                width: 11px;
                height: 11px;
                display: block;
                fill: currentColor;
            }
        `;

        document.head.appendChild(style);
    }

    function createBadgeElement(type) {
        if (type === "paintbrush") {
            ensureBadgeStyles();

            var badge = document.createElement("span");

            badge.className = "clipfly-verified-badge clipfly-badge-paintbrush";
            badge.title = "Clipfly paintbrush";
            badge.setAttribute("aria-label", "Clipfly paintbrush");
            badge.setAttribute("data-clipfly-verified-badge", "true");

            badge.innerHTML =
                '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/>' +
                "</svg>";

            return badge;
        }

        if (typeof createVerifiedBadge === "function") {
            return createVerifiedBadge();
        }

        var fallback = document.createElement("span");

        fallback.className = "clipfly-verified-badge";
        fallback.textContent = "\u2713";

        return fallback;
    }

    // Replaces addVerifiedBadge from script.js so it can draw either badge.
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

})();
