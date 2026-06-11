// gacha_effects.js -- v2.2 Overhaul
// Rarity hierarchy: Common (§f) -> Uncommon (§a) -> Rare (§b) -> Epic (§d) -> Legendary (§6§l)
// Each category has effects at every rarity tier

// ============================================================
// WEAPON EFFECTS (Swords, Trident, Mace)
// ============================================================

export const WEAPON_EFFECTS = [
    // Common -- Minor combat bonuses
    { id: "serrated_edge", name: "Serrated Edge", type: "weapon", rarity: "Common", desc: "Peluang kecil extra damage." },
    { id: "keen_edge", name: "Keen Edge", type: "weapon", rarity: "Common", desc: "Sedikit peningkatan serangan." },
    { id: "hunters_instinct", name: "Hunter's Instinct", type: "weapon", rarity: "Common", desc: "Speed singkat saat memukul mob." },

    // Uncommon -- Noticeable effects
    { id: "chill_touch", name: "Chill Touch", type: "weapon", rarity: "Uncommon", desc: "Peluang slow target sebentar." },
    { id: "weak_strike", name: "Enfeebling Strike", type: "weapon", rarity: "Uncommon", desc: "Peluang Weakness pendek." },
    { id: "knockback_hit", name: "Force Impact", type: "weapon", rarity: "Uncommon", desc: "Knockback ekstra ke target." },

    // Rare -- Strong combat effects
    { id: "poison_1", name: "Venom Strike", type: "weapon", rarity: "Rare", desc: "Peluang meracuni target." },
    { id: "frostbite", name: "Frostbite", type: "weapon", rarity: "Rare", desc: "Peluang slow dan weakness." },
    { id: "sonic_boom", name: "Sonic Boom", type: "weapon", rarity: "Rare", desc: "Knockback ekstrim ke target." },

    // Epic -- Powerful abilities
    { id: "fire_aspect_x", name: "Hellfire", type: "weapon", rarity: "Epic", desc: "Membakar musuh parah." },
    { id: "abyssal_wither", name: "Abyssal Wither", type: "weapon", rarity: "Epic", desc: "Ledakan area wither." },
    { id: "blindness_strike", name: "Shadow Strike", type: "weapon", rarity: "Epic", desc: "Membutakan musuh sementara." },
    { id: "levitation_hit", name: "Gravity Smash", type: "weapon", rarity: "Epic", desc: "Menerbangkan musuh ke udara." },
    { id: "phantom_blade", name: "Phantom Blade", type: "weapon", rarity: "Epic", desc: "Peluang serangan area mematikan." },

    // Legendary -- Ultimate powers
    { id: "thunderous_smite", name: "Thunderous Smite", type: "weapon", rarity: "Legendary", desc: "Sambar petir mematikan." },
    { id: "vampiric", name: "Vampiric Touch", type: "weapon", rarity: "Legendary", desc: "Lifesteal deras." },
    { id: "explosive_blow", name: "Explosive Blow", type: "weapon", rarity: "Legendary", desc: "Ledakan area saat memukul." },
    { id: "void_strike", name: "Void Strike", type: "weapon", rarity: "Legendary", desc: "Mengikis Max HP musuh perlahan." }
];

// ============================================================
// HELMET EFFECTS
// ============================================================

export const HELMET_EFFECTS = [
    // Common
    { id: "padded_helm", name: "Padded Armor", type: "helmet", rarity: "Common", desc: "Sedikit mengurangi damage masuk." },
    { id: "warm_fur", name: "Warm Fur", type: "helmet", rarity: "Common", desc: "Tahan dingin di biome bersalju." },

    // Uncommon
    { id: "eagle_eye", name: "Eagle Eye", type: "helmet", rarity: "Uncommon", desc: "Night Vision sesekali aktif." },
    { id: "steady_head", name: "Steady Head", type: "helmet", rarity: "Uncommon", desc: "Anti-Nausea & Anti-Dizziness." },

    // Rare
    { id: "clear_mind", name: "Clear Mind", type: "helmet", rarity: "Rare", desc: "Mencegah efek kebutaan permanen." },

    // Epic
    { id: "aqua_lung", name: "Gills of Atlantis", type: "helmet", rarity: "Epic", desc: "Water Breathing Permanen." },

    // Legendary
    { id: "third_eye", name: "Third Eye", type: "helmet", rarity: "Legendary", desc: "Night Vision & Glowing Mobs." }
];

// ============================================================
// CHESTPLATE EFFECTS
// ============================================================

export const CHEST_EFFECTS = [
    // Common
    { id: "padded_chest", name: "Padded Armor", type: "chest", rarity: "Common", desc: "Extra pertahanan dasar." },
    { id: "comfort_fit", name: "Comfort Fit", type: "chest", rarity: "Common", desc: "Sedikit mengurangi waktu cooldown makan." },

    // Uncommon
    { id: "thick_hide", name: "Thick Hide", type: "chest", rarity: "Uncommon", desc: "Sedikit mengurangi damage proyektil." },
    { id: "adrenal_gland", name: "Adrenal Gland", type: "chest", rarity: "Uncommon", desc: "Haste singkat saat diserang." },

    // Rare
    { id: "iron_skin", name: "Iron Skin", type: "chest", rarity: "Rare", desc: "Resistance 1." },

    // Epic
    { id: "turtle_shell", name: "Turtle Shell", type: "chest", rarity: "Epic", desc: "Resistance 2 & Slowness." },

    // Legendary
    { id: "troll_blood", name: "Troll Blood", type: "chest", rarity: "Legendary", desc: "Regenerasi HP 1 Permanen." },
    { id: "titans_aegis", name: "Titan's Aegis", type: "chest", rarity: "Legendary", desc: "Anti-Knockback, Resistance 3, Slowness 2." }
];

// ============================================================
// LEGGINGS EFFECTS
// ============================================================

export const LEG_EFFECTS = [
    // Common
    { id: "sturdy_weave", name: "Sturdy Weave", type: "legs", rarity: "Common", desc: "Sedikit extra pertahanan." },
    { id: "flexible_joint", name: "Flexible Joint", type: "legs", rarity: "Common", desc: "Sedikit mobilitas ekstra." },

    // Uncommon
    { id: "reinforced_plating", name: "Reinforced Plating", type: "legs", rarity: "Uncommon", desc: "Kurangi damage ledakan." },
    { id: "agile_step", name: "Agile Step", type: "legs", rarity: "Uncommon", desc: "Sedikit peningkatan kecepatan." },

    // Rare
    { id: "sturdy_legs", name: "Sturdy", type: "legs", rarity: "Rare", desc: "Sedikit extra HP." },

    // Epic
    { id: "tank_legs", name: "Behemoth", type: "legs", rarity: "Epic", desc: "Extra HP menengah (Boost 1)." },

    // Legendary
    { id: "colossus", name: "Colossus", type: "legs", rarity: "Legendary", desc: "Max Health Boost (Boost 2)." }
];

// ============================================================
// BOOTS EFFECTS
// ============================================================

export const BOOT_EFFECTS = [
    // Common
    { id: "light_boots", name: "Lightweight", type: "boots", rarity: "Common", desc: "Sedikit lebih gesit." },
    { id: "soft_landing", name: "Soft Landing", type: "boots", rarity: "Common", desc: "Kurangi sedikit fall damage." },

    // Uncommon
    { id: "spring_soles", name: "Spring Soles", type: "boots", rarity: "Uncommon", desc: "Jump Boost sesekali aktif." },
    { id: "trail_runner", name: "Trail Runner", type: "boots", rarity: "Uncommon", desc: "Speed saat berlari di grass/path." },

    // Rare
    { id: "swift_step", name: "Swiftness", type: "boots", rarity: "Rare", desc: "Speed 1." },

    // Epic
    { id: "frog_jump", name: "Frog Leap", type: "boots", rarity: "Epic", desc: "Jump Boost 2." },
    { id: "featherlight", name: "Featherlight", type: "boots", rarity: "Epic", desc: "Slow Falling / Anti Fall Damage." },

    // Legendary
    { id: "hermes_boots", name: "Boots of Hermes", type: "boots", rarity: "Legendary", desc: "Speed 3 & Jump 3." }
];

// ============================================================
// TOOL EFFECTS (Pickaxe, Axe, Shovel, Hoe)
// ============================================================

export const TOOL_EFFECTS = [
    // Common
    { id: "comfortable_grip", name: "Comfort Grip", type: "tool", rarity: "Common", desc: "Sedikit lebih nyaman dipakai." },
    { id: "steady_hand", name: "Steady Hand", type: "tool", rarity: "Common", desc: "Kurangi peluang kelelahan." },

    // Uncommon
    { id: "efficient_swing", name: "Efficient Swing", type: "tool", rarity: "Uncommon", desc: "Haste singkat saat memecah blok." },
    { id: "prospector_sense", name: "Prospector Sense", type: "tool", rarity: "Uncommon", desc: "Glowing pada ore terdekat sesekali." },

    // Rare
    { id: "miner_touch", name: "Dwarven Touch", type: "tool", rarity: "Rare", desc: "Haste 1 saat dipegang." },

    // Epic
    { id: "geo_master", name: "Geomancer", type: "tool", rarity: "Epic", desc: "Haste 2." },

    // Legendary
    { id: "god_breaker", name: "World Breaker", type: "tool", rarity: "Legendary", desc: "Haste 4." }
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getItemCategory(typeId) {
    if (typeId.includes("helmet")) return "helmet";
    if (typeId.includes("chestplate")) return "chest";
    if (typeId.includes("leggings")) return "legs";
    if (typeId.includes("boots")) return "boots";
    if (typeId.includes("sword") || typeId.includes("trident") || typeId.includes("mace")) return "weapon";
    if (typeId.includes("pickaxe") || typeId.includes("axe") || typeId.includes("shovel") || typeId.includes("hoe")) return "tool";
    return "invalid";
}

export function getEffectPool(category, rarityName) {
    let pool = [];
    if (category === "helmet") pool = HELMET_EFFECTS;
    else if (category === "chest") pool = CHEST_EFFECTS;
    else if (category === "legs") pool = LEG_EFFECTS;
    else if (category === "boots") pool = BOOT_EFFECTS;
    else if (category === "weapon") pool = WEAPON_EFFECTS;
    else if (category === "tool") pool = TOOL_EFFECTS;

    // Strip formatting codes from rarityName for comparison
    const cleanRarity = rarityName.replace(/§./g, '').replace(/\[|\]/g, '');
    const filtered = pool.filter(e => e.rarity === cleanRarity);

    if (filtered.length === 0) return { id: "none", name: "Kosong", desc: "Tidak Ada Efek" };

    return filtered[Math.floor(Math.random() * filtered.length)];
}

export function getFormatCode(rarityStr) {
    switch (rarityStr) {
        case "Common": return "f";
        case "Uncommon": return "a";
        case "Rare": return "b";
        case "Epic": return "d";
        case "Legendary": return "6";
        default: return "f";
    }
}

export function getRarityColor(rarityName) {
    // Returns the formatted string with color code
    const cleanRarity = rarityName.replace(/§./g, '').replace(/\[|\]/g, '');
    const code = getFormatCode(cleanRarity);
    if (cleanRarity === "Legendary") return `§${code}§l[${cleanRarity}]§r`;
    return `§${code}[${cleanRarity}]`;
}

// Recover lost dynamic properties via Lore reading
export function getEffectFromLore(item) {
    const lore = item.getLore();
    if (!lore || lore.length < 2) return "none";

    const descLine = lore[1]; // "§r§7Kekuatan: §eNama Efek §f(§7Desc§f)"
    if (!descLine.includes("Kekuatan: ")) return "none";

    // Extract Effect Name from between "§e" and " §f("
    const nameMatch = descLine.match(/§e(.*?) §f\(/);
    if (!nameMatch || nameMatch.length < 2) return "none";

    const effectName = nameMatch[1];

    // Search all pools for matching name
    const allEffects = [...WEAPON_EFFECTS, ...HELMET_EFFECTS, ...CHEST_EFFECTS, ...LEG_EFFECTS, ...BOOT_EFFECTS, ...TOOL_EFFECTS];
    const found = allEffects.find(e => e.name === effectName);

    return found ? found.id : "none";
}

export function safeGetGachaEffect(item) {
    let eff = item.getDynamicProperty("gacha_effect");
    if (!eff || eff === "none") {
        eff = getEffectFromLore(item);
        // If recovered from lore, restore the dynamic property to fix the item
        if (eff !== "none") {
            try { item.setDynamicProperty("gacha_effect", eff); } catch(e) {}
        }
    }
    return eff;
}
