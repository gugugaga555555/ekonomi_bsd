import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore, setScore } from "./utils.js";
import { getPlayerRpgData, savePlayerRpgData, addXp } from "./rpg_system.js";

// ============================================================
// SISTEM MISI -- Harian & Mingguan (v2.1)
// ============================================================

const DAILY_QUEST_COUNT = 4;
const WEEKLY_QUEST_COUNT = 2;
const DAILY_RESET_HOURS = 24;
const WEEKLY_RESET_HOURS = 168; // 7 days

// ============================================================
// QUEST DEFINITIONS -- Pool of possible quests
// ============================================================

const QUEST_POOL = {
    // --- DAILY QUESTS ---
    daily: [
        { id: "break_blocks_50", desc: "Hancurkan 50 blok", type: "break_blocks", target: 50, rewardRp: 15000, rewardXp: 50, rewardProf: "mining" },
        { id: "break_blocks_100", desc: "Hancurkan 100 blok", type: "break_blocks", target: 100, rewardRp: 30000, rewardXp: 120, rewardProf: "mining" },
        { id: "break_logs_20", desc: "Tebang 20 kayu/log", type: "break_logs", target: 20, rewardRp: 12000, rewardXp: 60, rewardProf: "woodcutting" },
        { id: "break_logs_40", desc: "Tebang 40 kayu/log", type: "break_logs", target: 40, rewardRp: 25000, rewardXp: 130, rewardProf: "woodcutting" },
        { id: "kill_mobs_10", desc: "Bunuh 10 monster", type: "kill_mobs", target: 10, rewardRp: 20000, rewardXp: 80, rewardProf: "slayer" },
        { id: "kill_mobs_25", desc: "Bunuh 25 monster", type: "kill_mobs", target: 25, rewardRp: 45000, rewardXp: 200, rewardProf: "slayer" },
        { id: "harvest_crops_15", desc: "Panen 15 tanaman", type: "harvest_crops", target: 15, rewardRp: 18000, rewardXp: 70, rewardProf: "farming" },
        { id: "harvest_crops_30", desc: "Panen 30 tanaman", type: "harvest_crops", target: 30, rewardRp: 35000, rewardXp: 150, rewardProf: "farming" },
        { id: "fish_5", desc: "Pancing 5 kali", type: "fish_cast", target: 5, rewardRp: 10000, rewardXp: 40, rewardProf: "fishing" },
        { id: "fish_10", desc: "Pancing 10 kali", type: "fish_cast", target: 10, rewardRp: 22000, rewardXp: 100, rewardProf: "fishing" },
        { id: "sell_items", desc: "Jual barang ke Pengepul", type: "sell_items", target: 1, rewardRp: 8000, rewardXp: 30, rewardProf: null },
        { id: "earn_rupiah_50k", desc: "Hasilkan Rp50.000 dari penjualan", type: "earn_rupiah", target: 50000, rewardRp: 10000, rewardXp: 40, rewardProf: null },
        { id: "earn_rupiah_100k", desc: "Hasilkan Rp100.000 dari penjualan", type: "earn_rupiah", target: 100000, rewardRp: 20000, rewardXp: 80, rewardProf: null },
    ],
    // --- WEEKLY QUESTS ---
    weekly: [
        { id: "break_blocks_500", desc: "Hancurkan 500 blok dalam seminggu", type: "break_blocks", target: 500, rewardRp: 100000, rewardXp: 500, rewardSp: 2, rewardProf: "mining" },
        { id: "break_logs_200", desc: "Tebang 200 kayu/log dalam seminggu", type: "break_logs", target: 200, rewardRp: 80000, rewardXp: 400, rewardSp: 2, rewardProf: "woodcutting" },
        { id: "kill_mobs_100", desc: "Bunuh 100 monster dalam seminggu", type: "kill_mobs", target: 100, rewardRp: 150000, rewardXp: 600, rewardSp: 3, rewardProf: "slayer" },
        { id: "harvest_crops_150", desc: "Panen 150 tanaman dalam seminggu", type: "harvest_crops", target: 150, rewardRp: 120000, rewardXp: 500, rewardSp: 2, rewardProf: "farming" },
        { id: "fish_50", desc: "Pancing 50 kali dalam seminggu", type: "fish_cast", target: 50, rewardRp: 80000, rewardXp: 350, rewardSp: 2, rewardProf: "fishing" },
        { id: "earn_rupiah_500k", desc: "Hasilkan Rp500.000 dari penjualan", type: "earn_rupiah", target: 500000, rewardRp: 100000, rewardXp: 300, rewardSp: 1, rewardProf: null },
        { id: "earn_rupiah_1m", desc: "Hasilkan Rp1.000.000 dari penjualan", type: "earn_rupiah", target: 1000000, rewardRp: 200000, rewardXp: 500, rewardSp: 2, rewardProf: null },
        { id: "sell_items_5", desc: "Jual barang ke Pengepul 5 kali", type: "sell_items", target: 5, rewardRp: 50000, rewardXp: 200, rewardSp: 1, rewardProf: null },
    ]
};

// ============================================================
// QUEST DATA MANAGEMENT
// ============================================================

function getPlayerQuestData(player) {
    try {
        const str = player.getDynamicProperty("quest_data");
        if (str && typeof str === 'string') {
            return JSON.parse(str);
        }
    } catch(e) {}
    return null;
}

function savePlayerQuestData(player, data) {
    try {
        player.setDynamicProperty("quest_data", JSON.stringify(data));
    } catch(e) {}
}

function getNowHours() {
    return Date.now() / 3600000;
}

function generateQuestsForPlayer(player, forceReset = false) {
    let data = getPlayerQuestData(player);

    const now = getNowHours();

    if (!data) {
        data = { daily: null, weekly: null, dailyResetAt: 0, weeklyResetAt: 0, progress: {} };
    }

    // Daily reset check
    if (forceReset || !data.daily || now >= data.dailyResetAt) {
        const pool = QUEST_POOL.daily;
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, DAILY_QUEST_COUNT).map(q => ({
            ...q,
            progress: 0,
            completed: false,
            claimed: false
        }));
        data.daily = selected;
        data.dailyResetAt = now + DAILY_RESET_HOURS;

        // Reset daily progress counters
        for (const key of Object.keys(data.progress)) {
            if (key.startsWith("daily_")) {
                delete data.progress[key];
            }
        }
    }

    // Weekly reset check
    if (forceReset || !data.weekly || now >= data.weeklyResetAt) {
        const pool = QUEST_POOL.weekly;
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, WEEKLY_QUEST_COUNT).map(q => ({
            ...q,
            progress: 0,
            completed: false,
            claimed: false
        }));
        data.weekly = selected;
        data.weeklyResetAt = now + WEEKLY_RESET_HOURS;

        // Reset weekly progress counters
        for (const key of Object.keys(data.progress)) {
            if (key.startsWith("weekly_")) {
                delete data.progress[key];
            }
        }
    }

    savePlayerQuestData(player, data);
    return data;
}

// ============================================================
// QUEST PROGRESS TRACKING -- Called from other systems
// ============================================================

export function trackQuestProgress(player, type, amount = 1) {
    const data = getPlayerQuestData(player);
    if (!data) return;

    let updated = false;

    // Update daily quests
    if (data.daily) {
        for (const quest of data.daily) {
            if (quest.completed || quest.type !== type) continue;
            quest.progress = Math.min(quest.progress + amount, quest.target);
            if (quest.progress >= quest.target) {
                quest.completed = true;
                player.sendMessage(`§a[Misi] §fMisi harian selesai: §e${quest.desc}§f! Klaim hadiah di Menu Misi.`);
                player.runCommandAsync("playsound random.levelup @s");
            }
            updated = true;
        }
    }

    // Update weekly quests
    if (data.weekly) {
        for (const quest of data.weekly) {
            if (quest.completed || quest.type !== type) continue;
            quest.progress = Math.min(quest.progress + amount, quest.target);
            if (quest.progress >= quest.target) {
                quest.completed = true;
                player.sendMessage(`§a[Misi] §fMisi mingguan selesai: §e${quest.desc}§f! Klaim hadiah di Menu Misi.`);
                player.runCommandAsync("playsound random.levelup @s");
            }
            updated = true;
        }
    }

    if (updated) {
        savePlayerQuestData(player, data);
    }
}

// ============================================================
// QUEST CLAIM -- Give rewards
// ============================================================

function claimQuestReward(player, quest) {
    // Rupiah reward
    if (quest.rewardRp > 0) {
        const currentCoins = getScore(player, "dompet");
        setScore(player, "dompet", currentCoins + quest.rewardRp);
    }

    // XP reward
    if (quest.rewardXp > 0 && quest.rewardProf) {
        addXp(player, quest.rewardProf, quest.rewardXp);
    }

    // SP reward
    if (quest.rewardSp > 0) {
        const rpgData = getPlayerRpgData(player);
        rpgData.sp += quest.rewardSp;
        savePlayerRpgData(player, rpgData);
    }

    quest.claimed = true;
}

// ============================================================
// CLAIM ALL COMPLETED
// ============================================================

function claimAllCompleted(player, data) {
    let totalRp = 0;
    let totalSp = 0;
    let claimedCount = 0;

    const allQuests = [...(data.daily || []), ...(data.weekly || [])];
    for (const quest of allQuests) {
        if (quest.completed && !quest.claimed) {
            totalRp += quest.rewardRp || 0;
            totalSp += quest.rewardSp || 0;
            claimQuestReward(player, quest);
            claimedCount++;
        }
    }

    if (claimedCount > 0) {
        let msg = `§a[Misi] §fMengklaim ${claimedCount} misi! Hadiah: §e${formatRupiah(totalRp)}`;
        if (totalSp > 0) msg += ` §d+${totalSp} SP`;
        player.sendMessage(msg);
        savePlayerQuestData(player, data);
    }

    return claimedCount;
}

// ============================================================
// UI MENUS
// ============================================================

export function openQuestMenu(player) {
    const data = generateQuestsForPlayer(player);

    const form = new ActionFormData();
    form.title("§ePapan Misi");

    // Build body text
    const now = getNowHours();
    const dailyHoursLeft = Math.max(0, data.dailyResetAt - now);
    const weeklyHoursLeft = Math.max(0, data.weeklyResetAt - now);
    const dailyMinLeft = Math.ceil(dailyHoursLeft * 60);
    const weeklyDaysLeft = Math.ceil(weeklyHoursLeft / 24);

    let bodyText = "";

    // Daily quests
    bodyText += `§e§l--- MISI HARIAN ---§r\n`;
    bodyText += `§7Reset dalam: §e${dailyMinLeft} menit\n\n`;

    if (data.daily) {
        for (const quest of data.daily) {
            const status = quest.claimed ? "§a[Diambil]" : quest.completed ? "§e[Selesai!]" : `§7[${quest.progress}/${quest.target}]`;
            const bar = quest.claimed ? "§a||||||||||||||||||||" : generateMiniQuestBar(quest.progress, quest.target);
            bodyText += `${status} §f${quest.desc}\n`;
            bodyText += `  ${bar} §7| Hadiah: §e${formatRupiah(quest.rewardRp)}`;
            if (quest.rewardSp) bodyText += ` §d+${quest.rewardSp}SP`;
            if (quest.rewardXp && quest.rewardProf) bodyText += ` §b+${quest.rewardXp}XP`;
            bodyText += `\n\n`;
        }
    }

    // Weekly quests
    bodyText += `§d§l--- MISI MINGGUAN ---§r\n`;
    bodyText += `§7Reset dalam: §e${weeklyDaysLeft} hari\n\n`;

    if (data.weekly) {
        for (const quest of data.weekly) {
            const status = quest.claimed ? "§a[Diambil]" : quest.completed ? "§e[Selesai!]" : `§7[${quest.progress}/${quest.target}]`;
            const bar = quest.claimed ? "§a||||||||||||||||||||" : generateMiniQuestBar(quest.progress, quest.target);
            bodyText += `${status} §f${quest.desc}\n`;
            bodyText += `  ${bar} §7| Hadiah: §e${formatRupiah(quest.rewardRp)}`;
            if (quest.rewardSp) bodyText += ` §d+${quest.rewardSp}SP`;
            if (quest.rewardXp && quest.rewardProf) bodyText += ` §b+${quest.rewardXp}XP`;
            bodyText += `\n\n`;
        }
    }

    form.body(bodyText);

    // Count unclaimed
    const allQuests = [...(data.daily || []), ...(data.weekly || [])];
    const unclaimed = allQuests.filter(q => q.completed && !q.claimed).length;

    if (unclaimed > 0) {
        form.button(`§aKlaim Semua Hadiah (${unclaimed})\n§7Ambil reward misi selesai`);
    } else {
        form.button(`§7Tidak Ada Hadiah\n§7Selesaikan misi dulu`);
    }

    form.button("§cKembali ke Menu Utama");

    form.show(player).then(res => {
        if (res.canceled) return;

        if (res.selection === 0 && unclaimed > 0) {
            const claimed = claimAllCompleted(player, data);
            if (claimed > 0) {
                system.runTimeout(() => { openQuestMenu(player); }, 5);
            }
        } else {
            import("./menu_system.js").then(mod => {
                system.runTimeout(() => { mod.openMainMenu(player); }, 5);
            }).catch(() => {});
        }
    });
}

function generateMiniQuestBar(current, target) {
    const barLen = 10;
    const filled = Math.min(barLen, Math.floor((current / target) * barLen));
    const empty = barLen - filled;
    return `§a${"|".repeat(filled)}§7${"|".repeat(empty)}`;
}

// ============================================================
// HELPER -- Get unclaimed count (for menu badge)
// ============================================================

export function getUnclaimedQuestCount(player) {
    const data = getPlayerQuestData(player);
    if (!data) return 0;

    let count = 0;
    if (data.daily) count += data.daily.filter(q => q.completed && !q.claimed).length;
    if (data.weekly) count += data.weekly.filter(q => q.completed && !q.claimed).length;
    return count;
}
