const API_BASE = "http://127.0.0.1:8000";
const PLAYER_ID = "player_01";

const ITEM_NAMES = {
    food: "Food",
    drinks: "Drinks",
    backpack: "Backpack",
    baseball_bat: "Baseball Bat"
};

const ITEM_DETAILS = {
    food: "Restores health, reduces hunger.",
    drinks: "A small boost when supplies are scarce.",
    backpack: "Equipment for carrying supplies.",
    baseball_bat: "A melee weapon for close encounters."
};

const AREA_NAMES = {
    apartment_01: "Abandoned Apartment",
    hallway_01: "Apartment Hallway",
    stairwell_01: "Stairwell",
    building_exit: "Ground-Floor Exit"
};

const ENCOUNTERS = {
    hollow: {
        title: "THE HOLLOW",
        description: "Something once human blocks your path.",
        endpoint: "hollow",
        combat: true,
        choices: [
            ["fight", "Fight"],
            ["flee", "Flee"]
        ]
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
            ["flee", "Flee"]
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
        title: "THE SCRAPER",
        description: "A creature emerges from the darkness.",
        endpoint: "stairwell_creature",
        combat: true,
        choices: [
            ["fight", "Fight"],
            ["flee", "Flee"]
        ]
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
    fightModal: document.getElementById("fight-modal"),
    fightTitle: document.getElementById("fight-title"),
    fightDescription: document.getElementById("fight-description"),
    fightInventory: document.getElementById("fight-inventory"),
    fightActions: document.getElementById("fight-actions"),
    closeFight: document.getElementById("close-fight-modal")
};

let currentArea = null;
let currentPlayer = null;
let currentInventory = null;
let availableResources = [];
let requestInProgress = false;
let currentEncounter = null;
let movementPanelOpen = false;
let hasStarted = false;

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

        throw new Error(message || `Request failed: ${response.status}`);
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
            li.textContent = ITEM_NAMES[itemId] || itemId;
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
        AREA_NAMES[area.area] || area.name || area.area || "Unknown Area";

    el.areaDescription.textContent =
        area.description || "There is nothing more to observe.";

    updateActionAvailability();
}

function updateActionAvailability() {
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

    const turnButton = document.getElementById("turn-button");

    if (turnButton) {
        turnButton.classList.toggle("hidden", movementPanelOpen);
        turnButton.disabled =
            !active || hasEncounter || hasModal || movementPanelOpen;
    }
}

function setBusy(value) {
    requestInProgress = value;
    updateActionAvailability();
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

function getEventId(event) {
    if (!event) return null;
    if (typeof event === "string") return event;

    return event.id || event.event_id || event.type || event.event || null;
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

                if (result.scenario_status === "won") {
                    renderTerminalState({
                        ...currentPlayer,
                        scenario_status: "won"
                    });
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

/* ENCOUNTERS */

function closeEncounterUI() {
    document.getElementById("encounter-choices")?.remove();
    el.fightModal.classList.add("hidden");
    currentEncounter = null;
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

    currentEncounter = { ...encounter, id: eventId };

    if (encounter.combat) {
        openFightModal(event, encounter);
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

function openFightModal(event, encounter) {
    currentEncounter = { ...encounter, id: encounter.id || getEventId(event) };

    el.fightTitle.textContent = encounter.title;
    el.fightDescription.textContent =
        typeof event === "object" && event.description
            ? event.description
            : encounter.description;

    renderFightInventory(encounter);
    renderFightActions(encounter);

    el.fightModal.classList.remove("hidden");
    updateActionAvailability();
}

function renderFightInventory(encounter) {
    el.fightInventory.replaceChildren();

    const inventory = currentInventory?.inventory || [];
    const usableItems = inventory.filter(item =>
        ["baseball_bat", "food", "drinks"].includes(item)
    );

    if (!usableItems.length) {
        const message = document.createElement("p");
        message.className = "modal-description";
        message.textContent = "You have no usable supplies.";
        el.fightInventory.appendChild(message);
        return;
    }

    usableItems.forEach(itemId => {
        const card = document.createElement("div");
        card.className = "fight-item";

        const title = document.createElement("strong");
        title.textContent = ITEM_NAMES[itemId] || itemId;

        const description = document.createElement("span");
        description.textContent = ITEM_DETAILS[itemId] || "An item in your inventory.";

        const button = document.createElement("button");
        button.type = "button";

        if (itemId === "baseball_bat") {
            button.textContent = "Use Weapon";
            button.addEventListener("click", () => {
                submitEncounterChoice(
                    encounter,
                    "fight",
                    null,
                    button,
                    true
                );
            });
        } else {
            button.textContent = itemId === "food" ? "Consume Food" : "Drink";

            button.addEventListener("click", () =>
                consumeDuringEncounter(itemId, button)
            );
        }

        card.append(title, description, button);
        el.fightInventory.appendChild(card);
    });
}

function renderFightActions(encounter) {
    el.fightActions.replaceChildren();

    encounter.choices.forEach(([choice, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;

        button.addEventListener("click", () => {
            submitEncounterChoice(encounter, choice, null, button, true);
        });

        el.fightActions.appendChild(button);
    });
}

async function consumeDuringEncounter(itemId, button) {
    if (requestInProgress || !isGameActive()) return;

    setBusy(true);
    button.disabled = true;

    try {
        const result = await fetchAPI(`/players/${PLAYER_ID}/consume`, {
            method: "POST",
            body: JSON.stringify({ item: itemId })
        });

        el.fightModal.classList.add("hidden");

        addLog(
            result.message ||
                (itemId === "food"
                    ? "You consume your food."
                    : "You take a drink."),
            "INVENTORY"
        );

        /*
         * Food consumed during the Hollow encounter queues a death scene
         * in the backend. The backend should resolve it on the next turn,
         * not instantly when food is consumed.
         */
        if (result.scenario_status === "death_pending" ||
            result.pending_death_scene ||
            result.death_scene_pending) {
            addLog(
                "You have left yourself exposed. Advance the turn to face the consequences.",
                "WARNING"
            );
        }

        await refreshGame();
    } catch (error) {
        addLog(error.message, "NOTICE");
        button.disabled = false;
    } finally {
        setBusy(false);
    }
}

async function submitEncounterChoice(
    encounter,
    choice,
    panel,
    button,
    fromModal = false
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

        if (fromModal) {
            el.fightModal.classList.add("hidden");
        }

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

/* TURN PROGRESSION */

function renderTurnButton() {
    let button = document.getElementById("turn-button");

    if (!button) {
        button = document.createElement("button");
        button.id = "turn-button";
        button.type = "button";
        button.textContent = "End Turn";
        button.addEventListener("click", takeTurn);
        el.choices.appendChild(button);
    }

    button.classList.toggle("hidden", movementPanelOpen);

    button.disabled =
        !isGameActive() ||
        requestInProgress ||
        Boolean(currentPlayer?.active_event) ||
        !el.fightModal.classList.contains("hidden") ||
        movementPanelOpen;
}

async function takeTurn() {
    if (!isGameActive() || requestInProgress) return;

    setBusy(true);

    try {
        const result = await fetchAPI(`/players/${PLAYER_ID}/turn`, {
            method: "POST"
        });

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

    if (result.pending_death_scene) {
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

    const heading = document.createElement("h3");
    heading.textContent = title;

    const description = document.createElement("p");
    description.textContent = message;

    panel.append(heading, description);

    let replay = document.getElementById("replay-button");

    if (!replay) {
        replay = document.createElement("button");
        replay.id = "replay-button";
        replay.type = "button";
        replay.textContent = "Play Again";
        replay.addEventListener("click", startGame);
        panel.appendChild(replay);
    }

    updateActionAvailability();
}

function clearDynamicUI() {
    [
        "movement-choices",
        "pickup-choices",
        "encounter-choices",
        "game-ending"
    ].forEach(id => document.getElementById(id)?.remove());

    el.fightModal.classList.add("hidden");
    movementPanelOpen = false;
    currentEncounter = null;
}

/* EVENT LISTENERS */

el.play.addEventListener("click", startGame);
el.searchButton.addEventListener("click", searchArea);
el.moveButton.addEventListener("click", moveArea);

el.closeFight.addEventListener("click", () => {
    /*
     * Do not allow a combat encounter to be dismissed to bypass it.
     * The player must choose an action.
     */
    if (currentPlayer?.active_event) {
        addLog("You cannot look away from the threat.", "WARNING");
        return;
    }

    el.fightModal.classList.add("hidden");
    updateActionAvailability();
});

el.fightModal.addEventListener("click", event => {
    if (event.target === el.fightModal && currentPlayer?.active_event) {
        addLog("The threat is still there. Choose your action.", "WARNING");
    }
});

/*
 * The intro remains visible until Play is pressed.
 * No game state is fetched or displayed before the player starts.
 */
updateActionAvailability();