import { world, system } from "@minecraft/server";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";
import { formatRupiah, getScore, setScore } from "./utils.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";

const TROLL_COST = 1000000;
const TROLL_COOLDOWN_MS = 300000; // 5 Minutes
const OPT_OUT_COST = 500000;      // Biaya perlindungan troll
const OPT_OUT_DURATION_MS = 600000; // 10 menit perlindungan
const OPT_OUT_KEY = "troll_optout"; // Dynamic property key

const targetCooldowns = new Map();

// Cache opt-out data untuk menghindari baca dynamic property setiap saat
let optOutData = loadOptOutData();

function loadOptOutData() {
    try {
        const raw = world.getDynamicProperty(OPT_OUT_KEY);
        if (raw && typeof raw === 'string') {
            return JSON.parse(raw);
        }
    } catch(e) {}
    return {};
}

function saveOptOutData(data) {
    optOutData = data;
    try {
        world.setDynamicProperty(OPT_OUT_KEY, JSON.stringify(data));
    } catch(e) {}
}

function isOptedOut(playerName) {
    const expiry = optOutData[playerName];
    if (!expiry) return false;
    if (Date.now() > expiry) {
        // Expired, hapus
        delete optOutData[playerName];
        saveOptOutData(optOutData);
        return false;
    }
    return true;
}

const TROLL_LIST = [
    "§aCreeper Surprise",
    "§cFake Nuke",
    "§8Jumpscare Warden",
    "§bTerbang Bebas",
    "§eHujan Kelelawar"
];

export function openTrollMenu(player) {
    const onlinePlayers = world.getAllPlayers().filter(p => p.name !== player.name);
    if (onlinePlayers.length === 0) {
        player.sendMessage("§c[Troll] Tidak ada pemain lain yang online untuk dijaili.");
        return;
    }

    const playerNames = onlinePlayers.map(p => p.name);

    // Cek apakah pemain sendiri punya perlindungan aktif
    const selfProtected = isOptedOut(player.name);
    const selfStatusText = selfProtected
        ? `§aAnda memiliki Perisai Anti-Troll aktif!`
        : `§7Anda tidak memiliki perlindungan troll.`;

    const form = new ModalFormData();
    form.title("§4Sistem Sabotase");
    form.dropdown(`Pilih Target (Biaya: ${formatRupiah(TROLL_COST)}):\n§7Mereka tidak akan tahu siapa pelakunya!\n\n${selfStatusText}`, playerNames);

    form.show(player).then(res => {
        if (res.canceled) return;

        const targetIndex = res.formValues[0];
        const targetPlayerName = playerNames[targetIndex];

        // Cek apakah target punya opt-out aktif
        if (isOptedOut(targetPlayerName)) {
            player.sendMessage(`§c[Troll] Target ini memiliki §aPerisai Anti-Troll§c yang masih aktif! Coba lagi nanti.`);
            return;
        }

        const currentRupiah = getScore(player, "dompet");
        if (currentRupiah < TROLL_COST) {
            player.sendMessage(`§c[Troll] Saldo Rupiah Anda tidak mencukupi! Butuh ${formatRupiah(TROLL_COST)}.`);
            return;
        }

        const lastTrolled = targetCooldowns.get(targetPlayerName) || 0;
        if (Date.now() - lastTrolled < TROLL_COOLDOWN_MS) {
            const timeLeft = Math.ceil((TROLL_COOLDOWN_MS - (Date.now() - lastTrolled)) / 1000 / 60);
            player.sendMessage(`§c[Troll] Pemain ini baru saja kena jail! Tunggu ${timeLeft} menit lagi.`);
            return;
        }

        const targetPlayer = world.getAllPlayers().find(p => p.name === targetPlayerName);
        if (!targetPlayer) {
            player.sendMessage("§c[Troll] Pemain target tidak ditemukan atau sudah offline.");
            return;
        }

        // Double-check opt-out saat terakhir (race condition prevention)
        if (isOptedOut(targetPlayerName)) {
            player.sendMessage(`§c[Troll] Target ini mengaktifkan perisai tepat waktu!`);
            return;
        }

        // Deduct money & Apply Cooldown
        setScore(player, "dompet", currentRupiah - TROLL_COST);
        targetCooldowns.set(targetPlayerName, Date.now());

        player.sendMessage(`§a[Troll] Pembayaran berhasil! Menyiapkan kejahilan untuk §c${targetPlayerName}§a...`);
        startTrollRoulette(targetPlayer);
        trackStat(player, "trollsSent", 1);
        unlockAchievement(player, "first_troll");
    });
}

// Menu untuk membeli perisai anti-troll
export function openTrollShieldMenu(player) {
    const currentProtection = optOutData[player.name];
    const isActive = currentProtection && Date.now() < currentProtection;

    const form = new ActionFormData();
    form.title("§aPerisai Anti-Troll");

    if (isActive) {
        const remainingMs = currentProtection - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        form.body(`§aAnda memiliki perlindungan Anti-Troll aktif!\n\n§7Sisa waktu: §e${remainingMin} menit\n\n§7Selama perisai aktif, tidak ada pemain yang bisa mengirim troll kepada Anda.`);
        form.button("§cKembali");
    } else {
        form.body(`§7Lindungi diri Anda dari serangan troll pemain lain!\n\n§eBiaya: ${formatRupiah(OPT_OUT_COST)}\n§7Durasi: §a10 Menit\n\n§7Selama perisai aktif, semua percobaan troll terhadap Anda akan otomatis diblokir.`);
        form.button("§aAktifkan Perisai\n§710 Menit Anti-Troll");
        form.button("§cKembali");
    }

    form.show(player).then(res => {
        if (res.canceled) return;

        if (!isActive && res.selection === 0) {
            // Beli perisai
            const currentRupiah = getScore(player, "dompet");
            if (currentRupiah < OPT_OUT_COST) {
                player.sendMessage(`§c[Sistem] Rupiah tidak cukup! Butuh ${formatRupiah(OPT_OUT_COST)}.`);
                return;
            }

            setScore(player, "dompet", currentRupiah - OPT_OUT_COST);
            const newOptOut = { ...optOutData };
            newOptOut[player.name] = Date.now() + OPT_OUT_DURATION_MS;
            saveOptOutData(newOptOut);

            player.sendMessage("§a[Sistem] §aPerisai Anti-Troll§f berhasil diaktifkan selama §e10 menit§f! Anda kebal dari troll.");
            player.dimension.runCommandAsync(`playsound random.levelup @a[x=${Math.floor(player.location.x)},y=${Math.floor(player.location.y)},z=${Math.floor(player.location.z)},r=5]`);
        }
    });
}

function startTrollRoulette(targetPlayer) {
    let ticks = 0;
    const maxTicks = 60; // 3 seconds total (20 ticks/sec)

    const rouletteId = system.runInterval(() => {
        // Stop if player leaves mid-roulette
        if (!targetPlayer.isValid()) {
            system.clearRun(rouletteId);
            return;
        }

        // Display random troll name rapidly
        const randomTroll = TROLL_LIST[Math.floor(Math.random() * TROLL_LIST.length)];
        targetPlayer.dimension.runCommandAsync(`title "${targetPlayer.name}" subtitle ${randomTroll}`);
        targetPlayer.dimension.runCommandAsync(`title "${targetPlayer.name}" title §e§kMengacak Jail...`);
        targetPlayer.dimension.runCommandAsync(`playsound note.harp @a[x=${Math.floor(targetPlayer.location.x)},y=${Math.floor(targetPlayer.location.y)},z=${Math.floor(targetPlayer.location.z)},r=5]`);

        ticks += 2; // Run every 2 ticks (approx 0.1s)

        if (ticks >= maxTicks) {
            system.clearRun(rouletteId);
            const finalTroll = Math.floor(Math.random() * TROLL_LIST.length);
            executeTroll(targetPlayer, finalTroll);
        }
    }, 2);
}

function executeTroll(targetPlayer, trollIndex) {
    if (!targetPlayer.isValid()) return;

    const trollName = TROLL_LIST[trollIndex];
    const px = Math.floor(targetPlayer.location.x);
    const py = Math.floor(targetPlayer.location.y);
    const pz = Math.floor(targetPlayer.location.z);
    const dim = targetPlayer.dimension;

    // Announce the final result
    dim.runCommandAsync(`title "${targetPlayer.name}" subtitle ${trollName}`);
    dim.runCommandAsync(`title "${targetPlayer.name}" title §c§lKENA JAIL!`);
    dim.runCommandAsync(`playsound random.anvil_land @a[x=${px},y=${py},z=${pz},r=5]`);

    // Delay 1 second before applying effect
    system.runTimeout(() => {
        if (!targetPlayer.isValid()) return;

        if (trollIndex === 0) { // Creeper Surprise
            dim.runCommandAsync(`execute as "${targetPlayer.name}" at @s run summon creeper ^ ^ ^-2`);
            dim.runCommandAsync(`playsound creeper.primed @a[x=${px},y=${py},z=${pz},r=5]`);

        } else if (trollIndex === 1) { // Fake Nuke
            dim.runCommandAsync(`playsound random.explode @a[x=${px},y=${py},z=${pz},r=10] 1.0 0.5`);
            dim.runCommandAsync(`particle minecraft:huge_explosion_emitter ${px} ${py} ${pz}`);
            targetPlayer.addEffect("blindness", 60, { amplifier: 0, showParticles: false });

        } else if (trollIndex === 2) { // Jumpscare Warden
            targetPlayer.addEffect("blindness", 100, { amplifier: 0, showParticles: false });
            targetPlayer.addEffect("slowness", 100, { amplifier: 3, showParticles: false });
            dim.runCommandAsync(`playsound mob.warden.roar @a[x=${px},y=${py},z=${pz},r=5]`);

        } else if (trollIndex === 3) { // Terbang Bebas
            targetPlayer.addEffect("levitation", 60, { amplifier: 4, showParticles: false });
            // Add slow falling right after levitation ends (60 ticks) to prevent unfair deaths
            system.runTimeout(() => {
                if (targetPlayer.isValid()) {
                    targetPlayer.addEffect("slow_falling", 100, { amplifier: 0, showParticles: true });
                }
            }, 60);

        } else if (trollIndex === 4) { // Hujan Kelelawar
            for (let i = 0; i < 15; i++) {
                dim.runCommandAsync(`summon bat ${px} ${py + 2} ${pz}`);
            }
        }
    }, 20);
}
