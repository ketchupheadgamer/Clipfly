(function () {
    "use strict";

    /*
     * =========================================
     * STATE
     * =========================================
     */

    // Streamer
    let liveStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let liveRecordingBlob = null;
    let liveTitle = "";
    let liveThumbnailFile = null;
    let liveThumbnailUrl = null;
    let uploadedThumbFile = null;
    let liveMode = "screen";
    let liveVideo = null;

    let liveRowId = null;
    let heartbeatTimer = null;
    let hostPeer = null;
    let hostChat = null;
    let liveNote = "";
    const viewerLinks = new Map();

    // Home tab
    let liveNowTimer = null;
    let liveNowRefreshing = false;

    // Viewer
    let viewerSession = null;

    let lastChatAt = 0;

    // A live card disappears if the streamer hasn't "checked in" for this long.
    const LIVE_TIMEOUT_MS = 180000;
    const HEARTBEAT_MS = 20000;
    const LIVE_REFRESH_MS = 15000;
    const MAX_VIEWERS = 8;
    const PEER_PREFIX = "clipfly-live-";

    function $(id) {
        return document.getElementById(id);
    }

    function notify(title, text, icon) {
        if (typeof window.showMessage === "function") {
            window.showMessage(title, text, icon || "ℹ️");
        } else {
            alert(title + "\n\n" + text);
        }
    }

    /*
     * =========================================
     * AUTHENTICATION
     * =========================================
     */

    async function getLoggedInUser() {
        if (!window.supabaseClient || !window.supabaseClient.auth) {
            console.error("Supabase authentication is not available.");
            return null;
        }

        try {
            const result = await window.supabaseClient.auth.getUser();

            if (result.error) {
                console.error("Supabase auth error:", result.error);
                return null;
            }

            return (result.data && result.data.user) || null;

        } catch (error) {
            console.error("Could not check authenticated user:", error);
            return null;
        }
    }

    async function requireLogin() {
        const user = await getLoggedInUser();

        if (user) {
            return user;
        }

        alert("You must be logged in to use Clipfly Live.");

        if (typeof window.openAccount === "function") {
            window.openAccount();
        }

        return null;
    }

    /*
     * =========================================
     * LIVE CHAT (shared by streamer and viewers)
     * Uses Supabase Realtime broadcast.
     * =========================================
     */

    function appendChat(container, name, text, system) {
        if (!container) {
            return;
        }

        const row = document.createElement("div");
        row.style.marginBottom = "8px";
        row.style.overflowWrap = "anywhere";

        if (system) {
            row.style.opacity = "0.7";
            row.textContent = text;
        } else {
            const strong = document.createElement("strong");
            strong.textContent = name + ": ";
            row.appendChild(strong);
            row.appendChild(document.createTextNode(text));
        }

        container.appendChild(row);

        while (container.children.length > 200) {
            container.removeChild(container.firstChild);
        }

        container.scrollTop = container.scrollHeight;
    }

    function joinChat(liveId, container) {
        const client = window.supabaseClient;

        if (!client || typeof client.channel !== "function") {
            return null;
        }

        try {
            const channel = client.channel(
                "clipfly-live-chat-" + liveId,
                { config: { broadcast: { self: true } } }
            );

            channel.on(
                "broadcast",
                { event: "chat" },
                function (message) {
                    const payload = (message && message.payload) || {};

                    appendChat(
                        container,
                        String(payload.name || "User").slice(0, 40),
                        String(payload.text || "").slice(0, 300),
                        false
                    );
                }
            );

            channel.subscribe();

            return channel;

        } catch (error) {
            console.warn("Could not join live chat:", error);
            return null;
        }
    }

    function leaveChat(channel) {
        if (!channel || !window.supabaseClient) {
            return;
        }

        try {
            window.supabaseClient.removeChannel(channel);
        } catch (error) {
            console.warn("Could not leave live chat:", error);
        }
    }

    async function sendChatTo(channel, container, input) {
        if (!input) {
            return;
        }

        const text = input.value.trim().slice(0, 300);

        if (!text) {
            return;
        }

        if (Date.now() - lastChatAt < 800) {
            return;
        }

        const user = await getLoggedInUser();

        if (!user) {
            appendChat(
                container,
                "",
                "Log in (Account button) to chat.",
                true
            );

            return;
        }

        lastChatAt = Date.now();

        const name =
            (user.user_metadata && user.user_metadata.username) ||
            "User";

        input.value = "";

        if (channel) {
            try {
                const result = await channel.send({
                    type: "broadcast",
                    event: "chat",
                    payload: { name: name, text: text }
                });

                if (result && result !== "ok") {
                    appendChat(container, name, text, false);
                }

            } catch (error) {
                appendChat(container, name, text, false);
            }

        } else {
            appendChat(container, name, text, false);
        }

        input.focus();
    }

    function sendLiveChat() {
        sendChatTo(
            hostChat,
            $("liveChatMessages"),
            $("liveChatInput")
        );
    }

    /*
     * =========================================
     * OPEN LIVE SETUP
     * =========================================
     */

    async function openLiveSetup() {
        const popup = $("liveSetupPopup");

        if (!popup) {
            alert("Clipfly Live could not load. Make sure live.js is connected.");
            return;
        }

        if (liveStream) {
            showLiveWindow();
            return;
        }

        const user = await requireLogin();

        if (!user) {
            return;
        }

        popup.style.display = "flex";

        const title = $("liveTitleInput");

        if (title) {
            title.focus();
        }
    }

    function closeLiveSetup() {
        const popup = $("liveSetupPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    /*
     * =========================================
     * LIVE MODE
     * =========================================
     */

    function setLiveMode(mode) {
        liveMode = mode;

        const screenButton = $("liveScreenButton");
        const tabButton = $("liveTabButton");

        if (screenButton) {
            screenButton.className =
                mode === "screen" ? "blue-button" : "dark-button";
        }

        if (tabButton) {
            tabButton.className =
                mode === "tab" ? "blue-button" : "dark-button";
        }

        const status = $("liveSetupStatus");

        if (status) {
            status.textContent =
                mode === "screen"
                    ? "You will share your entire screen."
                    : "You will share a browser tab.";
        }
    }

    /*
     * =========================================
     * THUMBNAILS
     * =========================================
     */

    function showThumbPreview(preview, file) {
        if (!preview) {
            return;
        }

        if (!file) {
            preview.innerHTML = "<span>🖼️ Thumbnail preview</span>";
            return;
        }

        const img = document.createElement("img");

        img.src = URL.createObjectURL(file);
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";

        preview.innerHTML = "";
        preview.appendChild(img);
    }

    function previewLiveThumbnail() {
        const input = $("liveThumbnailInput");

        if (!input) {
            return;
        }

        const file = (input.files && input.files[0]) || null;

        liveThumbnailFile = file;

        showThumbPreview($("liveThumbnailPreview"), file);
    }

    function previewChangeLiveThumbnail() {
        const input = $("changeLiveThumbnailInput");

        if (!input) {
            return;
        }

        const file = (input.files && input.files[0]) || null;

        if (file) {
            liveThumbnailFile = file;
        }

        showThumbPreview($("changeLiveThumbnailPreview"), file);
    }

    async function uploadLiveThumbnail(user, file) {
        if (!file || !user || !window.supabaseClient) {
            return null;
        }

        try {
            const extension =
                (file.name.split(".").pop() || "jpg").toLowerCase();

            const path =
                user.id +
                "/live-" +
                Date.now() +
                "-" +
                Math.random().toString(36).substring(2, 10) +
                "." +
                extension;

            const upload =
                await window.supabaseClient
                    .storage
                    .from("thumbnails")
                    .upload(path, file, {
                        cacheControl: "3600",
                        contentType: file.type || "image/jpeg",
                        upsert: false
                    });

            if (upload.error) {
                throw upload.error;
            }

            const result =
                window.supabaseClient
                    .storage
                    .from("thumbnails")
                    .getPublicUrl(path);

            return (result && result.data && result.data.publicUrl) || null;

        } catch (error) {
            console.warn("Could not upload live thumbnail:", error);
            return null;
        }
    }

    /*
     * =========================================
     * SCREEN CAPTURE
     * =========================================
     */

    async function getDisplayStream() {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getDisplayMedia
        ) {
            throw new Error("Your browser does not support screen sharing.");
        }

        return await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: { ideal: 30, max: 60 }
            },
            audio: true
        });
    }

    /*
     * =========================================
     * MEDIA RECORDER
     * =========================================
     */

    function getRecorderType() {
        const types = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm"
        ];

        for (const type of types) {
            if (
                typeof MediaRecorder !== "undefined" &&
                MediaRecorder.isTypeSupported(type)
            ) {
                return type;
            }
        }

        return "";
    }

    function startRecorder(stream) {
        recordedChunks = [];
        liveRecordingBlob = null;

        if (typeof MediaRecorder === "undefined") {
            throw new Error("Your browser does not support video recording.");
        }

        const mimeType = getRecorderType();

        mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType: mimeType })
            : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = function (event) {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = function () {
            if (!recordedChunks.length) {
                return;
            }

            liveRecordingBlob = new Blob(
                recordedChunks,
                { type: mediaRecorder.mimeType || "video/webm" }
            );
        };

        mediaRecorder.onerror = function (event) {
            console.error("MediaRecorder error:", event);
        };

        mediaRecorder.start(1000);
    }

    /*
     * =========================================
     * LIVE STREAM DATABASE ROW (shows on Home)
     * =========================================
     */

    async function registerLiveStream(user) {
        if (!window.supabaseClient) {
            return "Supabase is not loaded.";
        }

        try {
            liveThumbnailUrl = null;
            uploadedThumbFile = null;

            if (liveThumbnailFile) {
                liveThumbnailUrl =
                    await uploadLiveThumbnail(user, liveThumbnailFile);

                uploadedThumbFile = liveThumbnailFile;
            }

            const username =
                (user.user_metadata && user.user_metadata.username) ||
                "User";

            const now = new Date().toISOString();

            const result =
                await window.supabaseClient
                    .from("live_streams")
                    .insert({
                        username: username,
                        title: liveTitle,
                        thumbnail_url: liveThumbnailUrl,
                        is_live: true,
                        started_at: now,
                        last_seen: now
                    })
                    .select("id")
                    .single();

            if (result.error) {
                throw result.error;
            }

            liveRowId = result.data.id;

            startHeartbeat();

            return null;

        } catch (error) {
            console.error("Could not list livestream on Home:", error);

            return error.message || "Could not list the livestream on Home.";
        }
    }

    function startHeartbeat() {
        stopHeartbeat();

        heartbeatTimer = setInterval(async function () {
            if (!liveRowId || !window.supabaseClient) {
                return;
            }

            try {
                await window.supabaseClient
                    .from("live_streams")
                    .update({
                        is_live: true,
                        last_seen: new Date().toISOString()
                    })
                    .eq("id", liveRowId);

            } catch (error) {
                console.warn("Live heartbeat failed:", error);
            }
        }, HEARTBEAT_MS);
    }

    function stopHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    }

    async function removeLiveStreamRow() {
        stopHeartbeat();

        const id = liveRowId;

        liveRowId = null;

        if (!id || !window.supabaseClient) {
            return;
        }

        try {
            const result =
                await window.supabaseClient
                    .from("live_streams")
                    .delete()
                    .eq("id", id);

            if (result.error) {
                throw result.error;
            }

        } catch (error) {
            console.warn("Could not remove live row:", error);
        }

        refreshLiveNow();
    }

    /*
     * =========================================
     * BROADCASTING TO VIEWERS (WebRTC via PeerJS)
     * =========================================
     */

    function updateLiveStatus() {
        const el = $("liveStatus");

        if (!el) {
            return;
        }

        el.textContent =
            (liveNote || "🔴 You are live.") +
            "   👀 " +
            viewerLinks.size +
            " watching";
    }

    function sendToViewers(message) {
        viewerLinks.forEach(function (link) {
            try {
                link.conn.send(message);
            } catch (error) {
                console.warn("Could not message viewer:", error);
            }
        });
    }

    function removeViewer(peerId) {
        const link = viewerLinks.get(peerId);

        if (!link) {
            return;
        }

        viewerLinks.delete(peerId);

        try {
            if (link.call) {
                link.call.close();
            }
        } catch (error) {
            console.warn(error);
        }

        updateLiveStatus();
    }

    function onViewerConnection(conn) {
        conn.on("open", function () {
            if (!liveStream || !hostPeer) {
                try {
                    conn.send({ type: "ended" });
                } catch (error) {
                    console.warn(error);
                }

                setTimeout(function () {
                    try {
                        conn.close();
                    } catch (error) {
                        console.warn(error);
                    }
                }, 300);

                return;
            }

            if (viewerLinks.size >= MAX_VIEWERS) {
                try {
                    conn.send({ type: "full" });
                } catch (error) {
                    console.warn(error);
                }

                setTimeout(function () {
                    try {
                        conn.close();
                    } catch (error) {
                        console.warn(error);
                    }
                }, 300);

                return;
            }

            const call = hostPeer.call(conn.peer, liveStream);

            viewerLinks.set(conn.peer, { conn: conn, call: call });

            try {
                conn.send({ type: "info", title: liveTitle });
            } catch (error) {
                console.warn(error);
            }

            updateLiveStatus();
        });

        conn.on("close", function () {
            removeViewer(conn.peer);
        });

        conn.on("error", function () {
            removeViewer(conn.peer);
        });
    }

    function startBroadcasting() {
        return new Promise(function (resolve) {
            if (typeof Peer === "undefined") {
                resolve("the live video library (PeerJS) did not load.");
                return;
            }

            let settled = false;

            function finish(message) {
                if (settled) {
                    return;
                }

                settled = true;
                resolve(message);
            }

            try {
                const peer = new Peer(PEER_PREFIX + liveRowId);

                hostPeer = peer;

                peer.on("open", function () {
                    finish(null);
                });

                peer.on("connection", onViewerConnection);

                peer.on("disconnected", function () {
                    if (hostPeer === peer && !peer.destroyed) {
                        try {
                            peer.reconnect();
                        } catch (error) {
                            console.warn(error);
                        }
                    }
                });

                peer.on("error", function (error) {
                    console.warn("Host peer error:", error);

                    finish(
                        (error && (error.message || error.type)) ||
                        "connection error"
                    );
                });

                setTimeout(function () {
                    finish("timed out reaching the video relay.");
                }, 10000);

            } catch (error) {
                finish(error.message || "could not start broadcasting.");
            }
        });
    }

    function swapTracksOnViewers(newStream) {
        viewerLinks.forEach(function (link) {
            const pc = link.call && link.call.peerConnection;

            if (!pc) {
                return;
            }

            pc.getSenders().forEach(function (sender) {
                if (!sender.track) {
                    return;
                }

                const kind = sender.track.kind;

                const replacement =
                    newStream.getTracks().find(function (track) {
                        return track.kind === kind;
                    }) || null;

                try {
                    Promise.resolve(sender.replaceTrack(replacement))
                        .catch(function (error) {
                            console.warn("Could not swap track:", error);
                        });
                } catch (error) {
                    console.warn("Could not swap track:", error);
                }
            });
        });
    }

    function stopBroadcasting() {
        sendToViewers({ type: "ended" });

        const peer = hostPeer;
        const chat = hostChat;

        hostPeer = null;
        hostChat = null;

        viewerLinks.clear();

        setTimeout(function () {
            try {
                if (peer) {
                    peer.destroy();
                }
            } catch (error) {
                console.warn(error);
            }
        }, 800);

        leaveChat(chat);
    }

    /*
     * =========================================
     * START LIVE
     * =========================================
     */

    async function startLive() {
        const user = await requireLogin();

        if (!user) {
            closeLiveSetup();
            return;
        }

        const titleInput = $("liveTitleInput");
        const status = $("liveSetupStatus");

        if (!titleInput) {
            console.error("liveTitleInput was not found.");
            return;
        }

        const title = titleInput.value.trim();

        if (!title) {
            if (status) {
                status.textContent = "Please enter a livestream name.";
            }

            titleInput.focus();

            return;
        }

        try {
            if (status) {
                status.textContent = "Choose your screen or browser tab...";
            }

            const stream = await getDisplayStream();

            liveStream = stream;
            liveTitle = title;

            const video = $("livePreviewVideo");

            if (!video) {
                throw new Error(
                    "The Clipfly Live video player could not be found."
                );
            }

            liveVideo = video;

            video.srcObject = stream;
            video.muted = true;

            await video.play();

            startRecorder(stream);

            const videoTrack = stream.getVideoTracks()[0];

            if (videoTrack) {
                videoTrack.addEventListener("ended", function () {
                    if (liveStream === stream) {
                        endLive();
                    }
                });
            }

            closeLiveSetup();

            const livePopup = $("livePopup");

            if (livePopup) {
                livePopup.style.display = "flex";
            }

            const titleDisplay = $("liveTitleDisplay");

            if (titleDisplay) {
                titleDisplay.textContent = "🔴 " + liveTitle;
            }

            const liveBar = $("clipflyLiveBar");

            if (liveBar) {
                liveBar.style.display = "flex";
            }

            const chatBox = $("liveChatMessages");

            if (chatBox) {
                chatBox.innerHTML = "";
                appendChat(chatBox, "", "Live chat started!", true);
            }

            /*
             * Put the livestream on Home, then open it to viewers.
             */

            liveNote = "";
            viewerLinks.clear();

            const listError = await registerLiveStream(user);

            if (listError) {
                liveNote =
                    "🔴 You are live, but the stream could not be listed on Home: " +
                    listError;

            } else {
                const castError = await startBroadcasting();

                if (castError) {
                    liveNote =
                        "🔴 You are live, but viewers may not be able to connect: " +
                        castError;
                }

                hostChat = joinChat(liveRowId, chatBox);
            }

            updateLiveStatus();
            refreshLiveNow();

        } catch (error) {
            console.error("Clipfly Live error:", error);

            if (liveStream) {
                try {
                    liveStream.getTracks().forEach(function (track) {
                        track.stop();
                    });
                } catch (stopError) {
                    console.warn(stopError);
                }

                liveStream = null;
            }

            if (status) {
                status.textContent =
                    error.message || "Could not start livestream.";
            }
        }
    }

    /*
     * =========================================
     * LIVE WINDOW
     * =========================================
     */

    function showLiveWindow() {
        if (!liveStream) {
            return;
        }

        const popup = $("livePopup");

        if (popup) {
            popup.style.display = "flex";
        }
    }

    function closeLiveWindow() {
        const popup = $("livePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    /*
     * =========================================
     * CHANGE LIVE
     * =========================================
     */

    function changeLive() {
        if (!liveStream) {
            return;
        }

        const popup = $("changeLivePopup");

        if (!popup) {
            alert("Change Live window could not be found.");
            return;
        }

        const titleInput = $("changeLiveTitleInput");

        if (titleInput) {
            titleInput.value = liveTitle;
        }

        popup.style.display = "flex";
    }

    function closeChangeLive() {
        const popup = $("changeLivePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    async function changeLiveSource(mode) {
        if (!liveStream) {
            return;
        }

        try {
            const user = await requireLogin();

            if (!user) {
                return;
            }

            const newStream = await getDisplayStream();
            const oldStream = liveStream;

            liveStream = newStream;

            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();

                await new Promise(function (resolve) {
                    setTimeout(resolve, 300);
                });
            }

            if (oldStream) {
                oldStream.getTracks().forEach(function (track) {
                    track.stop();
                });
            }

            if (liveVideo) {
                liveVideo.srcObject = newStream;
                await liveVideo.play();
            }

            // Viewers keep watching, now with the new screen.
            swapTracksOnViewers(newStream);

            startRecorder(newStream);

            const track = newStream.getVideoTracks()[0];

            if (track) {
                track.addEventListener("ended", function () {
                    if (liveStream === newStream) {
                        endLive();
                    }
                });
            }

        } catch (error) {
            console.error("Could not change live source:", error);

            alert(error.message || "Could not change your screen.");
        }
    }

    async function saveLiveChanges() {
        const titleInput = $("changeLiveTitleInput");

        if (titleInput) {
            const newTitle = titleInput.value.trim();

            if (newTitle) {
                liveTitle = newTitle;
            }
        }

        const titleDisplay = $("liveTitleDisplay");

        if (titleDisplay) {
            titleDisplay.textContent = "🔴 " + liveTitle;
        }

        closeChangeLive();

        sendToViewers({ type: "info", title: liveTitle });

        /*
         * Update the card on the Home tab too.
         */

        if (liveRowId && window.supabaseClient) {
            try {
                const changes = {
                    title: liveTitle,
                    last_seen: new Date().toISOString()
                };

                if (
                    liveThumbnailFile &&
                    liveThumbnailFile !== uploadedThumbFile
                ) {
                    const user = await getLoggedInUser();

                    const newUrl =
                        await uploadLiveThumbnail(user, liveThumbnailFile);

                    if (newUrl) {
                        liveThumbnailUrl = newUrl;
                        uploadedThumbFile = liveThumbnailFile;
                        changes.thumbnail_url = newUrl;
                    }
                }

                const result =
                    await window.supabaseClient
                        .from("live_streams")
                        .update(changes)
                        .eq("id", liveRowId);

                if (result.error) {
                    throw result.error;
                }

                refreshLiveNow();

            } catch (error) {
                console.warn("Could not update live card:", error);
            }
        }
    }

    /*
     * =========================================
     * END LIVE
     * =========================================
     */

    function endLive() {
        if (!liveStream) {
            return;
        }

        const popup = $("endLivePopup");

        if (popup) {
            popup.style.display = "flex";
        }
    }

    function closeEndLive() {
        const popup = $("endLivePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    async function confirmEndLive() {
        closeEndLive();

        if (!liveStream) {
            return;
        }

        try {
            if (mediaRecorder && mediaRecorder.state !== "inactive") {
                mediaRecorder.stop();

                await new Promise(function (resolve) {
                    setTimeout(resolve, 700);
                });
            }

            liveStream.getTracks().forEach(function (track) {
                track.stop();
            });

            liveStream = null;

            if (liveVideo) {
                liveVideo.srcObject = null;
            }

            const liveBar = $("clipflyLiveBar");

            if (liveBar) {
                liveBar.style.display = "none";
            }

            closeLiveWindow();

            // Tell viewers it's over, then take the stream off Home.
            stopBroadcasting();

            await removeLiveStreamRow();

            liveThumbnailFile = null;
            uploadedThumbFile = null;
            liveNote = "";

            const keepPopup = $("keepLivePopup");

            if (keepPopup) {
                keepPopup.style.display = "flex";
            }

        } catch (error) {
            console.error("Error ending livestream:", error);
        }
    }

    /*
     * =========================================
     * DELETE / KEEP ENDED LIVE
     * =========================================
     */

    function deleteEndedLive() {
        liveRecordingBlob = null;
        recordedChunks = [];
        mediaRecorder = null;
        liveThumbnailUrl = null;

        const popup = $("keepLivePopup");

        if (popup) {
            popup.style.display = "none";
        }

        alert("🗑️ Livestream deleted.");
    }

    async function keepEndedLive() {
        const popup = $("keepLivePopup");

        if (popup) {
            popup.style.display = "none";
        }

        await saveLiveAsVideo();
    }

    async function saveLiveAsVideo() {
        if (!liveRecordingBlob) {
            alert("The livestream recording was not available.");
            return;
        }

        try {
            if (!window.supabaseClient) {
                throw new Error("Supabase is not loaded.");
            }

            const user = await getLoggedInUser();

            if (!user) {
                throw new Error(
                    "You must be logged in to keep the livestream."
                );
            }

            const safeTitle =
                liveTitle
                    .replace(/[^a-z0-9-_ ]/gi, "")
                    .trim()
                    .replace(/\s+/g, "-")
                    .slice(0, 80) ||
                "livestream";

            const storagePath =
                user.id +
                "/live/" +
                Date.now() +
                "-" +
                safeTitle +
                ".webm";

            const uploadResult =
                await window.supabaseClient
                    .storage
                    .from("videos")
                    .upload(storagePath, liveRecordingBlob, {
                        contentType: liveRecordingBlob.type || "video/webm",
                        upsert: false
                    });

            if (uploadResult.error) {
                throw uploadResult.error;
            }

            const publicResult =
                window.supabaseClient
                    .storage
                    .from("videos")
                    .getPublicUrl(storagePath);

            if (
                !publicResult ||
                !publicResult.data ||
                !publicResult.data.publicUrl
            ) {
                throw new Error("Could not create the video URL.");
            }

            const username =
                (user.user_metadata && user.user_metadata.username) ||
                "User";

            const insertResult =
                await window.supabaseClient
                    .from("videos")
                    .insert({
                        title: liveTitle,
                        username: username,
                        video_url: publicResult.data.publicUrl,
                        thumbnail_url: liveThumbnailUrl
                    });

            if (insertResult.error) {
                throw insertResult.error;
            }

            alert("📺 Your livestream is now a video on your channel!");

            if (typeof window.loadVideos === "function") {
                try {
                    await window.loadVideos();
                } catch (error) {
                    console.warn("Could not refresh videos:", error);
                }
            }

        } catch (error) {
            console.error("Could not save livestream:", error);

            alert(
                "The livestream ended, but the recording could not be saved.\n\n" +
                (error.message || "Unknown error")
            );

        } finally {
            liveRecordingBlob = null;
            recordedChunks = [];
            mediaRecorder = null;
            liveThumbnailUrl = null;
        }
    }

    /*
     * =========================================
     * LIVE BAR
     * =========================================
     */

    function createLiveBar() {
        if ($("clipflyLiveBar")) {
            return;
        }

        const bar = document.createElement("div");

        bar.id = "clipflyLiveBar";

        bar.innerHTML = `
            <span style="
                width:9px;
                height:9px;
                background:#ff3030;
                border-radius:50%;
                display:inline-block;
            "></span>

            <strong>LIVE</strong>

            <button
                type="button"
                class="dark-button"
                onclick="window.clipflyChangeLive()"
            >
                🔄 Change Live
            </button>

            <button
                type="button"
                class="dark-button"
                onclick="window.clipflyEndLive()"
                style="background:#e53935;"
            >
                🛑 End Live
            </button>
        `;

        bar.style.position = "fixed";
        bar.style.top = "0";
        bar.style.left = "0";
        bar.style.right = "0";
        bar.style.zIndex = "99999";
        bar.style.background = "#18181f";
        bar.style.padding = "9px";
        bar.style.display = "none";
        bar.style.alignItems = "center";
        bar.style.justifyContent = "center";
        bar.style.gap = "10px";

        document.body.appendChild(bar);
    }

    /*
     * =========================================
     * VIEWER: WATCH SOMEONE ELSE'S LIVESTREAM
     * =========================================
     */

    function setViewerStatus(text) {
        const el = $("clipflyViewerStatus");

        if (el) {
            el.textContent = text;
        }
    }

    function ensureViewerUI() {
        let popup = $("clipflyLiveViewerPopup");

        if (popup) {
            return popup;
        }

        popup = document.createElement("div");

        popup.id = "clipflyLiveViewerPopup";
        popup.className = "popup";
        popup.style.display = "none";

        popup.innerHTML = `
            <div class="popup-box" style="width:min(1100px,96vw);max-height:92vh;overflow-y:auto;">

                <button class="close-button" type="button" id="clipflyViewerClose">✕</button>

                <h2 id="clipflyViewerTitle" style="margin-bottom:4px;padding-right:40px;">🔴 Live</h2>

                <div id="clipflyViewerHost" style="color:#9999a5;margin-bottom:12px;"></div>

                <video
                    id="clipflyViewerVideo"
                    autoplay
                    playsinline
                    controls
                    style="width:100%;max-height:60vh;background:#000;border-radius:14px;object-fit:contain;display:block;"
                ></video>

                <div
                    id="clipflyViewerStatus"
                    style="margin-top:12px;padding:12px;border-radius:10px;background:#101014;color:#aaa;"
                >Connecting...</div>

                <div style="margin-top:18px;border:1px solid #30303a;border-radius:12px;overflow:hidden;">

                    <div
                        id="clipflyViewerChat"
                        style="height:190px;overflow-y:auto;padding:12px;background:#101014;"
                    ></div>

                    <div style="display:flex;gap:8px;padding:10px;background:#18181f;">

                        <input
                            id="clipflyViewerChatInput"
                            type="text"
                            maxlength="300"
                            placeholder="Say something..."
                            style="flex:1;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #35353d;background:#101014;color:white;outline:none;"
                        >

                        <button class="blue-button" type="button" id="clipflyViewerChatSend">Send</button>

                    </div>

                </div>

            </div>
        `;

        document.body.appendChild(popup);

        function sendViewerChat() {
            const session = viewerSession;

            if (!session) {
                return;
            }

            sendChatTo(
                session.chat,
                $("clipflyViewerChat"),
                $("clipflyViewerChatInput")
            );
        }

        $("clipflyViewerClose").addEventListener("click", closeViewer);
        $("clipflyViewerChatSend").addEventListener("click", sendViewerChat);

        $("clipflyViewerChatInput").addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                sendViewerChat();
            }
        });

        popup.addEventListener("click", function (event) {
            if (event.target === popup) {
                closeViewer();
            }
        });

        return popup;
    }

    function closeViewer() {
        const session = viewerSession;

        viewerSession = null;

        if (session) {
            if (session.timer) {
                clearTimeout(session.timer);
            }

            try {
                if (session.call) {
                    session.call.close();
                }
            } catch (error) {
                console.warn(error);
            }

            try {
                if (session.conn) {
                    session.conn.close();
                }
            } catch (error) {
                console.warn(error);
            }

            try {
                if (session.peer) {
                    session.peer.destroy();
                }
            } catch (error) {
                console.warn(error);
            }

            leaveChat(session.chat);
        }

        const video = $("clipflyViewerVideo");

        if (video) {
            video.pause();
            video.srcObject = null;
        }

        const popup = $("clipflyLiveViewerPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    function attachViewerStream(session, remote) {
        const video = $("clipflyViewerVideo");

        if (!video) {
            return;
        }

        session.gotVideo = true;

        if (video.srcObject !== remote) {
            video.srcObject = remote;
        }

        setViewerStatus("🔴 Watching live");

        const playing = video.play();

        if (playing && playing.catch) {
            playing.catch(function () {
                video.muted = true;

                video.play().catch(function () {});

                setViewerStatus(
                    "🔴 Watching live (muted, use the video controls to unmute)"
                );
            });
        }
    }

    function viewerEnded(session, message) {
        if (session.ended) {
            return;
        }

        session.ended = true;

        setViewerStatus(message || "This livestream has ended.");

        const video = $("clipflyViewerVideo");

        if (video) {
            video.pause();
        }
    }

    function watchLive(stream) {
        if (!stream || !stream.id) {
            return;
        }

        if (typeof Peer === "undefined") {
            notify(
                "Can't watch yet",
                "The live video library did not load. Check your internet connection and refresh the page.",
                "⚠️"
            );

            return;
        }

        closeViewer();

        const popup = ensureViewerUI();

        $("clipflyViewerTitle").textContent =
            "🔴 " + (stream.title || "Livestream");

        $("clipflyViewerHost").textContent =
            "@" + (stream.username || "User");

        const chatBox = $("clipflyViewerChat");

        chatBox.innerHTML = "";

        appendChat(chatBox, "", "Welcome to the live chat!", true);

        const video = $("clipflyViewerVideo");

        video.muted = false;
        video.srcObject = null;

        setViewerStatus("Connecting to the stream...");

        popup.style.display = "flex";

        const session = {
            id: stream.id,
            peer: null,
            conn: null,
            call: null,
            chat: null,
            timer: null,
            gotVideo: false,
            ended: false
        };

        viewerSession = session;

        session.chat = joinChat(stream.id, chatBox);

        let peer;

        try {
            peer = new Peer();
        } catch (error) {
            setViewerStatus("Could not start the video connection.");
            return;
        }

        session.peer = peer;

        peer.on("open", function () {
            if (viewerSession !== session) {
                return;
            }

            const conn = peer.connect(
                PEER_PREFIX + stream.id,
                { reliable: true }
            );

            session.conn = conn;

            conn.on("open", function () {
                if (viewerSession === session && !session.gotVideo) {
                    setViewerStatus("Connected. Waiting for video...");
                }
            });

            conn.on("data", function (data) {
                if (viewerSession !== session || !data) {
                    return;
                }

                if (data.type === "ended") {
                    viewerEnded(session, "This livestream has ended.");

                } else if (data.type === "full") {
                    viewerEnded(
                        session,
                        "This stream is full right now. Try again in a bit."
                    );

                } else if (data.type === "info" && data.title) {
                    $("clipflyViewerTitle").textContent =
                        "🔴 " + String(data.title).slice(0, 120);
                }
            });

            conn.on("close", function () {
                if (viewerSession === session) {
                    viewerEnded(session, "This livestream has ended.");
                }
            });

            conn.on("error", function (error) {
                console.warn("Viewer connection error:", error);
            });
        });

        peer.on("call", function (call) {
            if (viewerSession !== session) {
                try {
                    call.close();
                } catch (error) {
                    console.warn(error);
                }

                return;
            }

            session.call = call;

            call.answer();

            call.on("stream", function (remote) {
                if (viewerSession === session) {
                    attachViewerStream(session, remote);
                }
            });

            call.on("close", function () {
                if (viewerSession === session) {
                    viewerEnded(session, "This livestream has ended.");
                }
            });
        });

        peer.on("error", function (error) {
            if (viewerSession !== session) {
                return;
            }

            if (error && error.type === "peer-unavailable") {
                setViewerStatus(
                    "This stream isn't reachable. The streamer may have just ended it."
                );

            } else {
                setViewerStatus(
                    "Connection problem: " +
                    ((error && (error.message || error.type)) || "unknown")
                );
            }
        });

        session.timer = setTimeout(function () {
            if (viewerSession === session && !session.gotVideo && !session.ended) {
                setViewerStatus(
                    "Still connecting... The streamer's network may be blocking viewers. Try again in a moment."
                );
            }
        }, 15000);
    }

    /*
     * =========================================
     * HOME TAB: "LIVE NOW" SECTION
     * =========================================
     */

    function ensureLiveStrip() {
        let strip = $("clipflyLiveNowStrip");

        if (strip) {
            return strip;
        }

        const grid = $("videoGrid");

        if (!grid || !grid.parentNode) {
            return null;
        }

        strip = document.createElement("div");

        strip.id = "clipflyLiveNowStrip";
        strip.style.display = "none";
        strip.style.marginBottom = "26px";

        grid.parentNode.insertBefore(strip, grid);

        return strip;
    }

    function hideLiveStrip() {
        const strip = $("clipflyLiveNowStrip");

        if (strip) {
            strip.style.display = "none";
        }
    }

    function isHomeVisible() {
        const section = window.currentClipflySection || "home";

        if (section !== "home") {
            return false;
        }

        const search = $("searchInput");

        if (search && search.value.trim()) {
            return false;
        }

        return true;
    }

    function onLiveCardClick(stream) {
        const me = window.currentUser;

        if (liveStream && me && stream.owner_id === me.id) {
            showLiveWindow();
            return;
        }

        watchLive(stream);
    }

    async function refreshLiveNow() {
        if (liveNowRefreshing) {
            return;
        }

        if (!isHomeVisible()) {
            hideLiveStrip();
            return;
        }

        if (!window.supabaseClient) {
            return;
        }

        const strip = ensureLiveStrip();

        if (!strip) {
            return;
        }

        liveNowRefreshing = true;

        try {
            const cutoff =
                new Date(Date.now() - LIVE_TIMEOUT_MS).toISOString();

            const result =
                await window.supabaseClient
                    .from("live_streams")
                    .select("*")
                    .eq("is_live", true)
                    .gt("last_seen", cutoff)
                    .order("started_at", { ascending: false });

            if (result.error) {
                throw result.error;
            }

            // The user may have switched tabs while we were loading.
            if (!isHomeVisible()) {
                hideLiveStrip();
                return;
            }

            const streams = result.data || [];

            if (streams.length === 0) {
                strip.innerHTML = "";
                strip.style.display = "none";
                return;
            }

            let profileMap = {};

            if (typeof window.getProfilesByIds === "function") {
                try {
                    profileMap = await window.getProfilesByIds(
                        streams.map(function (s) {
                            return s.owner_id;
                        })
                    );
                } catch (error) {
                    profileMap = {};
                }
            }

            strip.innerHTML = "";

            const heading = document.createElement("div");

            heading.textContent = "🔴 Live now";
            heading.style.fontSize = "20px";
            heading.style.fontWeight = "700";
            heading.style.margin = "0 0 12px";

            strip.appendChild(heading);

            const liveGrid = document.createElement("div");

            liveGrid.className = "video-grid";

            streams.forEach(function (stream) {
                const card = document.createElement("div");

                card.className = "clipfly-video-card";
                card.style.position = "relative";
                card.style.cursor = "pointer";

                card.addEventListener("click", function () {
                    onLiveCardClick(stream);
                });

                const thumbnail = document.createElement("div");

                thumbnail.className = "clipfly-thumbnail";
                thumbnail.style.position = "relative";

                if (stream.thumbnail_url) {
                    const image = document.createElement("img");

                    image.src = stream.thumbnail_url;
                    image.alt = stream.title || "Livestream thumbnail";
                    image.loading = "lazy";

                    thumbnail.appendChild(image);

                } else {
                    thumbnail.innerHTML = "<span>🔴</span>";
                }

                const badge = document.createElement("div");

                badge.textContent = "🔴 LIVE";
                badge.style.position = "absolute";
                badge.style.left = "8px";
                badge.style.bottom = "8px";
                badge.style.padding = "3px 8px";
                badge.style.borderRadius = "6px";
                badge.style.background = "#e53935";
                badge.style.color = "#ffffff";
                badge.style.fontSize = "12px";
                badge.style.fontWeight = "800";

                thumbnail.appendChild(badge);

                const info = document.createElement("div");

                info.className = "clipfly-video-info";

                const title = document.createElement("div");

                title.className = "clipfly-video-title";
                title.textContent = stream.title || "Untitled Livestream";

                const user = document.createElement("div");

                user.className = "clipfly-video-user";
                user.textContent = "@" + (stream.username || "User");

                const profile = profileMap[stream.owner_id];

                if (
                    profile &&
                    profile.verified &&
                    typeof window.addVerifiedBadge === "function"
                ) {
                    window.addVerifiedBadge(user, true);
                }

                info.appendChild(title);
                info.appendChild(user);

                card.appendChild(thumbnail);
                card.appendChild(info);

                liveGrid.appendChild(card);
            });

            strip.appendChild(liveGrid);

            strip.style.display = "block";

        } catch (error) {
            console.warn("Could not load live streams:", error);

        } finally {
            liveNowRefreshing = false;
        }
    }

    /*
     * Wrap the Home functions from script.js so the
     * "Live now" section always updates with them.
     */

    function wrapGlobal(name, afterRun) {
        const original = window[name];

        if (
            typeof original !== "function" ||
            original.__clipflyLiveWrapped
        ) {
            return;
        }

        const wrapped = async function () {
            const result = await original.apply(this, arguments);

            try {
                afterRun();
            } catch (error) {
                console.warn(error);
            }

            return result;
        };

        wrapped.__clipflyLiveWrapped = true;

        window[name] = wrapped;
    }

    function installHomeHooks() {
        wrapGlobal("loadVideos", refreshLiveNow);
        wrapGlobal("openClipflySection", refreshLiveNow);
        wrapGlobal("searchVideos", refreshLiveNow);

        if (!liveNowTimer) {
            liveNowTimer = setInterval(function () {
                if (!document.hidden) {
                    refreshLiveNow();
                }
            }, LIVE_REFRESH_MS);
        }

        refreshLiveNow();
    }

    /*
     * =========================================
     * INITIALIZE
     * =========================================
     */

    function initialize() {
        createLiveBar();

        const chatInput = $("liveChatInput");

        if (chatInput) {
            chatInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    sendLiveChat();
                }
            });
        }

        window.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && viewerSession) {
                closeViewer();
            }
        });

        setLiveMode("screen");

        installHomeHooks();
    }

    /*
     * =========================================
     * GLOBAL FUNCTIONS (used by HTML onclick)
     * =========================================
     */

    window.openLiveSetup = openLiveSetup;
    window.closeLiveSetup = closeLiveSetup;
    window.setLiveMode = setLiveMode;
    window.previewLiveThumbnail = previewLiveThumbnail;
    window.previewChangeLiveThumbnail = previewChangeLiveThumbnail;
    window.startLive = startLive;
    window.closeLiveWindow = closeLiveWindow;
    window.clipflyChangeLive = changeLive;
    window.closeChangeLive = closeChangeLive;
    window.clipflyChangeLiveSource = changeLiveSource;
    window.changeLiveSource = changeLiveSource;
    window.saveLiveChanges = saveLiveChanges;
    window.clipflyEndLive = endLive;
    window.closeEndLive = closeEndLive;
    window.confirmEndLive = confirmEndLive;
    window.clipflyConfirmEndLive = confirmEndLive;
    window.deleteEndedLive = deleteEndedLive;
    window.clipflyDeleteEndedLive = deleteEndedLive;
    window.keepEndedLive = keepEndedLive;
    window.clipflyKeepEndedLive = keepEndedLive;
    window.saveLiveAsVideo = saveLiveAsVideo;
    window.sendLiveChat = sendLiveChat;
    window.refreshLiveNow = refreshLiveNow;
    window.watchLive = watchLive;
    window.closeLiveViewer = closeViewer;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize);
    } else {
        initialize();
    }

})();