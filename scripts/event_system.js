import { world, system } from "@minecraft/server";
import { getPlayerRpgData, savePlayerRpgData } from "./rpg_system.js";

// ============================================================
// RANDOM EVENT ROULETTE SYSTEM -- Event setiap 10 menit
// ============================================================

const EVENT_INTERVAL_TICKS = 12000; // 10 minutes (20 ticks/sec * 60 sec * 10 min)
let eventTimerTicks = 1200;
let activeEvent = null; // { id, name, desc, type, duration, endTime, shortDesc, effectLine }

// ============================================================
// EVENT DEFINITIONS
// ============================================================

const POSITIVE_EVENTS = [
    { id: "harvest_blessing", name: "Berkemakmuran Panen", desc: "Tanaman tumbuh pesat di sekitar semua pemain!", type: "positive", duration: 120000, shortDesc: "Tanaman instan tumbuh", effectLine: "Tanaman di sekitar pemain otomatis tumbuh instan setiap 10 detik" },
    { id: "xp_surge", name: "Gelora Pengalaman", desc: "Semua XP profesi menjadi 2x lipat!", type: "positive", duration: 300000, shortDesc: "2x XP Profesi", effectLine: "Semua XP yang didapat dari profesi menjadi ganda (2x)" },
    { id: "merchant_fortune", name: "Keberuntungan Pedagang", desc: "Harga jual item menjadi 2x lipat!", type: "positive", duration: 300000, shortDesc: "2x Harga Jual", effectLine: "Semua harga jual item di Pengepul dan Auto-Sell menjadi ganda (2x)" },
    { id: "guardian_shield", name: "Perisai Pelindung", desc: "Resistance untuk semua pemain!", type: "positive", duration: 180000, shortDesc: "Resistance semua", effectLine: "Semua pemain mendapat Resistance 1 selama event aktif" },
    { id: "swift_winds", name: "Angin Cepat", desc: "Speed 2 untuk semua pemain!", type: "positive", duration: 180000, shortDesc: "Speed 2 semua", effectLine: "Semua pemain mendapat Speed 2 selama event aktif" },
    { id: "sp_gift", name: "Hadiah Kecakapan", desc: "Semua pemain mendapat +3 SP!", type: "positive", duration: 0, shortDesc: "+3 SP gratis", effectLine: "Semua pemain langsung mendapat +3 Skill Point secara gratis" },
    { id: "miner_blessing", name: "Berkat Penambang", desc: "Haste 2 untuk semua pemain!", type: "positive", duration: 180000, shortDesc: "Haste 2 semua", effectLine: "Semua pemain mendapat Haste 2 (menambang cepat) selama event aktif" },
    { id: "healing_rain", name: "Hujan Penyembuhan", desc: "Regeneration untuk semua pemain!", type: "positive", duration: 120000, shortDesc: "Regen semua", effectLine: "Semua pemain mendapat Regeneration 2 (HP pulih otomatis) selama event aktif" },
    { id: "golden_hour", name: "Jam Emas", desc: "Bonus emas saat mining!", type: "positive", duration: 120000, shortDesc: "Bonus emas mining", effectLine: "Setiap blok ore yang ditambang memberi bonus Gold Nugget" },
];

const NEGATIVE_EVENTS = [
    { id: "undead_invasion", name: "Invasi Kematian", desc: "Monster muncul di dekat pemain!", type: "negative", duration: 0, shortDesc: "Monster spawn!", effectLine: "3-6 monster spawn di sekitar setiap pemain" },
    { id: "dark_eclipse", name: "Gerhana Gelap", desc: "Kegelapan menyelimuti seluruh dunia!", type: "negative", duration: 45000, shortDesc: "Blind+Darkness", effectLine: "Semua pemain terkena Darkness dan Blindness" },
    { id: "cursed_ground", name: "Tanah Terkutuk", desc: "Kutukan melumpuhkan semua pemain!", type: "negative", duration: 60000, shortDesc: "Slow+Weakness", effectLine: "Semua pemain terkena Slowness dan Weakness" },
];

// All event names for roulette animation (tanpa emoji)
const ALL_EVENT_NAMES = [...POSITIVE_EVENTS, ...NEGATIVE_EVENTS].map(e => e.name);

// ============================================================
// PUBLIC API -- Cek event aktif (dipakai oleh sistem lain)
// ============================================================

export function getActiveEvent() {
    if (!activeEvent) return null;
    if (activeEvent.duration > 0 && Date.now() > activeEvent.endTime) {
        activeEvent = null;
        return null;
    }
    return activeEvent;
}

export function isEventActive(eventId) {
    const evt = getActiveEvent();
    return evt !== null && evt.id === eventId;
}

export function getEventTimeRemaining() {
    const evt = getActiveEvent();
    if (!evt || evt.duration === 0) return 0;
    return Math.max(0, evt.endTime - Date.now());
}

export function getNextEventETA() {
    if (activeEvent && activeEvent.duration > 0 && Date.now() < activeEvent.endTime) {
        return 0; // Event sedang aktif, ETA = 0
    }
    const remainingTicks = EVENT_INTERVAL_TICKS - eventTimerTicks;
    const remainingMs = (remainingTicks / 20) * 1000;
    return Math.max(0, remainingMs);
}

// Get formatted display for actionbar
export function getActiveEventDisplay() {
    const evt = getActiveEvent();
    if (!evt) return null;
    const remaining = evt.endTime ? Math.max(0, Math.ceil((evt.endTime - Date.now()) / 60000)) : 0;
    const color = evt.type === "positive" ? "§a" : "§c";
    const durText = remaining > 0 ? ` §7(${remaining}m)` : "";
    return {
        text: `${color}${evt.shortDesc}${durText}`,
        name: evt.name,
        desc: evt.desc,
        shortDesc: evt.shortDesc,
        effectLine: evt.effectLine,
        remaining: remaining,
        type: evt.type
    };
}

// ============================================================
// EVENT TIMER & MAINTENANCE LOOP
// ============================================================

// Load event state on startup
system.run(() => {
    try {
        const data = world.getDynamicProperty("active_event");
        if (data && typeof data === 'string') {
            const evt = JSON.parse(data);
            if (evt.duration > 0 && Date.now() < evt.endTime) {
                activeEvent = evt;
                world.sendMessage(`§7[Event] §f${evt.name} §7masih aktif! Sisa: §e${Math.ceil((evt.endTime - Date.now()) / 60000)} menit`);
                world.sendMessage(`§7[Event] Efek: §e${evt.effectLine || evt.desc}`);
            }
        }
        // Load timer
        const timerData = world.getDynamicProperty("event_timer");
        if (timerData && typeof timerData === 'number') {
            eventTimerTicks = timerData;
        }
    } catch(e) {}
});

// Reminder timer -- count ticks since last reminder
let lastReminderTick = 0;
let harvestTickCounter = 0;
const REMINDER_INTERVAL_TICKS = 2400; // 2 minutes

// Main event timer loop -- runs every second (20 ticks)
system.runInterval(() => {
    // Increment timer
    eventTimerTicks += 20;

    // Save timer periodically (every 30 seconds)
    if (eventTimerTicks % 600 === 0) {
        try { world.setDynamicProperty("event_timer", eventTimerTicks); } catch(e) {}
    }

    // Check if it's time for a new event
    if (eventTimerTicks >= EVENT_INTERVAL_TICKS) {
        eventTimerTicks = 0;
        lastReminderTick = 0;
        harvestTickCounter = 0;
        try { world.setDynamicProperty("event_timer", 0); } catch(e) {}

        const players = world.getAllPlayers();
        if (players.length > 0) {
            startEventRoulette();
        }
    }

    // Maintain active event effects (reapply buffs every second)
    if (activeEvent && activeEvent.duration > 0) {
        if (Date.now() > activeEvent.endTime) {
            // Event expired
            world.sendMessage(`§7[Event] §f${activeEvent.name} §7telah berakhir.`);
            activeEvent = null;
            try { world.setDynamicProperty("active_event", undefined); } catch(e) {}
        } else {
            maintainEventEffects();

            // Periodic reminder (every 2 minutes)
            lastReminderTick += 20;
            if (lastReminderTick >= REMINDER_INTERVAL_TICKS) {
                lastReminderTick = 0;
                const remaining = Math.max(0, Math.ceil((activeEvent.endTime - Date.now()) / 60000));
                const color = activeEvent.type === "positive" ? "§a" : "§c";
                world.sendMessage(`§7[Event] ${color}${activeEvent.name} §7aktif! Sisa: §e${remaining}m §7-- ${activeEvent.shortDesc}`);
            }
        }
    }
}, 20);

// ============================================================
// MAINTAIN ACTIVE EVENT EFFECTS (dipanggil setiap detik)
// ============================================================

function maintainEventEffects() {
    if (!activeEvent) return;

    const players = world.getAllPlayers();
    const duration = 40; // 2 seconds, reapply every second so no gaps

    for (const player of players) {
        try {
            switch (activeEvent.id) {
                case "guardian_shield":
                    player.addEffect("resistance", duration, { amplifier: 0, showParticles: false });
                    break;
                case "swift_winds":
                    player.addEffect("speed", duration, { amplifier: 1, showParticles: false });
                    break;
                case "miner_blessing":
                    player.addEffect("haste", duration, { amplifier: 1, showParticles: false });
                    break;
                case "healing_rain":
                    player.addEffect("regeneration", duration, { amplifier: 1, showParticles: false });
                    break;
                case "dark_eclipse":
                    player.addEffect("darkness", duration, { amplifier: 0, showParticles: false });
                    player.addEffect("blindness", duration, { amplifier: 0, showParticles: false });
                    break;
                case "cursed_ground":
                    player.addEffect("slowness", duration, { amplifier: 0, showParticles: false });
                    player.addEffect("weakness", duration, { amplifier: 0, showParticles: false });
                    break;
            }
        } catch(e) {
            // Skip this player if addEffect fails (e.g., disconnecting)
        }
    }

    // Harvest blessing - grow crops every 10 seconds
    if (activeEvent.id === "harvest_blessing") {
        harvestTickCounter += 20;
        if (harvestTickCounter >= 200) {
            harvestTickCounter = 0;
            for (const player of players) {
                try { growCropsNearPlayer(player); } catch(e) {}
            }
        }
    }
}

// ============================================================
// ROULETTE ANIMATION -- tick tick tick seperti rolling
// ============================================================

function startEventRoulette() {
    // Determine the actual event FIRST
    const isPositive = Math.random() < 0.80; // 80% positive, 20% negative
    const pool = isPositive ? POSITIVE_EVENTS : NEGATIVE_EVENTS;
    const selectedEvent = { ...pool[Math.floor(Math.random() * pool.length)] };

    let tick = 0;
    const totalTicks = 75; // ~3.75 seconds total animation
    let currentDisplayIndex = Math.floor(Math.random() * ALL_EVENT_NAMES.length);
    let lastChangeTick = 0;

    // Phase thresholds for slowing down
    const getChangeInterval = (t) => {
        if (t < 25) return 2;   // Phase 1: Very fast
        if (t < 45) return 4;   // Phase 2: Medium
        if (t < 60) return 7;   // Phase 3: Slow
        if (t < 70) return 10;  // Phase 4: Very slow
        return 15;              // Phase 5: Crawling
    };

    const rouletteId = system.runInterval(() => {
        tick++;

        const interval = getChangeInterval(tick);
        if (tick - lastChangeTick >= interval) {
            lastChangeTick = tick;
            currentDisplayIndex = (currentDisplayIndex + 1) % ALL_EVENT_NAMES.length;

            // Update display for all players
            const currentPlayers = world.getAllPlayers();
            for (const player of currentPlayers) {
                try {
                    player.onScreenDisplay.setTitle("§e§lEVENT ROULETTE");
                    player.onScreenDisplay.setSubtitle(ALL_EVENT_NAMES[currentDisplayIndex]);
                    player.playSound("random.click", { volume: 0.4, pitch: 0.5 + (tick / totalTicks) * 1.5 });
                } catch(e) {}
            }
        }

        // Roulette complete -- announce the real event
        if (tick >= totalTicks) {
            system.clearRun(rouletteId);
            announceAndExecuteEvent(selectedEvent);
        }
    }, 1);
}

// ============================================================
// EVENT ANNOUNCEMENT & EXECUTION
// ============================================================

function announceAndExecuteEvent(event) {
    const isPositive = event.type === "positive";
    const color = isPositive ? "§a" : "§c";
    const label = isPositive ? "§a§l[EVENT POSITIF]" : "§c§l[EVENT NEGATIF]";
    const sound = isPositive ? "random.levelup" : "mob.wither.spawn";

    // Dramatic title reveal
    const players = world.getAllPlayers();
    for (const player of players) {
        try {
            player.onScreenDisplay.setTitle(label);
            player.onScreenDisplay.setSubtitle(`${color}${event.name}`);
            player.playSound(sound, { volume: 1.0, pitch: 0.8 });
        } catch(e) {}
    }

    // Camera shake for negative events
    if (!isPositive) {
        for (const player of players) {
            try {
                player.dimension.runCommandAsync(`camerashake add @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=50] 0.3 2 positional`);
            } catch(e) {}
        }
    }

    // Server-wide message -- with clear effect description
    world.sendMessage(`§e§l--- EVENT ROULETTE ---`);
    world.sendMessage(`${label} ${color}${event.name}`);
    world.sendMessage(`§7${event.desc}`);
    world.sendMessage(`§eEfek: §f${event.effectLine}`);
    if (event.duration > 0) {
        const minutes = Math.floor(event.duration / 60000);
        const seconds = Math.floor((event.duration % 60000) / 1000);
        world.sendMessage(`§7Durasi: §e${minutes} menit${seconds > 0 ? ' ' + seconds + ' detik' : ''}`);
    }
    world.sendMessage(`§e§l----------------------`);

    // Execute the event
    executeEvent(event);
}

function executeEvent(event) {
    // Set active event
    activeEvent = { ...event };
    if (event.duration > 0) {
        activeEvent.endTime = Date.now() + event.duration;
    }

    // Save to dynamic property for persistence across restarts
    try {
        if (activeEvent.duration > 0) {
            world.setDynamicProperty("active_event", JSON.stringify(activeEvent));
        }
    } catch(e) {}

    const players = world.getAllPlayers();

    switch (event.id) {
        case "harvest_blessing":
            for (const player of players) {
                try { growCropsNearPlayer(player); } catch(e) {}
                try { player.dimension.spawnParticle("minecraft:crop_growth_area_emitter", player.location); } catch(e) {}
            }
            break;

        case "xp_surge":
        case "merchant_fortune":
            // These are passive flags -- checked by addXp() and sell functions
            // Show visual indicator
            for (const player of players) {
                try { player.dimension.spawnParticle("minecraft:vault_particle", player.location); } catch(e) {}
                // Send individual message so players know the effect is active
                const effectText = event.id === "xp_surge" ? "2x XP Profesi" : "2x Harga Jual";
                player.sendMessage(`§a[Event] §f${event.name} aktif! Kamu mendapat §e${effectText}§f sampai event berakhir.`);
            }
            break;

        case "guardian_shield":
            for (const player of players) {
                try { player.addEffect("resistance", 200, { amplifier: 0, showParticles: true }); } catch(e) {}
            }
            break;

        case "swift_winds":
            for (const player of players) {
                try { player.addEffect("speed", 200, { amplifier: 1, showParticles: true }); } catch(e) {}
            }
            break;

        case "sp_gift":
            for (const player of players) {
                try {
                    const rpgData = getPlayerRpgData(player);
                    rpgData.sp += 3;
                    savePlayerRpgData(player, rpgData);
                    player.sendMessage("§a[Event] Kamu mendapat §e+3 SP§a dari Hadiah Kecakapan!");
                    player.runCommandAsync("playsound random.levelup @s");
                } catch(e) {}
            }
            activeEvent = null;
            try { world.setDynamicProperty("active_event", undefined); } catch(e) {}
            break;

        case "miner_blessing":
            for (const player of players) {
                try { player.addEffect("haste", 200, { amplifier: 1, showParticles: true }); } catch(e) {}
            }
            break;

        case "healing_rain":
            for (const player of players) {
                try { player.addEffect("regeneration", 200, { amplifier: 1, showParticles: true }); } catch(e) {}
            }
            break;

        case "golden_hour":
            for (const player of players) {
                try { player.dimension.spawnParticle("minecraft:vault_particle", player.location); } catch(e) {}
                player.sendMessage("§6[Event] Jam Emas aktif! Setiap ore yang ditambang memberi bonus Gold Nugget.");
            }
            break;

        case "undead_invasion":
            for (const player of players) {
                try { spawnMonstersNearPlayer(player); } catch(e) {}
            }
            activeEvent = null;
            try { world.setDynamicProperty("active_event", undefined); } catch(e) {}
            break;

        case "dark_eclipse":
            for (const player of players) {
                try {
                    player.addEffect("darkness", 450, { amplifier: 0, showParticles: true });
                    player.addEffect("blindness", 450, { amplifier: 0, showParticles: true });
                } catch(e) {}
            }
            break;

        case "cursed_ground":
            for (const player of players) {
                try {
                    player.addEffect("slowness", 600, { amplifier: 0, showParticles: true });
                    player.addEffect("weakness", 600, { amplifier: 0, showParticles: true });
                } catch(e) {}
            }
            break;
    }
}

// ============================================================
// HARVEST BLESSING -- Grow crops near player
// ============================================================

function growCropsNearPlayer(player) {
    const dimension = player.dimension;
    const radius = 12;
    const px = Math.floor(player.location.x);
    const py = Math.floor(player.location.y);
    const pz = Math.floor(player.location.z);

    let grownCount = 0;

    for (let x = -radius; x <= radius; x += 2) {
        for (let z = -radius; z <= radius; z += 2) {
            for (let y = -3; y <= 3; y++) {
                try {
                    const block = dimension.getBlock({ x: px + x, y: py + y, z: pz + z });
                    if (!block || block.isAir) continue;

                    const id = block.typeId;
                    const isCrop = id.includes("wheat") || id.includes("carrot") || id.includes("potato") ||
                                   id.includes("beetroot") || id.includes("crop") || id.includes("berry_bush") ||
                                   id.includes("nether_wart") || id.includes("cocoa") || id.includes("pitcher_crop") ||
                                   id.includes("torchflower");

                    if (isCrop) {
                        try {
                            const perm = block.permutation;
                            const growth = perm.getState("growth");
                            if (growth !== undefined) {
                                const maxGrowth = id.includes("beetroot") ? 3 : 7;
                                if (growth < maxGrowth) {
                                    perm.setState("growth", maxGrowth);
                                    block.setPermutation(perm);
                                    grownCount++;
                                }
                            }
                        } catch(e) {}
                    }
                } catch(e) {}
            }
        }
    }

    if (grownCount > 0) {
        player.sendMessage(`§2[Event] §fBerkemakmuran Panen: ${grownCount} tanaman tumbuh instan di sekitarmu!`);
    }
}

// ============================================================
// UNDEAD INVASION -- Spawn monsters near player (ignore light)
// ============================================================

function spawnMonstersNearPlayer(player) {
    const dimension = player.dimension;
    const loc = player.location;

    const monsterTypes = [
        "minecraft:zombie",
        "minecraft:skeleton",
        "minecraft:spider",
        "minecraft:creeper",
        "minecraft:husk",
        "minecraft:stray"
    ];

    const count = 3 + Math.floor(Math.random() * 4); // 3-6 monsters per player

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 8 + Math.random() * 8; // 8-16 blocks away
        const x = Math.floor(loc.x + Math.cos(angle) * distance) + 0.5;
        const z = Math.floor(loc.z + Math.sin(angle) * distance) + 0.5;

        // Find valid Y: scan down from above
        let y = Math.floor(loc.y) + 5;
        let foundGround = false;
        for (let dy = 0; dy < 25; dy++) {
            try {
                const block = dimension.getBlock({ x: Math.floor(x), y: y - dy, z: Math.floor(z) });
                if (block && !block.isAir && !block.isLiquid) {
                    y = y - dy + 1;
                    foundGround = true;
                    break;
                }
            } catch(e) { break; }
        }
        if (!foundGround) y = Math.floor(loc.y);

        const monsterType = monsterTypes[Math.floor(Math.random() * monsterTypes.length)];
        try {
            const entity = dimension.spawnEntity(monsterType, { x, y, z });
            entity.addTag("event_monster");
            try { entity.addEffect("glowing", 600, { amplifier: 0, showParticles: false }); } catch(e) {}
        } catch(e) {}
    }

    player.sendMessage(`§c[Event] Invasi Kematian! ${count} monster muncul di sekitarmu!`);

    try {
        player.dimension.runCommandAsync(`playsound mob.wither.spawn @a[x=${Math.floor(loc.x)},y=${Math.floor(loc.y)},z=${Math.floor(loc.z)},r=20] 0.6 1.2`);
    } catch(e) {}
}
