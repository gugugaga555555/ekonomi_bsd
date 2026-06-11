import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { getPlayerRpgData, savePlayerRpgData, addXp } from "./rpg_system.js";
import { formatRupiah, getScore, setScore, getUiHeader } from "./utils.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";

// ============================================================
// SISTEM ARENA PERTARUNGAN v2.5
// Wave-based combat challenge -- fight mobs, earn rewards!
// ============================================================

// --- CONSTANTS ---
const ARENA_COOLDOWN_MS = 1800000; // 30 menit cooldown free attempt
const ARENA_CORE_COST = 2; // Core untuk instant entry
const WAVE_SPAWN_RADIUS = 8; // Radius spawn mob dari player
const WAVE_CHECK_INTERVAL = 20; // Ticks antar cek wave completion (1 detik)
const MAX_ACTIVE_ARENA_MOBS = 30; // Batas maksimal mob hidup sekaligus

// --- DIFFICULTY TIERS ---
const DIFFICULTIES = {
    biasa: {
        name: "Biasa",
        color: "§a",
        maxWaves: 10,
        baseMobs: 3,
        mobsPerWave: 1, // +1 mob per wave
        hpMultiplier: 1.0,
        rewardMultiplier: 1.0,
        bossEvery: 5,
        mobPool: ["minecraft:zombie", "minecraft:skeleton", "minecraft:spider", "minecraft:creeper"],
        bossPool: ["minecraft:zombie_villager_v2", "minecraft:husk"],
        rupiahPerWave: 5000,
        slayerXpPerWave: 15,
        coreChance: 0.03, // 3% per wave
        spAtWave: [5, 10] // Bonus SP di wave 5 dan 10
    },
    sulit: {
        name: "Sulit",
        color: "§e",
        maxWaves: 15,
        baseMobs: 4,
        mobsPerWave: 2,
        hpMultiplier: 1.5,
        rewardMultiplier: 2.0,
        bossEvery: 5,
        mobPool: ["minecraft:zombie_villager_v2", "minecraft:husk", "minecraft:stray", "minecraft:cave_spider", "minecraft:witch"],
        bossPool: ["minecraft:evocation_illager", "minecraft:vindicator"],
        rupiahPerWave: 12000,
        slayerXpPerWave: 25,
        coreChance: 0.06,
        spAtWave: [5, 10, 15]
    },
    neraka: {
        name: "Neraka",
        color: "§c",
        maxWaves: 20,
        baseMobs: 5,
        mobsPerWave: 2,
        hpMultiplier: 2.5,
        rewardMultiplier: 3.5,
        bossEvery: 5,
        mobPool: ["minecraft:piglin_brute", "minecraft:hoglin", "minecraft:wither_skeleton", "minecraft:blaze", "minecraft:phantom"],
        bossPool: ["minecraft:ravager", "minecraft:warden"],
        rupiahPerWave: 25000,
        slayerXpPerWave: 40,
        coreChance: 0.10,
        spAtWave: [5, 10, 15, 20]
    }
};

// --- BOSS NAMES & TITLES ---
const BOSS_TITLES = [
    "Sang Penghancur", "Raja Kegelapan", "Jenderal Neraka",
    "Penjaga Gerbang", "Sang Inkarnasi", "Roh Pembinasa",
    "Ksatria Kematian", "Panglima Abadi", "Dewa Peperangan",
    "Sang Terkutuk"
];

const BOSS_NAMES = [
    "Gromash", "Vythrak", "Orzok", "Netharius", "Kalgor",
    "Thornak", "Xalvador", "Drakmora", "Azhural", "Skarnoth"
];

// ============================================================
// ARENA DATA -- Dynamic Property Storage
// ============================================================

function getPlayerArenaData(player) {
    try {
        const str = player.getDynamicProperty("arena_data");
        if (str && typeof str === 'string') return JSON.parse(str);
    } catch (e) {}
    return {
        bestWave: { biasa: 0, sulit: 0, neraka: 0 },
        totalRuns: 0,
        totalWavesCleared: 0,
        totalBossesKilled: 0,
        arenaPoints: 0,
        lastFreeAttempt: 0,
        currentRun: null // { difficulty, wave, mobsAlive, startTime, totalReward }
    };
}

function savePlayerArenaData(player, data) {
    player.setDynamicProperty("arena_data", JSON.stringify(data));
}

// Global map to track active arena sessions (playerName -> arena state)
const activeArenas = new Map();

// ============================================================
// ARENA MENU -- Main Hub
// ============================================================

export function openArenaMenu(player) {
    const arenaData = getPlayerArenaData(player);
    const coreScore = getScore(player, "core");
    const rpgData = getPlayerRpgData(player);
    const slayerLv = rpgData.slayer.level;

    // Check if player is already in arena
    if (activeArenas.has(player.name)) {
        openArenaStatusMenu(player);
        return;
    }

    // Cooldown check
    const now = Date.now();
    const lastFree = arenaData.lastFreeAttempt || 0;
    const cooldownRemaining = Math.max(0, ARENA_COOLDOWN_MS - (now - lastFree));
    const canFreeAttempt = cooldownRemaining <= 0;
    const cooldownText = canFreeAttempt ? "§aSiap!" : `§c${Math.ceil(cooldownRemaining / 60000)}m`;

    const form = new ActionFormData();
    form.title("§4§lArena Pertarungan");

    let bodyText = getUiHeader(player) + "\n";
    bodyText += `§cSlayer Lv: §f${slayerLv} §7| §bCore: §f${coreScore}\n`;
    bodyText += `§6Poin Arena: §f${arenaData.arenaPoints}\n`;
    bodyText += `§7Total Run: §f${arenaData.totalRuns} §7| Wave Total: §f${arenaData.totalWavesCleared} §7| Boss: §f${arenaData.totalBossesKilled}\n\n`;

    bodyText += `§e§l--- Rekor Terbaik ---§r\n`;
    bodyText += `${DIFFICULTIES.biasa.color}Biasa: §fWave ${arenaData.bestWave.biasa}/${DIFFICULTIES.biasa.maxWaves}\n`;
    bodyText += `${DIFFICULTIES.sulit.color}Sulit: §fWave ${arenaData.bestWave.sulit}/${DIFFICULTIES.sulit.maxWaves}\n`;
    bodyText += `${DIFFICULTIES.neraka.color}Neraka: §fWave ${arenaData.bestWave.neraka}/${DIFFICULTIES.neraka.maxWaves}\n\n`;

    bodyText += `§7Cooldown Gratis: ${cooldownText}\n`;
    bodyText += `§7Atau bayar §b${ARENA_CORE_COST} Core§7 untuk masuk langsung!`;

    form.body(bodyText);

    form.button(`§aArena Biasa\n§7Wave 1-10 | Mudah | x1 Reward`);
    form.button(`§eArena Sulit\n§7Wave 1-15 | Menengah | x2 Reward`);
    form.button(`§cArena Neraka\n§7Wave 1-20 | Brutal | x3.5 Reward`);
    form.button("§6Toko Hadiah Arena\n§7Tukar Poin Arena jadi reward");
    form.button("§9Papan Peringkat Arena\n§7Rekor pemain terbaik");
    form.button("§ePanduan Arena\n§7Cara main & reward info");
    form.button("§cKembali ke Atribut & Kekuatan");

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: openArenaStartConfirm(player, "biasa"); break;
            case 1: openArenaStartConfirm(player, "sulit"); break;
            case 2: openArenaStartConfirm(player, "neraka"); break;
            case 3: openArenaShop(player); break;
            case 4: openArenaLeaderboard(player); break;
            case 5: openArenaGuide(player); break;
            case 6:
                import("./menu_system.js").then(mod => {
                    system.runTimeout(() => { mod.openRpgGachaMenu(player); }, 5);
                }).catch(() => {});
                break;
        }
    });
}

// ============================================================
// ARENA START CONFIRMATION
// ============================================================

function openArenaStartConfirm(player, difficulty) {
    const diff = DIFFICULTIES[difficulty];
    const arenaData = getPlayerArenaData(player);
    const coreScore = getScore(player, "core");
    const now = Date.now();
    const canFreeAttempt = (now - (arenaData.lastFreeAttempt || 0)) >= ARENA_COOLDOWN_MS;

    const form = new MessageFormData();
    form.title(`${diff.color}§lArena ${diff.name}`);

    let bodyText = `§7Masuk Arena ${diff.name}?\n\n`;
    bodyText += `${diff.color}Kesulitan: ${diff.name}\n`;
    bodyText += `§7Wave Maks: §f${diff.maxWaves}\n`;
    bodyText += `§7Mob per Wave: §f${diff.baseMobs} + ${diff.mobsPerWave}/wave\n`;
    bodyText += `§7HP Musuh: §fx${diff.hpMultiplier}\n`;
    bodyText += `§7Boss setiap: §f${diff.bossEvery} wave\n\n`;

    bodyText += `§eReward per Wave:\n`;
    bodyText += `  §eRupiah: §f${formatRupiah(diff.rupiahPerWave)}\n`;
    bodyText += `  §cSlayer XP: §f+${diff.slayerXpPerWave}\n`;
    bodyText += `  §bCore: §f${Math.floor(diff.coreChance * 100)}% chance\n\n`;

    bodyText += `§6Biaya Masuk:\n`;
    if (canFreeAttempt) {
        bodyText += `§aGRATIS! (Cooldown 30 menit setelah selesai)`;
    } else {
        const remaining = Math.ceil((ARENA_COOLDOWN_MS - (now - arenaData.lastFreeAttempt)) / 60000);
        bodyText += `§cCooldown ${remaining}m | Bayar §b${ARENA_CORE_COST} Core§c untuk langsung masuk`;
    }

    form.body(bodyText);

    if (canFreeAttempt) {
        form.button1("§aMulai Arena!");
        form.button2("§cBatal");
    } else {
        form.button1(`§bBayar ${ARENA_CORE_COST} Core`);
        form.button2("§cBatal");
    }

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 1) { // Button 2 (Batal)
            openArenaMenu(player);
            return;
        }

        // Check if can afford
        if (!canFreeAttempt) {
            if (coreScore < ARENA_CORE_COST) {
                player.sendMessage("§c[Arena] Core tidak cukup! Butuh §b" + ARENA_CORE_COST + " Core§c.");
                openArenaMenu(player);
                return;
            }
            // Deduct core
            setScore(player, "core", coreScore - ARENA_CORE_COST);
            player.sendMessage(`§b[Arena] -${ARENA_CORE_COST} Core untuk masuk arena.`);
        }

        startArena(player, difficulty);
    });
}

// ============================================================
// ARENA START -- Begin the Combat Challenge
// ============================================================

function startArena(player, difficulty) {
    const diff = DIFFICULTIES[difficulty];
    const arenaData = getPlayerArenaData(player);

    // Update last free attempt
    arenaData.lastFreeAttempt = Date.now();
    arenaData.totalRuns++;
    savePlayerArenaData(player, arenaData);

    // Create arena state -- FIX: set currentWave to 1 immediately so actionbar shows correct info
    const arenaState = {
        playerName: player.name,
        difficulty: difficulty,
        currentWave: 1, // FIX: Start at wave 1, not 0
        maxWaves: diff.maxWaves,
        mobsAlive: 0,
        totalMobsKilled: 0,
        bossesKilled: 0,
        totalRupiah: 0,
        totalXp: 0,
        totalCores: 0,
        totalSp: 0,
        startTime: Date.now(),
        isActive: true,
        failed: false,
        waveSpawning: true // Flag to indicate wave mobs are being spawned
    };

    activeArenas.set(player.name, arenaState);

    // Arena start announcement
    player.sendMessage(`§4§l[ARENA] §r${diff.color}Arena ${diff.name} Dimulai!§f Bersiaplah!`);
    player.sendMessage(`§7Lawan ${diff.maxWaves} wave musuh! Boss muncul setiap ${diff.bossEvery} wave!`);
    player.runCommandAsync(`playsound raid.horn @s`);
    player.runCommandAsync(`playsound beacon.activate @s`);

    // Give temporary effects at start
    player.addEffect("resistance", 100, { amplifier: 0, showParticles: true });
    player.addEffect("regeneration", 100, { amplifier: 0, showParticles: true });

    // FIX: Show arena status in actionbar immediately
    updateArenaActionbar(player);

    // Start first wave after 3 seconds
    system.runTimeout(() => {
        spawnWave(player, difficulty, 1);
    }, 60);
}

// ============================================================
// WAVE SPAWNING
// ============================================================

function spawnWave(player, difficulty, wave) {
    const diff = DIFFICULTIES[difficulty];
    const arenaState = activeArenas.get(player.name);

    if (!arenaState || !arenaState.isActive) return;

    arenaState.currentWave = wave;
    const isBossWave = wave % diff.bossEvery === 0;

    // Calculate mob count for this wave
    const mobCount = Math.min(
        MAX_ACTIVE_ARENA_MOBS,
        diff.baseMobs + (wave - 1) * diff.mobsPerWave
    );

    // Wave announcement
    if (isBossWave) {
        const bossTitle = BOSS_TITLES[Math.floor(Math.random() * BOSS_TITLES.length)];
        const bossName = BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)];
        player.sendMessage(`§4§l[ARENA WAVE ${wave}] §r§6BOSS WAVE! §e${bossTitle} -- ${bossName}§f!`);
        player.runCommandAsync(`playsound raid.horn @s`);
        try { player.runCommandAsync(`camerashake add @s 0.5 2 positional`); } catch(e) {}

        // Spawn boss
        spawnBoss(player, diff, wave, bossTitle, bossName);
        // Also spawn some regular mobs
        const regularMobs = Math.max(1, Math.floor(mobCount / 3));
        for (let i = 0; i < regularMobs; i++) {
            spawnArenaMob(player, diff, wave, false);
        }
        arenaState.mobsAlive = 1 + regularMobs;
    } else {
        player.sendMessage(`§4[Arena Wave ${wave}] §f${mobCount} musuh mendekat!`);
        player.runCommandAsync(`playsound note.pling @s`);

        for (let i = 0; i < mobCount; i++) {
            spawnArenaMob(player, diff, wave, false);
        }
        arenaState.mobsAlive = mobCount;
    }

    // FIX: Mark that wave mobs have been spawned (wave check can now trigger onWaveCleared)
    arenaState.waveSpawning = false;

    // Update actionbar
    updateArenaActionbar(player);

    // Start wave check interval
    startWaveCheck(player);
}

function findValidSpawnPos(player, radius) {
    const loc = player.location;
    const dim = player.dimension;
    // Try up to 10 random positions to find a valid air block
    for (let attempt = 0; attempt < 10; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius + Math.random() * 4;
        const spawnX = Math.floor(loc.x + Math.cos(angle) * dist);
        const spawnZ = Math.floor(loc.z + Math.sin(angle) * dist);

        // Scan upward from player Y to find air
        for (let offsetY = -2; offsetY <= 5; offsetY++) {
            const testY = Math.floor(loc.y) + offsetY;
            try {
                const blockAt = dim.getBlock({ x: spawnX, y: testY, z: spawnZ });
                const blockAbove = dim.getBlock({ x: spawnX, y: testY + 1, z: spawnZ });
                if (blockAt && blockAbove && blockAt.isAir && blockAbove.isAir) {
                    // Check there's solid ground below
                    const blockBelow = dim.getBlock({ x: spawnX, y: testY - 1, z: spawnZ });
                    if (blockBelow && !blockBelow.isAir) {
                        return { x: spawnX + 0.5, y: testY, z: spawnZ + 0.5 };
                    }
                }
            } catch (e) {}
        }
    }
    // Fallback: spawn directly above player
    return { x: Math.floor(loc.x) + 0.5, y: Math.floor(loc.y) + 2, z: Math.floor(loc.z) + 0.5 };
}

// List of undead mob types that burn in sunlight
const UNDEAD_MOBS = ["zombie", "skeleton", "husk", "stray", "wither_skeleton", "zombie_villager", "phantom"];

function isUndeadMob(typeId) {
    const lower = typeId.toLowerCase();
    return UNDEAD_MOBS.some(u => lower.includes(u));
}

function getMobDisplayName(typeId) {
    const names = {
        "minecraft:zombie": "Zombie",
        "minecraft:skeleton": "Skeleton",
        "minecraft:spider": "Spider",
        "minecraft:creeper": "Creeper",
        "minecraft:husk": "Husk",
        "minecraft:stray": "Stray",
        "minecraft:cave_spider": "Cave Spider",
        "minecraft:witch": "Witch",
        "minecraft:zombie_villager_v2": "Zombie Villager",
        "minecraft:evocation_illager": "Evoker",
        "minecraft:vindicator": "Vindicator",
        "minecraft:piglin_brute": "Piglin Brute",
        "minecraft:hoglin": "Hoglin",
        "minecraft:wither_skeleton": "Wither Skeleton",
        "minecraft:blaze": "Blaze",
        "minecraft:phantom": "Phantom",
        "minecraft:ravager": "Ravager",
        "minecraft:warden": "Warden"
    };
    return names[typeId] || typeId.replace("minecraft:", "");
}

function spawnArenaMob(player, diff, wave, isBoss) {
    const spawnPos = findValidSpawnPos(player, WAVE_SPAWN_RADIUS);

    // Pick mob type from pool
    const pool = isBoss ? diff.bossPool : diff.mobPool;
    const mobType = pool[Math.floor(Math.random() * pool.length)];

    try {
        const entity = player.dimension.spawnEntity(mobType, spawnPos);
        if (entity) {
            // Tag as arena mob for tracking
            entity.addTag("arena_mob");
            entity.addTag(`arena_${player.name}`);

            // FIX: Mark arena mobs with visible nameTag so players can identify them
            if (!isBoss) {
                entity.nameTag = `§c[Arena] §f${getMobDisplayName(mobType)}`;
            }

            // FIX: Sunlight immunity for undead mobs (Fire Resistance)
            if (isUndeadMob(mobType)) {
                try { entity.addEffect("fire_resistance", 999999, { amplifier: 0, showParticles: false }); } catch (e) {}
            }

            // Scale HP based on wave and difficulty
            const hpScale = diff.hpMultiplier * (1 + (wave - 1) * 0.15); // +15% per wave
            try {
                const hpComp = entity.getComponent("health");
                if (hpComp) {
                    const baseMaxHp = hpComp.effectiveMax;
                    const newMaxHp = Math.floor(baseMaxHp * hpScale);
                    hpComp.setCurrentValue(newMaxHp);
                }
            } catch (e) {}

            // Buff mobs based on wave
            if (wave >= 3) {
                try { entity.addEffect("speed", 999999, { amplifier: Math.min(Math.floor(wave / 5), 2), showParticles: false }); } catch (e) {}
            }
            if (wave >= 5) {
                try { entity.addEffect("strength", 999999, { amplifier: Math.min(Math.floor(wave / 8), 2), showParticles: false }); } catch (e) {}
            }
            if (wave >= 8) {
                try { entity.addEffect("resistance", 999999, { amplifier: Math.min(Math.floor(wave / 10), 1), showParticles: false }); } catch (e) {}
            }

            // FIX: Make aggressive toward player -- use Script API applyDamage to trigger hurt-by AI
            // This is more reliable than command-based damage
            try {
                system.runTimeout(() => {
                    try {
                        entity.applyDamage(1, { cause: "entityAttack", damagingEntity: player });
                    } catch(e) {}
                }, 5); // Small delay so the mob is fully initialized
            } catch (e) {}
        }
    } catch (e) {}
}

function spawnBoss(player, diff, wave, title, name) {
    const spawnPos = findValidSpawnPos(player, WAVE_SPAWN_RADIUS);

    const bossType = diff.bossPool[Math.floor(Math.random() * diff.bossPool.length)];

    try {
        const entity = player.dimension.spawnEntity(bossType, spawnPos);
        if (entity) {
            entity.addTag("arena_mob");
            entity.addTag("arena_boss");
            entity.addTag(`arena_${player.name}`);
            entity.nameTag = `§4§l[BOSS] §r§e${title}\n§c${name}`;

            // FIX: Sunlight immunity for undead bosses
            if (isUndeadMob(bossType)) {
                try { entity.addEffect("fire_resistance", 999999, { amplifier: 0, showParticles: false }); } catch (e) {}
            }

            // Boss HP scaling -- much higher than regular mobs
            const hpScale = diff.hpMultiplier * (1 + (wave - 1) * 0.2) * 3;
            try {
                const hpComp = entity.getComponent("health");
                if (hpComp) {
                    const baseMaxHp = hpComp.effectiveMax;
                    const newMaxHp = Math.floor(baseMaxHp * hpScale);
                    hpComp.setCurrentValue(newMaxHp);
                }
            } catch (e) {}

            // Boss buffs
            try { entity.addEffect("speed", 999999, { amplifier: 1, showParticles: false }); } catch (e) {}
            try { entity.addEffect("strength", 999999, { amplifier: 2, showParticles: true }); } catch (e) {}
            try { entity.addEffect("resistance", 999999, { amplifier: 1, showParticles: true }); } catch (e) {}

            // FIX: Make boss aggressive -- use Script API applyDamage
            try {
                system.runTimeout(() => {
                    try {
                        entity.applyDamage(1, { cause: "entityAttack", damagingEntity: player });
                    } catch(e) {}
                }, 5);
            } catch (e) {}

            // Visual effect
            try {
                player.dimension.runCommandAsync(`particle minecraft:evocation_fang_particle ${spawnPos.x} ${spawnPos.y + 1} ${spawnPos.z}`);
            } catch (e) {}
        }
    } catch (e) {}
}

// ============================================================
// WAVE COMPLETION CHECK
// ============================================================

function startWaveCheck(player) {
    const arenaState = activeArenas.get(player.name);
    if (!arenaState || !arenaState.isActive) return;

    const checkId = system.runInterval(() => {
        const state = activeArenas.get(player.name);
        if (!state || !state.isActive) {
            system.clearRun(checkId);
            return;
        }

        // Check if player is still online
        const onlinePlayer = world.getAllPlayers().find(p => p.name === player.name);
        if (!onlinePlayer) {
            endArena(player.name, false, "Player disconnect");
            system.clearRun(checkId);
            return;
        }

        // Count alive arena mobs for this player + aggro ping
        let mobsAlive = 0;
        try {
            const entities = onlinePlayer.dimension.getEntities({
                tags: [`arena_${player.name}`],
                excludeTypes: ["minecraft:player", "minecraft:item"]
            });
            mobsAlive = entities.length;

            // AGGRO PING: Force mobs to chase player if they wander too far
            const playerLoc = onlinePlayer.location;
            for (const entity of entities) {
                try {
                    const mobLoc = entity.location;
                    const dx = mobLoc.x - playerLoc.x;
                    const dy = mobLoc.y - playerLoc.y;
                    const dz = mobLoc.z - playerLoc.z;
                    const distSq = dx * dx + dy * dy + dz * dz;

                    if (distSq > 400) { // More than ~20 blocks away -- teleport close
                        // Teleport to a position near the player
                        const angle = Math.random() * Math.PI * 2;
                        const teleportX = playerLoc.x + Math.cos(angle) * 5;
                        const teleportZ = playerLoc.z + Math.sin(angle) * 5;
                        const teleportY = playerLoc.y;
                        try {
                            entity.teleport({ x: teleportX, y: teleportY, z: teleportZ }, { rotation: { x: 0, y: 0 } });
                        } catch(te) {}
                        // Re-aggro after teleport
                        try { entity.applyDamage(1, { cause: "entityAttack", damagingEntity: onlinePlayer }); } catch(de) {}
                    } else if (distSq > 144) { // More than ~12 blocks away -- give speed boost + re-aggro
                        try { entity.addEffect("speed", 60, { amplifier: 2, showParticles: false }); } catch(se) {}
                        try { entity.applyDamage(1, { cause: "entityAttack", damagingEntity: onlinePlayer }); } catch(de) {}
                    } else if (distSq > 64) { // More than ~8 blocks -- mild speed + re-aggro
                        try { entity.addEffect("speed", 40, { amplifier: 1, showParticles: false }); } catch(se) {}
                        try { entity.applyDamage(1, { cause: "entityAttack", damagingEntity: onlinePlayer }); } catch(de) {}
                    }
                } catch (e) {}
            }
        } catch (e) {}

        state.mobsAlive = mobsAlive;

        // Update actionbar
        updateArenaActionbar(onlinePlayer);

        // Wave cleared! FIX: Only trigger if wave has actually spawned (not during initial countdown)
        if (mobsAlive === 0 && !state.waveSpawning) {
            system.clearRun(checkId);
            onWaveCleared(onlinePlayer);
        }
    }, WAVE_CHECK_INTERVAL);
}

function onWaveCleared(player) {
    const arenaState = activeArenas.get(player.name);
    if (!arenaState || !arenaState.isActive) return;

    const diff = DIFFICULTIES[arenaState.difficulty];
    const wave = arenaState.currentWave;
    const isBossWave = wave % diff.bossEvery === 0;

    // Award wave rewards
    const rupiahReward = Math.floor(diff.rupiahPerWave * diff.rewardMultiplier);
    arenaState.totalRupiah += rupiahReward;

    // Give Rupiah
    const currentCoins = getScore(player, "dompet");
    setScore(player, "dompet", currentCoins + rupiahReward);

    // Give Slayer XP
    addXp(player, "slayer", diff.slayerXpPerWave);
    arenaState.totalXp += diff.slayerXpPerWave;

    // Core chance
    if (Math.random() < diff.coreChance) {
        const coreScore = getScore(player, "core");
        setScore(player, "core", coreScore + 1);
        arenaState.totalCores++;
        player.sendMessage(`§b[Arena] §f+1 Core dari wave ${wave}!`);
    }

    // SP bonus at milestone waves
    const rpgData = getPlayerRpgData(player);
    if (diff.spAtWave.includes(wave)) {
        rpgData.sp += 2;
        arenaState.totalSp += 2;
        savePlayerRpgData(player, rpgData);
        player.sendMessage(`§d[Arena] §f+2 SP Bonus di wave ${wave}!`);
    }

    // Boss kill tracking
    if (isBossWave) {
        arenaState.bossesKilled++;
        player.runCommandAsync(`playsound random.levelup @s`);
        player.sendMessage(`§6§l[ARENA] §r§eBoss wave ${wave} berhasil dikalahkan!`);
    }

    // Arena Points
    const pointsEarned = Math.floor((isBossWave ? 5 : 1) * diff.rewardMultiplier);
    arenaState.arenaPoints = (arenaState.arenaPoints || 0) + pointsEarned;

    // Wave clear message
    player.sendMessage(`§a[Arena Wave ${wave}] §fSelesai! +§e${formatRupiah(rupiahReward)}§f +§c${diff.slayerXpPerWave} XP§f +§6${pointsEarned} AP`);

    // Check if arena is complete
    if (wave >= diff.maxWaves) {
        // ARENA CLEARED!
        endArena(player.name, true, "All waves cleared!");
        return;
    }

    // Next wave after 3 seconds
    player.sendMessage(`§7Wave ${wave + 1} dimulai dalam 3 detik...`);
    system.runTimeout(() => {
        const state = activeArenas.get(player.name);
        if (state && state.isActive && state.currentWave === wave) {
            spawnWave(player, arenaState.difficulty, wave + 1);
        }
    }, 60);
}

// ============================================================
// ARENA END
// ============================================================

function endArena(playerName, success, reason) {
    const arenaState = activeArenas.get(playerName);
    if (!arenaState) return;

    arenaState.isActive = false;

    // Kill remaining arena mobs
    try {
        const player = world.getAllPlayers().find(p => p.name === playerName);
        if (player) {
            const entities = player.dimension.getEntities({
                tags: [`arena_${playerName}`]
            });
            for (const entity of entities) {
                try { entity.remove(); } catch (e) {}
            }
        }
    } catch (e) {}

    // Update player data
    const player = world.getAllPlayers().find(p => p.name === playerName);
    if (player) {
        const arenaData = getPlayerArenaData(player);
        const diff = DIFFICULTIES[arenaState.difficulty];

        // Update best wave
        if (arenaState.currentWave > arenaData.bestWave[arenaState.difficulty]) {
            arenaData.bestWave[arenaState.difficulty] = arenaState.currentWave;
        }

        arenaData.totalWavesCleared += arenaState.currentWave;
        arenaData.totalBossesKilled += arenaState.bossesKilled;
        arenaData.arenaPoints = (arenaData.arenaPoints || 0) + (arenaState.arenaPoints || 0);

        savePlayerArenaData(player, arenaData);

        // Track stats
        trackStat(player, "arenaRuns", 1);
        trackStat(player, "arenaWaves", arenaState.currentWave);
        if (arenaState.bossesKilled > 0) trackStat(player, "arenaBosses", arenaState.bossesKilled);

        // Achievement checks
        unlockAchievement(player, "first_arena");
        if (arenaState.currentWave >= 10) unlockAchievement(player, "arena_wave10");
        if (success) unlockAchievement(player, "arena_clear_biasa");
        if (success && arenaState.difficulty === "sulit") unlockAchievement(player, "arena_clear_sulit");
        if (success && arenaState.difficulty === "neraka") unlockAchievement(player, "arena_clear_neraka");
        if (arenaState.bossesKilled >= 10) unlockAchievement(player, "arena_10bosses");

        // Show results
        showArenaResults(player, arenaState, success);
    }

    // Remove from active arenas
    activeArenas.delete(playerName);
}

function showArenaResults(player, arenaState, success) {
    const diff = DIFFICULTIES[arenaState.difficulty];
    const duration = Math.floor((Date.now() - arenaState.startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    // Celebration effects
    if (success) {
        player.runCommandAsync(`summon fireworks_rocket ${Math.floor(player.location.x)} ${Math.floor(player.location.y) + 1} ${Math.floor(player.location.z)}`);
        system.runTimeout(() => {
            try { player.runCommandAsync(`summon fireworks_rocket ${Math.floor(player.location.x)} ${Math.floor(player.location.y) + 2} ${Math.floor(player.location.z)}`); } catch (e) {}
        }, 10);
        player.runCommandAsync(`playsound random.levelup @s`);
        world.sendMessage(`§4§l[ARENA] §r§b${player.name} §fberhasil menyelesaikan §4Arena ${diff.name}§f! Wave ${arenaState.currentWave}/${diff.maxWaves}`);
    } else {
        player.runCommandAsync(`playsound note.bass @s`);
    }

    const form = new ActionFormData();
    form.title(success ? "§a§lArena Berhasil!" : "§c§lArena Gagal");

    let bodyText = `${diff.color}Arena ${diff.name} -- ${success ? "§aBERHASIL!" : "§cKALAH"}\n\n`;
    bodyText += `§7Wave Dicapai: §f${arenaState.currentWave}/${diff.maxWaves}\n`;
    bodyText += `§7Boss Dikalahkan: §f${arenaState.bossesKilled}\n`;
    bodyText += `§7Durasi: §f${minutes}m ${seconds}s\n\n`;

    bodyText += `§e§l--- Reward ---§r\n`;
    bodyText += `§eRupiah: §f+${formatRupiah(arenaState.totalRupiah)}\n`;
    bodyText += `§cSlayer XP: §f+${arenaState.totalXp}\n`;
    if (arenaState.totalCores > 0) bodyText += `§bCore: §f+${arenaState.totalCores}\n`;
    if (arenaState.totalSp > 0) bodyText += `§dSP: §f+${arenaState.totalSp}\n`;
    bodyText += `§6Poin Arena: §f+${arenaState.arenaPoints || 0}\n`;

    form.body(bodyText);
    form.button("§aKembali ke Arena");
    form.button("§cKembali ke Menu");

    form.show(player).then(res => {
        if (res.canceled || res.selection === 1) {
            import("./menu_system.js").then(mod => {
                system.runTimeout(() => { mod.openRpgGachaMenu(player); }, 5);
            }).catch(() => {});
        } else {
            openArenaMenu(player);
        }
    });
}

// ============================================================
// ARENA STATUS -- During active arena
// ============================================================

function openArenaStatusMenu(player) {
    const arenaState = activeArenas.get(player.name);
    if (!arenaState) {
        openArenaMenu(player);
        return;
    }

    const diff = DIFFICULTIES[arenaState.difficulty];
    const form = new ActionFormData();
    form.title("§4§lArena Aktif");

    let bodyText = `${diff.color}Arena ${diff.name}\n`;
    bodyText += `§7Wave: §f${arenaState.currentWave}/${diff.maxWaves}\n`;
    bodyText += `§7Musuh Hidup: §f${arenaState.mobsAlive}\n`;
    bodyText += `§7Boss Dikalahkan: §f${arenaState.bossesKilled}\n`;
    bodyText += `§7Rupiah Didapat: §e${formatRupiah(arenaState.totalRupiah)}\n\n`;
    bodyText += `§cMenyerah akan mengakhiri arena dan kamu tetap mendapat reward dari wave yang sudah selesai.`;

    form.body(bodyText);
    form.button("§cMenyerah\n§7Akhirin arena & ambil reward");
    form.button("§7Kembali\n§7Tutup menu & lanjut fight");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) {
            endArena(player.name, false, "Player surrendered");
        }
    });
}

// ============================================================
// ACTIONBAR UPDATE
// ============================================================

function updateArenaActionbar(player) {
    const arenaState = activeArenas.get(player.name);
    if (!arenaState || !arenaState.isActive) return;

    const diff = DIFFICULTIES[arenaState.difficulty];
    const isBossWave = arenaState.currentWave > 0 && arenaState.currentWave % diff.bossEvery === 0;
    const waveTag = isBossWave ? "§6BOSS" : "Wave";

    // FIX: Show different messages based on state
    let mobInfo;
    if (arenaState.waveSpawning) {
        mobInfo = "§eBersiap...";
    } else if (arenaState.mobsAlive > 0) {
        mobInfo = `§c${arenaState.mobsAlive} musuh`;
    } else {
        mobInfo = "§aSelesai!";
    }

    player.onScreenDisplay.setActionBar(
        `§4§lARENA ${diff.name.toUpperCase()} §r| ${waveTag} §f${arenaState.currentWave}/${diff.maxWaves} | ${mobInfo}`
    );
}

// ============================================================
// ARENA SHOP -- Exchange Arena Points
// ============================================================

function openArenaShop(player) {
    const arenaData = getPlayerArenaData(player);
    const points = arenaData.arenaPoints || 0;

    const form = new ActionFormData();
    form.title("§6§lToko Hadiah Arena");

    let bodyText = `§6Poin Arena: §f${points}\n\n`;
    bodyText += `§7Tukar poin dengan hadiah eksklusif!`;

    form.body(bodyText);

    form.button("§eRp50.000\n§720 Poin Arena");
    form.button("§b1 Core\n§750 Poin Arena");
    form.button("§d2 Skill Points\n§740 Poin Arena");
    form.button("§6Pecahan Inti x5\n§730 Poin Arena");
    form.button("§aTotem of Undying\n§7100 Poin Arena");
    form.button("§bEnchanted Golden Apple\n§775 Poin Arena");
    form.button("§cNetherite Ingot\n§7120 Poin Arena");
    form.button("§cKembali ke Arena");

    form.show(player).then(res => {
        if (res.canceled) return;

        const costs = [20, 50, 40, 30, 100, 75, 120];
        const selection = res.selection;

        if (selection === 7) {
            openArenaMenu(player);
            return;
        }

        if (selection >= 0 && selection < costs.length) {
            if (points < costs[selection]) {
                player.sendMessage("§c[Arena] Poin Arena tidak cukup!");
                openArenaShop(player);
                return;
            }

            arenaData.arenaPoints -= costs[selection];
            savePlayerArenaData(player, arenaData);

            switch (selection) {
                case 0: // Rp50.000
                    setScore(player, "dompet", getScore(player, "dompet") + 50000);
                    player.sendMessage("§a[Arena] +Rp50.000 dari Toko Arena!");
                    break;
                case 1: // 1 Core
                    setScore(player, "core", getScore(player, "core") + 1);
                    player.sendMessage("§b[Arena] +1 Core dari Toko Arena!");
                    break;
                case 2: // 2 SP
                    const rpgData = getPlayerRpgData(player);
                    rpgData.sp += 2;
                    savePlayerRpgData(player, rpgData);
                    player.sendMessage("§d[Arena] +2 SP dari Toko Arena!");
                    break;
                case 3: // Pecahan Inti x5
                    try {
                        const shardStr = player.getDynamicProperty("gacha_shards");
                        const shards = shardStr ? JSON.parse(shardStr) : { count: 0 };
                        shards.count += 5;
                        player.setDynamicProperty("gacha_shards", JSON.stringify(shards));
                    } catch (e) {}
                    player.sendMessage("§b[Arena] +5 Pecahan Inti dari Toko Arena!");
                    break;
                case 4: // Totem
                    try {
                        const totem = new ItemStack("minecraft:totem_of_undying", 1);
                        player.dimension.spawnItem(totem, player.location);
                        player.sendMessage("§a[Arena] Totem of Undying dari Toko Arena!");
                    } catch (e) {}
                    break;
                case 5: // Enchanted Golden Apple
                    try {
                        const egap = new ItemStack("minecraft:enchanted_golden_apple", 1);
                        player.dimension.spawnItem(egap, player.location);
                        player.sendMessage("§a[Arena] Enchanted Golden Apple dari Toko Arena!");
                    } catch (e) {}
                    break;
                case 6: // Netherite Ingot
                    try {
                        const netherite = new ItemStack("minecraft:netherite_ingot", 1);
                        player.dimension.spawnItem(netherite, player.location);
                        player.sendMessage("§a[Arena] Netherite Ingot dari Toko Arena!");
                    } catch (e) {}
                    break;
            }

            player.runCommandAsync(`playsound random.levelup @s`);
            openArenaShop(player);
        }
    });
}

// ============================================================
// ARENA LEADERBOARD
// ============================================================

function openArenaLeaderboard(player) {
    const form = new ActionFormData();
    form.title("§9§lPapan Peringkat Arena");

    let bodyText = `§e§l--- Rekor Arena Terbaik ---§r\n\n`;

    // Collect all player data from online players + dynamic properties
    const allPlayers = world.getAllPlayers();
    const records = [];

    for (const p of allPlayers) {
        try {
            const data = getPlayerArenaData(p);
            const bestTotal = data.bestWave.biasa + data.bestWave.sulit * 2 + data.bestWave.neraka * 3;
            records.push({
                name: p.name,
                biasa: data.bestWave.biasa,
                sulit: data.bestWave.sulit,
                neraka: data.bestWave.neraka,
                total: bestTotal,
                runs: data.totalRuns
            });
        } catch (e) {}
    }

    // Sort by total score
    records.sort((a, b) => b.total - a.total);

    if (records.length === 0) {
        bodyText += "§7Belum ada rekor. Jadilah yang pertama!";
    } else {
        for (let i = 0; i < Math.min(records.length, 10); i++) {
            const r = records[i];
            const medal = i === 0 ? "§6#1" : i === 1 ? "§7#2" : i === 2 ? "§c#3" : `§7#${i + 1}`;
            bodyText += `${medal} §b${r.name}\n`;
            bodyText += `  §aBiasa:${r.biasa} §eSulit:${r.sulit} §cNeraka:${r.neraka} §7| Total: §f${r.total}\n`;
        }
    }

    form.body(bodyText);
    form.button("§cKembali ke Arena");

    form.show(player).then(() => {
        openArenaMenu(player);
    });
}

// ============================================================
// ARENA GUIDE
// ============================================================

function openArenaGuide(player) {
    const form = new ActionFormData();
    form.title("§e§lPanduan Arena");

    form.body(
        "§e§l1. Apa itu Arena?§r\n" +
        "Arena Pertarungan adalah tantangan wave-based di mana kamu melawan mob yang makin kuat setiap wave. " +
        "Gunakan semua kekuatan RPG-mu: skill aktif, pasif profesi, berkat kuno, dan item gacha untuk bertahan hidup!\n\n" +

        "§e§l2. Cara Masuk Arena§r\n" +
        "Buka Jam Menu Utama -> Atribut & Kekuatan -> Arena Pertarungan. " +
        "Gratis setiap 30 menit, atau bayar §b2 Core§f untuk masuk kapan saja.\n\n" +

        "§e§l3. Tingkat Kesulitan§r\n" +
        "§aBiasa§f: Wave 1-10, mob lemah, reward x1. Cocok buat pemula.\n" +
        "§eSulit§f: Wave 1-15, mob lebih kuat, reward x2. Perlu level Slayer tinggi.\n" +
        "§cNeraka§f: Wave 1-20, mob brutal, reward x3.5. Hanya untuk yang terkuat!\n\n" +

        "§e§l4. Sistem Wave§r\n" +
        "Setiap wave men-spawn mob di sekitarmu. Bunuh semua mob untuk lanjut ke wave berikutnya. " +
        "Jumlah dan kekuatan mob meningkat tiap wave.\n\n" +

        "§e§l5. Boss Wave§r\n" +
        "Setiap 5 wave, muncul Boss yang jauh lebih kuat dari mob biasa. Boss punya HP tinggi, " +
        "damage besar, dan efek buff. Tapi reward-nya juga lebih besar!\n\n" +

        "§e§l6. Reward§r\n" +
        "Setiap wave yang selesai memberi:\n" +
        "- §eRupiah§f (jumlah tergantung kesulitan)\n" +
        "- §cSlayer XP§f (naikin level Slayer)\n" +
        "- §bCore§f (peluang kecil per wave)\n" +
        "- §dSP§f (bonus di wave milestone)\n" +
        "- §6Poin Arena§f (bisa ditukar di Toko)\n\n" +

        "§e§l7. Arena Berakhir Jika...§r\n" +
        "- Kamu menyelesaikan semua wave (BERHASIL!)\n" +
        "- Kamu mati selama arena (reward tetap didapat dari wave yang selesai)\n" +
        "- Kamu menyerah via menu\n" +
        "- Kamu disconnect dari server\n\n" +

        "§e§l8. Tips§r\n" +
        "- Bawa makanan & potion sebelum masuk arena!\n" +
        "- Pasang skill terbaikmu di Manajemen Kemampuan.\n" +
        "- Boss bisa dikalahkan lebih mudah pakai skill aktif.\n" +
        "- Level Slayer yang tinggi = pasif profesi yang lebih kuat.\n" +
        "- Item gacha dengan efek combat sangat membantu!\n" +
        "- Arena Neraka sangat sulit -- pastikan siap sebelum masuk!"
    );

    form.button("§cKembali ke Arena");

    form.show(player).then(() => {
        openArenaMenu(player);
    });
}

// ============================================================
// PLAYER DEATH HANDLER -- Called from main.js
// ============================================================

export function handleArenaPlayerDeath(player) {
    if (activeArenas.has(player.name)) {
        endArena(player.name, false, "Player died");
    }
}

// ============================================================
// CHECK IF PLAYER IS IN ARENA
// ============================================================

export function isPlayerInArena(playerName) {
    return activeArenas.has(playerName);
}

// ============================================================
// ARENA ACTIONBAR LOOP -- Called from main.js interval
// ============================================================

export function updateArenaActionbars() {
    for (const [playerName, arenaState] of activeArenas) {
        if (!arenaState.isActive) continue;
        const player = world.getAllPlayers().find(p => p.name === playerName);
        if (player) {
            updateArenaActionbar(player);
        }
    }
}

// ============================================================
// ARENA KILL TRACKING -- Called from main.js entityDie
// ============================================================

export function handleArenaMobKill(deadEntity, killer) {
    if (!deadEntity.hasTag("arena_mob")) return false;

    // Extract player name from tag
    const arenaTag = deadEntity.getTags().find(t => t.startsWith("arena_") && t !== "arena_mob" && t !== "arena_boss");
    if (!arenaTag) return false;

    const playerName = arenaTag.replace("arena_", "");
    const isBoss = deadEntity.hasTag("arena_boss");

    if (isBoss && killer && killer.typeId === "minecraft:player") {
        // Boss kill announcement
        const arenaState = activeArenas.get(playerName);
        if (arenaState) {
            const player = world.getAllPlayers().find(p => p.name === playerName);
            if (player) {
                player.runCommandAsync(`playsound random.levelup @s`);
                player.sendMessage(`§6§l[Arena] §r§eBoss berhasil dikalahkan! Bonus reward!`);

                // Extra boss reward
                const diff = DIFFICULTIES[arenaState.difficulty];
                const bossRupiah = diff.rupiahPerWave * 3;
                const currentCoins = getScore(player, "dompet");
                setScore(player, "dompet", currentCoins + bossRupiah);
                arenaState.totalRupiah += bossRupiah;
                arenaState.arenaPoints = (arenaState.arenaPoints || 0) + 5;
            }
        }
    }

    return true; // Was an arena mob kill
}
