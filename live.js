(function () {
    "use strict";

    let liveStream = null;
    let mediaRecorder = null;
    let recordedChunks = [];
    let liveRecordingBlob = null;
    let liveTitle = "";
    let liveThumbnailFile = null;
    let liveMode = "screen";
    let liveVideo = null;
    let pendingLiveSource = null;

    function $(id) {
        return document.getElementById(id);
    }

    function openLiveSetup() {
        const popup = $("liveSetupPopup");

        if (!popup) {
            alert("Clipfly Live could not load. Make sure live.js is connected.");
            return;
        }

        popup.style.display = "flex";

        const title = $("liveTitleInput");
        if (title) title.focus();
    }

    function closeLiveSetup() {
        const popup = $("liveSetupPopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    function setLiveMode(mode) {
        liveMode = mode;

        const screenButton = $("liveScreenButton");
        const tabButton = $("liveTabButton");

        if (screenButton) {
            screenButton.className =
                mode === "screen"
                    ? "blue-button"
                    : "dark-button";
        }

        if (tabButton) {
            tabButton.className =
                mode === "tab"
                    ? "blue-button"
                    : "dark-button";
        }

        const status = $("liveSetupStatus");

        if (status) {
            status.textContent =
                mode === "screen"
                    ? "You will share your entire screen."
                    : "You will share a browser tab.";
        }
    }

    function previewLiveThumbnail() {
        const input = $("liveThumbnailInput");
        const preview = $("liveThumbnailPreview");

        if (!input || !preview) return;

        const file = input.files && input.files[0];

        liveThumbnailFile = file || null;

        if (!file) {
            preview.innerHTML = "<span>🖼️ Thumbnail preview</span>";
            return;
        }

        const url = URL.createObjectURL(file);

        preview.innerHTML = "";

        const img = document.createElement("img");

        img.src = url;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";

        preview.appendChild(img);
    }

    function previewChangeLiveThumbnail() {
        const input = $("changeLiveThumbnailInput");
        const preview = $("changeLiveThumbnailPreview");

        if (!input || !preview) return;

        const file = input.files && input.files[0];

        if (!file) {
            preview.innerHTML = "<span>🖼️ Thumbnail preview</span>";
            return;
        }

        liveThumbnailFile = file;

        const url = URL.createObjectURL(file);

        preview.innerHTML = "";

        const img = document.createElement("img");

        img.src = url;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";

        preview.appendChild(img);
    }

    async function getDisplayStream() {
        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getDisplayMedia
        ) {
            throw new Error(
                "Your browser does not support screen sharing."
            );
        }

        return await navigator.mediaDevices.getDisplayMedia({
            video: {
                frameRate: {
                    ideal: 30,
                    max: 60
                }
            },
            audio: true
        });
    }

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

        const mimeType = getRecorderType();

        mediaRecorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);

        mediaRecorder.ondataavailable = function (event) {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = function () {
            if (!recordedChunks.length) return;

            liveRecordingBlob = new Blob(
                recordedChunks,
                {
                    type:
                        mediaRecorder.mimeType ||
                        "video/webm"
                }
            );
        };

        mediaRecorder.start(1000);
    }

    async function startLive() {
        const titleInput = $("liveTitleInput");
        const status = $("liveSetupStatus");

        if (!titleInput) return;

        const title = titleInput.value.trim();

        if (!title) {
            if (status) {
                status.textContent =
                    "Please enter a livestream name.";
            }

            titleInput.focus();
            return;
        }

        try {
            if (status) {
                status.textContent =
                    "Choose your screen or browser tab...";
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
                videoTrack.addEventListener(
                    "ended",
                    function () {
                        if (liveStream === stream) {
                            endLive();
                        }
                    }
                );
            }

            closeLiveSetup();

            const livePopup = $("livePopup");

            if (livePopup) {
                livePopup.style.display = "flex";
            }

            const titleDisplay = $("liveTitleDisplay");

            if (titleDisplay) {
                titleDisplay.textContent =
                    "🔴 " + liveTitle;
            }

            const liveStatus = $("liveStatus");

            if (liveStatus) {
                liveStatus.textContent =
                    "🔴 You are live.";
            }

            const liveBar = $("clipflyLiveBar");

            if (liveBar) {
                liveBar.style.display = "flex";
            }

        } catch (error) {
            console.error("Clipfly Live error:", error);

            if (status) {
                status.textContent =
                    error.message ||
                    "Could not start livestream.";
            }
        }
    }

    function closeLiveWindow() {
        const popup = $("livePopup");

        if (popup) {
            popup.style.display = "none";
        }
    }

    function changeLive() {
        if (!liveStream) return;

        const popup = $("changeLivePopup");

        if (!popup) {
            alert(
                "Change Live window could not be found."
            );
            return;
        }

        const titleInput =
            $("changeLiveTitleInput");

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
        if (!liveStream) return;

        pendingLiveSource = mode;

        try {
            const newStream =
                await getDisplayStream();

            const oldStream = liveStream;

            liveStream = newStream;

            if (
                mediaRecorder &&
                mediaRecorder.state !== "inactive"
            ) {
                mediaRecorder.stop();

                await new Promise(resolve =>
                    setTimeout(resolve, 300)
                );
            }

            if (oldStream) {
                oldStream.getTracks().forEach(
                    track => track.stop()
                );
            }

            if (liveVideo) {
                liveVideo.srcObject = newStream;
                await liveVideo.play();
            }

            startRecorder(newStream);

            const track =
                newStream.getVideoTracks()[0];

            if (track) {
                track.addEventListener(
                    "ended",
                    function () {
                        if (liveStream === newStream) {
                            endLive();
                        }
                    }
                );
            }

            pendingLiveSource = null;

        } catch (error) {
            console.error(error);

            alert(
                error.message ||
                "Could not change your screen."
            );
        }
    }

    function saveLiveChanges() {
        const titleInput =
            $("changeLiveTitleInput");

        if (titleInput) {
            const newTitle =
                titleInput.value.trim();

            if (newTitle) {
                liveTitle = newTitle;
            }
        }

        const titleDisplay =
            $("liveTitleDisplay");

        if (titleDisplay) {
            titleDisplay.textContent =
                "🔴 " + liveTitle;
        }

        closeChangeLive();
    }

    function endLive() {
        if (!liveStream) return;

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

        if (!liveStream) return;

        if (
            mediaRecorder &&
            mediaRecorder.state !== "inactive"
        ) {
            mediaRecorder.stop();

            await new Promise(resolve =>
                setTimeout(resolve, 700)
            );
        }

        liveStream.getTracks().forEach(
            track => track.stop()
        );

        liveStream = null;

        if (liveVideo) {
            liveVideo.srcObject = null;
        }

        const liveBar = $("clipflyLiveBar");

        if (liveBar) {
            liveBar.style.display = "none";
        }

        closeLiveWindow();

        const keepPopup = $("keepLivePopup");

        if (keepPopup) {
            keepPopup.style.display = "flex";
        }
    }

    function deleteEndedLive() {
        liveRecordingBlob = null;
        recordedChunks = [];
        mediaRecorder = null;

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
            alert(
                "The livestream recording was not available."
            );
            return;
        }

        try {
            if (
                typeof window.supabaseClient ===
                "undefined"
            ) {
                throw new Error(
                    "Supabase is not loaded."
                );
            }

            let user = null;

            if (
                typeof window.refreshCurrentUser ===
                "function"
            ) {
                user =
                    await window.refreshCurrentUser();
            }

            if (!user) {
                const result =
                    await window.supabaseClient.auth.getUser();

                user = result.data.user;
            }

            if (!user) {
                throw new Error(
                    "You must be logged in to keep the livestream."
                );
            }

            const safeTitle =
                liveTitle
                    .replace(
                        /[^a-z0-9-_ ]/gi,
                        ""
                    )
                    .trim()
                    .replace(/\s+/g, "-")
                    .slice(0, 80) ||
                "livestream";

            const fileName =
                Date.now() +
                "-" +
                safeTitle +
                ".webm";

            const storagePath =
                user.id +
                "/live/" +
                fileName;

            const uploadResult =
                await window.supabaseClient.storage
                    .from("videos")
                    .upload(
                        storagePath,
                        liveRecordingBlob,
                        {
                            contentType:
                                liveRecordingBlob.type ||
                                "video/webm",
                            upsert: false
                        }
                    );

            if (uploadResult.error) {
                throw uploadResult.error;
            }

            const publicResult =
                window.supabaseClient.storage
                    .from("videos")
                    .getPublicUrl(
                        storagePath
                    );

            const videoUrl =
                publicResult.data.publicUrl;

            let username =
                user.user_metadata?.username ||
                user.email ||
                "User";

            const insertResult =
                await window.supabaseClient
                    .from("videos")
                    .insert({
                        title: liveTitle,
                        username: username,
                        video_url: videoUrl,
                        user_id: user.id
                    });

            if (insertResult.error) {
                throw insertResult.error;
            }

            alert(
                "📺 Your livestream is now a video on your channel!"
            );

            if (
                typeof window.loadVideos ===
                "function"
            ) {
                try {
                    await window.loadVideos();
                } catch (error) {
                    console.warn(error);
                }
            }

        } catch (error) {
            console.error(
                "Could not save livestream:",
                error
            );

            alert(
                "The livestream ended, but the recording could not be saved.\n\n" +
                (error.message || "Unknown error")
            );

        } finally {
            liveRecordingBlob = null;
            recordedChunks = [];
            mediaRecorder = null;
        }
    }

    function sendLiveChat() {
        const input =
            $("liveChatInput");

        const messages =
            $("liveChatMessages");

        if (!input || !messages) return;

        const text =
            input.value.trim();

        if (!text) return;

        let username = "You";

        if (
            window.currentUser &&
            window.currentUser.user_metadata
        ) {
            username =
                window.currentUser
                    .user_metadata
                    .username ||
                "You";
        }

        const message =
            document.createElement("div");

        message.style.marginBottom = "8px";

        const name =
            document.createElement("strong");

        name.textContent =
            username + ": ";

        message.appendChild(name);

        message.appendChild(
            document.createTextNode(text)
        );

        messages.appendChild(message);

        messages.scrollTop =
            messages.scrollHeight;

        input.value = "";
        input.focus();
    }

    function createLiveBar() {
        if ($("clipflyLiveBar")) return;

        const bar =
            document.createElement("div");

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

    function initialize() {
        createLiveBar();

        const chatInput =
            $("liveChatInput");

        if (chatInput) {
            chatInput.addEventListener(
                "keydown",
                function (event) {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        sendLiveChat();
                    }
                }
            );
        }

        setLiveMode("screen");
    }

    /*
     * MAKE FUNCTIONS AVAILABLE TO index.html
     */

    window.openLiveSetup =
        openLiveSetup;

    window.closeLiveSetup =
        closeLiveSetup;

    window.setLiveMode =
        setLiveMode;

    window.previewLiveThumbnail =
        previewLiveThumbnail;

    window.previewChangeLiveThumbnail =
        previewChangeLiveThumbnail;

    window.startLive =
        startLive;

    window.closeLiveWindow =
        closeLiveWindow;

    window.changeLive =
        changeLive;

    window.closeChangeLive =
        closeChangeLive;

    window.changeLiveSource =
        changeLiveSource;

    window.saveLiveChanges =
        saveLiveChanges;

    window.endLive =
        endLive;

    window.closeEndLive =
        closeEndLive;

    window.confirmEndLive =
        confirmEndLive;

    window.deleteEndedLive =
        deleteEndedLive;

    window.keepEndedLive =
        keepEndedLive;

    window.sendLiveChat =
        sendLiveChat;

    /*
     * ALSO EXPOSE CLIPFLY NAMES
     */

    window.clipflyOpenLiveSetup =
        openLiveSetup;

    window.clipflyCloseLiveSetup =
        closeLiveSetup;

    window.clipflyStartLive =
        startLive;

    window.clipflyChangeLive =
        changeLive;

    window.clipflyEndLive =
        endLive;

    window.clipflyCloseLiveWindow =
        closeLiveWindow;

    window.clipflySendLiveChat =
        sendLiveChat;

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );
    } else {
        initialize();
    }

})();