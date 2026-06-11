import { world, system, ItemStack } from "@minecraft/server";
import { safeGetGachaEffect } from "./gacha_effects.js";

export const MAX_LEVEL = 50;

// ============================================================
// PROFESSION PASSIVE SKILLS (5 tiers per profession, auto-unlock by level)
// ============================================================

export const PROFESSION_PASSIVES = {
    mining: [
        { level: 5,  name: "Tangan Penambang",  desc: "Haste 1 saat memegang Pickaxe", icon: "§b" },
        { level: 15, name: "Penglihatan Bawah Tanah", desc: "Night Vision saat berada di bawah Y=0", icon: "§9" },
        { level: 25, name: "Penambang Veteran",   desc: "Haste 2 saat memegang Pickaxe (upgrade)", icon: "§e" },
        { level: 35, name: "Ketahanan Gua",      desc: "Resistance 1 saat berada di bawah Y=0", icon: "§7" },
        { level: 50, name: "Master Tambang",      desc: "Fire Resistance + Haste 2 saat memegang Pickaxe, Night Vision saat Y<0", icon: "§6" }
    ],
    woodcutting: [
        { level: 5,  name: "Kaki Ringan",        desc: "Speed 1 saat memegang Axe", icon: "§a" },
        { level: 15, name: "Kulit Kayu",         desc: "Resistance 1 saat memegang Axe", icon: "§6" },
        { level: 25, name: "Penebang Cepat",     desc: "Haste 1 saat memegang Axe", icon: "§e" },
        { level: 35, name: "Lompatan Hutan",     desc: "Jump Boost 1 permanen", icon: "§2" },
        { level: 50, name: "Master Hutan",       desc: "Speed 2 + Jump Boost 2 + Resistance 1 permanen", icon: "§a" }
    ],
    slayer: [
        { level: 5,  name: "Refleks Tempur",     desc: "Speed 1 permanen", icon: "§c" },
        { level: 15, name: "Tenaga Iblis",       desc: "Strength 1 saat memegang Sword/Axe", icon: "§4" },
        { level: 25, name: "Darah Pejuang",      desc: "Regeneration 1 saat HP di bawah 50%", icon: "§d" },
        { level: 35, name: "Tubuh Baja",         desc: "Health Boost 1 permanen", icon: "§7" },
        { level: 50, name: "Master Peperangan",   desc: "Strength 2 + Speed 2 + Health Boost 2", icon: "§c" }
    ],
    farming: [
        { level: 5,  name: "Tangan Petani",      desc: "Haste 1 saat memegang Hoe", icon: "§2" },
        { level: 15, name: "Kaki Petani",        desc: "Jump Boost 1 permanen", icon: "§a" },
        { level: 25, name: "Langkah Cepat",      desc: "Speed 1 saat memegang Hoe", icon: "§e" },
        { level: 35, name: "Tubuh Kuat",         desc: "Resistance 1 saat memegang Hoe", icon: "§7" },
        { level: 50, name: "Master Pertanian",    desc: "Haste 2 + Jump Boost 2 permanen", icon: "§6" }
    ],
    fishing: [
        { level: 5,  name: "Kaki Nelayan",       desc: "Speed 1 permanen", icon: "§3" },
        { level: 15, name: "Paru Ikan",          desc: "Water Breathing saat berada di air", icon: "§9" },
        { level: 25, name: "Ahli Selam",         desc: "Dolphin's Grace saat berada di air", icon: "§b" },
        { level: 35, name: "Penglihatan Laut",   desc: "Night Vision saat berada di air", icon: "§d" },
        { level: 50, name: "Master Samudra",     desc: "Conduit Power + Night Vision + Dolphin's Grace saat di air", icon: "§6" }
    ]
};

/**
 * Get all unlocked passive tiers for a given profession at a given level.
 * Returns array of passive objects that are unlocked.
 */
export function getUnlockedPassives(profKey, level) {
    const passives = PROFESSION_PASSIVES[profKey];
    if (!passives) return [];
    return passives.filter(p => level >= p.level);
}

/**
 * Get the next passive tier to unlock for a profession.
 * Returns the passive object or null if all unlocked.
 */
export function getNextPassiveTier(profKey, level) {
    const passives = PROFESSION_PASSIVES[profKey];
    if (!passives) return null;
    return passives.find(p => level < p.level) || null;
}

export function getXpRequired(level) {
    if (level >= MAX_LEVEL) return Infinity;
    // Base XP: 100, scales by 1.2 each level
    return Math.floor(100 * Math.pow(1.2, level - 1));
}

export function getPlayerRpgData(player) {
    const defaultData = {
        mining: { level: 1, xp: 0 },
        woodcutting: { level: 1, xp: 0 },
        slayer: { level: 1, xp: 0 },
        farming: { level: 1, xp: 0 },
        fishing: { level: 1, xp: 0 },
        sp: 0,
        unlockedSkills: [],
        equippedSkills: [],
        unlockedGachaPassives: [],
        equippedGachaPassives: [],
        passiveConstellation: {}
    };
    try {
        const str = player.getDynamicProperty("rpg_data");
        if (str && typeof str === 'string') {
            let data = { ...defaultData, ...JSON.parse(str) };

            // Migration for old skills
            let needsSave = false;

            if (data.unlockedSkills.includes("lumberjacks_sweep")) {
                data.unlockedSkills = data.unlockedSkills.map(s => s === "lumberjacks_sweep" ? "treecapitator" : s);
                needsSave = true;
            }
            if (data.equippedSkills.includes("lumberjacks_sweep")) {
                data.equippedSkills = data.equippedSkills.map(s => s === "lumberjacks_sweep" ? "treecapitator" : s);
                needsSave = true;
            }

            if (data.unlockedSkills.includes("siphon_strike")) {
                data.unlockedSkills = data.unlockedSkills.map(s => s === "siphon_strike" ? "cleave_strike" : s);
                needsSave = true;
            }
            if (data.equippedSkills.includes("siphon_strike")) {
                data.equippedSkills = data.equippedSkills.map(s => s === "siphon_strike" ? "cleave_strike" : s);
                needsSave = true;
            }

            if (needsSave) {
                savePlayerRpgData(player, data);
            }

            return data;
        }
    } catch(e) {}
    return defaultData;
}

export function savePlayerRpgData(player, data) {
    player.setDynamicProperty("rpg_data", JSON.stringify(data));
}

// Milestone bonus SP at certain levels
const MILESTONES = { 10: 3, 20: 5, 30: 8, 40: 12, 50: 20 };

export function addXp(player, profession, amount) {
    const data = getPlayerRpgData(player);
    if (!data[profession]) return false;
    if (data[profession].level >= MAX_LEVEL) return false;

    // Proficiency Bonus: +50% XP per 10 levels in this profession
    // Lv1-9 = 1x, Lv10-19 = 1.5x, Lv20-29 = 2x, Lv30-39 = 2.5x, Lv40-49 = 3x
    const proficiencyMultiplier = 1 + Math.floor(data[profession].level / 10) * 0.5;
    let adjustedAmount = Math.floor(amount * proficiencyMultiplier);

    // Event: Gelora Pengalaman (XP Surge) -- Double XP
    let isXpSurge = false;
    try {
        const evtData = world.getDynamicProperty("active_event");
        if (evtData && typeof evtData === 'string') {
            const evt = JSON.parse(evtData);
            if (evt.id === "xp_surge" && (evt.duration === 0 || Date.now() < evt.endTime)) {
                adjustedAmount *= 2;
                isXpSurge = true;
            }
        }
    } catch(e) {}

    data[profession].xp += adjustedAmount;
    let leveledUp = false;
    let milestoneLevel = 0;
    let milestoneBonus = 0;
    let unlockedPassiveTier = null;

    while (data[profession].level < MAX_LEVEL && data[profession].xp >= getXpRequired(data[profession].level)) {
        data[profession].xp -= getXpRequired(data[profession].level);
        const prevLevel = data[profession].level;
        data[profession].level += 1;
        data.sp += 1; // Gain 1 Skill Point per level
        leveledUp = true;

        // Check milestone bonus
        if (MILESTONES[data[profession].level]) {
            milestoneLevel = data[profession].level;
            milestoneBonus = MILESTONES[data[profession].level];
            data.sp += milestoneBonus;
        }

        // Check if this level unlocks a new passive tier
        const profPassives = PROFESSION_PASSIVES[profession];
        if (profPassives) {
            const newPassive = profPassives.find(p => p.level === data[profession].level);
            if (newPassive) {
                unlockedPassiveTier = newPassive;
            }
        }
    }

    // Set temporary flag so Actionbar knows to show this profession's XP bar
    // Include XP surge info so the actionbar can show it
    player.setDynamicProperty("rpg_recent_xp", JSON.stringify({
        prof: profession,
        time: Date.now(),
        surge: isXpSurge
    }));

    savePlayerRpgData(player, data);

    if (leveledUp) {
        player.runCommandAsync(`playsound random.levelup @s`);
        player.sendMessage(`§a[RPG] §fLevel §e${profession.toUpperCase()} §fnaik ke level §b${data[profession].level}§f! (+1 Skill Point)`);

        if (milestoneLevel > 0) {
            player.runCommandAsync(`playsound random.levelup @s`);
            player.sendMessage(`§6[RPG] §e* MILESTONE ${profession.toUpperCase()} Level ${milestoneLevel}! §f+${milestoneBonus} Bonus SP!`);
            world.sendMessage(`§6§l[MILESTONE] §r§b${player.name} §fmencapai §e${profession.toUpperCase()} Level ${milestoneLevel}§f!`);
        }

        // Notify passive tier unlock
        if (unlockedPassiveTier) {
            player.runCommandAsync(`playsound random.levelup @s`);
            player.sendMessage(`§d[RPG] §5* PASIF TERBUKA! §d${unlockedPassiveTier.name}§f: ${unlockedPassiveTier.desc}`);

            // Master tier (Lv50) gets world announcement
            if (unlockedPassiveTier.level === 50) {
                world.sendMessage(`§d§l[PASIF MASTER] §r§b${player.name} §fmembuka §d${unlockedPassiveTier.name}§f (${profession.toUpperCase()} Lv50)!`);
            }
        }

        applyPassiveStats(player, data);
    }
    return true;
}

export function generateXpBar(xp, maxXp) {
    const barLength = 20;
    const filled = Math.min(barLength, Math.floor((xp / maxXp) * barLength));
    const empty = barLength - filled;
    return `§a${"|".repeat(filled)}§7${"|".repeat(empty)}`;
}

// Helper to execute block breaking recursively for active skills
export function breakBlockArea(player, originBlock, radius, mainHandItem) {
    const dimension = player.dimension;
    let brokenCount = 0;

    // Check Fortune level on main hand item
    let fortuneLevel = 0;
    if (mainHandItem) {
        const enchantable = mainHandItem.getComponent("enchantable") || mainHandItem.getComponent("minecraft:enchantable");
        if (enchantable) {
            try {
                // Attempt to get fortune level. @minecraft/server versions vary on enchantment handling.
                const fortuneEnchant = enchantable.getEnchantment("fortune");
                if (fortuneEnchant) {
                    fortuneLevel = fortuneEnchant.level;
                }
            } catch(e) {}
        }
    }

    // Hardcoded safety limits to prevent crashing the server
    if (radius > 2) radius = 2;

    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            for (let z = -radius; z <= radius; z++) {
                if (x === 0 && y === 0 && z === 0) continue; // Original block already broken
                try {
                    const bx = originBlock.x + x;
                    const by = originBlock.y + y;
                    const bz = originBlock.z + z;

                    const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });

                    if (targetBlock && !targetBlock.isAir) {
                        const id = targetBlock.typeId;

                        // Anti-Grief Check: Only break natural terrain blocks
                        const isNatural = id.includes("stone") || id.includes("ore") || id.includes("dirt") || id.includes("sand") || id.includes("gravel") || id.includes("deepslate") || id.includes("tuff") || id.includes("calcite") || id.includes("diorite") || id.includes("andesite") || id.includes("granite") || id.includes("basalt") || id.includes("netherrack") || id.includes("obsidian") || id.includes("ancient_debris");
                        const isArtificial = id.includes("stairs") || id.includes("slab") || id.includes("wall") || id.includes("brick") || id.includes("cobblestone") || id.includes("smooth_stone");

                        if (isNatural && !isArtificial && id !== "minecraft:bedrock" && id !== "minecraft:barrier" && id !== "minecraft:deny" && id !== "minecraft:allow" && id !== "minecraft:border_block") {

                            // Custom Fortune Logic for Ores
                            if (fortuneLevel > 0 && id.includes("ore")) {
                                // Calculate extra drops (Vanilla Fortune roughly: level 1 = 33% chance for x2, level 2 = 25% chance each for x2,x3)
                                // Simplified implementation for performance
                                let extraMultiplier = 1;
                                const roll = Math.random();
                                if (fortuneLevel === 1 && roll < 0.33) extraMultiplier = 2;
                                else if (fortuneLevel === 2) extraMultiplier = roll < 0.25 ? 3 : (roll < 0.5 ? 2 : 1);
                                else if (fortuneLevel >= 3) extraMultiplier = roll < 0.2 ? 4 : (roll < 0.4 ? 3 : (roll < 0.6 ? 2 : 1));

                                if (extraMultiplier > 1) {
                                    // Spawn extra drops directly. We map ore to its raw drop.
                                    let dropItem = "";
                                    if (id.includes("diamond")) dropItem = "minecraft:diamond";
                                    else if (id.includes("emerald")) dropItem = "minecraft:emerald";
                                    else if (id.includes("coal")) dropItem = "minecraft:coal";
                                    else if (id.includes("iron")) dropItem = "minecraft:raw_iron";
                                    else if (id.includes("gold")) dropItem = "minecraft:raw_gold";
                                    else if (id.includes("copper")) dropItem = "minecraft:raw_copper";
                                    else if (id.includes("lapis")) dropItem = "minecraft:lapis_lazuli";
                                    else if (id.includes("redstone")) dropItem = "minecraft:redstone";
                                    else if (id.includes("quartz")) dropItem = "minecraft:quartz";
                                    else if (id.includes("amethyst")) dropItem = "minecraft:amethyst_shard";

                                    if (dropItem !== "") {
                                        // We spawn (extraMultiplier - 1) because the block destruction itself will drop 1
                                        const extraCount = extraMultiplier - 1;
                                        try {
                                            const itemStack = new ItemStack(dropItem, extraCount);
                                            dimension.spawnItem(itemStack, {x: bx + 0.5, y: by + 0.5, z: bz + 0.5});
                                        } catch(e) {}
                                    }
                                }
                            }

                            // destroy keyword causes block to drop its base item
                            dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                            brokenCount++;
                        }
                    }
                } catch(e) {}
            }
        }
    }

    return brokenCount;
}

export function breakTreecapitator(player, originBlock) {
    const dimension = player.dimension;
    let brokenCount = 0;
    let blocksToProcess = [{ x: originBlock.x, y: originBlock.y, z: originBlock.z }];
    let processedBlocks = new Set();
    const maxLogs = 512; // Increased limit for giant 2x2 jungle/spruce trees

    // Add original block to processed to avoid checking it again
    processedBlocks.add(`${originBlock.x},${originBlock.y},${originBlock.z}`);

    while (blocksToProcess.length > 0 && brokenCount < maxLogs) {
        const current = blocksToProcess.shift();

        // Check 3x3x3 around the current block in all directions (downward included for branches)
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    if (x === 0 && y === 0 && z === 0) continue;

                    const bx = current.x + x;
                    const by = current.y + y;
                    const bz = current.z + z;
                    const key = `${bx},${by},${bz}`;

                    if (!processedBlocks.has(key)) {
                        processedBlocks.add(key);
                        try {
                            const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });
                            if (targetBlock && (targetBlock.typeId.includes("log") || targetBlock.typeId.includes("wood") || targetBlock.typeId.includes("stem"))) {
                                dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                                brokenCount++;
                                blocksToProcess.push({ x: bx, y: by, z: bz });
                            }
                        } catch(e) {}
                    }
                }
            }
        }
    }

    return brokenCount;
}

// Global active skill cooldowns map
export const activeCooldowns = new Map();

export function canUseActiveSkill(playerName, skillId, cooldownMs) {
    const key = `${playerName}_${skillId}`;
    const lastUsed = activeCooldowns.get(key) || 0;
    if (Date.now() - lastUsed > cooldownMs) {
        activeCooldowns.set(key, Date.now());
        return true;
    }
    return false;
}

export function applyPassiveStats(player, rpgData) {
    try {
        // --- Helper: Check if player is in water ---
        let isInWater = false;
        try {
            const headBlock = player.dimension.getBlock({
                x: Math.floor(player.location.x),
                y: Math.floor(player.location.y + 1.62),
                z: Math.floor(player.location.z)
            });
            if (headBlock && headBlock.typeId === "minecraft:water") isInWater = true;
        } catch(e) {}

        // --- Helper: Check held item type ---
        let heldItemType = "";
        try {
            const invComp = player.getComponent("inventory");
            if (invComp && invComp.container) {
                const mainHand = invComp.container.getItem(player.selectedSlotIndex);
                if (mainHand) heldItemType = mainHand.typeId;
            }
        } catch(e) {}

        const isHoldingPickaxe = heldItemType.includes("pickaxe");
        const isHoldingAxe = heldItemType.includes("axe") && !heldItemType.includes("pickaxe");
        const isHoldingHoe = heldItemType.includes("hoe");
        const isHoldingWeapon = heldItemType.includes("sword") || isHoldingAxe;
        const isBelowY0 = player.location.y < 0;

        // --- Helper: Check HP percentage ---
        let hpPercent = 1.0;
        try {
            const hpComp = player.getComponent("health");
            if (hpComp) hpPercent = hpComp.currentValue / hpComp.effectiveMax;
        } catch(e) {}

        // ============================================================
        // MINING PASSIVE TIERS
        // ============================================================
        const miningLv = rpgData.mining.level;

        // Lv5: Tangan Penambang -- Haste 1 saat memegang Pickaxe
        if (miningLv >= 5 && isHoldingPickaxe && miningLv < 25) {
            player.addEffect("haste", 30, { amplifier: 0, showParticles: false });
        }
        // Lv25: Penambang Veteran -- Haste 2 saat memegang Pickaxe (upgrade)
        if (miningLv >= 25 && isHoldingPickaxe) {
            player.addEffect("haste", 30, { amplifier: 1, showParticles: false });
        }
        // Lv15: Penglihatan Bawah Tanah -- Night Vision saat Y < 0
        if (miningLv >= 15 && isBelowY0) {
            player.addEffect("night_vision", 30, { amplifier: 0, showParticles: false });
        }
        // Lv35: Ketahanan Gua -- Resistance 1 saat Y < 0
        if (miningLv >= 35 && isBelowY0) {
            player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
        }
        // Lv50: Master Tambang -- Fire Resistance + Haste 2 saat memegang Pickaxe
        if (miningLv >= 50) {
            if (isHoldingPickaxe) {
                player.addEffect("fire_resistance", 30, { amplifier: 0, showParticles: false });
            }
        }

        // ============================================================
        // WOODCUTTING PASSIVE TIERS
        // ============================================================
        const woodcuttingLv = rpgData.woodcutting.level;

        // Lv5: Kaki Ringan -- Speed 1 saat memegang Axe
        if (woodcuttingLv >= 5 && woodcuttingLv < 50 && isHoldingAxe) {
            player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
        }
        // Lv15: Kulit Kayu -- Resistance 1 saat memegang Axe
        if (woodcuttingLv >= 15 && isHoldingAxe) {
            player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
        }
        // Lv25: Penebang Cepat -- Haste 1 saat memegang Axe
        if (woodcuttingLv >= 25 && isHoldingAxe) {
            player.addEffect("haste", 30, { amplifier: 0, showParticles: false });
        }
        // Lv35: Lompatan Hutan -- Jump Boost 1 permanen
        if (woodcuttingLv >= 35 && woodcuttingLv < 50) {
            player.addEffect("jump_boost", 30, { amplifier: 0, showParticles: false });
        }
        // Lv50: Master Hutan -- Speed 2 + Jump Boost 2 + Resistance 1 permanen
        if (woodcuttingLv >= 50) {
            player.addEffect("speed", 30, { amplifier: 1, showParticles: false });
            player.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false });
            player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
        }

        // ============================================================
        // SLAYER PASSIVE TIERS
        // ============================================================
        const slayerLv = rpgData.slayer.level;

        // Lv5: Refleks Tempur -- Speed 1 permanen
        if (slayerLv >= 5 && slayerLv < 50) {
            player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
        }
        // Lv15: Tenaga Iblis -- Strength 1 saat memegang Sword/Axe
        if (slayerLv >= 15 && slayerLv < 50 && isHoldingWeapon) {
            player.addEffect("strength", 30, { amplifier: 0, showParticles: false });
        }
        // Lv25: Darah Pejuang -- Regeneration 1 saat HP < 50%
        if (slayerLv >= 25 && hpPercent < 0.5) {
            player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
        }
        // Lv35: Tubuh Baja -- Health Boost 1 permanen
        if (slayerLv >= 35 && slayerLv < 50) {
            player.addEffect("health_boost", 30, { amplifier: 0, showParticles: false });
        }
        // Lv50: Master Peperangan -- Strength 2 + Speed 2 + Health Boost 2
        if (slayerLv >= 50) {
            player.addEffect("strength", 30, { amplifier: 1, showParticles: false });
            player.addEffect("speed", 30, { amplifier: 1, showParticles: false });
            player.addEffect("health_boost", 30, { amplifier: 1, showParticles: false });
        }

        // ============================================================
        // FARMING PASSIVE TIERS
        // ============================================================
        const farmingLv = rpgData.farming.level;

        // Lv5: Tangan Petani -- Haste 1 saat memegang Hoe
        if (farmingLv >= 5 && isHoldingHoe && farmingLv < 50) {
            player.addEffect("haste", 30, { amplifier: 0, showParticles: false });
        }
        // Lv15: Kaki Petani -- Jump Boost 1 permanen
        if (farmingLv >= 15 && farmingLv < 50) {
            player.addEffect("jump_boost", 30, { amplifier: 0, showParticles: false });
        }
        // Lv25: Langkah Cepat -- Speed 1 saat memegang Hoe
        if (farmingLv >= 25 && isHoldingHoe) {
            player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
        }
        // Lv35: Tubuh Kuat -- Resistance 1 saat memegang Hoe
        if (farmingLv >= 35 && isHoldingHoe) {
            player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
        }
        // Lv50: Master Pertanian -- Haste 2 + Jump Boost 2 permanen
        if (farmingLv >= 50) {
            player.addEffect("haste", 30, { amplifier: 1, showParticles: false });
            player.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false });
        }

        // ============================================================
        // FISHING PASSIVE TIERS
        // ============================================================
        const fishingLv = rpgData.fishing.level;

        // Lv5: Kaki Nelayan -- Speed 1 permanen
        if (fishingLv >= 5 && fishingLv < 50) {
            player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
        }
        // Lv15: Paru Ikan -- Water Breathing saat di air
        if (fishingLv >= 15 && isInWater) {
            player.addEffect("water_breathing", 30, { amplifier: 0, showParticles: false });
        }
        // Lv25: Ahli Selam -- Dolphin's Grace saat di air
        if (fishingLv >= 25 && isInWater) {
            try { player.addEffect("dolphins_grace", 30, { amplifier: 0, showParticles: false }); } catch(e) {}
        }
        // Lv35: Penglihatan Laut -- Night Vision saat di air
        if (fishingLv >= 35 && isInWater) {
            player.addEffect("night_vision", 30, { amplifier: 0, showParticles: false });
        }
        // Lv50: Master Samudra -- Conduit Power + Night Vision + Dolphin's Grace saat di air
        if (fishingLv >= 50 && isInWater) {
            player.addEffect("conduit_power", 30, { amplifier: 1, showParticles: false });
            player.addEffect("night_vision", 30, { amplifier: 0, showParticles: false });
            try { player.addEffect("dolphins_grace", 30, { amplifier: 0, showParticles: false }); } catch(e) {}
        }

        // --- Passive RPG Skills (equipped via equippedSkills) ---
        const eqSkills = rpgData.equippedSkills || [];

        // Deep Sea Diver (Fishing Passive): Conduit Power + Night Vision + Dolphin's Grace when in water
        if (eqSkills.includes("deep_sea_diver")) {
            if (isInWater) {
                player.addEffect("conduit_power", 30, { amplifier: 1, showParticles: false });
                player.addEffect("night_vision", 30, { amplifier: 0, showParticles: false });
                try { player.addEffect("dolphins_grace", 30, { amplifier: 0, showParticles: false }); } catch(e) {}
            }
        }

        // --- Berkat Kuno (Gacha Passives) -- v2.3 with Constellation Tiers ---
        const passives = rpgData.equippedGachaPassives || [];
        const constell = rpgData.passiveConstellation || {};

        // Helper: Get constellation tier for a passive (0=C0, 1=C1, 2=C2)
        const getTier = (id) => constell[id] || 0;

        // --- NORMAL PASSIVES ---

        // Fortitude: Resistance
        if (passives.includes("fortitude")) {
            const t = getTier("fortitude");
            if (t >= 2) { player.addEffect("resistance", 30, { amplifier: 2, showParticles: false }); } // C2: Resistance 3 + Knockback Res
            else if (t >= 1) { player.addEffect("resistance", 30, { amplifier: 1, showParticles: false }); } // C1: Resistance 2 + Knockback Res
            else { player.addEffect("resistance", 30, { amplifier: 1, showParticles: false }); } // C0: Resistance 2
        }

        // Agility: Speed & Jump
        if (passives.includes("agility")) {
            const t = getTier("agility");
            if (t >= 2) { player.addEffect("speed", 30, { amplifier: 2, showParticles: false }); player.addEffect("jump_boost", 30, { amplifier: 2, showParticles: false }); }
            else if (t >= 1) { player.addEffect("speed", 30, { amplifier: 1, showParticles: false }); player.addEffect("jump_boost", 30, { amplifier: 2, showParticles: false }); }
            else { player.addEffect("speed", 30, { amplifier: 1, showParticles: false }); player.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false }); }
        }

        // Titan's Grip: Strength
        if (passives.includes("titans_grip")) {
            const t = getTier("titans_grip");
            if (t >= 2) { player.addEffect("strength", 30, { amplifier: 1, showParticles: false }); player.addEffect("haste", 30, { amplifier: 0, showParticles: false }); }
            else if (t >= 1) { player.addEffect("strength", 30, { amplifier: 1, showParticles: false }); }
            else { player.addEffect("strength", 30, { amplifier: 0, showParticles: false }); }
        }

        // Iron Will (NEW): Knockback Resistance
        if (passives.includes("iron_will")) {
            const t = getTier("iron_will");
            if (t >= 2) { player.addEffect("resistance", 30, { amplifier: 1, showParticles: false }); }
            else if (t >= 1) { player.addEffect("resistance", 30, { amplifier: 0, showParticles: false }); }
            // C0 and above: Knockback Resistance is represented by subtle resistance
        }

        // --- RARE PASSIVES ---

        // Vitality: Health Boost
        if (passives.includes("vitality")) {
            const t = getTier("vitality");
            if (t >= 2) { player.addEffect("health_boost", 30, { amplifier: 3, showParticles: false }); }
            else if (t >= 1) { player.addEffect("health_boost", 30, { amplifier: 2, showParticles: false }); }
            else { player.addEffect("health_boost", 30, { amplifier: 1, showParticles: false }); }
        }

        // Vigor (Regeneration)
        if (passives.includes("regeneration")) {
            const t = getTier("regeneration");
            if (t >= 2) {
                player.addEffect("regeneration", 60, { amplifier: 1, showParticles: false });
                // C2: Absorption periodically
                if (Math.random() < 0.05) player.addEffect("absorption", 200, { amplifier: 0, showParticles: false });
            } else if (t >= 1) {
                player.addEffect("regeneration", 60, { amplifier: 1, showParticles: false });
            } else {
                player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
            }
        }

        // Arcane Shield (NEW): Periodic Absorption
        if (passives.includes("arcane_shield")) {
            const t = getTier("arcane_shield");
            // Give absorption every ~30 seconds (5% chance per tick cycle at 20 ticks)
            if (Math.random() < (t >= 2 ? 0.15 : t >= 1 ? 0.10 : 0.05)) {
                const amp = t >= 2 ? 1 : 0;
                player.addEffect("absorption", 200, { amplifier: amp, showParticles: false });
            }
            // C2: Resistance when shield is active
            if (t >= 2) {
                try {
                    const absComp = player.getEffect("absorption");
                    if (absComp) player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
                } catch(e) {}
            }
        }

        // --- LEGENDARY & MYTHIC PASSIVES (Dynamic Health Triggers) ---
        const hpComponent = player.getComponent("health");
        if (hpComponent) {
            const hpPercent = hpComponent.currentValue / hpComponent.effectiveMax;
            const isLowHp = hpPercent <= (1/3); // Under 33% HP

            // Phoenix Blood: Regen when low HP
            if (isLowHp && passives.includes("phoenix_blood")) {
                const t = getTier("phoenix_blood");
                const threshold = t >= 2 ? 0.50 : t >= 1 ? 0.40 : 1/3;
                if (hpPercent <= threshold) {
                    const amp = t >= 2 ? 3 : 2;
                    player.addEffect("regeneration", 60, { amplifier: amp, showParticles: true });
                }
            }

            // Adrenaline: Speed when low HP
            if (isLowHp && passives.includes("adrenaline")) {
                const t = getTier("adrenaline");
                const threshold = t >= 2 ? 0.50 : t >= 1 ? 0.40 : 1/3;
                if (hpPercent <= threshold) {
                    player.addEffect("speed", 60, { amplifier: t >= 2 ? 3 : 2, showParticles: true });
                    if (t >= 1) player.addEffect("strength", 60, { amplifier: t >= 2 ? 1 : 0, showParticles: true });
                }
            }

            // Berserker's Rage (NEW): Strength + Speed when attacked (when HP < 70%)
            if (passives.includes("berserker_rage")) {
                const t = getTier("berserker_rage");
                // Activated by being hit -- check recent damage flag
                try {
                    const rageFlag = player.getDynamicProperty("berserker_rage_active");
                    if (rageFlag && Date.now() - rageFlag < 5000) { // Active for 5s after being hit
                        const strAmp = t >= 2 ? 2 : t >= 1 ? 1 : 0;
                        const spdAmp = t >= 2 ? 1 : t >= 1 ? 1 : 0;
                        player.addEffect("strength", 40, { amplifier: strAmp, showParticles: true });
                        player.addEffect("speed", 40, { amplifier: spdAmp, showParticles: true });
                        if (t >= 2) player.addEffect("resistance", 40, { amplifier: 0, showParticles: true });
                    }
                } catch(e) {}
            }

            // Ghost Walk (NEW): Invisibility + Speed when sneaking & low HP
            if (passives.includes("ghost_walk")) {
                const t = getTier("ghost_walk");
                const threshold = t >= 2 ? 0.50 : t >= 1 ? 0.40 : 0.30;
                let isSneaking = false;
                try { isSneaking = player.isSneaking; } catch(e) {}

                if (isSneaking && hpPercent <= threshold) {
                    player.addEffect("invisibility", 30, { amplifier: 0, showParticles: false });
                    player.addEffect("speed", 30, { amplifier: t >= 2 ? 2 : 1, showParticles: false });
                    if (t >= 2) {
                        try { player.addEffect("slow_falling", 30, { amplifier: 0, showParticles: false }); } catch(e) {}
                    }
                }
            }

            // Avatar of War (NEW): All stats up when HP < 25%
            if (passives.includes("avatar_of_war")) {
                const t = getTier("avatar_of_war");
                const threshold = t >= 1 ? 0.35 : 0.25;
                if (hpPercent <= threshold) {
                    if (t >= 2) {
                        // C2: ALL stats MAXIMUM
                        player.addEffect("strength", 40, { amplifier: 2, showParticles: true });
                        player.addEffect("speed", 40, { amplifier: 2, showParticles: true });
                        player.addEffect("resistance", 40, { amplifier: 2, showParticles: true });
                        player.addEffect("health_boost", 40, { amplifier: 2, showParticles: true });
                    } else {
                        // C0-C1: All stats up
                        player.addEffect("strength", 40, { amplifier: 1, showParticles: true });
                        player.addEffect("speed", 40, { amplifier: 1, showParticles: true });
                        player.addEffect("resistance", 40, { amplifier: 1, showParticles: true });
                    }
                }
            }
        }

        // ============================================================
        // v2.6 -- 10 NEW BERKAT KUNO (Gacha Passives)
        // ============================================================

        // --- Soul Harvest (Rare): Lifesteal saat menyerang ---
        // Combat trigger handled in combat_system.js
        // Passive tick: small heal every few seconds if recently attacked
        if (passives.includes("soul_harvest")) {
            const t = getTier("soul_harvest");
            // Periodic minor heal (combat lifesteal is in combat_system)
            if (Math.random() < (t >= 2 ? 0.08 : t >= 1 ? 0.05 : 0.03)) {
                try {
                    const hpC = player.getComponent("health");
                    if (hpC && hpC.currentValue < hpC.effectiveMax) {
                        player.addEffect("regeneration", 20, { amplifier: 0, showParticles: false });
                    }
                } catch(e) {}
            }
        }

        // --- Iron Fortress (Rare): Resistance kuat saat sneak ---
        if (passives.includes("iron_fortress")) {
            const t = getTier("iron_fortress");
            let isSneaking = false;
            try { isSneaking = player.isSneaking; } catch(e) {}

            if (isSneaking) {
                if (t >= 2) {
                    // C2: Resistance 4 + knockback res + absorption
                    player.addEffect("resistance", 30, { amplifier: 3, showParticles: false });
                    player.addEffect("slowness", 30, { amplifier: 0, showParticles: false });
                    if (Math.random() < 0.03) player.addEffect("absorption", 200, { amplifier: 0, showParticles: false });
                } else if (t >= 1) {
                    // C1: Resistance 3 + knockback res
                    player.addEffect("resistance", 30, { amplifier: 2, showParticles: false });
                    player.addEffect("slowness", 30, { amplifier: 0, showParticles: false });
                } else {
                    // C0: Resistance 2 saat sneak
                    player.addEffect("resistance", 30, { amplifier: 1, showParticles: false });
                    player.addEffect("slowness", 30, { amplifier: 0, showParticles: false });
                }
            }
        }

        // --- Storm Aura (Rare): Damage periodik ke musuh terdekat ---
        if (passives.includes("storm_aura")) {
            const t = getTier("storm_aura");
            const radius = t >= 2 ? 5 : t >= 1 ? 4 : 3;
            const dmgChance = t >= 2 ? 0.12 : t >= 1 ? 0.10 : 0.08; // ticks at ~20 ticks interval
            const dmgAmount = t >= 2 ? 4 : t >= 1 ? 3 : 2;

            if (Math.random() < dmgChance) {
                try {
                    const loc = player.location;
                    player.dimension.runCommandAsync(`damage @e[x=${loc.x},y=${loc.y},z=${loc.z},r=${radius},type=!player,type=!item] ${dmgAmount} entity_attack entity "${player.name}"`);
                    // Debuff effects on C1+
                    if (t >= 1) {
                        player.dimension.runCommandAsync(`effect @e[x=${loc.x},y=${loc.y},z=${loc.z},r=${radius},type=!player,type=!item] slowness 40 1`);
                    }
                    if (t >= 2) {
                        player.dimension.runCommandAsync(`effect @e[x=${loc.x},y=${loc.y},z=${loc.z},r=${radius},type=!player,type=!item] weakness 40 0`);
                    }
                } catch(e) {}
            }
        }

        // --- God Slayer (Legendary): Instant kill chance ---
        // Combat trigger handled in combat_system.js (on hit)
        // Passive: subtle strength indicator
        if (passives.includes("god_slayer")) {
            const t = getTier("god_slayer");
            // Subtle damage boost passively
            if (t >= 2) {
                player.addEffect("strength", 30, { amplifier: 0, showParticles: false });
            }
        }

        // --- Colossal Vitality (Legendary): Massive Health Boost ---
        if (passives.includes("colossal_vitality")) {
            const t = getTier("colossal_vitality");
            if (t >= 2) {
                player.addEffect("health_boost", 30, { amplifier: 5, showParticles: false }); // +12 hearts
                player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false }); // +Regen 1
            } else if (t >= 1) {
                player.addEffect("health_boost", 30, { amplifier: 4, showParticles: false }); // +10 hearts
            } else {
                player.addEffect("health_boost", 30, { amplifier: 3, showParticles: false }); // +8 hearts
            }
        }

        // --- Blood Frenzy (Legendary): Kill streak stacking ---
        // Kill trigger handled in main.js combat events
        // Passive tick: check frenzy stacks and apply buffs
        if (passives.includes("blood_frenzy")) {
            const t = getTier("blood_frenzy");
            try {
                const frenzyStr = player.getDynamicProperty("blood_frenzy_stacks");
                if (frenzyStr && typeof frenzyStr === 'string') {
                    const frenzyData = JSON.parse(frenzyStr);
                    if (Date.now() - frenzyData.lastKill < frenzyData.duration) {
                        const stacks = Math.min(frenzyData.stacks, t >= 2 ? 7 : 5);
                        if (stacks > 0) {
                            // Apply buffs based on stack count
                            const strAmp = Math.min(stacks - 1, 2);
                            const spdAmp = Math.min(stacks - 1, 2);
                            player.addEffect("strength", 40, { amplifier: strAmp, showParticles: true });
                            player.addEffect("speed", 40, { amplifier: spdAmp, showParticles: true });
                            if (t >= 1 && stacks >= 2) {
                                player.addEffect("haste", 40, { amplifier: Math.min(stacks - 2, 1), showParticles: true });
                            }
                            if (t >= 2 && stacks >= 3) {
                                player.addEffect("resistance", 40, { amplifier: Math.min(stacks - 3, 1), showParticles: true });
                                player.addEffect("jump_boost", 40, { amplifier: Math.min(stacks - 3, 1), showParticles: true });
                            }
                        }
                    } else {
                        // Stacks expired, clear
                        player.setDynamicProperty("blood_frenzy_stacks", JSON.stringify({ stacks: 0, lastKill: 0, duration: 8000 }));
                    }
                }
            } catch(e) {}
        }

        // --- Leviathan's Domain (Legendary): God in water ---
        if (passives.includes("leviathan_domain")) {
            const t = getTier("leviathan_domain");
            if (isInWater) {
                // C0: Full water buffs
                player.addEffect("water_breathing", 60, { amplifier: 0, showParticles: false });
                player.addEffect("night_vision", 60, { amplifier: 0, showParticles: false });
                player.addEffect("conduit_power", 60, { amplifier: 1, showParticles: false });
                try { player.addEffect("dolphins_grace", 60, { amplifier: 0, showParticles: false }); } catch(e) {}

                if (t >= 1) {
                    // C1: +Speed 2 + Resistance 1 di air
                    player.addEffect("speed", 60, { amplifier: 1, showParticles: false });
                    player.addEffect("resistance", 60, { amplifier: 0, showParticles: false });
                }
                if (t >= 2) {
                    // C2: +Strength 1 + Regen 1 + Absorption di air
                    player.addEffect("strength", 60, { amplifier: 0, showParticles: false });
                    player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                    if (Math.random() < 0.05) player.addEffect("absorption", 200, { amplifier: 0, showParticles: false });
                }
            }
        }

        // --- Undying Will (Mythic): Auto-revive tanpa totem ---
        // Lethal hit trigger handled in combat_system.js
        // Passive: subtle buff indicator
        if (passives.includes("undying_will")) {
            const t = getTier("undying_will");
            // Small passive resistance (the revive is in combat_system)
            if (t >= 2) {
                player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
            }
        }

        // --- Titan's Heart (Mythic): HP raksasa + Regen + Resistance ---
        if (passives.includes("titans_heart")) {
            const t = getTier("titans_heart");
            if (t >= 2) {
                // C2: Health Boost 5 + Regen 2 + Resistance 3 + Absorption periodik
                player.addEffect("health_boost", 30, { amplifier: 4, showParticles: false });
                player.addEffect("regeneration", 60, { amplifier: 1, showParticles: false });
                player.addEffect("resistance", 30, { amplifier: 2, showParticles: false });
                if (Math.random() < 0.05) player.addEffect("absorption", 200, { amplifier: 1, showParticles: false });
            } else if (t >= 1) {
                // C1: Health Boost 4 + Regen 2 + Resistance 2
                player.addEffect("health_boost", 30, { amplifier: 3, showParticles: false });
                player.addEffect("regeneration", 60, { amplifier: 1, showParticles: false });
                player.addEffect("resistance", 30, { amplifier: 1, showParticles: false });
            } else {
                // C0: Health Boost 3 + Regen 1 + Resistance 1
                player.addEffect("health_boost", 30, { amplifier: 2, showParticles: false });
                player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
            }
        }

        // --- Chaos Aura (Mythic): Debuff musuh sekitar, buff diri ---
        if (passives.includes("chaos_aura")) {
            const t = getTier("chaos_aura");
            const radius = t >= 2 ? 6 : t >= 1 ? 5 : 4;
            const procChance = t >= 2 ? 0.10 : t >= 1 ? 0.08 : 0.06;

            if (Math.random() < procChance) {
                try {
                    const loc = player.location;
                    // Debuff enemies
                    player.dimension.runCommandAsync(`effect @e[x=${loc.x},y=${loc.y},z=${loc.z},r=${radius},type=!player,type=!item] slowness 40 1`);
                    player.dimension.runCommandAsync(`effect @e[x=${loc.x},y=${loc.y},z=${loc.z},r=${radius},type=!player,type=!item] weakness 40 0`);

                    if (t >= 1) {
                        // C1: +Wither to enemies
                        player.dimension.runCommandAsync(`effect @e[x=${loc.x},y=${loc.y},z=${loc.z},r=${radius},type=!player,type=!item] wither 40 0`);
                    }
                    if (t >= 2) {
                        // C2: +Poison to enemies
                        player.dimension.runCommandAsync(`effect @e[x=${loc.x},y=${loc.y},z=${loc.z},r=${radius},type=!player,type=!item] poison 40 0`);
                    }
                } catch(e) {}
            }

            // Self buffs (always active)
            if (t >= 2) {
                player.addEffect("speed", 30, { amplifier: 1, showParticles: false });
                player.addEffect("strength", 30, { amplifier: 0, showParticles: false });
                player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
            } else if (t >= 1) {
                player.addEffect("speed", 30, { amplifier: 1, showParticles: false });
                player.addEffect("strength", 30, { amplifier: 0, showParticles: false });
            } else {
                player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
            }
        }

        // --- Equipment Gacha Passives (Armor & Tools in hand) ---
        // Fixed: Static import menggantikan dynamic import untuk performa lebih baik
        // (sebelumnya import() dipanggil setiap detik untuk setiap pemain)
        {
            const invComponent = player.getComponent("inventory");
            const eqComponent = player.getComponent("equippable");

            if (eqComponent) {
                const head = eqComponent.getEquipment("Head");
                const chest = eqComponent.getEquipment("Chest");
                const legs = eqComponent.getEquipment("Legs");
                const feet = eqComponent.getEquipment("Feet");

                const checkEq = (item, slotName) => {
                    if (!item) return;
                    const eff = safeGetGachaEffect(item);

                    // --- HELMET EFFECTS ---
                    // Common
                    if (eff === "padded_helm") player.addEffect("resistance", 30, { amplifier: -1, showParticles: false }); // Tiny resistance boost
                    if (eff === "warm_fur") { /* Passive: no freezing in powdered snow */ try { player.addEffect("fire_resistance", 20, { amplifier: -1, showParticles: false }); } catch(e) {} }
                    // Uncommon
                    if (eff === "eagle_eye") {
                        // Occasional Night Vision (flickers on every other second)
                        if (Math.random() < 0.5) player.addEffect("night_vision", 60, { amplifier: 0, showParticles: false });
                    }
                    if (eff === "steady_head") {
                        player.removeEffect("nausea");
                        player.removeEffect("darkness");
                    }
                    // Rare
                    if (eff === "clear_mind") player.removeEffect("blindness");
                    // Epic
                    if (eff === "aqua_lung") player.addEffect("water_breathing", 60, { amplifier: 0, showParticles: false });
                    // Legendary
                    if (eff === "third_eye") player.addEffect("night_vision", 300, { amplifier: 0, showParticles: false });

                    // --- CHESTPLATE EFFECTS ---
                    // Common
                    if (eff === "padded_chest") player.addEffect("resistance", 30, { amplifier: -1, showParticles: false });
                    if (eff === "comfort_fit") { /* Passive: slightly faster food regen - represented as subtle regen */ }
                    // Uncommon
                    if (eff === "thick_hide") player.addEffect("resistance", 30, { amplifier: 0, showParticles: false }); // Resistance 1
                    if (eff === "adrenal_gland") { /* Triggered on hit, handled in combat_system */ }
                    // Rare
                    if (eff === "iron_skin") player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
                    // Epic
                    if (eff === "turtle_shell") {
                        player.addEffect("resistance", 30, { amplifier: 1, showParticles: false });
                        player.addEffect("slowness", 30, { amplifier: 0, showParticles: false });
                    }
                    // Legendary
                    if (eff === "troll_blood") {
                        player.addEffect("regeneration", 60, { amplifier: 0, showParticles: false });
                    }
                    if (eff === "titans_aegis") {
                        player.addEffect("resistance", 30, { amplifier: 2, showParticles: false });
                        player.addEffect("slowness", 30, { amplifier: 1, showParticles: false });
                    }

                    // --- LEGGINGS EFFECTS ---
                    // Common
                    if (eff === "sturdy_weave") player.addEffect("resistance", 30, { amplifier: -1, showParticles: false });
                    if (eff === "flexible_joint") player.addEffect("speed", 30, { amplifier: -1, showParticles: false }); // Tiny speed
                    // Uncommon
                    if (eff === "reinforced_plating") player.addEffect("resistance", 30, { amplifier: 0, showParticles: false });
                    if (eff === "agile_step") player.addEffect("speed", 30, { amplifier: 0, showParticles: false }); // Speed 1
                    // Rare
                    if (eff === "sturdy_legs") player.addEffect("health_boost", 30, { amplifier: 0, showParticles: false });
                    // Epic
                    if (eff === "tank_legs") player.addEffect("health_boost", 30, { amplifier: 1, showParticles: false });
                    // Legendary
                    if (eff === "colossus") player.addEffect("health_boost", 30, { amplifier: 2, showParticles: false });

                    // --- BOOTS EFFECTS ---
                    // Common
                    if (eff === "light_boots") player.addEffect("speed", 30, { amplifier: -1, showParticles: false });
                    if (eff === "soft_landing") { /* Reduces fall damage - handled via slow falling flicker */ try { player.addEffect("slow_falling", 10, { amplifier: -1, showParticles: false }); } catch(e) {} }
                    // Uncommon
                    if (eff === "spring_soles") {
                        if (Math.random() < 0.3) player.addEffect("jump_boost", 30, { amplifier: 0, showParticles: false });
                    }
                    if (eff === "trail_runner") player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
                    // Rare
                    if (eff === "swift_step") player.addEffect("speed", 30, { amplifier: 0, showParticles: false });
                    // Epic
                    if (eff === "frog_jump") player.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false });
                    if (eff === "featherlight") player.addEffect("slow_falling", 30, { amplifier: 0, showParticles: false });
                    // Legendary
                    if (eff === "hermes_boots") {
                        player.addEffect("speed", 30, { amplifier: 2, showParticles: false });
                        player.addEffect("jump_boost", 30, { amplifier: 2, showParticles: false });
                    }

                    // Commit recovered properties if needed
                    eqComponent.setEquipment(slotName, item);
                };

                checkEq(head, "Head");
                checkEq(chest, "Chest");
                checkEq(legs, "Legs");
                checkEq(feet, "Feet");
            }

            if (invComponent && invComponent.container) {
                const mainHand = invComponent.container.getItem(player.selectedSlotIndex);
                if (mainHand) {
                    const eff = safeGetGachaEffect(mainHand);

                    // --- TOOL EFFECTS ---
                    // Common
                    if (eff === "comfortable_grip") { /* Passive: subtle quality - no major effect */ }
                    if (eff === "steady_hand") { /* Passive: less fatigue - subtle haste flicker */ if (Math.random() < 0.3) player.addEffect("haste", 30, { amplifier: 0, showParticles: false }); }
                    // Uncommon
                    if (eff === "efficient_swing") player.addEffect("haste", 30, { amplifier: 0, showParticles: false }); // Haste 1
                    if (eff === "prospector_sense") { /* Would need block scanning - give subtle night vision instead */ player.addEffect("night_vision", 60, { amplifier: 0, showParticles: false }); }
                    // Rare
                    if (eff === "miner_touch") player.addEffect("haste", 30, { amplifier: 0, showParticles: false });
                    // Epic
                    if (eff === "geo_master") player.addEffect("haste", 30, { amplifier: 1, showParticles: false });
                    // Legendary
                    if (eff === "god_breaker") player.addEffect("haste", 30, { amplifier: 3, showParticles: false });

                    // --- WEAPON PASSIVE BUFFS (when held) ---
                    // Common
                    if (eff === "serrated_edge") { /* Proc on hit, handled in combat_system */ }
                    if (eff === "keen_edge") player.addEffect("strength", 30, { amplifier: -1, showParticles: false }); // Tiny str
                    if (eff === "hunters_instinct") player.addEffect("speed", 30, { amplifier: -1, showParticles: false }); // Tiny speed
                    // Uncommon
                    if (eff === "chill_touch") { /* Proc on hit */ }
                    if (eff === "weak_strike") { /* Proc on hit */ }
                    if (eff === "knockback_hit") player.addEffect("strength", 30, { amplifier: 0, showParticles: false }); // Strength 1

                    invComponent.container.setItem(player.selectedSlotIndex, mainHand);
                }
            }
        }

    } catch(e) {}
}

// ============================================================
// FARMING SKILL -- Bountiful Harvest (Area Crop Break)
// ============================================================

const CROP_BLOCK_IDS = [
    "minecraft:wheat",
    "minecraft:carrots",
    "minecraft:potatoes",
    "minecraft:beetroot",
    "minecraft:melon_block",
    "minecraft:pumpkin",
    "minecraft:sweet_berry_bush",
    "minecraft:cocoa",
    "minecraft:nether_wart",
    "minecraft:pitcher_crop",
    "minecraft:torchflower_crop"
];

export function isCropBlock(typeId) {
    // Exact match for known crops, with includes fallback for modded/new crops
    if (CROP_BLOCK_IDS.includes(typeId)) return true;
    // Broad fallback for future/modded crop blocks
    if (typeId.includes("crop") || typeId.includes("berry_bush")) return true;
    return false;
}

export function breakCropArea(player, originBlock) {
    const dimension = player.dimension;
    let brokenCount = 0;
    const radius = 2; // 5x5 area (same Y level, flat farmland)

    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            if (x === 0 && z === 0) continue; // Origin block already broken by player
            try {
                const bx = originBlock.x + x;
                const by = originBlock.y;
                const bz = originBlock.z + z;

                const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });
                if (targetBlock && !targetBlock.isAir) {
                    const id = targetBlock.typeId;
                    if (isCropBlock(id)) {
                        dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                        brokenCount++;
                    }
                }
            } catch(e) {}
        }
    }

    return brokenCount;
}

// ============================================================
// MINING SKILL -- Seismic Slam (3x3x5 column break below player)
// ============================================================

export function breakColumnArea(player) {
    const dimension = player.dimension;
    let brokenCount = 0;
    const depth = 5;
    const radius = 1; // 3x3

    const baseX = Math.floor(player.location.x);
    const baseY = Math.floor(player.location.y) - 1; // Block below feet
    const baseZ = Math.floor(player.location.z);

    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            for (let y = 0; y < depth; y++) {
                try {
                    const bx = baseX + x;
                    const by = baseY - y;
                    const bz = baseZ + z;
                    const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });
                    if (targetBlock && !targetBlock.isAir) {
                        const id = targetBlock.typeId;
                        // Same anti-grief check as Ore Excavation
                        const isNatural = id.includes("stone") || id.includes("ore") || id.includes("dirt") || id.includes("sand") || id.includes("gravel") || id.includes("deepslate") || id.includes("tuff") || id.includes("calcite") || id.includes("diorite") || id.includes("andesite") || id.includes("granite") || id.includes("basalt") || id.includes("netherrack") || id.includes("obsidian") || id.includes("ancient_debris");
                        const isArtificial = id.includes("stairs") || id.includes("slab") || id.includes("wall") || id.includes("brick") || id.includes("cobblestone") || id.includes("smooth_stone");
                        if (isNatural && !isArtificial && id !== "minecraft:bedrock" && id !== "minecraft:barrier" && id !== "minecraft:deny" && id !== "minecraft:allow" && id !== "minecraft:border_block") {
                            dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                            brokenCount++;
                        }
                    }
                } catch(e) {}
            }
        }
    }

    return brokenCount;
}

// ============================================================
// WOODCUTTING SKILL -- Leaf Storm (Break leaves in radius)
// ============================================================

export function breakLeafArea(player) {
    const dimension = player.dimension;
    let brokenCount = 0;
    const radius = 7;

    const baseX = Math.floor(player.location.x);
    const baseY = Math.floor(player.location.y);
    const baseZ = Math.floor(player.location.z);

    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            for (let z = -radius; z <= radius; z++) {
                const dist = Math.sqrt(x*x + y*y + z*z);
                if (dist > radius) continue;
                try {
                    const bx = baseX + x;
                    const by = baseY + y;
                    const bz = baseZ + z;
                    const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });
                    if (targetBlock && targetBlock.typeId.includes("leaves")) {
                        dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                        brokenCount++;
                    }
                } catch(e) {}
            }
        }
    }

    return brokenCount;
}

// ============================================================
// FARMING SKILL -- Green Thumb (Harvest & Replant mature crops)
// ============================================================

export function harvestAndReplantArea(player) {
    const dimension = player.dimension;
    let harvestedCount = 0;
    const radius = 3; // 7x7 area

    const baseX = Math.floor(player.location.x);
    const baseY = Math.floor(player.location.y);
    const baseZ = Math.floor(player.location.z);

    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            try {
                const bx = baseX + x;
                const by = baseY;
                const bz = baseZ + z;
                const targetBlock = dimension.getBlock({ x: bx, y: by, z: bz });
                if (!targetBlock || targetBlock.isAir) continue;

                const id = targetBlock.typeId;
                if (!isCropBlock(id)) continue;

                // Melons and pumpkins: always harvest
                if (id.includes("melon") || id.includes("pumpkin")) {
                    dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                    harvestedCount++;
                    continue;
                }

                // Check maturity via block state
                let isMature = true; // Default true if state check fails
                try {
                    const perm = targetBlock.permutation;
                    const growth = perm.getState("growth");
                    if (growth !== undefined) {
                        const maxGrowth = id.includes("beetroot") ? 3 : 7;
                        isMature = growth >= maxGrowth;
                    }
                } catch(e) {}

                if (isMature) {
                    // Harvest (drops items)
                    dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} air destroy`);
                    // Replant at default (growth 0)
                    try {
                        dimension.runCommandAsync(`setblock ${bx} ${by} ${bz} ${id}`);
                    } catch(e2) {}
                    harvestedCount++;
                }
            } catch(e) {}
        }
    }

    return harvestedCount;
}
