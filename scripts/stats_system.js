import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore } from "./utils.js";
import { getPlayerRpgData } from "./rpg_system.js";
import { getPlayerRank } from "./rank_system.js";
import { getPlayerStreakInfo } from "./login_reward.js";

// ============================================================
// SISTEM STATISTIK PEMAIN -- Player Statistics (v2.1)
// ============================================================

// ============================================================
// DATA MANAGEMENT
// ============================================================

function getPlayerStats(player) {
    try {
        const str = player.getDynamicProperty("player_stats");
        if (str && typeof str === 'string') {
            return JSON.parse(str);
        }
    } catch(e) {}
    return {
        blocksBroken: 0,
        logsBroken: 0,
        cropsHarvested: 0,
        mobsKilled: 0,
        fishCaught: 0,
        itemsSold: 0,
        itemsBought: 0,
        moneyEarned: 0,       // from selling
        moneySpent: 0,        // from buying
        totalPlayMinutes: 0,
        deaths: 0,
        questsCompleted: 0,
        gachaRolls: 0,
        transfersSent: 0,
        bountiesClaimed: 0,
        bountiesSet: 0,
        trollsSent: 0,
        rtpCount: 0,
        arenaRuns: 0,
        arenaWaves: 0,
        arenaBosses: 0,
        firstJoinDate: Date.now()
    };
}

function savePlayerStats(player, stats) {
    try {
        player.setDynamicProperty("player_stats", JSON.stringify(stats));
    } catch(e) {}
}

// ============================================================
// PUBLIC API -- Track Stats (called from other systems)
// ============================================================

export function trackStat(player, statKey, amount = 1) {
    const stats = getPlayerStats(player);
    if (stats[statKey] !== undefined) {
        stats[statKey] += amount;
        savePlayerStats(player, stats);
    }
}

export function getPlayerStatsData(player) {
    return getPlayerStats(player);
}

// ============================================================
// PLAY TIME TRACKING -- Increment every minute
// ============================================================

system.runInterval(() => {
    const players = world.getAllPlayers();
    for (const player of players) {
        try {
            const stats = getPlayerStats(player);
            stats.totalPlayMinutes = (stats.totalPlayMinutes || 0) + 1;
            savePlayerStats(player, stats);
        } catch(e) {}
    }
}, 1200); // Every 60 seconds

// ============================================================
// UI MENU
// ============================================================

export function openStatsMenu(player) {
    const stats = getPlayerStats(player);
    const rpgData = getPlayerRpgData(player);
    const pRank = getPlayerRank(player);
    const streakInfo = getPlayerStreakInfo(player);
    const coins = getScore(player, "dompet");
    const coreScore = getScore(player, "core");

    const form = new ActionFormData();
    form.title("§bStatistik Pemain");

    // Format play time
    const playHours = Math.floor(stats.totalPlayMinutes / 60);
    const playMins = stats.totalPlayMinutes % 60;
    const playTimeStr = playHours > 0 ? `${playHours} jam ${playMins} menit` : `${playMins} menit`;

    // First join date
    const joinDate = new Date(stats.firstJoinDate || Date.now());
    const joinStr = `${joinDate.getDate()}/${joinDate.getMonth() + 1}/${joinDate.getFullYear()}`;

    let bodyText = "";

    // --- PROFIL UMUM ---
    bodyText += `§e§l--- PROFIL UMUM ---§r\n`;
    bodyText += `§fNama: §b${player.name}\n`;
    bodyText += `§fPangkat: ${pRank.badge}\n`;
    bodyText += `§fBergabung: §7${joinStr}\n`;
    bodyText += `§fWaktu Bermain: §a${playTimeStr}\n`;
    bodyText += `§fLogin Streak: §e${streakInfo.streak} hari §7(Total: ${streakInfo.totalLogins})\n`;
    bodyText += `§fKematian: §c${stats.deaths}\n\n`;

    // --- KEUANGAN ---
    bodyText += `§e§l--- KEUANGAN ---§r\n`;
    bodyText += `§fSaldo: §e${formatRupiah(coins)} §7| §bCore: §f${coreScore}\n`;
    bodyText += `§fTotal Penghasilan: §a${formatRupiah(stats.moneyEarned)}\n`;
    bodyText += `§fTotal Pengeluaran: §c${formatRupiah(stats.moneySpent)}\n`;
    bodyText += `§fBarang Dibeli: §a${stats.itemsBought}\n`;
    bodyText += `§fBarang Dijual: §a${stats.itemsSold}\n\n`;

    // --- PROFESI RPG ---
    bodyText += `§d§l--- PROFESI RPG ---§r\n`;
    bodyText += `§fSP: §e${rpgData.sp} §7| §bSkill: §f${rpgData.equippedSkills.length}/3 aktif, ${rpgData.unlockedSkills.length}/15 dikuasai\n`;

    const profs = [
        { key: "mining", color: "§b", name: "Mining" },
        { key: "woodcutting", color: "§a", name: "Woodcutting" },
        { key: "slayer", color: "§c", name: "Slayer" },
        { key: "farming", color: "§2", name: "Farming" },
        { key: "fishing", color: "§3", name: "Fishing" }
    ];

    for (const p of profs) {
        bodyText += `  ${p.color}${p.name}: §fLv.${rpgData[p.key].level}\n`;
    }
    bodyText += `\n`;

    // --- AKTIVITAS ---
    bodyText += `§b§l--- AKTIVITAS ---§r\n`;
    bodyText += `§fBlok Dihancurkan: §7${stats.blocksBroken}\n`;
    bodyText += `§fKayu Ditebang: §7${stats.logsBroken}\n`;
    bodyText += `§fTanaman Dipanen: §7${stats.cropsHarvested}\n`;
    bodyText += `§fMonster Dibunuh: §7${stats.mobsKilled}\n`;
    bodyText += `§fIkan Ditemukan: §7${stats.fishCaught}\n\n`;

    // --- SOSIAL & LAINNYA ---
    bodyText += `§3§l--- SOSIAL & LAINNYA ---§r\n`;
    bodyText += `§fTransfer Dikirim: §7${stats.transfersSent}\n`;
    bodyText += `§fBounty Dipasang: §7${stats.bountiesSet}\n`;
    bodyText += `§fBounty Diklaim: §7${stats.bountiesClaimed}\n`;
    bodyText += `§fSabotase Dikirim: §7${stats.trollsSent}\n`;
    bodyText += `§fGacha Dilakukan: §7${stats.gachaRolls}\n`;
    bodyText += `§fMisi Selesai: §7${stats.questsCompleted}\n`;
    bodyText += `§fRTP Digunakan: §7${stats.rtpCount}\n\n`;
    bodyText += `§4§l--- Arena ---§r\n`;
    bodyText += `§fArena Run: §7${stats.arenaRuns || 0}\n`;
    bodyText += `§fWave Dilewati: §7${stats.arenaWaves || 0}\n`;
    bodyText += `§fBoss Dikalahkan: §7${stats.arenaBosses || 0}\n`;

    form.body(bodyText);
    form.button("§cKembali ke Menu Utama");

    form.show(player).then(res => {
        if (res.canceled) return;
        import("./menu_system.js").then(mod => {
            system.runTimeout(() => { mod.openMainMenu(player); }, 5);
        }).catch(() => {});
    });
}
