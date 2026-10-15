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
 * Combat encounters (combat: true) share one interface. All numbers
 * shown in it come from the backend. Non-combat encounters are simple
 * choice panels.
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
        title: "THE MIMIC",
        description: "The thing reveals its true nature.",
        endpoint: "mimic",
        choices: [
            ["Fight", "Flee"]
        ]
    },
    lurker: {
        title: "THE LURKER",
        description: "Something waits in the darkness.",
        endpoint: "lurker",
        choices: [
            ["flee", "Flee"]
        ]
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

/*
 * Active combat window state. Everything in `state` is the latest
 * snapshot returned by the backend; the frontend never computes damage.
 *   { enemyId, state, log: [], concluded: null | "victory" | ... }
 */
let combatUI = null;

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
        const message = typeof data === "object" && data !== null
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
    if (typeof event === "string") return event;

    return event.id || event.event_id || event.type || event.event || null;
}

function isCombatActive() {
    if (combatUI) return true;

    const eventId = getEventId(currentPlayer?.active_event);
    return Boolean(eventId && ENCOUNTERS[eventId]?.combat);
}

function updateStat(valueElement, barElement, value) {
    const numericValue = Math.max(0, Math.min(100, Number(value) || 0));

    if (valueElement) valueElement.textContent = value ?? 0;
    if (barElement) barElement.style.width = `${numericValue}%`;
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
                use.addEventListener("click", () =>
                    consumeOutsideCombat(itemId)
                );
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
        AREA_NAMES[area.area_id] || area.area || area.name || "Unknown Area";

    el.areaDescription.textContent =
        area.description || "There is nothing more to observe.";

    updateActionAvailability();
}

function updateActionAvailability() {
    const status = getStatus();
    const active = isGameActive() && !requestInProgress;
    const hasEncounter = Boolean(currentPlayer?.active_event);
    const hasModal = !el.fightModal.classList.contains("hidden");

    el.searchButton.disabled =
        !active || hasEncounter || hasModal ||
        !currentArea || !currentArea.searchable;

    el.moveButton.disabled =
        !active || hasEncounter || hasModal ||
        !currentArea || !Array.isArray(currentArea.connections) ||
        currentArea.connections.length === 0;

    document.querySelectorAll(".inv-use").forEach(button => {
        button.disabled = !active || hasEncounter || hasModal;
    });

    const turnButton = document.getElementById("turn-button");

    if (turnButton) {
        const gameOver = status === "dead" || status === "won";

        // Hidden during movement selection, combat and endings.
        el.turnArea.classList.toggle(
            "hidden",
            movementPanelOpen || isCombatActive() || gameOver
        );

        const normalTurn =
            active && !hasEncounter && !hasModal && !movementPanelOpen;

        // A pending death is resolved by advancing the turn.
        const resolvePendingDeath =
            status === "death_pending" && !requestInProgress && !hasModal;

        turnButton.disabled = !(normalTurn || resolvePendingDeath);
    }
}

function setBusy(value) {
    requestInProgress = value;
    updateActionAvailability();
}

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

    if (eventId && isGameActive()) {
        renderEncounter(eventId);
    } else if (!eventId) {
        closeEncounterUI();
    }
}

/* INTRO */

async function startGame() {
    if (requestInProgress) return;

    setBusy(true);

    try {
        // Reset ensures every playthrough starts from the initial state.
        const result = await fetchAPI(`/players/${PLAYER_ID}/reset`, {
            method: "POST"
        });

        hasStarted = true;
        lastDeathScene = null;
        combatUI = null;
        currentPlayer = null;

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

/* SEARCH */

async function searchArea() {
    if (!isGameActive() || requestInProgress) return;

    setBusy(true);

    try {
        const result = await fetchAPI(
            `/players/${PLAYER_ID}/area/search`,
            { method: "POST" }
        );

        availableResources = [...(result.resources_found || [])];

        addLog(result.message || "You search the area.", "SEARCH");

        if (availableResources.length) {
            addLog(
                `Resources found: ${availableResources
                    .map(id => ITEM_NAMES[id] || id).join(", ")}.`,
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
    ) return;

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

                addLog(result.message || `Picked up ${itemId}.`, "INVENTORY");
                availableResources = [...(result.remaining_resources || [])];

                await refreshGame();
                renderPickupChoices();

                if (result.encounter) {
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

/* USING SUPPLIES OUTSIDE COMBAT */

async function consumeOutsideCombat(itemId) {
    if (requestInProgress || !isGameActive() || currentPlayer?.active_event) {
        return;
    }

    setBusy(true);

    try {
        const result = await fetchAPI(`/players/${PLAYER_ID}/consume`, {
            method: "POST",
            body: JSON.stringify({ item: itemId })
        });

        addLog(result.message, "INVENTORY");
        await refreshGame();
    } catch (error) {
        addLog(error.message, "NOTICE");
    } finally {
        setBusy(false);
    }
}

/* MOVEMENT */

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

                addLog(result.message || "You move to another area.", "MOVEMENT");

                await refreshGame();

                if (result.encounter) {
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

/* ENCOUNTERS (NON-COMBAT) */

function closeEncounterUI() {
    document.getElementById("encounter-choices")?.remove();

    // A combat window that is still showing its outcome stays open.
    if (!combatUI) {
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
        return;
    }

    if (encounter.combat) {
        openFightModal(eventId);
        return;
    }

    el.fightModal.classList.add("hidden");

    document.getElementById("encounter-choices")?.remove();

    const panel = document.createElement("div");
    panel.id = "encounter-choices";
    panel.className = "action-buttons";

    const heading = document.createElement("h3");
    heading.textContent = encounter.title;
    panel.appendChild(heading);

    const description = document.createElement("p");
    description.textContent =
        typeof event === "object" && event.description
            ? event.description
            : encounter.description;

    panel.appendChild(description);

    encounter.choices.forEach(([choice, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;

        button.addEventListener("click", () =>
            submitEncounterChoice(encounter, choice, panel, button)
        );

        panel.appendChild(button);
    });

    el.choices.appendChild(panel);
    updateActionAvailability();
}

async function submitEncounterChoice(encounter, choice, panel, button) {
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

        if (result.death_scene) lastDeathScene = result.death_scene;

        handleActionResponse(result, "EVENT");
        await refreshGame();

        if (result.encounter) {
            renderEncounter(result.encounter);
        }
    } catch (error) {
        addLog(error.message, "NOTICE");
        button.disabled = false;
    } finally {
        setBusy(false);
    }
}

/* COMBAT WINDOW */

async function openFightModal(eventId) {
    // Same fight already showing: keep its log, just resync.
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
        const state = await fetchAPI(`/players/${PLAYER_ID}/combat`);

        if (combatUI !== session) return;

        if (!state.active) {
            combatUI = null;
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
    }
}

function flashCard(card, className) {
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
    if (!state) return;

    const encounter = ENCOUNTERS[combatUI.enemyId];

    el.fightTitle.textContent =
        (encounter?.title || state.enemy.name).toUpperCase();
    el.fightDescription.textContent = state.enemy.description;

    el.enemyName.textContent = state.enemy.name;

    setCombatBar(
        el.enemyBar, el.enemyGhost, el.enemyHealthText,
        state.enemy.health, state.enemy.max_health
    );

    setCombatBar(
        el.playerBar, el.playerGhost, el.playerHealthText,
        state.player.health, state.player.max_health
    );

    if (previous) {
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

    const locked = requestInProgress || Boolean(combatUI.concluded);
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
        description.textContent = item.description;

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Use";
        button.disabled = locked;

        button.addEventListener("click", () =>
            combatAction("use_item", item.id)
        );

        card.append(title, description, button);
        el.fightInventory.appendChild(card);
    });
}

function makeActionButton(label, handler, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = Boolean(options.disabled);

    if (options.className) button.className = options.className;

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
            `Attack (${weapon.name})`,
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
            { disabled: locked, className: "danger-action" }
        )
    );
}

async function combatAction(action, item = null) {
    if (requestInProgress || !combatUI || combatUI.concluded) return;

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

        const previous = combatUI.state;

        combatUI.state = result.combat;
        (result.combat_log || []).forEach(entry => combatUI.log.push(entry));

        if (result.death_scene) lastDeathScene = result.death_scene;

        if (result.result && result.result !== "ongoing") {
            combatUI.concluded = result.result;
            logCombatConclusion(result);
        }

        renderCombat(previous);

        // Sidebar bars, hunger and inventory follow the backend too.
        await refreshPlayerOnly();
    } catch (error) {
        combatUI.log.push({ type: "notice", text: error.message });
        renderCombatLog();
    } finally {
        setBusy(false);
        renderFightActions();
        renderFightInventory();
    }
}

function logCombatConclusion(result) {
    const log = result.combat_log || [];
    const last = log[log.length - 1];

    if (result.result === "victory" || result.result === "escaped") {
        addLog(last?.text, "COMBAT");
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

/* TURN PROGRESSION */

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
    if (status !== "playing" && status !== "death_pending") return;

    setBusy(true);

    try {
        const result = await fetchAPI(`/players/${PLAYER_ID}/turn`, {
            method: "POST"
        });

        if (result.death_scene) lastDeathScene = result.death_scene;

        handleActionResponse(result, "TURN");
        await refreshGame();
    } catch (error) {
        addLog(error.message, "NOTICE");
    } finally {
        setBusy(false);
    }
}

/* RESPONSE HANDLING AND ENDINGS */

function handleActionResponse(result, type = "SYSTEM") {
    if (!result || typeof result !== "object") return;

    if (result.message) addLog(result.message, type);

    if (result.death_scene_pending || result.pending_death_scene) {
        addLog(
            "A fatal consequence is pending. Advance the turn to resolve it.",
            "WARNING"
        );
    }

    if (result.ending) addLog(result.ending, "ENDING");

    if (result.scenario_status === "won") {
        showEnding(
            "YOU SURVIVED",
            result.message ||
                "You escaped the building. The city beyond remains silent.",
            true
        );
    } else if (
        result.scenario_status === "dead" ||
        result.death_scene
    ) {
        showEnding(
            "YOU DIED",
            result.death_scene || result.message ||
                "Your survival attempt has ended.",
            false
        );
    }
}

function renderTerminalState(player) {
    if (player.scenario_status === "won") {
        showEnding(
            "YOU SURVIVED",
            "You reached the ground-floor exit. The city beyond remains uncertain.",
            true
        );
    } else if (player.scenario_status === "dead") {
        showEnding(
            "YOU DIED",
            player.pending_death_scene ||
                lastDeathScene ||
                "Your survival attempt has ended.",
            false
        );
    } else if (player.scenario_status === "death_pending") {
        addLog(
            "Death is imminent. Advance the turn to resolve the pending scene.",
            "WARNING"
        );
    } else {
        document.getElementById("game-ending")?.remove();
        updateActionAvailability();
    }
}

function showEnding(title, message, victory) {
    // A combat window still showing its outcome closes via Continue.
    if (!combatUI) {
        el.fightModal.classList.add("hidden");
    }

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

    const heading = document.createElement("h3");
    heading.textContent = title;

    const description = document.createElement("p");
    description.textContent = message;

    panel.append(heading, description);

    const replay = document.createElement("button");
    replay.id = "replay-button";
    replay.type = "button";
    replay.textContent = "Play Again";
    replay.addEventListener("click", startGame);
    panel.appendChild(replay);

    updateActionAvailability();
}

function clearDynamicUI() {
    [
        "movement-choices",
        "pickup-choices",
        "encounter-choices",
        "game-ending"
    ].forEach(id => document.getElementById(id)?.remove());

    combatUI = null;
    el.fightModal.classList.add("hidden");
    movementPanelOpen = false;
    availableResources = [];
}

/* EVENT LISTENERS */

el.play.addEventListener("click", startGame);
el.searchButton.addEventListener("click", searchArea);
el.moveButton.addEventListener("click", moveArea);

el.closeFight.addEventListener("click", () => {
    /*
     * A fight cannot be dismissed to bypass it. Once it has ended, the
     * close button acts like Continue.
     */
    if (combatUI?.concluded) {
        finishCombat();
        return;
    }

    if (combatUI || currentPlayer?.active_event) {
        addLog("You cannot look away from the threat.", "WARNING");
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
        addLog("The threat is still there. Choose your action.", "WARNING");
    }
});

/*
 * The intro remains visible until Play is pressed.
 * No game state is fetched or displayed before the player starts.
 */
updateActionAvailability();