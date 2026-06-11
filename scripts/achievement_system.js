import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore, setScore } from "./utils.js";
import { getPlayerRpgData, savePlayerRpgData } from "./rpg_system.js";

// ============================================================
// SISTEM PENCAPAIAN -- Achievement System (v2.1)
// ============================================================

const ACHIEVEMENT_CATEGORIES = {
    economy: "§eEkonomi",
    rpg: "§dProfesi & Kekuatan",
    combat: "§cPertempuran",
    social: "§bSosial",
    gacha: "§5Gacha & Berkat",
    exploration: "§aEksplorasi"
};

const ACHIEVEMENTS = [
    // --- EKONOMI ---
    { id: "first_10k", cat: "economy", name: "Tabungan Pertama", desc: "Miliki Rp10.000", rewardRp: 5000, rewardSp: 0 },
    { id: "first_100k", cat: "economy", name: "Pedagang Kecil", desc: "Miliki Rp100.000", rewardRp: 20000, rewardSp: 0 },
    { id: "first_1m", cat: "economy", name: "Juragan Muda", desc: "Miliki Rp1.000.000", rewardRp: 100000, rewardSp: 1 },
    { id: "first_10m", cat: "economy", name: "Konglomerat Kebanggaan", desc: "Miliki Rp10.000.000", rewardRp: 500000, rewardSp: 2 },
    { id: "first_100m", cat: "economy", name: "Tycoon Sejati", desc: "Miliki Rp100.000.000", rewardRp: 2000000, rewardSp: 3 },
    { id: "first_1b", cat: "economy", name: "Legenda Harta", desc: "Miliki Rp1.000.000.000", rewardRp: 10000000, rewardSp: 5 },
    { id: "first_sell", cat: "economy", name: "Pedagang Pemula", desc: "Jual barang pertama kali", rewardRp: 2000, rewardSp: 0 },
    { id: "first_buy", cat: "economy", name: "Pembeli Pertama", desc: "Beli barang pertama kali", rewardRp: 2000, rewardSp: 0 },
    { id: "first_autosell", cat: "economy", name: "Industralis", desc: "Pasang Peti Ekspor pertama", rewardRp: 50000, rewardSp: 0 },

    // --- PROFESI & KEKUATAN ---
    { id: "any_lv10", cat: "rpg", name: "Pemula Bertalenta", desc: "Capai Level 10 di profesi apapun", rewardRp: 10000, rewardSp: 1 },
    { id: "any_lv25", cat: "rpg", name: "Spesialis", desc: "Capai Level 25 di profesi apapun", rewardRp: 50000, rewardSp: 2 },
    { id: "any_lv50", cat: "rpg", name: "Grandmaster", desc: "Capai Level 50 di profesi apapun", rewardRp: 500000, rewardSp: 5 },
    { id: "all_lv10", cat: "rpg", name: "Polimat", desc: "Capai Level 10 di semua profesi", rewardRp: 100000, rewardSp: 3 },
    { id: "first_skill", cat: "rpg", name: "Murid Pertama", desc: "Pelajari skill pertama", rewardRp: 5000, rewardSp: 0 },
    { id: "all_15_skills", cat: "rpg", name: "Sang Pendekar", desc: "Kuasai semua 15 skill", rewardRp: 1000000, rewardSp: 10 },

    // --- PERTEMPURAN ---
    { id: "kill_50_mobs", cat: "combat", name: "Pemburu Monster", desc: "Bunuh 50 monster", rewardRp: 15000, rewardSp: 0 },
    { id: "kill_200_mobs", cat: "combat", name: "Pemusnah Kehancuran", desc: "Bunuh 200 monster", rewardRp: 50000, rewardSp: 1 },
    { id: "kill_1000_mobs", cat: "combat", name: "Iblis Peperangan", desc: "Bunuh 1.000 monster", rewardRp: 200000, rewardSp: 3 },
    { id: "first_bounty_claim", cat: "combat", name: "Pemburu Hadiah", desc: "Klaim bounty pertama", rewardRp: 30000, rewardSp: 0 },
    { id: "survive_second_wind", cat: "combat", name: "Nyawa Kedua", desc: "Bertahan hidup berkat Second Wind", rewardRp: 25000, rewardSp: 0 },

    // --- SOSIAL ---
    { id: "first_transfer", cat: "social", name: "Tetangga Baik", desc: "Transfer Rupiah pertama kali", rewardRp: 5000, rewardSp: 0 },
    { id: "first_item_transfer", cat: "social", name: "Tukang Barang", desc: "Transfer barang pertama kali", rewardRp: 5000, rewardSp: 0 },
    { id: "first_bounty_set", cat: "social", name: "Sang Penuntut", desc: "Pasang bounty pertama", rewardRp: 10000, rewardSp: 0 },
    { id: "first_troll", cat: "social", name: "Penjahat Kelas Kakap", desc: "Kirim sabotase pertama", rewardRp: 15000, rewardSp: 0 },
    { id: "rank_up", cat: "social", name: "Naik Pangkat", desc: "Tingkatkan pangkat pertama kali", rewardRp: 25000, rewardSp: 1 },

    // --- GACHA & BERKAT ---
    { id: "first_gacha", cat: "gacha", name: "Pemula Keberuntungan", desc: "Lakukan gacha pertama kali", rewardRp: 10000, rewardSp: 0 },
    { id: "first_epic", cat: "gacha", name: "Pemilik Artefak", desc: "Dapatkan item Epic dari gacha", rewardRp: 50000, rewardSp: 1 },
    { id: "first_legendary", cat: "gacha", name: "Senjata Legendaris", desc: "Dapatkan item Legendary dari gacha", rewardRp: 200000, rewardSp: 2 },
    { id: "first_passive", cat: "gacha", name: "Berkat Pertama", desc: "Dapatkan Pasif Dewa pertama", rewardRp: 30000, rewardSp: 1 },
    { id: "all_passives", cat: "gacha", name: "Dewa Tertinggi", desc: "Kumpulkan semua 8 Pasif Dewa", rewardRp: 500000, rewardSp: 5 },
    { id: "ten_pull_legendary", cat: "gacha", name: "Jackpot 10-Pull", desc: "Dapatkan Legendary dari 10-pull gacha", rewardRp: 300000, rewardSp: 3 },
    { id: "legendary_passive", cat: "gacha", name: "Berkat Legendaris", desc: "Dapatkan Pasif Dewa rarity Legendary", rewardRp: 150000, rewardSp: 2 },
    { id: "mythic_passive", cat: "gacha", name: "Berkat Mitos", desc: "Dapatkan Pasif Dewa rarity Mythic (Second Wind)", rewardRp: 500000, rewardSp: 5 },

    // --- ARENA (v2.5) ---
    { id: "first_arena", cat: "combat", name: "Petarung Arena", desc: "Selesaikan Arena Pertarungan pertama", rewardRp: 25000, rewardSp: 1 },
    { id: "arena_wave10", cat: "combat", name: "Selamat Sampai Wave 10", desc: "Capai wave 10 di Arena", rewardRp: 100000, rewardSp: 2 },
    { id: "arena_clear_biasa", cat: "combat", name: "Penakluk Arena Biasa", desc: "Selesaikan semua wave Arena Biasa", rewardRp: 200000, rewardSp: 3 },
    { id: "arena_clear_sulit", cat: "combat", name: "Penakluk Arena Sulit", desc: "Selesaikan semua wave Arena Sulit", rewardRp: 500000, rewardSp: 5 },
    { id: "arena_clear_neraka", cat: "combat", name: "Penakluk Arena Neraka", desc: "Selesaikan semua wave Arena Neraka", rewardRp: 1000000, rewardSp: 8 },
    { id: "arena_10bosses", cat: "combat", name: "Pembunuh Boss", desc: "Kalahkan 10 Boss Arena", rewardRp: 300000, rewardSp: 3 },

    // --- EKSPLORASI ---
    { id: "first_rtp", cat: "exploration", name: "Penjelajah Dunia", desc: "Lakukan RTP pertama kali", rewardRp: 5000, rewardSp: 0 },
    { id: "first_home", cat: "exploration", name: "Pemilik Tanah", desc: "Simpan Home pertama", rewardRp: 10000, rewardSp: 0 },
    { id: "find_diamond", cat: "exploration", name: "Penambang Berlian", desc: "Temukan Diamond Ore", rewardRp: 20000, rewardSp: 0 },
    { id: "find_debris", cat: "exploration", name: "Pencari Netherite", desc: "Temukan Ancient Debris", rewardRp: 100000, rewardSp: 1 },
];

// ============================================================
// ACHIEVEMENT DATA MANAGEMENT
// ============================================================

function getPlayerAchievementData(player) {
    try {
        const str = player.getDynamicProperty("achievement_data");
        if (str && typeof str === 'string') {
            return JSON.parse(str);
        }
    } catch(e) {}
    return { unlocked: [], claimed: [] };
}

function savePlayerAchievementData(player, data) {
    try {
        player.setDynamicProperty("achievement_data", JSON.stringify(data));
    } catch(e) {}
}

// ============================================================
// PUBLIC API -- Unlock & Check Achievements
// ============================================================

export function unlockAchievement(player, achievementId) {
    const data = getPlayerAchievementData(player);
    if (data.unlocked.includes(achievementId)) return false;

    data.unlocked.push(achievementId);
    savePlayerAchievementData(player, data);

    const achDef = ACHIEVEMENTS.find(a => a.id === achievementId);
    if (achDef) {
        player.sendMessage(`§6§l[PENCAPAIAN BARU!] §r§f${achDef.name} §7-- ${achDef.desc}`);
        player.sendMessage(`§7Klaim hadiah di Menu Pencapaian: §e${formatRupiah(achDef.rewardRp)}${achDef.rewardSp > 0 ? ` §d+${achDef.rewardSp}SP` : ""}`);
        player.runCommandAsync("playsound random.levelup @s");
        try {
            const px = Math.floor(player.location.x);
            const py = Math.floor(player.location.y);
            const pz = Math.floor(player.location.z);
            player.dimension.runCommandAsync(`summon fireworks_rocket ${px} ${py + 1} ${pz}`);
        } catch(e) {}
    }

    return true;
}

export function hasAchievement(player, achievementId) {
    const data = getPlayerAchievementData(player);
    return data.unlocked.includes(achievementId);
}

// ============================================================
// CHECK FUNCTIONS -- Called from various triggers
// ============================================================

export function checkWealthAchievements(player) {
    const coins = getScore(player, "dompet");
    if (coins >= 10000) unlockAchievement(player, "first_10k");
    if (coins >= 100000) unlockAchievement(player, "first_100k");
    if (coins >= 1000000) unlockAchievement(player, "first_1m");
    if (coins >= 10000000) unlockAchievement(player, "first_10m");
    if (coins >= 100000000) unlockAchievement(player, "first_100m");
    if (coins >= 1000000000) unlockAchievement(player, "first_1b");
}

export function checkRpgAchievements(player) {
    const rpgData = getPlayerRpgData(player);
    const profs = ["mining", "woodcutting", "slayer", "farming", "fishing"];
    const levels = profs.map(p => rpgData[p].level);

    if (levels.some(l => l >= 10)) unlockAchievement(player, "any_lv10");
    if (levels.some(l => l >= 25)) unlockAchievement(player, "any_lv25");
    if (levels.some(l => l >= 50)) unlockAchievement(player, "any_lv50");
    if (levels.every(l => l >= 10)) unlockAchievement(player, "all_lv10");

    if (rpgData.unlockedSkills.length >= 1) unlockAchievement(player, "first_skill");
    if (rpgData.unlockedSkills.length >= 15) unlockAchievement(player, "all_15_skills");

    if ((rpgData.unlockedGachaPassives || []).length >= 8) unlockAchievement(player, "all_passives");
}

// ============================================================
// CLAIM REWARD
// ============================================================

function claimAchievementReward(player, achId) {
    const data = getPlayerAchievementData(player);
    if (data.claimed.includes(achId)) return false;
    if (!data.unlocked.includes(achId)) return false;

    const achDef = ACHIEVEMENTS.find(a => a.id === achId);
    if (!achDef) return false;

    // Give rewards
    if (achDef.rewardRp > 0) {
        const currentCoins = getScore(player, "dompet");
        setScore(player, "dompet", currentCoins + achDef.rewardRp);
    }
    if (achDef.rewardSp > 0) {
        const rpgData = getPlayerRpgData(player);
        rpgData.sp += achDef.rewardSp;
        savePlayerRpgData(player, rpgData);
    }

    data.claimed.push(achId);
    savePlayerAchievementData(player, data);
    return true;
}

// ============================================================
// UI MENU
// ============================================================

export function openAchievementMenu(player) {
    const data = getPlayerAchievementData(player);

    const form = new ActionFormData();
    form.title("§6Pencapaian");

    // Count achievements
    const totalAch = ACHIEVEMENTS.length;
    const unlocked = data.unlocked.length;
    const claimed = data.claimed.length;
    const unclaimed = unlocked - claimed;

    let bodyText = `§ePencapaian: §f${unlocked}/${totalAch} §7(Diklaim: ${claimed})\n\n`;

    // Group by category
    for (const [catKey, catName] of Object.entries(ACHIEVEMENT_CATEGORIES)) {
        const catAchs = ACHIEVEMENTS.filter(a => a.cat === catKey);
        const catUnlocked = catAchs.filter(a => data.unlocked.includes(a.id)).length;
        bodyText += `${catName} §7(${catUnlocked}/${catAchs.length})\n`;

        for (const ach of catAchs) {
            const isUnlocked = data.unlocked.includes(ach.id);
            const isClaimed = data.claimed.includes(ach.id);

            if (isClaimed) {
                bodyText += `  §a[Selesai] §f${ach.name}\n`;
            } else if (isUnlocked) {
                bodyText += `  §e[Klaim!] §f${ach.name} §7-- ${ach.desc}\n`;
                bodyText += `    §7Hadiah: §e${formatRupiah(ach.rewardRp)}`;
                if (ach.rewardSp > 0) bodyText += ` §d+${ach.rewardSp}SP`;
                bodyText += `\n`;
            } else {
                bodyText += `  §8[??] §7${ach.desc}\n`;
            }
        }
        bodyText += `\n`;
    }

    form.body(bodyText);

    if (unclaimed > 0) {
        form.button(`§aKlaim Semua Pencapaian (${unclaimed})\n§7Ambil reward yang tersedia`);
    }

    form.button("§cKembali ke Menu Utama");

    form.show(player).then(res => {
        if (res.canceled) return;

        if (unclaimed > 0 && res.selection === 0) {
            // Claim all unclaimed
            let totalClaimed = 0;
            for (const achId of data.unlocked) {
                if (!data.claimed.includes(achId)) {
                    if (claimAchievementReward(player, achId)) {
                        totalClaimed++;
                    }
                }
            }
            if (totalClaimed > 0) {
                player.sendMessage(`§6[Pencapaian] §fBerhasil mengklaim ${totalClaimed} pencapaian!`);
                player.runCommandAsync("playsound random.levelup @s");
            }
            system.runTimeout(() => { openAchievementMenu(player); }, 5);
        } else {
            import("./menu_system.js").then(mod => {
                system.runTimeout(() => { mod.openMainMenu(player); }, 5);
            }).catch(() => {});
        }
    });
}

// ============================================================
// HELPER -- Get unclaimed count (for menu badge)
// ============================================================

export function getUnclaimedAchievementCount(player) {
    const data = getPlayerAchievementData(player);
    return data.unlocked.length - data.claimed.length;
}

export { ACHIEVEMENTS };
