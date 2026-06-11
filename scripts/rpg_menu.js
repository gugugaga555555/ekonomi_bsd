import { system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getPlayerRpgData, getXpRequired, generateXpBar, savePlayerRpgData, MAX_LEVEL, PROFESSION_PASSIVES, getUnlockedPassives, getNextPassiveTier } from "./rpg_system.js";
import { formatRupiah, getUiHeader } from "./utils.js";
import { getPlayerRank } from "./rank_system.js";
import { PASSIVE_POOL } from "./gacha_system.js";

// Lazy import to avoid circular dependency
async function goToAtributMenu(player) {
    const mod = await import("./menu_system.js");
    system.runTimeout(() => { mod.openRpgGachaMenu(player); }, 5);
}

const AVAILABLE_SKILLS = [
    // === MINING ===
    { id: "ore_excavation", name: "Ore Excavation (Mining)", desc: "[AKTIF] Menghancurkan batu/ore dalam area 3x3x3 sekaligus. Gunakan Pickaxe untuk memicu.", cost: 15, tier: 1 },
    { id: "deep_core_mining", name: "Deep Core Mining (Mining)", desc: "[PASIF] 20% peluang mendapat double drop saat menambang ore dengan Pickaxe.", cost: 25, tier: 2 },
    { id: "seismic_slam", name: "Seismic Slam (Mining)", desc: "[AKTIF] Berjinjit + Pickaxe = Hancurkan kolom 3x3x5 di bawah kakimu! Cooldown: 10 Detik.", cost: 35, tier: 3 },
    // === WOODCUTTING ===
    { id: "treecapitator", name: "Treecapitator (Woodcutting)", desc: "[AKTIF] Satu ayunan kapak meruntuhkan seluruh pohon dari atas ke bawah.", cost: 15, tier: 1 },
    { id: "bark_armor", name: "Bark Armor (Woodcutting)", desc: "[PASIF] Mendapat Resistance 1 selama 8 detik saat menebang pohon. Cooldown: 30 Detik.", cost: 25, tier: 2 },
    { id: "leaf_storm", name: "Leaf Storm (Woodcutting)", desc: "[AKTIF] Berjinjit + Axe = Runtuhkan semua daun dalam radius 7 blok! Cooldown: 8 Detik.", cost: 30, tier: 3 },
    // === SLAYER ===
    { id: "cleave_strike", name: "Cleave Strike (Slayer)", desc: "[AKTIF] Serangan menyapu area 3 blok sekitar musuh. Cooldown: 3 Detik.", cost: 20, tier: 1 },
    { id: "bloodlust", name: "Bloodlust (Slayer)", desc: "[PASIF] Membunuh monster memberi Speed 1 + Strength 1 selama 6 detik.", cost: 25, tier: 2 },
    { id: "executioners_mark", name: "Executioner's Mark (Slayer)", desc: "[PASIF] Musuh di bawah 25% HP langsung tewas saat terkena serangan. Cooldown: 8 Detik.", cost: 35, tier: 3 },
    // === FARMING ===
    { id: "bountiful_harvest", name: "Bountiful Harvest (Farming)", desc: "[AKTIF] Panen semua tanaman area 5x5 dengan satu ayunan cangkul.", cost: 15, tier: 1 },
    { id: "green_thumb", name: "Green Thumb (Farming)", desc: "[AKTIF] Berjinjit + Hoe = Panen & tanam ulang tanaman masak di area 7x7. Cooldown: 10 Detik.", cost: 25, tier: 2 },
    { id: "natures_gift", name: "Nature's Gift (Farming)", desc: "[PASIF] 25% peluang mendapat double drop saat memanen tanaman.", cost: 30, tier: 3 },
    // === FISHING ===
    { id: "tidal_surge", name: "Tidal Surge (Fishing)", desc: "[AKTIF] Berjinjit + Fishing Rod = Gelombang air merusak + Speed 2. Cooldown: 15 Detik.", cost: 20, tier: 1 },
    { id: "master_fisher", name: "Nelayan Ahli (Fishing)", desc: "[PASIF] Auto dapat 3-6 loot random saat kail masuk air! Satu tarikan = banyak ikan! Cooldown: 8 Detik.", cost: 25, tier: 2 },
    { id: "anglers_fortune", name: "Angler's Fortune (Fishing)", desc: "[PASIF] Setiap mancing ada peluang mendapat bonus loot langka (Nautilus, Heart of the Sea, dll).", cost: 30, tier: 2 },
    { id: "deep_sea_diver", name: "Deep Sea Diver (Fishing)", desc: "[PASIF] Conduit Power + Night Vision + Dolphin's Grace saat berada di dalam air.", cost: 35, tier: 3 }
];

export { AVAILABLE_SKILLS };

// Milestone data for display
const MILESTONES = { 10: 3, 20: 5, 30: 8, 40: 12, 50: 20 };

// Helper for profession passive tiers display
function getProfPassiveDisplay(profKey, level) {
    const passives = PROFESSION_PASSIVES[profKey];
    if (!passives) return "";
    let result = "";
    for (const p of passives) {
        const isUnlocked = level >= p.level;
        if (isUnlocked) {
            result += `  ${p.icon}§l*§r ${p.icon}${p.name} §a[Aktif]\n`;
        } else {
            result += `  §8* ${p.name} §7(Lv${p.level})\n`;
        }
    }
    return result;
}

// ============================================================
// PROFIL RPG (v2.4 -- View-only, no duplicate navigation)
// ============================================================

export function openRpgMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const pRank = getPlayerRank(player);
    const form = new ActionFormData();
    form.title("§dProfil RPG");

    const profs = [
        { key: "mining", color: "§b", skillIds: ["ore_excavation", "deep_core_mining", "seismic_slam"] },
        { key: "woodcutting", color: "§a", skillIds: ["treecapitator", "bark_armor", "leaf_storm"] },
        { key: "slayer", color: "§c", skillIds: ["cleave_strike", "bloodlust", "executioners_mark"] },
        { key: "farming", color: "§2", skillIds: ["bountiful_harvest", "green_thumb", "natures_gift"] },
        { key: "fishing", color: "§3", skillIds: ["tidal_surge", "master_fisher", "anglers_fortune", "deep_sea_diver"] }
    ];

    let statsStr = `Pangkat: ${pRank.badge} §7| §dSP: §e${rpgData.sp}\n\n`;

    // Detailed profession info with XP bars + passive tiers + skill status per profession
    for (const p of profs) {
        const lv = rpgData[p.key].level;
        const xp = rpgData[p.key].xp;
        const req = getXpRequired(lv);
        const pct = req === Infinity ? "MAX" : Math.floor((xp / req) * 100) + "%";
        const bar = req === Infinity ? "§b||||||||||||||||||||" : generateXpBar(xp, req);
        const profMultiplier = 1 + Math.floor(lv / 10) * 0.5;
        const unlockedCount = getUnlockedPassives(p.key, lv).length;

        statsStr += `${p.color}${p.key.toUpperCase()} §fLv.${lv} §7[${bar}§7] §a${pct}\n`;
        statsStr += `  §7XP: ${xp}/${req === Infinity ? "MAX" : req} §7| Profisiensi: §ex${profMultiplier} §7| Pasif: §d${unlockedCount}/5\n`;

        // Show passive tiers for this profession
        statsStr += getProfPassiveDisplay(p.key, lv);

        // Show next passive tier unlock
        const nextPassive = getNextPassiveTier(p.key, lv);
        if (nextPassive) {
            statsStr += `  §7Pasif berikutnya: §d${nextPassive.name} §7(Lv${nextPassive.level})\n`;
        }

        // Show next milestone
        const nextMilestone = Object.entries(MILESTONES).find(([mlv]) => parseInt(mlv) > lv);
        if (nextMilestone) {
            statsStr += `  §7Milestone: §6Lv${nextMilestone[0]} = +${nextMilestone[1]} SP\n`;
        } else if (lv >= MAX_LEVEL) {
            statsStr += `  §6* MAKSIMAL LEVEL *\n`;
        }

        // Show skill status for this profession
        for (const sid of p.skillIds) {
            const sInfo = AVAILABLE_SKILLS.find(s => s.id === sid);
            const isUnlocked = rpgData.unlockedSkills.includes(sid);
            const isEquipped = rpgData.equippedSkills.includes(sid);
            const tierTag = sInfo ? (sInfo.tier === 1 ? "§a[T1]" : sInfo.tier === 2 ? "§e[T2]" : "§c[T3]") : "";
            const typeTag = sInfo && sInfo.desc.startsWith("[AKTIF]") ? "§b[A]" : "§e[P]";

            if (isUnlocked && isEquipped) {
                statsStr += `  ${typeTag} ${tierTag} §b${sInfo ? sInfo.name.split("(")[0].trim() : sid} §a[AKTIF]\n`;
            } else if (isUnlocked) {
                statsStr += `  ${typeTag} ${tierTag} §7${sInfo ? sInfo.name.split("(")[0].trim() : sid} §8[Nonaktif]\n`;
            } else {
                statsStr += `  §8[TERKUNCI] ${tierTag} ${sInfo ? sInfo.name.split("(")[0].trim() : sid} §7(${sInfo ? sInfo.cost : "?"} SP)\n`;
            }
        }
        statsStr += `\n`;
    }

    // Skill summary
    statsStr += `§e§l--- Kemampuan Terpasang (${rpgData.equippedSkills.length}/3 Skill, ${rpgData.unlockedSkills.length}/16 Dikuasai) ---§r\n`;
    if (rpgData.equippedSkills.length === 0) {
        statsStr += "§7Belum ada skill di-equip\n";
    } else {
        for (const skillId of rpgData.equippedSkills) {
            const skillInfo = AVAILABLE_SKILLS.find(s => s.id === skillId);
            statsStr += `§b- ${skillInfo ? skillInfo.name : skillId}\n`;
        }
    }

    statsStr += `\n§d§l--- Berkat Kuno (${(rpgData.equippedGachaPassives || []).length}/3 Aktif, ${(rpgData.unlockedGachaPassives || []).length}/${PASSIVE_POOL.length} Dimiliki) ---§r\n`;
    const eqPassives = rpgData.equippedGachaPassives || [];
    const constell = rpgData.passiveConstellation || {};
    if (eqPassives.length === 0) {
        statsStr += "§7Belum ada berkat yang terpasang\n";
    } else {
        for (const passive of eqPassives) {
            const passiveInfo = PASSIVE_POOL.find(p => p.id === passive);
            const tier = constell[passive] || 0;
            const tierTag = tier <= 0 ? "§7[C0]" : tier === 1 ? "§e[C1]" : "§6§l[C2]§r";
            statsStr += `§d- ${passiveInfo ? passiveInfo.name : passive} ${tierTag}\n`;
        }
    }

    // Show all owned passives with constellation info
    const allOwned = rpgData.unlockedGachaPassives || [];
    if (allOwned.length > 0) {
        statsStr += `\n§7Semua Berkat Dimiliki:\n`;
        for (const pid of allOwned) {
            const pInfo = PASSIVE_POOL.find(p => p.id === pid);
            const tier = constell[pid] || 0;
            const isEq = eqPassives.includes(pid);
            const tierTag = tier <= 0 ? "§7[C0]" : tier === 1 ? "§e[C1]" : "§6[C2]";
            const eqTag = isEq ? "§a[Aktif]" : "§8[Nonaktif]";
            const rarityColor = pInfo && pInfo.rarity === "Mythic" ? "§d" : pInfo && pInfo.rarity === "Legendary" ? "§6" : pInfo && pInfo.rarity === "Rare" ? "§b" : "§f";
            statsStr += `  ${rarityColor}${pInfo ? pInfo.name : pid} ${tierTag} ${eqTag}\n`;
        }
    }

    // v2.5: Arena record display
    try {
        const arenaStr = player.getDynamicProperty("arena_data");
        if (arenaStr && typeof arenaStr === 'string') {
            const arenaData = JSON.parse(arenaStr);
            statsStr += `\n§4§l--- Arena Pertarungan ---§r\n`;
            statsStr += `§aBiasa: §fWave ${arenaData.bestWave?.biasa || 0}/10`;
            statsStr += ` §eSulit: §fWave ${arenaData.bestWave?.sulit || 0}/15`;
            statsStr += ` §cNeraka: §fWave ${arenaData.bestWave?.neraka || 0}/20\n`;
            statsStr += `§7Total Run: ${arenaData.totalRuns || 0} §7| Poin Arena: §6${arenaData.arenaPoints || 0}`;
        }
    } catch(e) {}

    form.body(statsStr);

    // v2.4: View-only -- only back button, no duplicate navigation
    form.button("§cKembali ke Atribut & Kekuatan");

    form.show(player).then((res) => {
        if (res.canceled) return;
        // Always go back to Atribut & Kekuatan
        goToAtributMenu(player);
    });
}

// ============================================================
// PANDUAN KEKUATAN (v2.4 -- Direct access from Atribut menu)
// ============================================================

export function openRpgGuideMenu(player) {
    const form = new ActionFormData();
    form.title("§9Pedoman Kekuatan");
    form.body(
        "§e§l1. Cara Mendapatkan Level (XP)§r\n" +
        "Kamu mendapatkan XP dengan melakukan pekerjaan sesuai Spesialisasi:\n" +
        "- §bMining§f: Menambang batu atau ore di goa (+3 XP per blok)\n" +
        "- §aWoodcutting§f: Menebang pohon (+5 XP per log)\n" +
        "- §cSlayer§f: Membunuh entitas jahat (+10 XP per kill)\n" +
        "- §2Farming§f: Memanen tanaman (+8 XP per tanaman)\n" +
        "- §3Fishing§f: Memancing menggunakan Fishing Rod (+8 XP per lempar)\n\n" +

        "§e§l2. Bonus Profisiensi XP§r\n" +
        "Semakin tinggi level profesi, semakin banyak XP yang kamu dapatkan per aksi:\n" +
        "- Lv1-9 = 1x XP | Lv10-19 = 1.5x | Lv20-29 = 2x | Lv30-39 = 2.5x | Lv40-49 = 3x\n\n" +

        "§e§l3. Milestone & Bonus SP§r\n" +
        "Setiap level naik memberi +1 SP. Pada level milestone, kamu mendapat BONUS SP:\n" +
        "- Lv10 = +3 SP | Lv20 = +5 SP | Lv30 = +8 SP | Lv40 = +12 SP | Lv50 = +20 SP\n" +
        "Total SP dari 1 profesi: 98 SP (50 base + 48 milestone)!\n\n" +

        "§e§l4. Skill Pasif Profesi§r\n" +
        "Setiap profesi memiliki §d5 tier pasif§f yang otomatis terbuka saat level mencapai threshold. " +
        "Pasif ini GRATIS (tanpa SP) dan bersifat permanen selama level terpenuhi!\n\n" +
        "§bMining§f:\n" +
        "  Lv5 = Tangan Penambang (Haste 1 w/ Pickaxe)\n" +
        "  Lv15 = Penglihatan Bawah Tanah (Night Vision Y<0)\n" +
        "  Lv25 = Penambang Veteran (Haste 2 w/ Pickaxe)\n" +
        "  Lv35 = Ketahanan Gua (Resistance 1 Y<0)\n" +
        "  Lv50 = Master Tambang (Fire Res + Haste 2)\n\n" +
        "§aWoodcutting§f:\n" +
        "  Lv5 = Kaki Ringan (Speed 1 w/ Axe)\n" +
        "  Lv15 = Kulit Kayu (Resistance 1 w/ Axe)\n" +
        "  Lv25 = Penebang Cepat (Haste 1 w/ Axe)\n" +
        "  Lv35 = Lompatan Hutan (Jump Boost 1)\n" +
        "  Lv50 = Master Hutan (Speed 2+Jump 2+Res 1)\n\n" +
        "§cSlayer§f:\n" +
        "  Lv5 = Refleks Tempur (Speed 1)\n" +
        "  Lv15 = Tenaga Iblis (Strength 1 w/ Sword/Axe)\n" +
        "  Lv25 = Darah Pejuang (Regen 1 saat HP<50%)\n" +
        "  Lv35 = Tubuh Baja (Health Boost 1)\n" +
        "  Lv50 = Master Peperangan (Str2+Spd2+HP2)\n\n" +
        "§2Farming§f:\n" +
        "  Lv5 = Tangan Petani (Haste 1 w/ Hoe)\n" +
        "  Lv15 = Kaki Petani (Jump Boost 1)\n" +
        "  Lv25 = Langkah Cepat (Speed 1 w/ Hoe)\n" +
        "  Lv35 = Tubuh Kuat (Resistance 1 w/ Hoe)\n" +
        "  Lv50 = Master Pertanian (Haste 2+Jump 2)\n\n" +
        "§3Fishing§f:\n" +
        "  Lv5 = Kaki Nelayan (Speed 1)\n" +
        "  Lv15 = Paru Ikan (Water Breathing di air)\n" +
        "  Lv25 = Ahli Selam (Dolphin's Grace di air)\n" +
        "  Lv35 = Penglihatan Laut (Night Vision di air)\n" +
        "  Lv50 = Master Samudra (Conduit+NightVis+Dolphin)\n\n" +

        "§e§l5. Skill Aktif vs Pasif (Pohon Keahlian)§r\n" +
        "Skill dari Pohon Keahlian ditandai [AKTIF] atau [PASIF], berbeda dari pasif profesi:\n" +
        "- §b[AKTIF]§f: Perlu input pemain (pukul, berjinjit, pakai alat tertentu).\n" +
        "- §e[PASIF]§f: Otomatis aktif saat di-equip, tanpa input.\n\n" +

        "§e§l6. Tier Skill & Biaya SP§r\n" +
        "Tiap profesi punya 3 skill dalam 3 tier (Fishing punya 4 skill!):\n" +
        "- §aTier 1§f (15-20 SP): Skill dasar, efek area sederhana\n" +
        "- §eTier 2§f (25-30 SP): Skill menengah, bonus pasif atau area lebih besar\n" +
        "- §cTier 3§f (30-35 SP): Skill mahir, efek kuat dengan cooldown\n\n" +

        "§e§l7. Memasang Kemampuan§r\n" +
        "Kamu maksimal bisa memasang §b3 Skill RPG§f dan §d3 Berkat Kuno§f secara bersamaan. " +
        "Skill yang sudah dipelajari TIDAK otomatis aktif -- kamu harus memasangnya manual di menu " +
        "§aManajemen Kemampuan§f.\n\n" +

        "§e§l8. Cara Beli Core & Gacha§r\n" +
        "Buka §6Altar Penempaan Inti§f di menu Atribut & Kekuatan. " +
        "Tukar Rp100.000 = 1 Core. Core dipakai untuk:\n" +
        "- §dGacha Senjata/Armor§f (5 Core / 45 Core 10x): Sihir item di tanganmu\n" +
        "- §dGacha Pasif Dewa§f (10 Core / 90 Core 10x): Dapat pasif permanen\n\n" +

        "§e§l9. Sistem Banner§r\n" +
        "Setiap §e2 jam§f, banner gacha berganti secara otomatis! " +
        "Banner memberikan §aRate-Up 50%§f untuk efek featured jika kategori item cocok.\n\n" +

        "§e§l10. Reinkarnasi Pasif§r\n" +
        "Pasif duplikat dari gacha akan meningkatkan tier kekuatan pasifmu!\n" +
        "- §7[C0]§f = Efek dasar\n" +
        "- §e[C1]§f = Efek ditingkatkan\n" +
        "- §6[C2]§f = Efek maksimal!\n\n" +

        "§e§l11. Tarikan Gratis§r\n" +
        "- §aEquipment:§f 1x gratis setiap 24 jam!\n" +
        "- §aPasif:§f 1x gratis setiap 72 jam!\n\n" +

        "§e§l12. Pecahan Inti§r\n" +
        "Setiap gacha pull memberikan §e1+ Pecahan Inti§f. " +
        "Bonus Pecahan untuk pull Epic+ dan Legendary! " +
        "Tukar di §6Kuil Reinkarnasi§f untuk item terjamin:\n" +
        "- 50 Pecahan = Pilih Efek Epic\n" +
        "- 120 Pecahan = Pilih Efek Legendary\n" +
        "- 60 Pecahan = Pasif Rare Guarantee\n" +
        "- 150 Pecahan = Pasif Legendary Guarantee\n\n" +

        "§e§l13. Pasif Dewa -- Daftar Lengkap (24 Pasif!)§r\n" +
        "§f[Normal]:§r Fortitude, Agility, Titan's Grip, Iron Will\n" +
        "§b[Rare]:§r Vitality, Vigor, Arcane Shield, Soul Harvest, Iron Fortress, Storm Aura\n" +
        "§6[Legendary]:§r Phoenix Blood, Adrenaline, Berserker's Rage, God Slayer, Colossal Vitality, Blood Frenzy, Leviathan's Domain\n" +
        "§d[Mythic]:§r Second Wind, Ghost Walk, Avatar of War, Undying Will, Titan's Heart, Chaos Aura\n\n" +

        "§e§l14. Pasif Dewa Baru v2.6 -- Detail Efek§r\n" +
        "§b[Rare] Soul Harvest:§r Lifesteal saat menyerang musuh (20-40% chance heal). C1+: heal besar saat kill.\n" +
        "§b[Rare] Iron Fortress:§r Resistance 2-4 saat sneak! Tank mode aktif, tapi agak lambat.\n" +
        "§b[Rare] Storm Aura:§r Damage periodik ke musuh di sekitarmu! Radius 3-5 blok, slow + weakness di tier tinggi.\n" +
        "§6[Legendary] God Slayer:§r Peluang instant kill mob di bawah 50-70% HP! Efek one-hit yang dicari para pemain!\n" +
        "§6[Legendary] Colossal Vitality:§r Health Boost raksasa! +8 sampai +12 hati permanen! C2: +Regen 1.\n" +
        "§6[Legendary] Blood Frenzy:§r Setiap kill menambah stack buff! Max 5-7 stack, semakin kuat semakin banyak bunuh!\n" +
        "§6[Legendary] Leviathan's Domain:§r Dewa di air! Semua buff air maksimal + Strength + Resistance di tier tinggi.\n" +
        "§d[Mythic] Undying Will:§r Auto-revive tanpa totem! Bangkit dari kematian (cooldown 5-8 menit). Lebih kuat dari Second Wind!\n" +
        "§d[Mythic] Titan's Heart:§r HP raksasa + Regen + Resistance semua sekaligus! Ultimate tank passive.\n" +
        "§d[Mythic] Chaos Aura:§r Musuh di sekitar kena debuff (Slow+Weak+Poison), kamu kena buff (Speed+Str+Res)!\n\n" +

        "§4§l15. Arena Pertarungan§r\n" +
        "Tantang dirimu di Arena Pertarungan! Lawan wave musuh yang makin kuat.\n" +
        "§aBiasa§f: Wave 1-10, mudah, reward x1\n" +
        "§eSulit§f: Wave 1-15, menengah, reward x2\n" +
        "§cNeraka§f: Wave 1-20, brutal, reward x3.5\n" +
        "Boss muncul setiap 5 wave! Gratis setiap 30 menit atau bayar 2 Core.\n" +
        "Reward: Rupiah, Slayer XP, Core, SP, dan Poin Arena!\n" +
        "Tukar Poin Arena di Toko Hadiah untuk item eksklusif."
    );
    form.button("§cKembali ke Atribut & Kekuatan");
    form.show(player).then(() => {
        goToAtributMenu(player);
    });
}

export function openSkillTreeMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const form = new ActionFormData();
    form.title("§ePohon Keahlian");

    // Group skills by profession
    const profGroups = {
        "Mining": ["ore_excavation", "deep_core_mining", "seismic_slam"],
        "Woodcutting": ["treecapitator", "bark_armor", "leaf_storm"],
        "Slayer": ["cleave_strike", "bloodlust", "executioners_mark"],
        "Farming": ["bountiful_harvest", "green_thumb", "natures_gift"],
        "Fishing": ["tidal_surge", "master_fisher", "anglers_fortune", "deep_sea_diver"]
    };

    let bodyText = `Sisa Poin Keahlian (SP): §e${rpgData.sp}\n\n`;

    // Show unlocked count per profession
    for (const [profName, skillIds] of Object.entries(profGroups)) {
        const unlocked = skillIds.filter(id => rpgData.unlockedSkills.includes(id)).length;
        const maxSkills = profName === "Fishing" ? 4 : 3;
        bodyText += `${profName}: §a${unlocked}/${maxSkills} §7Dikuasai\n`;
    }

    bodyText += `\n§7Pilih teknik yang ingin kamu pelajari:`;
    form.body(bodyText);

    for (const skill of AVAILABLE_SKILLS) {
        const isUnlocked = rpgData.unlockedSkills.includes(skill.id);
        const isEquipped = rpgData.equippedSkills.includes(skill.id);
        const tierLabel = skill.tier === 1 ? "§a[T1]" : skill.tier === 2 ? "§e[T2]" : "§c[T3]";

        if (isUnlocked) {
            const equipTag = isEquipped ? " §b[AKTIF]" : " §7[Tidak Aktif]";
            form.button(`§a${tierLabel} ${skill.name}\n§7[Telah Dikuasai]${equipTag}`);
        } else {
            const canAfford = rpgData.sp >= skill.cost;
            const costColor = canAfford ? "§e" : "§c";
            form.button(`§f${tierLabel} ${skill.name}\n${costColor}[Biaya: ${skill.cost} SP]`);
        }
    }
    form.button("§cKembali ke Atribut & Kekuatan");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === AVAILABLE_SKILLS.length) {
            goToAtributMenu(player);
            return;
        }

        const selected = AVAILABLE_SKILLS[res.selection];
        if (rpgData.unlockedSkills.includes(selected.id)) {
            player.sendMessage(`§c[RPG] Kamu sudah memiliki skill ${selected.name}!`);
            openSkillTreeMenu(player);
            return;
        }

        if (rpgData.sp < selected.cost) {
            player.sendMessage(`§c[RPG] SP kamu tidak cukup! Dibutuhkan ${selected.cost} SP, kamu punya ${rpgData.sp} SP.`);
            openSkillTreeMenu(player);
            return;
        }

        // Purchase logic
        rpgData.sp -= selected.cost;
        rpgData.unlockedSkills.push(selected.id);
        savePlayerRpgData(player, rpgData);
        player.sendMessage(`§a[RPG] Berhasil mempelajari skill ${selected.name}! Sisa SP: ${rpgData.sp}`);
        player.runCommandAsync(`playsound random.levelup @s`);
        openSkillTreeMenu(player);
    });
}

export function openEquipUnifiedMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const unlockedActives = rpgData.unlockedSkills || [];
    const unlockedPassives = rpgData.unlockedGachaPassives || [];

    const form = new ModalFormData();
    form.title("§aManajemen Kemampuan");

    // ---- Show ALL 15 skills grouped by profession ----
    const activeProfGroups = {
        "Mining": ["ore_excavation", "deep_core_mining", "seismic_slam"],
        "Woodcutting": ["treecapitator", "bark_armor", "leaf_storm"],
        "Slayer": ["cleave_strike", "bloodlust", "executioners_mark"],
        "Farming": ["bountiful_harvest", "green_thumb", "natures_gift"],
        "Fishing": ["tidal_surge", "master_fisher", "anglers_fortune", "deep_sea_diver"]
    };

    // Track which toggle indices are for unlocked skills
    const skillToggleMap = []; // { skillId, isUnlocked }

    for (const [profName, skillIds] of Object.entries(activeProfGroups)) {
        for (const skillId of skillIds) {
            const isUnlocked = unlockedActives.includes(skillId);
            const skillInfo = AVAILABLE_SKILLS.find(s => s.id === skillId);
            const isEquipped = rpgData.equippedSkills.includes(skillId);
            const tierLabel = skillInfo ? (skillInfo.tier === 1 ? "[T1]" : skillInfo.tier === 2 ? "[T2]" : "[T3]") : "";

            if (isUnlocked) {
                const typeTag = skillInfo && skillInfo.desc.startsWith("[AKTIF]") ? "§b[A]" : "§e[P]";
                form.toggle(`${typeTag} ${tierLabel} ${skillInfo ? skillInfo.name : skillId} §a[Dikuasai]`, isEquipped);
                skillToggleMap.push({ skillId, isUnlocked: true });
            } else {
                const costText = skillInfo ? ` §7(${skillInfo.cost} SP)` : "";
                form.toggle(`§8[TERKUNCI] ${tierLabel} ${skillInfo ? skillInfo.name : skillId}${costText}`, false);
                skillToggleMap.push({ skillId, isUnlocked: false });
            }
        }
    }

    // ---- Gacha Passives (only show unlocked) ----
    const passiveToggleMap = []; // { passiveId, isUnlocked: true }

    for (const passive of PASSIVE_POOL) {
        const isOwned = unlockedPassives.includes(passive.id);
        const isEquipped = (rpgData.equippedGachaPassives || []).includes(passive.id);

        if (isOwned) {
            form.toggle(`§d[B] ${passive.name} §a[Dimiliki]`, isEquipped);
            passiveToggleMap.push({ passiveId: passive.id, isOwned: true });
        } else {
            form.toggle(`§8[TERKUNCI] ${passive.name} §7(Gacha)`, false);
            passiveToggleMap.push({ passiveId: passive.id, isOwned: false });
        }
    }

    form.show(player).then((res) => {
        if (res.canceled) return;

        let newActiveEquipped = [];
        let newPassiveEquipped = [];
        let attemptedLocked = false;

        // Parse Active Skills responses
        for (let i = 0; i < skillToggleMap.length; i++) {
            const entry = skillToggleMap[i];
            if (entry.isUnlocked) {
                if (res.formValues[i] === true) {
                    newActiveEquipped.push(entry.skillId);
                }
            } else {
                if (res.formValues[i] === true) {
                    attemptedLocked = true;
                }
            }
        }

        // Parse Passive Skills responses
        for (let j = 0; j < passiveToggleMap.length; j++) {
            const entry = passiveToggleMap[j];
            const formIndex = skillToggleMap.length + j;
            if (entry.isOwned) {
                if (res.formValues[formIndex] === true) {
                    newPassiveEquipped.push(entry.passiveId);
                }
            } else {
                if (res.formValues[formIndex] === true) {
                    attemptedLocked = true;
                }
            }
        }

        if (attemptedLocked) {
            player.sendMessage("§c[Sistem] Skill/Berkat yang terkunci belum bisa dipasang! Belajar skill di Pohon Keahlian atau dapatkan Berkat dari Gacha.");
        }

        let hasError = false;

        if (newActiveEquipped.length > 3) {
            player.sendMessage(`§c[Sistem] Kapasitas berlebih! Anda hanya dapat memasang maksimal 3 Skill RPG. (Kamu memilih ${newActiveEquipped.length})`);
            hasError = true;
        }

        if (newPassiveEquipped.length > 3) {
            player.sendMessage(`§c[Sistem] Kapasitas berlebih! Anda hanya dapat menyerap maksimal 3 Berkat Kuno. (Kamu memilih ${newPassiveEquipped.length})`);
            hasError = true;
        }

        if (!hasError) {
            rpgData.equippedSkills = newActiveEquipped;
            rpgData.equippedGachaPassives = newPassiveEquipped;
            savePlayerRpgData(player, rpgData);
            player.sendMessage("§a[Sistem] Susunan kemampuan & berkat berhasil diterapkan.");

            // Show what's equipped
            if (newActiveEquipped.length > 0) {
                const names = newActiveEquipped.map(id => {
                    const s = AVAILABLE_SKILLS.find(sk => sk.id === id);
                    return s ? s.name : id;
                });
                player.sendMessage(`§bSkill Aktif: §f${names.join(", ")}`);
            } else {
                player.sendMessage("§7Tidak ada skill RPG yang terpasang.");
            }
            if (newPassiveEquipped.length > 0) {
                const names = newPassiveEquipped.map(id => {
                    const p = PASSIVE_POOL.find(pp => pp.id === id);
                    return p ? p.name : id;
                });
                player.sendMessage(`§dBerkat Kuno: §f${names.join(", ")}`);
            } else {
                player.sendMessage("§7Tidak ada Berkat Kuno yang terpasang.");
            }

            // Auto-reopen Atribut & Kekuatan after equip
            goToAtributMenu(player);
        }
    });
}
