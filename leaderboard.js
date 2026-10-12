(function () {
    "use strict";

    /*
     * "Most subs" tab: a podium for the 3 most subscribed channels.
     * Gold = 1st, silver = 2nd, bronze = 3rd.
     * Needs the SQL function get_top_channels in Supabase.
     */

    var request = 0;

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

    function stillOnMostSubs() {
        return (
            typeof currentClipflySection === "undefined" ||
            currentClipflySection === "mostsubs"
        );
    }

    /*
     * =========================================
     * STYLES
     * =========================================
     */

    function ensureStyles() {
        if (byId("clipflyMostSubsStyles")) {
            return;
        }

        var style = document.createElement("style");

        style.id = "clipflyMostSubsStyles";

        style.textContent = `
            .cfm-wrap {
                grid-column: 1 / -1;
                width: 100%;
                padding: 6px 0 30px;
            }

            .cfm-intro {
                color: #9ca8ba;
                text-align: center;
                margin-bottom: 26px;
                line-height: 1.5;
            }

            .cfm-podium {
                display: flex;
                align-items: flex-end;
                justify-content: center;
                gap: 14px;
                max-width: 780px;
                margin: 0 auto;
                padding-top: 40px;
            }

            .cfm-col {
                flex: 1 1 0;
                min-width: 0;
                max-width: 240px;
                display: flex;
                flex-direction: column;
                align-items: center;
            }

            .cfm-gold {
                --av: 112px;
                --h: 240px;
                --ring: #ffd23f;
                --bg: linear-gradient(160deg, #ffe680, #e0a100);
                --ink: #5c3d00;
            }

            .cfm-silver {
                --av: 94px;
                --h: 185px;
                --ring: #cfd6e1;
                --bg: linear-gradient(160deg, #f1f4f9, #a7b0bf);
                --ink: #3b4352;
            }

            .cfm-bronze {
                --av: 86px;
                --h: 150px;
                --ring: #d98f4f;
                --bg: linear-gradient(160deg, #e7a56b, #b0662a);
                --ink: #3a1d06;
            }

            .cfm-count {
                text-align: center;
                margin-bottom: 14px;
                color: #ffffff;
            }

            .cfm-count strong {
                display: block;
                font-size: 22px;
                font-weight: 900;
                line-height: 1.1;
            }

            .cfm-gold .cfm-count strong {
                font-size: 28px;
            }

            .cfm-count span {
                font-size: 13px;
                color: #9ca8ba;
            }

            .cfm-avatar-wrap {
                position: relative;
                z-index: 2;
                margin-bottom: calc(var(--av) * -0.35);
            }

            .cfm-avatar {
                width: var(--av);
                height: var(--av);
                border-radius: 50%;
                border: 4px solid var(--ring);
                background: #1b2433;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                font-size: calc(var(--av) * 0.45);
                color: #9ca8ba;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
            }

            .cfm-avatar img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .cfm-crown {
                position: absolute;
                top: -30px;
                left: 50%;
                transform: translateX(-50%) rotate(-8deg);
                font-size: 36px;
                filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.55));
                pointer-events: none;
            }

            .cfm-stand {
                width: 100%;
                height: var(--h);
                border-radius: 12px 12px 4px 4px;
                background: var(--bg);
                color: var(--ink);
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: calc(var(--av) * 0.35 + 12px) 8px 10px;
                box-sizing: border-box;
                box-shadow:
                    inset 0 3px 0 rgba(255, 255, 255, 0.4),
                    0 12px 30px rgba(0, 0, 0, 0.35);
            }

            .cfm-place {
                font-size: 54px;
                font-weight: 900;
                line-height: 1;
                opacity: 0.85;
            }

            .cfm-gold .cfm-place {
                font-size: 68px;
            }

            .cfm-name {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-wrap: wrap;
                gap: 2px;
                max-width: 100%;
                margin-top: 8px;
                font-size: 15px;
                font-weight: 800;
                text-align: center;
                word-break: break-word;
            }

            .cfm-stand .clipfly-verified-badge {
                box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.25);
            }

            .cfm-col.has-user .cfm-avatar,
            .cfm-col.has-user .cfm-name {
                cursor: pointer;
            }

            .cfm-col.has-user:hover .cfm-avatar {
                transform: translateY(-3px);
            }

            .cfm-avatar {
                transition: transform 0.15s ease;
            }

            .cfm-col.empty .cfm-stand {
                opacity: 0.45;
            }

            @media (max-width: 560px) {
                .cfm-podium {
                    gap: 8px;
                }

                .cfm-gold { --av: 76px; --h: 200px; }
                .cfm-silver { --av: 64px; --h: 160px; }
                .cfm-bronze { --av: 58px; --h: 130px; }

                .cfm-count strong,
                .cfm-gold .cfm-count strong {
                    font-size: 17px;
                }

                .cfm-place { font-size: 38px; }
                .cfm-gold .cfm-place { font-size: 46px; }

                .cfm-name { font-size: 12px; }
                .cfm-crown { font-size: 26px; top: -22px; }
            }
        `;

        document.head.appendChild(style);
    }

    /*
     * =========================================
     * THE PODIUM
     * =========================================
     */

    function buildStand(place, tier, row) {
        var column = mk("div", "cfm-col cfm-" + tier);

        // Subscriber count (above)
        var count = mk("div", "cfm-count");

        if (row) {
            count.appendChild(mk("strong", "", compact(row.subscribers)));
            count.appendChild(
                mk(
                    "span",
                    "",
                    Number(row.subscribers) === 1 ? "subscriber" : "subscribers"
                )
            );

        } else {
            count.appendChild(mk("strong", "", "-"));
            count.appendChild(mk("span", "", "subscribers"));
        }

        column.appendChild(count);

        // Profile picture (standing on the stand)
        var avatarWrap = mk("div", "cfm-avatar-wrap");
        var avatar = mk("div", "cfm-avatar");

        if (row && row.avatar_url) {
            var image = document.createElement("img");

            image.src = row.avatar_url;
            image.alt = "Profile picture";

            image.onerror = function () {
                image.remove();
                avatar.textContent = "👤";
            };

            avatar.appendChild(image);

        } else {
            avatar.textContent = row ? "👤" : "?";
        }

        avatarWrap.appendChild(avatar);

        if (place === 1) {
            avatarWrap.appendChild(mk("div", "cfm-crown", "👑"));
        }

        column.appendChild(avatarWrap);

        // The stand itself
        var stand = mk("div", "cfm-stand");

        stand.appendChild(mk("div", "cfm-place", String(place)));

        var name = mk("div", "cfm-name");

        if (row) {
            name.appendChild(
                document.createTextNode("@" + (row.username || "User"))
            );

            if (typeof addVerifiedBadge === "function") {
                addVerifiedBadge(name, !!row.verified, row.badge || null);
            }

        } else {
            name.textContent = "No one yet";
        }

        stand.appendChild(name);
        column.appendChild(stand);

        if (row) {
            column.classList.add("has-user");

            var open = function () {
                if (typeof openUserChannel === "function") {
                    openUserChannel(
                        row.username || "User",
                        row.avatar_url || null,
                        row.id
                    );
                }
            };

            avatar.addEventListener("click", open);
            name.addEventListener("click", open);

        } else {
            column.classList.add("empty");
        }

        return column;
    }

    function buildPodium(rows) {
        var wrap = mk("div", "cfm-wrap");

        wrap.appendChild(
            mk(
                "p",
                "cfm-intro",
                "The top 3 channels on Clipfly, ranked by subscribers. Gold is 1st, silver is 2nd and bronze is 3rd."
            )
        );

        var podium = mk("div", "cfm-podium");

        // Left to right: 2nd, 1st, 3rd
        [
            { place: 2, tier: "silver" },
            { place: 1, tier: "gold" },
            { place: 3, tier: "bronze" }
        ].forEach(function (slot) {
            podium.appendChild(
                buildStand(slot.place, slot.tier, rows[slot.place - 1] || null)
            );
        });

        wrap.appendChild(podium);

        return wrap;
    }

    async function loadMostSubs() {
        var token = ++request;
        var grid = byId("videoGrid");

        if (!grid) {
            return;
        }

        ensureStyles();

        var rows = [];

        try {
            var result = await window.supabaseClient.rpc("get_top_channels", {
                p_limit: 3
            });

            if (result.error) {
                throw result.error;
            }

            rows = result.data || [];

        } catch (error) {
            console.warn("Could not load top channels (did you run the SQL?):", error);

            if (token === request && stillOnMostSubs()) {
                showSectionMessage(
                    "Couldn't load Most subs",
                    error.message || "Something went wrong."
                );
            }

            return;
        }

        if (token !== request || !stillOnMostSubs()) {
            return;
        }

        grid.innerHTML = "";
        grid.appendChild(buildPodium(rows));
    }

    /*
     * =========================================
     * SIDEBAR BUTTON + NAVIGATION
     * =========================================
     */

    function ensureSidebarButton() {
        var sidebar = document.querySelector(".sidebar");

        if (!sidebar || byId("clipflyMostSubsButton")) {
            return;
        }

        var button = mk("button", "", "🏆 Most subs");

        button.id = "clipflyMostSubsButton";
        button.type = "button";

        button.addEventListener("click", function () {
            openClipflySection("mostsubs");
        });

        // Right under Library (the last button).
        sidebar.appendChild(button);
    }

    var originalOpenSection = window.openClipflySection;

    if (typeof originalOpenSection === "function") {
        window.openClipflySection = async function (section) {
            var result = await originalOpenSection.apply(this, arguments);

            var button = byId("clipflyMostSubsButton");

            if (button) {
                button.classList.toggle(
                    "clipfly-sidebar-active",
                    section === "mostsubs"
                );
            }

            if (section === "mostsubs") {
                if (typeof setSectionTitle === "function") {
                    setSectionTitle("Most subs");
                }

                await loadMostSubs();
            }

            return result;
        };
    }

    window.openMostSubs = function () {
        openClipflySection("mostsubs");
    };

    ensureSidebarButton();

})();