import copy
import json
import random
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="Undead Resonance",
    description="A survival-horror simulation prototype",
    version="0.6.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://hussainazzam100-ctrl.github.io/undead_resonance/",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# SCENARIO
# ============================================================

SCENARIO = {
    "id": "the_last_descent",
    "title": "The Last Descent",
    "description": (
        "You wake up alone in an abandoned apartment. "
        "The city has fallen silent, the power is failing, "
        "and something is moving through the building. "
        "Reach the ground-floor exit alive."
    ),
    "starting_location": "residential_district",
    "starting_area": "apartment_01",
    "objective": "Reach the ground-floor exit alive.",
    "exit_area": "building_exit",
    "win_condition": {
        "type": "reach_area",
        "area_id": "building_exit",
    },
}


# ============================================================
# JSON DATA
# ============================================================

DATA_DIR = Path(__file__).resolve().parent / "data"


def load_json(path: Path):
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Required game data file missing: {path}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Invalid JSON in game data file: {path}"
        ) from exc


locations = load_json(DATA_DIR / "locations.json")
district_data = load_json(
    DATA_DIR / "areas" / "residential_district.json"
)

residential_district = district_data
areas = residential_district["areas"]

INITIAL_LOCATIONS = copy.deepcopy(locations)
INITIAL_AREAS = copy.deepcopy(areas)


# ============================================================
# ITEMS
# ============================================================

items = {
    "food": {"type": "consumable", "weight": 1},
    "drinks": {"type": "consumable", "weight": 1},
    "backpack": {"type": "equipment", "weight": 2},
    "baseball_bat": {"type": "weapon", "weight": 2},
}

WEAPONS = {
    "baseball_bat": {
        "name": "Baseball Bat",
        "min": 25,
        "max": 30,
    },
}

FISTS = {
    "name": "Bare Hands",
    "min": 6,
    "max": 8,
}

CONSUMABLES = {
    "food": {
        "name": "Food",
        "heal": 20,
        "hunger": 25,
        "description": "Restores 20 health and reduces hunger.",
        "message": "You eat some food.",
    },
    "drinks": {
        "name": "Drinks",
        "heal": 10,
        "hunger": 25,
        "description": "Restores 10 health and reduces hunger.",
        "message": "You drink something.",
    },
}

CRIT_CHANCE = 0.10
CRIT_MULTIPLIER = 1.5


# ============================================================
# DEATH SCENES AND ENDING
# ============================================================

HOLLOW_DEATH_SCENE = (
    "The Hollow's elongated limbs unfold with sickening speed. "
    "You try to raise your arms, but your strength is gone.\n\n"
    "It is already upon you.\n\n"
    "The end comes slowly, each desperate struggle buying you "
    "nothing but another moment of terror. The Hollow does not "
    "hurry. It knows you cannot escape.\n\n"
    "And then, the darkness takes you."
)

HOLLOW_FOOD_DEATH_SCENE = (
    "While munching, the Hollow takes advantage of the situation "
    "and lunges towards you. The end is slow yet inevitable."
)

LURKER_DEATH_SCENE = (
    "You turn and run. Your footsteps thunder through the apartment, "
    "but another sound rises behind you: wet, uneven breathing.\n\n"
    "Something lunges from the darkness ahead. You never make it out."
)

MIMIC_DEATH_SCENE = (
    "You sprint down the hallway. The footsteps behind you grow "
    "closer, impossibly fast.\n\n"
    "A hand closes around your shoulder. You feel its breath "
    "against your ear.\n\n"
    "The smile is the last thing you see."
)

STAIRWELL_DEATH_SCENE = (
    "The creature below moves with sudden, horrible speed. You "
    "stumble against the railing as its shadow climbs over you.\n\n"
    "The emergency light flickers once, then goes dark."
)

STARVATION_DEATH_SCENE = (
    "Your legs finally give way. Hunger and exhaustion have taken "
    "everything you had left.\n\n"
    "The city remains silent as you slip permanently into slumber."
)

SURVIVAL_ENDING = (
    "You force your way through the battered exit door and stumble "
    "into the cold night air.\n\n"
    "Behind you, the building stands silent. For the first time "
    "in hours, nothing follows you.\n\n"
    "You have escaped the building. The streets beyond offer no "
    "promise of safety, but for now, you are alive.\n\n"
    "THE LAST DESCENT — COMPLETE."
)


# ============================================================
# ENEMIES
# ============================================================

ENEMIES = {
    "hollow": {
        "name": "The Hollow",
        "description": (
            "An emaciated figure with elongated limbs watches you "
            "from the darkness. Its movements are disturbingly slow "
            "until it decides to strike."
        ),
        "inspect_text": (
            "The Hollow's thin frame conceals a terrifying grip. "
            "It watches every movement and waits for an opening."
        ),
        "max_health": 80,
        "damage": (20, 25),
        "player_miss_chance": 0.10,
        "hit_chance": 0.90,
        "flee_chance": 0.35,
        "attack_texts": [
            "The Hollow claws at your shoulder.",
            "The Hollow lunges forward and tears at your arm.",
        ],
        "miss_texts": [
            "The Hollow's fingers scrape the wall beside you.",
            "You twist away from the Hollow's grasp.",
        ],
        "victory_text": (
            "The Hollow crumples to the floor. Its limbs twitch "
            "once before the apartment falls silent."
        ),
        "flee_fail_text": (
            "You turn to run, but the Hollow is already reaching for you."
        ),
        "escape_text": "You escape the Hollow's immediate reach.",
        "death_scene": HOLLOW_DEATH_SCENE,
    },
    "stairwell_creature": {
        "name": "The Lurker",
        "description": (
            "A hunched creature drags its fingers along the concrete. "
            "It turns toward you beneath the flickering emergency light."
        ),
        "inspect_text": (
            "A vicious creature that moves with terrifying speed. "
            "Its claws can tear through flesh, and the stairs leave "
            "you with very little room to escape."
        ),
        "max_health": 100,
        "damage": (20, 25),
        "player_miss_chance": 0.20,
        "hit_chance": 0.90,
        "flee_chance": 0.35,
        "attack_texts": [
            "The Lurker rakes its claws across you.",
            "The Lurker slams into you, driving you against the rail.",
        ],
        "miss_texts": [
            "The Lurker lashes out, its claws scraping against concrete.",
            "You duck as the Lurker's hand whips past your head.",
        ],
        "victory_text": (
            "Your final blow sends the Lurker tumbling down the steps. "
            "The scraping finally stops. Below, a battered door leads "
            "to the ground floor. The exit is within reach."
        ),
        "flee_fail_text": (
            "You turn to run, but the Lurker closes the distance."
        ),
        "escape_text": "You escape the Lurker's immediate reach.",
        "death_scene": STAIRWELL_DEATH_SCENE,
    },
    "mimic": {
        "name": "The Mimic",
        "description": (
            "Its smile stretches beyond what a human face should allow. "
            "It advances with a horrible, deliberate certainty."
        ),
        "inspect_text": (
            "The Mimic imitates human behaviour, but its movements "
            "are unnaturally precise. Its strength is considerable, "
            "and its endurance makes it dangerous in a prolonged fight."
        ),
        "max_health": 100,
        "damage": (20, 30),
        "player_miss_chance": 0.20,
        "hit_chance": 0.85,
        "flee_chance": 0.35,
        "attack_texts": [
            "The Mimic lunges, its jaw opening far wider than it should.",
            "The Mimic slams into you with unnatural strength.",
        ],
        "miss_texts": [
            "The Mimic's claws tear through empty air.",
            "You evade the Mimic's lunge by inches.",
        ],
        "victory_text": (
            "The Mimic collapses. Its unnatural smile finally disappears "
            "as the hallway falls silent."
        ),
        "flee_fail_text": (
            "You turn to run, but the Mimic closes the distance."
        ),
        "escape_text": (
            "You escape the Mimic's immediate reach. Somewhere behind "
            "you, its footsteps begin again."
        ),
        "death_scene": MIMIC_DEATH_SCENE,
    },
}

# Backward-compatible enemy ID used by hallway encounters.
ENEMIES["lurker"] = copy.deepcopy(ENEMIES["stairwell_creature"])
ENEMIES["lurker"]["name"] = "The Lurker"


# ============================================================
# REQUEST MODELS
# ============================================================

class MoveRequest(BaseModel):
    destination: str


class AreaMoveRequest(BaseModel):
    destination: str


class PickupRequest(BaseModel):
    item: str


class AreaPickupRequest(BaseModel):
    item: str


class EventChoiceRequest(BaseModel):
    choice: str


class CombatActionRequest(BaseModel):
    action: str
    item: Optional[str] = None


# ============================================================
# INITIAL PLAYER STATE
# ============================================================

INITIAL_PLAYER_STATE = {
    "name": "Player One",
    "current_location": SCENARIO["starting_location"],
    "current_area": SCENARIO["starting_area"],
    "searched_areas": [],
    "health": 100,
    "max_health": 100,
    "infection": 0,
    "hunger": 50,
    "inventory": ["food", "baseball_bat"],
    "inventory_capacity": 5,
    "weapon": "baseball_bat",
    "scenario_id": SCENARIO["id"],
    "scenario_status": "playing",
    "turn": 0,
    "active_event": None,
    "triggered_events": [],
    "resolved_events": [],
    "combat": None,
    "enemy_health": {},
    "exit_unlocked": False,
    "pending_death_scene": None,
    "pending_death_event": None,
}

players = {
    "player_01": copy.deepcopy(INITIAL_PLAYER_STATE)
}


# ============================================================
# SHARED HELPERS
# ============================================================

def get_player(player_id: str):
    player = players.get(player_id)

    if player is None:
        raise HTTPException(404, "Player not found")

    return player


def require_playing(player):
    if player["scenario_status"] != "playing":
        raise HTTPException(
            400,
            "This run has ended or is awaiting its death scene. "
            "Use the turn endpoint to resolve a pending death, "
            "or reset the player to start again.",
        )


def get_area(area_id: str):
    return next(
        (area for area in areas if area["id"] == area_id),
        None,
    )


def get_location(location_id: str):
    return next(
        (location for location in locations
         if location["id"] == location_id),
        None,
    )


def get_connections(player, area):
    connections = list(area.get("connections", []))
    exit_id = SCENARIO["exit_area"]

    # Never expose the exit while locked, even if it is present
    # in the JSON connection list.
    if area["id"] == "stairwell_01":
        if player["exit_unlocked"]:
            if exit_id not in connections:
                connections.append(exit_id)
        else:
            connections = [
                connection for connection in connections
                if connection != exit_id
            ]

    return connections


def trigger_event(player, event_id: str):
    if event_id not in player["triggered_events"]:
        player["triggered_events"].append(event_id)


def resolve_event(player, event_id: Optional[str]):
    if event_id and event_id not in player["resolved_events"]:
        player["resolved_events"].append(event_id)


def make_encounter(event_id, name, description, choices):
    return {
        "id": event_id,
        "name": name,
        "description": description,
        "choices": choices,
    }


def begin_death(player, scene: str, event_id: str):
    player["pending_death_scene"] = scene
    player["pending_death_event"] = event_id
    player["scenario_status"] = "death_pending"


def death_response(player, scene: str):
    player["scenario_status"] = "dead"
    player["pending_death_scene"] = None
    player["pending_death_event"] = None
    player["active_event"] = None
    player["combat"] = None
    player["health"] = 0

    return {
        "message": scene,
        "event": "death_scene",
        "death_scene": scene,
        "scenario_status": "dead",
        "show_replay": True,
    }


def win_scenario(player):
    player["scenario_status"] = "won"
    player["active_event"] = None
    player["combat"] = None
    player["current_area"] = SCENARIO["exit_area"]

    return {
        "message": SURVIVAL_ENDING,
        "ending": SURVIVAL_ENDING,
        "event": "scenario_complete",
        "scenario_id": SCENARIO["id"],
        "scenario_status": "won",
        "current_area": SCENARIO["exit_area"],
        "show_replay": True,
        "show_survival_ending": True,
    }


def build_area_response(player, area, message=None, encounter=None):
    return {
        "message": message or f"You are at {area['name']}.",
        "current_area": area["id"],
        "area_id": area["id"],
        "area_name": area["name"],
        "area": area["name"],
        "description": area.get("description", ""),
        "connections": get_connections(player, area),
        "searchable": area.get("searchable", False),
        "resources": area.get("resources", []),
        "encounter": encounter,
        "scenario_status": player["scenario_status"],
    }


def log_event(kind: str, text: str, amount: Optional[int] = None):
    return {"type": kind, "text": text, "amount": amount}


# ============================================================
# COMBAT ENGINE
# ============================================================

def get_equipped_weapon(player):
    weapon_id = player.get("weapon")

    if weapon_id in WEAPONS and weapon_id in player["inventory"]:
        return weapon_id, WEAPONS[weapon_id]

    return None, FISTS


def start_combat(player, enemy_id: str):
    if enemy_id not in ENEMIES:
        raise HTTPException(500, f"Unknown enemy: {enemy_id}")

    if player.get("combat"):
        raise HTTPException(400, "Combat is already active")

    enemy = ENEMIES[enemy_id]
    player["enemy_health"].setdefault(enemy_id, enemy["max_health"])

    if player["enemy_health"][enemy_id] <= 0:
        raise HTTPException(400, "This enemy has already been defeated")

    player["combat"] = {
        "enemy": enemy_id,
        "inspect_count": 0,
    }
    player["active_event"] = enemy_id
    trigger_event(player, enemy_id)


def combat_snapshot(player, enemy_id: str, active: bool = True):
    enemy = ENEMIES[enemy_id]
    weapon_id, weapon = get_equipped_weapon(player)

    usable_items = []

    for item_id, info in CONSUMABLES.items():
        count = player["inventory"].count(item_id)

        if count:
            usable_items.append({
                "id": item_id,
                "name": info["name"],
                "count": count,
                "description": info["description"],
            })

    return {
        "active": active,
        "enemy": {
            "id": enemy_id,
            "name": enemy["name"],
            "description": enemy["description"],
            "health": player["enemy_health"].get(
                enemy_id, enemy["max_health"]
            ),
            "max_health": enemy["max_health"],
        },
        "player": {
            "health": player["health"],
            "max_health": player["max_health"],
            "hunger": player["hunger"],
            "infection": player["infection"],
        },
        "weapon": {
            "id": weapon_id,
            "name": weapon["name"],
            "min": weapon["min"],
            "max": weapon["max"],
        },
        "items": usable_items,
    }


def enemy_retaliate(player, enemy_id: str, events: list):
    enemy = ENEMIES[enemy_id]

    if random.random() < enemy["hit_chance"]:
        damage = random.randint(*enemy["damage"])
        player["health"] = max(0, player["health"] - damage)

        events.append(log_event(
            "enemy_attack",
            f"{random.choice(enemy['attack_texts'])} "
            f"You take {damage} damage.",
            damage,
        ))
    else:
        events.append(log_event(
            "enemy_miss",
            random.choice(enemy["miss_texts"]),
        ))


def apply_defeat(player, enemy_id: str, events: list):
    scene = ENEMIES[enemy_id]["death_scene"]

    player["health"] = 0
    player["scenario_status"] = "dead"
    player["active_event"] = None
    player["combat"] = None
    player["pending_death_scene"] = None
    player["pending_death_event"] = None

    resolve_event(player, enemy_id)
    events.append(log_event("defeat", scene))

    return {
        "death_scene": scene,
        "show_replay": True,
        "scenario_status": "dead",
    }


def apply_victory(player, enemy_id: str, events: list):
    enemy = ENEMIES[enemy_id]

    player["enemy_health"][enemy_id] = 0
    player["active_event"] = None
    player["combat"] = None

    resolve_event(player, enemy_id)

    # The stairwell Lurker and hallway Lurker are separate encounters.
    events.append(log_event("victory", enemy["victory_text"]))

    extra = {"enemy_defeated": True}

    if enemy_id == "stairwell_creature":
        player["exit_unlocked"] = True
        resolve_event(player, "stairwell")
        extra["next_objective"] = (
            "Move to the Ground-Floor Exit to complete the scenario."
        )

    return extra


def apply_escape(player, enemy_id: str, events: list):
    enemy = ENEMIES[enemy_id]

    player["enemy_health"][enemy_id] = enemy["max_health"]
    player["active_event"] = None
    player["combat"] = None

    if enemy_id in ("stairwell_creature", "lurker"):
        player["current_area"] = "hallway_01"

        for event_id in ("stairwell", "stairwell_creature", "lurker"):
            if event_id in player["triggered_events"]:
                player["triggered_events"].remove(event_id)

    events.append(log_event(
        "escape",
        enemy["escape_text"]
        + " The creature is no longer wounded when you encounter it again.",
    ))


def resolve_combat_action(
    player,
    action: str,
    item: Optional[str],
):
    combat = player.get("combat")

    if not combat:
        raise HTTPException(400, "You are not in combat")

    enemy_id = combat["enemy"]
    enemy = ENEMIES[enemy_id]
    events = []
    result = "ongoing"
    extra = {}

    if action == "inspect":
        hp = player["enemy_health"][enemy_id]
        count = combat.get("inspect_count", 0)
        combat["inspect_count"] = count + 1

        events.append(log_event(
            "info",
            f"{enemy['inspect_text']} "
            f"({hp}/{enemy['max_health']} health, strikes for "
            f"{enemy['damage'][0]}-{enemy['damage'][1]} damage.)",
        ))

        if count >= 1:
            events.append(log_event(
                "info",
                "You take too long studying the creature. "
                "It uses the opening to attack.",
            ))
            enemy_retaliate(player, enemy_id, events)

    elif action == "attack":
        _, weapon = get_equipped_weapon(player)

        if random.random() >= enemy.get("player_miss_chance", 0.10):
            damage = random.randint(weapon["min"], weapon["max"])
            critical = random.random() < CRIT_CHANCE

            if critical:
                damage = int(damage * CRIT_MULTIPLIER)

            player["enemy_health"][enemy_id] = max(
                0,
                player["enemy_health"][enemy_id] - damage,
            )

            message = (
                f"You strike {enemy['name']} with your "
                f"{weapon['name']} for {damage} damage."
            )

            if critical:
                message += " A brutal critical hit!"

            events.append(log_event("player_attack", message, damage))
        else:
            events.append(log_event(
                "player_miss",
                f"You swing your {weapon['name']} and miss.",
            ))

        if player["enemy_health"][enemy_id] <= 0:
            extra = apply_victory(player, enemy_id, events)
            result = "victory"
        else:
            enemy_retaliate(player, enemy_id, events)

    elif action == "use_item":
        if item not in CONSUMABLES:
            raise HTTPException(400, "You can only use food or drinks")

        if item not in player["inventory"]:
            raise HTTPException(400, f"You have no {item} to use")

        info = CONSUMABLES[item]
        player["inventory"].remove(item)

        healed = min(
            info["heal"],
            player["max_health"] - player["health"],
        )
        player["health"] += healed
        player["hunger"] = max(
            0,
            player["hunger"] - info["hunger"],
        )

        events.append(log_event(
            "heal",
            f"{info['message']} +{healed} health, "
            f"-{info['hunger']} hunger.",
            healed,
        ))

        if enemy_id == "hollow" and item == "food":
            # Do not show the death scene immediately.
            # The next explicit turn request resolves it.
            begin_death(
                player,
                HOLLOW_FOOD_DEATH_SCENE,
                "hollow_food_death",
            )
            events.append(log_event(
                "info",
                "The Hollow suddenly lunges at you.",
            ))
            result = "death_pending"
        else:
            enemy_retaliate(player, enemy_id, events)

    elif action == "flee":
        if random.random() < enemy["flee_chance"]:
            damage = random.randint(*enemy["damage"]) * 2
            player["health"] = max(0, player["health"] - damage)

            events.append(log_event(
                "enemy_attack",
                f"{enemy['name']} catches you as you flee. "
                f"You take {damage} damage while escaping.",
                damage,
            ))

            if player["health"] <= 0:
                extra = apply_defeat(player, enemy_id, events)
                result = "defeat"
            else:
                apply_escape(player, enemy_id, events)
                result = "escaped"
        else:
            events.append(log_event("info", enemy["flee_fail_text"]))
            enemy_retaliate(player, enemy_id, events)

    else:
        raise HTTPException(400, "Unknown combat action")

    if result == "ongoing" and player["health"] <= 0:
        extra = apply_defeat(player, enemy_id, events)
        result = "defeat"

    response = {
        "message": " ".join(entry["text"] for entry in events),
        "combat_log": events,
        "result": result,
        "combat": combat_snapshot(
            player,
            enemy_id,
            active=(result == "ongoing"),
        ),
        "player": {
            "health": player["health"],
            "max_health": player["max_health"],
            "hunger": player["hunger"],
            "infection": player["infection"],
        },
        "inventory": player["inventory"],
        "scenario_status": player["scenario_status"],
    }

    response.update(extra)
    return response


def legacy_combat_choice(player_id: str, enemy_id: str, choice: str):
    player = get_player(player_id)
    require_playing(player)

    combat = player.get("combat")

    if not combat or combat["enemy"] != enemy_id:
        raise HTTPException(400, "That enemy is not attacking you")

    mapping = {"fight": "attack", "attack": "attack", "flee": "flee"}
    key = choice.strip().lower()

    if key not in mapping:
        raise HTTPException(400, "Choose either fight or flee")

    return resolve_combat_action(player, mapping[key], None)


# ============================================================
# ROOT AND SCENARIO
# ============================================================

@app.get("/")
def root():
    return {
        "message": "Undead Resonance is alive.",
        "scenario": SCENARIO["id"],
        "version": app.version,
    }


@app.get("/scenario")
def get_scenario():
    return SCENARIO


# ============================================================
# LOCATIONS AND PLAYER INFORMATION
# ============================================================

@app.get("/locations")
def get_locations():
    return locations


@app.get("/locations/{location_id}")
def get_location_endpoint(location_id: str):
    location = get_location(location_id)

    if location is None:
        raise HTTPException(404, "Location not found")

    return location


@app.get("/players/{player_id}")
def get_player_endpoint(player_id: str):
    return get_player(player_id)


@app.post("/players/{player_id}/reset")
def reset_player(player_id: str):
    get_player(player_id)

    locations[:] = copy.deepcopy(INITIAL_LOCATIONS)
    areas[:] = copy.deepcopy(INITIAL_AREAS)
    players[player_id] = copy.deepcopy(INITIAL_PLAYER_STATE)

    return {
        "message": "A new run begins.",
        "player": players[player_id],
        "scenario": SCENARIO,
        "show_replay": False,
    }


# ============================================================
# INVENTORY AND EQUIPMENT
# ============================================================

@app.get("/players/{player_id}/inventory")
def get_inventory(player_id: str):
    player = get_player(player_id)
    inventory = player["inventory"]
    capacity = player["inventory_capacity"]

    return {
        "player": player["name"],
        "inventory": inventory,
        "items_count": len(inventory),
        "capacity": capacity,
        "remaining_slots": capacity - len(inventory),
        "equipped_weapon": player["weapon"],
    }


@app.post("/players/{player_id}/consume")
def consume_item(player_id: str, request: PickupRequest):
    player = get_player(player_id)
    require_playing(player)

    if player.get("combat") or player["active_event"] is not None:
        raise HTTPException(
            400,
            "Resolve the active encounter before consuming items here",
        )

    if request.item not in CONSUMABLES:
        raise HTTPException(400, "You can only consume food or drinks")

    if request.item not in player["inventory"]:
        raise HTTPException(400, f"You have no {request.item} to consume")

    info = CONSUMABLES[request.item]
    player["inventory"].remove(request.item)

    healed = min(
        info["heal"],
        player["max_health"] - player["health"],
    )
    player["health"] += healed
    player["hunger"] = max(0, player["hunger"] - info["hunger"])

    return {
        "message": (
            f"{info['message']} (+{healed} HP, "
            f"-{info['hunger']} hunger)"
        ),
        "health": player["health"],
        "hunger": player["hunger"],
        "inventory": player["inventory"],
        "scenario_status": player["scenario_status"],
    }


@app.post("/players/{player_id}/equip")
def equip_weapon(player_id: str, request: PickupRequest):
    player = get_player(player_id)
    require_playing(player)

    weapon = request.item

    if weapon not in items:
        raise HTTPException(400, "Unknown item")

    if items[weapon]["type"] != "weapon":
        raise HTTPException(400, "This item is not a weapon")

    if weapon not in player["inventory"]:
        raise HTTPException(400, "You do not have this weapon")

    player["weapon"] = weapon

    return {
        "message": f"You equipped {WEAPONS[weapon]['name']}.",
        "equipped_weapon": player["weapon"],
        "inventory": player["inventory"],
    }


# ============================================================
# COMBAT ENDPOINTS
# ============================================================

@app.get("/players/{player_id}/combat")
def get_combat(player_id: str):
    player = get_player(player_id)
    combat = player.get("combat")

    if not combat or player["scenario_status"] != "playing":
        return {"active": False}

    return combat_snapshot(player, combat["enemy"])


@app.post("/players/{player_id}/combat/action")
def combat_action(
    player_id: str,
    request: CombatActionRequest,
):
    player = get_player(player_id)
    require_playing(player)

    return resolve_combat_action(
        player,
        request.action.strip().lower(),
        request.item,
    )


# ============================================================
# CURRENT AREA AND MOVEMENT
# ============================================================

@app.get("/players/{player_id}/area")
def get_current_area(player_id: str):
    player = get_player(player_id)

    if player["current_area"] == SCENARIO["exit_area"]:
        return {
            "player": player["name"],
            "location": residential_district["name"],
            "area": "Ground-Floor Exit",
            "area_id": SCENARIO["exit_area"],
            "description": (
                "The building exit opens onto the cold night air."
            ),
            "connections": [],
            "searchable": False,
            "resources": [],
            "scenario_status": player["scenario_status"],
        }

    area = get_area(player["current_area"])

    if area is None:
        raise HTTPException(500, "Player's current area is invalid")

    return {
        "player": player["name"],
        "location": residential_district["name"],
        "area": area["name"],
        "area_id": area["id"],
        "description": area.get("description", ""),
        "connections": get_connections(player, area),
        "searchable": area.get("searchable", False),
        "resources": area.get("resources", []),
        "scenario_status": player["scenario_status"],
    }


@app.post("/players/{player_id}/move")
def move_player(player_id: str, request: MoveRequest):
    player = get_player(player_id)
    require_playing(player)

    if player["active_event"] is not None:
        raise HTTPException(
            status_code=400,
            detail="Resolve the active encounter first."
        )

    current = get_location(player["current_location"])

    if current is None:
        raise HTTPException(
            status_code=500,
            detail="Current location not found."
        )

    if request.destination not in current.get("connections", []):
        raise HTTPException(
            status_code=400,
            detail="That location is not connected."
        )

    destination = get_location(request.destination)

    if destination is None:
        raise HTTPException(
            status_code=404,
            detail="Destination location not found."
        )

    # Prevent entering the building exit before unlocking it.
    if request.destination == "building_exit":
        if not player.get("exit_unlocked", False):
            raise HTTPException(
                status_code=403,
                detail="The exit is blocked. Complete the required encounter first."
            )

    player["current_location"] = request.destination

    return {
        "message": "Location changed.",
        "player": player
    }

@app.post("/players/{player_id}/area/move")
def move_player_area(
    player_id: str,
    request: AreaMoveRequest,
):
    player = get_player(player_id)
    require_playing(player)

    if player["active_event"] is not None:
        raise HTTPException(400, "Resolve the active encounter first")

    current = get_area(player["current_area"])

    if current is None:
        raise HTTPException(500, "Current area not found")

    
    
    
    # Validate the requested destination.
    if request.destination == SCENARIO["exit_area"]:
        if current["id"] != "stairwell_01":
            raise HTTPException(
                status_code=400,
                detail="You must reach the stairwell before exiting."
            )

        if not player["exit_unlocked"]:
            raise HTTPException(
                status_code=403,
                detail="The ground-floor exit is locked."
            )

    elif request.destination not in get_connections(player, current):
        raise HTTPException(
            status_code=400,
            detail="That area is not connected."
        )



    # --------------------------------------------------------
    # MANDATORY ENCOUNTER PROGRESSION GATES
    # --------------------------------------------------------

    # 1. Apartment: The Hollow must be defeated.
    if current["id"] == "apartment_01":
        hollow_health = player["enemy_health"].get(
            "hollow", ENEMIES["hollow"]["max_health"]
        )

        if hollow_health > 0:
            raise HTTPException(
                status_code=403,
                detail="The Hollow is still alive. Defeat it before leaving the apartment."
            )

    # 2. Hallway: The Mimic encounter must be resolved.
    if current["id"] == "hallway_01":
        if "mimic" not in player["resolved_events"]:
            raise HTTPException(
                status_code=403,
                detail="The hallway encounter is not resolved. Complete the Mimic encounter before moving forward."
            )

    # 3. Stairwell: The stairwell creature must be defeated
    # and the ground-floor exit must be unlocked.
    if current["id"] == "stairwell_01":
        if (
            not player["exit_unlocked"]
            or player["enemy_health"].get(
                "stairwell_creature",
                ENEMIES["stairwell_creature"]["max_health"]
            ) > 0
        ):
            raise HTTPException(
                status_code=403,
                detail="The stairwell creature is still a threat. Defeat it before reaching the exit."
            )


    
    # Reaching the unlocked ground-floor exit completes the scenario.
    if request.destination == SCENARIO["exit_area"]:
        if (
            current["id"] != "stairwell_01"
            or not player["exit_unlocked"]
            or player["enemy_health"].get(
                "stairwell_creature",
                ENEMIES["stairwell_creature"]["max_health"]
            ) > 0
        ):
            raise HTTPException(
                status_code=403,
                detail="The exit is not yet safe to reach."
            )

        return win_scenario(player)

        # Reaching the ground-floor exit completes the scenario.
    if request.destination == SCENARIO["exit_area"]:
        if (
            current["id"] != "stairwell_01"
            or not player["exit_unlocked"]
            or player["enemy_health"].get(
                "stairwell_creature",
                ENEMIES["stairwell_creature"]["max_health"]
            ) > 0
        ):
            raise HTTPException(
                status_code=403,
                detail="The exit is not yet safe to reach."
            )

        return win_scenario(player)

    destination = get_area(request.destination)

    if destination is None:
        raise HTTPException(
            status_code=404,
            detail="Destination area not found."
        )

    if destination is None:
        raise HTTPException(404, "Destination area not found")

    if (
        current["id"] == "hallway_01"
        and destination["id"] == "apartment_01"
    ):
        player["current_area"] = destination["id"]

        begin_death(
            player,
            MIMIC_DEATH_SCENE,
            "mimic_backtracking_death",
        )

        return {
            "message": (
                "You return to the abandoned apartment. "
                "Something has followed you home."
            ),
            "event": "death_pending",
            "death_scene_pending": True,
            "scenario_status": "death_pending",
            "current_area": destination["id"],
        }

    player["current_area"] = destination["id"]

    response = build_area_response(
        player,
        destination,
        message=f"You moved to {destination['name']}.",
    )

    if (
        destination["id"] == "stairwell_01"
        and not player["exit_unlocked"]
        and "stairwell" not in player["resolved_events"]
    ):
        trigger_event(player, "stairwell")
        player["active_event"] = "stairwell"

        response["message"] = (
            "The stairwell door slams shut behind you. Below, "
            "something heavy scrapes against the concrete. "
            "The emergency light flickers, revealing a trail "
            "of blood leading down."
        )

        response["encounter"] = make_encounter(
            "stairwell",
            "The Stairwell",
            "Something is moving below. You can descend toward "
            "it or return upstairs.",
            [
                {"id": "descend", "label": "Descend"},
                {"id": "return", "label": "Return upstairs"},
            ],
        )

    return response


# ============================================================
# SEARCH AND PICKUP
# ============================================================

@app.post("/players/{player_id}/area/search")
def search_area(player_id: str):
    player = get_player(player_id)
    require_playing(player)

    if player["active_event"] is not None:
        raise HTTPException(400, "Resolve the active encounter first")

    area = get_area(player["current_area"])

    if area is None:
        raise HTTPException(500, "Current area is invalid")

    if not area.get("searchable", False):
        raise HTTPException(400, "This area cannot be searched")

    if area["id"] in player["searched_areas"]:
        raise HTTPException(400, "You have already searched this area")

    player["searched_areas"].append(area["id"])

    response = {
        "message": "Area searched successfully.",
        "area": area["name"],
        "resources_found": list(area.get("resources", [])),
        "encounter": None,
        "scenario_status": player["scenario_status"],
    }

    if (
        area["id"] == "hallway_01"
        and "mimic_plea" not in player["triggered_events"]
        and "mimic_plea" not in player["resolved_events"]
    ):
        trigger_event(player, "mimic_plea")
        player["active_event"] = "mimic_plea"

        response["message"] = (
            'A voice calls from the darkness: "HELP!!! comeeee..."'
        )

        response["encounter"] = make_encounter(
            "mimic_plea",
            "A Voice in the Hallway",
            'A desperate voice calls: "HELP!!! comeeee..."',
            [
                {"id": "help", "label": "Help"},
                {"id": "avoid", "label": "Avoid"},
            ],
        )

    return response


@app.post("/players/{player_id}/area/pickup")
def pickup_area_item(
    player_id: str,
    request: AreaPickupRequest,
):
    player = get_player(player_id)
    require_playing(player)

    if player["active_event"] is not None:
        raise HTTPException(400, "Resolve the active encounter first")

    area = get_area(player["current_area"])

    if area is None:
        raise HTTPException(500, "Current area is invalid")

    if area["id"] not in player["searched_areas"]:
        raise HTTPException(400, "Search this area before picking up items")

    if request.item not in items:
        raise HTTPException(400, "Unknown item")

    if request.item not in area.get("resources", []):
        raise HTTPException(404, "Item not available in this area")

    if len(player["inventory"]) >= player["inventory_capacity"]:
        raise HTTPException(400, "Inventory is full")

    player["inventory"].append(request.item)
    area["resources"].remove(request.item)

    if (
        area["id"] == "apartment_01"
        and request.item == "food"
        and "hollow" not in player["triggered_events"]
    ):
        start_combat(player, "hollow")

        return {
            "message": (
                "You pick up the food. A faint scraping sound "
                "comes from the darkness behind you."
            ),
            "inventory": player["inventory"],
            "remaining_resources": area["resources"],
            "encounter": make_encounter(
                "hollow",
                "The Hollow",
                ENEMIES["hollow"]["description"]
                + " It has been watching you the entire time.",
                [
                    {"id": "fight", "label": "Fight"},
                    {"id": "flee", "label": "Flee"},
                ],
            ),
            "combat": combat_snapshot(player, "hollow"),
            "scenario_status": player["scenario_status"],
        }

    if (
        area["id"] == "hallway_01"
        and request.item == "food"
        and "lurker" not in player["triggered_events"]
    ):
        start_combat(player, "lurker")

        return {
            "message": (
                "The moment you take the food, something "
                "scrapes across the floor behind you."
            ),
            "inventory": player["inventory"],
            "remaining_resources": area["resources"],
            "encounter": make_encounter(
                "lurker",
                "The Lurker",
                ENEMIES["lurker"]["description"],
                [
                    {"id": "fight", "label": "Fight"},
                    {"id": "flee", "label": "Run"},
                ],
            ),
            "combat": combat_snapshot(player, "lurker"),
            "scenario_status": player["scenario_status"],
        }

    return {
        "message": f"You picked up {request.item}.",
        "inventory": player["inventory"],
        "remaining_resources": area["resources"],
        "encounter": None,
        "scenario_status": player["scenario_status"],
    }


@app.post("/players/{player_id}/pickup")
def pickup_item(player_id: str, request: PickupRequest):
    player = get_player(player_id)
    require_playing(player)

    if player["active_event"] is not None:
        raise HTTPException(400, "Resolve the active encounter first")

    location = get_location(player["current_location"])

    if location is None:
        raise HTTPException(500, "Current location not found")

    if request.item not in items:
        raise HTTPException(400, "Unknown item")

    if request.item not in location.get("resources", []):
        raise HTTPException(404, "Item not available at this location")

    if len(player["inventory"]) >= player["inventory_capacity"]:
        raise HTTPException(400, "Inventory is full")

    player["inventory"].append(request.item)
    location["resources"].remove(request.item)

    return {
        "message": f"You picked up {request.item}.",
        "inventory": player["inventory"],
        "scenario_status": player["scenario_status"],
    }


# ============================================================
# LEGACY COMBAT ENDPOINTS
# ============================================================

@app.post("/players/{player_id}/events/hollow/choice")
def hollow_choice(
    player_id: str,
    request: EventChoiceRequest,
):
    return legacy_combat_choice(player_id, "hollow", request.choice)


@app.post("/players/{player_id}/events/stairwell_creature/choice")
def stairwell_creature_choice(
    player_id: str,
    request: EventChoiceRequest,
):
    return legacy_combat_choice(
        player_id, "stairwell_creature", request.choice
    )


# ============================================================
# MIMIC: HELP OR AVOID
# ============================================================

@app.post("/players/{player_id}/events/mimic_plea/choice")
def mimic_plea_choice(
    player_id: str,
    request: EventChoiceRequest,
):
    player = get_player(player_id)
    require_playing(player)

    if player["active_event"] != "mimic_plea":
        raise HTTPException(400, "There is no voice calling for help")

    choice = request.choice.strip().lower()

    if choice not in ("help", "avoid"):
        raise HTTPException(400, "Choose either help or avoid")

    resolve_event(player, "mimic_plea")
    player["active_event"] = None

    # Either choice resolves the hallway decision.
    # Helping still requires defeating the Mimic before advancing.
    if choice == "avoid":
        resolve_event(player, "mimic")

    if choice == "help":
        start_combat(player, "mimic")

        return {
            "message": (
                "You follow the voice. A figure stands in the "
                "hall, smiling impossibly wide. It lunges."
            ),
            "encounter": make_encounter(
                "mimic",
                "The Mimic",
                ENEMIES["mimic"]["description"],
                [
                    {"id": "fight", "label": "Fight"},
                    {"id": "flee", "label": "Flee"},
                ],
            ),
            "combat": combat_snapshot(player, "mimic"),
            "scenario_status": player["scenario_status"],
        }

    return {
        "message": (
        "You force yourself to ignore the desperate plea and "
        "continue down the hallway. For a moment, everything "
        "falls silent. Then, from somewhere behind you, comes "
        "the slow scrape of something dragging itself across "
        "the floor.\n\n"
        "You stop breathing. A shadow shifts at the far end of "
        "the corridor, just beyond the reach of the flickering "
        "lights. Two pale eyes stare back at you from the "
        "darkness. It has been watching you the entire time, "
        "waiting for you to come closer.\n\n"
        "A faint, broken imitation of a human voice echoes "
        "through the hallway once more. Beneath it, you hear "
        "a low, wet clicking, like a jaw struggling to remember "
        "how to speak.\n\n"
        "You don't look back again. Whatever was waiting in "
        "that darkness, you have survived its attention. For "
        "now, the Mimic lets you go. But as you descend deeper "
        "into the building, you can't shake the feeling that "
        "it is still following you, patiently waiting for "
        "another chance to feed."
        ),
        "event": "mimic_avoided",
        "encounter": None,
        "scenario_status": player["scenario_status"],
    }


# ============================================================
# MIMIC COMBAT
# ============================================================

@app.post("/players/{player_id}/events/mimic/choice")
def mimic_choice(
    player_id: str,
    request: EventChoiceRequest,
):
    player = get_player(player_id)
    require_playing(player)

    if not player.get("combat") or player["combat"]["enemy"] != "mimic":
        raise HTTPException(400, "The Mimic is not attacking you")

    mapping = {
        "fight": "attack",
        "attack": "attack",
        "flee": "flee",
        "inspect": "inspect",
    }

    choice = request.choice.strip().lower()

    if choice not in mapping:
        raise HTTPException(400, "Choose fight, flee, or inspect")

    return resolve_combat_action(player, mapping[choice], None)


# ============================================================
# LURKER COMBAT
# ============================================================

@app.post("/players/{player_id}/events/lurker/choice")
def lurker_choice(
    player_id: str,
    request: EventChoiceRequest,
):
    player = get_player(player_id)
    require_playing(player)

    if not player.get("combat") or player["combat"]["enemy"] != "lurker":
        raise HTTPException(400, "The Lurker is not currently active")

    mapping = {
        "fight": "attack",
        "attack": "attack",
        "flee": "flee",
        "inspect": "inspect",
    }

    choice = request.choice.strip().lower()

    if choice not in mapping:
        raise HTTPException(400, "Choose fight, flee, or inspect")

    return resolve_combat_action(player, mapping[choice], None)


# ============================================================
# STAIRWELL: DESCEND OR RETURN
# ============================================================

@app.post("/players/{player_id}/events/stairwell/choice")
def stairwell_choice(
    player_id: str,
    request: EventChoiceRequest,
):
    player = get_player(player_id)
    require_playing(player)

    if player["current_area"] != "stairwell_01":
        raise HTTPException(400, "You are not in the stairwell")

    if player["active_event"] != "stairwell":
        raise HTTPException(400, "There is no active stairwell event")

    choice = request.choice.strip().lower()

    if choice == "return":
        begin_death(
            player,
            LURKER_DEATH_SCENE,
            "stairwell_backtracking_death",
        )

        return {
            "message": (
                "You turn to retreat upstairs. The scraping "
                "stops. Something is already behind you."
            ),
            "event": "death_pending",
            "death_scene_pending": True,
            "scenario_status": "death_pending",
        }

    if choice == "descend":
        start_combat(player, "stairwell_creature")

        return {
            "message": (
                "You descend toward the scraping. At the landing "
                "below, a hunched creature turns toward you. Its "
                "fingers drag along the concrete, leaving thin red lines."
            ),
            "encounter": make_encounter(
                "stairwell_creature",
                "The Lurker",
                ENEMIES["stairwell_creature"]["description"],
                [
                    {"id": "fight", "label": "Fight"},
                    {"id": "flee", "label": "Flee"},
                ],
            ),
            "combat": combat_snapshot(player, "stairwell_creature"),
            "scenario_status": player["scenario_status"],
        }

    raise HTTPException(400, "Choose either descend or return")


# ============================================================
# EXPLICIT TURN ADVANCEMENT
# ============================================================

@app.post("/players/{player_id}/turn")
def advance_turn(player_id: str):
    player = get_player(player_id)

    # Scheduled deaths resolve here, before hunger or turn changes.
    if player["scenario_status"] == "death_pending":
        scene = player.get("pending_death_scene") or (
            HOLLOW_FOOD_DEATH_SCENE
        )
        event_id = player.get("pending_death_event")
        resolve_event(player, event_id)
        return death_response(player, scene)

    require_playing(player)

    if player["active_event"] is not None:
        raise HTTPException(400, "Resolve the active encounter first")

    player["turn"] += 1
    player["hunger"] = min(100, player["hunger"] + 25)

    hunger_damage = 0

    if player["hunger"] >= 100:
        hunger_damage = 10
        player["health"] = max(0, player["health"] - hunger_damage)

    if player["health"] <= 0:
        player["scenario_status"] = "dead"
        player["active_event"] = None
        player["combat"] = None

        return {
            "message": STARVATION_DEATH_SCENE,
            "death_scene": STARVATION_DEATH_SCENE,
            "turn": player["turn"],
            "health": 0,
            "hunger": player["hunger"],
            "hunger_damage": hunger_damage,
            "scenario_status": "dead",
            "show_replay": True,
        }

    return {
        "message": "A turn passes.",
        "turn": player["turn"],
        "health": player["health"],
        "hunger": player["hunger"],
        "hunger_damage": hunger_damage,
        "scenario_status": player["scenario_status"],
    }
