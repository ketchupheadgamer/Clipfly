(function () {
    "use strict";

    /*
     * Channel pages and the Subscriptions list:
     *  - shows profile pictures for everyone (not just verified accounts)
     *  - shows a subscriber count
     *  - adds Subscribe / Unsubscribe to a channel's profile window
     *
     * Needs the SQL function get_channel_profiles in Supabase.
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
                    addVerifiedBadge(name, !!profile.verified);
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
                    addVerifiedBadge(name, true);
                }
            }

            return result;
        };
    }

})();