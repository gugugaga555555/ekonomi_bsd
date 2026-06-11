import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { formatRupiah, getUiHeader } from "./utils.js";
import { getPlayerRank } from "./rank_system.js";
import { combatLogMap } from "./combat_system.js";
import { trackStat } from "./stats_system.js";
import { unlockAchievement } from "./achievement_system.js";

const RTP_COST = 5000;
const RTP_RANGE = 5000; // Radius acakan aman untuk versi 1.26

export function getPlayerHomes(player) {
    try {
        const homesStr = player.getDynamicProperty("player_homes");
        if (homesStr && typeof homesStr === "string") {
            return JSON.parse(homesStr);
        }
    } catch(e) {}
    return [];
}

export function savePlayerHomes(player, homesArray) {
    try {
        player.setDynamicProperty("player_homes", JSON.stringify(homesArray));
    } catch(e) {}
}

export function getMaxHomes(player) {
    const rank = getPlayerRank(player);
    if (rank.id === 0) return 1;
    if (rank.id === 1) return 2;
    if (rank.id === 2) return 3;
    if (rank.id === 3) return 4;
    return 5;
}

export function openTeleportMenu(player) {
    const lastHit = combatLogMap.get(player.name) || 0;
    if (Date.now() - lastHit < 15000) {
        const timeLeft = Math.ceil((15000 - (Date.now() - lastHit)) / 1000);
        player.sendMessage(`§c[Teleport] Anda sedang dalam pertarungan! Tunggu ${timeLeft} detik untuk teleportasi.`);
        return;
    }
    _showTeleportMenu(player);
}

function _showTeleportMenu(player) {
    const form = new ActionFormData();
    form.title("§3Teleport & Home");
    form.body(`${getUiHeader(player)}\n§7Pilih destinasi teleportasi Anda.`);

    form.button(`§dRandom Teleport (RTP)\n§7Perjalanan acak (Rp${RTP_COST.toLocaleString("id-ID")})`);
    form.button("§aManajemen Home\n§7Simpan & Kunjungi markas");
    form.button("§cKembali ke Sosial & Komunitas");

    form.show(player).then(res => {
        if (res.canceled) return;
        if (res.selection === 0) executeRTP(player);
        else if (res.selection === 1) openHomeMenu(player);
        else if (res.selection === 2) {
            import("./menu_system.js").then(mod => {
                system.runTimeout(() => { mod.openSocialMenu(player); }, 5);
            }).catch(()=>{});
        }
    });
}

// =========================================================================
// REVISI FINAL: RTP ANTI-LAUT & ANTI-KEJEPIT BATU (DOUBLE-VERIFICATION v1.26)
// =========================================================================
function executeRTP(player) {
    const objDompet = world.scoreboard.getObjective("dompet");
    let currentRupiah = 0;
    try { if (objDompet) currentRupiah = objDompet.getScore(player) || 0; } catch(e) {}

    if (currentRupiah < RTP_COST) {
        player.sendMessage(`§c[Teleport] Saldo Rupiah Anda tidak mencukupi untuk RTP. Diperlukan ${formatRupiah(RTP_COST)}.`);
        return;
    }

    try {
        objDompet.setScore(player, currentRupiah - RTP_COST);
    } catch(e) {
        player.sendMessage("§c[Teleport] Gagal memproses pembayaran. Coba lagi.");
        return;
    }

    // Efek dramatis saat satelit melakukan scanning alam sekitar
    player.addEffect("blindness", 140, { showParticles: false });
    player.addEffect("slowness", 140, { amplifier: 255, showParticles: false });

    let count = 0;
    let targetX = 0;
    let targetZ = 0;
    let targetY = 75;
    let scanAttempts = 0;
    let foundSafeGround = false;

    // Timer Interval Animasi + Pemindaian Bioma Realtime Standar 1.26
    const rtpTimer = system.runInterval(() => {
        count++;

        // Efek Suara Tick yang semakin meninggi temponya di telinga player
        player.playSound("random.click", { volume: 0.6, pitch: 1.0 + (count * 0.1) });

        if (count === 2) {
            player.onScreenDisplay.setActionBar(`§b[?] Scanning World Matrix... [[=][ ][ ][ ][ ]] 20%`);
        } else if (count === 5) {
            player.onScreenDisplay.setActionBar(`§3?? Filtering Oceans & Safe Levels... [[=][=][=][ ][ ]] 55%`);
            
            // --- LOGIKA SMART DOUBLE-VERIFICATION ---
            while (scanAttempts < 5 && !foundSafeGround) {
                scanAttempts++;
                
                const rx = Math.floor(Math.random() * (RTP_RANGE * 2)) - RTP_RANGE;
                const rz = Math.floor(Math.random() * (RTP_RANGE * 2)) - RTP_RANGE;
                let ry = 70;

                try {
                    const topBlockPos = player.dimension.getTopmostBlockPosition({ x: rx, z: rz });
                    if (topBlockPos) {
                        ry = topBlockPos.y;
                        
                        // Ambil data blok pijakan, blok ruang kaki, dan blok ruang kepala
                        const groundBlock = player.dimension.getBlock({ x: rx, y: ry, z: rz });
                        const bodyBlock = player.dimension.getBlock({ x: rx, y: ry + 1, z: rz });
                        const headBlock = player.dimension.getBlock({ x: rx, y: ry + 2, z: rz });
                        
                        if (groundBlock && bodyBlock && headBlock) {
                            const groundId = groundBlock.typeId.toLowerCase();
                            
                            // VERIFIKASI 1: Mencegah kejepit batu/gua (Kaki & kepala wajib blok udara kosong)
                            const isSpaceFree = bodyBlock.isAir && headBlock.isAir;

                            // VERIFIKASI 2: Filter Blok Haram (Laut dalam, Es kutub, Salju tebal, Daun pohon)
                            const isWater = groundId.includes("water") || groundId.includes("ocean") || groundId.includes("river");
                            const isIceOrSnow = groundId.includes("ice") || groundId.includes("snow");
                            const isLeaves = groundId.includes("leaves");

                            // JIKA LOLOS KEDUA VERIFIKASI DAN BUKAN DI VOID/BEDROCK BAWAH
                            if (isSpaceFree && !isWater && !isIceOrSnow && !isLeaves && ry > 50) {
                                targetX = rx;
                                targetZ = rz;
                                targetY = ry + 1;
                                foundSafeGround = true;
                            }
                        }
                    }
                } catch (e) {
                    // Abaikan eror jika chunk belum siap dibaca, lanjut loop acakan berikutnya
                }
            }

            // FALLBACK TERAMAN: Jika 5x nyari zonk (ketemu laut/batu gua terus), lempar ke langit biar terjun payung aman!
            if (!foundSafeGround) {
                targetX = Math.floor(Math.random() * (RTP_RANGE * 2)) - RTP_RANGE;
                targetZ = Math.floor(Math.random() * (RTP_RANGE * 2)) - RTP_RANGE;
                targetY = 120; // Ketinggian langit darurat
            }

        } else if (count === 8) {
            player.onScreenDisplay.setActionBar(`§e? Teleport Core Stabilized... [[=][=][=][=][ ]] 90%`);
        } else if (count >= 11) {
            // Selesai, matikan interval task
            system.clearRun(rtpTimer);

            // Bersihkan efek buta & lambat
            player.removeEffect("blindness");
            player.removeEffect("slowness");

            // Berikan proteksi mutlak (Anti-Mati Jatuh, Anti-Lava, Anti-Sesak Nafas)
            player.addEffect("resistance", 200, { amplifier: 4, showParticles: false });
            player.addEffect("fire_resistance", 300, { amplifier: 0, showParticles: false });
            
            // Aktifkan parasut slow falling HANYA jika masuk ke mode darurat langit
            if (!foundSafeGround) {
                player.addEffect("slow_falling", 200, { amplifier: 0, showParticles: false });
            }

            // Eksekusi Teleportasi Native ke koordinat hasil verifikasi akhir
            player.teleport({ x: targetX, y: targetY, z: targetZ }, { dimension: player.dimension });
            trackStat(player, "rtpCount", 1);
            unlockAchievement(player, "first_rtp");

            // Efek Suara Portal Sukses Mendarat setelah jeda 1 tick
            system.runTimeout(() => {
                player.playSound("portal.travel", { volume: 0.5, pitch: 1.1 });
                player.onScreenDisplay.setTitle("§aMENDARAT AMAN");
                
                if (foundSafeGround) {
                    player.onScreenDisplay.setSubtitle("§7Satelit mengunci daratan padat!");
                    player.sendMessage(`§a[RTP] Sukses mendarat di permukaan tanah (X: ${targetX}, Y: ${targetY}, Z: ${targetZ})`);
                } else {
                    player.onScreenDisplay.setSubtitle("§eMode Terjun Payung Darurat Diaktifkan!");
                    player.sendMessage(`§e[RTP] Detektor mendeteksi area tidak aman di darat. Protokol udara diaktifkan demi keselamatan Anda.`);
                }
                player.sendMessage(`§d[RTP] Saldo dipotong ${formatRupiah(RTP_COST)}.`);
            }, 1);
        }
    }, 4);
}

function openHomeMenu(player) {
    const homes = getPlayerHomes(player);
    const maxHomes = getMaxHomes(player);

    const form = new ActionFormData();
    form.title("§aManajemen Home");
    form.body(`${getUiHeader(player)}\n§fHome Tersimpan: §e${homes.length} / ${maxHomes}\n§7Catatan: Semakin tinggi Pangkat Anda, semakin banyak Home yang bisa disimpan.`);

    form.button("§eSimpan Lokasi Saat Ini\n§7Buat Home baru");

    for (const h of homes) {
        form.button(`§bPergi ke: ${h.name}\n§7X:${Math.floor(h.x)} Y:${Math.floor(h.y)} Z:${Math.floor(h.z)}`);
    }

    form.button("§cKembali");

    form.show(player).then(res => {
        if (res.canceled) return;

        if (res.selection === 0) {
            openSetHomeMenu(player, homes, maxHomes);
        } else if (res.selection === homes.length + 1) {
            openTeleportMenu(player);
        } else {
            const targetHome = homes[res.selection - 1];
            executeTeleportToHome(player, targetHome);
        }
    });
}

function openSetHomeMenu(player, homes, maxHomes) {
    if (homes.length >= maxHomes) {
        player.sendMessage(`§c[Teleport] Kapasitas Home Anda sudah penuh (${maxHomes}/${maxHomes})! Tingkatkan Pangkat untuk menambah slot.`);
        return;
    }

    const form = new ModalFormData();
    form.title("§eSimpan Home");
    form.textField("Nama Home Baru:", "Contoh: Base Utama, Tambang Emas");

    form.show(player).then(res => {
        if (res.canceled) return;

        const homeName = res.formValues[0].trim();
        if (!homeName) {
            player.sendMessage("§c[Teleport] Nama Home tidak boleh kosong!");
            return;
        }

        if (homes.find(h => h.name.toLowerCase() === homeName.toLowerCase())) {
            player.sendMessage("§c[Teleport] Anda sudah memiliki Home dengan nama tersebut!");
            return;
        }

        homes.push({
            name: homeName,
            x: player.location.x,
            y: player.location.y,
            z: player.location.z,
            dimensionId: player.dimension.id
        });

        savePlayerHomes(player, homes);
        player.sendMessage(`§a[Teleport] Berhasil menyimpan lokasi ini sebagai Home: §e${homeName}§a.`);
        unlockAchievement(player, "first_home");
    });
}

function executeTeleportToHome(player, homeObj) {
    if (player.dimension.id !== homeObj.dimensionId) {
        player.sendMessage("§c[Teleport] Gagal teleportasi. Home ini berada di dimensi lain!");
        return;
    }

    player.teleport({ x: homeObj.x, y: homeObj.y, z: homeObj.z }, { dimension: player.dimension });
    player.sendMessage(`§a[Teleport] Anda telah kembali ke Home: §e${homeObj.name}§a.`);
}