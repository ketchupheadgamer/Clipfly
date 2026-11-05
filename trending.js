(function () {
    "use strict";

    /*
     * Trending row at the top of Home: the most liked and most commented
     * videos. Needs the get_trending_videos SQL function in Supabase.
     */

    var request = 0;

    function byId(id) {
        return document.getElementById(id);
    }

    function isHomeVisible() {
        var section = window.currentClipflySection || "home";

        if (section !== "home") {
            return false;
        }

        var search = byId("searchInput");

        return !(search && search.value.trim());
    }

    function ensureStrip() {
        var strip = byId("clipflyTrendingStrip");

        if (strip) {
            return strip;
        }

        var grid = byId("videoGrid");

        if (!grid || !grid.parentNode) {
            return null;
        }

        strip = document.createElement("div");

        strip.id = "clipflyTrendingStrip";
        strip.style.display = "none";
        strip.style.marginBottom = "26px";

        // Keep it below the "Live now" row when that exists.
        var live = byId("clipflyLiveNowStrip");

        if (live && live.parentNode === grid.parentNode) {
            grid.parentNode.insertBefore(strip, live.nextSibling);
        } else {
            grid.parentNode.insertBefore(strip, grid);
        }

        return strip;
    }

    function hideStrip() {
        var strip = byId("clipflyTrendingStrip");

        if (strip) {
            strip.style.display = "none";
        }
    }

    async function refreshTrending() {
        var token = ++request;

        if (!isHomeVisible()) {
            hideStrip();
            return;
        }

        if (!window.supabaseClient) {
            return;
        }

        var strip = ensureStrip();

        if (!strip) {
            return;
        }

        try {
            var result = await window.supabaseClient.rpc("get_trending_videos", {
                p_limit: 4
            });

            if (result.error) {
                throw result.error;
            }

            if (token !== request || !isHomeVisible()) {
                return;
            }

            var videos = result.data || [];

            if (videos.length === 0) {
                strip.innerHTML = "";
                strip.style.display = "none";
                return;
            }

            var profiles = {};

            if (typeof window.getProfilesByIds === "function") {
                try {
                    profiles = await window.getProfilesByIds(
                        videos.map(function (video) {
                            return video.owner_id;
                        })
                    );
                } catch (error) {
                    profiles = {};
                }
            }

            if (token !== request || !isHomeVisible()) {
                return;
            }

            strip.innerHTML = "";

            var heading = document.createElement("div");

            heading.textContent = "🔥 Trending now";
            heading.style.fontSize = "20px";
            heading.style.fontWeight = "700";
            heading.style.margin = "0 0 12px";

            strip.appendChild(heading);

            var grid = document.createElement("div");

            grid.className = "video-grid";

            videos.forEach(function (video, index) {
                var card = document.createElement("div");

                card.className = "clipfly-video-card";
                card.style.position = "relative";
                card.style.cursor = "pointer";

                card.addEventListener("click", function () {
                    if (typeof watchVideo === "function") {
                        watchVideo(video);
                    }
                });

                var thumbnail = document.createElement("div");

                thumbnail.className = "clipfly-thumbnail";
                thumbnail.style.position = "relative";

                if (video.thumbnail_url) {
                    var image = document.createElement("img");

                    image.src = video.thumbnail_url;
                    image.alt = video.title || "Video thumbnail";
                    image.loading = "lazy";

                    thumbnail.appendChild(image);

                } else {
                    thumbnail.innerHTML = "<span>🎬</span>";
                }

                var rank = document.createElement("div");

                rank.textContent = "#" + (index + 1);
                rank.style.position = "absolute";
                rank.style.left = "8px";
                rank.style.top = "8px";
                rank.style.padding = "3px 9px";
                rank.style.borderRadius = "6px";
                rank.style.background = "rgba(0, 0, 0, 0.75)";
                rank.style.color = "#ffffff";
                rank.style.fontSize = "12px";
                rank.style.fontWeight = "800";

                thumbnail.appendChild(rank);

                var info = document.createElement("div");

                info.className = "clipfly-video-info";

                var title = document.createElement("div");

                title.className = "clipfly-video-title";
                title.textContent = video.title || "Untitled Video";

                var user = document.createElement("div");

                user.className = "clipfly-video-user";
                user.textContent = "@" + (video.username || "User");

                var profile = profiles[video.owner_id];

                if (typeof window.addVerifiedBadge === "function") {
                    window.addVerifiedBadge(user, !!(profile && profile.verified));
                }

                info.appendChild(title);
                info.appendChild(user);

                card.appendChild(thumbnail);
                card.appendChild(info);

                grid.appendChild(card);
            });

            strip.appendChild(grid);

            strip.style.display = "block";

        } catch (error) {
            console.warn("Could not load trending videos (did you run the SQL?):", error);

            hideStrip();
        }
    }

    /*
     * Wrap the Home functions from script.js so the row always updates.
     */

    function wrapGlobal(name) {
        var original = window[name];

        if (typeof original !== "function") {
            return;
        }

        window[name] = async function () {
            var result = await original.apply(this, arguments);

            try {
                refreshTrending();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };
    }

    wrapGlobal("loadVideos");
    wrapGlobal("openClipflySection");
    wrapGlobal("searchVideos");

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            setTimeout(refreshTrending, 1200);
        });
    } else {
        setTimeout(refreshTrending, 600);
    }

    window.refreshTrending = refreshTrending;

})();