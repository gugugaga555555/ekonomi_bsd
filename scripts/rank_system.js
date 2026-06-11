import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getUiHeader } from "./utils.js";
import { RANKS } from "./ranks_data.js";
import { unlockAchievement } from "./achievement_system.js";

// RANKS sekarang disimpan di ranks_data.js sebagai sumber tunggal
// untuk menghindari duplikasi antara file ini dan utils.js
export { RANKS };

export function getPlayerRank(player) {
    try {
        const rankId = player.getDynamicProperty("player_rank");
        if (typeof rankId === 'number' && rankId < RANKS.length) {
            return RANKS[rankId];
        }
    } catch(e) {}
    return RANKS[0]; // Default
}

export function setPlayerRank(player, rankId) {
    try {
        player.setDynamicProperty("player_rank", rankId);
    } catch(e) {}
}

export function openRankMenu(player) {
    const currentRank = getPlayerRank(player);
    const form = new ActionFormData();

    form.title("§6Sistem Pangkat");

    let bodyText = getUiHeader(player);
    bodyText += `Diskon Toko Dinamis: §a${currentRank.discount * 100}%§r\n\n`;

    const nextRank = RANKS[currentRank.id + 1];

    if (nextRank) {
        bodyText += `Pangkat Selanjutnya: ${nextRank.badge}\n`;
        bodyText += `Harga Naik Pangkat: §e${formatRupiah(nextRank.cost)}§r\n`;
        bodyText += `Diskon Toko Selanjutnya: §a${nextRank.discount * 100}%§r\n`;

        form.body(bodyText);
        form.button(`§aNaik Pangkat\n§7Harga: ${formatRupiah(nextRank.cost)}`);
    } else {
        bodyText += `§e§lAnda telah mencapai pangkat tertinggi di server ini!§r\nNikmati diskon maksimum dan pamerkan badge Anda.`;
        form.body(bodyText);
    }

    form.button("§cKembali ke Sosial & Komunitas");

    form.show(player).then(res => {
        if (res.canceled) return;

        if (nextRank && res.selection === 0) {
            processRankUpgrade(player, currentRank, nextRank);
        } else {
            // "Kembali ke Menu Utama" button was clicked (either index 1 if nextRank exists, or index 0 if maxed)
            import("./menu_system.js").then(mod => {
                system.runTimeout(() => { mod.openSocialMenu(player); }, 5);
            }).catch(()=>{});
        }
    });
}

function processRankUpgrade(player, currentRank, nextRank) {
    // Dynamic import scoreboard helper to avoid direct coupling
    const objDompet = world.scoreboard.getObjective("dompet");
    if (!objDompet) return;

    let currentRupiah = 0;
    try { currentRupiah = objDompet.getScore(player) || 0; } catch(e) {}

    if (currentRupiah >= nextRank.cost) {
        objDompet.setScore(player, currentRupiah - nextRank.cost);
        setPlayerRank(player, nextRank.id);

        player.dimension.runCommandAsync(`playsound random.levelup @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=10]`);
        player.dimension.runCommandAsync(`summon fireworks_rocket ${Math.floor(player.location.x)} ${Math.floor(player.location.y + 1)} ${Math.floor(player.location.z)}`);

        world.sendMessage(`§6§l[RANK UP] §r§fSelamat! §b${player.name} §ftelah naik pangkat menjadi ${nextRank.badge}§f!`);
        unlockAchievement(player, "rank_up");
    } else {
        player.sendMessage(`§c[System] Saldo Rupiah Anda tidak mencukupi untuk naik pangkat. Diperlukan ${formatRupiah(nextRank.cost)}.`);
    }
}
