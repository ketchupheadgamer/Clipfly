(function () {
    "use strict";

    /*
     * Lets the official Clipfly account (listed in the Supabase "admins"
     * table) delete any video. The real permission check is done by
     * Supabase, this file only shows the buttons.
     */

    var isOfficial = false;
    var checkedUserId = null;

    async function checkOfficialStatus(user) {
        if (!user || !window.supabaseClient) {
            isOfficial = false;
            checkedUserId = null;
            return false;
        }

        if (checkedUserId === user.id) {
            return isOfficial;
        }

        try {
            var result = await window.supabaseClient
                .from("admins")
                .select("user_id")
                .eq("user_id", user.id)
                .maybeSingle();

            if (result.error) {
                throw result.error;
            }

            isOfficial = !!result.data;

        } catch (error) {
            console.warn("Could not check moderator status:", error);
            isOfficial = false;
        }

        checkedUserId = user.id;

        return isOfficial;
    }

    function refreshCurrentSection() {
        var section =
            typeof currentClipflySection !== "undefined"
                ? currentClipflySection
                : "home";

        if (typeof openClipflySection === "function") {
            openClipflySection(section);
        } else if (typeof loadVideos === "function") {
            loadVideos();
        }
    }

    function startWatchingLogin() {
        if (!window.supabaseClient || !window.supabaseClient.auth) {
            return;
        }

        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            var user = session && session.user ? session.user : null;

            // Supabase advises not to await its calls inside this callback.
            setTimeout(async function () {
                var before = isOfficial;

                if (!user || checkedUserId !== user.id) {
                    checkedUserId = null;
                }

                await checkOfficialStatus(user);

                if (before !== isOfficial) {
                    refreshCurrentSection();
                }
            }, 0);
        });
    }

    /*
     * Show the "..." delete menu on every video for the official account.
     * (The original function only builds it for the video's owner.)
     */

    var originalCreateMenu = window.createVideoDeleteMenu;

    if (typeof originalCreateMenu === "function") {
        window.createVideoDeleteMenu = function (video) {
            var menu = originalCreateMenu.apply(this, arguments);

            if (menu) {
                return menu;
            }

            if (isOfficial && video && video.id && window.currentUser) {
                var copy = Object.assign({}, video, {
                    owner_id: window.currentUser.id,
                    __clipflyModerated: true
                });

                return originalCreateMenu.call(this, copy);
            }

            return null;
        };
    }

    /*
     * Delete button inside the watch window for the official account.
     */

    function addOfficialWatchButton() {
        if (!isOfficial) {
            return;
        }

        var video =
            typeof currentWatchingVideo !== "undefined"
                ? currentWatchingVideo
                : null;

        var row = document.getElementById("clipflyReactionRow");

        if (
            !video ||
            !row ||
            document.getElementById("clipflyDeleteVideoButton")
        ) {
            return;
        }

        var button = document.createElement("button");

        button.id = "clipflyDeleteVideoButton";
        button.className = "clipfly-reaction-button";
        button.type = "button";
        button.textContent = "🛡️ Delete (moderator)";
        button.style.color = "#ff6b6b";

        button.addEventListener("click", function (event) {
            event.stopPropagation();

            window.deleteVideo(
                Object.assign({}, video, { __clipflyModerated: true })
            );
        });

        row.appendChild(button);
    }

    var originalWatchFeatures = window.createWatchFeatures;

    if (typeof originalWatchFeatures === "function") {
        window.createWatchFeatures = function () {
            var result = originalWatchFeatures.apply(this, arguments);

            addOfficialWatchButton();

            return result;
        };
    }

    /*
     * Replacement for deleteVideo: owners can delete their own videos,
     * and the official account can delete any video.
     * The database row is removed first, so if Supabase refuses, nothing
     * else gets deleted.
     */

    window.deleteVideo = async function (video) {
        if (!video || !video.id) {
            return;
        }

        var user = await refreshCurrentUser();

        if (!user) {
            showMessage(
                "Log in required",
                "You need to be logged in to delete a video.",
                "🔒"
            );

            return;
        }

        var official = await checkOfficialStatus(user);

        var isOwner =
            !video.__clipflyModerated &&
            video.owner_id &&
            video.owner_id === user.id;

        if (!isOwner && !official) {
            showMessage(
                "Not your video",
                "You can only delete videos that you own.",
                "🚫"
            );

            return;
        }

        var message = isOwner
            ? 'Delete "' + (video.title || "this video") + '"? This cannot be undone.'
            : 'Moderator action: delete "' +
              (video.title || "this video") +
              '" by @' +
              (video.username || "User") +
              "? This cannot be undone.";

        if (!window.confirm(message)) {
            return;
        }

        try {
            var dbDelete = await window.supabaseClient
                .from("videos")
                .delete()
                .eq("id", video.id)
                .select("id");

            if (dbDelete.error) {
                throw dbDelete.error;
            }

            if (!dbDelete.data || dbDelete.data.length === 0) {
                throw new Error(
                    "Clipfly would not let this video be deleted."
                );
            }

            var videoPath = getStoragePathFromPublicUrl(
                video.video_url,
                "videos"
            );

            if (videoPath) {
                var videoRemove = await window.supabaseClient
                    .storage
                    .from("videos")
                    .remove([videoPath]);

                if (videoRemove.error) {
                    console.warn("Could not remove video file:", videoRemove.error);
                }
            }

            var thumbnailPath = getStoragePathFromPublicUrl(
                video.thumbnail_url,
                "thumbnails"
            );

            if (thumbnailPath) {
                var thumbnailRemove = await window.supabaseClient
                    .storage
                    .from("thumbnails")
                    .remove([thumbnailPath]);

                if (thumbnailRemove.error) {
                    console.warn(
                        "Could not remove thumbnail file:",
                        thumbnailRemove.error
                    );
                }
            }

            if (
                typeof currentWatchingVideo !== "undefined" &&
                currentWatchingVideo &&
                currentWatchingVideo.id === video.id
            ) {
                closeWatch();
            }

            showMessage(
                "Video deleted",
                isOwner
                    ? "Your video has been deleted from Clipfly."
                    : "The video has been removed from Clipfly.",
                "🗑️"
            );

            refreshCurrentSection();

        } catch (error) {
            console.error("DELETE VIDEO ERROR:", error);

            showMessage(
                "Delete failed",
                error.message || "Something went wrong while deleting the video.",
                "❌"
            );
        }
    };

    startWatchingLogin();

})();