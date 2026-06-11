import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { formatRupiah, getUiHeader, getInbox, clearInbox, getScore, setScore } from "./utils.js";
import { getPlayerRank } from "./rank_system.js";
import { openGachaMenu } from "./gacha_system.js";
import { openTrollMenu, openTrollShieldMenu } from "./troll_system.js";
import { openAutoSellMenu } from "./auto_sell_system.js";
import { openBuyMenu, openSellChoiceMenu, formatItemName } from "./shop_system.js";
import { openBountyMenu, openTopKoinMenu } from "./bounty_system.js";
import { openTransferChoiceMenu, giveItemToPlayer } from "./transfer_system.js";
import { openRpgMenu, openSkillTreeMenu, openEquipUnifiedMenu, openRpgGuideMenu } from "./rpg_menu.js";
import { getPlayerRpgData, getXpRequired, generateXpBar } from "./rpg_system.js";
import { hiddenBoards } from "./app_state.js";
import { getActiveEvent, getActiveEventDisplay, getNextEventETA } from "./event_system.js";
import { openQuestMenu, getUnclaimedQuestCount } from "./quest_system.js";
import { openAchievementMenu, getUnclaimedAchievementCount, checkWealthAchievements, checkRpgAchievements } from "./achievement_system.js";
import { openStatsMenu } from "./stats_system.js";
import { getPlayerStreakInfo } from "./login_reward.js";
import { openArenaMenu } from "./arena_system.js";

// ============================================================
// MAIN MENU HUB (v2.5 -- Arena Pertarungan added)
// ============================================================

export function openMainMenu(player) {
    const rankBadge = getPlayerRank(player).badge;
    const score = getScore(player, "dompet");
    const coreScore = getScore(player, "core");
    const online = world.getAllPlayers().length;
    const rpgData = getPlayerRpgData(player);

    // RPG Quick Summary -- compact single-line per profession
    const profs = [
        { key: "mining", color: "§b" },
        { key: "woodcutting", color: "§a" },
        { key: "slayer", color: "§c" },
        { key: "farming", color: "§2" },
        { key: "fishing", color: "§3" }
    ];
    let rpgLines = "";
    for (const p of profs) {
        const lv = rpgData[p.key].level;
        const xp = rpgData[p.key].xp;
        const req = getXpRequired(lv);
        const pct = req === Infinity ? "MAX" : Math.floor((xp / req) * 100) + "%";
        const miniBar = req === Infinity ? "§bMAX" : generateMiniBar(xp, req);
        rpgLines += `\n${p.color}${p.key.charAt(0).toUpperCase() + p.key.slice(1)} Lv${lv} ${miniBar} §a${pct}`;
    }

    // Event status -- with effect description
    const eventDisplay = getActiveEventDisplay();
    let eventBlock = "";
    if (eventDisplay) {
        const evtColor = eventDisplay.type === "positive" ? "§a" : "§c";
        const durText = eventDisplay.remaining > 0 ? ` §7(${eventDisplay.remaining}m)` : "";
        eventBlock = `\n\n§e§l--- EVENT AKTIF ---`;
        eventBlock += `\n${evtColor}${eventDisplay.name}${durText}`;
        eventBlock += `\n§fEfek: ${evtColor}${eventDisplay.effectLine}`;
    } else {
        const eta = getNextEventETA();
        if (eta > 0) {
            const etaMin = Math.ceil(eta / 60000);
            eventBlock = `\n\n§7Event berikutnya: §e${etaMin} menit`;
        }
    }

    // Streak info & achievement check
    const streakInfo = getPlayerStreakInfo(player);
    checkWealthAchievements(player);
    checkRpgAchievements(player);

    // Count unclaimed rewards
    const unclaimedQuests = getUnclaimedQuestCount(player);
    const unclaimedAch = getUnclaimedAchievementCount(player);
    const totalUnclaimed = unclaimedQuests + unclaimedAch;
    const unreadCount = getInbox(player.name).length;

    const form = new ActionFormData();
    form.title("§lMENU UTAMA");
    form.body(
        `${rankBadge} §7| §a${online} Online\n` +
        `§eRupiah: §f${formatRupiah(score)} §7| §bCore: §f${coreScore}\n` +
        `§dSP: §e${rpgData.sp} §7| §bSkill: §f${rpgData.equippedSkills.length}/3 Aktif, ${rpgData.unlockedSkills.length}/15 Dikuasai\n` +
        `§eStreak: §a${streakInfo.streak} hari §7| ${totalUnclaimed > 0 ? `§c${totalUnclaimed} hadiah belum diklaim!` : `§7Semua hadiah sudah diklaim`}\n\n` +
        `§eRPG Progress:${rpgLines}${eventBlock}`
    );

    // 5 Main Tabs -- Clean & Organized
    form.button("§dAtribut & Kekuatan\n§7RPG, Skill, Gacha, Berkat");
    form.button("§eSektor Ekonomi\n§7Belanja, Jual, Auto-Sell, Transfer");
    form.button("§bSosial & Komunitas\n§7Pangkat, Bounty, Teleport, Sabotase");

    // Misi & Pencapaian with badge
    if (totalUnclaimed > 0) {
        form.button(`§6Misi & Pencapaian (${totalUnclaimed})\n§7Ada hadiah yang bisa diklaim!`);
    } else {
        form.button(`§6Misi & Pencapaian\n§7Quest harian & achievement`);
    }

    // Layanan -- combines Kotak Masuk, Statistik, Buku Panduan, Pengaturan
    let layananBadge = "";
    if (unreadCount > 0) layananBadge = ` (${unreadCount})`;
    form.button(`§aLayanan${layananBadge}\n§7Inbox, Statistik, Panduan, Pengaturan`);

    form.show(player).then((response) => {
        if (response.canceled) return;
        switch (response.selection) {
            case 0: openRpgGachaMenu(player); break;
            case 1: openEconomyMenu(player); break;
            case 2: openSocialMenu(player); break;
            case 3: openQuestAchievementMenu(player); break;
            case 4: openLayananMenu(player); break;
        }
    });
}

function generateMiniBar(xp, maxXp) {
    const barLen = 5;
    const filled = Math.min(barLen, Math.floor((xp / maxXp) * barLen));
    const empty = barLen - filled;
    return `§a${"#".repeat(filled)}§7${"#".repeat(empty)}`;
}

// ============================================================
// LAYANAN MENU (v2.4 -- Consolidated utility hub)
// ============================================================

function openLayananMenu(player) {
    const isBoardHidden = hiddenBoards.get(player.name) || false;
    const unreadCount = getInbox(player.name).length;
    const rpgData = getPlayerRpgData(player);

    const form = new ActionFormData();
    form.title("§aLayanan");

    let bodyText = `§fActionbar: ${isBoardHidden ? "§cSembunyi" : "§aTampil"}\n`;
    bodyText += `§fPesan Masuk: ${unreadCount > 0 ? `§e${unreadCount} baru` : "§7Kosong"}\n`;
    bodyText += `§fSisa SP: §e${rpgData.sp} §7| §bSkill: §f${rpgData.equippedSkills.length}/3 aktif`;

    form.body(bodyText);

    if (unreadCount > 0) {
        form.button(`§aKotak Masuk (${unreadCount})\n§7Ada pesan/paket baru!`);
    } else {
        form.button(`§7Kotak Masuk (0)\n§7Tidak ada pesan`);
    }

    form.button("§bStatistik Pemain\n§7Data lengkap aktivitasmu");
    form.button("§eBuku Panduan\n§7Info lengkap & cara bermain");

    if (isBoardHidden) {
        form.button("§aTampilkan Actionbar\n§7Tampilkan progress XP di layar");
    } else {
        form.button("§cSembunyikan Actionbar\n§7Sembunyikan progress XP");
    }

    form.button("§eCek Saldo Lengkap\n§7Detail Rupiah, Core & Pangkat");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then((res) => {
        if (res.canceled) return;
        switch (res.selection) {
            case 0: openInboxMenu(player); break;
            case 1: openStatsMenu(player); break;
            case 2: openGuideBook(player); break;
            case 3:
                if (isBoardHidden) {
                    hiddenBoards.set(player.name, false);
                    player.sendMessage("§a[Layanan] Actionbar ditampilkan.");
                } else {
                    hiddenBoards.set(player.name, true);
                    player.onScreenDisplay.setActionBar("");
                    player.sendMessage("§a[Layanan] Actionbar disembunyikan.");
                }
                system.runTimeout(() => { openLayananMenu(player); }, 5);
                break;
            case 4: {
                const coins = getScore(player, "dompet");
                const core = getScore(player, "core");
                const pRank = getPlayerRank(player);
                player.sendMessage("§e--- SALDO ANDA ---");
                player.sendMessage(`§eRupiah: §f${formatRupiah(coins)} §7| §bCore: §f${core} §7| ${pRank.badge}`);
                if (pRank.discount > 0) player.sendMessage(`§7Diskon: §a${Math.floor(pRank.discount * 100)}%`);
                const rd = getPlayerRpgData(player);
                player.sendMessage("§d--- PROFIL RPG ---");
                player.sendMessage(`§dSP: §e${rd.sp} §7| §bSkill: §f${rd.unlockedSkills.length}/15, ${rd.equippedSkills.length}/3 aktif`);
                const pn = { mining: "Mining", woodcutting: "Woodcutting", slayer: "Slayer", farming: "Farming", fishing: "Fishing" };
                for (const [k, v] of Object.entries(pn)) {
                    player.sendMessage(`${v}: §fLv.${rd[k].level} §7(${rd[k].xp}/${getXpRequired(rd[k].level)})`);
                }
                system.runTimeout(() => { openLayananMenu(player); }, 5);
                break;
            }
            case 5: system.runTimeout(() => { openMainMenu(player); }, 5); break;
        }
    });
}

// ============================================================
// MISI & PENCAPAIAN HUB
// ============================================================

function openQuestAchievementMenu(player) {
    const unclaimedQuests = getUnclaimedQuestCount(player);
    const unclaimedAch = getUnclaimedAchievementCount(player);
    const streakInfo = getPlayerStreakInfo(player);

    const form = new ActionFormData();
    form.title("§6Misi & Pencapaian");

    let bodyText = `§eStreak Login: §a${streakInfo.streak} hari\n`;
    bodyText += `${unclaimedQuests > 0 ? `§e${unclaimedQuests} misi selesai belum diklaim!\n` : "§7Semua misi sudah diklaim.\n"}`;
    bodyText += `${unclaimedAch > 0 ? `§6${unclaimedAch} pencapaian belum diklaim!\n` : "§7Semua pencapaian sudah diklaim.\n"}`;

    form.body(bodyText);
    form.button("§ePapan Misi\n§7Misi harian & mingguan");
    form.button("§6Pencapaian\n§7Achievement & reward");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then((response) => {
        if (response.canceled) return;
        switch (response.selection) {
            case 0: openQuestMenu(player); break;
            case 1: openAchievementMenu(player); break;
            case 2: system.runTimeout(() => { openMainMenu(player); }, 5); break;
        }
    });
}

// ============================================================
// SEKTOR EKONOMI
// ============================================================

function openEconomyMenu(player) {
    const score = getScore(player, "dompet");
    const form = new ActionFormData();
    form.title("§eSektor Ekonomi");
    form.body(`§eSaldo: §f${formatRupiah(score)}\n\n§7Kelola kekayaan dan perdagangan.`);
    form.button("§aKatalog Perdagangan\n§7Beli berbagai kebutuhan");
    form.button("§ePusat Pengepul\n§7Jual hasil alam jadi Rupiah");
    form.button("§2Sistem Ekspor Otomatis\n§7Auto-Sell Chest = pendapatan pasif");
    form.button("§bDistribusi Aset\n§7Transfer Rupiah & barang antar pemain");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then((response) => {
        if (response.canceled) return;
        switch (response.selection) {
            case 0: openBuyMenu(player); break;
            case 1: openSellChoiceMenu(player); break;
            case 2: openAutoSellMenu(player); break;
            case 3: openTransferChoiceMenu(player); break;
            case 4: system.runTimeout(() => { openMainMenu(player); }, 5); break;
        }
    });
}

// ============================================================
// ATRIBUT & KEKUATAN (v2.5 -- Arena added, 7 buttons)
// ============================================================

export function openRpgGachaMenu(player) {
    const rpgData = getPlayerRpgData(player);
    const coreScore = getScore(player, "core");
    const gachaPassivesOwned = (rpgData.unlockedGachaPassives || []).length;
    const gachaPassivesEquipped = (rpgData.equippedGachaPassives || []).length;

    const profs = [
        { key: "mining", color: "§b", name: "MINING", skills: ["ore_excavation", "deep_core_mining", "seismic_slam"] },
        { key: "woodcutting", color: "§a", name: "WOODCUTTING", skills: ["treecapitator", "bark_armor", "leaf_storm"] },
        { key: "slayer", color: "§c", name: "SLAYER", skills: ["cleave_strike", "bloodlust", "executioners_mark"] },
        { key: "farming", color: "§2", name: "FARMING", skills: ["bountiful_harvest", "green_thumb", "natures_gift"] },
        { key: "fishing", color: "§3", name: "FISHING", skills: ["tidal_surge", "master_fisher", "anglers_fortune", "deep_sea_diver"] }
    ];

    let profBlock = "";
    for (const p of profs) {
        const lv = rpgData[p.key].level;
        const xp = rpgData[p.key].xp;
        const req = getXpRequired(lv);
        const pct = req === Infinity ? "MAX" : Math.floor((xp / req) * 100) + "%";
        const bar = req === Infinity ? "§bMAX" : generateMiniBar(xp, req);
        const profMultiplier = 1 + Math.floor(lv / 10) * 0.5;
        const unlocked = p.skills.filter(id => rpgData.unlockedSkills.includes(id)).length;
        const equipped = p.skills.filter(id => rpgData.equippedSkills.includes(id)).length;
        const passiveBonus = getProfPassiveBonus(p.key, lv);

        profBlock += `${p.color}${p.name} §fLv.${lv} ${bar} §a${pct}\n`;
        profBlock += `  §7x${profMultiplier} | §bSkill: §f${unlocked}/3 (${equipped} on)`;
        if (passiveBonus) profBlock += ` | ${passiveBonus}`;
        profBlock += "\n";
    }

    let equippedBlock = "";
    if (rpgData.equippedSkills.length > 0) {
        equippedBlock += `\n§bSkill (${rpgData.equippedSkills.length}/3):\n`;
        for (const skillId of rpgData.equippedSkills) {
            const si = SKILL_REF.find(s => s.id === skillId);
            equippedBlock += `  §b- ${si ? si.name : skillId}\n`;
        }
    } else {
        equippedBlock += `\n§7Skill: belum ada (0/3)\n`;
    }

    const eqPassives = rpgData.equippedGachaPassives || [];
    if (eqPassives.length > 0) {
        equippedBlock += `§dBerkat (${eqPassives.length}/3):\n`;
        for (const pid of eqPassives) {
            equippedBlock += `  §d- ${pid}\n`;
        }
    } else {
        equippedBlock += `§7Berkat: belum ada (0/3)\n`;
    }

    // Event status in Atribut & Kekuatan menu
    const evtDisplay = getActiveEventDisplay();
    let eventInfo = "";
    if (evtDisplay) {
        const ec = evtDisplay.type === "positive" ? "§a" : "§c";
        const dur = evtDisplay.remaining > 0 ? ` §7(${evtDisplay.remaining}m)` : "";
        eventInfo = `\n§e--- EVENT ---\n${ec}${evtDisplay.name}${dur}\n§fEfek: ${ec}${evtDisplay.effectLine}\n`;
    }

    const form = new ActionFormData();
    form.title("§dAtribut & Kekuatan");
    form.body(
        `§dSP: §e${rpgData.sp} | §bCore: §f${coreScore}\n` +
        `§bSkill: §f${rpgData.equippedSkills.length}/3 aktif, ${rpgData.unlockedSkills.length}/15 dikuasai\n` +
        `§dBerkat: §f${gachaPassivesEquipped}/3 aktif, ${gachaPassivesOwned} dimiliki\n\n` +
        `§eProfesi:${profBlock}\n` +
        `§eDipasang:${equippedBlock}${eventInfo}`
    );

    // v2.5: 7 buttons -- Arena added
    form.button("§cProfil RPG\n§7Detail level, pasif, & progress profesi");
    form.button("§ePohon Keahlian\n§7Belajar skill baru pakai SP");
    form.button("§aManajemen Kemampuan\n§7Equip/unequip skill & berkat kuno");
    form.button("§4Arena Pertarungan\n§7Wave-based combat challenge & reward");
    form.button("§6Altar Penempaan Inti\n§7Gacha Senjata, Armor & Berkat");
    form.button("§9Panduan Kekuatan\n§7Info lengkap sistem RPG & Gacha");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then((response) => {
        if (response.canceled) return;
        switch (response.selection) {
            case 0: openRpgMenu(player); break;         // View-only profil
            case 1: openSkillTreeMenu(player); break;
            case 2: openEquipUnifiedMenu(player); break;
            case 3: openArenaMenu(player); break;       // v2.5: Arena
            case 4: openGachaMenu(player); break;
            case 5: openRpgGuideMenu(player); break;     // Direct access to guide
            case 6: system.runTimeout(() => { openMainMenu(player); }, 5); break;
        }
    });
}

const SKILL_REF = [
    { id: "ore_excavation", name: "Ore Excavation" },
    { id: "deep_core_mining", name: "Deep Core Mining" },
    { id: "seismic_slam", name: "Seismic Slam" },
    { id: "treecapitator", name: "Treecapitator" },
    { id: "bark_armor", name: "Bark Armor" },
    { id: "leaf_storm", name: "Leaf Storm" },
    { id: "cleave_strike", name: "Cleave Strike" },
    { id: "bloodlust", name: "Bloodlust" },
    { id: "executioners_mark", name: "Executioner's Mark" },
    { id: "bountiful_harvest", name: "Bountiful Harvest" },
    { id: "green_thumb", name: "Green Thumb" },
    { id: "natures_gift", name: "Nature's Gift" },
    { id: "tidal_surge", name: "Tidal Surge" },
    { id: "anglers_fortune", name: "Angler's Fortune" },
    { id: "deep_sea_diver", name: "Deep Sea Diver" }
];

function getProfPassiveBonus(profKey, level) {
    switch (profKey) {
        case "mining":
            if (level >= 45) return "§eHaste2";
            if (level >= 20) return "§eHaste1";
            return "";
        case "woodcutting": return "";
        case "slayer":
            if (level >= 50) return "§eHPBoost2+Spd";
            if (level >= 35) return "§eHPBoost+Spd";
            if (level >= 30) return "§eHPBoost";
            return "";
        case "farming":
            if (level >= 40) return "§eHaste+Jump";
            if (level >= 20) return "§eHaste";
            return "";
        case "fishing":
            if (level >= 45) return "§eSpd+WaterBr";
            if (level >= 25) return "§eSpeed";
            return "";
        default: return "";
    }
}

// ============================================================
// SOSIAL & KOMUNITAS
// ============================================================

export function openSocialMenu(player) {
    const form = new ActionFormData();
    form.title("§bSosial & Komunitas");
    form.body("§7Pusat layanan interaksi dan navigasi global.");
    form.button("§6Hierarki Kasta\n§7Tingkatkan gelar & raih diskon");
    form.button("§ePapan Konglomerat\n§7Top 10 pemain terkaya");
    form.button("§cSistem Buronan\n§7Pasang & klaim bounty");
    form.button("§3Navigasi Spasial\n§7RTP & simpan markas Home");
    form.button("§4Sistem Sabotase\n§7Kirim kutukan anonim");
    form.button("§aPerisai Anti-Troll\n§7Lindungi diri dari sabotase");
    form.button("§cKembali ke Menu Utama");

    form.show(player).then((response) => {
        if (response.canceled) return;
        switch (response.selection) {
            case 0: import("./rank_system.js").then(mod => mod.openRankMenu(player)).catch(() => {}); break;
            case 1: openTopKoinMenu(player); break;
            case 2: openBountyMenu(player); break;
            case 3: import("./teleport_system.js").then(mod => mod.openTeleportMenu(player)).catch(() => {}); break;
            case 4: openTrollMenu(player); break;
            case 5: openTrollShieldMenu(player); break;
            case 6: system.runTimeout(() => { openMainMenu(player); }, 5); break;
        }
    });
}

// ============================================================
// BUKU PANDUAN
// ============================================================

export function openGuideBook(player) {
    const form = new ActionFormData();
    form.title("Buku Panduan Server");
    form.body(
        "§eMENGGUNAKAN SERVER§r\n" +
        "Semua fitur diakses lewat Jam di slot 9 inventory. Tekan/pakai jam tersebut untuk membuka Menu Utama. Kamu juga bisa ketik §e!menu§f di chat.\n\n" +

        "§e=== SEKTOR EKONOMI ===§r\n\n" +
        "§aKatalog Perdagangan§f -- Beli kebutuhan: blok bangunan, makanan, alat, spawn egg (hewan dari shop steril/mandul). Harga sudah termasuk diskon pangkat.\n\n" +
        "§ePusat Pengepul§f -- Jual hasil alam: batu, ore, kayu, tanaman, mob drop. Harga beda-beda tergantung rarity.\n\n" +
        "§2Auto-Sell Chest§f -- Simpan item di chest khusus, sistem otomatis jual isinya. Maks 3 chest. Cocok AFK farming!\n\n" +
        "§bDistribusi Aset§f -- Transfer Rupiah/barang ke pemain lain. Jika target offline, masuk Kotak Masuk.\n\n" +

        "§e=== ATRIBUT & KEKUATAN ===§r\n\n" +
        "§c5 Profesi RPG§f:\n" +
        "  §bMining§f -- Menambang batu & ore (+3 XP/blok)\n" +
        "  §aWoodcutting§f -- Menebang pohon (+5 XP/log)\n" +
        "  §cSlayer§f -- Membunuh monster (+10 XP/kill)\n" +
        "  §2Farming§f -- Memanen tanaman (+8 XP/tanaman)\n" +
        "  §3Fishing§f -- Memancing pakai Fishing Rod (+8 XP/cast)\n\n" +
        "§6Profisiensi§f -- Lv1-9=1x, Lv10-19=1.5x, Lv20-29=2x, Lv30-39=2.5x, Lv40-49=3x XP\n\n" +
        "§6Milestone SP§f -- Lv10=+3, Lv20=+5, Lv30=+8, Lv40=+12, Lv50=+20. Max 98 SP per profesi.\n\n" +
        "§eBonus Pasif Profesi§f:\n" +
        "  §bMining§f: Lv20=Haste1, Lv45=Haste2\n" +
        "  §cSlayer§f: Lv30=HPBoost1, Lv35=Speed1, Lv50=HPBoost2\n" +
        "  §2Farming§f: Lv20=Haste1, Lv40=JumpBoost1\n" +
        "  §3Fishing§f: Lv25=Speed1, Lv45=WaterBreathing\n\n" +

        "§d=== DOKUMENTASI 15 SKILL ===§r\n\n" +

        "§b--- MINING ---§r\n\n" +
        "§b[T1] Ore Excavation§f (15 SP) [AKTIF]\n" +
        "Cara pakai: Pakai Pickaxe, memecah ore/batu otomatis hancur area 3x3x3.\n" +
        "Efek: Satu pukulan = 27 blok sekaligus. Hemat waktu tambang.\n\n" +
        "§e[T2] Deep Core Mining§f (25 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip dan memakai Pickaxe.\n" +
        "Efek: 20% peluang double drop saat menambang ore. Item bonus langsung drop di dekatmu.\n\n" +
        "§c[T3] Seismic Slam§f (35 SP) [AKTIF]\n" +
        "Cara pakai: Berjinjit (sneak) + pakai Pickaxe. Cooldown 10 detik.\n" +
        "Efek: Menghancurkan kolom 3x3x5 di bawah kakimu. Efektif untuk strip mining vertikal.\n\n" +

        "§a--- WOODCUTTING ---§r\n\n" +
        "§a[T1] Treecapitator§f (15 SP) [AKTIF]\n" +
        "Cara pakai: Pakai Axe, pukul 1 log = seluruh pohon runtuh dari atas.\n" +
        "Efek: Seluruh log/wood yang tersambung otomatis hancur dan drop item. Max 512 blok per pohon.\n\n" +
        "§e[T2] Bark Armor§f (25 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip.\n" +
        "Efek: Setiap menebang pohon, dapat Resistance 1 selama 8 detik. Cooldown 30 detik antar aktivasi.\n\n" +
        "§c[T3] Leaf Storm§f (30 SP) [AKTIF]\n" +
        "Cara pakai: Berjinjit (sneak) + pakai Axe. Cooldown 8 detik.\n" +
        "Efek: Menghancurkan semua daun (leaves) dalam radius 7 blok. Drop item dari daun tetap keluar.\n\n" +

        "§c--- SLAYER ---§r\n\n" +
        "§a[T1] Cleave Strike§f (20 SP) [AKTIF]\n" +
        "Cara pakai: Pakai Sword/Axe, pukul mob = serangan menyapu area 3 blok.\n" +
        "Efek: Damage ke semua musuh dalam radius 3 blok dari target. Cooldown 3 detik.\n\n" +
        "§e[T2] Bloodlust§f (25 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip.\n" +
        "Efek: Setiap membunuh monster, dapat Speed 1 + Strength 1 selama 6 detik. Stack dengan kill berturut!\n\n" +
        "§c[T3] Executioner's Mark§f (35 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip.\n" +
        "Efek: Musuh di bawah 25% HP langsung tewas saat terkena seranganmu. Cooldown 8 detik per target. Sangat mematikan!\n\n" +

        "§2--- FARMING ---§r\n\n" +
        "§a[T1] Bountiful Harvest§f (15 SP) [AKTIF]\n" +
        "Cara pakai: Pakai Hoe, panen 1 tanaman = area 5x5 ikut panen.\n" +
        "Efek: Semua tanaman dalam radius 2 blok ikut hancur dan drop item.\n\n" +
        "§e[T2] Green Thumb§f (25 SP) [AKTIF]\n" +
        "Cara pakai: Berjinjit (sneak) + pakai Hoe. Cooldown 10 detik.\n" +
        "Efek: Panen semua tanaman masak area 7x7 DAN langsung tanam ulang (replant) di tempat yang sama.\n\n" +
        "§c[T3] Nature's Gift§f (30 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip.\n" +
        "Efek: 25% peluang double drop saat memanen tanaman. Bonus item langsung spawn di dekatmu.\n\n" +

        "§3--- FISHING ---§r\n\n" +
        "§a[T1] Tidal Surge§f (20 SP) [AKTIF]\n" +
        "Cara pakai: Berjinjit (sneak) + pakai Fishing Rod. Cooldown 15 detik.\n" +
        "Efek: Gelombang air merusak semua musuh radius 4 blok (4 damage). Kamu dapat Speed 2 + Conduit Power selama 5 detik.\n\n" +
        "§e[T2] Nelayan Ahli§f (25 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip. Pakai Fishing Rod biasa.\n" +
        "Efek: Auto dapat loot saat kail masuk air! Satu tarikan = 3-6 item random dari loot table pancing! Tidak perlu nunggu ikan gigit! Cooldown: 8 detik.\n\n" +
        "§e[T2] Angler's Fortune§f (30 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip.\n" +
        "Efek: Setiap cast Fishing Rod, ada peluang bonus loot: 40% Cod, 30% Prismarine Shard, 20% Nautilus Shell, 10% Heart of the Sea!\n\n" +
        "§c[T3] Deep Sea Diver§f (35 SP) [PASIF]\n" +
        "Cara pakai: Otomatis saat di-equip.\n" +
        "Efek: Saat kepala di dalam air, otomatis dapat Conduit Power 2 + Night Vision + Dolphin's Grace. Bisa melihat dan bergerak cepat di bawah air!\n\n" +

        "§dPemasangan Skill§f -- Max 3 skill aktif + 3 berkat kuno. Skill yang sudah dipelajari TIDAK otomatis aktif, harus di-equip manual di Manajemen Kemampuan.\n\n" +

        "§5=== GACHA (UPDATE v2.3!) ===§r\n\n" +
        "§5Gacha Senjata/Armor§f (5 Core / 45 Core 10x) -- Sihir item dengan kekuatan mistis!\n" +
        "  §f[Common] §745% -- Efek ringan (Keen Edge, Padded, dll)\n" +
        "  §a[Uncommon] §730% -- Efek menengah (Chill Touch, Thick Hide, dll)\n" +
        "  §b[Rare] §718% -- Efek kuat (Venom Strike, Iron Skin, dll)\n" +
        "  §d[Epic] §76% -- Efek sangat kuat (Hellfire, Gills of Atlantis, dll)\n" +
        "  §6§l[Legendary] §71% -- Kekuatan ultimate (Thunderous Smite, Third Eye, dll)\n\n" +
        "§ePity System§f -- §d30x tanpa Epic = Garansi Epic!§f §680x tanpa Legendary = Garansi Legendary!§f\n\n" +
        "§5Gacha Pasif Dewa§f (10 Core / 90 Core 10x) -- Skill pasif permanen!\n" +
        "  §f[Normal] §750% -- Fortitude, Agility, Titan's Grip, Iron Will\n" +
        "  §b[Rare] §730% -- Vitality, Vigor, Arcane Shield, Soul Harvest, Iron Fortress, Storm Aura\n" +
        "  §6§l[Legendary] §715% -- Phoenix Blood, Adrenaline, Berserker's Rage, God Slayer, Colossal Vitality, Blood Frenzy, Leviathan's Domain\n" +
        "  §d§l[Mythic] §75% -- Second Wind, Ghost Walk, Avatar of War, Undying Will, Titan's Heart, Chaos Aura\n\n" +
        "§ePity Pasif§f -- §615x tanpa Leg+ = Garansi Legendary!§f §d50x tanpa Mythic = Garansi Mythic!§f\n\n" +
        "§e10-Pull§f -- Hemat Core! Equipment 10x = 45 Core (hemat 5), Pasif 10x = 90 Core (hemat 10).\n\n" +

        "§e=== FITUR BARU v2.6! ===§r\n\n" +
        "§c10 Efek Gacha Baru!§f -- Konten gacha lebih banyak dan bervariasi:\n" +
        "  §b[Rare] Soul Harvest§f -- Lifesteal saat menyerang! Heal dari damage yang kamu berikan.\n" +
        "  §b[Rare] Iron Fortress§f -- Resistance kuat saat sneak! Tank mode yang brutal.\n" +
        "  §b[Rare] Storm Aura§f -- Damage periodik ke musuh di sekitarmu! Aura petir.\n" +
        "  §6[Legendary] God Slayer§f -- Peluang instant kill mob di bawah 50-70% HP! One-hit yang dicari!\n" +
        "  §6[Legendary] Colossal Vitality§f -- Health Boost raksasa! +8 sampai +12 hati permanen!\n" +
        "  §6[Legendary] Blood Frenzy§f -- Kill streak = buff menumpuk! Makin banyak bunuh, makin kuat!\n" +
        "  §6[Legendary] Leviathan's Domain§f -- Dewa di air! Semua buff air maksimal.\n" +
        "  §d[Mythic] Undying Will§f -- Auto-revive tanpa totem! Bangkit dari kematian!\n" +
        "  §d[Mythic] Titan's Heart§f -- HP raksasa + Regen + Resistance! Ultimate tank.\n" +
        "  §d[Mythic] Chaos Aura§f -- Debuff musuh sekitar + buff diri sendiri! Dominasi area.\n\n" +

        "§e=== FITUR v2.3-v2.5! ===§r\n\n" +
        "§6Sistem Banner§f -- Banner berganti tiap 2 jam! Rate-up 50% untuk efek featured. Cek banner aktif di Altar.\n\n" +
        "§6Reinkarnasi (Constellation)§f -- Pasif duplikat meningkatkan tier kekuatan!\n" +
        "  §7[C0] = Base -> [C1] = Enhanced -> [C2] = Maximum\n" +
        "  §7C2 = Efek paling kuat! Contoh: Second Wind C2 = Revive 100% HP!\n\n" +
        "§6Tarikan Gratis§f -- 1x Equipment gratis/24 jam, 1x Pasif gratis/72 jam!\n\n" +
        "§6Pecahan Inti§f -- Setiap pull = 1+ Pecahan. Tukar di Kuil Reinkarnasi:\n" +
        "  §7  50 Pecahan = Pilih Efek Epic\n" +
        "  §7 120 Pecahan = Pilih Efek Legendary\n" +
        "  §7  60 Pecahan = Pasif Rare Guarantee\n" +
        "  §7 150 Pecahan = Pasif Legendary Guarantee\n\n" +

        "§e=== SOSIAL & KOMUNITAS ===§r\n\n" +
        "§6Hierarki Kasta§f -- Beli pangkat pakai Rupiah = diskon belanja + slot Home lebih banyak.\n" +
        "§ePapan Konglomerat§f -- Top 10 pemain terkaya.\n" +
        "§cSistem Buronan§f -- Pasang bounty di kepala pemain. Jika target terbunuh, pembunuh dapat hadiah.\n" +
        "§3Navigasi Spasial§f -- RTP Rp5.000, simpan Home. §cTidak bisa teleport saat combat (15s).§f\n" +
        "§4Sistem Sabotase§f -- Rp1.000.000 kirim efek negatif anonim (5 menit CD).\n" +
        "§aPerisai Anti-Troll§f -- Blokir efek sabotase.\n\n" +

        "§e=== EVENT ROULETTE ===§r\n\n" +
        "Setiap §e10 menit§f, sistem mengacak event! Ada animasi roulette sebelum terungkap.\n\n" +
        "§aPositif (80%):§r Berkemakmuran Panen, Gelora Pengalaman (2x XP), Keberuntungan Pedagang (2x jual), Perisai Pelindung, Angin Cepat (Speed2), Hadiah Kecakapan (+3 SP), Berkat Penambang (Haste2), Hujan Penyembuhan, Jam Emas.\n\n" +
        "§cNegatif (20%):§r Invasi Kematian, Gerhana Gelap, Tanah Terkutuk.\n\n" +

        "§e=== KOTAK MASUK ===§r\n\n" +
        "Transfer dari pemain lain saat kamu offline masuk ke Kotak Masuk. Cek secara berkala di menu Layanan!\n\n" +

        "§6=== MISI & PENCAPAIAN ===§r\n\n" +
        "§eMisi Harian§f -- Setiap hari 4 misi acak. Selesaikan untuk Rupiah, XP, dan SP!\n" +
        "§eMisi Mingguan§f -- 2 misi lebih sulit dengan hadiah lebih besar!\n" +
        "§6Pencapaian§f -- 30+ achievement yang bisa dibuka dengan hadiah Rupiah & SP!\n" +
        "§eBonus Masuk Harian§f -- Login setiap hari! Streak 7 hari berturut = Rp75.000 + 1 Core + Totem!\n\n" +

        "§4=== ARENA PERTARUNGAN (BARU v2.5!) ===§r\n\n" +
        "§4Arena Pertarungan§f -- Tantangan wave-based combat! Lawan mob yang makin kuat tiap wave.\n" +
        "Buka lewat Jam -> Atribut & Kekuatan -> Arena Pertarungan.\n\n" +
        "§aBiasa§f: 10 wave, mob lemah, reward x1. Cocok pemula.\n" +
        "§eSulit§f: 15 wave, mob lebih kuat, reward x2.\n" +
        "§cNeraka§f: 20 wave, brutal, reward x3.5. Hanya untuk terkuat!\n\n" +
        "§6Boss§f muncul setiap 5 wave dengan HP & damage jauh lebih besar.\n" +
        "Gratis masuk setiap 30 menit, atau bayar §b2 Core§f untuk instant entry.\n" +
        "Reward per wave: §eRupiah§f, §cSlayer XP§f, §bCore§f (chance), §dSP§f (milestone), §6Poin Arena§f.\n" +
        "Tukar §6Poin Arena§f di Toko Hadiah untuk item eksklusif (Totem, EGapple, Netherite, dll)!\n\n" +

        "§e=== PERINTAH CHAT ===§r\n\n" +
        "§e!menu§f -- Buka menu utama\n" +
        "§e!saldo§f -- Cek Rupiah & Core\n" +
        "§e!hideboard§f / §e!showboard§f -- Toggle actionbar\n" +
        "§e!help§f -- Daftar perintah"
    );
    form.button("§cKembali ke Menu Utama");
    form.show(player).then(() => {
        system.runTimeout(() => { openMainMenu(player); }, 5);
    });
}

// ============================================================
// KOTAK MASUK (INBOX)
// ============================================================

function openInboxMenu(player) {
    const inbox = getInbox(player.name);
    const form = new ActionFormData();
    form.title("Pesan Masuk");

    if (inbox.length === 0) {
        form.body("§7Kotak masuk kosong.");
        form.button("§cKembali");
        form.show(player).then(() => {
            system.runTimeout(() => { openLayananMenu(player); }, 5);
        });
        return;
    }

    let totalClaimedRupiah = 0;
    let itemsToClaim = [];
    let bodyText = "§aPesan Baru:\n\n";

    for (const msg of inbox) {
        const date = new Date(msg.timestamp);
        const timeStr = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
        let attachmentText = "";

        if (msg.amount > 0) {
            attachmentText += `§e+${formatRupiah(msg.amount)}\n`;
            totalClaimedRupiah += msg.amount;
        }
        if (msg.item && msg.item.amount > 0) {
            attachmentText += `§a+${msg.item.amount}x ${formatItemName(msg.item.typeId)}\n`;
            itemsToClaim.push(msg.item);
        }

        bodyText += `§f[${timeStr}] §b${msg.sender}§f: §7"${msg.message}"\n${attachmentText}\n`;
    }

    bodyText += `§fTotal: §e${formatRupiah(totalClaimedRupiah)}`;
    if (itemsToClaim.length > 0) bodyText += ` §a+ ${itemsToClaim.length} item`;

    form.body(bodyText);
    form.button("§aKlaim Semua\n§7Uang & Barang");
    form.button("§cTutup");

    form.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) {
            if (totalClaimedRupiah > 0) {
                const currentCoins = getScore(player, "dompet");
                setScore(player, "dompet", currentCoins + totalClaimedRupiah);
                player.sendMessage(`§a[System] Klaim ${formatRupiah(totalClaimedRupiah)} dari Inbox!`);
            }
            let failedItems = [];
            for (const itemData of itemsToClaim) {
                const success = giveItemToPlayer(player, itemData.typeId, itemData.amount);
                if (success) {
                    player.sendMessage(`§a[System] Klaim ${itemData.amount}x ${formatItemName(itemData.typeId)}!`);
                } else {
                    failedItems.push(itemData);
                }
            }
            if (failedItems.length > 0) {
                player.sendMessage("§c[System] Beberapa barang gagal diklaim (inventory penuh)!");
                const newInbox = failedItems.map(item => ({
                    sender: "System", amount: 0, message: "Barang tertinggal akibat tas penuh.", timestamp: Date.now(), item: item
                }));
                try { world.setDynamicProperty(`inbox_${player.name}`, JSON.stringify(newInbox)); } catch (e) {}
            } else {
                clearInbox(player.name);
            }
        }
    });
}
