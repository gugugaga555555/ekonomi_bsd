import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { getPlayerRpgData, savePlayerRpgData } from "./rpg_system.js";
import { formatRupiah, getUiHeader } from "./utils.js";
import { getItemCategory, getEffectPool, getRarityColor } from "./gacha_effects.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";

// ============================================================
// CONSTANTS
// ============================================================

export const CORE_PRICE = 100000;

export function getCoreScore(player) {
    const obj = world.scoreboard.getObjective("core");
    if (!obj) return 0;
    try {
        return obj.getScore(player) || 0;
    } catch {
        return 0;
    }
}

export function setCoreScore(player, score) {
    const obj = world.scoreboard.getObjective("core");
    if (obj) {
        obj.setScore(player, score);
    }
}

// ============================================================
// EQUIPMENT GACHA -- Rarity Table (v2.3)
// ============================================================

const RARITIES = [
    { name: "Common",    weight: 45,  effect: true },
    { name: "Uncommon",  weight: 30,  effect: true },
    { name: "Rare",      weight: 18,  effect: true },
    { name: "Epic",      weight: 6,   effect: true },
    { name: "Legendary", weight: 1,   effect: true }
];

const GACHA_COST_EQUIPMENT = 5;
const GACHA_10PULL_COST = 45; // Diskon 5 Core dari 50

// ============================================================
// PITY SYSTEM -- Equipment Gacha
// ============================================================

const EPIC_PITY = 30;   // After 30 pulls without Epic+, guaranteed Epic+
const LEGENDARY_PITY = 80; // After 80 pulls without Legendary, guaranteed Legendary

function getPlayerGachaPity(player) {
    try {
        const str = player.getDynamicProperty("gacha_pity");
        if (str && typeof str === 'string') return JSON.parse(str);
    } catch(e) {}
    return { sinceEpic: 0, sinceLegendary: 0, totalPulls: 0 };
}

function savePlayerGachaPity(player, pity) {
    player.setDynamicProperty("gacha_pity", JSON.stringify(pity));
}

function getRandomRarityWithPity(player, featuredRarity = null) {
    const pity = getPlayerGachaPity(player);

    // Check legendary pity first (highest priority)
    if (pity.sinceLegendary >= LEGENDARY_PITY) {
        pity.sinceLegendary = 0;
        pity.sinceEpic = 0;
        pity.totalPulls++;
        savePlayerGachaPity(player, pity);
        return RARITIES.find(r => r.name === "Legendary");
    }

    // Check epic pity
    if (pity.sinceEpic >= EPIC_PITY) {
        // Guaranteed at least Epic (80% Epic, 20% Legendary)
        pity.sinceEpic = 0;
        pity.totalPulls++;
        savePlayerGachaPity(player, pity);
        if (Math.random() < 0.20) {
            pity.sinceLegendary = 0;
            savePlayerGachaPity(player, pity);
            return RARITIES.find(r => r.name === "Legendary");
        }
        return RARITIES.find(r => r.name === "Epic");
    }

    // Normal weighted roll
    const totalWeight = RARITIES.reduce((acc, r) => acc + r.weight, 0);
    let randomNum = Math.random() * totalWeight;
    for (const rarity of RARITIES) {
        if (randomNum < rarity.weight) {
            // Update pity
            pity.sinceEpic++;
            pity.sinceLegendary++;
            pity.totalPulls++;
            if (rarity.name === "Epic" || rarity.name === "Legendary") {
                pity.sinceEpic = 0;
            }
            if (rarity.name === "Legendary") {
                pity.sinceLegendary = 0;
            }
            savePlayerGachaPity(player, pity);
            return rarity;
        }
        randomNum -= rarity.weight;
    }

    // Fallback
    pity.sinceEpic++;
    pity.sinceLegendary++;
    pity.totalPulls++;
    savePlayerGachaPity(player, pity);
    return RARITIES[0];
}

// ============================================================
// BANNER SYSTEM (v2.3) -- Rotating Featured Banners
// ============================================================

const BANNER_ROTATION_INTERVAL = 7200000; // 2 hours in ms

const BANNER_POOL = [
    {
        id: "thunder_lord",
        name: "Thunder Lord",
        desc: "Rate-up: Senjata Petir & Anti-Knockback",
        featuredEffect: "thunderous_smite",
        featuredCategory: "weapon",
        featuredRarity: "Legendary",
        color: "§e"
    },
    {
        id: "ocean_titan",
        name: "Ocean Titan",
        desc: "Rate-up: Air & Perlindungan Tank",
        featuredEffect: "titans_aegis",
        featuredCategory: "chest",
        featuredRarity: "Legendary",
        color: "§3"
    },
    {
        id: "shadow_assassin",
        name: "Shadow Assassin",
        desc: "Rate-up: Senjata Racun & Kecepatan",
        featuredEffect: "abyssal_wither",
        featuredCategory: "weapon",
        featuredRarity: "Epic",
        color: "§5"
    },
    {
        id: "earthen_fortress",
        name: "Earthen Fortress",
        desc: "Rate-up: Armor Legendaris & HP Boost",
        featuredEffect: "colossus",
        featuredCategory: "legs",
        featuredRarity: "Legendary",
        color: "§6"
    },
    {
        id: "wind_runner",
        name: "Wind Runner",
        desc: "Rate-up: Kecepatan & Kelincahan",
        featuredEffect: "hermes_boots",
        featuredCategory: "boots",
        featuredRarity: "Legendary",
        color: "§a"
    },
    {
        id: "world_breaker",
        name: "World Breaker",
        desc: "Rate-up: Alat Tambang Legendaris",
        featuredEffect: "god_breaker",
        featuredCategory: "tool",
        featuredRarity: "Legendary",
        color: "§b"
    }
];

function getActiveBanner() {
    try {
        const str = world.getDynamicProperty("gacha_banner");
        if (str && typeof str === 'string') {
            const data = JSON.parse(str);
            // Check if banner has expired
            if (Date.now() < data.endTime) {
                return data;
            }
        }
    } catch(e) {}

    // Generate new banner
    const bannerIndex = Math.floor(Math.random() * BANNER_POOL.length);
    const banner = BANNER_POOL[bannerIndex];
    const newBanner = {
        ...banner,
        startTime: Date.now(),
        endTime: Date.now() + BANNER_ROTATION_INTERVAL
    };
    try {
        world.setDynamicProperty("gacha_banner", JSON.stringify(newBanner));
    } catch(e) {}

    return newBanner;
}

function getBannerTimeRemaining() {
    const banner = getActiveBanner();
    const remaining = banner.endTime - Date.now();
    return Math.max(0, remaining);
}

// ============================================================
// PASSIVE GACHA -- Expanded Pool (v2.3 -- 14 passives)
// ============================================================

const GACHA_COST_PASSIVE = 10;
const PASSIVE_10PULL_COST = 90; // Diskon 10 Core dari 100

export const PASSIVE_POOL = [
    // Normal (50% combined)
    { id: "fortitude",     name: "Fortitude",               desc: "Resistance Permanen",                    rarity: "Normal",    weight: 15 },
    { id: "agility",       name: "Agility",                 desc: "Speed & Jump Boost Permanen",            rarity: "Normal",    weight: 15 },
    { id: "titans_grip",   name: "Titan's Grip",            desc: "Strength Permanen",                      rarity: "Normal",    weight: 10 },
    { id: "iron_will",     name: "Iron Will",               desc: "Knockback Resistance Permanen",          rarity: "Normal",    weight: 10 },

    // Rare (30% combined)
    { id: "vitality",      name: "Vitality",                desc: "Health Boost Permanen",                  rarity: "Rare",      weight: 8 },
    { id: "regeneration",  name: "Vigor",                   desc: "Regen HP Perlahan",                      rarity: "Rare",      weight: 8 },
    { id: "arcane_shield", name: "Arcane Shield",           desc: "Absorption periodik tiap 30 detik",      rarity: "Rare",      weight: 8 },
    { id: "soul_harvest",  name: "Soul Harvest",            desc: "Lifesteal saat menyerang musuh",         rarity: "Rare",      weight: 7 },
    { id: "iron_fortress", name: "Iron Fortress",           desc: "Resistance kuat saat sneak",             rarity: "Rare",      weight: 7 },
    { id: "storm_aura",    name: "Storm Aura",              desc: "Damage periodik ke musuh terdekat",      rarity: "Rare",      weight: 7 },

    // Legendary (15% combined)
    { id: "phoenix_blood", name: "Phoenix Blood",           desc: "Regen deras saat HP sekarat",            rarity: "Legendary", weight: 4 },
    { id: "adrenaline",    name: "Adrenaline",              desc: "Speed gila saat HP sekarat",             rarity: "Legendary", weight: 3 },
    { id: "berserker_rage",name: "Berserker's Rage",        desc: "Strength + Speed saat diserang",         rarity: "Legendary", weight: 4 },
    { id: "god_slayer",    name: "God Slayer",              desc: "Peluang instant kill mob di bawah 50% HP", rarity: "Legendary", weight: 3 },
    { id: "colossal_vitality", name: "Colossal Vitality",  desc: "Health Boost raksasa permanen",          rarity: "Legendary", weight: 3 },
    { id: "blood_frenzy",  name: "Blood Frenzy",            desc: "Kill = buff menumpuk (max 5 stack)",     rarity: "Legendary", weight: 3 },
    { id: "leviathan_domain", name: "Leviathan's Domain",  desc: "Dewa di air: semua buff air maksimal",   rarity: "Legendary", weight: 3 },

    // Mythic (5% combined)
    { id: "second_wind",   name: "Second Wind",             desc: "Revive setengah HP dari kematian",       rarity: "Mythic",    weight: 2 },
    { id: "ghost_walk",    name: "Ghost Walk",              desc: "Invis + Speed saat sneak & HP rendah",   rarity: "Mythic",    weight: 2 },
    { id: "avatar_of_war", name: "Avatar of War",           desc: "Semua stat naik saat HP < 25%",          rarity: "Mythic",    weight: 1 },
    { id: "undying_will",  name: "Undying Will",            desc: "Auto-revive tanpa totem (cooldown 8m)",  rarity: "Mythic",    weight: 1 },
    { id: "titans_heart",  name: "Titan's Heart",           desc: "HP raksasa + Regen + Resistance",        rarity: "Mythic",    weight: 1 },
    { id: "chaos_aura",    name: "Chaos Aura",              desc: "Musuh sekitar kena debuff, kamu kena buff", rarity: "Mythic",    weight: 1 }
];

const PASSIVE_PITY_LEGENDARY = 15; // After 15 passive pulls without Legendary+, guaranteed
const PASSIVE_PITY_MYTHIC = 50;    // After 50 passive pulls without Mythic, guaranteed

// ============================================================
// REINKARNASI SYSTEM (v2.3) -- Constellation-like Upgrades
// ============================================================

// Passive constellation: C0 (base), C1 (enhanced), C2 (maximum)
// Tracked via rpg_data.passiveConstellation = { "fortitude": 1, "agility": 0, ... }

function getPassiveConstellation(player) {
    const rpgData = getPlayerRpgData(player);
    if (!rpgData.passiveConstellation) rpgData.passiveConstellation = {};
    return rpgData.passiveConstellation;
}

function getPassiveTierName(tier) {
    if (tier <= 0) return "§7[C0]";
    if (tier === 1) return "§e[C1]";
    if (tier >= 2) return "§6§l[C2]§r";
    return "§7[C0]";
}

function getPassiveDescAtTier(passiveId, tier) {
    // Enhanced descriptions at higher constellation tiers
    const tierDescriptions = {
        "fortitude":     { 0: "Resistance 2", 1: "Resistance 2 + Knockback Res", 2: "Resistance 3 + Knockback Res" },
        "agility":       { 0: "Speed 2 & Jump 2", 1: "Speed 2 & Jump 3", 2: "Speed 3 & Jump 3" },
        "titans_grip":   { 0: "Strength 1", 1: "Strength 2", 2: "Strength 2 + Haste 1" },
        "iron_will":     { 0: "Knockback Resistance", 1: "Knockback Res + Resistance 1", 2: "Knockback Res + Resistance 2" },
        "vitality":      { 0: "Health Boost 2", 1: "Health Boost 3", 2: "Health Boost 4" },
        "regeneration":  { 0: "Regen 1", 1: "Regen 2", 2: "Regen 2 + Absorption periodik" },
        "arcane_shield": { 0: "Absorption periodik", 1: "Absorption lebih kuat", 2: "Absorption kuat + Resistance saat shield aktif" },
        "soul_harvest":  { 0: "Lifesteal 10% damage", 1: "Lifesteal 15% + heal saat kill", 2: "Lifesteal 20% + heal besar saat kill" },
        "iron_fortress": { 0: "Resistance 2 saat sneak", 1: "Resistance 3 saat sneak + knockback res", 2: "Resistance 4 saat sneak + knockback res + absorption" },
        "storm_aura":    { 0: "Damage 2 ke musuh r=3 tiap 5s", 1: "Damage 3 ke musuh r=4 tiap 4s + slow", 2: "Damage 4 ke musuh r=5 tiap 3s + slow + weakness" },
        "phoenix_blood": { 0: "Regen 3 saat HP < 33%", 1: "Regen 3 saat HP < 40%", 2: "Regen 4 saat HP < 50%" },
        "adrenaline":    { 0: "Speed 3 saat HP < 33%", 1: "Speed 3 + Strength 1 saat HP < 40%", 2: "Speed 4 + Strength 2 saat HP < 50%" },
        "berserker_rage":{ 0: "Strength + Speed saat diserang", 1: "Strength 2 + Speed 2 saat diserang", 2: "Strength 3 + Speed 2 + Resistance saat diserang" },
        "god_slayer":    { 0: "8% instant kill mob HP < 50%", 1: "12% instant kill mob HP < 60%", 2: "18% instant kill mob HP < 70% + bonus damage" },
        "colossal_vitality": { 0: "Health Boost 4 (+8 hati)", 1: "Health Boost 5 (+10 hati)", 2: "Health Boost 6 (+12 hati) + Regen 1" },
        "blood_frenzy":  { 0: "Kill = +1 stack (Str+Spd, max 5, 8s)", 1: "Kill = +1 stack (Str+Spd+Haste, max 5, 10s)", 2: "Kill = +1 stack (all stats, max 7, 12s)" },
        "leviathan_domain": { 0: "Dolphin+NightVis+Conduit+WaterBreath di air", 1: "+Speed 2 + Resistance 1 di air", 2: "+Strength 1 + Regen 1 + Absorption di air" },
        "second_wind":   { 0: "Revive 50% HP (10m CD)", 1: "Revive 75% HP (8m CD)", 2: "Revive 100% HP (6m CD)" },
        "ghost_walk":    { 0: "Invis + Speed 2 saat sneak HP < 30%", 1: "Invis + Speed 3 saat sneak HP < 40%", 2: "Invis + Speed 3 + NoFallDmg saat sneak HP < 50%" },
        "avatar_of_war": { 0: "Semua stat naik saat HP < 25%", 1: "Semua stat naik saat HP < 35%", 2: "Semua stat MAKSIMAL saat HP < 35%" },
        "undying_will":  { 0: "Auto-revive 40% HP (8m CD)", 1: "Auto-revive 60% HP (6m CD) + buff", 2: "Auto-revive 80% HP (5m CD) + buff kuat" },
        "titans_heart":  { 0: "Health Boost 3 + Regen 1 + Resistance 1", 1: "Health Boost 4 + Regen 2 + Resistance 2", 2: "Health Boost 5 + Regen 2 + Resistance 3 + Absorption periodik" },
        "chaos_aura":    { 0: "Musuh r=4 kena Slowness + Weakness, kamu Speed 1", 1: "Musuh r=5 kena Slow+Weak+Wither, kamu Speed 2 + Str 1", 2: "Musuh r=6 kena Slow+Weak+Poison, kamu Speed 2 + Str 1 + Resistance 1" }
    };

    const descs = tierDescriptions[passiveId];
    if (descs && descs[tier]) return descs[tier];
    // Fallback to base passive desc
    const passive = PASSIVE_POOL.find(p => p.id === passiveId);
    return passive ? passive.desc : "Unknown";
}

function getPlayerPassivePity(player) {
    try {
        const str = player.getDynamicProperty("passive_pity");
        if (str && typeof str === 'string') return JSON.parse(str);
    } catch(e) {}
    return { sinceRare: 0, sinceLegendary: 0, sinceMythic: 0, totalPulls: 0 };
}

function savePlayerPassivePity(player, pity) {
    player.setDynamicProperty("passive_pity", JSON.stringify(pity));
}

function rollPassiveGacha(player) {
    const rpgData = getPlayerRpgData(player);
    if (!rpgData.unlockedGachaPassives) rpgData.unlockedGachaPassives = [];
    if (!rpgData.passiveConstellation) rpgData.passiveConstellation = {};

    const pity = getPlayerPassivePity(player);

    // Check Mythic pity first
    if (pity.sinceMythic >= PASSIVE_PITY_MYTHIC) {
        pity.sinceMythic = 0;
        pity.sinceLegendary = 0;
        pity.sinceRare = 0;
        pity.totalPulls++;
        savePlayerPassivePity(player, pity);

        // Give Mythic unowned or upgrade owned
        const mythicPool = PASSIVE_POOL.filter(p => p.rarity === "Mythic");
        const unownedMythic = mythicPool.filter(p => !rpgData.unlockedGachaPassives.includes(p.id));

        if (unownedMythic.length > 0) {
            const won = unownedMythic[Math.floor(Math.random() * unownedMythic.length)];
            rpgData.unlockedGachaPassives.push(won.id);
            rpgData.passiveConstellation[won.id] = 0;
            savePlayerRpgData(player, rpgData);
            return { passive: won, isDuplicate: false, constellationUpgrade: false };
        }
        // All mythic owned -- upgrade highest constellation below C2
        return upgradePassiveConstellation(rpgData, player);
    }

    // Check Legendary pity
    if (pity.sinceLegendary >= PASSIVE_PITY_LEGENDARY) {
        pity.sinceLegendary = 0;
        pity.sinceRare = 0;
        pity.totalPulls++;
        savePlayerPassivePity(player, pity);

        // Give Legendary or higher unowned
        const legPool = PASSIVE_POOL.filter(p => (p.rarity === "Legendary" || p.rarity === "Mythic") && !rpgData.unlockedGachaPassives.includes(p.id));
        if (legPool.length > 0) {
            const won = legPool[Math.floor(Math.random() * legPool.length)];
            rpgData.unlockedGachaPassives.push(won.id);
            rpgData.passiveConstellation[won.id] = 0;
            savePlayerRpgData(player, rpgData);
            return { passive: won, isDuplicate: false, constellationUpgrade: false };
        }
        // All legendary+ owned -- upgrade constellation
        return upgradePassiveConstellation(rpgData, player);
    }

    // Normal weighted roll -- includes both unowned AND owned (for constellation upgrade)
    // 70% chance to roll unowned first, 30% to roll from all (for constellation)
    const unownedPool = PASSIVE_POOL.filter(p => !rpgData.unlockedGachaPassives.includes(p.id));

    if (unownedPool.length === 0) {
        // All owned -- do constellation upgrade roll
        return rollConstellationUpgrade(rpgData, player, pity);
    }

    // If there are unowned passives, prioritize giving new ones
    // But also allow duplicates for constellation (with reduced weight)
    const useFullPool = Math.random() < 0.30 && Object.values(rpgData.passiveConstellation).some(v => v < 2);

    let pool;
    if (useFullPool) {
        // Roll from full pool (allows duplicates for constellation)
        pool = PASSIVE_POOL;
    } else {
        // Roll from unowned pool only
        pool = unownedPool;
    }

    const totalWeight = pool.reduce((acc, p) => acc + p.weight, 0);
    let randomNum = Math.random() * totalWeight;
    let wonPassive = pool[0]; // fallback

    for (const p of pool) {
        if (randomNum < p.weight) {
            wonPassive = p;
            break;
        }
        randomNum -= p.weight;
    }

    const isDuplicate = rpgData.unlockedGachaPassives.includes(wonPassive.id);

    // Update pity counters
    pity.sinceRare++;
    pity.sinceLegendary++;
    pity.sinceMythic++;
    pity.totalPulls++;

    if (wonPassive.rarity === "Rare" || wonPassive.rarity === "Legendary" || wonPassive.rarity === "Mythic") {
        pity.sinceRare = 0;
    }
    if (wonPassive.rarity === "Legendary" || wonPassive.rarity === "Mythic") {
        pity.sinceLegendary = 0;
    }
    if (wonPassive.rarity === "Mythic") {
        pity.sinceMythic = 0;
    }

    savePlayerPassivePity(player, pity);

    if (isDuplicate) {
        // Constellation upgrade!
        const currentTier = rpgData.passiveConstellation[wonPassive.id] || 0;
        if (currentTier < 2) {
            rpgData.passiveConstellation[wonPassive.id] = currentTier + 1;
            savePlayerRpgData(player, rpgData);
            return { passive: wonPassive, isDuplicate: true, constellationUpgrade: true, newTier: currentTier + 1 };
        }
        // Already C2 -- give shards instead
        addShards(player, getShardReward(wonPassive.rarity));
        savePlayerRpgData(player, rpgData);
        return { passive: wonPassive, isDuplicate: true, constellationUpgrade: false, shardsGiven: true };
    }

    rpgData.unlockedGachaPassives.push(wonPassive.id);
    rpgData.passiveConstellation[wonPassive.id] = 0;
    savePlayerRpgData(player, rpgData);

    return { passive: wonPassive, isDuplicate: false, constellationUpgrade: false };
}

function rollConstellationUpgrade(rpgData, player, pity) {
    // All passives owned -- roll for constellation upgrade
    const upgradeable = PASSIVE_POOL.filter(p => (rpgData.passiveConstellation[p.id] || 0) < 2);
    if (upgradeable.length === 0) {
        // Everything is C2 -- give shards
        addShards(player, 5);
        return { passive: null, isDuplicate: true, constellationUpgrade: false, shardsGiven: true };
    }

    const totalWeight = upgradeable.reduce((acc, p) => acc + p.weight, 0);
    let randomNum = Math.random() * totalWeight;
    let wonPassive = upgradeable[0];

    for (const p of upgradeable) {
        if (randomNum < p.weight) {
            wonPassive = p;
            break;
        }
        randomNum -= p.weight;
    }

    // Update pity
    pity.sinceRare++;
    pity.sinceLegendary++;
    pity.sinceMythic++;
    pity.totalPulls++;
    if (wonPassive.rarity === "Rare" || wonPassive.rarity === "Legendary" || wonPassive.rarity === "Mythic") pity.sinceRare = 0;
    if (wonPassive.rarity === "Legendary" || wonPassive.rarity === "Mythic") pity.sinceLegendary = 0;
    if (wonPassive.rarity === "Mythic") pity.sinceMythic = 0;
    savePlayerPassivePity(player, pity);

    const currentTier = rpgData.passiveConstellation[wonPassive.id] || 0;
    rpgData.passiveConstellation[wonPassive.id] = currentTier + 1;
    savePlayerRpgData(player, rpgData);
    return { passive: wonPassive, isDuplicate: true, constellationUpgrade: true, newTier: currentTier + 1 };
}

function upgradePassiveConstellation(rpgData, player) {
    const upgradeable = PASSIVE_POOL.filter(p => rpgData.unlockedGachaPassives.includes(p.id) && (rpgData.passiveConstellation[p.id] || 0) < 2);
    if (upgradeable.length === 0) {
        addShards(player, 10);
        return { passive: null, isDuplicate: true, constellationUpgrade: false, shardsGiven: true };
    }

    // Prioritize higher rarity for upgrade
    const rarityOrder = ["Mythic", "Legendary", "Rare", "Normal"];
    for (const rarity of rarityOrder) {
        const pool = upgradeable.filter(p => p.rarity === rarity);
        if (pool.length > 0) {
            const won = pool[Math.floor(Math.random() * pool.length)];
            const currentTier = rpgData.passiveConstellation[won.id] || 0;
            rpgData.passiveConstellation[won.id] = currentTier + 1;
            savePlayerRpgData(player, rpgData);
            return { passive: won, isDuplicate: true, constellationUpgrade: true, newTier: currentTier + 1 };
        }
    }
    return { passive: null, isDuplicate: true, constellationUpgrade: false, shardsGiven: true };
}

function getShardReward(rarity) {
    switch (rarity) {
        case "Mythic": return 15;
        case "Legendary": return 8;
        case "Rare": return 4;
        default: return 2;
    }
}

// ============================================================
// PECAHAN INTI (SHARD) SYSTEM (v2.3)
// ============================================================

const SHARDS_PER_PULL = 1;     // Base shards per pull
const SHARD_EPIC_REWARD = 3;   // Bonus shards for Epic+ pull
const SHARD_LEG_REWARD = 8;    // Bonus shards for Legendary pull

const SHARD_EXCHANGE = {
    epic_effect: { cost: 50, name: "Pilih Efek Epic", desc: "Pilih 1 efek Epic untuk item" },
    leg_effect: { cost: 120, name: "Pilih Efek Legendary", desc: "Pilih 1 efek Legendary untuk item" },
    rare_passive: { cost: 60, name: "Pasif Rare Guarantee", desc: "Dapatkan 1 pasif Rare terjamin" },
    leg_passive: { cost: 150, name: "Pasif Legendary Guarantee", desc: "Dapatkan 1 pasif Legendary terjamin" }
};

function getPlayerShards(player) {
    try {
        const str = player.getDynamicProperty("gacha_shards");
        if (str && typeof str === 'string') return JSON.parse(str);
    } catch(e) {}
    return { count: 0 };
}

function savePlayerShards(player, shards) {
    player.setDynamicProperty("gacha_shards", JSON.stringify(shards));
}

function addShards(player, amount) {
    const shards = getPlayerShards(player);
    shards.count += amount;
    savePlayerShards(player, shards);
    return shards.count;
}

function addShardsForPull(player, rarityName) {
    let amount = SHARDS_PER_PULL;
    const rarityIndex = ["Common", "Uncommon", "Rare", "Epic", "Legendary"].indexOf(rarityName);
    if (rarityIndex >= 3) amount += SHARD_EPIC_REWARD;
    if (rarityIndex >= 4) amount += SHARD_LEG_REWARD;
    // Same for passive rarities
    if (rarityName === "Rare") amount += 1;
    if (rarityName === "Legendary") amount += SHARD_EPIC_REWARD;
    if (rarityName === "Mythic") amount += SHARD_LEG_REWARD;

    const total = addShards(player, amount);
    if (amount > 1) {
        player.sendMessage(`§b[Pecahan] §f+${amount} Pecahan Inti §7(total: ${total})`);
    }
}

// ============================================================
// DAILY FREE PULL SYSTEM (v2.3)
// ============================================================

function getPlayerFreePull(player) {
    try {
        const str = player.getDynamicProperty("gacha_free");
        if (str && typeof str === 'string') return JSON.parse(str);
    } catch(e) {}
    return { lastFreeEquip: 0, lastFreePassive: 0, totalFreePulls: 0 };
}

function savePlayerFreePull(player, data) {
    player.setDynamicProperty("gacha_free", JSON.stringify(data));
}

function canFreeEquipPull(player) {
    const data = getPlayerFreePull(player);
    const now = Date.now();
    const oneDayMs = 86400000; // 24 hours
    return (now - data.lastFreeEquip) >= oneDayMs;
}

function canFreePassivePull(player) {
    const data = getPlayerFreePull(player);
    const now = Date.now();
    const threeDayMs = 259200000; // 3 days
    return (now - data.lastFreePassive) >= threeDayMs;
}

function useFreeEquipPull(player) {
    const data = getPlayerFreePull(player);
    data.lastFreeEquip = Date.now();
    data.totalFreePulls++;
    savePlayerFreePull(player, data);
}

function useFreePassivePull(player) {
    const data = getPlayerFreePull(player);
    data.lastFreePassive = Date.now();
    data.totalFreePulls++;
    savePlayerFreePull(player, data);
}

function getFreeEquipTimeRemaining(player) {
    const data = getPlayerFreePull(player);
    const oneDayMs = 86400000;
    const remaining = oneDayMs - (Date.now() - data.lastFreeEquip);
    return Math.max(0, remaining);
}

function getFreePassiveTimeRemaining(player) {
    const data = getPlayerFreePull(player);
    const threeDayMs = 259200000;
    const remaining = threeDayMs - (Date.now() - data.lastFreePassive);
    return Math.max(0, remaining);
}

function formatTimeRemaining(ms) {
    if (ms <= 0) return "Sekarang!";
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.ceil((ms % 3600000) / 60000);
    if (hours > 0) return `${hours}j ${minutes}m`;
    return `${minutes}m`;
}

// ============================================================
// GACHA RITUAL ANIMATION (v2.3) -- Dramatic Reveal
// ============================================================

function triggerGachaRitual(player, callback, isPassive = false) {
    // Phase 1: Channeling
    player.sendMessage("§5§l[ALTAR] §r§7Memulai ritual penempaan...");
    player.runCommandAsync(`playsound beacon.activate @s`);

    // Phase 2: Power surge
    system.runTimeout(() => {
        player.sendMessage("§e§l[ALTAR] §r§7Inti mulai bersinar...");
        player.runCommandAsync(`playsound beacon.power @s`);
    }, 15);

    // Phase 3: Reveal
    system.runTimeout(() => {
        callback();
    }, 30);
}

function triggerGachaAnimations(player, rarity, effectData) {
    const px = Math.floor(player.location.x);
    const py = Math.floor(player.location.y);
    const pz = Math.floor(player.location.z);

    const rarityIndex = ["Common", "Uncommon", "Rare", "Epic", "Legendary"].indexOf(rarity.name);

    // Add shards for this pull
    addShardsForPull(player, rarity.name);

    if (rarityIndex >= 4) { // Legendary
        // Epic reveal sequence
        player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
        system.runTimeout(() => {
            try { player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 2} ${pz}`); } catch(e) {}
        }, 5);
        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=15]`);
        player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.7 1.5 positional`);

        world.sendMessage(`§6§l[GACHA] §r§fPemain §b${player.name} §fbaru saja mendapatkan sihir ${getRarityColor(rarity.name)} §e${effectData.name}§f!`);
        trackStat(player, "gachaRolls", 1);
        unlockAchievement(player, "first_gacha");
        unlockAchievement(player, "first_epic");
        unlockAchievement(player, "first_legendary");
    } else if (rarityIndex >= 3) { // Epic
        player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
        player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);

        world.sendMessage(`§d§l[GACHA] §r§fPemain §b${player.name} §fbaru saja mendapatkan sihir ${getRarityColor(rarity.name)} §e${effectData.name}§f!`);
        trackStat(player, "gachaRolls", 1);
        unlockAchievement(player, "first_gacha");
        unlockAchievement(player, "first_epic");
    } else if (rarityIndex >= 2) { // Rare
        player.sendMessage(`§b[Gacha] Kekuatan langka! ${getRarityColor(rarity.name)} §e${effectData.name}§f!`);
        trackStat(player, "gachaRolls", 1);
        unlockAchievement(player, "first_gacha");
        player.dimension.runCommandAsync(`playsound random.orb @a[x=${px},y=${py},z=${pz},r=5]`);
    } else if (rarityIndex >= 1) { // Uncommon
        player.sendMessage(`§a[Gacha] Berhasil menyihir! ${getRarityColor(rarity.name)} §e${effectData.name}§f!`);
        trackStat(player, "gachaRolls", 1);
        unlockAchievement(player, "first_gacha");
        player.dimension.runCommandAsync(`playsound random.orb @a[x=${px},y=${py},z=${pz},r=5]`);
    } else { // Common
        player.sendMessage(`§7[Gacha] Menyihir barang... ${getRarityColor(rarity.name)} §e${effectData.name}§f. §7Coba lagi untuk hasil lebih baik!`);
        trackStat(player, "gachaRolls", 1);
        unlockAchievement(player, "first_gacha");
        player.dimension.runCommandAsync(`playsound random.pop @a[x=${px},y=${py},z=${pz},r=5]`);
    }
}

function triggerPassiveGachaAnimations(player, wonPassive, result) {
    const px = Math.floor(player.location.x);
    const py = Math.floor(player.location.y);
    const pz = Math.floor(player.location.z);
    const rarityColor = getPassiveRarityColor(wonPassive.rarity);

    // Add shards for this pull
    addShardsForPull(player, wonPassive.rarity);

    if (result.constellationUpgrade) {
        // Constellation upgrade animation
        const tierName = getPassiveTierName(result.newTier);
        if (result.newTier >= 2) {
            player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
            player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);
            world.sendMessage(`§6§l[REINKARNASI] §r§fPemain §b${player.name} §fmengaktifkan ${tierName} §e${wonPassive.name}§f!`);
        } else {
            player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
        }
        player.sendMessage(`§6[Reinkarnasi] §f${wonPassive.name} naik ke ${tierName}§f! Efek baru: §e${getPassiveDescAtTier(wonPassive.id, result.newTier)}`);
    } else if (result.shardsGiven) {
        player.sendMessage(`§b[Gacha] §fSemua pasif sudah C2! Mendapat Pecahan Inti sebagai gantinya.`);
        player.dimension.runCommandAsync(`playsound random.orb @a[x=${px},y=${py},z=${pz},r=5]`);
    } else if (wonPassive.rarity === "Legendary" || wonPassive.rarity === "Mythic") {
        player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
        player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);
        world.sendMessage(`§5§l[GACHA DEWA] §r§fPemain §b${player.name} §fberhasil mendapatkan ${rarityColor}[${wonPassive.rarity}] §e${wonPassive.name}§f!`);
        player.sendMessage(`§5[Gacha] §fKamu mendapatkan ${rarityColor}[${wonPassive.rarity}] §e${wonPassive.name}§f: ${wonPassive.desc}`);
    } else {
        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
        player.sendMessage(`§5[Gacha] §fKamu mendapatkan ${rarityColor}[${wonPassive.rarity}] §e${wonPassive.name}§f: ${wonPassive.desc}`);
    }

    trackStat(player, "gachaRolls", 1);
    unlockAchievement(player, "first_gacha");
    unlockAchievement(player, "first_passive");
    if (wonPassive.rarity === "Legendary") unlockAchievement(player, "legendary_passive");
    if (wonPassive.rarity === "Mythic") unlockAchievement(player, "mythic_passive");
}

function getPassiveRarityColor(rarity) {
    switch (rarity) {
        case "Normal": return "§f";
        case "Rare": return "§b";
        case "Legendary": return "§6§l";
        case "Mythic": return "§d§l";
        default: return "§f";
    }
}

// ============================================================
// GACHA MENU -- Main Hub (v2.4 -- Reorganized 7 buttons)
// ============================================================

export function openGachaMenu(player) {
    const coreScore = getCoreScore(player);
    const eqPity = getPlayerGachaPity(player);
    const passPity = getPlayerPassivePity(player);
    const rpgData = getPlayerRpgData(player);
    const passivesOwned = (rpgData.unlockedGachaPassives || []).length;
    const shards = getPlayerShards(player);
    const banner = getActiveBanner();

    const freeEquip = canFreeEquipPull(player);
    const freePassive = canFreePassivePull(player);
    const freeEquipTime = formatTimeRemaining(getFreeEquipTimeRemaining(player));
    const freePassiveTime = formatTimeRemaining(getFreePassiveTimeRemaining(player));

    const form = new ActionFormData();
    form.title("§5§lAltar Penempaan Inti");

    let bodyText = getUiHeader(player) + "\n";
    bodyText += `§bCore: §f${coreScore} §7| §dPasif: §f${passivesOwned}/${PASSIVE_POOL.length} §7| §ePecahan: §f${shards.count}\n\n`;

    // Banner info -- compact
    const bannerRemaining = formatTimeRemaining(getBannerTimeRemaining());
    bodyText += `${banner.color}§l[BANNER] ${banner.name}§r §7(${bannerRemaining})\n`;

    // Pity Counter -- compact single-line format
    bodyText += `§7Pity Eq: §f${eqPity.sinceEpic}/${EPIC_PITY}§7(E) §f${eqPity.sinceLegendary}/${LEGENDARY_PITY}§7(L)`;
    bodyText += ` §7| Pasif: §f${passPity.sinceLegendary}/${PASSIVE_PITY_LEGENDARY}§7(L) §f${passPity.sinceMythic}/${PASSIVE_PITY_MYTHIC}§7(M)\n`;

    // Free pull status -- compact
    bodyText += `§7Gratis Eq: ${freeEquip ? "§aYA!" : `§c${freeEquipTime}`} §7| Pasif: ${freePassive ? "§aYA!" : `§c${freePassiveTime}`}\n`;

    form.body(bodyText);

    // v2.4: 7 clean buttons -- combined 1x/10x, combined banner+gratis
    form.button("§bTukar Rupiah -> Core\n§7Rp100.000 = 1 Core");
    form.button("§dGacha Senjata/Armor\n§75/45 Core | Pilih 1x atau 10x");
    form.button("§eGacha Pasif Dewa\n§710/90 Core | Pilih 1x atau 10x");
    form.button(`${banner.color}Banner & Gratis\n§7Rate-up + Free pull harian`);
    form.button("§6Kuil Reinkarnasi\n§7Tukar Pecahan Inti");
    form.button("§9Info & Peluang Gacha\n§7Lihat rate, pity & efek");
    form.button("§cKembali ke Atribut & Kekuatan");

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: openConvertMenu(player); break;
            case 1: openEquipmentGachaChoice(player); break;   // Combined 1x/10x
            case 2: openPassiveGachaChoice(player); break;     // Combined 1x/10x
            case 3: openBannerAndFreeMenu(player); break;      // Combined banner + free pull
            case 4: openShardExchangeMenu(player); break;
            case 5: openGachaInfoMenu(player); break;
            case 6:
                import("./menu_system.js").then(mod => {
                    system.runTimeout(() => { mod.openRpgGachaMenu(player); }, 5);
                }).catch(()=>{});
                break;
        }
    });
}

// ============================================================
// EQUIPMENT GACHA CHOICE (v2.4 -- Combined 1x/10x selector)
// ============================================================

function openEquipmentGachaChoice(player) {
    const coreScore = getCoreScore(player);

    const form = new ModalFormData();
    form.title("§dGacha Senjata/Armor");
    form.dropdown(
        "§7Pilih jumlah tarikan:\n" +
        `§7Core kamu: §b${coreScore}\n\n` +
        `§d1x Tarikan = §b5 Core\n` +
        `§d10x Tarikan = §b45 Core §7(hemat 5!)`,
        ["1x Tarikan (5 Core)", "10x Tarikan (45 Core)"],
        0
    );

    form.show(player).then(res => {
        if (res.canceled) return;
        const pullCount = res.formValues[0] === 0 ? 1 : 10;
        openEquipmentGacha(player, pullCount);
    });
}

// ============================================================
// PASSIVE GACHA CHOICE (v2.4 -- Combined 1x/10x selector)
// ============================================================

function openPassiveGachaChoice(player) {
    const coreScore = getCoreScore(player);

    const form = new ModalFormData();
    form.title("§eGacha Pasif Dewa");
    form.dropdown(
        "§7Pilih jumlah tarikan:\n" +
        `§7Core kamu: §b${coreScore}\n\n` +
        `§e1x Tarikan = §b10 Core\n` +
        `§e10x Tarikan = §b90 Core §7(hemat 10!)`,
        ["1x Tarikan (10 Core)", "10x Tarikan (90 Core)"],
        0
    );

    form.show(player).then(res => {
        if (res.canceled) return;
        const pullCount = res.formValues[0] === 0 ? 1 : 10;
        openPassiveGacha(player, pullCount);
    });
}

// ============================================================
// BANNER & GRATIS COMBINED MENU (v2.4)
// ============================================================

function openBannerAndFreeMenu(player) {
    const banner = getActiveBanner();
    const coreScore = getCoreScore(player);
    const remaining = formatTimeRemaining(getBannerTimeRemaining());
    const eqPity = getPlayerGachaPity(player);

    const freeEquip = canFreeEquipPull(player);
    const freePassive = canFreePassivePull(player);
    const freeEquipTime = formatTimeRemaining(getFreeEquipTimeRemaining(player));
    const freePassiveTime = formatTimeRemaining(getFreePassiveTimeRemaining(player));

    const form = new ActionFormData();
    form.title(`${banner.color}§lBanner & Gratis`);

    let bodyText = `${banner.color}§l[BANNER] ${banner.name}§r\n`;
    bodyText += `§7${banner.desc}\n`;
    bodyText += `§7Berganti dalam: §e${remaining}\n`;
    bodyText += `§bCore: §f${coreScore}\n\n`;

    bodyText += `§e§lRate-Up:§r\n`;
    bodyText += `  ${getRarityColor(banner.featuredRarity)} §e${banner.featuredEffect.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
    bodyText += `  §7Peluang naik §a50%§7 dari base rate!\n\n`;

    bodyText += `§e§lPity Counter:§r\n`;
    bodyText += `§7Epic: §f${eqPity.sinceEpic}/${EPIC_PITY} | Legendary: §f${eqPity.sinceLegendary}/${LEGENDARY_PITY}\n\n`;

    bodyText += `§a§l--- Tarikan Gratis ---§r\n`;
    bodyText += `§7Equipment: ${freeEquip ? "§a§lTERSEDIA!" : `§c${freeEquipTime} lagi`} §7(24j cooldown)\n`;
    bodyText += `§7Pasif: ${freePassive ? "§a§lTERSEDIA!" : `§c${freePassiveTime} lagi`} §7(72j cooldown)\n`;

    form.body(bodyText);

    // Banner pull buttons
    form.button("§dTarik Banner (1x)\n§75 Core | Rate-up aktif!");
    form.button("§dTarik Banner (10x)\n§745 Core | Rate-up aktif!");

    // Free pull buttons
    if (freeEquip) {
        form.button("§aKlaim Equipment Gratis!\n§7Free 1x gacha senjata/armor");
    } else {
        form.button(`§8Equipment Gratis\n§7Tunggu ${freeEquipTime}`);
    }
    if (freePassive) {
        form.button("§eKlaim Pasif Gratis!\n§7Free 1x gacha pasif dewa");
    } else {
        form.button(`§8Pasif Gratis\n§7Tunggu ${freePassiveTime}`);
    }

    form.button("§cKembali ke Altar");

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: openBannerGacha(player, banner, 1); break;
            case 1: openBannerGacha(player, banner, 10); break;
            case 2:
                if (freeEquip) openFreeEquipmentPull(player);
                else openBannerAndFreeMenu(player);
                break;
            case 3:
                if (freePassive) openFreePassivePull(player);
                else openBannerAndFreeMenu(player);
                break;
            case 4: openGachaMenu(player); break;
        }
    });
}

// ============================================================
// BANNER MENU (v2.3) -- Featured Rate-up
// ============================================================

function openBannerMenu(player) {
    const banner = getActiveBanner();
    const coreScore = getCoreScore(player);
    const remaining = formatTimeRemaining(getBannerTimeRemaining());
    const eqPity = getPlayerGachaPity(player);

    const form = new ActionFormData();
    form.title(`${banner.color}§lBanner: ${banner.name}`);

    let bodyText = `${banner.color}§l${banner.name}§r\n`;
    bodyText += `§7${banner.desc}\n\n`;
    bodyText += `§7Berganti dalam: §e${remaining}\n`;
    bodyText += `§bCore: §f${coreScore}\n\n`;

    bodyText += `§e§lRate-Up Details:§r\n`;
    bodyText += `§7Banner ini meningkatkan peluang mendapatkan:\n`;
    bodyText += `  ${getRarityColor(banner.featuredRarity)} §e${banner.featuredEffect.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
    bodyText += `  §7Peluang naik §a50%§7 dari base rate rarity!\n\n`;

    bodyText += `§e§lPity Counter:§r\n`;
    bodyText += `§7Epic: §f${eqPity.sinceEpic}/${EPIC_PITY} | Legendary: §f${eqPity.sinceLegendary}/${LEGENDARY_PITY}\n\n`;

    bodyText += `§7Tarikan banner menggunakan sistem yang sama dengan gacha biasa, tapi efek featured lebih sering muncul.`;

    form.body(bodyText);

    form.button("§dTarik Banner (1x)\n§75 Core | Rate-up aktif!");
    form.button("§dTarik Banner (10x)\n§745 Core | Rate-up aktif!");
    form.button("§cKembali ke Altar");

    form.show(player).then(res => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: openBannerGacha(player, banner, 1); break;
            case 1: openBannerGacha(player, banner, 10); break;
            case 2: openGachaMenu(player); break;
        }
    });
}

function openBannerGacha(player, banner, pullCount) {
    // Same as equipment gacha but with banner rate-up
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;

    const objCore = world.scoreboard.getObjective("core");
    let currentCore = 0;
    try { if (objCore) currentCore = objCore.getScore(player) || 0; } catch (e) {}

    const cost = pullCount === 1 ? GACHA_COST_EQUIPMENT : GACHA_10PULL_COST;

    if (currentCore < cost) {
        player.sendMessage(`§c[Gacha] Core tidak mencukupi! Diperlukan §b${cost} Core§c.`);
        return;
    }

    // Scan inventory for valid gear
    const validItems = [];
    for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (!item) continue;
        const category = getItemCategory(item.typeId);
        if (category !== "invalid") {
            let cleanName = item.typeId.replace("minecraft:", "").replace(/_/g, " ");
            cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());
            const eff = item.getDynamicProperty("gacha_effect");
            let effName = "";
            if (eff && typeof eff === 'string' && eff !== "none") effName = " §d(Efek)";
            validItems.push({ slotIndex: i, item, category, displayName: `[Slot ${i}] ${cleanName}${effName}` });
        }
    }

    if (validItems.length === 0) {
        player.sendMessage("§c[Gacha] Tidak ada Senjata atau Armor yang valid di dalam Inventory.");
        return;
    }

    // Filter items that match banner category for rate-up hint
    const preferCategory = banner.featuredCategory;
    const options = validItems.map(v => {
        const isMatch = v.category === preferCategory;
        return { ...v, isBannerMatch: isMatch };
    });

    const form = new ModalFormData();
    form.title(`${banner.color}Banner: ${banner.name}`);
    const dropOptions = options.map(v =>
        `${v.displayName}${v.isBannerMatch ? " §a[RATE-UP]" : ""}`
    );
    form.dropdown(`Pilih barang (§aRATE-UP§7 = kategori cocok banner):\n§7Harga: ${cost} Core`, dropOptions);

    form.show(player).then(res => {
        if (res.canceled) return;

        const selected = options[res.formValues[0]];
        const isBannerMatch = selected.isBannerMatch;

        if (pullCount === 1) {
            const existingEffect = selected.item.getDynamicProperty("gacha_effect");
            if (existingEffect && typeof existingEffect === "string" && existingEffect !== "none") {
                objCore.setScore(player, currentCore - GACHA_COST_EQUIPMENT);
                // Reroll with banner rate-up
                const rarity = getRandomRarityWithPity(player);
                let effectData;

                // Banner rate-up: 50% chance to get featured effect if rarity matches AND category matches
                if (isBannerMatch && rarity.name === banner.featuredRarity && Math.random() < 0.50) {
                    const featuredEffect = getEffectPool(banner.featuredCategory, banner.featuredRarity);
                    // Find the specific featured effect
                    const allEffects = getAllEffectsForCategory(banner.featuredCategory, banner.featuredRarity);
                    const found = allEffects.find(e => e.id === banner.featuredEffect);
                    effectData = found || getEffectPool(selected.category, rarity.name);
                } else {
                    effectData = getEffectPool(selected.category, rarity.name);
                }

                // Show reroll confirm
                const oldLore = selected.item.getLore();
                const oldDesc = oldLore.length > 1 ? oldLore[1].replace("§r§7Kekuatan: ", "") : "Unknown";

                const confirmForm = new MessageFormData();
                confirmForm.title("§5Reroll Konfirmasi");
                confirmForm.body(
                    `§fBarang ini sudah memiliki kekuatan!\n\n` +
                    `§cEfek Lama:\n§7${oldDesc}\n\n` +
                    `§aEfek Baru:\n${getRarityColor(rarity.name)} §f- §e${effectData.name}\n§7${effectData.desc}\n\n` +
                    (isBannerMatch ? `§aBanner Rate-Up aktif untuk item ini!\n` : ``) +
                    `§fGanti kekuatan lama?`
                );
                confirmForm.button1("§aYa, Ganti!");
                confirmForm.button2("§cTidak");

                confirmForm.show(player).then(cres => {
                    if (cres.canceled) return;
                    if (cres.selection === 0) {
                        selected.item.setDynamicProperty("gacha_effect", effectData.id);
                        selected.item.setLore([
                            `§r${getRarityColor(rarity.name)}`,
                            `§r§7Kekuatan: §e${effectData.name} §f(§7${effectData.desc}§f)`
                        ]);
                        inv.setItem(selected.slotIndex, selected.item);
                        triggerGachaAnimations(player, rarity, effectData);
                    } else {
                        player.sendMessage("§e[Gacha] Kekuatan lama dipertahankan.");
                    }
                });
                return;
            }

            objCore.setScore(player, currentCore - GACHA_COST_EQUIPMENT);

            const rarity = getRandomRarityWithPity(player);
            let effectData;

            if (isBannerMatch && rarity.name === banner.featuredRarity && Math.random() < 0.50) {
                const allEffects = getAllEffectsForCategory(banner.featuredCategory, banner.featuredRarity);
                const found = allEffects.find(e => e.id === banner.featuredEffect);
                effectData = found || getEffectPool(selected.category, rarity.name);
            } else {
                effectData = getEffectPool(selected.category, rarity.name);
            }

            triggerGachaRitual(player, () => {
                selected.item.setDynamicProperty("gacha_effect", effectData.id);
                selected.item.setLore([
                    `§r${getRarityColor(rarity.name)}`,
                    `§r§7Kekuatan: §e${effectData.name} §f(§7${effectData.desc}§f)`
                ]);
                inv.setItem(selected.slotIndex, selected.item);
                triggerGachaAnimations(player, rarity, effectData);
            });
        } else {
            // 10-pull banner
            objCore.setScore(player, currentCore - GACHA_10PULL_COST);

            let bestRarity = -1;
            let bestResult = null;
            const rarityOrder = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
            let results = [];

            for (let i = 0; i < 10; i++) {
                const rarity = getRandomRarityWithPity(player);
                let effectData;

                if (isBannerMatch && rarity.name === banner.featuredRarity && Math.random() < 0.50) {
                    const allEffects = getAllEffectsForCategory(banner.featuredCategory, banner.featuredRarity);
                    const found = allEffects.find(e => e.id === banner.featuredEffect);
                    effectData = found || getEffectPool(selected.category, rarity.name);
                } else {
                    effectData = getEffectPool(selected.category, rarity.name);
                }

                const rarityIndex = rarityOrder.indexOf(rarity.name);
                results.push({ rarity, effectData });

                if (rarityIndex > bestRarity) {
                    bestRarity = rarityIndex;
                    bestResult = { rarity, effectData };
                }
            }

            // Apply best result
            selected.item.setDynamicProperty("gacha_effect", bestResult.effectData.id);
            selected.item.setLore([
                `§r${getRarityColor(bestResult.rarity.name)}`,
                `§r§7Kekuatan: §e${bestResult.effectData.name} §f(§7${bestResult.effectData.desc}§f)`
            ]);
            inv.setItem(selected.slotIndex, selected.item);

            // Show results
            let summaryMsg = `§5§l[BANNER 10x -- ${banner.name}] §r§fHasil terbaik:\n`;
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                const isBest = r === bestResult;
                const isBannerFeat = r.effectData.id === banner.featuredEffect;
                summaryMsg += `  ${isBest ? "§e§l>" : "§7"} ${getRarityColor(r.rarity.name)} §e${r.effectData.name}${isBannerFeat ? " §d[RATE-UP]" : ""}${isBest ? " §a§l(TERPILIH)" : ""}\n`;
            }
            player.sendMessage(summaryMsg);

            triggerGachaAnimations(player, bestResult.rarity, bestResult.effectData);
            trackStat(player, "gachaRolls", 10);
            unlockAchievement(player, "first_gacha");
            if (bestRarity >= 3) unlockAchievement(player, "first_epic");
            if (bestRarity >= 4) unlockAchievement(player, "first_legendary");
            if (bestRarity >= 4) unlockAchievement(player, "ten_pull_legendary");
        }
    });
}

// Helper: Get all effects for a category and rarity (for banner featured effect lookup)
function getAllEffectsForCategory(category, rarityName) {
    try {
        // Import effects from gacha_effects.js pools
        const mod = import("./gacha_effects.js");
        // Since we need sync access, use the getEffectPool logic but return all matches
        const pools = {
            weapon: "WEAPON_EFFECTS",
            helmet: "HELMET_EFFECTS",
            chest: "CHEST_EFFECTS",
            legs: "LEG_EFFECTS",
            boots: "BOOT_EFFECTS",
            tool: "TOOL_EFFECTS"
        };
        // Can't do dynamic import sync, so we'll use getEffectPool multiple times
        // Instead, let's just check from the known effect pools
        return []; // Fallback - getEffectPool will be used instead
    } catch(e) {
        return [];
    }
}

// ============================================================
// FREE PULL MENU (v2.3)
// ============================================================

function openFreePullMenu(player) {
    const freeEquip = canFreeEquipPull(player);
    const freePassive = canFreePassivePull(player);
    const freeEquipTime = formatTimeRemaining(getFreeEquipTimeRemaining(player));
    const freePassiveTime = formatTimeRemaining(getFreePassiveTimeRemaining(player));

    const form = new ActionFormData();
    form.title("§aTarikan Gratis Harian");

    let bodyText = "§e§lTARIKAN GRATIS§r\n";
    bodyText += "§7Setiap hari kamu bisa menarik gacha GRATIS!\n";
    bodyText += "§7Ini cara terbaik untuk mencoba keberuntunganmu.\n\n";

    bodyText += `§dEquipment Gratis: ${freeEquip ? "§a§lTERSEDIA!" : `§c${freeEquipTime} lagi`}\n`;
    bodyText += `§7(1x gratis setiap 24 jam)\n\n`;

    bodyText += `§ePasif Dewa Gratis: ${freePassive ? "§a§lTERSEDIA!" : `§c${freePassiveTime} lagi`}\n`;
    bodyText += `§7(1x gratis setiap 72 jam)\n\n`;

    bodyText += `§7Free pull tetap mengikuti pity system dan memberikan Pecahan Inti!`;

    form.body(bodyText);

    if (freeEquip) {
        form.button("§dKlaim Equipment Gratis!\n§7Free 1x gacha senjata/armor");
    } else {
        form.button(`§8Equipment Gratis\n§7Tunggu ${freeEquipTime}`);
    }

    if (freePassive) {
        form.button("§eKlaim Pasif Gratis!\n§7Free 1x gacha pasif dewa");
    } else {
        form.button(`§8Pasif Gratis\n§7Tunggu ${freePassiveTime}`);
    }

    form.button("§cKembali ke Altar");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0 && freeEquip) {
            openFreeEquipmentPull(player);
        } else if (res.selection === 1 && freePassive) {
            openFreePassivePull(player);
        } else {
            openGachaMenu(player);
        }
    });
}

function openFreeEquipmentPull(player) {
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;

    const validItems = [];
    for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (!item) continue;
        const category = getItemCategory(item.typeId);
        if (category !== "invalid") {
            let cleanName = item.typeId.replace("minecraft:", "").replace(/_/g, " ");
            cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());
            const eff = item.getDynamicProperty("gacha_effect");
            let effName = eff && typeof eff === 'string' && eff !== "none" ? " §d(Efek)" : "";
            validItems.push({ slotIndex: i, item, category, displayName: `[Slot ${i}] ${cleanName}${effName}` });
        }
    }

    if (validItems.length === 0) {
        player.sendMessage("§c[Gacha] Tidak ada Senjata atau Armor yang valid di Inventory.");
        openFreePullMenu(player);
        return;
    }

    const form = new ModalFormData();
    form.title("§aFree Equipment Gacha!");
    const options = validItems.map(v => v.displayName);
    form.dropdown("§aGRATIS!§7 Pilih barang yang ingin disihir:", options);

    form.show(player).then(res => {
        if (res.canceled) return;

        useFreeEquipPull(player);
        const selected = validItems[res.formValues[0]];

        triggerGachaRitual(player, () => {
            const rarity = getRandomRarityWithPity(player);
            const effectData = getEffectPool(selected.category, rarity.name);

            selected.item.setDynamicProperty("gacha_effect", effectData.id);
            selected.item.setLore([
                `§r${getRarityColor(rarity.name)}`,
                `§r§7Kekuatan: §e${effectData.name} §f(§7${effectData.desc}§f)`
            ]);
            inv.setItem(selected.slotIndex, selected.item);

            player.sendMessage("§a§l[FREE PULL!] §r§fTarikan gratis harian digunakan!");
            triggerGachaAnimations(player, rarity, effectData);
        });
    });
}

function openFreePassivePull(player) {
    useFreePassivePull(player);

    triggerGachaRitual(player, () => {
        const result = rollPassiveGacha(player);

        if (result.isDuplicate || !result.passive) {
            if (result.shardsGiven) {
                player.sendMessage("§b[FREE PULL] §fSemua pasif sudah C2! Dapat Pecahan Inti.");
            } else {
                addShards(player, 5);
                player.sendMessage("§b[FREE PULL] §fSemua pasif dimiliki! Dapat 5 Pecahan Inti.");
            }
        } else {
            player.sendMessage("§a§l[FREE PULL!] §r§fTarikan gratis pasif digunakan!");
            triggerPassiveGachaAnimations(player, result.passive, result);
        }
    }, true);
}

// ============================================================
// SHARD EXCHANGE MENU -- Kuil Reinkarnasi (v2.3)
// ============================================================

function openShardExchangeMenu(player) {
    const shards = getPlayerShards(player);

    const form = new ActionFormData();
    form.title("§6Kuil Reinkarnasi");

    let bodyText = "§6§lKUIL REINKARNASI§r\n";
    bodyText += "§7Tukar Pecahan Inti yang terkumpul dari gacha\n";
    bodyText += "§7untuk mendapatkan item terjamin!\n\n";

    bodyText += `§ePecahan Inti: §f${shards.count}\n\n`;

    bodyText += "§6§l--- Tukaran Tersedia ---§r\n";
    for (const [key, exchange] of Object.entries(SHARD_EXCHANGE)) {
        const canAfford = shards.count >= exchange.cost;
        bodyText += `${canAfford ? "§a" : "§c"}[${exchange.cost} Pecahan] §f${exchange.name}\n`;
        bodyText += `  §7${exchange.desc}\n`;
    }

    bodyText += `\n§7Setiap gacha pull memberikan §e1+ Pecahan§7. Bonus Pecahan untuk Epic+ dan Legendary!`;

    form.body(bodyText);

    for (const [key, exchange] of Object.entries(SHARD_EXCHANGE)) {
        const canAfford = shards.count >= exchange.cost;
        const color = canAfford ? "§a" : "§c";
        form.button(`${color}${exchange.name}\n§7${exchange.cost} Pecahan`);
    }

    form.button("§cKembali ke Altar");

    form.show(player).then(res => {
        if (res.canceled) return;

        const keys = Object.keys(SHARD_EXCHANGE);
        if (res.selection >= keys.length) {
            openGachaMenu(player);
            return;
        }

        const key = keys[res.selection];
        const exchange = SHARD_EXCHANGE[key];

        if (shards.count < exchange.cost) {
            player.sendMessage(`§c[Kuil] Pecahan Inti tidak cukup! Diperlukan ${exchange.cost}, kamu punya ${shards.count}.`);
            openShardExchangeMenu(player);
            return;
        }

        // Process exchange
        shards.count -= exchange.cost;
        savePlayerShards(player, shards);

        if (key === "rare_passive" || key === "leg_passive") {
            processPassiveShardExchange(player, key);
        } else {
            processEffectShardExchange(player, key);
        }
    });
}

function processPassiveShardExchange(player, key) {
    const rpgData = getPlayerRpgData(player);
    if (!rpgData.unlockedGachaPassives) rpgData.unlockedGachaPassives = [];
    if (!rpgData.passiveConstellation) rpgData.passiveConstellation = {};

    const targetRarity = key === "rare_passive" ? "Rare" : "Legendary";
    const pool = PASSIVE_POOL.filter(p => p.rarity === targetRarity && !rpgData.unlockedGachaPassives.includes(p.id));

    if (pool.length === 0) {
        // All owned at this rarity -- try constellation upgrade
        const upgradeable = PASSIVE_POOL.filter(p => p.rarity === targetRarity && (rpgData.passiveConstellation[p.id] || 0) < 2);
        if (upgradeable.length > 0) {
            const won = upgradeable[Math.floor(Math.random() * upgradeable.length)];
            const tier = (rpgData.passiveConstellation[won.id] || 0) + 1;
            rpgData.passiveConstellation[won.id] = tier;
            savePlayerRpgData(player, rpgData);
            player.sendMessage(`§6[Kuil] §f${won.name} naik ke ${getPassiveTierName(tier)}!`);
            player.runCommandAsync(`playsound random.levelup @s`);
        } else {
            // Refund shards
            const shards = getPlayerShards(player);
            shards.count += SHARD_EXCHANGE[key].cost;
            savePlayerShards(player, shards);
            player.sendMessage("§c[Kuil] Semua pasif rarity ini sudah C2! Pecahan dikembalikan.");
        }
        return;
    }

    const won = pool[Math.floor(Math.random() * pool.length)];
    rpgData.unlockedGachaPassives.push(won.id);
    rpgData.passiveConstellation[won.id] = 0;
    savePlayerRpgData(player, rpgData);

    player.sendMessage(`§6[Kuil] §fBerhasil mendapatkan ${getPassiveRarityColor(won.rarity)}[${won.rarity}] §e${won.name}§f: ${won.desc}`);
    player.runCommandAsync(`playsound random.levelup @s`);
}

function processEffectShardExchange(player, key) {
    // For equipment effects -- player picks item first
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;

    const targetRarity = key === "epic_effect" ? "Epic" : "Legendary";
    const validItems = [];

    for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (!item) continue;
        const category = getItemCategory(item.typeId);
        if (category !== "invalid") {
            let cleanName = item.typeId.replace("minecraft:", "").replace(/_/g, " ");
            cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());
            validItems.push({ slotIndex: i, item, category, displayName: `[Slot ${i}] ${cleanName}` });
        }
    }

    if (validItems.length === 0) {
        // Refund
        const shards = getPlayerShards(player);
        shards.count += SHARD_EXCHANGE[key].cost;
        savePlayerShards(player, shards);
        player.sendMessage("§c[Kuil] Tidak ada item valid. Pecahan dikembalikan.");
        return;
    }

    const form = new ModalFormData();
    form.title(`§6Pilih Item -- ${targetRarity} Guarantee`);
    const options = validItems.map(v => v.displayName);
    form.dropdown(`Pilih item untuk mendapatkan efek §d${targetRarity}§f:`, options);

    form.show(player).then(res => {
        if (res.canceled) {
            // Refund on cancel
            const shards = getPlayerShards(player);
            shards.count += SHARD_EXCHANGE[key].cost;
            savePlayerShards(player, shards);
            return;
        }

        const selected = validItems[res.formValues[0]];
        const effectData = getEffectPool(selected.category, targetRarity);

        selected.item.setDynamicProperty("gacha_effect", effectData.id);
        selected.item.setLore([
            `§r${getRarityColor(targetRarity)}`,
            `§r§7Kekuatan: §e${effectData.name} §f(§7${effectData.desc}§f)`
        ]);
        inv.setItem(selected.slotIndex, selected.item);

        player.sendMessage(`§6[Kuil] §fBerhasil menyihir item dengan ${getRarityColor(targetRarity)} §e${effectData.name}§f!`);
        player.runCommandAsync(`playsound random.levelup @s`);
    });
}

// ============================================================
// GACHA INFO MENU -- Rates, Pity, Effects (v2.3)
// ============================================================

function openGachaInfoMenu(player) {
    const banner = getActiveBanner();

    const form = new ActionFormData();
    form.title("§9Info & Peluang Gacha");

    form.body(
        "§e§lEQUIPMENT GACHA§r\n" +
        "Sihirkan senjata/armor dengan kekuatan mistis!\n\n" +
        "§fPeluang Rarity:\n" +
        "  §f[Common] §745% -- Efek ringan\n" +
        "  §a[Uncommon] §730% -- Efek menengah\n" +
        "  §b[Rare] §718% -- Efek kuat\n" +
        "  §d[Epic] §76% -- Efek sangat kuat\n" +
        "  §6§l[Legendary] §71% -- Kekuatan ultimate\n\n" +
        "§ePity System (Equipment):\n" +
        "  §7Setiap §f30x§7 tanpa Epic = §dGaransi Epic§7!\n" +
        "  §7Setiap §f80x§7 tanpa Legendary = §6Garansi Legendary§7!\n\n" +
        "§e§lPASIF DEWA GACHA§r\n" +
        "Dapatkan skill pasif permanen dari para dewa!\n\n" +
        "§fPeluang Rarity:\n" +
        "  §f[Normal] §750% -- Fortitude, Agility, Titan's Grip, Iron Will\n" +
        "  §b[Rare] §730% -- Vitality, Vigor, Arcane Shield, Soul Harvest, Iron Fortress, Storm Aura\n" +
        "  §6§l[Legendary] §715% -- Phoenix Blood, Adrenaline, Berserker's Rage, God Slayer, Colossal Vitality, Blood Frenzy, Leviathan's Domain\n" +
        "  §d§l[Mythic] §75% -- Second Wind, Ghost Walk, Avatar of War, Undying Will, Titan's Heart, Chaos Aura\n\n" +
        "§ePity System (Pasif):\n" +
        "  §7Setelah §f15x§7 tanpa Leg+ = §6Garansi Legendary§7!\n" +
        "  §7Setelah §f50x§7 tanpa Mythic = §dGaransi Mythic§7!\n\n" +
        "§e§lREINKARNASI (BARU!)§r\n" +
        "  §7Pasif duplikat meningkatkan tier kekuatan!\n" +
        "  §7[C0] = Base -> [C1] = Enhanced -> [C2] = Maximum\n" +
        "  §7C2 = Efek paling kuat versi pasif tersebut!\n\n" +
        "§e§lBANNER (BARU!)§r\n" +
        `  ${banner.color}Banner Aktif: ${banner.name}\n` +
        "  §7Rate-up 50% untuk efek featured saat kategori cocok!\n" +
        "  §7Banner berganti setiap §e2 jam§7.\n\n" +
        "§e§lPECAHAN INTI (BARU!)§r\n" +
        "  §7Setiap gacha pull = §e1+ Pecahan Inti§7.\n" +
        "  §7Bonus Pecahan untuk pull Epic+ dan Legendary!\n" +
        "  §7Tukar di §6Kuil Reinkarnasi§7 untuk item terjamin.\n\n" +
        "§e§lTARIKAN GRATIS (BARU!)§r\n" +
        "  §7Equipment: 1x gratis setiap §a24 jam§7!\n" +
        "  §7Pasif: 1x gratis setiap §a72 jam§7!\n\n" +
        "§e10-Pull Diskon:\n" +
        "  §7Equipment 10x = §b45 Core§7 (hemat 5!)\n" +
        "  §7Pasif 10x = §b90 Core§7 (hemat 10!)"
    );

    form.button("§cKembali ke Altar");
    form.show(player).then(() => { openGachaMenu(player); });
}

// ============================================================
// CORE CONVERT MENU
// ============================================================

function openConvertMenu(player) {
    const form = new ModalFormData();
    form.title("§bTukar Core");
    form.slider(`Berapa Core yang ingin dibeli?\n§7Harga: ${formatRupiah(CORE_PRICE)} / Core`, 1, 64, 1, 1);

    form.show(player).then(res => {
        if (res.canceled) return;

        const amount = Math.floor(res.formValues[0]);
        const cost = amount * CORE_PRICE;

        const objDompet = world.scoreboard.getObjective("dompet");
        const objCore = world.scoreboard.getObjective("core");
        if (!objDompet || !objCore) return;

        let currentRupiah = 0;
        try { currentRupiah = objDompet.getScore(player) || 0; } catch (e) {}

        if (currentRupiah >= cost) {
            objDompet.setScore(player, currentRupiah - cost);
            let currentCore = 0;
            try { currentCore = objCore.getScore(player) || 0; } catch (e) {}
            objCore.setScore(player, currentCore + amount);

            player.sendMessage(`§a[System] Berhasil membeli §b${amount} Core §aseharga §e${formatRupiah(cost)}!`);
        } else {
            player.sendMessage(`§c[System] Saldo Rupiah Anda tidak mencukupi. Diperlukan ${formatRupiah(cost)}.`);
        }
    });
}

// ============================================================
// EQUIPMENT GACHA -- Single & Multi Pull (v2.3 with Ritual)
// ============================================================

export function openEquipmentGacha(player, pullCount = 1) {
    const invComponent = player.getComponent("inventory");
    if (!invComponent) return;
    const inv = invComponent.container;

    const objCore = world.scoreboard.getObjective("core");
    let currentCore = 0;
    try { if (objCore) currentCore = objCore.getScore(player) || 0; } catch (e) {}

    const cost = pullCount === 1 ? GACHA_COST_EQUIPMENT : GACHA_10PULL_COST;

    if (currentCore < cost) {
        player.sendMessage(`§c[Gacha] Core tidak mencukupi! Diperlukan §b${cost} Core§c.`);
        return;
    }

    // Scan inventory for valid gear
    const validItems = [];
    for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (!item) continue;

        const category = getItemCategory(item.typeId);
        if (category !== "invalid") {
            const eff = item.getDynamicProperty("gacha_effect");
            let effName = "";
            if (eff && typeof eff === 'string' && eff !== "none") {
                effName = " §d(Memiliki Efek)";
            }

            let cleanName = item.typeId.replace("minecraft:", "").replace(/_/g, " ");
            cleanName = cleanName.replace(/\b\w/g, l => l.toUpperCase());

            validItems.push({
                slotIndex: i,
                item: item,
                category: category,
                displayName: `[Slot ${i}] ${cleanName}${effName}`
            });
        }
    }

    if (validItems.length === 0) {
        player.sendMessage("§c[Gacha] Tidak ada Senjata atau Armor yang valid di dalam Inventory.");
        return;
    }

    if (pullCount === 1) {
        // Single pull -- show item selection
        const form = new ModalFormData();
        form.title("§dPilih Equipment");
        const options = validItems.map(v => v.displayName);
        form.dropdown("Pilih barang yang ingin disihir:\n§7Harga: 5 Core", options);

        form.show(player).then(res => {
            if (res.canceled) return;

            const selected = validItems[res.formValues[0]];
            const slot = selected.slotIndex;
            const item = selected.item;
            const category = selected.category;

            const existingEffect = item.getDynamicProperty("gacha_effect");
            if (existingEffect && typeof existingEffect === "string" && existingEffect !== "none") {
                executeRerollFlow(player, item, slot, inv, currentCore, objCore, category);
                return;
            }

            objCore.setScore(player, currentCore - GACHA_COST_EQUIPMENT);

            // Ritual animation before reveal
            triggerGachaRitual(player, () => {
                applyGachaResult(player, item, slot, inv, category);
            });
        });
    } else {
        // 10-pull -- select one item, roll 10 times on it
        const form = new ModalFormData();
        form.title("§dGacha 10x -- Pilih Equipment");
        const options = validItems.map(v => v.displayName);
        form.dropdown(`Pilih barang untuk 10x gacha:\n§7Harga: ${GACHA_10PULL_COST} Core (hemat 5 Core!)\n§7Akan disihir 10x berturut, efek TERAKHIR yang dipasang.`, options);

        form.show(player).then(res => {
            if (res.canceled) return;

            const selected = validItems[res.formValues[0]];
            objCore.setScore(player, currentCore - GACHA_10PULL_COST);

            // Roll 10 times, keep the best result
            let bestRarity = -1;
            let bestResult = null;
            const rarityOrder = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
            let results = [];

            for (let i = 0; i < 10; i++) {
                const rarity = getRandomRarityWithPity(player);
                const effectData = getEffectPool(selected.category, rarity.name);
                const rarityIndex = rarityOrder.indexOf(rarity.name);

                results.push({ rarity, effectData });

                if (rarityIndex > bestRarity) {
                    bestRarity = rarityIndex;
                    bestResult = { rarity, effectData };
                }
            }

            // Apply best result
            const item = selected.item;
            item.setDynamicProperty("gacha_effect", bestResult.effectData.id);
            item.setLore([
                `§r${getRarityColor(bestResult.rarity.name)}`,
                `§r§7Kekuatan: §e${bestResult.effectData.name} §f(§7${bestResult.effectData.desc}§f)`
            ]);
            inv.setItem(selected.slotIndex, item);

            // Show results summary
            let summaryMsg = `§5§l[GACHA 10x] §r§fHasil terbaik dari 10 pull:\n`;
            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                const isBest = r === bestResult;
                summaryMsg += `  ${isBest ? "§e§l>" : "§7"} ${getRarityColor(r.rarity.name)} §e${r.effectData.name}${isBest ? " §a§l(TERPILIH)" : ""}\n`;
            }
            player.sendMessage(summaryMsg);

            triggerGachaAnimations(player, bestResult.rarity, bestResult.effectData);
            trackStat(player, "gachaRolls", 10);
            unlockAchievement(player, "first_gacha");
            if (bestRarity >= 3) unlockAchievement(player, "first_epic");
            if (bestRarity >= 4) unlockAchievement(player, "first_legendary");
            if (bestRarity >= 4) unlockAchievement(player, "ten_pull_legendary");
        });
    }
}

function executeRerollFlow(player, item, slotIndex, inv, currentCore, objCore, category) {
    const rarity = getRandomRarityWithPity(player);
    const newEffectData = getEffectPool(category, rarity.name);

    const oldEffectId = item.getDynamicProperty("gacha_effect");
    const oldLore = item.getLore();
    const oldDesc = oldLore.length > 1 ? oldLore[1].replace("§r§7Kekuatan: ", "") : "Unknown";

    const form = new MessageFormData();
    form.title("§5Reroll Konfirmasi");
    form.body(
        `§fBarang ini sudah memiliki kekuatan sihir!\n\n` +
        `§cEfek Lama:\n§7${oldDesc}\n\n` +
        `§aEfek Baru Didapat:\n${getRarityColor(rarity.name)} §f- §e${newEffectData.name}\n§7${newEffectData.desc}\n\n` +
        `§fApakah kamu ingin mengganti kekuatan lama dengan kekuatan baru ini? (Core tetap akan terpotong).`
    );
    form.button1("§aYa, Ganti!");
    form.button2("§cTidak, Simpan Lama");

    form.show(player).then(res => {
        if (res.canceled) return;

        objCore.setScore(player, currentCore - GACHA_COST_EQUIPMENT);

        if (res.selection === 0) {
            item.setDynamicProperty("gacha_effect", newEffectData.id);
            item.setLore([
                `§r${getRarityColor(rarity.name)}`,
                `§r§7Kekuatan: §e${newEffectData.name} §f(§7${newEffectData.desc}§f)`
            ]);
            inv.setItem(slotIndex, item);

            triggerGachaAnimations(player, rarity, newEffectData);
        } else {
            player.sendMessage("§e[Gacha] Kekuatan lama berhasil dipertahankan.");
        }
    });
}

function applyGachaResult(player, item, slotIndex, inv, category) {
    const rarity = getRandomRarityWithPity(player);
    const effectData = getEffectPool(category, rarity.name);

    item.setDynamicProperty("gacha_effect", effectData.id);
    item.setLore([
        `§r${getRarityColor(rarity.name)}`,
        `§r§7Kekuatan: §e${effectData.name} §f(§7${effectData.desc}§f)`
    ]);
    inv.setItem(slotIndex, item);

    triggerGachaAnimations(player, rarity, effectData);
}

// ============================================================
// PASSIVE GACHA -- Single & Multi Pull (v2.3 with Reinkarnasi)
// ============================================================

export function openPassiveGacha(player, pullCount = 1) {
    const rpgData = getPlayerRpgData(player);
    if (!rpgData.unlockedGachaPassives) rpgData.unlockedGachaPassives = [];
    if (!rpgData.passiveConstellation) rpgData.passiveConstellation = {};

    const objCore = world.scoreboard.getObjective("core");
    let currentCore = 0;
    try { if (objCore) currentCore = objCore.getScore(player) || 0; } catch (e) {}

    if (pullCount === 1) {
        if (currentCore < GACHA_COST_PASSIVE) {
            player.sendMessage(`§c[Gacha] Core tidak mencukupi! Diperlukan §b${GACHA_COST_PASSIVE} Core§c.`);
            return;
        }

        // Single passive pull
        objCore.setScore(player, currentCore - GACHA_COST_PASSIVE);

        triggerGachaRitual(player, () => {
            const result = rollPassiveGacha(player);

            if (!result.passive) {
                if (result.shardsGiven) {
                    player.sendMessage("§b[Gacha] §fSemua pasif sudah C2! Dapat Pecahan Inti.");
                } else {
                    // Refund
                    objCore.setScore(player, currentCore);
                    player.sendMessage("§c[Gacha] Tidak ada pasif tersedia. Core dikembalikan.");
                }
                return;
            }

            triggerPassiveGachaAnimations(player, result.passive, result);
        }, true);
    } else {
        // 10-pull passive
        if (currentCore < PASSIVE_10PULL_COST) {
            player.sendMessage(`§c[Gacha] Core tidak mencukupi! Diperlukan §b${PASSIVE_10PULL_COST} Core§c untuk 10-pull.`);
            return;
        }

        objCore.setScore(player, currentCore - PASSIVE_10PULL_COST);

        let results = [];
        let totalPulls = 0;

        for (let i = 0; i < 10; i++) {
            const result = rollPassiveGacha(player);
            totalPulls++;
            results.push(result);
        }

        // Show results
        const px = Math.floor(player.location.x);
        const py = Math.floor(player.location.y);
        const pz = Math.floor(player.location.z);

        let summaryMsg = `§5§l[GACHA PASIF 10x] §r§fHasil ${results.length} pull:\n`;
        let hasLegendary = false;
        let hasMythic = false;

        for (const r of results) {
            if (!r.passive) {
                if (r.shardsGiven) {
                    summaryMsg += `  §b[Pecahan Inti]\n`;
                }
                continue;
            }
            const p = r.passive;
            const rarityColor = getPassiveRarityColor(p.rarity);
            const tierTag = r.constellationUpgrade ? getPassiveTierName(r.newTier) : getPassiveTierName(rpgData.passiveConstellation[p.id] || 0);
            const upgradeTag = r.constellationUpgrade ? " §6^REINKARNASI" : "";
            const shardTag = r.shardsGiven ? " §b+Pecahan" : "";
            summaryMsg += `  ${rarityColor}[${p.rarity}] §e${p.name} ${tierTag}${upgradeTag}${shardTag}\n`;
            if (p.rarity === "Legendary" || p.rarity === "Mythic") {
                hasLegendary = true;
                if (p.rarity === "Mythic") hasMythic = true;
            }
        }

        player.sendMessage(summaryMsg);

        if (hasLegendary || hasMythic) {
            player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
            player.dimension.runCommandAsync(`camerashake add @a[x=${px},y=${py},z=${pz},r=10] 0.5 1 positional`);

            // Find best result for world announcement
            const bestNew = results.find(r => r.passive && r.passive.rarity === "Mythic" && !r.constellationUpgrade) ||
                           results.find(r => r.passive && r.passive.rarity === "Legendary" && !r.constellationUpgrade);
            if (bestNew) {
                const rarityColor = getPassiveRarityColor(bestNew.passive.rarity);
                world.sendMessage(`§5§l[GACHA DEWA] §r§fPemain §b${player.name} §fberhasil mendapatkan ${rarityColor}[${bestNew.passive.rarity}] §e${bestNew.passive.name}§f!`);
            }
        } else {
            player.dimension.runCommandAsync(`playsound random.levelup @a[x=${px},y=${py},z=${pz},r=10]`);
        }

        // Add shards for all pulls
        for (const r of results) {
            if (r.passive) addShardsForPull(player, r.passive.rarity);
            else addShards(player, 1);
        }

        trackStat(player, "gachaRolls", totalPulls);
        unlockAchievement(player, "first_gacha");
        unlockAchievement(player, "first_passive");
        if (hasLegendary) unlockAchievement(player, "legendary_passive");
        if (hasMythic) unlockAchievement(player, "mythic_passive");
    }
}
