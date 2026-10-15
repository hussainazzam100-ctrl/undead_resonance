
const API_BASE = "http://127.0.0.1:8000";
const PLAYER_ID = "player_01";

const ITEM_NAMES = {
    food: "Food",
    drinks: "Drinks",
    backpack: "Backpack",
    baseball_bat: "Baseball Bat"
};

const CONSUMABLE_ITEMS = ["food", "drinks"];

const AREA_NAMES = {
    apartment_01: "Abandoned Apartment",
    hallway_01: "Apartment Hallway",
    stairwell_01: "Stairwell",
    building_exit: "Ground-Floor Exit"
};

/*
 * Combat encounters use the shared combat modal.
 * Non-combat encounters use choice panels.
 */
const ENCOUNTERS = {
    hollow: {
        title: "THE HOLLOW",
        description: "Something once human blocks your path.",
        combat: true
    },

    mimic_plea: {
        title: "A CRY FOR HELP",
        description: "A stranger calls from the darkness. Something feels wrong.",
        endpoint: "mimic_plea",
        choices: [
            ["help", "Help the stranger"],
            ["avoid", "Ignore the plea"]
        ]
    },

    mimic: {
       title: "The Mimic",
       description: "...",
       endpoint: "mimic",
       combat: true,
    },

    lurker: {
        title: "THE LURKER",
        description: "Something waits in the darkness.",
        endpoint: "lurker",
        combat: true
    },

    stairwell: {
        title: "THE STAIRWELL",
        description: "A scraping sound rises from the darkness below.",
        endpoint: "stairwell",
        choices: [
            ["descend", "Descend"],
            ["return", "Return upstairs"]
        ]
    },

    stairwell_creature: {
        title: "THE LURKER",
        description: "A creature emerges from the darkness.",
        combat: true
    }
};

const el = {
    intro: document.getElementById("intro-screen"),
    game: document.getElementById("game-screen"),
    play: document.getElementById("play-button"),

    areaName: document.getElementById("area-name"),
    areaDescription: document.getElementById("area-description"),
    eventLog: document.getElementById("event-log"),

    healthValue: document.getElementById("health-value"),
    healthBar: document.getElementById("health-bar"),
    infectionValue: document.getElementById("infection-value"),
    infectionBar: document.getElementById("infection-bar"),
    hungerValue: document.getElementById("hunger-value"),
    hungerBar: document.getElementById("hunger-bar"),

    inventoryList: document.getElementById("inventory-list"),
    inventoryCapacity: document.getElementById("inventory-capacity"),

    searchButton: document.getElementById("search-button"),
    moveButton: document.getElementById("move-button"),
    mainActions: document.getElementById("main-action-buttons"),
    choices: document.getElementById("dynamic-choices"),
    turnArea: document.getElementById("turn-area"),

    fightModal: document.getElementById("fight-modal"),
    fightTitle: document.getElementById("fight-title"),
    fightDescription: document.getElementById("fight-description"),
    fightInventory: document.getElementById("fight-inventory"),
    fightActions: document.getElementById("fight-actions"),
    closeFight: document.getElementById("close-fight-modal"),
    combatLog: document.getElementById("combat-log"),

    enemyCard: document.getElementById("enemy-card"),
    enemyName: document.getElementById("enemy-name"),
    enemyHealthText: document.getElementById("enemy-health-text"),
    enemyBar: document.getElementById("enemy-bar"),
    enemyGhost: document.getElementById("enemy-ghost"),

    playerCard: document.getElementById("player-card"),
    playerHealthText: document.getElementById("player-health-text"),
    playerBar: document.getElementById("player-bar"),
    playerGhost: document.getElementById("player-ghost")
};

let currentArea = null;
let currentPlayer = null;
let currentInventory = null;

let availableResources = [];
let requestInProgress = false;
let movementPanelOpen = false;
let hasStarted = false;

let lastDeathScene = null;
let pendingDeathWarningShown = false;

/*
 * Active combat state.
 * The backend is authoritative for health, damage and outcomes.
 */
let combatUI = null;


/* ============================================================
   API
============================================================ */

async function fetchAPI(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const contentType = response.headers.get("content-type") || "";

    const data = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const message =
            typeof data === "object" && data !== null
                ? data.detail || data.message
                : data;

        throw new Error(
            typeof message === "string"
                ? message
                : `Request failed: ${response.status}`
        );
    }

    return data;
}


/* ============================================================
   LOGGING AND GAME STATUS
============================================================ */

function addLog(message, type = "SYSTEM") {
    if (!el.eventLog || !message) return;

    const entry = document.createElement("p");
    entry.className = "log-entry";

    const prefix = document.createElement("span");
    prefix.className = "log-prefix";
    prefix.textContent = `[${type}] `;

    entry.append(prefix, document.createTextNode(String(message)));

    el.eventLog.appendChild(entry);
    el.eventLog.scrollTop = el.eventLog.scrollHeight;
}

function getStatus() {
    return currentPlayer?.scenario_status || "playing";
}

function isGameActive() {
    return getStatus() === "playing";
}

function getEventId(event) {
    if (!event) return null;

    if (typeof event === "string") {
        return event;
    }

    return (
        event.id ||
        event.event_id ||
        event.type ||
        event.event ||
        null
    );
}

function isCombatActive() {
    if (combatUI) return true;

    const eventId = getEventId(currentPlayer?.active_event);

    return Boolean(eventId && ENCOUNTERS[eventId]?.combat);
}

/*
 * Use one warning per pending-death state.
 * This prevents the combat handler, response handler and
 * terminal-state renderer from logging the same warning repeatedly.
 */
function showPendingDeathWarning(message =
    "Death is imminent. Advance the turn to resolve the pending scene."
) {
    if (pendingDeathWarningShown) return;

    addLog(message, "WARNING");
    pendingDeathWarningShown = true;
}


/* ============================================================
   PLAYER AND AREA RENDERING
============================================================ */

function updateStat(valueElement, barElement, value) {
    const numericValue = Math.max(
        0,
        Math.min(100, Number(value) || 0)
    );

    if (valueElement) {
        valueElement.textContent = value ?? 0;
    }

    if (barElement) {
        barElement.style.width = `${numericValue}%`;
    }
}

function renderPlayer(player, inventory) {
    currentPlayer = player;
    currentInventory = inventory;

    updateStat(el.healthValue, el.healthBar, player.health);
    updateStat(el.infectionValue, el.infectionBar, player.infection);
    updateStat(el.hungerValue, el.hungerBar, player.hunger);

    el.inventoryList.replaceChildren();

    const items = inventory.inventory || [];

    if (!items.length) {
        const li = document.createElement("li");
        li.textContent = "Nothing carried";
        el.inventoryList.appendChild(li);
    } else {
        items.forEach(itemId => {
            const li = document.createElement("li");

            const name = document.createElement("span");
            name.className = "inv-name";
            name.textContent = ITEM_NAMES[itemId] || itemId;

            li.appendChild(name);

            if (CONSUMABLE_ITEMS.includes(itemId)) {
                const use = document.createElement("button");

                use.type = "button";
                use.className = "inv-use";
                use.textContent = "Use";

                use.addEventListener("click", () => {
                    consumeOutsideCombat(itemId);
                });

                li.appendChild(use);
            }

            el.inventoryList.appendChild(li);
        });
    }

    el.inventoryCapacity.textContent =
        `Capacity: ${inventory.items_count ?? items.length}/${inventory.capacity ?? player.inventory_capacity ?? "?"}`;

    updateActionAvailability();
}

function renderArea(area) {
    currentArea = area;

    el.areaName.textContent =
        AREA_NAMES[area.area_id] ||
        area.area ||
        area.name ||
        "Unknown Area";

    el.areaDescription.textContent =
        area.description || "There is nothing more to observe.";

    updateActionAvailability();
}


/* ============================================================
   ACTION AVAILABILITY
============================================================ */

function updateActionAvailability() {
    const status = getStatus();

    const pendingDeath = status === "death_pending";
    const gameOver = status === "dead" || status === "won";

    const active =
        status === "playing" &&
        !requestInProgress;

    const hasEncounter = Boolean(currentPlayer?.active_event);

    const hasModal =
        !el.fightModal.classList.contains("hidden");

    const turnButton = document.getElementById("turn-button");

    // Normal actions must be unavailable during pending death.
    el.searchButton.disabled =
        !active ||
        hasEncounter ||
        hasModal ||
        !currentArea ||
        !currentArea.searchable;

    el.moveButton.disabled =
        !active ||
        hasEncounter ||
        hasModal ||
        !currentArea ||
        !Array.isArray(currentArea.connections) ||
        currentArea.connections.length === 0;

    document.querySelectorAll(".inv-use").forEach(button => {
        button.disabled = !active || hasEncounter || hasModal;
    });

    if (!turnButton) return;

    /*
     * Pending death overrides stale encounter/combat UI state.
     * The player must be able to end the turn to resolve death.
     */
    const canResolvePendingDeath =
        pendingDeath &&
        !requestInProgress;

    const canTakeNormalTurn =
        active &&
        !hasEncounter &&
        !hasModal &&
        !movementPanelOpen &&
        !isCombatActive();

    el.turnArea.classList.toggle(
        "hidden",
        gameOver ||
        (
            !canResolvePendingDeath &&
            (movementPanelOpen || isCombatActive())
        )
    );

    turnButton.disabled = !(
        canResolvePendingDeath ||
        (!gameOver && canTakeNormalTurn)
    );
}

function setBusy(value) {
    requestInProgress = value;
    updateActionAvailability();
}


/* ============================================================
   REFRESH STATE
============================================================ */

async function refreshPlayerOnly() {
    const [player, inventory] = await Promise.all([
        fetchAPI(`/players/${PLAYER_ID}`),
        fetchAPI(`/players/${PLAYER_ID}/inventory`)
    ]);

    renderPlayer(player, inventory);
}

async function refreshGame() {
    const [player, inventory, area] = await Promise.all([
        fetchAPI(`/players/${PLAYER_ID}`),
        fetchAPI(`/players/${PLAYER_ID}/inventory`),
        fetchAPI(`/players/${PLAYER_ID}/area`)
    ]);

    renderPlayer(player, inventory);
    renderArea(area);
    renderTurnButton();
    renderTerminalState(player);

    const eventId = getEventId(player.active_event);
    const status = player.scenario_status;

    /*
     * Never open new encounters while death is pending or
     * after the scenario has ended.
     */
    if (status !== "playing") {
        if (!combatUI) {
            closeEncounterUI();
        }

        updateActionAvailability();
        return;
    }

    if (eventId) {
        // Do not replace an existing combat session during refresh.
        if (combatUI) {
            updateActionAvailability();
            return;
        }

        renderEncounter(eventId);
    } else {
        closeEncounterUI();
    }

    updateActionAvailability();
}


/* ============================================================
   START / RESET
============================================================ */

async function startGame() {
    if (requestInProgress) return;

    setBusy(true);

    try {
        const result = await fetchAPI(
            `/players/${PLAYER_ID}/reset`,
            { method: "POST" }
        );

        hasStarted = true;

        // Reset all frontend state for a fresh playthrough.
        lastDeathScene = null;
        pendingDeathWarningShown = false;
        combatUI = null;
        currentPlayer = null;
        currentArea = null;
        currentInventory = null;
        availableResources = [];
        movementPanelOpen = false;

        el.intro.classList.add("hidden");
        el.game.classList.remove("hidden");

        el.eventLog.replaceChildren();
        clearDynamicUI();

        addLog(
            result.message || "You wake in an abandoned apartment.",
            "SYSTEM"
        );

        await refreshGame();

        addLog(
            "The power is failing. Find a way to the ground floor.",
            "OBJECTIVE"
        );
    } catch (error) {
        alert(`Unable to start the scenario: ${error.message}`);
    } finally {
        setBusy(false);
    }
}


/* ============================================================
   SEARCH
============================================================ */

async function searchArea() {
    if (!isGameActive() || requestInProgress) return;

    setBusy(true);

    try {
        const result = await fetchAPI(
            `/players/${PLAYER_ID}/area/search`,
            { method: "POST" }
        );

        availableResources = [...(result.resources_found || [])];

        addLog(
            result.message || "You search the area.",
            "SEARCH"
        );

        if (availableResources.length) {
            addLog(
                `Resources found: ${availableResources
                    .map(id => ITEM_NAMES[id] || id)
                    .join(", ")}.`,
                "DISCOVERY"
            );
        } else {
            addLog("Nothing useful remains here.", "DISCOVERY");
        }

        await refreshGame();
        renderPickupChoices();
    } catch (error) {
        addLog(error.message, "NOTICE");
    } finally {
        setBusy(false);
    }
}

function renderPickupChoices() {
    document.getElementById("pickup-choices")?.remove();

    if (
        !availableResources.length ||
        !isGameActive() ||
        currentPlayer?.active_event
    ) {
        return;
    }

    const container = document.createElement("div");

    container.id = "pickup-choices";
    container.className = "action-buttons";

    availableResources.forEach(itemId => {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = `Take ${ITEM_NAMES[itemId] || itemId}`;

        button.addEventListener("click", async () => {
            if (requestInProgress || !isGameActive()) return;

            setBusy(true);
            button.disabled = true;

            try {
                const result = await fetchAPI(
                    `/players/${PLAYER_ID}/area/pickup`,
                    {
                        method: "POST",
                        body: JSON.stringify({ item: itemId })
                    }
                );

                addLog(
                    result.message || `Picked up ${itemId}.`,
                    "INVENTORY"
                );

                availableResources = [
                    ...(result.remaining_resources || [])
                ];

                await refreshGame();
                renderPickupChoices();

                /*
                 * Refresh normally renders the active encounter.
                 * This fallback handles a returned encounter if
                 * the backend response contains one.
                 */
                if (
                    result.encounter &&
                    isGameActive() &&
                    !combatUI
                ) {
                    renderEncounter(result.encounter);
                }
            } catch (error) {
                addLog(error.message, "NOTICE");
                button.disabled = false;
            } finally {
                setBusy(false);
            }
        });

        container.appendChild(button);
    });

    el.choices.appendChild(container);
}


/* ============================================================
   CONSUMING ITEMS OUTSIDE COMBAT
============================================================ */

async function consumeOutsideCombat(itemId) {
    if (
        requestInProgress ||
        !isGameActive() ||
        currentPlayer?.active_event
    ) {
        return;
    }

    setBusy(true);

    try {
        const result = await fetchAPI(
            `/players/${PLAYER_ID}/consume`,
            {
                method: "POST",
                body: JSON.stringify({ item: itemId })
            }
        );

        addLog(result.message, "INVENTORY");

        await refreshGame();
    } catch (error) {
        addLog(error.message, "NOTICE");
    } finally {
        setBusy(false);
    }
}


/* ============================================================
   MOVEMENT
============================================================ */

function closeMovementPanel() {
    document.getElementById("movement-choices")?.remove();

    movementPanelOpen = false;

    updateActionAvailability();
}

async function moveArea() {
    if (!isGameActive() || requestInProgress) return;

    if (!currentArea?.connections?.length) {
        addLog("There is nowhere to go.", "NOTICE");
        return;
    }

    if (document.getElementById("movement-choices")) {
        closeMovementPanel();
        return;
    }

    document.getElementById("pickup-choices")?.remove();

    const panel = document.createElement("div");
    panel.id = "movement-choices";

    const heading = document.createElement("p");
    heading.textContent = "CHOOSE YOUR DESTINATION";

    panel.appendChild(heading);

    currentArea.connections.forEach(destination => {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = AREA_NAMES[destination] || destination;

        button.addEventListener("click", async () => {
            if (requestInProgress || !isGameActive()) return;

            setBusy(true);
            button.disabled = true;

            try {
                const result = await fetchAPI(
                    `/players/${PLAYER_ID}/area/move`,
                    {
                        method: "POST",
                        body: JSON.stringify({ destination })
                    }
                );

                panel.remove();
                movementPanelOpen = false;
                availableResources = [];

                addLog(
                    result.message || "You move to another area.",
                    "MOVEMENT"
                );

                await refreshGame();

                if (
                    result.encounter &&
                    isGameActive() &&
                    !combatUI
                ) {
                    renderEncounter(result.encounter);
                }
            } catch (error) {
                addLog(error.message, "NOTICE");
                button.disabled = false;
            } finally {
                setBusy(false);
            }
        });

        panel.appendChild(button);
    });

    el.choices.appendChild(panel);

    movementPanelOpen = true;

    updateActionAvailability();
}


/* ============================================================
   ENCOUNTERS
============================================================ */

function closeEncounterUI() {
    document.getElementById("encounter-choices")?.remove();

    const status = getStatus();

    const gameOver =
        status === "dead" ||
        status === "won";

    const pendingDeath =
        status === "death_pending";

    /*
     * A concluded combat window remains visible only while
     * the scenario is still active and combatUI still exists.
     */
    if (!combatUI || gameOver || pendingDeath) {
        el.fightModal.classList.add("hidden");
    }

    updateActionAvailability();
}

function renderEncounter(event) {
    const eventId = getEventId(event);

    if (!eventId || !isGameActive()) return;

    const encounter = ENCOUNTERS[eventId];

    if (!encounter) {
        console.warn("Unrecognized backend event:", event);
        addLog(`Unrecognized encounter: ${eventId}`, "NOTICE");
        return;
    }

    // Combat encounters must use the backend-powered combat modal.
    if (encounter.combat) {
        document.getElementById("encounter-choices")?.remove();

        if (!combatUI || combatUI.enemyId !== eventId) {
            openFightModal(eventId);
        }

        updateActionAvailability();
        return;
    }

    const existingPanel =
        document.getElementById("encounter-choices");

    if (
        existingPanel &&
        existingPanel.dataset.eventId === eventId
    ) {
        updateActionAvailability();
        return;
    }

    // A non-combat choice panel must not leave the fight modal open.
    el.fightModal.classList.add("hidden");

    existingPanel?.remove();

    const panel = document.createElement("div");

    panel.id = "encounter-choices";
    panel.className = "action-buttons";
    panel.dataset.eventId = eventId;

    const heading = document.createElement("h3");
    heading.textContent = encounter.title;

    panel.appendChild(heading);

    const description = document.createElement("p");

    description.textContent =
        typeof event === "object" && event.description
            ? event.description
            : encounter.description;

    panel.appendChild(description);

    (encounter.choices || []).forEach(([choice, label]) => {
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = label;

        button.addEventListener("click", () => {
            submitEncounterChoice(
                encounter,
                choice,
                panel,
                button
            );
        });

        panel.appendChild(button);
    });

    el.choices.appendChild(panel);

    updateActionAvailability();
}

async function submitEncounterChoice(
    encounter,
    choice,
    panel,
    button
) {
    if (requestInProgress || !isGameActive()) return;

    setBusy(true);
    button.disabled = true;

    try {
        const result = await fetchAPI(
            `/players/${PLAYER_ID}/events/${encounter.endpoint}/choice`,
            {
                method: "POST",
                body: JSON.stringify({ choice })
            }
        );

        panel?.remove();

        if (result.death_scene) {
            lastDeathScene = result.death_scene;
        }

        handleActionResponse(result, "EVENT");

        await refreshGame();

        if (
            result.encounter &&
            isGameActive() &&
            !combatUI
        ) {
            renderEncounter(result.encounter);
        }
    } catch (error) {
        addLog(error.message, "NOTICE");
        button.disabled = false;
    } finally {
        setBusy(false);
    }
}


/* ============================================================
   COMBAT MODAL
============================================================ */

async function openFightModal(eventId) {
    if (!isGameActive()) return;

    // Preserve the current combat log if the same fight is open.
    if (!combatUI || combatUI.enemyId !== eventId) {
        combatUI = {
            enemyId: eventId,
            state: null,
            log: [],
            concluded: null
        };
    }

    const session = combatUI;

    try {
        const state = await fetchAPI(
            `/players/${PLAYER_ID}/combat`
        );

        // Ignore stale responses from a replaced combat session.
        if (combatUI !== session) return;

        if (!state.active) {
            combatUI = null;
            el.fightModal.classList.add("hidden");
            updateActionAvailability();
            return;
        }

        const previous = session.state;

        session.state = state;

        if (!session.log.length) {
            session.log.push({
                type: "info",
                text: `Combat begins against ${state.enemy.name}.`
            });
        }

        el.fightModal.classList.remove("hidden");

        renderCombat(previous);
        updateActionAvailability();
    } catch (error) {
        addLog(error.message, "NOTICE");

        combatUI = null;
        el.fightModal.classList.add("hidden");

        updateActionAvailability();
    }
}

function flashCard(card, className) {
    if (!card) return;

    card.classList.remove("hit", "heal");

    void card.offsetWidth;

    card.classList.add(className);
}

function setCombatBar(fill, ghost, text, value, max) {
    const percent = max > 0
        ? Math.max(0, Math.min(100, (value / max) * 100))
        : 0;

    fill.style.width = `${percent}%`;
    ghost.style.width = `${percent}%`;

    text.textContent = `${value} / ${max}`;
}

function renderCombat(previous = null) {
    const state = combatUI?.state;

    if (!state?.enemy || !state?.player) return;

    const encounter = ENCOUNTERS[combatUI.enemyId];

    el.fightTitle.textContent =
        (encounter?.title || state.enemy.name).toUpperCase();

    el.fightDescription.textContent =
        state.enemy.description || "";

    el.enemyName.textContent = state.enemy.name;

    setCombatBar(
        el.enemyBar,
        el.enemyGhost,
        el.enemyHealthText,
        state.enemy.health,
        state.enemy.max_health
    );

    setCombatBar(
        el.playerBar,
        el.playerGhost,
        el.playerHealthText,
        state.player.health,
        state.player.max_health
    );

    if (previous?.enemy && previous?.player) {
        if (state.enemy.health < previous.enemy.health) {
            flashCard(el.enemyCard, "hit");
        }

        if (state.player.health < previous.player.health) {
            flashCard(el.playerCard, "hit");
        } else if (state.player.health > previous.player.health) {
            flashCard(el.playerCard, "heal");
        }
    }

    renderCombatLog();
    renderFightInventory();
    renderFightActions();
}

function renderCombatLog() {
    el.combatLog.replaceChildren();

    (combatUI?.log || []).forEach(entry => {
        const line = document.createElement("p");

        line.className = `clog-${entry.type || "info"}`;
        line.textContent = entry.text;

        el.combatLog.appendChild(line);
    });

    el.combatLog.scrollTop = el.combatLog.scrollHeight;
}

function renderFightInventory() {
    el.fightInventory.replaceChildren();

    if (!combatUI?.state) return;

    const locked =
        requestInProgress ||
        Boolean(combatUI.concluded);

    const items = combatUI.state.items || [];

    if (!items.length) {
        const message = document.createElement("p");

        message.className = "modal-description";
        message.textContent = "You have no usable supplies.";

        el.fightInventory.appendChild(message);
        return;
    }

    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "fight-item";

        const title = document.createElement("strong");
        title.textContent = `${item.name} x${item.count}`;

        const description = document.createElement("span");
        description.textContent = item.description || "";

        const button = document.createElement("button");

        button.type = "button";
        button.textContent = "Use";
        button.disabled = locked;

        button.addEventListener("click", () => {
            combatAction("use_item", item.id);
        });

        card.append(title, description, button);

        el.fightInventory.appendChild(card);
    });
}

function makeActionButton(label, handler, options = {}) {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.disabled = Boolean(options.disabled);

    if (options.className) {
        button.className = options.className;
    }

    button.addEventListener("click", handler);

    return button;
}

function renderFightActions() {
    el.fightActions.replaceChildren();

    if (!combatUI?.state) return;

    if (combatUI.concluded) {
        el.fightActions.appendChild(
            makeActionButton("Continue", finishCombat, {
                className: "continue-action"
            })
        );

        return;
    }

    const locked = requestInProgress;
    const weapon = combatUI.state.weapon;

    el.fightActions.append(
        makeActionButton(
            `Attack (${weapon?.name || "Weapon"})`,
            () => combatAction("attack"),
            { disabled: locked }
        ),

        makeActionButton(
            "Inspect",
            () => combatAction("inspect"),
            { disabled: locked }
        ),

        makeActionButton(
            "Flee",
            () => combatAction("flee"),
            {
                disabled: locked,
                className: "danger-action"
            }
        )
    );
}


/* ============================================================
   COMBAT ACTIONS
============================================================ */

async function combatAction(action, item = null) {
    if (
        requestInProgress ||
        !combatUI ||
        combatUI.concluded
    ) {
        return;
    }

    setBusy(true);

    renderFightActions();
    renderFightInventory();

    try {
        const result = await fetchAPI(
            `/players/${PLAYER_ID}/combat/action`,
            {
                method: "POST",
                body: JSON.stringify({ action, item })
            }
        );

        // A session may have been cleared while the request was running.
        if (!combatUI) return;

        const previous = combatUI.state;

        if (result.combat) {
            combatUI.state = result.combat;
        }

        (result.combat_log || []).forEach(entry => {
            combatUI.log.push(entry);
        });

        /*
         * Critical pending-death behavior:
         * close combat so the player can end the turn.
         * Do not display the death ending until the backend confirms
         * scenario_status === "dead".
         */
        const deathPending =
            result.result === "death_pending" ||
            result.scenario_status === "death_pending";

        if (deathPending) {
            combatUI = null;

            el.fightModal.classList.add("hidden");

            showPendingDeathWarning(
                "Death is imminent. End your turn to resolve the consequence."
            );
        } else if (
            result.result &&
            result.result !== "ongoing"
        ) {
            combatUI.concluded = result.result;

            logCombatConclusion(result);
        }

        if (combatUI) {
            renderCombat(previous);
        }

        // Reload the authoritative player, inventory and area state.
        await refreshGame();
    } catch (error) {
        if (combatUI) {
            combatUI.log.push({
                type: "notice",
                text: error.message
            });

            renderCombatLog();
        } else {
            addLog(error.message, "NOTICE");
        }
    } finally {
        setBusy(false);

        renderFightActions();
        renderFightInventory();

        updateActionAvailability();
    }
}

function logCombatConclusion(result) {
    const log = result.combat_log || [];
    const last = log[log.length - 1];

    if (
        result.result === "victory" ||
        result.result === "escaped"
    ) {
        if (last?.text) {
            addLog(last.text, "COMBAT");
        }
    } else if (result.result === "defeat") {
        addLog("You have fallen.", "COMBAT");
    }

    if (result.next_objective) {
        addLog(result.next_objective, "OBJECTIVE");
    }
}

async function finishCombat() {
    if (!combatUI || requestInProgress) return;

    combatUI = null;

    el.fightModal.classList.add("hidden");

    setBusy(true);

    try {
        await refreshGame();
    } catch (error) {
        addLog(error.message, "NOTICE");
    } finally {
        setBusy(false);
    }
}


/* ============================================================
   TURN PROGRESSION
============================================================ */

function renderTurnButton() {
    let button = document.getElementById("turn-button");

    if (!button) {
        button = document.createElement("button");

        button.id = "turn-button";
        button.type = "button";
        button.textContent = "End Turn";

        button.addEventListener("click", takeTurn);

        el.turnArea.appendChild(button);
    }

    updateActionAvailability();
}

async function takeTurn() {
    const status = getStatus();

    if (requestInProgress) return;

    // Normal turns and pending-death resolution are both allowed.
    if (status !== "playing" && status !== "death_pending") {
        return;
    }

    setBusy(true);

    try {
        const result = await fetchAPI(
            `/players/${PLAYER_ID}/turn`,
            { method: "POST" }
        );

        if (result.death_scene) {
            lastDeathScene = result.death_scene;
        }

        handleActionResponse(result, "TURN");

        await refreshGame();
    } catch (error) {
        addLog(error.message, "NOTICE");
    } finally {
        setBusy(false);
    }
}


/* ============================================================
   RESPONSE HANDLING
============================================================ */

function handleActionResponse(result, type = "SYSTEM") {
    if (!result || typeof result !== "object") return;

    if (result.message) {
        addLog(result.message, type);
    }

    const pendingDeath =
        result.scenario_status === "death_pending" ||
        result.death_scene_pending ||
        result.pending_death_scene;

    if (pendingDeath) {
        showPendingDeathWarning();
    }

    if (result.ending) {
        addLog(result.ending, "ENDING");
    }

    // Only show the survival ending after backend-confirmed victory.
    if (result.scenario_status === "won") {
        showEnding(
            "YOU SURVIVED",
            result.message ||
                "You escaped the building. The city beyond remains silent.",
            true
        );

        return;
    }

    // Only show the death ending after backend-confirmed death.
    if (result.scenario_status === "dead") {
        if (result.death_scene) {
            lastDeathScene = result.death_scene;
        }

        showEnding(
            "YOU DIED",
            result.death_scene ||
                result.message ||
                lastDeathScene ||
                "Your survival attempt has ended.",
            false
        );
    }
}


/* ============================================================
   TERMINAL STATE
============================================================ */

function renderTerminalState(player) {
    if (player.scenario_status === "won") {
        pendingDeathWarningShown = false;

        showEnding(
            "YOU SURVIVED",
            "You reached the ground-floor exit. The city beyond remains uncertain.",
            true
        );

        return;
    }

    if (player.scenario_status === "dead") {
        pendingDeathWarningShown = false;

        showEnding(
            "YOU DIED",
            player.pending_death_scene ||
                lastDeathScene ||
                "Your survival attempt has ended.",
            false
        );

        return;
    }

    if (player.scenario_status === "death_pending") {
        showPendingDeathWarning();
        updateActionAvailability();

        return;
    }

    // A fresh active state clears any stale pending-death warning.
    pendingDeathWarningShown = false;

    document.getElementById("game-ending")?.remove();

    updateActionAvailability();
}


/* ============================================================
   ENDINGS AND MENU
============================================================ */

function showEnding(title, message, victory) {
    // Endings must never leave the combat modal open.
    el.fightModal.classList.add("hidden");

    closeMovementPanel();

    document.getElementById("encounter-choices")?.remove();
    document.getElementById("pickup-choices")?.remove();

    let panel = document.getElementById("game-ending");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "game-ending";
        el.choices.appendChild(panel);
    }

    panel.replaceChildren();

    panel.className = victory
        ? "ending victory-ending"
        : "ending death-ending";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const description = document.createElement("p");
    description.textContent = message;

    panel.append(heading, description);

    // Group ending actions for consistent spacing and styling.
    const actions = document.createElement("div");
    actions.className = "ending-actions";

    // Start a new run through the backend reset endpoint.
    const replay = document.createElement("button");
    replay.id = "replay-button";
    replay.type = "button";
    replay.className = "ending-button replay-button";
    replay.textContent = "PLAY AGAIN";
    replay.addEventListener("click", startGame);

    // Return to the intro screen without making another API request.
    const menu = document.createElement("button");
    menu.id = "menu-button";
    menu.type = "button";
    menu.className = "ending-button menu-button";
    menu.textContent = "QUIT TO MAIN MENU";

    menu.addEventListener("click", () => {
        combatUI = null;
        currentPlayer = null;
        currentArea = null;
        currentInventory = null;

        lastDeathScene = null;
        pendingDeathWarningShown = false;

        movementPanelOpen = false;
        availableResources = [];

        clearDynamicUI();

        el.eventLog.replaceChildren();

        el.game.classList.add("hidden");
        el.intro.classList.remove("hidden");

        hasStarted = false;

        updateActionAvailability();
    });

    actions.append(replay, menu);
    panel.appendChild(actions);

    updateActionAvailability();
}

function clearDynamicUI() {
    [
        "movement-choices",
        "pickup-choices",
        "encounter-choices",
        "game-ending"
    ].forEach(id => {
        document.getElementById(id)?.remove();
    });

    combatUI = null;
    movementPanelOpen = false;
    availableResources = [];

    el.fightModal.classList.add("hidden");
}


/* ============================================================
   EVENT LISTENERS
============================================================ */

el.play.addEventListener("click", startGame);

el.searchButton.addEventListener("click", searchArea);
el.moveButton.addEventListener("click", moveArea);

el.closeFight.addEventListener("click", () => {
    /*
     * A concluded fight can be dismissed using Continue.
     * An active fight cannot be dismissed to bypass the encounter.
     */
    if (combatUI?.concluded) {
        finishCombat();
        return;
    }

    if (combatUI || currentPlayer?.active_event) {
        addLog(
            "You cannot look away from the threat.",
            "WARNING"
        );

        return;
    }

    el.fightModal.classList.add("hidden");

    updateActionAvailability();
});

el.fightModal.addEventListener("click", event => {
    if (event.target !== el.fightModal) return;

    if (combatUI?.concluded) {
        finishCombat();
    } else if (combatUI || currentPlayer?.active_event) {
        addLog(
            "The threat is still there. Choose your action.",
            "WARNING"
        );
    }
});


/*
 * The intro screen remains visible until Play is pressed.
 * No game state is fetched before the player starts the scenario.
 */
updateActionAvailability();
